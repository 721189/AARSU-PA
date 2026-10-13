import { GoogleGenAI } from '@google/genai';
import { redisCache } from './redisCache';
import { dbService, BiometricTelemetry } from './dbService';

export interface ProactiveAlert {
  id: string;
  type: 'biometric' | 'system' | 'tactical' | 'schedule';
  urgency: 'low' | 'medium' | 'high';
  message: string;
  actionRecommendation: string;
  timestamp: string;
}

export class PredictiveProactiveDaemon {
  private ai: GoogleGenAI | null = null;
  private isRunning: boolean = false;
  private intervalRef: NodeJS.Timeout | null = null;
  private recentAlerts: ProactiveAlert[] = [];

  constructor() {}

  public setAIClient(ai: GoogleGenAI) {
    this.ai = ai;
  }

  public start(intervalMs = 25000) {
    if (this.isRunning) return;
    this.isRunning = true;

    // Run first pass after 3s warm-up
    setTimeout(() => this.runPredictiveCycle(), 3000);

    this.intervalRef = setInterval(() => {
      this.runPredictiveCycle();
    }, intervalMs);

    console.log("[JARVIS Daemon] Predictive proactive intelligence engine initialized.");
  }

  public stop() {
    if (this.intervalRef) clearInterval(this.intervalRef);
    this.isRunning = false;
  }

  private async runPredictiveCycle() {
    try {
      const biometrics: BiometricTelemetry = dbService.getLatestBiometrics();
      const memUsage = process.memoryUsage();
      const heapUsedMb = Math.round(memUsage.heapUsed / 1024 / 1024);

      // Check biometric stress triggers
      if (biometrics.stressIndex > 65 || biometrics.heartRate > 105) {
        this.emitAlert({
          id: `alert_${Date.now()}`,
          type: 'biometric',
          urgency: 'high',
          message: `Elevated cardiovascular telemetry detected: Heart Rate ${biometrics.heartRate} BPM, Stress Index ${biometrics.stressIndex}%.`,
          actionRecommendation: "Initiate calming atmospheric audio and reduce cognitive task load, Sir.",
          timestamp: new Date().toISOString()
        });
        return;
      }

      // Check system memory thresholds
      if (heapUsedMb > 400) {
        this.emitAlert({
          id: `alert_${Date.now()}`,
          type: 'system',
          urgency: 'medium',
          message: `Heap allocation elevated at ${heapUsedMb} MB.`,
          actionRecommendation: "Triggering proactive garbage collection and cache pruning.",
          timestamp: new Date().toISOString()
        });
        return;
      }

      // Generate situational proactive advisory (nominal state)
      if (this.recentAlerts.length === 0 || Math.random() > 0.6) {
        const proactiveMsg = `All suit and computational matrices are green, Sir. Arc Reactor core at nominal temperature. Ready for high-priority directives.`;
        this.emitAlert({
          id: `alert_${Date.now()}`,
          type: 'tactical',
          urgency: 'low',
          message: proactiveMsg,
          actionRecommendation: "Standing by on full duplex channel.",
          timestamp: new Date().toISOString()
        });
      }
    } catch (err) {
      console.warn("[JARVIS Daemon Notice] Minor cycle skip:", err);
    }
  }

  private emitAlert(alert: ProactiveAlert) {
    this.recentAlerts.unshift(alert);
    if (this.recentAlerts.length > 30) this.recentAlerts.pop();

    redisCache.set('proactive:latest', alert, 3600);
    redisCache.publish('proactive:channel', alert);
  }

  public getRecentAlerts(): ProactiveAlert[] {
    return this.recentAlerts;
  }
}

export const predictiveDaemon = new PredictiveProactiveDaemon();
