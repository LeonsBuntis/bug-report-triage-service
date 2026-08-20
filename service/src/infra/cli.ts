import type { TriageResult } from "../core/orchestrator";

export interface CliArgs {
  reportArg: string | undefined;
  debug: boolean;
}

// Debug is enabled by the `--debug` flag or a truthy `DEBUG` env var. "0", "false", and the
// empty string are treated as off so `DEBUG=0` reads the way an operator expects.
export function isDebugEnabled(argv: string[], env: NodeJS.ProcessEnv): boolean {
  if (argv.includes("--debug")) return true;
  const value = env.DEBUG?.trim().toLowerCase();
  return value !== undefined && value !== "" && value !== "0" && value !== "false";
}

// Splits the raw process argv (including node + script path at [0]/[1]) into the report text
// argument and the debug flag. Any `--debug` token is stripped so it's never mistaken for the
// report; the first remaining operand is the report text.
export function parseCliArgs(argv: string[], env: NodeJS.ProcessEnv): CliArgs {
  const operands = argv.slice(2).filter((arg) => arg !== "--debug");
  return {
    reportArg: operands.find((arg) => arg.trim().length > 0),
    debug: isDebugEnabled(argv, env),
  };
}

// Resolves the report text from the CLI argument when present, otherwise reads it from stdin.
export async function readReportText(reportArg: string | undefined): Promise<string> {
  if (reportArg && reportArg.trim().length > 0) {
    return reportArg;
  }

  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

// The full classification/dedup decision and aggregate token usage, as pretty JSON for stderr.
// Only computed fields are included, so a run that failed during classification still prints
// whatever it got (usage always present, even if zero).
export function formatDebugOutput(result: TriageResult): string {
  const payload: Record<string, unknown> = { usage: result.usage };
  if (result.classified !== undefined) payload.classified = result.classified;
  if (result.dedup !== undefined) payload.dedup = result.dedup;
  return JSON.stringify(payload, null, 2);
}
