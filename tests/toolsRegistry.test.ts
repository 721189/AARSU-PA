import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { ToolRegistry, resolveSafePath } from '../src/server/tools/registry';

const ROOT = '/workspace';

describe('resolveSafePath', () => {
  it('resolves a simple relative path inside the sandbox', () => {
    expect(resolveSafePath(ROOT, 'src/index.ts')).toBe(path.resolve(ROOT, 'src/index.ts'));
  });

  it('resolves the sandbox root itself', () => {
    expect(resolveSafePath(ROOT, '.')).toBe(path.resolve(ROOT));
  });

  it('rejects a parent-directory escape', () => {
    expect(resolveSafePath(ROOT, '../etc/passwd')).toBeNull();
    expect(resolveSafePath(ROOT, 'src/../../etc/passwd')).toBeNull();
  });

  it('rejects an absolute path outside the sandbox', () => {
    expect(resolveSafePath(ROOT, '/etc/passwd')).toBeNull();
  });

  it('rejects a sibling directory that merely shares a prefix', () => {
    // "/workspace-evil" must not be treated as inside "/workspace".
    expect(resolveSafePath(ROOT, '../workspace-evil/secrets')).toBeNull();
  });

  it('rejects null bytes and empty input', () => {
    expect(resolveSafePath(ROOT, 'a\0b')).toBeNull();
    expect(resolveSafePath(ROOT, '')).toBeNull();
  });

  it('allows nested paths', () => {
    expect(resolveSafePath(ROOT, 'a/b/c.txt')).toBe(path.resolve(ROOT, 'a/b/c.txt'));
  });
});

describe('ToolRegistry', () => {
  const registry = new ToolRegistry({ ai: null, workspaceRoot: ROOT });

  it('exposes the expected tools', () => {
    const names = registry.list().map((t) => t.name);
    expect(names).toContain('get_system_stats');
    expect(names).toContain('list_files');
    expect(names).toContain('read_file');
    expect(names).toContain('write_file');
    expect(names).toContain('web_search');
    expect(names).toContain('run_code');
    expect(names).toContain('control_device');
  });

  it('marks exactly the mutating tools as destructive', () => {
    expect(registry.destructiveToolNames().sort()).toEqual(['control_device', 'write_file']);
  });

  it('builds Gemini-shaped declarations with required fields', () => {
    const declarations = registry.toDeclarations() as any[];
    const listFiles = declarations.find((d) => d.name === 'list_files');

    expect(listFiles.parameters.type).toBe('OBJECT');
    expect(listFiles.parameters.properties.path.type).toBe('STRING');
    expect(listFiles.parameters.required).toEqual(['path']);
  });

  it('omits the required array when no parameter is required', () => {
    const declarations = registry.toDeclarations() as any[];
    const stats = declarations.find((d) => d.name === 'get_system_stats');
    expect(stats.parameters.required).toBeUndefined();
  });

  it('returns undefined for an unknown tool', () => {
    expect(registry.get('nope')).toBeUndefined();
  });

  it('refuses to read outside the sandbox', async () => {
    const result = await registry
      .get('read_file')!
      .execute({ path: '../../etc/passwd' }, { workspaceRoot: ROOT, dryRun: false });
    expect(result.ok).toBe(false);
    expect(result.summary).toContain('sandbox');
  });

  it('refuses to write outside the sandbox', async () => {
    const result = await registry
      .get('write_file')!
      .execute({ path: '../escape.txt', content: 'x' }, { workspaceRoot: ROOT, dryRun: false });
    expect(result.ok).toBe(false);
  });

  it('reports honest failure when Gemini-backed tools are unconfigured', async () => {
    const search = await registry.get('web_search')!.execute({ query: 'x' }, { workspaceRoot: ROOT, dryRun: false });
    expect(search.ok).toBe(false);
    expect(search.summary).toContain('not configured');

    const code = await registry.get('run_code')!.execute({ prompt: '1+1' }, { workspaceRoot: ROOT, dryRun: false });
    expect(code.ok).toBe(false);
    expect(code.summary).toContain('not configured');
  });

  it('returns real host telemetry from get_system_stats', async () => {
    const result = await registry.get('get_system_stats')!.execute({}, { workspaceRoot: ROOT, dryRun: false });
    expect(result.ok).toBe(true);
    expect((result.data as any).cpuCount).toBeGreaterThan(0);
    expect((result.data as any).totalMemoryMb).toBeGreaterThan(0);
  });

  it('dry-run writes describe the action without performing it', async () => {
    const result = await registry
      .get('write_file')!
      .execute({ path: 'tmp-dry-run.txt', content: 'hello' }, { workspaceRoot: ROOT, dryRun: true });
    expect(result.ok).toBe(true);
    expect(result.summary).toContain('Dry run');
  });

  it('lists real files from the workspace', async () => {
    const result = await registry.get('list_files')!.execute({ path: '.' }, { workspaceRoot: ROOT, dryRun: false });
    expect(result.ok).toBe(true);
    expect(Array.isArray(result.data)).toBe(true);
  });
});
