import { redisCache } from './redisCache';

export interface SmartDevice {
  id: string;
  name: string;
  type: 'lighting' | 'climate' | 'security' | 'power_grid';
  state: Record<string, any>;
  room: string;
  lastUpdated: string;
}

export class SmartFacilityIoTBridge {
  private devices: Map<string, SmartDevice> = new Map();

  constructor() {
    this.seedDefaultFacilityDevices();
  }

  private seedDefaultFacilityDevices() {
    const defaultDevices: SmartDevice[] = [
      {
        id: 'dev_light_lab',
        name: 'Stark Lab Main Overhead Array',
        type: 'lighting',
        room: 'Workshop',
        state: { power: true, brightness: 85, colorTemp: 'tactical_cyan', rgb: '#06b6d4' },
        lastUpdated: new Date().toISOString()
      },
      {
        id: 'dev_hvac_core',
        name: 'Workshop Environmental Climate Control',
        type: 'climate',
        room: 'Workshop',
        state: { power: true, targetTempC: 21.5, currentTempC: 22.0, fanSpeed: 'adaptive_high', filtration: 'hepa_active' },
        lastUpdated: new Date().toISOString()
      },
      {
        id: 'dev_door_vault',
        name: 'Perimeter Armor Vault Blast Door',
        type: 'security',
        room: 'Armory',
        state: { locked: true, magneticSeal: 'engaged', authorizationLevel: 'Alpha_1' },
        lastUpdated: new Date().toISOString()
      },
      {
        id: 'dev_power_grid',
        name: 'Auxiliary Arc Power Routing Grid',
        type: 'power_grid',
        room: 'Power Core',
        state: { mainBus: 'arc_reactor_primary', backupCapacitor: 98, rerouteStatus: 'standby' },
        lastUpdated: new Date().toISOString()
      }
    ];

    defaultDevices.forEach(d => this.devices.set(d.id, d));
  }

  public getAllDevices(): SmartDevice[] {
    return Array.from(this.devices.values());
  }

  public getDevice(id: string): SmartDevice | undefined {
    return this.devices.get(id);
  }

  public updateDeviceState(id: string, newState: Record<string, any>): SmartDevice {
    const dev = this.devices.get(id);
    if (!dev) throw new Error(`Device ${id} not found in facility bridge`);

    dev.state = { ...dev.state, ...newState };
    dev.lastUpdated = new Date().toISOString();
    this.devices.set(id, dev);

    // Publish state change to Redis Pub/Sub event bus
    redisCache.set(`iot:device:${id}`, dev, 3600);
    redisCache.publish('iot:events', { event: 'device_state_updated', device: dev });

    return dev;
  }

  public executeFacilityProtocol(protocolName: 'tactical_lockdown' | 'night_ambient' | 'nominal_work'): string {
    if (protocolName === 'tactical_lockdown') {
      this.updateDeviceState('dev_light_lab', { brightness: 100, colorTemp: 'alert_amber', rgb: '#f59e0b' });
      this.updateDeviceState('dev_door_vault', { locked: true, magneticSeal: 'maximum_compression' });
      this.updateDeviceState('dev_power_grid', { mainBus: 'arc_reactor_defense_matrix' });
      return "Tactical lockdown protocol initiated. Vault blast doors sealed, defensive power routed.";
    } else if (protocolName === 'night_ambient') {
      this.updateDeviceState('dev_light_lab', { brightness: 25, colorTemp: 'warm_soft', rgb: '#38bdf8' });
      this.updateDeviceState('dev_hvac_core', { targetTempC: 20.0, fanSpeed: 'silent_night' });
      return "Atmospheric ambient lighting dimmed. Night climate regulation engaged.";
    } else {
      this.updateDeviceState('dev_light_lab', { brightness: 85, colorTemp: 'tactical_cyan', rgb: '#06b6d4' });
      this.updateDeviceState('dev_door_vault', { locked: false, magneticSeal: 'standby' });
      return "Nominal workshop parameters restored, Sir.";
    }
  }
}

export const iotBridge = new SmartFacilityIoTBridge();
