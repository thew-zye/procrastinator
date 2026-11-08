import { describe, expect, it } from 'vitest';
import {
  isStalled,
  lastPersonTouch,
  needsSizeQuestion,
  nightlyStep,
  plan,
  rank,
  sizeOf,
  startDateFor,
} from '../src/planner.ts';
import { cfg, item } from './helpers.ts';

const c = cfg();

describe('start dates', () => {
  it('starts big dated items 7 days early and small ones 2 days early', () => {
    expect(startDateFor(item('A', { due: '2026-11-20', size: 'big' }), c)).toEqual({ date: '2026-11-13', from: 'due' });
    expect(startDateFor(item('B', { due: '2026-11-20', size: 'small' }), c)).toEqual({
      date: '2026-11-18',
      from: 'due',
    });
  });

  it('gives undated items a nudge date from size', () => {
    expect(startDateFor(item('A', { size: 'big' }), c).date).toBe('2026-11-11');
    expect(startDateFor(item('B', { size: 'small' }), c)).toEqual({ date: '2026-11-04', from: 'nudge' });
  });

  it('a real due date overrides the nudge date', () => {
    const i = item('A', { size: 'big' });
    expect(startDateFor(i, c).from).toBe('nudge');
    i.due = '2026-12-01';
    expect(startDateFor(i, c)).toEqual({ date: '2026-11-24', from: 'due' });
  });

  it('reads size from labels, then whenMissing, then fallback', () => {
    expect(sizeOf(item('A', { labels: ['size-big'] }), c)).toBe('big');
    expect(sizeOf(item('A'), c)).toBe('small');
    expect(sizeOf(item('A'), cfg({ size: { whenMissing: 'big' } }))).toBe('big');
    expect(needsSizeQuestion(item('A'), cfg({ size: { whenMissing: 'ask' } }))).toBe(true);
    expect(needsSizeQuestion(item('A', { size: 'big' }), cfg({ size: { whenMissing: 'ask' } }))).toBe(false);
  });
});

describe('ranking', () => {
  it('dated by start date, then undated by nudge date, then oldest', () => {
    const items = [
      item('U-new', { created: '2026-11-03' }),
      item('D-late', { due: '2026-12-01' }),
      item('U-old', { created: '2026-10-01' }),
      item('D-soon', { due: '2026-11-10' }),
    ];
    expect(rank(items, c).map((i) => i.key)).toEqual(['D-soon', 'D-late', 'U-old', 'U-new']);
  });

  it('follows a custom order', () => {
    const items = [item('D', { due: '2026-11-10', created: '2026-11-05' }), item('U', { created: '2026-10-01' })];
    expect(rank(items, cfg({ ranking: ['created'] })).map((i) => i.key)).toEqual(['U', 'D']);
  });
});

describe('active cap', () => {
  it('fills up to the cap and parks the rest', () => {
    const items = ['A', 'B', 'C', 'D', 'E'].map((k, n) => item(k, { created: `2026-10-0${n + 1}` }));
    const p = plan(items, c, '2026-11-01');
    expect(p.active.map((i) => i.key)).toEqual(['A', 'B', 'C']);
    expect(p.parked.map((i) => i.key)).toEqual(['D', 'E']);
  });

  it('pulls the next parked item when an active one is done', () => {
    const items = [
      item('A', { state: 'active', status: 'done' }),
      item('B', { state: 'active' }),
      item('C', { state: 'active' }),
      item('D', { created: '2026-10-01' }),
      item('E', { created: '2026-10-02' }),
    ];
    const p = plan(items, c, '2026-11-01');
    expect(p.pulled.map((i) => i.key)).toEqual(['D']);
    expect(p.active).toHaveLength(3);
  });

  it('keeps the now item active', () => {
    const items = [item('A'), item('B'), item('C'), item('N', { labels: ['now'], created: '2026-11-30' })];
    expect(plan(items, c, '2026-11-01').active.map((i) => i.key)).toContain('N');
  });

  it('a dated item with a full cap goes to the top of the parked list and is flagged, never over the cap', () => {
    const items = [
      item('A', { state: 'active' }),
      item('B', { state: 'active' }),
      item('C', { state: 'active' }),
      item('U', { created: '2026-01-01' }),
      item('D', { due: '2026-11-03', size: 'small', created: '2026-11-01' }),
    ];
    const p = plan(items, c, '2026-11-02');
    expect(p.active).toHaveLength(3);
    expect(p.parked[0]!.key).toBe('D');
    expect(p.noSlot.map((i) => i.key)).toEqual(['D']);
  });

  it('dueWhenCapFull exceed lets it go over the cap', () => {
    const items = ['A', 'B', 'C'].map((k) => item(k, { state: 'active' }));
    items.push(item('D', { due: '2026-11-03', size: 'small' }));
    const p = plan(items, cfg({ dueWhenCapFull: 'exceed' }), '2026-11-02');
    expect(p.overCap.map((i) => i.key)).toEqual(['D']);
    expect(p.active).toHaveLength(4);
    expect(p.noSlot).toHaveLength(0);
  });
});

describe('stall and own writes', () => {
  const started = item('A', { state: 'active', startedOn: '2026-11-01' });

  it('stalls after 5 days untouched', () => {
    expect(isStalled(started, [], [], c, '2026-11-05')).toBe(false);
    expect(isStalled(started, [], [], c, '2026-11-06')).toBe(true);
  });

  it('a touch by the person resets the clock', () => {
    const h = [{ at: '2026-11-04T10:00:00Z', by: 'me' }];
    expect(isStalled(started, h, [], c, '2026-11-06')).toBe(false);
    expect(isStalled(started, h, [], c, '2026-11-09')).toBe(true);
  });

  it("the agent's own writes never reset the clock, even when they show as the person's", () => {
    const h = [{ at: '2026-11-04T02:00:30Z', by: 'me' }];
    const own = [{ key: 'A', kind: 'comment', at: '2026-11-04T02:00:00Z' }];
    expect(lastPersonTouch('A', h, own, c)).toBeNull();
    expect(isStalled(started, h, own, c, '2026-11-06')).toBe(true);
  });

  it('own writes for another item do not hide a touch', () => {
    const h = [{ at: '2026-11-04T02:00:30Z', by: 'me' }];
    const own = [{ key: 'B', kind: 'comment', at: '2026-11-04T02:00:00Z' }];
    expect(lastPersonTouch('A', h, own, c)).toBe('2026-11-04T02:00:30.000Z');
  });

  it('nightly step: start on or after the start date, continue when stalled, else nothing', () => {
    const fresh = item('B', { state: 'active', due: '2026-11-10', size: 'small' });
    expect(nightlyStep(fresh, [], [], c, '2026-11-07')).toBeNull();
    expect(nightlyStep(fresh, [], [], c, '2026-11-08')).toBe('start');
    expect(nightlyStep(started, [], [], c, '2026-11-06')).toBe('continue');
    expect(nightlyStep(item('C'), [], [], c, '2026-11-30')).toBeNull();
  });
});
