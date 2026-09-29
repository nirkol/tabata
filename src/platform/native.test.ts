import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Simulated native side: a file holding the store as JSON.
let file = '{}';
const calls: string[] = [];
vi.mock('@tauri-apps/api/core', () => ({
  invoke: async (cmd: string, args?: { data?: string; on?: boolean }) => {
    calls.push(cmd);
    if (cmd === 'load_store') return file;
    if (cmd === 'save_store') file = args!.data!;
    return undefined;
  },
}));

const { createNativeStore, isNative, setNativeKeepAwake } = await import('./native');
const { LocalAppStorage } = await import('../storage/storage');

describe('Mac app storage (JSON file)', () => {
  beforeEach(() => {
    file = '{}';
    calls.length = 0;
    (globalThis as Record<string, unknown>).window = { __TAURI_INTERNALS__: {} };
  });
  afterEach(() => {
    delete (globalThis as Record<string, unknown>).window;
  });

  it('detects the Mac app', () => {
    expect(isNative()).toBe(true);
  });

  it('creates the sample routine on first launch and saves it to the file', async () => {
    const storage = new LocalAppStorage(await createNativeStore());
    expect(storage.loadRoutines().map((r) => r.name)).toEqual(['Classic Tabata']);
    await vi.waitFor(() => expect(calls).toContain('save_store'));
    expect(JSON.parse(file)['tabata.v1.routines']).toBeDefined();
  });

  it('reads back what was saved (survives an app restart)', async () => {
    const first = new LocalAppStorage(await createNativeStore());
    first.saveSettings({ ...first.loadSettings(), volume: 0.25, workStyle: 'high' });
    await vi.waitFor(() => expect(JSON.parse(file)['tabata.v1.settings']).toBeDefined());
    const second = new LocalAppStorage(await createNativeStore());
    expect(second.loadSettings()).toMatchObject({ volume: 0.25, workStyle: 'high' });
  });

  it('starts fresh if the file is corrupt', async () => {
    file = 'not json';
    const store = await createNativeStore();
    expect(store.getItem('tabata.v1.routines')).toBeNull();
  });

  it('asks the native side to keep the display awake', async () => {
    expect(await setNativeKeepAwake(true)).toBe(true);
    expect(calls).toContain('set_keep_awake');
  });
});
