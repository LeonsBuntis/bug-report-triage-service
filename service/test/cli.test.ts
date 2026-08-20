import { test } from "node:test";
import assert from "node:assert/strict";
import { isDebugEnabled, parseCliArgs, formatDebugOutput } from "../src/infra/cli";
import type { TriageResult } from "../src/core/orchestrator";
import type { ClassifiedReport, DedupResult } from "../src/core/types";

const NODE_SCRIPT = ["node", "index.js"];

test("--debug flag enables debug regardless of env", () => {
  assert.equal(isDebugEnabled([...NODE_SCRIPT, "--debug", "report"], {}), true);
});

test("DEBUG=1 env var enables debug", () => {
  assert.equal(isDebugEnabled([...NODE_SCRIPT, "report"], { DEBUG: "1" }), true);
});

test("DEBUG=0, empty, and false are treated as off", () => {
  assert.equal(isDebugEnabled([...NODE_SCRIPT, "report"], { DEBUG: "0" }), false);
  assert.equal(isDebugEnabled([...NODE_SCRIPT, "report"], { DEBUG: "" }), false);
  assert.equal(isDebugEnabled([...NODE_SCRIPT, "report"], { DEBUG: "false" }), false);
});

test("debug is off when neither flag nor env is set", () => {
  assert.equal(isDebugEnabled([...NODE_SCRIPT, "report"], {}), false);
});

test("parseCliArgs strips --debug so it is never treated as the report text", () => {
  assert.deepEqual(parseCliArgs([...NODE_SCRIPT, "--debug", "the report"], {}), {
    reportArg: "the report",
    debug: true,
  });
  assert.deepEqual(parseCliArgs([...NODE_SCRIPT, "the report", "--debug"], {}), {
    reportArg: "the report",
    debug: true,
  });
});

test("parseCliArgs returns no report arg when only stdin will supply it", () => {
  assert.deepEqual(parseCliArgs([...NODE_SCRIPT, "--debug"], {}), {
    reportArg: undefined,
    debug: true,
  });
});

const CLASSIFIED: ClassifiedReport = {
  title: "Cannot log in on iPhone Safari",
  severity: "high",
  components: ["frontend", "auth"],
  reproStepsProvided: true,
  reproSteps: ["Open the app in Safari on iPhone", "Enter details and tap login"],
};

test("formatDebugOutput includes the classification, dedup, and usage as JSON", () => {
  const dedup: DedupResult = {
    confidence: "certain",
    matchIssueNumber: 1,
    rationale: "Same failure as EXIST-1.",
  };
  const result: TriageResult = {
    outcome: "OK",
    classified: CLASSIFIED,
    dedup,
    usage: { prompt_tokens: 140, completion_tokens: 25, total_tokens: 165 },
  };

  const parsed = JSON.parse(formatDebugOutput(result));
  assert.deepEqual(parsed.classified, CLASSIFIED);
  assert.deepEqual(parsed.dedup, dedup);
  assert.deepEqual(parsed.usage, {
    prompt_tokens: 140,
    completion_tokens: 25,
    total_tokens: 165,
  });
});

test("formatDebugOutput omits fields that were never computed but always includes usage", () => {
  const result: TriageResult = {
    outcome: "NOK",
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  };

  const parsed = JSON.parse(formatDebugOutput(result));
  assert.equal("classified" in parsed, false);
  assert.equal("dedup" in parsed, false);
  assert.deepEqual(parsed.usage, {
    prompt_tokens: 0,
    completion_tokens: 0,
    total_tokens: 0,
  });
});
