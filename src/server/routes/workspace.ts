import { Router } from "express";
import { requireAuth } from "../auth";
import { config } from "../config";

const workspaceRouter = Router();

workspaceRouter.get("/workspace", requireAuth, async (req, res) => {
  try {
    const fs = await import("fs/promises");
    const path = await import("path");

    const rootDir = process.cwd();
    const pkgRaw = await fs.readFile(path.join(rootDir, "package.json"), "utf-8").catch(() => "{}");
    const metaRaw = await fs.readFile(path.join(rootDir, "metadata.json"), "utf-8").catch(() => "{}");

    const pkg = JSON.parse(pkgRaw);
    const meta = JSON.parse(metaRaw);

    res.json({
      workspaceName: meta.name || "Aarsu JARVIS System",
      version: pkg.version || "1.0.0",
      dependencies: Object.keys(pkg.dependencies || {}),
      status: "Operational",
      securityLevel: "Maximum (JARVIS Protocol)",
      uptime: process.uptime(),
      simulationMode: config.simulationMode,
      simulatedServices: config.simulationMode
        ? [
            "IoT bridge (simulated devices)",
            "Biometric telemetry (simulated/in-memory)",
            "Knowledge graph (in-memory)",
            "Redis-like cache (in-memory)",
          ]
        : [],
    });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to query workspace state" });
  }
});

export { workspaceRouter };

