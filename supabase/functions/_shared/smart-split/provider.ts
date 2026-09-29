// AI provider boundary. The rest of Smart Split only sees `SmartSplitProvider.interpret()`, which returns
// raw model output (validated later by schema.ts). Swap models via SMART_SPLIT_MODEL without code changes.

import { MODEL_OUTPUT_JSON_SCHEMA } from "./schema.ts";
import { buildUserPrompt, SYSTEM_PROMPT } from "./prompt.ts";
import { mockInterpret } from "./mock_provider.ts";
import type { Participant } from "./types.ts";

export const DEFAULT_SMART_SPLIT_MODEL = "openai/gpt-6-luna";

export interface InterpretInput {
  text: string;
  /** data:image/jpeg;base64,... */
  imageDataUrl: string | null;
  participants: Participant[];
  currentUserId: string;
}

export interface SmartSplitProvider {
  readonly name: string;
  interpret(input: InterpretInput): Promise<unknown>;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly unsupportedParameters = false,
    readonly rateLimited = false,
  ) {
    super(message);
  }
}

export type JsonMode = "schema" | "object";

/** Models that turned out not to support strict structured outputs (per warm function instance). */
const jsonModeByModel = new Map<string, JsonMode>();

/** Some models wrap JSON in ```json fences even in JSON mode. */
export function stripCodeFence(text: string): string {
  const match = text.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return match ? match[1] : text;
}

type Env = { get(key: string): string | undefined };

export class OpenRouterProvider implements SmartSplitProvider {
  readonly name: string;

  constructor(
    private readonly apiKey: string,
    readonly model: string,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly timeoutMs = 60_000,
    private readonly retryDelayMs = 2_000,
  ) {
    this.name = `openrouter:${model}`;
  }

  /**
   * "schema": strict JSON Schema structured output (preferred).
   * "object": plain JSON mode with the schema in the prompt, for models without structured outputs
   * (e.g. many `:free` variants). The zod sanitizer validates the result either way.
   */
  buildRequestBody(input: InterpretInput, mode: JsonMode = "schema") {
    const userContent: Array<Record<string, unknown>> = [
      { type: "text", text: buildUserPrompt(input.text, input.participants, input.currentUserId) },
    ];
    if (input.imageDataUrl) {
      userContent.push({ type: "image_url", image_url: { url: input.imageDataUrl } });
    }
    if (mode === "object") {
      return {
        model: this.model,
        temperature: 0,
        messages: [
          {
            role: "system",
            content: `${SYSTEM_PROMPT}\n\nRespond with ONLY a JSON object (no prose, no code fences) that ` +
              `matches this JSON Schema exactly, including every required key:\n` +
              JSON.stringify(MODEL_OUTPUT_JSON_SCHEMA),
          },
          { role: "user", content: userContent },
        ],
        response_format: { type: "json_object" },
      };
    }
    return {
      model: this.model,
      temperature: 0,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "smart_split", strict: true, schema: MODEL_OUTPUT_JSON_SCHEMA },
      },
      // Only route to providers that honor structured outputs.
      provider: { require_parameters: true },
    };
  }

  async interpret(input: InterpretInput): Promise<unknown> {
    const preferred = jsonModeByModel.get(this.model) ?? "schema";
    try {
      return await this.request(input, preferred);
    } catch (error) {
      // No endpoint for this model supports strict structured outputs: fall back to JSON mode once,
      // and remember that for this model while the function instance stays warm.
      if (preferred === "schema" && error instanceof ProviderError && error.unsupportedParameters) {
        jsonModeByModel.set(this.model, "object");
        return await this.request(input, "object");
      }
      throw error;
    }
  }

  /** One retry after a short pause when the provider is rate-limited (common on shared free models). */
  private async request(input: InterpretInput, mode: JsonMode): Promise<unknown> {
    try {
      return await this.requestOnce(input, mode);
    } catch (error) {
      if (error instanceof ProviderError && error.rateLimited) {
        await new Promise((resolve) => setTimeout(resolve, this.retryDelayMs));
        return await this.requestOnce(input, mode);
      }
      throw error;
    }
  }

  private async requestOnce(input: InterpretInput, mode: JsonMode): Promise<unknown> {
    let response: Response;
    try {
      response = await this.fetchImpl("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          "X-Title": "SplitEasy Smart Split",
        },
        body: JSON.stringify(this.buildRequestBody(input, mode)),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      throw new ProviderError(`Could not reach the AI service: ${(error as Error).message}`, true);
    }

    if (!response.ok) {
      const detail = (await response.text()).slice(0, 300);
      const retryable = response.status === 429 || response.status >= 500;
      const unsupported = (response.status === 400 || response.status === 404) &&
        /support|parameter|no endpoints/i.test(detail);
      throw new ProviderError(`AI service error ${response.status}: ${detail}`, retryable, unsupported, response.status === 429);
    }

    const body = await response.json();
    const content = body?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || content.length === 0) {
      throw new ProviderError("AI service returned an empty response", true);
    }
    return stripCodeFence(content);
  }
}

/** Deterministic, rule-based stand-in used only when SMART_SPLIT_PROVIDER=mock (UI testing without a key). */
export class MockProvider implements SmartSplitProvider {
  readonly name = "mock";
  interpret(input: InterpretInput): Promise<unknown> {
    if (input.text.includes("#fail")) {
      return Promise.reject(new ProviderError("Mock provider failure (requested with #fail)", true));
    }
    return Promise.resolve(mockInterpret(input));
  }
}

export function providerFromEnv(env: Env): SmartSplitProvider {
  if (env.get("SMART_SPLIT_PROVIDER") === "mock") return new MockProvider();
  const apiKey = env.get("OPENROUTER_API_KEY");
  if (!apiKey) {
    throw new ProviderError("Smart Split isn't configured yet (missing OPENROUTER_API_KEY).", false);
  }
  return new OpenRouterProvider(apiKey, env.get("SMART_SPLIT_MODEL") || DEFAULT_SMART_SPLIT_MODEL);
}
