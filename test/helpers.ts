import { resolveConfig } from '../src/config.ts';
import type { Item } from '../src/types.ts';

export const cfg = (over: unknown = {}) => resolveConfig(over);

export function item(key: string, over: Partial<Item> = {}): Item {
  return { key, summary: `Item ${key}`, status: 'open', labels: [], created: '2026-11-01', ...over };
}
