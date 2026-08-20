# 06: Trim seeded Gitea labels to the service's set

**What to build:** The seeded demo repo only ever carries the labels the triage service actually uses — no leakage of this repo's own dev-tracker vocabulary into Gitea.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] `TRIAGE_LABELS` block and its application removed from `seed/seed_gitea.py`
- [x] A fresh `docker compose down -v && docker compose up -d` seeds only `severity/*` (4) + the 8 component labels into the repo — no `needs-triage`/`needs-info`/`ready-for-agent`/`ready-for-human`/`wontfix`
- [x] `README.md`'s description of seeded labels (if any) updated to match
