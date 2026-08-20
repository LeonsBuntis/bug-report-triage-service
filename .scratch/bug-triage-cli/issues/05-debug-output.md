# 05: `--debug` output

**What to build:** A development-only visibility flag that surfaces the full classification and dedup decision — plus the OpenAI token usage per run — without touching the production stdout contract.

**Blocked by:** 02

**Status:** done

- [x] `--debug` flag or `DEBUG=1` env var prints the full `ClassifiedReport` and `DedupResult` (when computed) as JSON to **stderr**
- [x] stdout remains exactly `OK` or `NOK` regardless of `--debug`
- [x] `--debug` also prints the OpenAI token usage (`prompt_tokens`/`completion_tokens`/`total_tokens` from each API response's `usage` object) to **stderr**, aggregated across the classifier and deduper calls — the key is a restricted inference-only key with no billing/usage read scope, so client-side token counts are the only way to track spend against the $50 cap
- [x] Verified on both a create-path run (no debug output missing any field) and a comment-path (certain duplicate) run
