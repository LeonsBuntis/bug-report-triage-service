# 02: Duplicate detection & certain/suspected/none branching

**What to build:** The dedup check against existing open Gitea issues, and the three-way branch it drives — comment on a certain match, new issue with a note on a suspected match, plain new issue when there's no match.

**Blocked by:** 01

**Status:** done

- [x] `deduper` module takes the classified report plus all currently open Gitea issues and returns `{ confidence: 'none'|'suspected'|'certain', matchIssueNumber?, rationale? }` via an OpenAI structured-output call
- [x] `certain` confidence comments on the matched issue (new report text + rationale) and does **not** create a new issue
- [x] `suspected` confidence creates a new issue whose body names the suspected match and the rationale, for a human to confirm
- [x] `none` confidence creates a new issue with no duplicate note
- [x] Feeding Set B5 against the seeded issues results in a comment on the login/Safari issue (`EXIST-1`), not a new issue — covered by the orchestrator seam's canned-B5 test asserting a comment on issue #1 and no create call
- [x] Feeding Set B1 still results in a clean new issue with no duplicate note — covered by the orchestrator seam's canned-B1 test asserting a create call with no dedup note
- [x] The ticket-01 test seam covers all three branches, asserting on which fake-Gitea-client method was called with what arguments
