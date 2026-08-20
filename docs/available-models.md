# LLM configuration

The service supports two providers, selected with `LLM_PROVIDER` in `.env`:

- `openai` uses `OPENAI_API_KEY`, `OPENAI_BASE_URL`, and `OPENAI_MODEL`.
- `ollama` uses `OLLAMA_BASE_URL` and `OLLAMA_MODEL` with an OpenAI-compatible local endpoint.

The defaults are listed in [.env.example](../.env.example). Select a model available to your
provider account and confirm that it supports structured outputs, which the classifier and
duplicate detector require. Provider catalogs and model capabilities change over time, so check
the provider's current documentation when changing models.

The Ollama path uses the same OpenAI SDK with a different base URL. It has been exercised with
`qwen3.5:latest`; reproduction-step extraction was less consistent than with stronger hosted
models, so review its output when using smaller local models.
