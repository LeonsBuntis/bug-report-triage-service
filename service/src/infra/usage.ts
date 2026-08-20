import type { TokenUsage } from "../core/types";

// The shape of OpenAI's response `usage` object we care about. Kept structural so both the
// classifier and deduper can map their completions without importing the SDK type here.
interface RawUsage {
  prompt_tokens?: number | null;
  completion_tokens?: number | null;
  total_tokens?: number | null;
}

export function toTokenUsage(usage: RawUsage | null | undefined): TokenUsage | null {
  if (!usage) return null;
  return {
    prompt_tokens: usage.prompt_tokens ?? 0,
    completion_tokens: usage.completion_tokens ?? 0,
    total_tokens: usage.total_tokens ?? 0,
  };
}

export function emptyUsage(): TokenUsage {
  return { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
}

// Totals several calls' usage into a fresh TokenUsage. Nulls contribute nothing.
export function sumUsage(...usages: (TokenUsage | null)[]): TokenUsage {
  const usage = emptyUsage();
  for (const u of usages) addUsage(usage, u);
  return usage;
}

// Folds one call's usage into a running total. Nulls (no API call, or no usage on the response)
// contribute nothing.
export function addUsage(target: TokenUsage, extra: TokenUsage | null): void {
  if (!extra) return;
  target.prompt_tokens += extra.prompt_tokens;
  target.completion_tokens += extra.completion_tokens;
  target.total_tokens += extra.total_tokens;
}
