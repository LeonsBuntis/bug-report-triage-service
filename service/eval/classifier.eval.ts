import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { OpenAIClassifier } from "../src/core/classifier";
import { resolveLlmConfig } from "../src/infra/openai";

// Load the repo-root .env so a case works whether launched via `npm run eval` or by running a
// single test from the VS Code test UI. Throws if absent, which fails the eval as intended.
process.loadEnvFile(resolve(import.meta.dirname, "../../.env"));

// Evals hit the real LLM configured in .env. resolveLlmConfig throws when no key is configured.
const { client, model } = resolveLlmConfig(process.env);
const classifier = OpenAIClassifier.create(client, model);

// TODO: severity is an ordinal scale and the model is nondeterministic, so strict equality is
// brittle. For v2, score with tolerance (e.g. allow off-by-one) instead of hard-failing.
async function expectSeverity(text: string, expected: string): Promise<void> {
  const { report } = await classifier.classify(text);
  assert.equal(report.severity, expected);
}

test("severity: production completely down -> critical", () =>
  expectSeverity(
    "The production system is completely down. No users can access any functionality.",
    "critical",
  ));

test("severity: users can't log in -> medium", () =>
  expectSeverity("Users can't log in.", "medium"));

test("severity: vague 'application is broken' -> low", () =>
  expectSeverity("The application is broken.", "low"));
