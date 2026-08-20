import OpenAI from "openai";
import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";
import type { CallModel } from "../core/structured-completion";
import { toTokenUsage } from "./usage";

export type LlmProvider = "openai" | "ollama";

export interface LlmConfig {
  client: OpenAI;
  model: string;
}

// Resolves which LLM backend the classifier talks to. Both providers go through the same
// OpenAI SDK - Ollama exposes an OpenAI-compatible endpoint - so only the base URL, key,
// and default model differ. Pure function of the environment so it's unit-testable.
export function resolveLlmConfig(env: NodeJS.ProcessEnv): LlmConfig {
  const provider = (env.LLM_PROVIDER ?? "openai").toLowerCase();

  switch (provider) {
    case "openai": {
      const apiKey = env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new Error("Missing required environment variable OPENAI_API_KEY");
      }
      return {
        client: new OpenAI({ apiKey, baseURL: env.OPENAI_BASE_URL }),
        model: env.OPENAI_MODEL ?? "gpt-5.4-nano",
      };
    }
    case "ollama": {
      // Ollama's OpenAI-compatible endpoint ignores the key, but the SDK requires a non-empty one.
      return {
        client: new OpenAI({
          apiKey: env.OLLAMA_API_KEY ?? "ollama",
          baseURL: env.OLLAMA_BASE_URL ?? "http://host.docker.internal:11434/v1",
        }),
        model: env.OLLAMA_MODEL ?? "qwen3.5:latest",
      };
    }
    default:
      throw new Error(`Unknown LLM_PROVIDER "${provider}" (expected "openai" or "ollama")`);
  }
}

// The production `CallModel`: one OpenAI chat completion constrained to `schema` via strict
// structured outputs.
export function openAiModel(
  client: OpenAI,
  model: string,
  schema: z.ZodType,
  schemaName: string,
): CallModel {
  const responseFormat = zodResponseFormat(schema, schemaName);
  return async (messages) => {
    const completion = await client.chat.completions.create({
      model,
      messages,
      response_format: responseFormat,
    });
    return {
      content: completion.choices[0]?.message.content ?? null,
      usage: toTokenUsage(completion.usage),
    };
  };
}
