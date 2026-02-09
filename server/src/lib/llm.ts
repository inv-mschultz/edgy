/**
 * LLM Client
 *
 * Unified interface for calling Claude and Gemini APIs.
 */

import type { AIProvider } from "./types";
import { hashLLMRequest, getCachedResponse, setCachedResponse } from "./llm-cache";

// --- Constants ---

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const CLAUDE_MODEL_REVIEW = "claude-haiku-4-5-20251001";
const CLAUDE_MODEL_GENERATE = "claude-sonnet-4-20250514";
const GEMINI_MODEL = "gemini-3-flash-preview";
const MAX_TOKENS_REVIEW = 8192;
const MAX_TOKENS_GENERATE = 4096;
const MAX_RETRIES = 1;
const INITIAL_RETRY_DELAY_MS = 1000;

// --- Types ---

export type ContentPart =
  | { type: "text"; text: string }
  | {
      type: "image";
      source: { type: "base64"; media_type: "image/jpeg" | "image/png"; data: string };
    };

export interface LLMResponse {
  text: string;
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
}

// --- Main API ---

/**
 * Call the LLM for review tasks (uses more powerful model).
 * Responses are cached by content hash for deterministic re-runs.
 */
export async function callLLMForReview(
  apiKey: string,
  provider: AIProvider,
  systemPrompt: string,
  content: ContentPart[]
): Promise<LLMResponse> {
  // Check cache first
  const cacheKey = hashLLMRequest(systemPrompt, content);
  const cached = getCachedResponse(cacheKey);
  if (cached) {
    console.log("[llm] Cache hit for review request");
    return cached;
  }

  const response = provider === "gemini"
    ? await callGeminiAPI(apiKey, systemPrompt, content, MAX_TOKENS_REVIEW)
    : await callAnthropicAPI(apiKey, systemPrompt, content, CLAUDE_MODEL_REVIEW, MAX_TOKENS_REVIEW);

  // Cache the response
  setCachedResponse(cacheKey, response);
  return response;
}

/**
 * Call the LLM for generation tasks (uses faster model).
 * Responses are cached by content hash for deterministic re-runs.
 */
export async function callLLMForGeneration(
  apiKey: string,
  provider: AIProvider,
  systemPrompt: string,
  content: ContentPart[]
): Promise<LLMResponse> {
  const cacheKey = hashLLMRequest(systemPrompt, content);
  const cached = getCachedResponse(cacheKey);
  if (cached) {
    console.log("[llm] Cache hit for generation request");
    return cached;
  }

  const response = provider === "gemini"
    ? await callGeminiAPI(apiKey, systemPrompt, content, MAX_TOKENS_GENERATE)
    : await callAnthropicAPI(apiKey, systemPrompt, content, CLAUDE_MODEL_GENERATE, MAX_TOKENS_GENERATE);

  setCachedResponse(cacheKey, response);
  return response;
}

// --- Anthropic (Claude) ---

async function callAnthropicAPI(
  apiKey: string,
  systemPrompt: string,
  content: ContentPart[],
  model: string,
  maxTokens: number
): Promise<LLMResponse> {
  console.log(`[llm] Calling Anthropic API with model: ${model}`);

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delayMs = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
      console.log(
        `[llm] Anthropic rate limited, retrying in ${delayMs}ms (attempt ${attempt}/${MAX_RETRIES})`
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    const response = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        temperature: 0,
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      if (response.status === 401) {
        throw new Error("Invalid Anthropic API key");
      }
      if (response.status === 429) {
        if (attempt < MAX_RETRIES) {
          continue; // Retry
        }
        throw new Error("Rate limited by Anthropic API after retries. Please try again in a moment.");
      }
      if (response.status === 529) {
        if (attempt < MAX_RETRIES) {
          continue; // Retry on overload
        }
        throw new Error("Anthropic API overloaded. Please try again later.");
      }
      throw new Error(`Anthropic API error (${response.status}): ${errorBody}`);
    }

    const data = await response.json() as {
      content?: { type: string; text?: string }[];
      usage?: { input_tokens: number; output_tokens: number };
    };

    const textBlock = data.content?.find(
      (block) => block.type === "text"
    );
    if (!textBlock?.text) {
      throw new Error("No text content in Anthropic API response");
    }

    return {
      text: textBlock.text,
      usage: data.usage
        ? {
            input_tokens: data.usage.input_tokens,
            output_tokens: data.usage.output_tokens,
          }
        : undefined,
    };
  }

  throw new Error("Anthropic API rate limited after retries. Please try again later.");
}

// --- Google (Gemini) ---

async function callGeminiAPI(
  apiKey: string,
  systemPrompt: string,
  content: ContentPart[],
  maxTokens: number
): Promise<LLMResponse> {
  console.log(`[llm] Calling Gemini API with model: ${GEMINI_MODEL}`);

  // Convert to Gemini format
  const parts: Array<{ text: string } | { inline_data: { mime_type: string; data: string } }> =
    [];

  for (const part of content) {
    if (part.type === "text") {
      parts.push({ text: part.text });
    } else if (part.type === "image") {
      parts.push({
        inline_data: {
          mime_type: part.source.media_type,
          data: part.source.data,
        },
      });
    }
  }

  // Retry loop with exponential backoff
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delayMs = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
      console.log(
        `[llm] Gemini rate limited, retrying in ${delayMs}ms (attempt ${attempt}/${MAX_RETRIES})`
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    const response = await fetch(
      `${GEMINI_API_URL}/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          system_instruction: {
            parts: [{ text: systemPrompt }],
          },
          contents: [{ parts }],
          generationConfig: {
            maxOutputTokens: maxTokens,
            temperature: 0,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorBody = await response.text();
      console.error("[llm] Gemini API error:", response.status, errorBody);

      if (response.status === 400 && errorBody.includes("API_KEY_INVALID")) {
        throw new Error("Invalid Gemini API key");
      }
      if (response.status === 404) {
        throw new Error(`Model not found: ${GEMINI_MODEL}`);
      }
      if (response.status === 429) {
        continue; // Retry
      }
      throw new Error(`Gemini API error (${response.status}): ${errorBody}`);
    }

    const data = await response.json() as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
    };
    const textContent = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!textContent) {
      throw new Error("No text content in Gemini API response");
    }

    return {
      text: textContent,
      usage: data.usageMetadata
        ? {
            input_tokens: data.usageMetadata.promptTokenCount || 0,
            output_tokens: data.usageMetadata.candidatesTokenCount || 0,
          }
        : undefined,
    };
  }

  throw new Error(
    `Gemini API rate limited after ${MAX_RETRIES} retries. Please try again later.`
  );
}

/**
 * Sleep helper for rate limiting
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
