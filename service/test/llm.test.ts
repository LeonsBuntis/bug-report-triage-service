import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveLlmConfig } from "../src/infra/openai";

test("defaults to OpenAI with gpt-5.4-nano when no provider is set", () => {
  const config = resolveLlmConfig({ OPENAI_API_KEY: "sk-test" });
  assert.equal(config.model, "gpt-5.4-nano");
  assert.equal(config.client.baseURL, "https://api.openai.com/v1");
});

test("OpenAI provider honors OPENAI_MODEL and OPENAI_BASE_URL overrides", () => {
  const config = resolveLlmConfig({
    LLM_PROVIDER: "openai",
    OPENAI_API_KEY: "sk-test",
    OPENAI_MODEL: "gpt-5.5",
    OPENAI_BASE_URL: "https://proxy.example/v1",
  });
  assert.equal(config.model, "gpt-5.5");
  assert.equal(config.client.baseURL, "https://proxy.example/v1");
});

test("OpenAI provider throws when the API key is missing", () => {
  assert.throws(() => resolveLlmConfig({ LLM_PROVIDER: "openai" }), /OPENAI_API_KEY/);
});

test("Ollama provider defaults to host.docker.internal and qwen3.5", () => {
  const config = resolveLlmConfig({ LLM_PROVIDER: "ollama" });
  assert.equal(config.model, "qwen3.5:latest");
  assert.equal(config.client.baseURL, "http://host.docker.internal:11434/v1");
});

test("Ollama provider honors OLLAMA_MODEL and OLLAMA_BASE_URL overrides", () => {
  const config = resolveLlmConfig({
    LLM_PROVIDER: "ollama",
    OLLAMA_MODEL: "llama3.1",
    OLLAMA_BASE_URL: "http://localhost:11434/v1",
  });
  assert.equal(config.model, "llama3.1");
  assert.equal(config.client.baseURL, "http://localhost:11434/v1");
});

test("provider selection is case-insensitive", () => {
  const config = resolveLlmConfig({ LLM_PROVIDER: "Ollama" });
  assert.equal(config.model, "qwen3.5:latest");
});

test("throws on an unknown provider", () => {
  assert.throws(() => resolveLlmConfig({ LLM_PROVIDER: "anthropic" }), /Unknown LLM_PROVIDER/);
});
