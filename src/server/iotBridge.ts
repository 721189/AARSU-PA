import { redisCache } from "./redisCache";

export interface SmartDevice {
  id: string;
  name: string;
  type: "lighting" | "climate" | "security" | "power_grid";
  state: Record<string, any>;
  room: string;
  lastUpdated: string;
  simulated: true;
}

const DEVICE_IDS = new Set(["dev_light_lab", "dev_hvac_core", "dev_door_vault", "dev_power_grid"]);
const ALLOWED_STATE_KEYS = new Set([
  "power", "brightness", "colorTemp", "rgb", "targetTempC", "currentTempC",
  "fanSpeed", "filtration", "locked", "magneticSeal", "mainBus",
  "backupCapacitor", "rerouteStatus"
]);

export class SmartFacilityIoTBridge {
  private devices = new Map<string, SmartDevice>();

  constructor(private readonly ownerUid: string) {
    if (!ownerUid) throw new Error("An authenticated user is required.");
    this.seedDemoDevices();
  }

  private seedDemoDevices() {
    const now = new Date().toISOString();
    const devices: SmartDevice[] = [
      {
        id: "dev_light_lab",
        name: "Demo workshop lighting",
        type: "lighting",
        room: "Demo workshop",
        state: { power: true, brightness: 85, colorTemp: "tactical_cyan", rgb: "#06b6d4" },
        lastUpdated: now,
        simulated: true
      },
      {
        id: "dev_hvac_core",
        name: "Demo climate controller",
        type: "climate",
        room: "Demo workshop",
        state: { power: true, targetTempC: 21.5, currentTempC: 22, fanSpeed: "adaptive" },
        lastUpdated: now,
        simulated: true
      },
      {
        id: "dev_door_vault",
        name: "Demo security lock",
        type: "security",
        room: "Demo armory",
        state: { locked: true, magneticSeal: "engaged" },
        lastUpdated: now,
        simulated: true
      },
      {
        id: "dev_power_grid",
        name: "Demo power routing",
        type: "power_grid",
        room: "Demo power core",
        state: { mainBus: "primary", backupCapacitor: 98, rerouteStatus: "standby" },
        lastUpdated: now,
        simulated: true
      }
    ];
    devices.forEach(device => this.devices.set(device.id, device));
  }

  public getAllDevices(): SmartDevice[] {
    return Array.from(this.devices.values()).map(device => ({ ...device, state: { ...device.state } }));
  }

  public updateDeviceState(id: string, newState: Record<string, any>): SmartDevice {
    if (!DEVICE_IDS.has(id)) throw new Error("Unknown demo device.");
    if (!newState || typeof newState !== "object" || Array.isArray(newState)) {
      throw new Error("Device state must be an object.");
    }
    const entries = Object.entries(newState);
    if (entries.length === 0 || entries.length > 12 || entries.some(([key]) => !ALLOWED_STATE_KEYS.has(key))) {
      throw new Error("The requested demo device state contains unsupported fields.");
    }

    const device = this.devices.get(id);
    if (!device) throw new Error("Device not found in this user's demo facility.");
    device.state = { ...device.state, ...newState };
    device.lastUpdated = new Date().toISOString();
    this.devices.set(id, device);

    const cacheKey = "iot:" + this.ownerUid + ":device:" + id;
    redisCache.set(cacheKey, device, 3600);
    redisCache.publish("iot:" + this.ownerUid + ":events", {
      event: "demo_device_state_updated",
      device
    });
    return { ...device, state: { ...device.state } };
  }

  public executeFacilityProtocol(protocolName: string): string {
    if (protocolName === "tactical_lockdown") {
      this.updateDeviceState("dev_light_lab", { brightness: 100, colorTemp: "alert_amber", rgb: "#f59e0b" });
      this.updateDeviceState("dev_door_vault", { locked: true, magneticSeal: "maximum_compression" });
      this.updateDeviceState("dev_power_grid", { mainBus: "defense_matrix" });
      return "Simulated lockdown applied to demo devices. No physical hardware was controlled.";
    }
    if (protocolName === "night_ambient") {
      this.updateDeviceState("dev_light_lab", { brightness: 25, colorTemp: "warm_soft", rgb: "#38bdf8" });
      this.updateDeviceState("dev_hvac_core", { targetTempC: 20, fanSpeed: "silent_night" });
      return "Simulated night ambience applied to demo devices. No physical hardware was controlled.";
    }
    if (protocolName === "nominal_work") {
      this.updateDeviceState("dev_light_lab", { brightness: 85, colorTemp: "tactical_cyan", rgb: "#06b6d4" });
      this.updateDeviceState("dev_door_vault", { locked: false, magneticSeal: "standby" });
      return "Simulated demo devices restored to nominal state. No physical hardware was controlled.";
    }
    throw new Error("Unknown demo facility protocol.");
  }
}

const userBridges = new Map<string, SmartFacilityIoTBridge>();

export function getIoTBridgeForUser(uid: string): SmartFacilityIoTBridge {
  if (!uid) throw new Error("Authenticated user is required.");
  let bridge = userBridges.get(uid);
  if (!bridge) {
    bridge = new SmartFacilityIoTBridge(uid);
    userBridges.set(uid, bridge);
  }
  return bridge;
}
