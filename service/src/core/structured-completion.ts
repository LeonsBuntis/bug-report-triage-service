import { z } from "zod";
import type { TokenUsage } from "./types";
import { sumUsage } from "../infra/usage";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ModelResponse {
  content: string | null;
  usage: TokenUsage | null;
}

export type CallModel = (messages: ChatMessage[]) => Promise<ModelResponse>;

export interface StructuredResult<T> {
  value: T;
  usage: TokenUsage;
}

// Requests a structured response and validates it against `schema`. On a malformed response
// (unparseable JSON or a schema violation) the call is retried exactly once, with the model's bad
// answer and the validation error fed back into the prompt so it can correct itself. A second
// consecutive failure throws, so the caller fails closed (NOK, no Gitea writes). Token usage is
// summed across the attempts made.
export async function completeStructured<T>(
  callModel: CallModel,
  schema: z.ZodType<T>,
  messages: ChatMessage[],
): Promise<StructuredResult<T>> {
  // TODO: handle provider refusals and incomplete responses explicitly instead of treating them as schema failures.
  const first = await callModel(messages);
  const firstTry = validate(schema, first.content);
  if (firstTry.ok) {
    return { value: firstTry.value, usage: sumUsage(first.usage) };
  }

  const retry = await callModel([...messages, ...retryFeedback(first.content, firstTry.error)]);
  const retryTry = validate(schema, retry.content);
  if (retryTry.ok) {
    return { value: retryTry.value, usage: sumUsage(first.usage, retry.usage) };
  }

  throw new Error(`Structured output failed schema validation after one retry: ${retryTry.error}`);
}

type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string };

function validate<T>(schema: z.ZodType<T>, content: string | null): ValidationResult<T> {
  if (content === null || content.trim() === "") {
    return { ok: false, error: "model returned an empty response" };
  }

  let json: unknown;
  try {
    json = JSON.parse(content);
  } catch (error) {
    return {
      ok: false,
      error: `response was not valid JSON: ${(error as Error).message}`,
    };
  }

  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.message };
  }
  return { ok: true, value: parsed.data };
}

function retryFeedback(badContent: string | null, error: string): ChatMessage[] {
  return [
    { role: "assistant", content: badContent ?? "" },
    {
      role: "user",
      content:
        `Your previous response did not match the required schema: ${error}\n` +
        "Return a corrected response that strictly matches the schema.",
    },
  ];
}
