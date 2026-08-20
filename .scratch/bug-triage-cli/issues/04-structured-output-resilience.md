# 04: Structured-output resilience — retry once, then fail closed

**What to build:** Both LLM call sites (classifier, deduper) validate their structured response and recover from a single bad response without ever writing garbage to Gitea.

**Blocked by:** 01, 02

**Status:** done

- [x] Both the classifier's and the deduper's structured-output responses are validated against a schema on receipt
- [x] On a validation failure, the call is retried exactly once, with the validation error fed back into the prompt
- [x] A second consecutive validation failure results in `NOK`, exit nonzero, and zero Gitea writes (no issue created, no comment posted)
- [x] Test seam simulates malformed-then-valid (succeeds after the retry) and malformed-twice (fails closed) for both the classifier and deduper call sites
