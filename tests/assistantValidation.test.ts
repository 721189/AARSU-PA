import assert from "node:assert/strict";
import { test } from "node:test";
import {
  validateCalendarEventInput,
  validateGmailDraftInput,
  validateGoogleDocInput,
  validateGmailSearchQuery
} from "../src/server/assistantValidation.ts";

test("calendar event accepts a valid interval", () => {
  const event = validateCalendarEventInput({
    summary: "Project review",
    startDateTime: "2026-12-01T10:00:00+05:30",
    endDateTime: "2026-12-01T10:30:00+05:30"
  });
  assert.equal(event.summary, "Project review");
  assert.equal(event.timeZone, "Asia/Kolkata");
});
test("calendar event rejects an end before its start", () => {
  assert.throws(() => validateCalendarEventInput({
    summary: "Invalid",
    startDateTime: "2026-12-01T11:00:00+05:30",
    endDateTime: "2026-12-01T10:00:00+05:30"
  }));
});
test("Gmail draft validates recipient addresses and strips subject newlines", () => {
  const draft = validateGmailDraftInput({
    to: "user@example.com, second@example.org",
    subject: "Hello\nBcc: attacker@example.com",
    body: "Draft body"
  });
  assert.deepEqual(draft.to, ["user@example.com", "second@example.org"]);
  assert.equal(draft.subject.includes("\n"), false);
});
test("Gmail draft rejects malformed recipients", () => {
  assert.throws(() => validateGmailDraftInput({ to: "not-an-email", subject: "Hello", body: "Body" }));
});
test("Google Doc validation rejects empty titles", () => {
  assert.equal(validateGoogleDocInput({ title: "Notes", body: "Content" }).title, "Notes");
  assert.throws(() => validateGoogleDocInput({ title: " ", body: "Content" }));
});
test("Gmail search rejects blank and oversized queries", () => {
  assert.throws(() => validateGmailSearchQuery(" "));
  assert.throws(() => validateGmailSearchQuery("x".repeat(241)));
});
