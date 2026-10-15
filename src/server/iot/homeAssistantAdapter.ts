import type { DeviceAdapter, SmartDevice } from './adapter';

/**
 * Home Assistant adapter — real hardware.
 *
 * Talks to the Home Assistant REST API. Enabled by setting:
 *   HOME_ASSISTANT_URL   e.g. https://homeassistant.local:8123
 *   HOME_ASSISTANT_TOKEN a long-lived access token
 *
 * Maps Home Assistant entities onto the internal device model. Only the domains
 * the UI understands are exposed (light, climate, lock, switch).
 */
export interface HomeAssistantOptions {
  baseUrl: string;
  token: string;
  /** Injected for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

const DOMAIN_TO_TYPE: Record<string, SmartDevice['type']> = {
  light: 'lighting',
  switch: 'power_grid',
  climate: 'climate',
  lock: 'security',
};

export class HomeAssistantAdapter implements DeviceAdapter {
  readonly name = 'home-assistant';
  readonly simulated = false;

  private readonly baseUrl: string;
  private readonly token: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: HomeAssistantOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.token = options.token;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 8000;
  }

  private async request(path: string, init: RequestInit = {}): Promise<any> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
          ...(init.headers ?? {}),
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Home Assistant responded ${response.status} for ${path}`);
      }

      // Home Assistant normally returns JSON, but a 204 or a proxied empty body
      // must not blow up. Read the text first and only parse when present.
      const body = await response.text();
      if (!body) return null;
      try {
        return JSON.parse(body);
      } catch {
        return body;
      }
    } finally {
      clearTimeout(timer);
    }
  }

  async listDevices(): Promise<SmartDevice[]> {
    const states = (await this.request('/api/states')) as any[];
    if (!Array.isArray(states)) return [];

    return states
      .filter((entity) => DOMAIN_TO_TYPE[String(entity?.entity_id ?? '').split('.')[0]])
      .map((entity) => this.toDevice(entity));
  }

  async getDevice(id: string): Promise<SmartDevice | null> {
    try {
      const entity = await this.request(`/api/states/${encodeURIComponent(id)}`);
      return entity ? this.toDevice(entity) : null;
    } catch {
      return null;
    }
  }

  async updateDeviceState(id: string, state: Record<string, any>): Promise<SmartDevice> {
    const domain = id.split('.')[0];
    const service = this.serviceFor(domain, state);

    await this.request(`/api/services/${domain}/${service}`, {
      method: 'POST',
      body: JSON.stringify({ entity_id: id, ...state }),
    });

    const updated = await this.getDevice(id);
    if (!updated) throw new Error(`Entity ${id} disappeared after the update.`);
    return updated;
  }

  async executeProtocol(protocol: string): Promise<{ message: string; devices: SmartDevice[] }> {
    const devices = await this.listDevices();
    const lights = devices.filter((device) => device.type === 'lighting');

    const targetBrightness = protocol === 'tactical_lockdown' ? 255 : protocol === 'night_ambient' ? 60 : 216;

    for (const light of lights) {
      await this.updateDeviceState(light.id, { brightness: targetBrightness });
    }

    if (protocol === 'tactical_lockdown') {
      const locks = devices.filter((device) => device.type === 'security');
      for (const lock of locks) {
        await this.updateDeviceState(lock.id, { lock: true }).catch(() => {});
      }
    }

    const label =
      protocol === 'tactical_lockdown'
        ? 'Tactical lockdown applied.'
        : protocol === 'night_ambient'
          ? 'Night ambient lighting applied.'
          : 'Nominal lighting restored.';

    return { message: `${label} (${lights.length} light(s) updated via Home Assistant)`, devices: await this.listDevices() };
  }

  private serviceFor(domain: string, state: Record<string, any>): string {
    if (domain === 'light') return state.power === false ? 'turn_off' : 'turn_on';
    if (domain === 'switch') return state.power === false ? 'turn_off' : 'turn_on';
    if (domain === 'lock') return state.locked === false ? 'unlock' : 'lock';
    return 'set';
  }

  private toDevice(entity: any): SmartDevice {
    const entityId = String(entity.entity_id ?? '');
    const domain = entityId.split('.')[0];
    return {
      id: entityId,
      name: String(entity.attributes?.friendly_name ?? entityId),
      type: DOMAIN_TO_TYPE[domain] ?? 'power_grid',
      state: {
        power: entity.state === 'on',
        rawState: entity.state,
        ...(entity.attributes?.brightness !== undefined ? { brightness: entity.attributes.brightness } : {}),
      },
      room: String(entity.attributes?.area_name ?? entity.attributes?.room ?? 'Home'),
      lastUpdated: String(entity.last_updated ?? new Date().toISOString()),
    };
  }
}
