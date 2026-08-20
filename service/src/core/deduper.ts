import OpenAI from "openai";
import { z } from "zod";
import type { ClassifiedReport, DedupResult, OpenIssue, TokenUsage } from "./types";
import { completeStructured, type CallModel } from "./structured-completion";
import { openAiModel } from "../infra/openai";

export interface DedupOutcome {
  result: DedupResult;
  usage: TokenUsage | null;
}

export interface Deduper {
  dedupe(report: ClassifiedReport, openIssues: OpenIssue[]): Promise<DedupOutcome>;
}

const DedupWireSchema = z.object({
  confidence: z.enum(["none", "suspected", "certain"]),
  matchIssueNumber: z.number().int().nullable(),
  rationale: z.string().nullable(),
});

const SYSTEM_PROMPT = `You decide whether a newly-classified bug report duplicates an existing open issue.

You are given the new report and a list of currently-open issues (each with its number, title,
and body). Pick the single best-matching existing issue, if any, and judge your confidence:
- "certain": the new report is clearly the same bug as an existing issue. Set matchIssueNumber
  to that issue's number and give a one-sentence rationale.
- "suspected": an existing issue might be the same bug, but you are not sure. Set matchIssueNumber
  and give a rationale explaining the uncertainty.
- "none": no existing issue plausibly matches. Leave matchIssueNumber and rationale null.

Only match on the actual defect, not on superficial word overlap. When in doubt between
"certain" and "suspected", choose "suspected" - a human confirms suspected matches.`;

export class OpenAIDeduper implements Deduper {
  static create(client: OpenAI, model: string): OpenAIDeduper {
    return new OpenAIDeduper(openAiModel(client, model, DedupWireSchema, "dedup_result"));
  }

  constructor(private readonly callModel: CallModel) {}

  async dedupe(report: ClassifiedReport, openIssues: OpenIssue[]): Promise<DedupOutcome> {
    // Nothing to compare against - skip the API call and file cleanly.
    if (openIssues.length === 0) {
      return { result: { confidence: "none" }, usage: null };
    }

    const { value, usage } = await completeStructured(this.callModel, DedupWireSchema, [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildUserPrompt(report, openIssues) },
    ]);

    return {
      result: {
        confidence: value.confidence,
        matchIssueNumber: value.matchIssueNumber ?? undefined,
        rationale: value.rationale ?? undefined,
      },
      usage,
    };
  }
}

function buildUserPrompt(report: ClassifiedReport, openIssues: OpenIssue[]): string {
  const candidates = openIssues
    .map((issue) => `#${issue.number} — ${issue.title}\n${issue.body}`)
    .join("\n\n---\n\n");

  const reproSection = report.reproStepsProvided ? report.reproSteps.join("\n") : "(none provided)";

  return `New report:
Title: ${report.title}
Components: ${report.components.join(", ")}
Reproduction steps: ${reproSection}

Open issues to compare against:

${candidates}`;
}
