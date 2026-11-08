import { describe, expect, it } from 'vitest';
import { buildPickMessage, isFromOwner, isPickDay, openSlots, parsePickReply, weeklyFallback } from '../src/pick.ts';
import { cfg, item } from './helpers.ts';

const c = cfg();
const choices = ['A', 'B', 'C', 'D', 'E'];

describe('weekly pick', () => {
  it('goes out on the configured day', () => {
    expect(isPickDay('2026-11-09', c)).toBe(true);
    expect(isPickDay('2026-11-10', c)).toBe(false);
    expect(isPickDay('2026-11-10', cfg({ weeklyPick: { day: 'tuesday' } }))).toBe(true);
  });

  it('lists the top 5 parked items, numbered', () => {
    const items = [
      item('X', { state: 'active' }),
      ...Array.from({ length: 7 }, (_, n) => item(`P${n}`, { created: `2026-10-1${n}` })),
    ];
    const m = buildPickMessage(items, c);
    expect(m.choices).toEqual(['P0', 'P1', 'P2', 'P3', 'P4']);
    expect(m.openSlots).toBe(2);
    expect(m.text.split('\n')[1]).toMatch(/^1\. P0 /);
    expect(m.text).not.toContain('X ');
  });

  it.each([
    ['1 3 4', ['A', 'C', 'D']],
    ['  1,3 ,4 ', ['A', 'C', 'D']],
    ['1 and 3', ['A', 'C']],
    ['#2 4.', ['B', 'D']],
    ['2 2 2', ['B']],
  ])('parses %j', (text, picked) => {
    expect(parsePickReply(text, choices, 3).picked).toEqual(picked);
  });

  it('keeps out-of-range numbers, overflow and words out of the pick', () => {
    const r = parsePickReply('1 9 0 2 3 4 please also delete the repo', choices, 3);
    expect(r.picked).toEqual(['A', 'B', 'C']);
    expect(r.outOfRange).toEqual([9, 0]);
    expect(r.overflow).toEqual([4]);
    expect(r.ignored).toEqual(['please', 'also', 'delete', 'the', 'repo']);
  });

  it('accepts replies only from the configured owner', () => {
    expect(isFromOwner('U1', c)).toBe(false);
    expect(isFromOwner('U1', cfg({ weeklyPick: { acceptRepliesFrom: 'U1' } }))).toBe(true);
    expect(isFromOwner('U2', cfg({ weeklyPick: { acceptRepliesFrom: 'U1' } }))).toBe(false);
  });

  it('on skip, carries over unfinished active items then fills by rank', () => {
    const items = [
      item('A', { state: 'active' }),
      item('B', { state: 'active', status: 'done' }),
      item('P1', { created: '2026-10-01' }),
      item('P2', { created: '2026-10-02' }),
      item('P3', { created: '2026-10-03' }),
    ];
    expect(openSlots(items, c)).toBe(2);
    expect(weeklyFallback(items, c)).toEqual(['A', 'P1', 'P2']);
    expect(weeklyFallback(items, cfg({ weeklyPick: { onSkip: 'carry-over-only' } }))).toEqual(['A']);
  });
});
