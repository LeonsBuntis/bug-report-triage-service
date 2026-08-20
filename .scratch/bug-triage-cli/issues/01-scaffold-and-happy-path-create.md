# 01: Scaffold + happy-path classify-and-create

**What to build:** A working end-to-end path from a raw report to a real Gitea issue. Running the CLI against a clean report creates a correctly titled, labeled issue in Gitea — no duplicate detection or off-topic handling yet, just the foundational scaffold and the core classify-and-create behavior.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [x] Node.js/TypeScript project exists with a `triage` service added to `docker-compose.yml`, mounting the `gitea-shared` volume read-only and reaching Gitea at `http://gitea:3000` over the compose network
- [x] `.env.example` (and `.env`) includes `OPENAI_API_KEY`
- [x] CLI reads report text from a single positional argument, falling back to stdin when no argument is given
- [x] `classifier` module calls OpenAI with structured outputs (`json_schema`, strict mode) producing `{ title, severity, components, reproStepsProvided, reproSteps }`
- [x] `giteaClient` can create an issue with title, body (including a reproduction-steps section — explicit "no reproduction steps provided" text when `reproStepsProvided` is false, never invented steps), and `severity/*` + component labels
- [ ] Running the CLI against a clean report (Set B1 or B2) creates a matching issue in the seeded Gitea repo; CLI prints `OK` and exits 0 — **verified except the live OpenAI call**: `giteaClient` was smoke-tested directly against the real running Gitea (created/verified/closed a real labeled issue), and the full pipeline is covered by the orchestrator's fake-based tests, but no `OPENAI_API_KEY` was available in this environment to run the real CLI end-to-end. Needs a live run once a key is added to `.env`.
- [x] A fake-OpenAI-client / fake-Gitea-client test seam exists, and the orchestrator is tested through it (no real network calls in tests)
- [x] Any OpenAI or Gitea failure prints `NOK`, exits nonzero, and leaves no partial/garbage issue in Gitea
