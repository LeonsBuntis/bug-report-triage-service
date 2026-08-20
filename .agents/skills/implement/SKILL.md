---
name: implement
description: "Implement a piece of work based on a spec or set of tickets."
disable-model-invocation: true
---

Implement the work described by the user in the spec or tickets.

Use /tdd where possible, at pre-agreed seams.

Run typechecking regularly, single test files regularly, and the full test suite once at the end.

Before review, run the quality gate from `service/`: `npm run check` (typecheck + lint + format:check),
fixing findings with `npm run lint:fix` and `npm run format`. It must pass clean.

Once done, use /code-review to review the work.

Commit your work to a feature branch and open a pull request against `main` — never commit
directly to `main` (see the Git workflow section in `AGENTS.md`).
