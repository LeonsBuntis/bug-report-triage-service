import { test } from "node:test";
import assert from "node:assert/strict";
import { runTriage } from "../src/core/orchestrator";
import type { Classifier, ClassificationResult } from "../src/core/classifier";
import type { Deduper, DedupOutcome } from "../src/core/deduper";
import type { CreateIssueInput, CreatedIssue, GiteaClient } from "../src/infra/gitea";
import type { ClassifiedReport, DedupResult, OpenIssue, TokenUsage } from "../src/core/types";

class FakeClassifier implements Classifier {
  constructor(
    private readonly result: ClassifiedReport | Error,
    private readonly usage: TokenUsage | null = null,
  ) {}
  async classify(_reportText: string): Promise<ClassificationResult> {
    if (this.result instanceof Error) throw this.result;
    return { report: this.result, usage: this.usage };
  }
}

class FakeDeduper implements Deduper {
  public readonly calls: {
    report: ClassifiedReport;
    openIssues: OpenIssue[];
  }[] = [];
  constructor(
    private readonly result: DedupResult | Error = { confidence: "none" },
    private readonly usage: TokenUsage | null = null,
  ) {}
  async dedupe(report: ClassifiedReport, openIssues: OpenIssue[]): Promise<DedupOutcome> {
    this.calls.push({ report, openIssues });
    if (this.result instanceof Error) throw this.result;
    return { result: this.result, usage: this.usage };
  }
}

class FakeGiteaClient implements GiteaClient {
  public readonly createCalls: CreateIssueInput[] = [];
  public readonly commentCalls: { issueNumber: number; body: string }[] = [];
  constructor(
    private readonly openIssues: OpenIssue[] = [],
    private readonly behavior: "succeed" | "fail" = "succeed",
  ) {}
  async listOpenIssues(): Promise<OpenIssue[]> {
    return this.openIssues;
  }
  async createIssue(input: CreateIssueInput): Promise<CreatedIssue> {
    this.createCalls.push(input);
    if (this.behavior === "fail") throw new Error("gitea unreachable");
    return { number: 1, url: "http://gitea.local/issue/1" };
  }
  async commentOnIssue(issueNumber: number, body: string): Promise<void> {
    this.commentCalls.push({ issueNumber, body });
    if (this.behavior === "fail") throw new Error("gitea unreachable");
  }
}

const EXISTING_ISSUES: OpenIssue[] = [
  {
    number: 1,
    title: "Login button unresponsive on mobile Safari",
    body: 'Multiple users report that on iOS Safari the "Log in" button does nothing when tapped.',
  },
  {
    number: 2,
    title: "CSV export times out for large datasets",
    body: "504 on >50k rows.",
  },
];

test("creates a labeled Gitea issue and returns OK for a clean, classified report", async () => {
  const classified: ClassifiedReport = {
    title: "Profile picture upload hangs above 5MB",
    severity: "medium",
    components: ["frontend", "api"],
    reproStepsProvided: true,
    reproSteps: [
      "Upload a profile picture larger than ~5MB (tested 8MB PNG and 12MB JPEG)",
      "Observe the spinner never resolves and the picture never saves",
    ],
  };
  const gitea = new FakeGiteaClient();

  const result = await runTriage("some report text", {
    classifier: new FakeClassifier(classified),
    deduper: new FakeDeduper({ confidence: "none" }),
    giteaClient: gitea,
  });

  assert.equal(result.outcome, "OK");
  assert.equal(gitea.createCalls.length, 1);
  const call = gitea.createCalls[0]!;
  assert.equal(call.title, classified.title);
  assert.deepEqual(call.labels.slice().sort(), ["api", "frontend", "severity/medium"].sort());
  assert.match(call.body, /Upload a profile picture larger than ~5MB/);
});

test("records explicit 'no reproduction steps provided' text instead of inventing steps", async () => {
  const classified: ClassifiedReport = {
    title: "Search sometimes returns no results",
    severity: "medium",
    components: ["backend"],
    reproStepsProvided: false,
    reproSteps: [],
  };
  const gitea = new FakeGiteaClient();

  await runTriage("vague report", {
    classifier: new FakeClassifier(classified),
    deduper: new FakeDeduper({ confidence: "none" }),
    giteaClient: gitea,
  });

  assert.match(gitea.createCalls[0]!.body, /No reproduction steps were provided/i);
});

test("returns NOK and never touches Gitea or the deduper when classification fails", async () => {
  const gitea = new FakeGiteaClient();
  const deduper = new FakeDeduper();

  const result = await runTriage("some report", {
    classifier: new FakeClassifier(new Error("openai unreachable")),
    deduper,
    giteaClient: gitea,
  });

  assert.equal(result.outcome, "NOK");
  assert.equal(deduper.calls.length, 0);
  assert.equal(gitea.createCalls.length, 0);
  assert.equal(gitea.commentCalls.length, 0);
});

test("returns NOK when the Gitea write fails", async () => {
  const classified: ClassifiedReport = {
    title: "x",
    severity: "low",
    components: ["unknown"],
    reproStepsProvided: false,
    reproSteps: [],
  };

  const result = await runTriage("some report", {
    classifier: new FakeClassifier(classified),
    deduper: new FakeDeduper({ confidence: "none" }),
    giteaClient: new FakeGiteaClient([], "fail"),
  });

  assert.equal(result.outcome, "NOK");
});

test("returns NOK and never writes to Gitea when the dedup call fails", async () => {
  const classified: ClassifiedReport = {
    title: "x",
    severity: "low",
    components: ["backend"],
    reproStepsProvided: false,
    reproSteps: [],
  };
  const gitea = new FakeGiteaClient(EXISTING_ISSUES);

  const result = await runTriage("some report", {
    classifier: new FakeClassifier(classified),
    deduper: new FakeDeduper(new Error("dedup call failed")),
    giteaClient: gitea,
  });

  assert.equal(result.outcome, "NOK");
  assert.equal(gitea.createCalls.length, 0);
  assert.equal(gitea.commentCalls.length, 0);
});

test("certain match comments on the existing issue and creates no new issue (Set B5)", async () => {
  const classified: ClassifiedReport = {
    title: "Cannot log in on iPhone Safari",
    severity: "high",
    components: ["frontend", "auth"],
    reproStepsProvided: true,
    reproSteps: [
      "Open the app in Safari on iPhone",
      "Enter details and tap login",
      "Nothing happens",
    ],
  };
  const gitea = new FakeGiteaClient(EXISTING_ISSUES);

  const result = await runTriage("Set B5 report text", {
    classifier: new FakeClassifier(classified),
    deduper: new FakeDeduper({
      confidence: "certain",
      matchIssueNumber: 1,
      rationale: "Same mobile-Safari login button failure as EXIST-1.",
    }),
    giteaClient: gitea,
  });

  assert.equal(result.outcome, "OK");
  assert.equal(gitea.createCalls.length, 0);
  assert.equal(gitea.commentCalls.length, 1);
  const comment = gitea.commentCalls[0]!;
  assert.equal(comment.issueNumber, 1);
  assert.match(comment.body, /Set B5 report text/);
  assert.match(comment.body, /Same mobile-Safari login button failure/);
});

test("suspected match creates a new issue whose body names the suspected match and rationale", async () => {
  const classified: ClassifiedReport = {
    title: "Login fails intermittently on some phones",
    severity: "high",
    components: ["auth"],
    reproStepsProvided: false,
    reproSteps: [],
  };
  const gitea = new FakeGiteaClient(EXISTING_ISSUES);

  const result = await runTriage("some report", {
    classifier: new FakeClassifier(classified),
    deduper: new FakeDeduper({
      confidence: "suspected",
      matchIssueNumber: 1,
      rationale: "Might be the same login issue, but the platform is unclear.",
    }),
    giteaClient: gitea,
  });

  assert.equal(result.outcome, "OK");
  assert.equal(gitea.commentCalls.length, 0);
  assert.equal(gitea.createCalls.length, 1);
  const body = gitea.createCalls[0]!.body;
  assert.match(body, /#1/);
  assert.match(body, /Might be the same login issue/);
});

test("no match creates a clean new issue with no duplicate note (Set B1)", async () => {
  const classified: ClassifiedReport = {
    title: "Profile picture upload hangs above 5MB",
    severity: "medium",
    components: ["frontend", "api"],
    reproStepsProvided: true,
    reproSteps: ["Upload a picture larger than ~5MB", "Spinner never resolves"],
  };
  const gitea = new FakeGiteaClient(EXISTING_ISSUES);

  const result = await runTriage("Set B1 report text", {
    classifier: new FakeClassifier(classified),
    deduper: new FakeDeduper({ confidence: "none" }),
    giteaClient: gitea,
  });

  assert.equal(result.outcome, "OK");
  assert.equal(gitea.commentCalls.length, 0);
  assert.equal(gitea.createCalls.length, 1);
  const body = gitea.createCalls[0]!.body;
  assert.doesNotMatch(body, /duplicate/i);
  assert.doesNotMatch(body, /suspected/i);
});

test("passes the classified report and open issues through to the deduper", async () => {
  const classified: ClassifiedReport = {
    title: "Something broke",
    severity: "medium",
    components: ["backend"],
    reproStepsProvided: false,
    reproSteps: [],
  };
  const deduper = new FakeDeduper({ confidence: "none" });
  const gitea = new FakeGiteaClient(EXISTING_ISSUES);

  await runTriage("some report", {
    classifier: new FakeClassifier(classified),
    deduper,
    giteaClient: gitea,
  });

  assert.equal(deduper.calls.length, 1);
  assert.deepEqual(deduper.calls[0]!.report, classified);
  assert.deepEqual(deduper.calls[0]!.openIssues, EXISTING_ISSUES);
});

test("surfaces the full classification and dedup decision on the create path (--debug source)", async () => {
  const classified: ClassifiedReport = {
    title: "Profile picture upload hangs above 5MB",
    severity: "medium",
    components: ["frontend", "api"],
    reproStepsProvided: true,
    reproSteps: ["Upload a picture larger than ~5MB", "Spinner never resolves"],
  };
  const dedup: DedupResult = { confidence: "none" };
  const gitea = new FakeGiteaClient(EXISTING_ISSUES);

  const result = await runTriage("Set B1 report text", {
    classifier: new FakeClassifier(classified),
    deduper: new FakeDeduper(dedup),
    giteaClient: gitea,
  });

  assert.equal(result.outcome, "OK");
  assert.deepEqual(result.classified, classified);
  assert.deepEqual(result.dedup, dedup);
});

test("surfaces the full classification and dedup decision on the comment path (--debug source)", async () => {
  const classified: ClassifiedReport = {
    title: "Cannot log in on iPhone Safari",
    severity: "high",
    components: ["frontend", "auth"],
    reproStepsProvided: true,
    reproSteps: ["Open the app in Safari on iPhone", "Enter details and tap login"],
  };
  const dedup: DedupResult = {
    confidence: "certain",
    matchIssueNumber: 1,
    rationale: "Same mobile-Safari login button failure as EXIST-1.",
  };
  const gitea = new FakeGiteaClient(EXISTING_ISSUES);

  const result = await runTriage("Set B5 report text", {
    classifier: new FakeClassifier(classified),
    deduper: new FakeDeduper(dedup),
    giteaClient: gitea,
  });

  assert.equal(result.outcome, "OK");
  assert.equal(gitea.commentCalls.length, 1);
  assert.deepEqual(result.classified, classified);
  assert.deepEqual(result.dedup, dedup);
});

test("aggregates token usage across the classifier and deduper calls", async () => {
  const classified: ClassifiedReport = {
    title: "Something broke",
    severity: "medium",
    components: ["backend"],
    reproStepsProvided: false,
    reproSteps: [],
  };
  const gitea = new FakeGiteaClient(EXISTING_ISSUES);

  const result = await runTriage("some report", {
    classifier: new FakeClassifier(classified, {
      prompt_tokens: 100,
      completion_tokens: 20,
      total_tokens: 120,
    }),
    deduper: new FakeDeduper(
      { confidence: "none" },
      {
        prompt_tokens: 40,
        completion_tokens: 5,
        total_tokens: 45,
      },
    ),
    giteaClient: gitea,
  });

  assert.deepEqual(result.usage, {
    prompt_tokens: 140,
    completion_tokens: 25,
    total_tokens: 165,
  });
});

test("reports zero usage when no call carried a usage object", async () => {
  const classified: ClassifiedReport = {
    title: "Something broke",
    severity: "low",
    components: ["backend"],
    reproStepsProvided: false,
    reproSteps: [],
  };

  const result = await runTriage("some report", {
    classifier: new FakeClassifier(classified),
    deduper: new FakeDeduper({ confidence: "none" }),
    giteaClient: new FakeGiteaClient(),
  });

  assert.deepEqual(result.usage, {
    prompt_tokens: 0,
    completion_tokens: 0,
    total_tokens: 0,
  });
});

test("still surfaces the classification and counted usage when the Gitea write fails", async () => {
  const classified: ClassifiedReport = {
    title: "x",
    severity: "low",
    components: ["backend"],
    reproStepsProvided: false,
    reproSteps: [],
  };

  const result = await runTriage("some report", {
    classifier: new FakeClassifier(classified, {
      prompt_tokens: 10,
      completion_tokens: 2,
      total_tokens: 12,
    }),
    deduper: new FakeDeduper({ confidence: "none" }),
    giteaClient: new FakeGiteaClient([], "fail"),
  });

  assert.equal(result.outcome, "NOK");
  assert.deepEqual(result.classified, classified);
  assert.equal(result.usage.total_tokens, 12);
});
