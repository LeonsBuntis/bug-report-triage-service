# Project overview

Bug Report Triage Service is a local-first tool for turning unstructured bug reports into useful Gitea issues. A TypeScript CLI sends the report to an LLM for structured classification, checks the result against open issues, and writes either a new issue or a duplicate comment.

## Processing flow

1. Read the report from a command-line argument or standard input.
2. Classify it into a title, severity, component labels, and any reproduction steps the reporter supplied.
3. Validate the structured response and retry once if it is invalid.
4. Compare the report with open Gitea issues. A confident duplicate gets a comment; a possible match is noted on a new issue for human review.
5. Write the resulting issue or comment to Gitea.

## Design constraints

- Preserve uncertainty. Vague and off-topic reports are still recorded with the `unknown` component label and low severity.
- Do not invent reproduction steps.
- Keep duplicate handling conservative: uncertain matches create a new issue with a note rather than silently merging reports.
- Keep classification, duplicate detection, and Gitea access in separate modules so each part can be changed independently.
- Keep CLI output script-friendly (`OK` or `NOK`) and put diagnostic details on stderr in debug mode.

The current duplicate check sends all open issues to one LLM call. This is simple for a small project but will need candidate retrieval if the issue list grows beyond a practical prompt size. Input limits, rate limits, and spend limits are also useful next steps for a deployed service.
