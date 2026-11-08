import type { Config, ReportSection } from './config.ts';

export interface NightResult {
  started: { key: string; made: string; url: string }[];
  noSlot: { key: string; summary: string; due?: string }[];
  refused: { key: string; reason: string }[];
  failed: { key: string; error: string }[];
  questions: { key: string; question: string }[];
}

const TITLES: Record<ReportSection, string> = {
  started: 'Started overnight',
  'no-slot': 'Needs starting, no free slot',
  refused: 'Refused',
  failed: 'Failed',
  questions: 'Questions for you',
};

/** The morning report text, or null when there is nothing to say and sendWhenEmpty is false. */
export function buildReport(r: NightResult, c: Config): string | null {
  const lines: Record<ReportSection, string[]> = {
    started: r.started.map((s) => `${s.key}: ${s.made} ${s.url}`),
    'no-slot': r.noSlot.map((n) => `${n.key}: ${n.summary}${n.due ? ` (due ${n.due})` : ''}`),
    refused: r.refused.map((x) => `${x.key}: ${x.reason}`),
    failed: r.failed.map((x) => `${x.key}: ${x.error}`),
    questions: r.questions.map((q) => `${q.key}: ${q.question}`),
  };
  const parts = c.report.sections
    .filter((s) => lines[s].length)
    .map((s) => [TITLES[s], ...lines[s].map((l) => `- ${l}`)].join('\n'));
  if (!parts.length) return c.report.sendWhenEmpty ? 'Nothing started overnight.' : null;
  return parts.join('\n\n');
}
