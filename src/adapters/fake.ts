import type { Config } from '../config.ts';
import { branchProblem, mentionProblem, refuseIf, repoProblem } from '../guards.ts';
import type {
  ChatChannel,
  CodeHost,
  DocStore,
  Item,
  ItemState,
  OwnWrite,
  ProcrastinatorStore,
  Size,
  TouchEvent,
} from '../types.ts';

/** In-memory ledger for tests and dry runs. Records every write it is asked to make. */
export class FakeStore implements ProcrastinatorStore {
  readonly writes: OwnWrite[] = [];
  readonly comments: { key: string; text: string }[] = [];
  items: Item[];
  history: Record<string, TouchEvent[]>;
  private readonly now: () => string;
  constructor(
    items: Item[] = [],
    history: Record<string, TouchEvent[]> = {},
    now: () => string = () => new Date().toISOString(),
  ) {
    this.items = items;
    this.history = history;
    this.now = now;
  }

  private get(key: string): Item {
    const i = this.items.find((x) => x.key === key);
    if (!i) throw new Error(`no item ${key}`);
    return i;
  }
  private log(key: string, kind: string) {
    this.writes.push({ key, kind, at: this.now() });
  }
  async listItems(q: { open?: boolean; labels?: string[] }) {
    return this.items.filter(
      (i) =>
        (q.open === undefined || (i.status === 'open') === q.open) &&
        (q.labels ?? []).every((l) => i.labels.includes(l)),
    );
  }
  async setLabel(key: string, label: string, on: boolean) {
    const i = this.get(key);
    i.labels = on ? [...new Set([...i.labels, label])] : i.labels.filter((l) => l !== label);
    this.log(key, 'label');
  }
  async comment(key: string, text: string) {
    refuseIf(mentionProblem(text));
    this.comments.push({ key, text });
    this.log(key, 'comment');
  }
  async setSize(key: string, size: Size) {
    this.get(key).size = size;
    this.log(key, 'size');
  }
  async setStartDate(key: string, date: string) {
    this.get(key).startDate = date;
    this.log(key, 'startDate');
  }
  async setState(key: string, state: ItemState) {
    this.get(key).state = state;
    this.log(key, 'state');
  }
  async lastTouched(key: string) {
    return this.history[key] ?? [];
  }
}

/** Prints direct messages and lets tests deliver replies. */
export class ConsoleChat implements ChatChannel {
  readonly sent: string[] = [];
  private handlers = new Map<string, (r: { text: string; from: string; at: string }) => Promise<void>>();
  private readonly print: boolean;
  constructor(print = false) {
    this.print = print;
  }
  async sendDirect(text: string) {
    refuseIf(mentionProblem(text));
    this.sent.push(text);
    if (this.print) console.log(text);
    return { messageId: `m${this.sent.length}` };
  }
  onDirectReply(messageId: string, handler: (r: { text: string; from: string; at: string }) => Promise<void>) {
    this.handlers.set(messageId, handler);
  }
  async deliver(messageId: string, r: { text: string; from: string; at: string }) {
    await this.handlers.get(messageId)?.(r);
  }
}

export class FakeDocStore implements DocStore {
  readonly drafts = new Map<string, { title: string; body: string }>();
  async createDraft(d: { title: string; body: string }) {
    refuseIf(mentionProblem(d.body));
    const id = `doc${this.drafts.size + 1}`;
    this.drafts.set(id, { ...d });
    return { id, url: `fake://docs/${id}` };
  }
  async appendToDraft(id: string, body: string) {
    refuseIf(mentionProblem(body));
    const d = this.drafts.get(id);
    if (!d) throw new Error(`no draft ${id}`);
    d.body += `\n${body}`;
  }
}

/** A code host that enforces every guard the real adapters must enforce. */
export class FakeCodeHost implements CodeHost {
  readonly branches = new Set<string>();
  readonly commits: { repo: string; branch: string; paths: string[] }[] = [];
  readonly prs: { repo: string; branch: string; title: string; draft: true; reviewers: []; assignees: [] }[] = [];
  private readonly c: Config;
  private readonly defaultBranch: string;
  constructor(c: Config, defaultBranch = 'main') {
    this.c = c;
    this.defaultBranch = defaultBranch;
  }
  private check(repo: string, branch: string) {
    refuseIf(repoProblem(repo, this.c));
    refuseIf(branchProblem(branch, this.c, this.defaultBranch));
  }
  async createBranch(repo: string, name: string) {
    this.check(repo, name);
    this.branches.add(`${repo}#${name}`);
  }
  async commitFiles(repo: string, branch: string, files: { path: string; content: string }[], _message: string) {
    this.check(repo, branch);
    if (!this.branches.has(`${repo}#${branch}`)) throw new Error('commits go only to branches this agent created');
    this.commits.push({ repo, branch, paths: files.map((f) => f.path) });
  }
  async openDraftPR(repo: string, branch: string, title: string, body: string) {
    this.check(repo, branch);
    refuseIf(mentionProblem(`${title}\n${body}`));
    this.prs.push({ repo, branch, title, draft: true, reviewers: [], assignees: [] });
    return { url: `fake://${repo}/pull/${this.prs.length}` };
  }
}
