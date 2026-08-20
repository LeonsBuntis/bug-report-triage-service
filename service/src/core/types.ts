import { z } from "zod";

// The 8 component labels and 4 severity levels are the service's fixed vocabulary -
// see CONTEXT.md ("Component label", "Severity").
export const ComponentSchema = z.enum([
  "frontend",
  "backend",
  "api",
  "auth",
  "database",
  "infra",
  "docs",
  "unknown",
]);
export type Component = z.infer<typeof ComponentSchema>;

export const SeveritySchema = z.enum(["critical", "high", "medium", "low"]);
export type Severity = z.infer<typeof SeveritySchema>;

// There's no confidence becaue of design decision of creating issue even if it's a feature request with "unknown" label,
// that would produce an artifact to act on for human escalation.
// TODO: add a .refine() enforcing reproSteps is empty when reproStepsProvided is false, so the
// "never invent steps" guarantee is structural (fails validation) rather than prompt-only.
export const ClassifiedReportSchema = z.object({
  title: z.string().min(1), // TODO: add max length to avoid overflowing the issue title field in Gitea
  severity: SeveritySchema,
  components: z.array(ComponentSchema).min(1),
  reproStepsProvided: z.boolean(),
  reproSteps: z.array(z.string()),
});
export type ClassifiedReport = z.infer<typeof ClassifiedReportSchema>;

// The three duplicate-confidence tiers - see CONTEXT.md ("Duplicate confidence") and ADR-0001.
export const DuplicateConfidenceSchema = z.enum(["none", "suspected", "certain"]);
export type DuplicateConfidence = z.infer<typeof DuplicateConfidenceSchema>;

export const DedupResultSchema = z.object({
  confidence: DuplicateConfidenceSchema,
  matchIssueNumber: z.number().int().positive().optional(),
  rationale: z.string().optional(),
});
export type DedupResult = z.infer<typeof DedupResultSchema>;

// An existing open Gitea issue, offered to the deduper as a duplicate candidate.
export interface OpenIssue {
  number: number;
  title: string;
  body: string;
}

// Token counts from an OpenAI response's `usage` object. The inference key has no billing/usage
// read scope, so these client-side counts are the only way to track spend against the cap.
export interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}
