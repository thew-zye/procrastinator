import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { ConfigError, DEFAULTS, isDryRun, loadConfig, resolveConfig } from '../src/config.ts';

describe('config', () => {
  it('the example file holds exactly the defaults', () => {
    expect(loadConfig('procrastinator.config.example.yaml')).toEqual(DEFAULTS);
  });

  it('the example file names every setting, so the README and example cannot drift', () => {
    const keys = (o: object, p = ''): string[] =>
      Object.entries(o).flatMap(([k, v]) =>
        v && typeof v === 'object' && !Array.isArray(v) ? keys(v, `${p}${k}.`) : [`${p}${k}`],
      );
    const example = parse(readFileSync('procrastinator.config.example.yaml', 'utf8'));
    expect(keys(example).sort()).toEqual(keys(DEFAULTS).sort());
    const readme = readFileSync('README.md', 'utf8');
    for (const k of keys(DEFAULTS).filter((k) => !k.startsWith('jobs.') && !k.startsWith('labels.')))
      expect(readme, `README is missing ${k}`).toContain(`\`${k}\``);
  });

  it('merges partial input over defaults', () => {
    const c = resolveConfig({ activeCap: 2, leadDays: { big: 10 } });
    expect(c.activeCap).toBe(2);
    expect(c.leadDays).toEqual({ big: 10, small: 2 });
  });

  it('rejects unknown keys and bad values', () => {
    try {
      resolveConfig({ activCap: 3, stallDays: 0, weeklyPick: { day: 'funday', time: '9am' }, ranking: ['due', 'due'] });
      expect.unreachable();
    } catch (e) {
      const p = (e as ConfigError).problems.join('\n');
      expect(p).toContain('activCap is not a known setting');
      expect(p).toContain('stallDays');
      expect(p).toContain('weeklyPick.day');
      expect(p).toContain('weeklyPick.time');
      expect(p).toContain('ranking has a repeated key');
    }
  });

  it('requires a branch prefix ending in a slash and a pattern that starts with it', () => {
    expect(() => resolveConfig({ codeHost: { branchPrefix: '' } })).toThrow(ConfigError);
    expect(() => resolveConfig({ codeHost: { branchPattern: '{key}-{slug}' } })).toThrow(/branchPattern/);
  });

  it('requires an owner id for real chat adapters', () => {
    expect(() => resolveConfig({ adapters: { chat: 'slack' } })).toThrow(/acceptRepliesFrom/);
    expect(() => resolveConfig({ adapters: { chat: 'slack' }, weeklyPick: { acceptRepliesFrom: 'U1' } })).not.toThrow();
  });

  it('rejects a bad time zone', () => {
    expect(() => resolveConfig({ timezone: 'Mars/Base' })).toThrow(/timezone/);
  });

  it('per-job dryRun overrides the top level', () => {
    const c = resolveConfig({ dryRun: true, jobs: { planDates: { enabled: true, dryRun: false } } });
    expect(isDryRun(c, 'planDates')).toBe(false);
    expect(isDryRun(c, 'startWork')).toBe(true);
  });
});
