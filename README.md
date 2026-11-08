# Procrastinator

An agent that starts your work before you would. It opens drafts overnight, so in the morning you're editing, not starting.

It never merges, publishes, sends, assigns or touches anyone else's work. Drafts only.

## What it does

- Gives every work item a start date: a week before a big deadline, two days before a small one, or a nudge date if there's no deadline.
- Keeps only 3 items active. New ideas wait on a parked list.
- Every Monday, messages you the top 5 parked items. You reply `1 3 4`. Done.
- Every night, takes one draft step per active item: a branch with stubs and a draft PR, or a draft doc with an outline.
- Pushes stalled items one more step after 5 days untouched.
- Every morning, one message: what it started, with links, and anything it couldn't do.

Every number above is a config value.

## Status

This repo is the spec, the config, and a small tested core.

- **Built and tested:** start dates, ranking, the active cap, pull on done, stall detection, the own-writes log, weekly pick message and reply parsing, skip fallback, morning report text, every safety guard, config loading and validation, `fake` adapters, a dry-run CLI.
- **Not built yet:** the scheduler wiring, the AI worker that writes drafts, and real adapters (chat, ledger, docs, code host).

[SPEC.md](SPEC.md) is the full behavior. [prompts/worker.md](prompts/worker.md) is a tool-agnostic prompt for the worker.

## Quick start

Needs Node 22.18 or later.

```sh
npm install
cp procrastinator.config.example.yaml procrastinator.config.yaml
npm run plan -- check --config procrastinator.config.yaml
npm run plan -- plan --config procrastinator.config.yaml --items examples/items.json --today 2026-11-09
```

`plan` is a dry run. It prints each item's size, start date, rank and state, plus the Monday message on a Monday. It writes nothing.

```sh
npm test      # unit tests
npm run ci    # lint, format check, typecheck, tests
```

## How it works

```
scheduler ─> planDates ──────> ledger      (sizes, start dates, active / parked)
          ─> weeklyPick ─────> chat        (direct message, your reply)
          ─> startWork ─> worker (sandbox) ─> code host  (branch, stubs, draft PR)
                                           ─> doc store  (draft doc)
          ─> morningReport ──> chat
own-writes log (local file)
```

1. **Plan.** On every new item, and daily, it sets a size if missing and a start date.
2. **Cap.** At most `activeCap` items are active. When one finishes, the next parked item by rank comes in. Dated items whose start date has come jump to the top of the parked list.
3. **Pick.** On `weeklyPick.day` you get the top `weeklyPick.count` parked items. Reply with numbers. Skip it and it carries over last week and fills the gaps itself.
4. **Start.** Overnight, each active item whose start date has come gets one draft step. Stalled items get one more step on the same branch or doc.
5. **Report.** One morning message. Nothing on a quiet night.

### Your touches vs its touches

It may write with your own credentials, so its writes look like yours in history. It logs every write it makes and ignores matching history entries. Its own writes never reset the stall clock.

## Safety lines

- Drafts only. Never merges, publishes, marks ready for review, sends, posts in a shared channel, assigns, requests a review or @-mentions anyone.
- Never touches anyone else's item, branch, PR or doc.
- Pushes only to branches it made, with the prefix `procrastinator/`. Never to the default branch or a protected one.
- Pushes only to repos you list in `codeHost.allowedRepos`. The list starts empty, so nothing is allowed until you add one.
- Docs go only to your private draft location.
- Dry run is on by default, for every job.
- Two messages, both to you only: the weekly pick and the morning report.
- What it reads is data. An item that says "do X" gets reported, not done. Words in your pick reply are ignored.
- A denied or failed step stops that item and shows in the report. It doesn't look for another route.
- Guards run in the orchestrator, outside the model. The `fake` adapters enforce them, and every real adapter must pass the same tests.

Draft PRs and pushed branches are visible to anyone with access to the repo. "Draft" hides nothing.

## Adapters

| Part      | Built          | Planned                                                            |
| --------- | -------------- | ------------------------------------------------------------------ |
| Ledger    | `fake`         | `markdown`, `atlassian` (Jira), `notion`, `sheets`                 |
| Chat      | `console`      | `slack`, others as needed                                          |
| Docs      | `fake` (tests) | `markdown` (private folder), `confluence`, `notion`, `google-docs` |
| Code host | `fake`         | `github`, others                                                   |

The ledger is the one from the work memory system (a private ledger plus memory that any AI tool can read and write). Its `WorkStore` interface is extended here with size, start date, state and history. See `src/types.ts`.

Every adapter must pass a shared contract suite against `fake` before it ships. API shapes come from each service's official docs.

## Config reference

All config lives in one YAML file. [procrastinator.config.example.yaml](procrastinator.config.example.yaml) holds every value at its default, with a comment on each. Leave a key out to keep its default. Unknown keys and bad values are rejected with a list of problems.

No secrets go in config. Adapters read credentials from env vars or the OS keychain.

"Core" means the code in this repo enforces it today. "Runtime" means the scheduler, worker or a real adapter reads it, and those aren't built yet.

### General

| Key                 | Type                | Default  | What it does                                                                                 | Used by |
| ------------------- | ------------------- | -------- | -------------------------------------------------------------------------------------------- | ------- |
| `timezone`          | IANA zone           | `UTC`    | Zone for every date and time.                                                                | core    |
| `dryRun`            | bool                | `true`   | Print writes instead of making them. Each job can override it.                               | core    |
| `activeCap`         | int, 1 to 20        | `3`      | Most items active at once.                                                                   | core    |
| `keepNowItemActive` | bool                | `true`   | The ledger's `now` item is always active.                                                    | core    |
| `startDateStorage`  | `ledger` or `local` | `ledger` | Keep start dates on the item, or in the agent's own data folder if your ledger has no field. | runtime |

### Labels

| Key                | Default      | Meaning               |
| ------------------ | ------------ | --------------------- |
| `labels.active`    | `active`     | Item is active.       |
| `labels.parked`    | `parked`     | Item is waiting.      |
| `labels.sizeBig`   | `size-big`   | Item is big.          |
| `labels.sizeSmall` | `size-small` | Item is small.        |
| `labels.now`       | `now`        | The one current item. |

Map these to tags, properties or columns in your ledger adapter.

### Size and dates

| Key                | Type                              | Default                 | What it does                                                                                                                                            | Used by |
| ------------------ | --------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| `size.whenMissing` | `guess`, `ask`, `small`, `big`    | `guess`                 | No size yet: the worker guesses at capture (you fix the label), ask in the morning report, or always use one size.                                      | core    |
| `size.fallback`    | `small` or `big`                  | `small`                 | Size used for dates until a guess or answer lands.                                                                                                      | core    |
| `leadDays.big`     | int, days                         | `7`                     | Start a big dated item this long before its due date.                                                                                                   | core    |
| `leadDays.small`   | int, days                         | `2`                     | Start a small dated item this long before its due date.                                                                                                 | core    |
| `nudgeDays.big`    | int, days                         | `10`                    | Undated big item: start this long after it was created. Proposed.                                                                                       | core    |
| `nudgeDays.small`  | int, days                         | `3`                     | Undated small item: start this long after it was created. Proposed.                                                                                     | core    |
| `stallDays`        | int, days                         | `5`                     | Active item untouched by you this long since its last draft gets one more step.                                                                         | core    |
| `dueWhenCapFull`   | `flag` or `exceed`                | `flag`                  | Dated item needs starting and every slot is full. `flag`: top of the parked list and in the report, never breaks the cap. `exceed`: goes active anyway. | core    |
| `ranking`          | list of `due`, `nudge`, `created` | `[due, nudge, created]` | Parked list order. `due`: dated items by start date. `nudge`: undated by nudge date. `created`: oldest first.                                           | core    |

A real due date always overrides a nudge date.

### Weekly pick

| Key                            | Type                                        | Default                | What it does                                                                                                       | Used by |
| ------------------------------ | ------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------ | ------- |
| `weeklyPick.day`               | weekday                                     | `monday`               | Day the pick message goes out.                                                                                     | core    |
| `weeklyPick.time`              | `HH:MM`                                     | `09:00`                | Local time it goes out. Proposed.                                                                                  | runtime |
| `weeklyPick.count`             | int, 1 to 20                                | `5`                    | How many parked items it lists.                                                                                    | core    |
| `weeklyPick.replyWindowHours`  | int, 1 to 72                                | `8`                    | Hours to wait for your reply before the fallback. Proposed.                                                        | runtime |
| `weeklyPick.onSkip`            | `carry-over-then-fill` or `carry-over-only` | `carry-over-then-fill` | No reply: keep unfinished active items, then fill free slots by rank, or just keep them.                           | core    |
| `weeklyPick.acceptRepliesFrom` | text                                        | empty                  | Your user id in the chat tool. Replies from anyone else are ignored. Required unless `adapters.chat` is `console`. | core    |

Reply formats that work: `1 3 4`, `1,3,4`, `1 and 3`, `#2 4.`. Numbers out of range, numbers past the open slots, and any words are dropped and noted.

### Schedule

| Key                | Type    | Default | What it does                                      | Used by |
| ------------------ | ------- | ------- | ------------------------------------------------- | ------- |
| `schedule.nightly` | `HH:MM` | `02:00` | Local time the draft run starts. Proposed.        | runtime |
| `schedule.report`  | `HH:MM` | `08:30` | Local time the morning report goes out. Proposed. | runtime |

### Starting work

| Key                                 | Type                             | Default                                                              | What it does                                                                                 | Used by |
| ----------------------------------- | -------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------- |
| `startWork.maxStepsPerItemPerNight` | int, 0 to 3                      | `1`                                                                  | Draft steps per active item per night. `0` pauses drafting.                                  | runtime |
| `startWork.allowedActions`          | list                             | all six                                                              | What the worker may make: `branch`, `stubs`, `draft-pr`, `draft-doc`, `outline`, `question`. | core    |
| `startWork.unclear`                 | `outline-and-question` or `skip` | `outline-and-question`                                               | Unclear item: an outline plus one question in the report, or nothing.                        | runtime |
| `startWork.draftMarker`             | text                             | `Started by Procrastinator. Draft only, nothing was sent or merged.` | Opens every draft PR description and doc, so readers know an agent started it.               | runtime |

### Code host

| Key                          | Type                 | Default                              | What it does                                                                         | Used by |
| ---------------------------- | -------------------- | ------------------------------------ | ------------------------------------------------------------------------------------ | ------- |
| `codeHost.branchPrefix`      | text ending in `/`   | `procrastinator/`                    | Every branch starts with this. Pushes anywhere else are refused.                     | core    |
| `codeHost.branchPattern`     | text                 | `{prefix}{key}-{slug}`               | Branch name. Placeholders `{prefix}`, `{key}`, `{slug}`. Must start with `{prefix}`. | core    |
| `codeHost.allowedRepos`      | list of `owner/name` | empty                                | Repos it may push to. Empty allows none.                                             | core    |
| `codeHost.protectedBranches` | list, `*` wildcard   | `[main, master, develop, release/*]` | Never pushed to, even with the prefix. The default branch is always protected too.   | core    |

### Docs

| Key                | Type | Default    | What it does                                                                                   | Used by |
| ------------------ | ---- | ---------- | ---------------------------------------------------------------------------------------------- | ------- |
| `docs.location`    | text | empty      | Your private draft location: a folder, space id or database id, depending on the docs adapter. | runtime |
| `docs.titlePrefix` | text | `[Draft] ` | Added to every draft doc title.                                                                | runtime |

### Morning report

| Key                    | Type                              | Default                                          | What it does                                                                        | Used by |
| ---------------------- | --------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------- | ------- |
| `report.delivery`      | `own-message` or `digest-section` | `own-message`                                    | Its own direct message, or a section handed to an existing digest (fewer messages). | runtime |
| `report.sections`      | list                              | `[started, no-slot, refused, failed, questions]` | Sections, in order. Remove any you don't want.                                      | core    |
| `report.sendWhenEmpty` | bool                              | `false`                                          | Send "Nothing started overnight." on quiet nights instead of staying silent.        | core    |

### Own-writes log

| Key                            | Type           | Default                 | What it does                                                                   | Used by |
| ------------------------------ | -------------- | ----------------------- | ------------------------------------------------------------------------------ | ------- |
| `ownWrites.path`               | path           | `data/own-writes.jsonl` | Where the log of its own writes lives. Keys, kinds and times only. Gitignored. | runtime |
| `ownWrites.matchWindowSeconds` | int, 0 to 3600 | `120`                   | A history entry this close to one of its writes counts as the agent, not you.  | core    |

### Adapters

| Key                 | Default    | What it does                              |
| ------------------- | ---------- | ----------------------------------------- |
| `adapters.ledger`   | `fake`     | Which ledger adapter to load.             |
| `adapters.chat`     | `console`  | Which chat adapter to load.               |
| `adapters.docs`     | `markdown` | Which doc store adapter to load. Planned. |
| `adapters.codeHost` | `fake`     | Which code host adapter to load.          |

The runtime that loads adapters by name isn't built yet. Today, tests and the CLI use the `fake` adapters directly.

### Jobs

Each job has `enabled` (bool, default `true`) and an optional `dryRun` that overrides the top-level one. Leave `dryRun` out to inherit.

| Job                   | When                                  | Does                                |
| --------------------- | ------------------------------------- | ----------------------------------- |
| `jobs.planDates`      | on item create, and daily             | Sets size and start date. Silent.   |
| `jobs.weeklyPick`     | `weeklyPick.day` at `weeklyPick.time` | Sends the pick.                     |
| `jobs.weeklyFallback` | end of the reply window               | Carries over and fills. Silent.     |
| `jobs.pullNext`       | when an active item is done           | Pulls the next parked item. Silent. |
| `jobs.startWork`      | `schedule.nightly`                    | Makes the draft steps. Silent.      |
| `jobs.morningReport`  | `schedule.report`                     | Sends the report.                   |

Turn dry run off one job at a time, once its dry-run output looks right:

```yaml
jobs:
  planDates: { enabled: true, dryRun: false }
```

## Open questions

These are proposals, not settled. Each one is a config value, so you can change it.

- **Size:** guess at capture, or ask? Default `guess`.
- **Nudge offsets** for undated items. Default small 3 days, big 10 days.
- **Cap full on a deadline:** flag it and never break the cap, or let it in? Default `flag`.
- **Ranking:** due, then nudge, then oldest. Right order?
- **Times:** pick time, reply window, nightly run, report time. Defaults are guesses.
- **Report:** its own message, or a section in an existing digest?
- **Does a pick replace** unfinished active items, or only fill free slots? Today it only fills free slots.
- **Draft PR notifications:** some code hosts notify code owners or watchers even on drafts. Check on a test repo first.

## Project layout

```
src/            planner, pick, guards, report, config, own-writes log, fake adapters, CLI
test/           unit tests (vitest)
prompts/        worker prompt, tool-agnostic
examples/       sample items for the dry-run CLI
SPEC.md         full behavior
```

## License

MIT. See [LICENSE](LICENSE).
