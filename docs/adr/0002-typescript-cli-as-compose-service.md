# TypeScript CLI packaged as a docker-compose one-off service

The triage CLI is written in Node.js/TypeScript and runs only as a one-off `docker-compose`
service (`triage`), mounting the same `gitea-shared` volume that `seed/seed_gitea.py` writes its
app token to, and reaching Gitea over the compose network — even though the rest of the repo's
tooling (`seed/seed_gitea.py`, `docker-compose.yml` orchestration) is Python.

This was a deliberate choice, not a repo convention: TypeScript for the service itself, Python
kept for infra/seeding. The CLI has no supported way to run outside the compose network (no
host-side token/URL path) — don't "fix" the language split or try to run it standalone without
also replicating that wiring.
