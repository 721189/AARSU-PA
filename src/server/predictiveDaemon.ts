import { redisCache } from "./redisCache";

export interface ProactiveAlert {
  id: string;
  type: "system";
  urgency: "low" | "medium";
  message: string;
  actionRecommendation: string;
  timestamp: string;
}

export class PredictiveProactiveDaemon {
  private isRunning = false;
  private intervalRef: NodeJS.Timeout | null = null;
  private recentAlerts: ProactiveAlert[] = [];
  private lastMemoryAlertAt = 0;

  public start(intervalMs = 30000) {
    if (this.isRunning) return;
    this.isRunning = true;
    this.intervalRef = setInterval(() => this.runMonitoringCycle(), intervalMs);
    this.runMonitoringCycle();
    console.log("[Aarsu Daemon] Host process monitoring initialized.");
  }

  public stop() {
    if (this.intervalRef) clearInterval(this.intervalRef);
    this.intervalRef = null;
    this.isRunning = false;
  }

  private runMonitoringCycle() {
    try {
      const heapUsedMb = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
      if (heapUsedMb > 400 && Date.now() - this.lastMemoryAlertAt > 5 * 60 * 1000) {
        this.lastMemoryAlertAt = Date.now();
        this.emitAlert({
          id: "alert_" + Date.now(),
          type: "system",
          urgency: "medium",
          message: "Aarsu server heap usage is above 400 MB (" + heapUsedMb + " MB).",
          actionRecommendation: "Inspect active requests and memory usage before increasing capacity.",
          timestamp: new Date().toISOString()
        });
      }
    } catch (error) {
      console.warn("[Aarsu Daemon] Host monitoring cycle failed.", error);
    }
  }

  private emitAlert(alert: ProactiveAlert) {
    this.recentAlerts.unshift(alert);
    if (this.recentAlerts.length > 30) this.recentAlerts.pop();
    redisCache.set("proactive:latest", alert, 3600);
    redisCache.publish("proactive:channel", alert);
  }

  public getRecentAlerts(): ProactiveAlert[] {
    return [...this.recentAlerts];
  }
}

export const predictiveDaemon = new PredictiveProactiveDaemon();
