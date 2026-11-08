import { readFileSync } from 'node:fs';
import { parse } from 'yaml';

export const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;
export type Weekday = (typeof WEEKDAYS)[number];
export const RANK_KEYS = ['due', 'nudge', 'created'] as const;
export type RankKey = (typeof RANK_KEYS)[number];
export const DRAFT_ACTIONS = ['branch', 'stubs', 'draft-pr', 'draft-doc', 'outline', 'question'] as const;
export type DraftAction = (typeof DRAFT_ACTIONS)[number];
export const REPORT_SECTIONS = ['started', 'no-slot', 'refused', 'failed', 'questions'] as const;
export type ReportSection = (typeof REPORT_SECTIONS)[number];
export const JOB_NAMES = [
  'planDates',
  'weeklyPick',
  'weeklyFallback',
  'pullNext',
  'startWork',
  'morningReport',
] as const;
export type JobName = (typeof JOB_NAMES)[number];

export interface JobConfig {
  enabled: boolean;
  /** Overrides the top-level dryRun for this job. Leave out to inherit. */
  dryRun?: boolean;
}

export interface Config {
  timezone: string;
  dryRun: boolean;
  activeCap: number;
  keepNowItemActive: boolean;
  labels: { active: string; parked: string; sizeBig: string; sizeSmall: string; now: string };
  size: { whenMissing: 'guess' | 'ask' | 'small' | 'big'; fallback: 'small' | 'big' };
  leadDays: { big: number; small: number };
  nudgeDays: { big: number; small: number };
  stallDays: number;
  dueWhenCapFull: 'flag' | 'exceed';
  ranking: RankKey[];
  weeklyPick: {
    day: Weekday;
    time: string;
    count: number;
    replyWindowHours: number;
    onSkip: 'carry-over-then-fill' | 'carry-over-only';
    acceptRepliesFrom: string;
  };
  schedule: { nightly: string; report: string };
  startWork: {
    maxStepsPerItemPerNight: number;
    allowedActions: DraftAction[];
    unclear: 'outline-and-question' | 'skip';
    draftMarker: string;
  };
  codeHost: {
    branchPrefix: string;
    branchPattern: string;
    allowedRepos: string[];
    protectedBranches: string[];
  };
  docs: { location: string; titlePrefix: string };
  report: { delivery: 'own-message' | 'digest-section'; sections: ReportSection[]; sendWhenEmpty: boolean };
  ownWrites: { path: string; matchWindowSeconds: number };
  startDateStorage: 'ledger' | 'local';
  adapters: { ledger: string; chat: string; docs: string; codeHost: string };
  jobs: Record<JobName, JobConfig>;
}

export const DEFAULTS: Config = {
  timezone: 'UTC',
  dryRun: true,
  activeCap: 3,
  keepNowItemActive: true,
  labels: { active: 'active', parked: 'parked', sizeBig: 'size-big', sizeSmall: 'size-small', now: 'now' },
  size: { whenMissing: 'guess', fallback: 'small' },
  leadDays: { big: 7, small: 2 },
  nudgeDays: { big: 10, small: 3 },
  stallDays: 5,
  dueWhenCapFull: 'flag',
  ranking: ['due', 'nudge', 'created'],
  weeklyPick: {
    day: 'monday',
    time: '09:00',
    count: 5,
    replyWindowHours: 8,
    onSkip: 'carry-over-then-fill',
    acceptRepliesFrom: '',
  },
  schedule: { nightly: '02:00', report: '08:30' },
  startWork: {
    maxStepsPerItemPerNight: 1,
    allowedActions: ['branch', 'stubs', 'draft-pr', 'draft-doc', 'outline', 'question'],
    unclear: 'outline-and-question',
    draftMarker: 'Started by Procrastinator. Draft only, nothing was sent or merged.',
  },
  codeHost: {
    branchPrefix: 'procrastinator/',
    branchPattern: '{prefix}{key}-{slug}',
    allowedRepos: [],
    protectedBranches: ['main', 'master', 'develop', 'release/*'],
  },
  docs: { location: '', titlePrefix: '[Draft] ' },
  report: {
    delivery: 'own-message',
    sections: ['started', 'no-slot', 'refused', 'failed', 'questions'],
    sendWhenEmpty: false,
  },
  ownWrites: { path: 'data/own-writes.jsonl', matchWindowSeconds: 120 },
  startDateStorage: 'ledger',
  adapters: { ledger: 'fake', chat: 'console', docs: 'markdown', codeHost: 'fake' },
  jobs: {
    planDates: { enabled: true },
    weeklyPick: { enabled: true },
    weeklyFallback: { enabled: true },
    pullNext: { enabled: true },
    startWork: { enabled: true },
    morningReport: { enabled: true },
  },
};

export class ConfigError extends Error {
  readonly problems: string[];
  constructor(problems: string[]) {
    super(`Invalid config:\n- ${problems.join('\n- ')}`);
    this.problems = problems;
  }
}

type Plain = Record<string, unknown>;
const isPlain = (v: unknown): v is Plain => typeof v === 'object' && v !== null && !Array.isArray(v);

function merge(base: unknown, over: unknown, path: string, problems: string[]): unknown {
  if (over === undefined) return base;
  if (isPlain(base)) {
    if (!isPlain(over)) {
      problems.push(`${path || 'config'} must be a map`);
      return base;
    }
    const out: Plain = { ...base };
    for (const [k, v] of Object.entries(over)) {
      const p = path ? `${path}.${k}` : k;
      // jobs.<name>.dryRun is optional, so it has no default to compare against.
      if (!(k in base) && !(path.startsWith('jobs.') && k === 'dryRun')) {
        problems.push(`${p} is not a known setting`);
        continue;
      }
      out[k] = merge(base[k], v, p, problems);
    }
    return out;
  }
  return over;
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

function oneOf<T extends string>(v: unknown, allowed: readonly T[], path: string, problems: string[]) {
  if (!allowed.includes(v as T)) problems.push(`${path} must be one of: ${allowed.join(', ')}`);
}
function int(v: unknown, path: string, problems: string[], min: number, max = 365) {
  if (!Number.isInteger(v) || (v as number) < min || (v as number) > max)
    problems.push(`${path} must be a whole number from ${min} to ${max}`);
}
function bool(v: unknown, path: string, problems: string[]) {
  if (typeof v !== 'boolean') problems.push(`${path} must be true or false`);
}
function str(v: unknown, path: string, problems: string[]) {
  if (typeof v !== 'string') problems.push(`${path} must be text`);
}
function listOf<T extends string>(v: unknown, allowed: readonly T[] | null, path: string, problems: string[]) {
  if (!Array.isArray(v) || v.some((x) => typeof x !== 'string')) {
    problems.push(`${path} must be a list of text`);
    return;
  }
  if (allowed) for (const x of v) oneOf(x, allowed, `${path} entry "${x}"`, problems);
}

export function validate(c: Config): string[] {
  const p: string[] = [];
  str(c.timezone, 'timezone', p);
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: c.timezone });
  } catch {
    p.push('timezone must be an IANA name such as UTC or America/New_York');
  }
  bool(c.dryRun, 'dryRun', p);
  int(c.activeCap, 'activeCap', p, 1, 20);
  bool(c.keepNowItemActive, 'keepNowItemActive', p);
  for (const [k, v] of Object.entries(c.labels)) {
    str(v, `labels.${k}`, p);
    if (v === '') p.push(`labels.${k} must not be empty`);
  }
  oneOf(c.size.whenMissing, ['guess', 'ask', 'small', 'big'], 'size.whenMissing', p);
  oneOf(c.size.fallback, ['small', 'big'], 'size.fallback', p);
  for (const s of ['big', 'small'] as const) {
    int(c.leadDays[s], `leadDays.${s}`, p, 0);
    int(c.nudgeDays[s], `nudgeDays.${s}`, p, 0);
  }
  int(c.stallDays, 'stallDays', p, 1);
  oneOf(c.dueWhenCapFull, ['flag', 'exceed'], 'dueWhenCapFull', p);
  listOf(c.ranking, RANK_KEYS, 'ranking', p);
  if (Array.isArray(c.ranking) && new Set(c.ranking).size !== c.ranking.length) p.push('ranking has a repeated key');
  oneOf(c.weeklyPick.day, WEEKDAYS, 'weeklyPick.day', p);
  if (!HHMM.test(String(c.weeklyPick.time))) p.push('weeklyPick.time must be HH:MM, 24-hour');
  int(c.weeklyPick.count, 'weeklyPick.count', p, 1, 20);
  int(c.weeklyPick.replyWindowHours, 'weeklyPick.replyWindowHours', p, 1, 72);
  oneOf(c.weeklyPick.onSkip, ['carry-over-then-fill', 'carry-over-only'], 'weeklyPick.onSkip', p);
  if (c.adapters.chat !== 'console' && c.weeklyPick.acceptRepliesFrom === '')
    p.push('weeklyPick.acceptRepliesFrom must be set to your own chat user id when adapters.chat is not console');
  str(c.weeklyPick.acceptRepliesFrom, 'weeklyPick.acceptRepliesFrom', p);
  for (const k of ['nightly', 'report'] as const)
    if (!HHMM.test(String(c.schedule[k]))) p.push(`schedule.${k} must be HH:MM, 24-hour`);
  int(c.startWork.maxStepsPerItemPerNight, 'startWork.maxStepsPerItemPerNight', p, 0, 3);
  listOf(c.startWork.allowedActions, DRAFT_ACTIONS, 'startWork.allowedActions', p);
  oneOf(c.startWork.unclear, ['outline-and-question', 'skip'], 'startWork.unclear', p);
  str(c.startWork.draftMarker, 'startWork.draftMarker', p);
  if (c.startWork.draftMarker === '') p.push('startWork.draftMarker must not be empty');
  str(c.codeHost.branchPrefix, 'codeHost.branchPrefix', p);
  if (typeof c.codeHost.branchPrefix === 'string' && !/^[A-Za-z0-9._-]+\/$/.test(c.codeHost.branchPrefix))
    p.push('codeHost.branchPrefix must be letters, digits, dot, dash or underscore, ending in "/"');
  str(c.codeHost.branchPattern, 'codeHost.branchPattern', p);
  if (typeof c.codeHost.branchPattern === 'string' && !c.codeHost.branchPattern.startsWith('{prefix}'))
    p.push('codeHost.branchPattern must start with {prefix}');
  listOf(c.codeHost.allowedRepos, null, 'codeHost.allowedRepos', p);
  listOf(c.codeHost.protectedBranches, null, 'codeHost.protectedBranches', p);
  str(c.docs.location, 'docs.location', p);
  str(c.docs.titlePrefix, 'docs.titlePrefix', p);
  oneOf(c.report.delivery, ['own-message', 'digest-section'], 'report.delivery', p);
  listOf(c.report.sections, REPORT_SECTIONS, 'report.sections', p);
  bool(c.report.sendWhenEmpty, 'report.sendWhenEmpty', p);
  str(c.ownWrites.path, 'ownWrites.path', p);
  int(c.ownWrites.matchWindowSeconds, 'ownWrites.matchWindowSeconds', p, 0, 3600);
  oneOf(c.startDateStorage, ['ledger', 'local'], 'startDateStorage', p);
  for (const [k, v] of Object.entries(c.adapters)) str(v, `adapters.${k}`, p);
  for (const name of JOB_NAMES) {
    const j = c.jobs[name];
    bool(j.enabled, `jobs.${name}.enabled`, p);
    if (j.dryRun !== undefined) bool(j.dryRun, `jobs.${name}.dryRun`, p);
  }
  return p;
}

/** Fills defaults, rejects unknown keys and bad values. */
export function resolveConfig(input: unknown = {}): Config {
  const problems: string[] = [];
  const merged = merge(DEFAULTS, input ?? {}, '', problems) as Config;
  problems.push(...validate(merged));
  if (problems.length) throw new ConfigError(problems);
  return merged;
}

export function loadConfig(path: string): Config {
  return resolveConfig(parse(readFileSync(path, 'utf8')));
}

/** A job writes for real only when it is enabled and neither it nor the top level is in dry run. */
export function isDryRun(c: Config, job: JobName): boolean {
  return c.jobs[job].dryRun ?? c.dryRun;
}
