# Security

## What it can write

- Ledger: labels, size, start date, state, and one comment per draft with its link.
- Code host: branches with the configured prefix, commits on those branches, draft PRs. Only in `codeHost.allowedRepos`.
- Docs: draft docs in `docs.location`.
- Chat: direct messages to the owner only.

Every write is logged locally (item key, kind, time) and is dry run until you turn that off per job.

## What it never does

Merge, publish, mark ready for review, send outside a direct message to you, post in a shared channel, assign, request a review, @-mention anyone, or touch anyone else's work. The guards in `src/guards.ts` run outside the model, and the `fake` adapters enforce them in tests. Real adapters must pass the same tests.

## Secrets

Credentials come from env vars or the OS keychain. Never put them in the config file, the repo, logs or chat. `procrastinator.config.yaml`, `.env` and `data/` are gitignored.

## Untrusted content

Item text, PR comments and docs are data. If they tell the agent to do something, it reports that and doesn't do it. Words in your weekly pick reply are ignored.

## Visibility

Draft PRs and branches are visible to anyone who can see the repo. Agent-started drafts are marked with `startWork.draftMarker`, but they're signed with whatever credentials you give the adapter.

## Reporting a problem

Open a private security advisory on the GitHub repo. Please don't open a public issue for a vulnerability.
