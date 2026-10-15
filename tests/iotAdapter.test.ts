import { describe, it, expect, vi } from 'vitest';
import { HomeAssistantAdapter } from '../src/server/iot/homeAssistantAdapter';
import { SimulatedDeviceAdapter } from '../src/server/iot/simulatedAdapter';
import { createDeviceAdapter } from '../src/server/iot';

/** Builds a fake fetch that answers Home Assistant REST calls. */
function fakeHa(states: any[], serviceCalls: any[] = []) {
  return vi.fn(async (url: string, init: RequestInit = {}) => {
    const path = String(url).replace('http://ha.local', '');

    if (path === '/api/states' && (!init.method || init.method === 'GET')) {
      return new Response(JSON.stringify(states), { status: 200 });
    }
    if (path.startsWith('/api/states/') && (!init.method || init.method === 'GET')) {
      const id = decodeURIComponent(path.replace('/api/states/', ''));
      const found = states.find((s) => s.entity_id === id);
      return found
        ? new Response(JSON.stringify(found), { status: 200 })
        : new Response('not found', { status: 404 });
    }
    if (path.startsWith('/api/services/')) {
      serviceCalls.push({ path, body: JSON.parse(String(init.body ?? '{}')) });
      return new Response(null, { status: 200 });
    }
    return new Response('unexpected', { status: 500 });
  }) as unknown as typeof fetch;
}

const entities = [
  {
    entity_id: 'light.lab',
    state: 'on',
    attributes: { friendly_name: 'Lab Overhead', brightness: 200, area_name: 'Workshop' },
    last_updated: '2026-01-01T00:00:00Z',
  },
  {
    entity_id: 'lock.vault',
    state: 'locked',
    attributes: { friendly_name: 'Vault Door', area_name: 'Armory' },
    last_updated: '2026-01-01T00:00:00Z',
  },
  {
    entity_id: 'sensor.temperature',
    state: '21.5',
    attributes: { friendly_name: 'Temperature' },
    last_updated: '2026-01-01T00:00:00Z',
  },
];

describe('SimulatedDeviceAdapter', () => {
  it('declares itself simulated', () => {
    const adapter = new SimulatedDeviceAdapter();
    expect(adapter.simulated).toBe(true);
    expect(adapter.name).toBe('simulated-facility');
  });

  it('lists the seeded devices', async () => {
    const devices = await new SimulatedDeviceAdapter().listDevices();
    expect(devices.length).toBeGreaterThan(0);
  });
});

describe('createDeviceAdapter', () => {
  it('falls back to the simulated adapter without configuration', () => {
    const original = { url: process.env.HOME_ASSISTANT_URL, token: process.env.HOME_ASSISTANT_TOKEN };
    delete process.env.HOME_ASSISTANT_URL;
    delete process.env.HOME_ASSISTANT_TOKEN;

    const adapter = createDeviceAdapter();
    expect(adapter.simulated).toBe(true);
    expect(adapter.name).toBe('simulated-facility');

    if (original.url !== undefined) process.env.HOME_ASSISTANT_URL = original.url;
    if (original.token !== undefined) process.env.HOME_ASSISTANT_TOKEN = original.token;
  });

  it('selects Home Assistant when configured', () => {
    process.env.HOME_ASSISTANT_URL = 'http://ha.local';
    process.env.HOME_ASSISTANT_TOKEN = 'token';

    const adapter = createDeviceAdapter();
    expect(adapter.name).toBe('home-assistant');
    expect(adapter.simulated).toBe(false);

    delete process.env.HOME_ASSISTANT_URL;
    delete process.env.HOME_ASSISTANT_TOKEN;
  });
});

describe('HomeAssistantAdapter', () => {
  const build = (states = entities, calls: any[] = []) =>
    new HomeAssistantAdapter({
      baseUrl: 'http://ha.local',
      token: 'token',
      fetchImpl: fakeHa(states, calls),
    });

  it('declares itself real, not simulated', () => {
    expect(build().simulated).toBe(false);
  });

  it('maps only supported domains to devices', async () => {
    const devices = await build().listDevices();
    expect(devices.map((d) => d.id).sort()).toEqual(['light.lab', 'lock.vault']);
  });

  it('maps Home Assistant state onto the device model', async () => {
    const light = (await build().listDevices()).find((d) => d.id === 'light.lab')!;
    expect(light.type).toBe('lighting');
    expect(light.name).toBe('Lab Overhead');
    expect(light.state.power).toBe(true);
    expect(light.state.brightness).toBe(200);
    expect(light.room).toBe('Workshop');
  });

  it('sends the bearer token', async () => {
    const fetchImpl = fakeHa(entities);
    await new HomeAssistantAdapter({ baseUrl: 'http://ha.local', token: 'secret', fetchImpl }).listDevices();

    const init = (fetchImpl as any).mock.calls[0][1];
    expect(init.headers.Authorization).toBe('Bearer secret');
  });

  it('calls the right service for a light', async () => {
    const calls: any[] = [];
    await build(entities, calls).updateDeviceState('light.lab', { brightness: 60 });
    expect(calls[0].path).toBe('/api/services/light/turn_on');
    expect(calls[0].body.entity_id).toBe('light.lab');
  });

  it('turns a light off rather than on', async () => {
    const calls: any[] = [];
    await build(entities, calls).updateDeviceState('light.lab', { power: false });
    expect(calls[0].path).toBe('/api/services/light/turn_off');
  });

  it('locks and unlocks correctly', async () => {
    const calls: any[] = [];
    await build(entities, calls).updateDeviceState('lock.vault', { locked: true });
    expect(calls[0].path).toBe('/api/services/lock/lock');

    const unlockCalls: any[] = [];
    await build(entities, unlockCalls).updateDeviceState('lock.vault', { locked: false });
    expect(unlockCalls[0].path).toBe('/api/services/lock/unlock');
  });

  it('returns null for an unknown entity', async () => {
    expect(await build().getDevice('light.nope')).toBeNull();
  });

  it('raises on a non-ok response', async () => {
    const failing = new HomeAssistantAdapter({
      baseUrl: 'http://ha.local',
      token: 'token',
      fetchImpl: (async () => new Response('boom', { status: 500 })) as unknown as typeof fetch,
    });
    await expect(failing.listDevices()).rejects.toThrow(/500/);
  });

  it('applies a protocol across the matching devices', async () => {
    const calls: any[] = [];
    const result = await build(entities, calls).executeProtocol('tactical_lockdown');

    expect(calls.some((c) => c.path === '/api/services/light/turn_on')).toBe(true);
    expect(calls.some((c) => c.path === '/api/services/lock/lock')).toBe(true);
    expect(result.message).toContain('Tactical lockdown');
  });

  it('does not lock devices for the night protocol', async () => {
    const calls: any[] = [];
    await build(entities, calls).executeProtocol('night_ambient');
    expect(calls.some((c) => c.path.startsWith('/api/services/lock/'))).toBe(false);
  });
});
