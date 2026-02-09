/**
 * API Client
 *
 * Client for communicating with the Edgy server.
 * Handles SSE streaming for real-time progress updates.
 */

import type {
  AnalysisInput,
  AnalysisOutput,
  ExtractedScreen,
  DesignTokens,
  DiscoveredComponentInfo,
  GeneratedScreenLayout,
  AIProvider,
} from "./types";

// --- Configuration ---

// const API_BASE_URL = "https://edgy-api.vercel.app/api/v1";

// For local development
const API_BASE_URL = "http://localhost:3000/api/v1";

// --- Types ---

export interface AnalyzeOptions {
  llmProvider?: AIProvider;
  llmApiKey?: string;
  generateMissingScreens?: boolean;
  autoDeploy?: boolean;
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

export interface CredentialStatus {
  provider: string;
  configured: boolean;
  masked_key?: string;
}

export interface JobSummary {
  id: string;
  file_name: string;
  status: "pending" | "processing" | "complete" | "error";
  created_at: string;
  completed_at?: string;
  prototype_url?: string;
  summary?: {
    screens_analyzed: number;
    total_findings: number;
    critical: number;
    warning: number;
    info: number;
  };
  error?: string;
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

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(
      errorBody.error?.message || `API error: ${response.status}`
    );
  }
  return response.json();
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

/**
 * Get the status of an analysis job
 */
export async function getJobStatus(jobId: string): Promise<JobSummary> {
  const response = await fetch(`${API_BASE_URL}/analyze/${jobId}`, {
    headers: getHeaders(),
  });

  return handleResponse<JobSummary>(response);
}

/**
 * List all analysis jobs
 */
export async function listJobs(
  limit: number = 20,
  offset: number = 0
): Promise<{ jobs: JobSummary[]; pagination: { limit: number; offset: number } }> {
  const response = await fetch(
    `${API_BASE_URL}/jobs?limit=${limit}&offset=${offset}`,
    {
      headers: getHeaders(),
    }
  );

  return handleResponse(response);
}

/**
 * Delete a job
 */
export async function deleteJob(jobId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/jobs/${jobId}`, {
    method: "DELETE",
    headers: getHeaders(),
  });

  await handleResponse(response);
}

// --- Credential Management ---

/**
 * Set a credential on the server
 */
export async function setServerCredential(
  provider: "anthropic" | "gemini" | "vercel",
  key: string
): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/credentials/${provider}`, {
    method: "PUT",
    headers: getHeaders(),
    body: JSON.stringify({ key }),
  });

  await handleResponse(response);
}

/**
 * Get credential status
 */
export async function getCredentialStatus(
  provider: "anthropic" | "gemini" | "vercel"
): Promise<CredentialStatus> {
  const response = await fetch(`${API_BASE_URL}/credentials/${provider}`, {
    headers: getHeaders(),
  });

  return handleResponse<CredentialStatus>(response);
}

/**
 * List all configured credentials
 */
export async function listCredentials(): Promise<
  { provider: string; created_at: string }[]
> {
  const response = await fetch(`${API_BASE_URL}/credentials`, {
    headers: getHeaders(),
  });

  const result = await handleResponse<{
    credentials: { provider: string; created_at: string }[];
  }>(response);

  return result.credentials;
}

/**
 * Delete a credential
 */
export async function deleteServerCredential(
  provider: "anthropic" | "gemini" | "vercel"
): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/credentials/${provider}`, {
    method: "DELETE",
    headers: getHeaders(),
  });

  await handleResponse(response);
}

// --- Deploy ---

/**
 * Deploy a prototype to Vercel
 */
export async function deployPrototype(
  input: {
    jobId?: string;
    files?: { path: string; content: string }[];
    projectName?: string;
  },
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
    job_id: input.jobId,
    files: input.files,
    project_name: input.projectName,
  };

  try {
    const response = await fetch(`${API_BASE_URL}/deploy`, {
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

    // Handle SSE stream (same as analyze)
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

      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("event: ")) {
          currentEvent = line.slice(7);
        } else if (line.startsWith("data: ")) {
          currentData = line.slice(6);
        } else if (line === "" && currentEvent && currentData) {
          try {
            const data = JSON.parse(currentData);

            switch (currentEvent) {
              case "progress":
                callbacks.onProgress?.(data as SSEProgressEvent);
                break;
              case "complete":
                callbacks.onComplete?.(data as SSECompleteEvent);
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

/**
 * Validate a Vercel token
 */
export async function validateVercelToken(token: string): Promise<boolean> {
  const response = await fetch(`${API_BASE_URL}/deploy/validate`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({ token }),
  });

  const result = await handleResponse<{ valid: boolean }>(response);
  return result.valid;
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
