import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { OwnWritesLog } from '../src/own-writes.ts';
import { buildReport, type NightResult } from '../src/report.ts';
import { cfg } from './helpers.ts';

const empty: NightResult = { started: [], noSlot: [], refused: [], failed: [], questions: [] };

describe('morning report', () => {
  it('stays silent on a quiet night unless sendWhenEmpty', () => {
    expect(buildReport(empty, cfg())).toBeNull();
    expect(buildReport(empty, cfg({ report: { sendWhenEmpty: true } }))).toBe('Nothing started overnight.');
  });

  it('lists sections in the configured order and skips empty ones', () => {
    const r = {
      ...empty,
      started: [{ key: 'A', made: 'draft PR', url: 'fake://1' }],
      failed: [{ key: 'B', error: 'timeout' }],
    };
    expect(buildReport(r, cfg())).toBe('Started overnight\n- A: draft PR fake://1\n\nFailed\n- B: timeout');
    expect(buildReport(r, cfg({ report: { sections: ['failed'] } }))).toBe('Failed\n- B: timeout');
  });
});

describe('own-writes log', () => {
  it('appends and reads back keys, kinds and times only', () => {
    const log = new OwnWritesLog(join(mkdtempSync(join(tmpdir(), 'pc-')), 'sub', 'w.jsonl'));
    expect(log.all()).toEqual([]);
    log.record({ key: 'A', kind: 'comment', at: '2026-11-04T02:00:00Z', ...{ body: 'secret' } } as never);
    expect(log.all()).toEqual([{ key: 'A', kind: 'comment', at: '2026-11-04T02:00:00Z' }]);
  });
});
