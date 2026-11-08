#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { ConfigError, loadConfig, resolveConfig } from './config.ts';
import { todayIn } from './dates.ts';
import { buildPickMessage, isPickDay } from './pick.ts';
import { needsSizeQuestion, plan, rank, sizeOf, startDateFor } from './planner.ts';
import type { Item } from './types.ts';

const USAGE = `Usage:
  procrastinator check --config <file>
  procrastinator plan --config <file> --items <items.json> [--today YYYY-MM-DD]

plan is a dry run. It reads items from a JSON file and prints start dates, rank,
the active list and the weekly pick message. It writes nothing.`;

function main(argv: string[]): number {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { config: { type: 'string' }, items: { type: 'string' }, today: { type: 'string' } },
  });
  const cmd = positionals[0];
  try {
    const c = values.config ? loadConfig(values.config) : resolveConfig();
    if (cmd === 'check') {
      console.log('Config is valid.');
      return 0;
    }
    if (cmd !== 'plan' || !values.items) {
      console.error(USAGE);
      return 2;
    }
    const items = JSON.parse(readFileSync(values.items, 'utf8')) as Item[];
    const today = values.today ?? todayIn(c.timezone);
    const p = plan(items, c, today);
    console.log(`Dry run for ${today} (${c.timezone}). Nothing is written.\n`);
    console.log('Rank  Key       Size   Start       From   State');
    rank(
      items.filter((i) => i.status === 'open'),
      c,
    ).forEach((i, n) => {
      const s = startDateFor(i, c);
      const state = p.active.includes(i) ? (p.pulled.includes(i) ? 'active (pulled)' : 'active') : 'parked';
      const ask = needsSizeQuestion(i, c) ? ' (size: ask)' : '';
      console.log(
        `${String(n + 1).padEnd(5)} ${i.key.padEnd(9)} ${sizeOf(i, c).padEnd(6)} ${s.date}  ${s.from.padEnd(6)} ${state}${ask}`,
      );
    });
    if (p.noSlot.length) console.log(`\nNeeds starting, no free slot: ${p.noSlot.map((i) => i.key).join(', ')}`);
    if (p.overCap.length)
      console.log(`Over the cap (dueWhenCapFull: exceed): ${p.overCap.map((i) => i.key).join(', ')}`);
    if (isPickDay(today, c)) console.log(`\nWeekly pick message:\n${buildPickMessage(items, c).text}`);
    return 0;
  } catch (e) {
    console.error(e instanceof ConfigError ? e.message : String(e));
    return 1;
  }
}

process.exitCode = main(process.argv.slice(2));
