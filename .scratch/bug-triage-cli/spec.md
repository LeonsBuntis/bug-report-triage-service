# Bug Report Triage CLI

Status: ready-for-agent

## Problem Statement

A raw, free-text bug report (a paragraph a user or teammate typed) has to become a well-formed,
triaged issue in Gitea — with a title, severity, component labels, and clean repro steps — or a
comment on an existing issue if it's clearly a duplicate. Doing this by hand is slow and
inconsistent; doing it with an LLM alone is untrustworthy, because the LLM can emit malformed
structure, invent repro steps that were never given, fabricate confidence about severity, or
silently merge a report into the wrong existing issue. The service needs to make the LLM's
output trustworthy, not just plausible.

## Solution

A one-shot TypeScript CLI (`triage "<report text>"`, with a stdin fallback) that classifies a
report with the OpenAI API using schema-constrained structured outputs, checks it against the
open issues already in Gitea for duplicates, and either creates a new issue or comments on an
existing one. The CLI's own stdout is deliberately minimal (`OK`/`NOK`) — every substantive
output (title, severity, labels, repro steps, duplicate rationale) is written to Gitea itself,
so the created issue/comment is the verifiable artifact, not console text. Off-topic or
non-actionable input is never rejected outright — it's still classified and filed, tagged
`unknown`/`severity/low`, so nothing is silently dropped or over-trusted.

## User Stories

1. As a reporter, I want to submit a raw bug report as a single CLI argument, so that I don't need to fill out a structured form.
2. As a reporter, I want to pipe a report in via stdin, so that I can script or redirect input instead of quoting it on the command line.
3. As a maintainer, I want every filed issue to have a concise, descriptive title, so that I can scan the issue list without reading full bodies.
4. As a maintainer, I want every filed issue to have exactly one `severity/*` label (`critical`/`high`/`medium`/`low`), so that I can sort work by urgency.
5. As a maintainer, I want every filed issue to have one or more component labels from the fixed set (`frontend`/`backend`/`api`/`auth`/`database`/`infra`/`docs`/`unknown`), so that I can route it to the right team.
6. As a maintainer, I want reproduction steps extracted verbatim from the report when they exist, so that I don't have to re-read the raw text to reproduce the bug.
7. As a maintainer, I want the issue to explicitly say "no reproduction steps provided" when the reporter didn't give any, so that the LLM never invents steps that weren't there.
8. As a maintainer, I want a new report that's clearly the same bug as an open issue to be posted as a comment on that issue instead of a new one, so that I don't get duplicate tracking overhead.
9. As a maintainer, I want a report that *might* be the same bug as an open issue, but isn't a sure match, to still become its own issue — with a note naming the suspected match — so that I can confirm or reject the link myself instead of the system guessing wrong.
10. As a maintainer, I want reports with no plausible existing match to be filed cleanly with no spurious "possible duplicate" noise.
11. As a reporter submitting an off-topic item (e.g. a feature request), I want it still filed rather than silently discarded, so that nothing I report disappears without a trace.
12. As a maintainer, I want off-topic/non-bug reports tagged `unknown` component and `severity/low`, so that they're visibly deprioritized and separable from real defects without the LLM having to (mis)judge their urgency.
13. As a maintainer, I want severity assigned by actual technical impact, not by the reporter's tone (e.g. all-caps "CRITICAL!!!" on a cosmetic footer typo should still be `low`), so that severity stays meaningful.
14. As a maintainer, I want a vague/underspecified report (e.g. "the reports thing is broken again pls fix") to still produce a best-effort classification rather than an error, so that even low-signal reports get triaged.
15. As a maintainer, I want a report bundling multiple unrelated problems in one paragraph to still be filed as a single issue capturing everything mentioned, so that the report isn't silently truncated to just one of the problems (splitting into multiple issues is out of scope for v1 — see Out of Scope).
16. As an operator, I want the CLI to print nothing but `OK` or `NOK` to stdout, so that its success/failure is trivial to check from a script without parsing free text.
17. As an operator, I want a `NOK` result reserved for genuine pipeline failures (LLM unreachable, structured-output validation failed twice, Gitea API error) — never for input that's merely weird or off-topic — so that `NOK` reliably means "something actually broke."
18. As a developer, I want a `--debug`/`DEBUG=1` mode that dumps the full classification and dedup decision to stderr, so that I can see what the model produced while tuning prompts, without touching the stdout contract.
19. As a developer, I want the classifier, deduper, and Gitea client to be separate modules with narrow interfaces, so that any one of them can be replaced (e.g. dedup moving to embeddings later) without rewriting the others.
20. As a developer, I want structured-output validation to retry once (with the validation error fed back to the model) and then fail closed, so that a single hiccup doesn't produce garbage in Gitea, but the system also doesn't spin forever.
21. As a maintainer, I want the seeded Gitea repo to carry only the labels this service actually uses (`severity/*` + the 8 component labels), so that the label list isn't cluttered with this project's own unrelated dev-tracker vocabulary.
22. As a developer, I want the CLI to run as a `docker-compose` one-off service reusing the same Gitea app token/network the seed step already sets up, so that there's no second, parallel credential path to maintain.

## Implementation Decisions

- **Modules**: `classifier` (report text → `ClassifiedReport`), `deduper` (`ClassifiedReport` + open issues → `DedupResult`), `giteaClient` (fetch open issues / create issue / comment on issue), and a thin CLI entrypoint that wires them together in one pass (no session/REPL state — see ADR-0002 for why it's still packaged this way regardless).
- **`ClassifiedReport` shape**: `{ title: string, severity: 'critical'|'high'|'medium'|'low', components: Component[] (non-empty, from the fixed 8-value set), reproStepsProvided: boolean, reproSteps: string[] }`. `reproSteps` is empty when `reproStepsProvided` is false — the issue body must then say explicitly that none were given, never fabricate steps.
- **`severity`/`unknown` override**: if `components` resolves to only `unknown`, the CLI forces `severity` to `low` in code after classification, rather than asking the model to judge severity for something it already flagged as off-topic (see [CONTEXT.md](../../CONTEXT.md) — Actionable bug report / Severity).
- **`DedupResult` shape**: `{ confidence: 'none'|'suspected'|'certain', matchIssueNumber?: number, rationale?: string }`, produced by one structured-output call that receives every currently-open issue's title + body as candidates alongside the new report (see ADR-0001).
- **Branch on `DedupResult.confidence`**: `certain` → comment on `matchIssueNumber` with the new report + rationale, no new issue. `suspected` → create a new issue, body includes a note naming `matchIssueNumber` and the rationale. `none` → create a new issue, no dedup note.
- **Gitea labels applied on create**: `severity/<level>` + each entry in `components`. No labels are touched on a duplicate comment. The seeded repo's label set is trimmed to just these (remove the `TRIAGE_LABELS` block from `seed/seed_gitea.py`).
- **Structured output & validation**: OpenAI structured outputs (`json_schema`, strict mode) for both the classifier and deduper calls; response is additionally validated against a schema on receipt. On validation failure, retry once with the validation error appended to the prompt; on a second failure, fail closed (no Gitea write) and exit `NOK`.
- **CLI I/O contract**: `triage "<report text>"` with a stdin fallback when no argument is given. Stdout is only ever `OK` (exit 0) or `NOK` (exit 1). `NOK` is reserved for LLM/API/validation failures, never for weird/off-topic input, which still resolves `OK`. `--debug`/`DEBUG=1` writes the full `ClassifiedReport`/`DedupResult` to stderr.
- **Execution environment**: new `triage` one-off service in `docker-compose.yml` (Node image), mounting the `gitea-shared` volume read-only to read the app token `seed_gitea.py` writes, reaching Gitea at `http://gitea:3000` over the compose network. Requires an `OPENAI_API_KEY` added to `.env`.

## Testing Decisions

- **Primary seam (highest-level, aim for one seam)**: the CLI entrypoint/orchestrator function, invoked with a fake OpenAI client (returns canned structured responses per test case) and a fake Gitea client (in-memory list of "open issues", records what it was called with). Assertions are on the observable outcome: `OK`/`NOK`, and which Gitea client method was invoked with which title/body/labels or which issue number. This exercises the real `classifier`→`deduper`→branching logic together, without hitting the network — prefer this over separately unit-testing each module in isolation.
- **Validation/retry-then-fail-closed logic**: worth a small, focused seam of its own — feed the shared schema validator malformed/borderline payloads directly to confirm retry-once-then-fail-closed behavior, since this is easy to get subtly wrong and hard to trigger reliably through the full orchestrator.
- **Good test = external behavior only**: assert on CLI exit code/stdout and Gitea-client call shape, not on internal classifier/deduper implementation details.
- **Scenario source**: Set B in [docs/sample-data.md](../../docs/sample-data.md) (B1–B8) supplies the canned-response scenarios for the fake OpenAI client — clean reports, vague input, severity/tone mismatch, likely duplicate, feature request, bundled multi-issue, and noisy/buried-signal reports.
- **No prior art in this repo yet** — this is the first module with tests; `seed/seed_gitea.py` has none to follow.

## Out of Scope

- Splitting a single report that bundles multiple unrelated problems (Set B7) into multiple issues — filed as one issue capturing everything mentioned.
- Embeddings/vector-similarity-based duplicate detection (see ADR-0001) — current approach won't scale past a small number of open issues.
- Interactive/REPL mode or an HTTP server — the CLI is one-shot only; the module split is meant to make adding either later straightforward, not to build them now.
- Automated CI test suite beyond the seams above — Set B self-testing for classification *quality* (as opposed to pipeline correctness) stays manual/eyeball for v1, upgrading later to treating created Gitea issues/comments as the verifiable artifact for separate input-validation and output-validation checks.
- Non-English input handling.
- Any auth/credential path other than the seeded admin token over the compose network (no host-side execution mode).
- Rate-limiting/backoff beyond the single structured-output retry.
- Multi-repo support — hardcoded to the one seeded repo.

## Further Notes

- ADR-0001 ([docs/adr/0001-llm-dedup-without-embeddings.md](../../docs/adr/0001-llm-dedup-without-embeddings.md)) and ADR-0002 ([docs/adr/0002-typescript-cli-as-compose-service.md](../../docs/adr/0002-typescript-cli-as-compose-service.md)) record the two decisions here that would otherwise surprise a reviewer.
- [CONTEXT.md](../../CONTEXT.md) has the resolved glossary for this feature (Report, Actionable bug report, Component label, Severity, Duplicate confidence) — use these terms, not synonyms, in code and issue bodies.
- Known limitation carried forward from ADR-0001: dedup accuracy/cost is untested at scale; fine for the seeded demo repo, not production-shaped.
