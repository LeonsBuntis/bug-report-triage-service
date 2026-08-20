import type { ClassifiedReport, DedupResult } from "../core/types";
import type { CreateIssueInput } from "./gitea";

// Maps a classified report into Gitea's create-issue payload: a severity label plus one label per
// component, and a body with repro steps and any suspected-duplicate flag.
export function buildCreateIssueInput(
  classified: ClassifiedReport,
  dedup: DedupResult,
): CreateIssueInput {
  return {
    title: classified.title,
    body: buildIssueBody(classified, dedup),
    labels: buildLabels(classified),
  };
}

export function buildDuplicateComment(reportText: string, dedup: DedupResult): string {
  const rationale = dedup.rationale ? `\n\n${dedup.rationale}` : "";
  return `A new report looks like the same issue:\n\n> ${reportText}${rationale}`;
}

function buildLabels(classified: ClassifiedReport): string[] {
  return [`severity/${classified.severity}`, ...classified.components];
}

function buildIssueBody(classified: ClassifiedReport, dedup: DedupResult): string {
  const reproSection = classified.reproStepsProvided
    ? classified.reproSteps.map((step, index) => `${index + 1}. ${step}`).join("\n")
    : "No reproduction steps were provided.";

  let body = `## Reproduction steps\n\n${reproSection}`;

  // A suspected match files a new issue but flags the candidate for a human to confirm.
  if (dedup.confidence === "suspected" && dedup.matchIssueNumber !== undefined) {
    const rationale = dedup.rationale ? `\n\n${dedup.rationale}` : "";
    body += `\n\n## Possible duplicate\n\nThis may be a duplicate of #${dedup.matchIssueNumber}.${rationale}`;
  }

  return body;
}
