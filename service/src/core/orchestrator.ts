import type { ClassifiedReport, DedupResult, TokenUsage } from "./types";
import type { Classifier } from "./classifier";
import type { Deduper } from "./deduper";
import type { GiteaClient } from "../infra/gitea";
import { buildCreateIssueInput, buildDuplicateComment } from "../infra/issue-content";
import { addUsage, emptyUsage } from "../infra/usage";

export interface RunTriageDeps {
  classifier: Classifier;
  deduper: Deduper;
  giteaClient: GiteaClient;
}

export type TriageOutcome = "OK" | "NOK";

export interface TriageResult {
  outcome: TriageOutcome;
  classified?: ClassifiedReport;
  dedup?: DedupResult;
  usage: TokenUsage;
}

export async function runTriage(reportText: string, deps: RunTriageDeps): Promise<TriageResult> {
  const usage = emptyUsage();

  let classified: ClassifiedReport;
  try {
    const classification = await deps.classifier.classify(reportText);
    classified = classification.report;
    addUsage(usage, classification.usage);
  } catch {
    return { outcome: "NOK", usage };
  }

  // the deduplication is quite straightforward due to time and scope constraints, see adr-0001.
  // TODO: add idempotency logic to avoid creating same comments on existing issues, if there's exact match of input
  let dedup: DedupResult;
  try {
    const openIssues = await deps.giteaClient.listOpenIssues();
    const dedupOutcome = await deps.deduper.dedupe(classified, openIssues);
    dedup = dedupOutcome.result;
    addUsage(usage, dedupOutcome.usage);
  } catch {
    return { outcome: "NOK", classified, usage };
  }

  try {
    if (dedup.confidence === "certain" && dedup.matchIssueNumber !== undefined) {
      await deps.giteaClient.commentOnIssue(
        dedup.matchIssueNumber,
        buildDuplicateComment(reportText, dedup),
      );
    } else {
      await deps.giteaClient.createIssue(buildCreateIssueInput(classified, dedup));
    }
  } catch {
    return { outcome: "NOK", classified, dedup, usage };
  }

  return { outcome: "OK", classified, dedup, usage };
}
