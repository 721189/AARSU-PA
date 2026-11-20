import { randomUUID } from "crypto";
import { GoogleGenAI } from "@google/genai";
import { getFirestore } from "firebase-admin/firestore";
import { google } from "googleapis";
import {
  validateCalendarEventInput,
  validateGmailDraftInput,
  validateGoogleDocInput,
  validateGmailSearchQuery
} from "./assistantValidation";

const MODEL = "gemini-3.8-flash";
const ACTION_EXPIRY_MS = 10 * 60 * 1000;
type WorkspaceActionKind = "create_calendar_event" | "create_gmail_draft" | "create_google_doc";
interface PendingAssistantAction {
  id: string;
  kind: WorkspaceActionKind;
  title: string;
  summary: string;
  args: Record<string, unknown>;
  status: "pending" | "executing" | "completed" | "cancelled" | "failed" | "expired";
  createdAt: string;
  expiresAt: number;
}
const ACTION_DECLARATIONS = [
  {
    name: "list_calendar_events",
    description: "Read the user's upcoming Google Calendar events. This is read-only.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        daysAhead: { type: "integer", description: "Number of days ahead, from 1 to 14." },
        maxResults: { type: "integer", description: "Maximum events to return, from 1 to 10." }
      }
    }
  },
  {
    name: "search_gmail",
    description: "Search Gmail and return sender, subject, date and short snippets. This is read-only.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "A Gmail search query." },
        maxResults: { type: "integer", description: "Maximum messages to return, from 1 to 8." }
      },
      required: ["query"]
    }
  },
  {
    name: "create_calendar_event",
    description: "Prepare a Calendar event for user approval. It is not created until the user approves.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        summary: { type: "string" },
        description: { type: "string" },
        startDateTime: { type: "string", description: "ISO 8601 date-time with timezone offset." },
        endDateTime: { type: "string", description: "ISO 8601 date-time with timezone offset." },
        timeZone: { type: "string", description: "IANA timezone, default Asia/Kolkata." }
      },
      required: ["summary", "startDateTime", "endDateTime"]
    }
  },
  {
    name: "create_gmail_draft",
    description: "Prepare a Gmail draft for user approval. This never sends email.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        to: { type: "string", description: "One or more comma-separated email addresses." },
        subject: { type: "string" },
        body: { type: "string" }
      },
      required: ["to", "subject", "body"]
    }
  },
  {
    name: "create_google_doc",
    description: "Prepare a Google Doc for user approval. It is not created until approved.",
    parametersJsonSchema: {
      type: "object",
      properties: { title: { type: "string" }, body: { type: "string" } },
      required: ["title", "body"]
    }
  }
];
function actionsCollection(uid: string) {
  if (!uid) throw new Error("Authenticated user is required.");
  return getFirestore().collection("users").doc(uid).collection("assistant_actions");
}
function getWorkspaceAuth(accessToken: string) {
  if (!accessToken || accessToken.length > 10000) throw new Error("Connect Google Workspace before using this action.");
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  return auth;
}
function groundingSources(response: any) {
  const chunks = response?.candidates?.[0]?.groundingMetadata?.groundingChunks;
  if (!Array.isArray(chunks)) return [];
  return chunks.filter((chunk: any) => typeof chunk?.web?.uri === "string").slice(0, 8)
    .map((chunk: any) => ({ title: String(chunk.web.title || "Web source"), uri: chunk.web.uri }));
}
async function createPendingAction(uid: string, kind: WorkspaceActionKind, args: Record<string, unknown>) {
  const id = randomUUID();
  const now = Date.now();
  let title: string;
  let summary: string;
  if (kind === "create_calendar_event") {
    const event = validateCalendarEventInput(args);
    args = event as unknown as Record<string, unknown>;
    title = "Create calendar event: " + event.summary;
    summary = event.startDateTime + " to " + event.endDateTime + " (" + event.timeZone + ")";
  } else if (kind === "create_gmail_draft") {
    const draft = validateGmailDraftInput(args);
    args = draft as unknown as Record<string, unknown>;
    title = "Create Gmail draft: " + draft.subject;
    summary = "To: " + draft.to.join(", ") + ". A draft will be saved; it will not be sent.";
  } else {
    const document = validateGoogleDocInput(args);
    args = document as unknown as Record<string, unknown>;
    title = "Create Google Doc: " + document.title;
    summary = "Create a document containing approximately " + document.body.length + " characters.";
  }
  const action: PendingAssistantAction = {
    id, kind, title, summary, args, status: "pending",
    createdAt: new Date(now).toISOString(),
    expiresAt: now + ACTION_EXPIRY_MS
  };
  await actionsCollection(uid).doc(id).create(action);
  return action;
}
async function runReadOnlyWorkspaceTool(name: string, args: Record<string, unknown>, accessToken: string) {
  const auth = getWorkspaceAuth(accessToken);
  if (name === "list_calendar_events") {
    const requestedDays = Number(args.daysAhead);
    const daysAhead = Number.isFinite(requestedDays) ? Math.min(14, Math.max(1, Math.trunc(requestedDays))) : 7;
    const requestedMax = Number(args.maxResults);
    const maxResults = Number.isFinite(requestedMax) ? Math.min(10, Math.max(1, Math.trunc(requestedMax))) : 8;
    const calendar = google.calendar({ version: "v3", auth });
    const events = await calendar.events.list({
      calendarId: "primary",
      timeMin: new Date().toISOString(),
      timeMax: new Date(Date.now() + daysAhead * 86400000).toISOString(),
      maxResults, singleEvents: true, orderBy: "startTime"
    });
    return (events.data.items || []).map(event => ({
      id: event.id,
      summary: event.summary || "(No title)",
      start: event.start?.dateTime || event.start?.date || null,
      end: event.end?.dateTime || event.end?.date || null,
      timeZone: event.start?.timeZone || null,
      location: event.location || null,
      status: event.status || null
    }));
  }
  if (name === "search_gmail") {
    const query = validateGmailSearchQuery(args.query);
    const requestedMax = Number(args.maxResults);
    const maxResults = Number.isFinite(requestedMax) ? Math.min(8, Math.max(1, Math.trunc(requestedMax))) : 5;
    const gmail = google.gmail({ version: "v1", auth });
    const listing = await gmail.users.messages.list({ userId: "me", q: query, maxResults });
    const results = [];
    for (const message of (listing.data.messages || []).slice(0, maxResults)) {
      if (!message.id) continue;
      const detail = await gmail.users.messages.get({
        userId: "me", id: message.id, format: "metadata",
        metadataHeaders: ["From", "To", "Subject", "Date"]
      });
      const headers = detail.data.payload?.headers || [];
      const header = (name: string) => headers.find(item => item.name?.toLowerCase() === name.toLowerCase())?.value || "";
      results.push({
        id: message.id,
        from: header("From"),
        to: header("To"),
        subject: header("Subject"),
        date: header("Date"),
        snippet: detail.data.snippet || ""
      });
    }
    return results;
  }
  throw new Error("Unsupported read-only tool: " + name);
}
async function executeApprovedWorkspaceAction(action: PendingAssistantAction, accessToken: string) {
  const auth = getWorkspaceAuth(accessToken);
  if (action.kind === "create_calendar_event") {
    const event = validateCalendarEventInput(action.args);
    const calendar = google.calendar({ version: "v3", auth });
    const created = await calendar.events.insert({
      calendarId: "primary",
      requestBody: {
        summary: event.summary,
        description: event.description,
        start: { dateTime: event.startDateTime, timeZone: event.timeZone },
        end: { dateTime: event.endDateTime, timeZone: event.timeZone }
      }
    });
    return { kind: action.kind, eventId: created.data.id, htmlLink: created.data.htmlLink, summary: created.data.summary };
  }
  if (action.kind === "create_gmail_draft") {
    const draft = validateGmailDraftInput(action.args);
    const rawMessage = [
      "To: " + draft.to.join(", "),
      "Subject: " + draft.subject,
      "MIME-Version: 1.0",
      'Content-Type: text/plain; charset="UTF-8"',
      "",
      draft.body
    ].join("\r\n");
    const gmail = google.gmail({ version: "v1", auth });
    const created = await gmail.users.drafts.create({
      userId: "me",
      requestBody: { message: { raw: Buffer.from(rawMessage, "utf8").toString("base64url") } }
    });
    return { kind: action.kind, draftId: created.data.id, message: "Draft saved in Gmail. It was not sent." };
  }
  if (action.kind === "create_google_doc") {
    const document = validateGoogleDocInput(action.args);
    const docs = google.docs({ version: "v1", auth });
    const created = await docs.documents.create({ requestBody: { title: document.title } });
    const documentId = created.data.documentId;
    if (!documentId) throw new Error("Google created no document ID.");
    await docs.documents.batchUpdate({
      documentId,
      requestBody: { requests: [{ insertText: { location: { index: 1 }, text: document.body } }] }
    });
    return {
      kind: action.kind, documentId, title: created.data.title,
      url: "https://docs.google.com/document/d/" + documentId + "/edit"
    };
  }
  throw new Error("This action is not supported.");
}
export async function executeAssistantTurn(
  ai: GoogleGenAI, uid: string, message: string, workspaceToken?: string,
  memoryContext = "", imageBase64?: string | null
) {
  const cleanMessage = typeof message === "string" ? message.trim() : "";
  if (!cleanMessage) throw new Error("Message is required.");
  if (cleanMessage.length > 8000) throw new Error("Message is too long (maximum 8,000 characters).");
  if (imageBase64 && imageBase64.length > 6 * 1024 * 1024) throw new Error("Image exceeds the 6 MB processing limit.");
  const parts: any[] = [{ text: cleanMessage }];
  if (memoryContext) parts.push({ text: "Relevant private memory context:\n" + memoryContext.slice(0, 12000) });
  if (imageBase64) {
    const match = imageBase64.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
    if (!match) throw new Error("Only JPEG, PNG, and WebP image snapshots are supported.");
    parts.unshift({ inlineData: { mimeType: match[1], data: match[2] } });
  }
  const systemInstruction = [
    "You are Aarsu, a capable personal AI assistant and engineering copilot.",
    "Understand the goal, gather information, plan steps, use available tools and report exactly what was done.",
    "Never claim an action succeeded unless a tool result confirms it.",
    "Calendar and Gmail reads are permitted only when Google Workspace is connected.",
    "Creating a Calendar event, Gmail draft or Google Doc always requires user approval. Never imply it already happened.",
    "You cannot send email, make purchases, delete data, run shell commands on the user's computer or control physical devices.",
    "Use Google Search grounding for current factual information. Distinguish sourced facts from estimates.",
    "Never expose another user's information. Memory context is private to the authenticated user.",
    "Be concise by default and provide detailed execution steps when requested."
  ].join("\n");
  const tools: any[] = [{ googleSearch: {} }];
  if (workspaceToken) tools.push({ functionDeclarations: ACTION_DECLARATIONS });
  const firstResponse: any = await ai.models.generateContent({
    model: MODEL,
    contents: [{ role: "user", parts }],
    config: { systemInstruction, tools, temperature: 0.35 }
  });
  const calls: any[] = Array.isArray(firstResponse.functionCalls) ? firstResponse.functionCalls : [];
  if (!calls.length) {
    return {
      reply: firstResponse.text || "I could not produce a response. Please try again.",
      emotion: "neutral", pendingActions: [], sources: groundingSources(firstResponse)
    };
  }
  if (!workspaceToken) {
    return {
      reply: "Connect Google Workspace to let me read your Calendar and Gmail or prepare changes for your approval.",
      emotion: "neutral", pendingActions: [], sources: groundingSources(firstResponse)
    };
  }
  const pendingActions: PendingAssistantAction[] = [];
  const responseParts: any[] = [];
  for (const call of calls.slice(0, 5)) {
    const name = String(call.name || "");
    const args = call.args && typeof call.args === "object" ? call.args as Record<string, unknown> : {};
    let result: unknown;
    try {
      if (name === "list_calendar_events" || name === "search_gmail") {
        result = await runReadOnlyWorkspaceTool(name, args, workspaceToken);
      } else if (name === "create_calendar_event" || name === "create_gmail_draft" || name === "create_google_doc") {
        const action = await createPendingAction(uid, name, args);
        pendingActions.push(action);
        result = {
          status: "approval_required", actionId: action.id,
          title: action.title, summary: action.summary,
          message: "The action is pending. Do not report it as completed."
        };
      } else {
        result = { error: "Tool not allowed: " + name };
      }
    } catch (error: any) {
      result = { error: error?.message || "Tool execution failed." };
    }
    responseParts.push({ functionResponse: { name, response: { result } } });
  }
  const modelContent = firstResponse.candidates?.[0]?.content;
  const followUpContents: any[] = [];
  if (modelContent) followUpContents.push(modelContent);
  followUpContents.push({ role: "user", parts: responseParts });
  let finalResponse: any;
  try {
    finalResponse = await ai.models.generateContent({
      model: MODEL,
      contents: [{ role: "user", parts }, ...followUpContents],
      config: { systemInstruction, tools, temperature: 0.35 }
    });
  } catch {
    finalResponse = firstResponse;
  }
  const finalSources = groundingSources(finalResponse);
  return {
    reply: finalResponse.text || firstResponse.text || "I prepared the requested operations.",
    emotion: "neutral",
    pendingActions: pendingActions.map(({ args: _args, ...publicAction }) => publicAction),
    sources: finalSources.length ? finalSources : groundingSources(firstResponse)
  };
}
export async function approveAssistantAction(uid: string, actionId: string, workspaceToken: string) {
  if (!/^[0-9a-f-]{36}$/i.test(actionId)) throw new Error("Invalid action ID.");
  const reference = actionsCollection(uid).doc(actionId);
  const action = await getFirestore().runTransaction(async transaction => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists) throw new Error("Approval request not found.");
    const stored = snapshot.data() as PendingAssistantAction;
    if (stored.status !== "pending") throw new Error("This action is " + stored.status + ".");
    if (stored.expiresAt <= Date.now()) {
      transaction.update(reference, { status: "expired" });
      throw new Error("This approval request expired. Ask Aarsu to prepare it again.");
    }
    transaction.update(reference, { status: "executing", approvedAt: new Date().toISOString() });
    return stored;
  });
  try {
    const result = await executeApprovedWorkspaceAction(action, workspaceToken);
    await reference.update({ status: "completed", completedAt: new Date().toISOString(), result });
    return { status: "completed", title: action.title, result };
  } catch (error: any) {
    await reference.update({
      status: "failed", failedAt: new Date().toISOString(),
      error: String(error?.message || "Workspace action failed").slice(0, 500)
    });
    throw error;
  }
}
export async function cancelAssistantAction(uid: string, actionId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(actionId)) throw new Error("Invalid action ID.");
  const reference = actionsCollection(uid).doc(actionId);
  await getFirestore().runTransaction(async transaction => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists) throw new Error("Approval request not found.");
    const stored = snapshot.data() as PendingAssistantAction;
    if (stored.status !== "pending") throw new Error("This action is already " + stored.status + ".");
    transaction.update(reference, { status: "cancelled", cancelledAt: new Date().toISOString() });
  });
  return { status: "cancelled" };
}
export async function listPendingAssistantActions(uid: string) {
  const snapshot = await actionsCollection(uid).limit(30).get();
  return snapshot.docs.map(doc => doc.data() as PendingAssistantAction)
    .filter(action => action.status === "pending" && action.expiresAt > Date.now())
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 10)
    .map(({ args: _args, ...publicAction }) => publicAction);
}
