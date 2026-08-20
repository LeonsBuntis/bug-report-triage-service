# Bug Report Triage Service

A small, self-hosted service that turns free-text bug reports into structured issues. It uses an LLM to extract a title, severity, component labels, and reproduction steps, then checks open Gitea issues for duplicates before creating or commenting on an issue.

The service is designed to keep the LLM's output reviewable: responses use structured output, validation retries once, missing reproduction steps stay explicit, and uncertain duplicate matches are recorded for a maintainer to review.

## Run locally

Requirements: Docker Desktop (or Docker Engine) with Compose v2.20 or later.

```sh
cp .env.example .env           # On Windows PowerShell: Copy-Item .env.example .env
docker compose up -d
docker compose logs -f seed
```

Open [http://localhost:3000](http://localhost:3000) and sign in with `GITEA_ADMIN_USER` and `GITEA_ADMIN_PASSWORD` from `.env` (defaults: `admin` / `ChangeMe123!`). The `bug-triage-service` repository is seeded with sample issues and labels.

Add an API key to `.env` as `OPENAI_API_KEY`, then submit a report:

```sh
docker compose run --rm triage "Profile pictures over ~5MB spin forever and never save."
```

The CLI also reads a report from stdin when no argument is given. It prints `OK` or `NOK`; the detailed result is written to the Gitea issue or comment. Add `--debug` to print the classification and duplicate decision to stderr.

## Choose an LLM backend

OpenAI is the default. To use a local Ollama instance instead, set `LLM_PROVIDER=ollama` in `.env`; the defaults use `qwen3.5:latest` at `http://host.docker.internal:11434/v1`. Pull the model with `ollama pull qwen3.5` before running the CLI.

## Project notes

- [Project overview](docs/project-overview.md) describes the pipeline and its design constraints.
- [Sample reports and seed issues](docs/sample-data.md) provide repeatable inputs for local exploration.
- [Architecture decisions](docs/adr/) record the main implementation choices.

## Reset local data

```sh
docker compose down -v   # Removes the local Gitea data volume
docker compose up -d
```
