export type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Tool arguments must be a JSON object.");
  return value as JsonRecord;
}
function requiredString(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== "string") throw new Error(field + " must be a string.");
  const result = value.trim();
  if (!result || result.length > maxLength) throw new Error(field + " must contain between 1 and " + maxLength + " characters.");
  return result;
}
export interface CalendarEventInput {
  summary: string;
  description?: string;
  startDateTime: string;
  endDateTime: string;
  timeZone: string;
}
export function validateCalendarEventInput(value: unknown): CalendarEventInput {
  const args = asRecord(value);
  const summary = requiredString(args.summary, "summary", 180);
  const startDateTime = requiredString(args.startDateTime, "startDateTime", 64);
  const endDateTime = requiredString(args.endDateTime, "endDateTime", 64);
  const start = Date.parse(startDateTime);
  const end = Date.parse(endDateTime);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) throw new Error("The calendar event needs valid dates and an end time after its start time.");
  const description = typeof args.description === "string" ? args.description.slice(0, 4000) : "";
  const timeZone = typeof args.timeZone === "string" && args.timeZone.length <= 64 ? args.timeZone : "Asia/Kolkata";
  return { summary, description, startDateTime, endDateTime, timeZone };
}
export interface GmailDraftInput { to: string[]; subject: string; body: string; }
export function validateGmailDraftInput(value: unknown): GmailDraftInput {
  const args = asRecord(value);
  const rawTo = requiredString(args.to, "to", 1000);
  const to = rawTo.split(",").map(address => address.trim().toLowerCase()).filter(Boolean);
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!to.length || to.length > 10 || to.some(address => !emailPattern.test(address))) throw new Error("Provide between 1 and 10 valid recipient email addresses.");
  const subject = requiredString(args.subject, "subject", 250).replace(/[\r\n]/g, " ");
  const body = requiredString(args.body, "body", 20000);
  return { to, subject, body };
}
export interface GoogleDocInput { title: string; body: string; }
export function validateGoogleDocInput(value: unknown): GoogleDocInput {
  const args = asRecord(value);
  return {
    title: requiredString(args.title, "title", 180),
    body: requiredString(args.body, "body", 30000)
  };
}
export function validateGmailSearchQuery(value: unknown): string {
  return requiredString(value, "query", 240);
}
