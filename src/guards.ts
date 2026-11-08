import type { Config, DraftAction } from './config.ts';
import type { Item } from './types.ts';

export class RefusedError extends Error {}

export function slugify(text: string, max = 40): string {
  const s = text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s.slice(0, max).replace(/-+$/, '') || 'item';
}

export function branchNameFor(item: Item, c: Config): string {
  return c.codeHost.branchPattern
    .replace('{prefix}', c.codeHost.branchPrefix)
    .replace('{key}', item.key.replace(/[^A-Za-z0-9._-]/g, '-'))
    .replace('{slug}', slugify(item.summary));
}

function matchesGlob(name: string, pattern: string): boolean {
  const re = new RegExp(
    '^' +
      pattern
        .split('*')
        .map((p) => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
        .join('.*') +
      '$',
  );
  return re.test(name);
}

/** Why a branch push would be refused, or null when allowed. */
export function branchProblem(name: string, c: Config, defaultBranch?: string): string | null {
  if (!name.startsWith(c.codeHost.branchPrefix))
    return `branch "${name}" is outside the prefix ${c.codeHost.branchPrefix}`;
  if (name === defaultBranch) return `branch "${name}" is the default branch`;
  if (c.codeHost.protectedBranches.some((p) => matchesGlob(name, p))) return `branch "${name}" is protected`;
  if (!/^[A-Za-z0-9._/-]+$/.test(name) || name.includes('..') || name.endsWith('/') || name.endsWith('.lock'))
    return `branch "${name}" is not a safe name`;
  return null;
}

/** Why using this repo would be refused. An empty allow list allows nothing. */
export function repoProblem(repo: string, c: Config): string | null {
  if (!c.codeHost.allowedRepos.includes(repo)) return `repo "${repo}" is not in codeHost.allowedRepos`;
  return null;
}

export function actionProblem(action: DraftAction, c: Config): string | null {
  return c.startWork.allowedActions.includes(action) ? null : `action "${action}" is not in startWork.allowedActions`;
}

export interface PullRequestRequest {
  draft: boolean;
  reviewers?: string[];
  assignees?: string[];
  labels?: string[];
}

/** A PR request must be a draft, with nobody asked to review or assigned. */
export function pullRequestProblem(r: PullRequestRequest): string | null {
  if (!r.draft) return 'pull requests must be drafts';
  if (r.reviewers?.length) return 'pull requests must not request reviewers';
  if (r.assignees?.length) return 'pull requests must not have assignees';
  if (r.labels?.length) return 'pull requests must not have labels';
  return null;
}

/** Text the agent writes must not mention anyone, so nobody is notified. */
export function mentionProblem(text: string): string | null {
  return /(^|[\s(])@[A-Za-z0-9][\w.-]*/.test(text) ? 'text must not @-mention anyone' : null;
}

export function refuseIf(problem: string | null): void {
  if (problem) throw new RefusedError(problem);
}
