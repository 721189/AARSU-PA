import { randomUUID } from "crypto";
import { GoogleGenAI } from "@google/genai";

export interface AgentTaskReport {
  agentName: "Sentinel" | "Architect" | "Tactician";
  status: "completed" | "failed";
  objective: string;
  findings: string[];
  executionTimeMs: number;
}

export interface SwarmExecutionResult {
  missionId: string;
  objective: string;
  reports: AgentTaskReport[];
  selfHealingTriggered: false;
  synthesizedConclusion: string;
  totalTimeMs: number;
}

export class IronLegionOrchestrator {
  constructor(private readonly ai: GoogleGenAI) {}

  public async executeMission(objective: string): Promise<SwarmExecutionResult> {
    const cleanObjective = typeof objective === "string" ? objective.trim() : "";
    if (!cleanObjective || cleanObjective.length > 2000) {
      throw new Error("Mission objective must contain 1 to 2,000 characters.");
    }

    const startedAt = Date.now();
    const reports = await Promise.all([
      this.runAgent("Sentinel", "Security and privacy review", cleanObjective),
      this.runAgent("Architect", "Architecture and reliability review", cleanObjective),
      this.runAgent("Tactician", "Execution strategy and priorities", cleanObjective)
    ]);
    const failedCount = reports.filter(report => report.status === "failed").length;

    let conclusion: string;
    if (failedCount > 0) {
      conclusion = failedCount + " of 3 model assessments failed. Treat the remaining findings as partial and unverified.";
    } else {
      try {
        const synthesis = await this.ai.models.generateContent({
          model: "gemini-3.8-flash",
          contents: "Summarize these model-generated assessments. Clearly distinguish recommendations from verified runtime facts: " +
            JSON.stringify(reports),
          config: {
            systemInstruction: "You are Aarsu's analysis coordinator. Never claim to have changed code or verified infrastructure."
          }
        });
        conclusion = synthesis.text || "All three model assessments completed. No code changes were made.";
      } catch {
        conclusion = "All three model assessments completed. Synthesis was unavailable. No code changes were made.";
      }
    }

    return {
      missionId: randomUUID(),
      objective: cleanObjective,
      reports,
      selfHealingTriggered: false,
      synthesizedConclusion: conclusion,
      totalTimeMs: Date.now() - startedAt
    };
  }

  private async runAgent(
    agentName: AgentTaskReport["agentName"],
    objectiveLabel: string,
    objective: string
  ): Promise<AgentTaskReport> {
    const startedAt = Date.now();
    try {
      const response = await this.ai.models.generateContent({
        model: "gemini-3.5-flash-lite",
        contents: "Review this objective: " + objective +
          ". Return up to five concrete findings. Do not claim to have run tools or verified files.",
        config: {
          systemInstruction: "You are the " + agentName + " analysis role. " + objectiveLabel +
            ". Clearly label assumptions and recommended checks."
        }
      });
      if (!response.text || !response.text.trim()) {
        throw new Error("The model returned an empty assessment.");
      }
      return {
        agentName,
        status: "completed",
        objective: objectiveLabel,
        findings: response.text.split("\n").filter(line => line.trim()).slice(0, 8),
        executionTimeMs: Date.now() - startedAt
      };
    } catch (error: any) {
      return {
        agentName,
        status: "failed",
        objective: objectiveLabel,
        findings: ["Assessment failed: " + String(error?.message || error).slice(0, 240)],
        executionTimeMs: Date.now() - startedAt
      };
    }
  }
}
