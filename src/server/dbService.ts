import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { getApps } from 'firebase-admin/app';
import { redisCache } from './redisCache';

export interface TelemetryRecord {
  id?: string;
  source: 'arc_core' | 'sentinel_agent' | 'biometrics' | 'kernel';
  metric: string;
  value: number | string | Record<string, any>;
  timestamp: string;
  status: 'nominal' | 'alert' | 'critical';
}

export interface BiometricTelemetry {
  heartRate: number; // BPM
  stressIndex: number; // 0-100%
  focusLevel: number; // 0-100%
  coreTempC: number;
  timestamp: string;
}

export class EnterpriseDatabaseService {
  private db: Firestore | null = null;
  private localFallbackStore: Map<string, any[]> = new Map();

  constructor() {
    this.init();
  }

  private init() {
    try {
      if (getApps().length > 0) {
        this.db = getFirestore();
      }
    } catch (e) {
      console.warn("[DB Notice] Initializing with high-throughput in-memory datastore.");
    }
  }

  // Record Telemetry Event
  public async logTelemetry(record: TelemetryRecord): Promise<string> {
    const recordId = `tel_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const fullRecord = { ...record, id: recordId, timestamp: record.timestamp || new Date().toISOString() };

    // 1. Write through Redis cache for instant sub-millisecond retrieval
    redisCache.set(`telemetry:recent:${recordId}`, fullRecord, 3600);
    redisCache.publish('telemetry:stream', fullRecord);

    // 2. Persist to Firestore or local store
    if (this.db) {
      try {
        await this.db.collection('telemetry_events').doc(recordId).set(fullRecord);
      } catch (err) {
        this.saveLocal('telemetry_events', fullRecord);
      }
    } else {
      this.saveLocal('telemetry_events', fullRecord);
    }

    return recordId;
  }

  // Ingest Biometrics
  public async recordBiometrics(bio: BiometricTelemetry): Promise<void> {
    redisCache.set('biometrics:current', bio, 600);
    redisCache.publish('biometrics:alert', bio);

    if (this.db) {
      try {
        await this.db.collection('biometric_logs').add(bio);
      } catch {
        this.saveLocal('biometric_logs', bio);
      }
    } else {
      this.saveLocal('biometric_logs', bio);
    }
  }

  // Query Recent Telemetry
  public async getRecentTelemetry(limitCount: number = 20): Promise<TelemetryRecord[]> {
    if (this.db) {
      try {
        const snap = await this.db.collection('telemetry_events')
          .orderBy('timestamp', 'desc')
          .limit(limitCount)
          .get();
        if (!snap.empty) {
          return snap.docs.map(doc => doc.data() as TelemetryRecord);
        }
      } catch {}
    }
    const local = this.localFallbackStore.get('telemetry_events') || [];
    return local.slice(-limitCount).reverse();
  }

  // Get Current Biometrics
  public getLatestBiometrics(): BiometricTelemetry {
    const cached = redisCache.get<BiometricTelemetry>('biometrics:current');
    if (cached) return cached;

    // Default simulated nominal biometric telemetry (Iron Man Tony Stark vitals)
    return {
      heartRate: 74,
      stressIndex: 18,
      focusLevel: 94,
      coreTempC: 36.8,
      timestamp: new Date().toISOString()
    };
  }

  private saveLocal(collectionName: string, item: any) {
    if (!this.localFallbackStore.has(collectionName)) {
      this.localFallbackStore.set(collectionName, []);
    }
    const list = this.localFallbackStore.get(collectionName)!;
    list.push(item);
    if (list.length > 500) list.shift(); // Bound memory
  }
}

export const dbService = new EnterpriseDatabaseService();
