import { GoogleGenAI } from "@google/genai";
import { MODELS } from "./models";

export interface AgentTaskReport {
  agentName: 'Sentinel' | 'Architect' | 'Tactician';
  /**
   * 'passed'  — the agent produced real model output.
   * 'retried' — the first attempt failed and a real retry succeeded.
   * 'failed'  — the agent could not complete; `error` explains why.
   * There is no longer a fabricated 'passed' on failure.
   */
  status: 'passed' | 'retried' | 'failed';
  objective: string;
  findings: string[];
  error?: string;
  attempts: number;
  executionTimeMs: number;
}

export interface SwarmExecutionResult {
  missionId: string;
  objective: string;
  reports: AgentTaskReport[];
  /** True when at least one sub-agent genuinely failed and was retried. */
  selfHealingTriggered: boolean;
  /** True when the swarm completed with every sub-agent reporting real output. */
  allAgentsSucceeded: boolean;
  synthesizedConclusion: string;
  totalTimeMs: number;
}

export class IronLegionOrchestrator {
  private ai: GoogleGenAI;

  constructor(aiClient: GoogleGenAI) {
    this.ai = aiClient;
  }

  public async executeMission(objective: string): Promise<SwarmExecutionResult> {
    const startTime = Date.now();
    const missionId = `mission_${Date.now()}`;

    // Parallel Sub-Agent Dispatches
    const [sentinelReport, architectReport, tacticianReport] = await Promise.all([
      this.runSentinelAgent(objective),
      this.runArchitectAgent(objective),
      this.runTacticianAgent(objective)
    ]);

    const reports = [sentinelReport, architectReport, tacticianReport];
    // "Self-healing" now means a real retry actually happened, not a relabelled warning.
    const selfHealingTriggered = reports.some(r => r.attempts > 1);
    const allAgentsSucceeded = reports.every(r => r.status !== 'failed');

    // Synthesize Swarm Findings dynamically with Gemini
    let synthesizedConclusion = "";
    try {
      const synthPrompt = `Synthesize findings from the Iron Legion 3-agent swarm for mission "${objective}":
- Sentinel (Security): ${sentinelReport.findings.join("; ")}
- Architect (Scalability): ${architectReport.findings.join("; ")}
- Tactician (Strategy): ${tacticianReport.findings.join("; ")}
Provide a crisp, authoritative, 2-3 sentence JARVIS tactical mission conclusion addressing 'Sir'.`;

      const synthRes = await this.ai.models.generateContent({
        model: MODELS.chat,
        contents: synthPrompt,
        config: {
          systemInstruction: "You are J.A.R.V.I.S. Synthesize Iron Legion multi-agent mission reports with crisp military precision and wit. Refer to user as 'Sir'."
        }
      });
      synthesizedConclusion = synthRes.text || "";
    } catch (err) {
      // Honest degradation: say the synthesis step failed rather than inventing a
      // triumphant all-green conclusion.
      synthesizedConclusion =
        `Iron Legion completed the sub-agent sweep for "${objective}", but the synthesis step was unavailable ` +
        `(${(err as Error)?.message ?? 'unknown error'}). Raw sub-agent findings are reported above.`;
    }

    return {
      missionId,
      objective,
      reports,
      selfHealingTriggered,
      allAgentsSucceeded,
      synthesizedConclusion,
      totalTimeMs: Date.now() - startTime
    };
  }

  /**
   * Runs one sub-agent with a genuine single retry. On failure the report is
   * marked 'failed' with the underlying error — never a fabricated 'passed'.
   */
  private async runSubAgent(
    agentName: AgentTaskReport['agentName'],
    objectiveLabel: string,
    contents: string,
    systemInstruction: string
  ): Promise<AgentTaskReport> {
    const start = Date.now();
    let attempts = 0;
    let lastError: unknown = null;

    for (let attempt = 1; attempt <= 2; attempt++) {
      attempts = attempt;
      try {
        const response = await this.ai.models.generateContent({
          model: MODELS.fast,
          contents,
          config: { systemInstruction }
        });
        const lines = (response.text || "").split("\n").filter(l => l.trim().length > 0).slice(0, 3);
        if (lines.length === 0) {
          throw new Error('Sub-agent returned an empty response.');
        }
        return {
          agentName,
          status: attempt === 1 ? 'passed' : 'retried',
          objective: objectiveLabel,
          findings: lines,
          attempts,
          executionTimeMs: Date.now() - start
        };
      } catch (err) {
        lastError = err;
        console.warn(`[Iron Legion] ${agentName} attempt ${attempt} failed: ${(err as Error)?.message ?? err}`);
      }
    }

    return {
      agentName,
      status: 'failed',
      objective: objectiveLabel,
      findings: [],
      error: (lastError as Error)?.message ?? String(lastError),
      attempts,
      executionTimeMs: Date.now() - start
    };
  }

  private runSentinelAgent(objective: string): Promise<AgentTaskReport> {
    return this.runSubAgent(
      'Sentinel',
      'Security & Integrity Perimeter Scan',
      `Sentinel Agent: Audit security, token sanitization, and runtime integrity for: ${objective}`,
      "You are the Sentinel Sub-Agent in J.A.R.V.I.S.'s Iron Legion. Report on security parameters, token safety, and defensive protocols. Return 3 bullet-point findings."
    );
  }

  private runArchitectAgent(objective: string): Promise<AgentTaskReport> {
    return this.runSubAgent(
      'Architect',
      'Code Architecture & Scalability Audit',
      `Architect Agent: Analyze architectural design, modularity, and resource efficiency for: ${objective}`,
      "You are the Architect Sub-Agent in J.A.R.V.I.S.'s Iron Legion. Report on code modularity, state flow, and optimization. Return 3 bullet-point findings."
    );
  }

  private runTacticianAgent(objective: string): Promise<AgentTaskReport> {
    return this.runSubAgent(
      'Tactician',
      'Strategic Action & Tool Dispatch',
      `Tactician Agent: Plan execution strategy, priority roadmap, and external tool integration for: ${objective}`,
      "You are the Tactician Sub-Agent in J.A.R.V.I.S.'s Iron Legion. Formulate tactical action plans and optimal next moves. Return 3 bullet-point findings."
    );
  }
}
