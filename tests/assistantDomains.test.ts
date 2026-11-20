import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ASSISTANT_DOMAIN_OPTIONS,
  getAssistantCapabilities,
  inferAssistantDomain,
  parseAssistantDomain,
  resolveAssistantDomain
} from "../src/server/assistantDomains.ts";

test("all supported operating modes are discoverable", () => {
  assert.deepEqual(
    ASSISTANT_DOMAIN_OPTIONS.map(option => option.id),
    ["auto", "research", "engineering", "learning", "writing", "data_analysis", "productivity", "strategy"]
  );
});

test("auto mode routes research, engineering, learning, writing and analysis prompts", () => {
  assert.equal(inferAssistantDomain("Compare peer-reviewed research papers and cite the evidence"), "research");
  assert.equal(inferAssistantDomain("Debug this TypeScript API and add regression tests"), "engineering");
  assert.equal(inferAssistantDomain("Teach me calculus with examples and practice problems"), "learning");
  assert.equal(inferAssistantDomain("Rewrite this email in a concise professional tone"), "writing");
  assert.equal(inferAssistantDomain("Analyze this spreadsheet and calculate summary statistics"), "data_analysis");
});

test("explicit domain selection overrides automatic classification", () => {
  const resolved = resolveAssistantDomain("strategy", "Teach me calculus");
  assert.equal(resolved.requested, "strategy");
  assert.equal(resolved.effective, "strategy");
  assert.equal(resolved.label, "Strategy");
});

test("auto mode falls back to general for ambiguous prompts", () => {
  assert.equal(resolveAssistantDomain("auto", "Hi there").effective, "general");
});

test("invalid domain values are rejected", () => {
  assert.throws(() => parseAssistantDomain("shell_access"));
  assert.throws(() => resolveAssistantDomain({ role: "admin" }, "test"));
});

test("code execution is only enabled for analytical and technical learning modes", () => {
  assert.equal(resolveAssistantDomain("data_analysis", "inspect data").enableCodeExecution, true);
  assert.equal(resolveAssistantDomain("engineering", "review code").enableCodeExecution, true);
  assert.equal(resolveAssistantDomain("writing", "write an email").enableCodeExecution, false);
});

test("capability catalog accurately describes guarded Workspace writes", () => {
  const catalog = getAssistantCapabilities();
  assert.ok(catalog.capabilities.some(item => item.id === "sheets_read" && item.access.includes("A1:Z500")));
  assert.ok(catalog.capabilities.some(item => item.id === "gmail_drafts" && item.mode === "approval"));
  assert.ok(catalog.limitations.some(item => item.includes("No arbitrary local computer")));
});
