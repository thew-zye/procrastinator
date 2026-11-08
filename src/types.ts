/** Item size. Drives lead time and nudge time. */
export type Size = 'big' | 'small';

/** Where an open item sits. Only `active` items get drafts. */
export type ItemState = 'active' | 'parked';

/** One work item, as the planner sees it. Dates are ISO calendar dates (YYYY-MM-DD). */
export interface Item {
  key: string;
  summary: string;
  status: 'open' | 'done';
  labels: string[];
  created: string;
  due?: string;
  size?: Size;
  state?: ItemState;
  /** Set by the planner. */
  startDate?: string;
  /** Date of the first draft the agent made for this item, if any. */
  startedOn?: string;
  url?: string;
}

/** One entry of an item's change history, from the ledger, code host or doc store. `at` is an ISO timestamp. */
export interface TouchEvent {
  at: string;
  by: string;
}

/** One write the agent made. Kept in the own-writes log so it never counts as the person's touch. */
export interface OwnWrite {
  key: string;
  kind: string;
  at: string;
}

/** The ledger the work memory system defines. Only the parts this agent uses. */
export interface WorkStore {
  listItems(q: { open?: boolean; labels?: string[] }): Promise<Item[]>;
  setLabel(key: string, label: string, on: boolean): Promise<void>;
  comment(key: string, text: string): Promise<void>;
}

export interface ProcrastinatorStore extends WorkStore {
  setSize(key: string, size: Size): Promise<void>;
  setStartDate(key: string, date: string): Promise<void>;
  setState(key: string, state: ItemState): Promise<void>;
  /** Raw history. The caller subtracts the agent's own writes. */
  lastTouched(key: string): Promise<TouchEvent[]>;
}

export interface ChatChannel {
  /** A direct message to the owner only. Never a shared channel. */
  sendDirect(text: string): Promise<{ messageId: string }>;
  onDirectReply(messageId: string, handler: (r: { text: string; from: string; at: string }) => Promise<void>): void;
}

export interface DocStore {
  /** Creates a draft in the owner's private location. Never publishes. */
  createDraft(d: { title: string; body: string }): Promise<{ id: string; url: string }>;
  appendToDraft(id: string, body: string): Promise<void>;
}

export interface CodeHost {
  /** Must refuse names without the configured prefix. */
  createBranch(repo: string, name: string, from?: string): Promise<void>;
  commitFiles(repo: string, branch: string, files: { path: string; content: string }[], message: string): Promise<void>;
  /** Always a draft. No reviewers, no assignees, no notifying labels. */
  openDraftPR(repo: string, branch: string, title: string, body: string): Promise<{ url: string }>;
}
