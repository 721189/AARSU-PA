import { randomUUID } from "crypto";
import { GoogleGenAI } from "@google/genai";
import { getFirestore } from "firebase-admin/firestore";
import { google } from "googleapis";

export type TaskCategory = "meeting_prep" | "email_followup" | "task_brief" | "schedule_optimization";

export interface ProactiveTaskSuggestion {
  id: string;
  title: string;
  category: TaskCategory;
  sourceContext: string;
  suggestedAction: string;
  confidenceScore: number;
  rewardWeight: number;
  status: "pending" | "accepted" | "dismissed" | "completed";
  timestamp: string;
}

interface UserSchedulerState {
  suggestions: ProactiveTaskSuggestion[];
  qWeights: Record<TaskCategory, number>;
}

const DEFAULT_WEIGHTS: Record<TaskCategory, number> = {
  meeting_prep: 1,
  email_followup: 1,
  task_brief: 1,
  schedule_optimization: 1
};
const CATEGORIES: TaskCategory[] = [
  "meeting_prep",
  "email_followup",
  "task_brief",
  "schedule_optimization"
];

function stateDocument(uid: string) {
  if (!uid) throw new Error("Authenticated user is required.");
  return getFirestore().collection("users").doc(uid)
    .collection("assistant_state").doc("proactive_scheduler");
}

export class ReinforcementScheduler {
  private ai: GoogleGenAI | null = null;
  private states = new Map<string, UserSchedulerState>();
  private learningRate = 0.1;

  public setAIClient(ai: GoogleGenAI) {
    this.ai = ai;
  }

  private async loadState(uid: string): Promise<UserSchedulerState> {
    if (!uid) throw new Error("Authenticated user is required.");
    const cached = this.states.get(uid);
    if (cached) return cached;

    const state: UserSchedulerState = {
      suggestions: [],
      qWeights: { ...DEFAULT_WEIGHTS }
    };
    const snapshot = await stateDocument(uid).get();
    if (snapshot.exists) {
      const saved = snapshot.data() || {};
      if (Array.isArray(saved.suggestions)) {
        state.suggestions = saved.suggestions.filter((item: any) =>
          item && typeof item.id === "string" &&
          typeof item.title === "string" &&
          CATEGORIES.includes(item.category) &&
          ["pending", "accepted", "dismissed", "completed"].includes(item.status)
        ).slice(0, 30);
      }
      if (saved.qWeights && typeof saved.qWeights === "object") {
        for (const category of CATEGORIES) {
          const weight = Number(saved.qWeights[category]);
          if (Number.isFinite(weight)) {
            state.qWeights[category] = Math.min(3, Math.max(0.2, weight));
          }
        }
      }
    }
    this.states.set(uid, state);
    return state;
  }

  private async saveState(uid: string, state: UserSchedulerState) {
    this.states.set(uid, state);
    await stateDocument(uid).set({
      suggestions: state.suggestions.slice(0, 30),
      qWeights: state.qWeights,
      updatedAt: new Date().toISOString()
    });
  }

  public async analyzeWorkspaceForProactiveTasks(
    uid: string,
    oauthToken: string
  ): Promise<ProactiveTaskSuggestion[]> {
    if (!uid || !oauthToken) throw new Error("Authenticated user and Google Workspace connection are required.");

    const state = await this.loadState(uid);
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: oauthToken });

    const calendar = google.calendar({ version: "v3", auth });
    const eventsRes = await calendar.events.list({
      calendarId: "primary",
      timeMin: new Date().toISOString(),
      maxResults: 5,
      singleEvents: true,
      orderBy: "startTime"
    });
    const calendarEvents = (eventsRes.data.items || []).map(event =>
      String(event.summary || "(No title)") + " (" +
      String((event.start && (event.start.dateTime || event.start.date)) || "unknown time") + ")"
    ).join("; ") || "No upcoming events";

    const gmail = google.gmail({ version: "v1", auth });
    const messages = await gmail.users.messages.list({
      userId: "me",
      maxResults: 3,
      q: "is:unread"
    });
    const snippets: string[] = [];
    for (const message of (messages.data.messages || []).slice(0, 3)) {
      if (!message.id) continue;
      const detail = await gmail.users.messages.get({
        userId: "me",
        id: message.id,
        format: "metadata",
        metadataHeaders: ["From", "Subject", "Date"]
      });
      snippets.push(detail.data.snippet || "Unread email");
    }

    if (this.ai) {
      const prompt = [
        "Create 2-3 useful, specific task suggestions from this user's calendar and unread email snippets.",
        "Do not invent events, send messages, or claim actions were completed.",
        "Return a JSON array with title, category, sourceContext, suggestedAction and confidenceScore.",
        "Allowed categories: meeting_prep, email_followup, task_brief, schedule_optimization.",
        "Calendar: " + calendarEvents,
        "Unread email snippets: " + (snippets.join(" | ") || "No unread messages")
      ].join("\n");
      const response = await this.ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: prompt,
        config: {
          systemInstruction: "You are Aarsu's proactive planning engine. Produce grounded, useful suggestions.",
          responseMimeType: "application/json"
        }
      });

      if (response.text) {
        const parsed = JSON.parse(response.text);
        if (Array.isArray(parsed)) {
          const generated: ProactiveTaskSuggestion[] = parsed.slice(0, 3)
            .filter((item: any) => item && typeof item.title === "string" && item.title.trim())
            .map((item: any) => {
              const category = CATEGORIES.includes(item.category) ? item.category as TaskCategory : "task_brief";
              const confidence = Number(item.confidenceScore);
              return {
                id: randomUUID(),
                title: item.title.trim().slice(0, 160),
                category,
                sourceContext: String(item.sourceContext || "Workspace context").slice(0, 500),
                suggestedAction: String(item.suggestedAction || "Review this suggestion").slice(0, 1000),
                confidenceScore: Number.isFinite(confidence) ? Math.min(0.99, Math.max(0.1, confidence)) : 0.75,
                rewardWeight: state.qWeights[category],
                status: "pending" as const,
                timestamp: new Date().toISOString()
              };
            });
          for (const suggestion of generated) {
            if (!state.suggestions.some(existing => existing.title === suggestion.title)) {
              state.suggestions.unshift(suggestion);
            }
          }
        }
      }
    }

    state.suggestions = state.suggestions.slice(0, 30);
    await this.saveState(uid, state);
    return this.getSuggestions(uid);
  }

  public async recordFeedback(
    uid: string,
    suggestionId: string,
    feedback: "accept" | "dismiss" | "complete"
  ): Promise<{ reward: number; updatedWeight: number }> {
    if (!["accept", "dismiss", "complete"].includes(feedback)) throw new Error("Unsupported feedback value.");
    const state = await this.loadState(uid);
    const suggestion = state.suggestions.find(item => item.id === suggestionId);
    if (!suggestion) throw new Error("Suggestion not found for this account.");

    const reward = feedback === "dismiss" ? -1 : 1;
    suggestion.status = feedback === "accept" ? "accepted" :
      feedback === "complete" ? "completed" : "dismissed";
    const current = state.qWeights[suggestion.category] || 1;
    const updated = current + this.learningRate * (reward - current);
    state.qWeights[suggestion.category] = Math.max(0.2, Math.min(3, Number(updated.toFixed(3))));
    suggestion.rewardWeight = state.qWeights[suggestion.category];
    await this.saveState(uid, state);
    return { reward, updatedWeight: state.qWeights[suggestion.category] };
  }

  public async getSuggestions(uid: string): Promise<ProactiveTaskSuggestion[]> {
    const state = await this.loadState(uid);
    return [...state.suggestions].sort((a, b) =>
      (b.confidenceScore * b.rewardWeight) - (a.confidenceScore * a.rewardWeight)
    );
  }

  public async getReinforcementMetrics(uid: string) {
    const state = await this.loadState(uid);
    return {
      qWeights: state.qWeights,
      learningRate: this.learningRate,
      totalTrackedTasks: state.suggestions.length,
      policyStatus: "Per-user feedback weighting (not model training)"
    };
  }
}

export const reinforcementScheduler = new ReinforcementScheduler();
