## Agent skills

### Issue tracker

Issues and specs are tracked as local markdown files under `.scratch/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`) used as-is. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: root `CONTEXT.md` + `docs/adr/`. See `docs/agents/domain.md`.

## Git workflow

Never commit directly to `main`. Do all work on a feature branch and land it through a
pull request:

- Branch off `main` (e.g. `feature/<short-name>`), commit there.
- Push the branch and open a PR against `main` on the Gitea remote (`origin`,
  `http://localhost:3000`) — that's where this repo's PRs live; the `github` remote is an
  unrelated mirror.
- Gitea's PR API needs the app token written by the seed service to `/shared/gitea_token`,
  passed as an `Authorization: token <token>` header (basic auth is rejected for writes).
- Leave `main` for the human to merge; don't self-merge unless asked.
