# Bug Report Triage Service

Turns a free-text bug report into a structured, triaged issue in a self-hosted Gitea
instance, or a comment on an existing issue when the report is a confident duplicate.

## Language

**Report**:
The raw free-text input a user or teammate submits, before any classification. May or may not
describe an actual bug.

**Actionable bug report**:
A report the classifier determines is genuinely about a defect (has enough signal to assign a
component and severity). The service never refuses to process a report outright — even
off-topic input (feature requests, vague noise) still gets classified and filed, tagged with the
`unknown` component label, so nothing is silently dropped or fabricated with false confidence.
_Avoid_: valid report, real bug (these imply the service judges reports as worthy/unworthy,
which it doesn't — it always produces an artifact)

**Component label**:
One of the fixed set used by the service: `frontend`, `backend`, `api`, `auth`, `database`, `infra`,
`docs`, `unknown`. Non-exclusive — a report can carry more than one. `unknown` is the catch-all
for reports the classifier can't confidently place in a real component, including off-topic
input.

**Severity**:
One of `critical`/`high`/`medium`/`low`, applied as an exclusive `severity/*` Gitea label — every
filed issue gets exactly one, even ones classified `unknown`/off-topic (the label schema has no
"n/a" tier).

**Duplicate confidence**:
The classifier's judgment of how well a new report matches an existing open issue, one of three
tiers:
- `none` — no candidate resembles it; no note added.
- `suspected` — a candidate exists but isn't a sure match; the service still files a **new**
  issue but adds a note naming the suspected match, for a human to confirm.
- `certain` — the service comments on the existing issue instead of filing a new one.
_Avoid_: possible/likely/definite duplicate (collapsed into the three tiers above; don't
introduce finer gradations without updating this glossary)
