import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { OwnWrite } from './types.ts';

/** Append-only log of every write the agent makes, as JSON lines. Holds keys, kinds and times only. */
export class OwnWritesLog {
  private readonly path: string;
  constructor(path: string) {
    this.path = path;
  }

  record(w: OwnWrite): void {
    mkdirSync(dirname(this.path), { recursive: true });
    appendFileSync(this.path, JSON.stringify({ key: w.key, kind: w.kind, at: w.at }) + '\n');
  }

  all(): OwnWrite[] {
    if (!existsSync(this.path)) return [];
    return readFileSync(this.path, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l) as OwnWrite);
  }
}
