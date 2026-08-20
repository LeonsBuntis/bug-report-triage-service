import OpenAI from "openai";
import { ClassifiedReport, ClassifiedReportSchema, type TokenUsage } from "./types";
import { completeStructured, type CallModel } from "./structured-completion";
import { openAiModel } from "../infra/openai";

export interface ClassificationResult {
  report: ClassifiedReport;
  usage: TokenUsage | null;
}

export interface Classifier {
  classify(reportText: string): Promise<ClassificationResult>;
}

// TODO: improve prompt with explicit criteria to avoid it reasoning about what is considered critical, low, etc.
const SYSTEM_PROMPT = `
You triage raw, free-text bug reports for a software team's issue tracker.

Given a report, produce:
- title: a short, concrete summary (not the reporter's words verbatim if they're vague).
- severity: judge by actual technical impact, not the reporter's tone. All-caps/"CRITICAL"/"URGENT"
  language does not raise severity on its own - a cosmetic issue is "low" even if the reporter is
  shouting about it.
- components: one or more of frontend, backend, api, auth, database, infra, docs, unknown. Use
  "unknown" (and only "unknown") when the report isn't really an actionable bug (e.g. a feature
  request) or gives no signal about which part of the system is involved.
- reproStepsProvided / reproSteps: extract reproduction steps ONLY if the reporter actually gave
  them. Never invent steps that weren't in the report. If none were given, set
  reproStepsProvided to false and reproSteps to an empty array.`;

export class OpenAIClassifier implements Classifier {
  static create(client: OpenAI, model: string): OpenAIClassifier {
    return new OpenAIClassifier(
      openAiModel(client, model, ClassifiedReportSchema, "classified_report"),
    );
  }

  constructor(private readonly callModel: CallModel) {}

  async classify(reportText: string): Promise<ClassificationResult> {
    const { value, usage } = await completeStructured(this.callModel, ClassifiedReportSchema, [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: reportText },
    ]);
    return { report: applyUnknownSeverityFloor(value), usage };
  }
}

// A report whose only component is "unknown" isn't an actionable bug (e.g. a feature request),
// so it's deprioritized to "low" in code regardless of the severity the model returned.
export function applyUnknownSeverityFloor(classified: ClassifiedReport): ClassifiedReport {
  const unknownOnly = classified.components.length === 1 && classified.components[0] === "unknown";
  return unknownOnly ? { ...classified, severity: "low" } : classified;
}
