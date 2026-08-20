import { test } from "node:test";
import assert from "node:assert/strict";
import { OpenAIClassifier } from "../src/core/classifier";
import { OpenAIDeduper } from "../src/core/deduper";
import { runTriage } from "../src/core/orchestrator";
import type { ChatMessage, CallModel, ModelResponse } from "../src/core/structured-completion";
import type { CreateIssueInput, CreatedIssue, GiteaClient } from "../src/infra/gitea";
import type { ClassifiedReport, OpenIssue } from "../src/core/types";

// A model stub that replays a fixed queue of canned responses and records the messages it was
// called with, so tests can drive malformed-then-valid / malformed-twice and assert the retry fed
// the validation error back into the prompt.
function stubModel(responses: ModelResponse[]): {
  callModel: CallModel;
  calls: ChatMessage[][];
} {
  const calls: ChatMessage[][] = [];
  const callModel: CallModel = async (messages) => {
    calls.push(messages);
    const next = responses.shift();
    if (!next) throw new Error("stubModel ran out of canned responses");
    return next;
  };
  return { callModel, calls };
}

const VALID_CLASSIFICATION: ClassifiedReport = {
  title: "Profile picture upload hangs above 5MB",
  severity: "medium",
  components: ["frontend", "api"],
  reproStepsProvided: true,
  reproSteps: ["Upload a >5MB picture", "Spinner never resolves"],
};

function raw(content: string | null, usage: ModelResponse["usage"] = null): ModelResponse {
  return { content, usage };
}

class FakeGiteaClient implements GiteaClient {
  public readonly createCalls: CreateIssueInput[] = [];
  public readonly commentCalls: { issueNumber: number; body: string }[] = [];
  constructor(private readonly openIssues: OpenIssue[] = []) {}
  async listOpenIssues(): Promise<OpenIssue[]> {
    return this.openIssues;
  }
  async createIssue(input: CreateIssueInput): Promise<CreatedIssue> {
    this.createCalls.push(input);
    return { number: 1, url: "http://gitea.local/issue/1" };
  }
  async commentOnIssue(issueNumber: number, body: string): Promise<void> {
    this.commentCalls.push({ issueNumber, body });
  }
}

test("classifier recovers from a malformed-then-valid response after one retry", async () => {
  const stub = stubModel([
    raw("not json at all", {
      prompt_tokens: 100,
      completion_tokens: 10,
      total_tokens: 110,
    }),
    raw(JSON.stringify(VALID_CLASSIFICATION), {
      prompt_tokens: 120,
      completion_tokens: 15,
      total_tokens: 135,
    }),
  ]);
  const classifier = new OpenAIClassifier(stub.callModel);

  const result = await classifier.classify("some report");

  assert.deepEqual(result.report, VALID_CLASSIFICATION);
  assert.equal(stub.calls.length, 2);
  // Usage is summed across both attempts.
  assert.deepEqual(result.usage, {
    prompt_tokens: 220,
    completion_tokens: 25,
    total_tokens: 245,
  });
  // The retry fed the model's bad answer and the validation error back into the prompt.
  const retryMessages = stub.calls[1]!;
  assert.equal(retryMessages.at(-2)!.role, "assistant");
  assert.equal(retryMessages.at(-2)!.content, "not json at all");
  assert.equal(retryMessages.at(-1)!.role, "user");
  assert.match(retryMessages.at(-1)!.content, /did not match the required schema/i);
});

test("classifier fails closed when the response is malformed twice", async () => {
  const stub = stubModel([
    raw('{"severity":"medium"}'), // missing required fields
    raw("still not valid"),
  ]);
  const classifier = new OpenAIClassifier(stub.callModel);

  await assert.rejects(
    () => classifier.classify("some report"),
    /schema validation after one retry/i,
  );
  assert.equal(stub.calls.length, 2);
});

test("deduper recovers from a malformed-then-valid response after one retry", async () => {
  const stub = stubModel([
    raw("{ broken json"),
    raw(
      JSON.stringify({
        confidence: "certain",
        matchIssueNumber: 1,
        rationale: "same login bug",
      }),
    ),
  ]);
  const deduper = new OpenAIDeduper(stub.callModel);
  const openIssues: OpenIssue[] = [{ number: 1, title: "Login broken", body: "cannot log in" }];

  const outcome = await deduper.dedupe(VALID_CLASSIFICATION, openIssues);

  assert.equal(stub.calls.length, 2);
  assert.deepEqual(outcome.result, {
    confidence: "certain",
    matchIssueNumber: 1,
    rationale: "same login bug",
  });
});

test("deduper fails closed when the response is malformed twice", async () => {
  const stub = stubModel([
    raw('{"confidence":"maybe"}'), // invalid enum value
    raw("garbage"),
  ]);
  const deduper = new OpenAIDeduper(stub.callModel);
  const openIssues: OpenIssue[] = [{ number: 1, title: "Login broken", body: "cannot log in" }];

  await assert.rejects(
    () => deduper.dedupe(VALID_CLASSIFICATION, openIssues),
    /schema validation after one retry/i,
  );
  assert.equal(stub.calls.length, 2);
});

test("a classifier that fails validation twice drives NOK and zero Gitea writes", async () => {
  const gitea = new FakeGiteaClient();
  const classifier = new OpenAIClassifier(stubModel([raw("nope"), raw("still nope")]).callModel);

  const result = await runTriage("some report", {
    classifier,
    deduper: new OpenAIDeduper(stubModel([]).callModel),
    giteaClient: gitea,
  });

  assert.equal(result.outcome, "NOK");
  assert.equal(gitea.createCalls.length, 0);
  assert.equal(gitea.commentCalls.length, 0);
});

test("a deduper that fails validation twice drives NOK and zero Gitea writes", async () => {
  const gitea = new FakeGiteaClient([{ number: 1, title: "Login broken", body: "cannot log in" }]);
  const classifier = new OpenAIClassifier(
    stubModel([raw(JSON.stringify(VALID_CLASSIFICATION))]).callModel,
  );
  const deduper = new OpenAIDeduper(stubModel([raw("bad"), raw("worse")]).callModel);

  const result = await runTriage("some report", {
    classifier,
    deduper,
    giteaClient: gitea,
  });

  assert.equal(result.outcome, "NOK");
  assert.equal(gitea.createCalls.length, 0);
  assert.equal(gitea.commentCalls.length, 0);
});
