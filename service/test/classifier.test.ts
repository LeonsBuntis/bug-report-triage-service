import { test } from "node:test";
import assert from "node:assert/strict";
import { OpenAIClassifier } from "../src/core/classifier";
import type { CallModel } from "../src/core/structured-completion";
import type { ClassifiedReport } from "../src/core/types";

function stubModel(report: ClassifiedReport): CallModel {
  return async () => ({ content: JSON.stringify(report), usage: null });
}

test("classify floors severity to low when the only component is 'unknown' (Set B6 off-topic)", async () => {
  // The model may return an inflated severity for a non-actionable report; the unknown-only
  // floor deprioritizes it in code regardless of what the model said.
  const classifier = new OpenAIClassifier(
    stubModel({
      title: "Please add a dark mode",
      severity: "high",
      components: ["unknown"],
      reproStepsProvided: false,
      reproSteps: [],
    }),
  );

  const { report } = await classifier.classify("It would be great to have dark mode");

  assert.equal(report.severity, "low");
});

test("classify leaves severity untouched when 'unknown' is mixed with a real component", async () => {
  const classifier = new OpenAIClassifier(
    stubModel({
      title: "Something odd in the backend",
      severity: "high",
      components: ["backend", "unknown"],
      reproStepsProvided: false,
      reproSteps: [],
    }),
  );

  const { report } = await classifier.classify("some report");

  assert.equal(report.severity, "high");
});
