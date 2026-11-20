export const ASSISTANT_DOMAIN_OPTIONS = [
  { id: "auto", label: "Auto", description: "Let Aarsu select the right workflow." },
  { id: "research", label: "Research", description: "Source-led research, evidence synthesis and comparisons." },
  { id: "engineering", label: "Engineering", description: "Architecture, software design, debugging and technical delivery." },
  { id: "learning", label: "Learning", description: "Explanations, study plans, practice and feedback." },
  { id: "writing", label: "Writing", description: "Drafting, editing, structured documents and communication." },
  { id: "data_analysis", label: "Data analysis", description: "Spreadsheets, statistics, calculations and interpretation." },
  { id: "productivity", label: "Productivity", description: "Calendar, email, documents and personal workflows." },
  { id: "strategy", label: "Strategy", description: "Planning, prioritization, trade-offs and execution roadmaps." }
] as const;

export type AssistantDomain = typeof ASSISTANT_DOMAIN_OPTIONS[number]["id"];
export type EffectiveAssistantDomain = Exclude<AssistantDomain, "auto"> | "general";

const DOMAIN_INSTRUCTIONS: Record<EffectiveAssistantDomain, string> = {
  general: [
    "Select the most useful professional approach for the request and adapt the level of detail to the task.",
    "Start by identifying the actual outcome the user needs. Separate known facts, assumptions, and open questions.",
    "For multi-step work, state a compact plan, execute available tools, verify outcomes, and report limitations."
  ].join("\n"),
  research: [
    "Work like a careful research analyst. Decompose broad questions into answerable sub-questions.",
    "Use Google Search grounding for current, niche, contested, or source-dependent claims. Prefer primary sources, official documentation, papers, and direct datasets.",
    "Cite sources close to the claims they support. Distinguish evidence, interpretation, estimates, and unresolved uncertainty.",
    "Compare source dates and methodology. Never invent citations, quotations, study results, or source access."
  ].join("\n"),
  engineering: [
    "Work like a senior software and systems engineer. Clarify requirements, constraints, interfaces, threat model, and failure modes.",
    "For debugging, isolate symptoms, likely causes, reproducible checks, and minimal fixes. Include tests and rollback considerations.",
    "For architecture, discuss trade-offs, observability, security, reliability, scaling, and operational cost where relevant.",
    "Never claim code was changed, tested, deployed, or inspected unless an available tool actually performed that operation."
  ].join("\n"),
  learning: [
    "Work like an expert tutor. Build from the learner's current understanding and explain the mental model before details.",
    "Use worked examples, analogies only when accurate, short practice tasks, and a way to check mastery.",
    "For study plans, define prerequisites, weekly milestones, active-recall practice, projects, and measurable exit criteria.",
    "Do not present uncertain claims as settled facts; encourage understanding rather than memorizing unsupported shortcuts."
  ].join("\n"),
  writing: [
    "Work like a professional editor and communicator. Identify audience, purpose, tone, format, and desired action.",
    "Produce a complete, usable draft when asked to write. Preserve the user's meaning and factual details.",
    "Never invent credentials, achievements, metrics, quotations, sources, commitments, or personal details.",
    "For sensitive or high-impact communications, flag ambiguous claims and offer precise, defensible wording."
  ].join("\n"),
  data_analysis: [
    "Work like a rigorous data analyst. Inspect data structure, units, missing values, duplicates, outliers, and definitions before interpreting it.",
    "Use hosted code execution for calculations, statistics, transformations, or reproducible numerical work when useful.",
    "Show the method, assumptions, denominators, and validation checks. Distinguish correlation from causation and forecasts from observations.",
    "When reading connected spreadsheets, stay within the bounded read-only range and disclose truncation or unavailable fields."
  ].join("\n"),
  productivity: [
    "Work like a reliable executive assistant. Convert intentions into clear next actions, owners, deadlines, dependencies, and reminders.",
    "Use connected Calendar, Gmail, Drive, Docs, and Sheets only when the user has connected Google Workspace.",
    "Read operations may run directly. Creating events, drafts, or documents requires explicit approval of the complete preview.",
    "Never send messages, make purchases, delete records, or claim a reminder/background job exists unless that capability is implemented and confirmed."
  ].join("\n"),
  strategy: [
    "Work like a pragmatic strategy and operations partner. Define the objective, baseline, constraints, alternatives, and decision criteria.",
    "Compare options using impact, effort, risk, reversibility, dependencies, and time-to-value.",
    "Turn recommendations into prioritized milestones with measurable outcomes, owners, and review points.",
    "Make uncertainty and assumptions explicit; do not imply a forecast or business result is guaranteed."
  ].join("\n")
};

const DOMAIN_KEYWORDS: Record<EffectiveAssistantDomain, RegExp[]> = {
  general: [],
  research: [
    /\b(research|sources?|papers?|studies|literature|peer.reviewed|citations?|evidence|latest|compare findings)\b/i,
    /\b(what does the evidence say|state of the art|systematic review)\b/i
  ],
  engineering: [
    /\b(code|bug|debug|build|api|architecture|deploy|typescript|javascript|python|tests?|refactor|repo|database|security|performance|system design)\b/i,
    /\b(stack trace|pull request|ci\/cd|infrastructure|backend|frontend|integration)\b/i
  ],
  learning: [
    /\b(learn|teach|explain|study|lesson|course|syllabus|practice|quiz|understand|concept|curriculum)\b/i,
    /\b(beginner|advanced|prerequisite|tutorial|teach me)\b/i
  ],
  writing: [
    /\b(write|draft|rewrite|edit|polish|article|resume|cv|email|memo|proposal|social post|blog|copywriting)\b/i,
    /\b(wording|proofread|tone|cover letter)\b/i
  ],
  data_analysis: [
    /\b(data|analy[sz]e|analysis|csv|spreadsheet|dataset|statistics|regression|chart|plot|metrics|sql|calculate|forecast|dashboard)\b/i,
    /\b(rows|columns|outliers|correlation|distribution|trend)\b/i
  ],
  productivity: [
    /\b(calendar|schedule|meeting|gmail|inbox|remind|task|todo|organize|plan my day|event|follow.up|drive|workspace|google doc)\b/i,
    /\b(appointment|availability|agenda|draft an email)\b/i
  ],
  strategy: [
    /\b(roadmap|strategy|prioriti[sz]e|business|career|launch|growth|monetiz|go.to.market|decision|trade.off|execution plan)\b/i,
    /\b(competitive advantage|operating model|90.day plan)\b/i
  ]
};

export function parseAssistantDomain(value: unknown): AssistantDomain {
  if (value === undefined || value === null || value === "") return "auto";
  if (typeof value !== "string" || !ASSISTANT_DOMAIN_OPTIONS.some(option => option.id === value)) {
    throw new Error("Unsupported assistant domain. Choose one of the available operating modes.");
  }
  return value as AssistantDomain;
}

export function inferAssistantDomain(message: string): EffectiveAssistantDomain {
  const scores = (Object.keys(DOMAIN_KEYWORDS) as EffectiveAssistantDomain[])
    .filter(domain => domain !== "general")
    .map(domain => ({
      domain,
      score: DOMAIN_KEYWORDS[domain].reduce(
        (total, pattern) => total + (pattern.test(message) ? 1 : 0),
        0
      )
    }))
    .sort((a, b) => b.score - a.score);

  return scores[0]?.score > 0 ? scores[0].domain : "general";
}

export function resolveAssistantDomain(value: unknown, message: string) {
  const requested = parseAssistantDomain(value);
  const effective = requested === "auto" ? inferAssistantDomain(message) : requested;
  const label = ASSISTANT_DOMAIN_OPTIONS.find(option => option.id === effective)?.label || "General";
  return {
    requested,
    effective,
    label,
    instructions: DOMAIN_INSTRUCTIONS[effective],
    enableCodeExecution: effective === "engineering" || effective === "research" ||
      effective === "learning" || effective === "data_analysis"
  };
}

export function getAssistantCapabilities() {
  return {
    domains: ASSISTANT_DOMAIN_OPTIONS,
    capabilities: [
      { id: "grounded_research", label: "Web research", access: "Google Search grounding", mode: "read" },
      { id: "code_execution", label: "Calculations and code", access: "Google-hosted code execution sandbox", mode: "sandboxed" },
      { id: "drive_search", label: "Drive search", access: "Google Drive read-only", mode: "read" },
      { id: "document_read", label: "Google Docs reading", access: "Google Docs read-only", mode: "read" },
      { id: "sheets_read", label: "Spreadsheet analysis", access: "Google Sheets read-only, bounded to A1:Z500", mode: "read" },
      { id: "calendar_read", label: "Calendar", access: "Google Calendar read-only", mode: "read" },
      { id: "gmail_search", label: "Email search", access: "Gmail metadata and snippets", mode: "read" },
      { id: "calendar_write", label: "Create calendar events", access: "Explicit approval required", mode: "approval" },
      { id: "gmail_drafts", label: "Create email drafts", access: "Explicit approval required; never sends", mode: "approval" },
      { id: "docs_write", label: "Create Google Docs", access: "Explicit approval required", mode: "approval" }
    ],
    limitations: [
      "No arbitrary local computer, terminal, or filesystem control.",
      "No email sending, purchasing, destructive actions, or physical IoT control.",
      "No unattended background execution or guaranteed always-on operation.",
      "External integrations are limited to the services listed above."
    ]
  };
}
