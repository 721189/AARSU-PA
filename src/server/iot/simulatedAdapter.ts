import { iotBridge } from '../iotBridge';
import type { DeviceAdapter, SmartDevice } from './adapter';

/**
 * Wraps the original in-process device map.
 *
 * Explicitly marked `simulated: true` so every caller can tell the difference.
 */
export class SimulatedDeviceAdapter implements DeviceAdapter {
  readonly name = 'simulated-facility';
  readonly simulated = true;

  async listDevices(): Promise<SmartDevice[]> {
    return iotBridge.getAllDevices();
  }

  async getDevice(id: string): Promise<SmartDevice | null> {
    return iotBridge.getDevice(id) ?? null;
  }

  async updateDeviceState(id: string, state: Record<string, any>): Promise<SmartDevice> {
    return iotBridge.updateDeviceState(id, state);
  }

  async executeProtocol(protocol: string): Promise<{ message: string; devices: SmartDevice[] }> {
    const message = iotBridge.executeFacilityProtocol(
      (['tactical_lockdown', 'night_ambient', 'nominal_work'] as const).includes(protocol as any)
        ? (protocol as any)
        : 'nominal_work'
    );
    return { message, devices: iotBridge.getAllDevices() };
  }
}
