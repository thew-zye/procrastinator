import type { Config } from './config.ts';
import { weekdayOf } from './dates.ts';
import { rank, startDateFor } from './planner.ts';
import type { Item } from './types.ts';

export interface PickMessage {
  text: string;
  /** Item keys in the order they were numbered, starting at 1. */
  choices: string[];
  openSlots: number;
}

export function isPickDay(today: string, c: Config): boolean {
  return weekdayOf(today) === c.weeklyPick.day;
}

/** Free slots after the items that stay active (unfinished active items and the `now` item). */
export function openSlots(items: Item[], c: Config): number {
  const staying = items.filter(
    (i) => i.status === 'open' && (i.state === 'active' || (c.keepNowItemActive && i.labels.includes(c.labels.now))),
  );
  return Math.max(0, c.activeCap - staying.length);
}

/** The weekly pick message: the top `count` parked items, numbered, one line each. */
export function buildPickMessage(items: Item[], c: Config): PickMessage {
  const slots = openSlots(items, c);
  const parked = rank(
    items.filter((i) => i.status === 'open' && i.state !== 'active' && !i.labels.includes(c.labels.now)),
    c,
  ).slice(0, c.weeklyPick.count);
  const lines = parked.map((i, n) => {
    const s = startDateFor(i, c);
    const when = i.due ? `due ${i.due}` : `start ${s.date}`;
    return `${n + 1}. ${i.key} ${i.summary} (${when})`;
  });
  const head =
    slots === 0
      ? 'All active slots are full this week. Reply with numbers only if you want to swap.'
      : `${slots} open slot${slots === 1 ? '' : 's'} this week. Reply with the numbers you want, for example "1 3".`;
  return { text: [head, ...lines].join('\n'), choices: parked.map((i) => i.key), openSlots: slots };
}

export interface ParsedReply {
  picked: string[];
  outOfRange: number[];
  /** Valid numbers beyond the open slots. Not picked. */
  overflow: number[];
  /** Words that are not numbers. Ignored and noted in the report, never acted on. */
  ignored: string[];
}

/** Parses "1 3 4", "1,3, 4", "1 and 3". Anything else is ignored, never followed. */
export function parsePickReply(text: string, choices: string[], slots: number): ParsedReply {
  const tokens = text
    .split(/[\s,;]+/)
    .map((t) => t.trim())
    .filter(Boolean);
  const out: ParsedReply = { picked: [], outOfRange: [], overflow: [], ignored: [] };
  const seen = new Set<number>();
  for (const t of tokens) {
    if (/^and$/i.test(t)) continue;
    const m = /^#?(\d+)[.)]?$/.exec(t);
    if (!m) {
      out.ignored.push(t);
      continue;
    }
    const n = Number(m[1]);
    if (seen.has(n)) continue;
    seen.add(n);
    if (n < 1 || n > choices.length) out.outOfRange.push(n);
    else if (out.picked.length >= slots) out.overflow.push(n);
    else out.picked.push(choices[n - 1]!);
  }
  return out;
}

/** A reply counts only when it comes from the configured owner id. */
export function isFromOwner(from: string, c: Config): boolean {
  return c.weeklyPick.acceptRepliesFrom !== '' && from === c.weeklyPick.acceptRepliesFrom;
}

/**
 * No reply by the end of the window. Unfinished active items carry over. With "carry-over-then-fill",
 * free slots fill from the parked list by rank. Returns the keys to make active.
 */
export function weeklyFallback(items: Item[], c: Config): string[] {
  const staying = items.filter(
    (i) => i.status === 'open' && (i.state === 'active' || (c.keepNowItemActive && i.labels.includes(c.labels.now))),
  );
  const keys = staying.map((i) => i.key);
  if (c.weeklyPick.onSkip === 'carry-over-only') return keys;
  const parked = rank(
    items.filter((i) => i.status === 'open' && !keys.includes(i.key)),
    c,
  );
  for (const i of parked) {
    if (keys.length >= c.activeCap) break;
    keys.push(i.key);
  }
  return keys;
}
