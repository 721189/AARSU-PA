import { getFirestore, Firestore } from "firebase-admin/firestore";
import { getApps } from "firebase-admin/app";

export interface TelemetryRecord {
  id?: string;
  source: "arc_core" | "sentinel_agent" | "biometrics" | "kernel";
  metric: string;
  value: number | string | Record<string, any>;
  timestamp: string;
  status: "nominal" | "alert" | "critical";
}

export interface BiometricTelemetry {
  heartRate: number;
  stressIndex: number;
  focusLevel: number;
  coreTempC: number;
  timestamp: string;
  source: "simulated" | "user-reported";
}

export class EnterpriseDatabaseService {
  private db: Firestore | null = null;
  private localTelemetry = new Map<string, TelemetryRecord[]>();
  private localBiometrics = new Map<string, BiometricTelemetry>();

  constructor() {
    this.init();
  }

  private init() {
    try {
      if (getApps().length > 0) this.db = getFirestore();
    } catch (error) {
      console.warn("[DB] Firestore is unavailable; telemetry will use isolated per-user process memory.", error);
    }
  }

  private userRef(uid: string) {
    if (!uid) throw new Error("Authenticated user is required.");
    if (!this.db) throw new Error("Firestore is not configured.");
    return this.db.collection("users").doc(uid);
  }

  public async logTelemetry(uid: string, record: TelemetryRecord): Promise<string> {
    if (!uid) throw new Error("Authenticated user is required.");
    const recordId = "tel_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7);
    const fullRecord = {
      ...record,
      id: recordId,
      timestamp: record.timestamp || new Date().toISOString()
    };

    try {
      await this.userRef(uid).collection("telemetry_events").doc(recordId).set(fullRecord);
    } catch (error) {
      const list = this.localTelemetry.get(uid) || [];
      list.push(fullRecord);
      this.localTelemetry.set(uid, list.slice(-500));
      console.warn("[DB] Telemetry persistence failed; using per-user process memory.", error);
    }
    return recordId;
  }

  public async recordBiometrics(uid: string, bio: BiometricTelemetry): Promise<void> {
    if (!uid) throw new Error("Authenticated user is required.");
    const record: BiometricTelemetry = { ...bio, source: "user-reported" };
    this.localBiometrics.set(uid, record);

    try {
      const user = this.userRef(uid);
      await user.collection("assistant_telemetry").doc("biometrics").set(record);
      await user.collection("biometric_logs").add(record);
    } catch (error) {
      console.warn("[DB] Biometric persistence failed; data remains isolated in this process.", error);
    }
  }

  public async getRecentTelemetry(uid: string, limitCount = 20): Promise<TelemetryRecord[]> {
    if (!uid) throw new Error("Authenticated user is required.");
    const safeLimit = Math.min(100, Math.max(1, Math.trunc(limitCount) || 20));
    try {
      const snapshot = await this.userRef(uid).collection("telemetry_events")
        .orderBy("timestamp", "desc")
        .limit(safeLimit)
        .get();
      if (!snapshot.empty) return snapshot.docs.map(doc => doc.data() as TelemetryRecord);
    } catch (error) {
      console.warn("[DB] Could not read persisted telemetry for this user.", error);
    }
    return (this.localTelemetry.get(uid) || []).slice(-safeLimit).reverse();
  }

  public async getLatestBiometrics(uid: string): Promise<BiometricTelemetry> {
    if (!uid) throw new Error("Authenticated user is required.");
    try {
      const snapshot = await this.userRef(uid).collection("assistant_telemetry").doc("biometrics").get();
      if (snapshot.exists) return snapshot.data() as BiometricTelemetry;
    } catch (error) {
      console.warn("[DB] Could not read persisted biometric telemetry for this user.", error);
    }

    return this.localBiometrics.get(uid) || {
      heartRate: 74,
      stressIndex: 18,
      focusLevel: 94,
      coreTempC: 36.8,
      timestamp: new Date().toISOString(),
      source: "simulated"
    };
  }
}

export const dbService = new EnterpriseDatabaseService();
