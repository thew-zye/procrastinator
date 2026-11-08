import type { Config } from './config.ts';
import { addDays, daysBetween } from './dates.ts';
import type { Item, OwnWrite, Size, TouchEvent } from './types.ts';

/** The item's size, from its field, its size label, or the configured default. */
export function sizeOf(item: Item, c: Config): Size {
  if (item.size) return item.size;
  if (item.labels.includes(c.labels.sizeBig)) return 'big';
  if (item.labels.includes(c.labels.sizeSmall)) return 'small';
  return c.size.whenMissing === 'big' || c.size.whenMissing === 'small' ? c.size.whenMissing : c.size.fallback;
}

/** True when the item has no size yet and the config says to ask the owner. */
export function needsSizeQuestion(item: Item, c: Config): boolean {
  return (
    c.size.whenMissing === 'ask' &&
    !item.size &&
    !item.labels.includes(c.labels.sizeBig) &&
    !item.labels.includes(c.labels.sizeSmall)
  );
}

/**
 * Start date rules:
 * - A real due date wins: start `leadDays[size]` days before it.
 * - No due date: a nudge date `nudgeDays[size]` days after the item was created.
 */
export function startDateFor(item: Item, c: Config): { date: string; from: 'due' | 'nudge' } {
  const size = sizeOf(item, c);
  if (item.due) return { date: addDays(item.due, -c.leadDays[size]), from: 'due' };
  return { date: addDays(item.created, c.nudgeDays[size]), from: 'nudge' };
}

/** Sorts items by the configured ranking keys. Default: dated items by start date, then undated by nudge date, then oldest. */
export function rank(items: Item[], c: Config): Item[] {
  const start = new Map(items.map((i) => [i.key, startDateFor(i, c).date]));
  const cmp = (a: Item, b: Item): number => {
    for (const k of c.ranking) {
      let r = 0;
      if (k === 'due') {
        if (a.due && !b.due) r = -1;
        else if (!a.due && b.due) r = 1;
        else if (a.due && b.due) r = start.get(a.key)!.localeCompare(start.get(b.key)!);
      } else if (k === 'nudge') {
        if (!a.due && !b.due) r = start.get(a.key)!.localeCompare(start.get(b.key)!);
      } else {
        r = a.created.localeCompare(b.created);
      }
      if (r !== 0) return r;
    }
    return a.key.localeCompare(b.key);
  };
  return [...items].sort(cmp);
}

/** A dated item whose start date has come. */
export function isDueToStart(item: Item, c: Config, today: string): boolean {
  return Boolean(item.due) && startDateFor(item, c).date <= today;
}

export interface Plan {
  active: Item[];
  parked: Item[];
  /** Items moved from parked to active by this plan. */
  pulled: Item[];
  /** Dated items whose start date has come but have no free slot. Shown in the morning report. */
  noSlot: Item[];
  /** Items over the cap because dueWhenCapFull is "exceed". */
  overCap: Item[];
}

/**
 * Applies the active cap. Keeps current active items (and the `now` item), fills free slots from the
 * parked list by rank, with dated items whose start date has come at the top of the parked list.
 * Never breaks the cap unless dueWhenCapFull is "exceed".
 */
export function plan(items: Item[], c: Config, today: string): Plan {
  const open = items.filter((i) => i.status === 'open');
  const isNow = (i: Item) => c.keepNowItemActive && i.labels.includes(c.labels.now);
  const active = rank(
    open.filter((i) => i.state === 'active' || isNow(i)),
    c,
  );
  const rest = rank(
    open.filter((i) => !active.includes(i)),
    c,
  );
  const urgent = rest.filter((i) => isDueToStart(i, c, today));
  const queue = [...urgent, ...rest.filter((i) => !urgent.includes(i))];

  const pulled: Item[] = [];
  while (active.length + pulled.length < c.activeCap && queue.length) pulled.push(queue.shift()!);

  const overCap: Item[] = [];
  if (c.dueWhenCapFull === 'exceed') {
    for (const i of queue.filter((q) => isDueToStart(q, c, today))) {
      overCap.push(i);
      queue.splice(queue.indexOf(i), 1);
    }
  }
  const noSlot = queue.filter((i) => isDueToStart(i, c, today));
  return { active: [...active, ...pulled, ...overCap], parked: queue, pulled, noSlot, overCap };
}

/** Latest time the person touched the item, ignoring history entries that match the agent's own writes. */
export function lastPersonTouch(key: string, history: TouchEvent[], ownWrites: OwnWrite[], c: Config): string | null {
  const window = c.ownWrites.matchWindowSeconds * 1000;
  const mine = ownWrites.filter((w) => w.key === key).map((w) => Date.parse(w.at));
  const theirs = history
    .map((h) => Date.parse(h.at))
    .filter((t) => !mine.some((m) => Math.abs(m - t) <= window))
    .sort((a, b) => b - a);
  return theirs.length ? new Date(theirs[0]!).toISOString() : null;
}

/** An active item the agent already started, then the person left alone for `stallDays` or more. */
export function isStalled(item: Item, history: TouchEvent[], ownWrites: OwnWrite[], c: Config, today: string): boolean {
  if (item.state !== 'active' || !item.startedOn) return false;
  const touched = lastPersonTouch(item.key, history, ownWrites, c)?.slice(0, 10);
  const since = touched && touched > item.startedOn ? touched : item.startedOn;
  return daysBetween(since, today) >= c.stallDays;
}

/** What the nightly run should do for one active item: start it, push a stalled one further, or nothing. */
export function nightlyStep(
  item: Item,
  history: TouchEvent[],
  ownWrites: OwnWrite[],
  c: Config,
  today: string,
): 'start' | 'continue' | null {
  if (item.state !== 'active' || item.status !== 'open') return null;
  if (!item.startedOn) return startDateFor(item, c).date <= today ? 'start' : null;
  return isStalled(item, history, ownWrites, c, today) ? 'continue' : null;
}
