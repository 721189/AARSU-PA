import { HomeAssistantAdapter } from './homeAssistantAdapter';
import { SimulatedDeviceAdapter } from './simulatedAdapter';
import type { DeviceAdapter } from './adapter';

/**
 * Chooses the device adapter.
 *
 * Home Assistant when `HOME_ASSISTANT_URL` and `HOME_ASSISTANT_TOKEN` are set,
 * otherwise the simulated facility — which reports `simulated: true` all the way
 * out to the API response so it can never be mistaken for real hardware.
 */
export function createDeviceAdapter(): DeviceAdapter {
  const url = process.env.HOME_ASSISTANT_URL;
  const token = process.env.HOME_ASSISTANT_TOKEN;

  if (url && token) {
    console.log('[iot] Home Assistant adapter enabled.');
    return new HomeAssistantAdapter({ baseUrl: url, token });
  }

  return new SimulatedDeviceAdapter();
}

export * from './adapter';
export { SimulatedDeviceAdapter } from './simulatedAdapter';
export { HomeAssistantAdapter } from './homeAssistantAdapter';
