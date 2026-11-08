import { describe, expect, it } from 'vitest';
import { FakeCodeHost, FakeDocStore, FakeStore } from '../src/adapters/fake.ts';
import {
  actionProblem,
  branchNameFor,
  branchProblem,
  pullRequestProblem,
  RefusedError,
  repoProblem,
} from '../src/guards.ts';
import { cfg, item } from './helpers.ts';

const c = cfg({ codeHost: { allowedRepos: ['me/app'] } });

describe('guards', () => {
  it('names branches with the prefix', () => {
    expect(branchNameFor(item('W-12', { summary: 'Fix the Login: page!' }), c)).toBe(
      'procrastinator/W-12-fix-the-login-page',
    );
  });

  it('refuses branches outside the prefix, protected or default branches, and unsafe names', () => {
    expect(branchProblem('feature/x', c)).toMatch(/outside the prefix/);
    expect(branchProblem('main', c)).toMatch(/outside the prefix/);
    expect(branchProblem('procrastinator/../main', c)).toMatch(/not a safe name/);
    expect(branchProblem('procrastinator/x', c, 'procrastinator/x')).toMatch(/default branch/);
    expect(branchProblem('procrastinator/x', cfg({ codeHost: { protectedBranches: ['procrastinator/*'] } }))).toMatch(
      /protected/,
    );
    expect(branchProblem('procrastinator/W-1-ok', c)).toBeNull();
  });

  it('an empty repo allow list allows nothing', () => {
    expect(repoProblem('me/app', cfg())).toMatch(/allowedRepos/);
    expect(repoProblem('me/app', c)).toBeNull();
    expect(repoProblem('someone/else', c)).toMatch(/allowedRepos/);
  });

  it('PRs must be drafts with no reviewers, assignees or labels', () => {
    expect(pullRequestProblem({ draft: false })).toMatch(/drafts/);
    expect(pullRequestProblem({ draft: true, reviewers: ['x'] })).toMatch(/reviewers/);
    expect(pullRequestProblem({ draft: true, assignees: ['x'] })).toMatch(/assignees/);
    expect(pullRequestProblem({ draft: true, labels: ['x'] })).toMatch(/labels/);
    expect(pullRequestProblem({ draft: true })).toBeNull();
  });

  it('only configured actions are allowed', () => {
    expect(actionProblem('draft-pr', cfg({ startWork: { allowedActions: ['outline'] } }))).toMatch(/allowedActions/);
  });
});

describe('fake adapters enforce the guards', () => {
  it('code host: no push outside the prefix or allow list, commits only to its own branches, PRs only as drafts', async () => {
    const host = new FakeCodeHost(c);
    await expect(host.createBranch('me/app', 'main')).rejects.toBeInstanceOf(RefusedError);
    await expect(host.createBranch('other/app', 'procrastinator/x')).rejects.toBeInstanceOf(RefusedError);
    await expect(host.commitFiles('me/app', 'procrastinator/x', [], 'm')).rejects.toThrow(/created/);
    await host.createBranch('me/app', 'procrastinator/x');
    await host.commitFiles('me/app', 'procrastinator/x', [{ path: 'a.ts', content: '' }], 'stubs');
    const pr = await host.openDraftPR('me/app', 'procrastinator/x', 'Draft', 'Plan');
    expect(pr.url).toContain('pull/1');
    expect(host.prs[0]).toMatchObject({ draft: true, reviewers: [], assignees: [] });
  });

  it('nothing it writes may mention anyone', async () => {
    const host = new FakeCodeHost(c);
    await host.createBranch('me/app', 'procrastinator/x');
    await expect(host.openDraftPR('me/app', 'procrastinator/x', 'Draft', 'cc @someone')).rejects.toThrow(/mention/);
    await expect(new FakeDocStore().createDraft({ title: 't', body: '@team look' })).rejects.toThrow(/mention/);
    await expect(new FakeStore([item('A')]).comment('A', 'hey @you')).rejects.toThrow(/mention/);
    await expect(new FakeDocStore().createDraft({ title: 't', body: 'mail me at a@b.example' })).resolves.toBeTruthy();
  });

  it('the store records every write it makes, for the own-writes log', async () => {
    const s = new FakeStore([item('A')], {}, () => '2026-11-04T02:00:00Z');
    await s.setState('A', 'active');
    await s.setLabel('A', 'active', true);
    expect(s.writes).toEqual([
      { key: 'A', kind: 'state', at: '2026-11-04T02:00:00Z' },
      { key: 'A', kind: 'label', at: '2026-11-04T02:00:00Z' },
    ]);
  });
});
