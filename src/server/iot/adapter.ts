/**
 * Device control adapters.
 *
 * `iotBridge` was a four-item `Map` seeded with fictional Stark hardware. The
 * UI presented it as "Stark Lab Main Overhead Array" and "Perimeter Armor Vault
 * Blast Door" with no indication that nothing was connected to anything.
 *
 * Devices now go through an adapter, and every adapter must declare whether it
 * is backed by real hardware (`simulated: false`) or not. The UI and the tools
 * surface that flag, so a demo can never masquerade as a working installation.
 */

export interface SmartDevice {
  id: string;
  name: string;
  type: 'lighting' | 'climate' | 'security' | 'power_grid';
  state: Record<string, any>;
  room: string;
  lastUpdated: string;
}

export interface DeviceAdapter {
  /** Stable identifier, surfaced in diagnostics. */
  readonly name: string;
  /** True when the devices are mock data rather than real hardware. */
  readonly simulated: boolean;
  listDevices(): Promise<SmartDevice[]>;
  getDevice(id: string): Promise<SmartDevice | null>;
  updateDeviceState(id: string, state: Record<string, any>): Promise<SmartDevice>;
  /** Applies a named multi-device preset. Returns a human-readable summary. */
  executeProtocol(protocol: string): Promise<{ message: string; devices: SmartDevice[] }>;
}

export const FACILITY_PROTOCOLS = ['tactical_lockdown', 'night_ambient', 'nominal_work'] as const;
export type FacilityProtocol = (typeof FACILITY_PROTOCOLS)[number];

export function isFacilityProtocol(value: string): value is FacilityProtocol {
  return (FACILITY_PROTOCOLS as readonly string[]).includes(value);
}
