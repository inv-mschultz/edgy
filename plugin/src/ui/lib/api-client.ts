/**
 * API Client
 *
 * Client for communicating with the Edgy server.
 * Handles SSE streaming for real-time progress updates.
 */

import type {
  AnalysisOutput,
  ExtractedScreen,
  DesignTokens,
  DiscoveredComponentInfo,
  GeneratedScreenLayout,
  AIProvider,
} from "./types";

// --- Configuration ---

const API_BASE_URL = "https://edgy-server.vercel.app/api/v1";

// --- Types ---

export interface AnalyzeOptions {
  llmProvider?: AIProvider;
  llmApiKey?: string;
  generateMissingScreens?: boolean;
}

export interface SSEProgressEvent {
  stage:
    | "patterns"
    | "rules"
    | "expectations"
    | "findings"
    | "flows"
    | "llm_review"
    | "generating"
    | "generation_complete"
    | "prototype"
    | "deploying";
  message: string;
  progress: number;
  screen?: string;
  current?: number;
  total?: number;
}

export interface SSECompleteEvent {
  analysis: AnalysisOutput;
  generated_layouts?: Record<string, GeneratedScreenLayout>;
  prototype_url?: string;
}

export interface SSEErrorEvent {
  code: string;
  message: string;
}

export interface AnalyzeCallbacks {
  onProgress?: (event: SSEProgressEvent) => void;
  onComplete?: (event: SSECompleteEvent) => void;
  onError?: (event: SSEErrorEvent) => void;
}

// --- API Key Storage ---

let apiKey: string | null = null;

/**
 * Set the Edgy API key for all requests
 */
export function setEdgyApiKey(key: string): void {
  apiKey = key;
}

/**
 * Get the current Edgy API key
 */
export function getEdgyApiKey(): string | null {
  return apiKey;
}

/**
 * Clear the Edgy API key
 */
export function clearEdgyApiKey(): void {
  apiKey = null;
}

// --- Helper Functions ---

function getHeaders(): HeadersInit {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };

  if (apiKey) {
    headers["X-API-Key"] = apiKey;
  }

  return headers;
}

// --- Main API Functions ---

/**
 * Start an analysis job with SSE streaming for progress updates
 */
export async function analyze(
  input: {
    fileName: string;
    screens: ExtractedScreen[];
    designTokens?: DesignTokens;
    componentLibrary?: {
      serialized: string;
      components: DiscoveredComponentInfo[];
    };
  },
  options: AnalyzeOptions,
  callbacks: AnalyzeCallbacks
): Promise<void> {
  if (!apiKey) {
    callbacks.onError?.({
      code: "NO_API_KEY",
      message: "Edgy API key not configured",
    });
    return;
  }

  const body = {
    file_name: input.fileName,
    screens: input.screens,
    design_tokens: input.designTokens,
    component_library: input.componentLibrary,
    options: {
      llm_provider: options.llmProvider,
      llm_api_key: options.llmApiKey,
      generate_missing_screens: options.generateMissingScreens,
    },
  };

  try {
    const response = await fetch(`${API_BASE_URL}/analyze`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      callbacks.onError?.({
        code: "API_ERROR",
        message: errorBody.error?.message || `API error: ${response.status}`,
      });
      return;
    }

    // Handle SSE stream
    const reader = response.body?.getReader();
    if (!reader) {
      callbacks.onError?.({
        code: "STREAM_ERROR",
        message: "Failed to get response stream",
      });
      return;
    }

    const decoder = new TextDecoder();
    let buffer = "";
    let currentEvent = "";
    let currentData = "";

    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      // Parse SSE events from buffer
      const lines = buffer.split("\n");
      buffer = lines.pop() || ""; // Keep incomplete line in buffer

      for (const line of lines) {
        if (line.startsWith("event: ")) {
          currentEvent = line.slice(7);
        } else if (line.startsWith("data: ")) {
          currentData = line.slice(6);
        } else if (line === "" && currentEvent && currentData) {
          // End of event, parse and dispatch
          try {
            const data = JSON.parse(currentData);

            switch (currentEvent) {
              case "progress":
                callbacks.onProgress?.(data as SSEProgressEvent);
                break;
              case "complete":
                // Await onComplete so navigation happens before analyze() returns
                await callbacks.onComplete?.(data as SSECompleteEvent);
                break;
              case "error":
                callbacks.onError?.(data as SSEErrorEvent);
                break;
            }
          } catch (e) {
            console.warn("[api-client] Failed to parse SSE data:", e);
          }

          currentEvent = "";
          currentData = "";
        }
      }
    }
  } catch (error) {
    callbacks.onError?.({
      code: "NETWORK_ERROR",
      message: error instanceof Error ? error.message : "Network error",
    });
  }
}

// --- Health Check ---

/**
 * Check if the API is available
 */
export async function healthCheck(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/health`);
    return response.ok;
  } catch {
    return false;
  }
}
