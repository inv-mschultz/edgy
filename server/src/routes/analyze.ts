/**
 * Analyze Routes
 *
 * Endpoints for starting analysis jobs via SSE streaming.
 */

import { Hono } from "hono";
import { withSSE } from "../lib/sse";
import { runPipeline, type PipelineInput, type PipelineOptions } from "../services/pipeline";
import type { AnalyzeRequest } from "../lib/types";

export const analyzeRoutes = new Hono();

/**
 * POST /analyze
 *
 * Start a new analysis. Results streamed via SSE.
 */
analyzeRoutes.post("/", async (c) => {
  const auth = c.get("auth");
  const body = await c.req.json<AnalyzeRequest>();

  // Validate request
  if (!body.screens || !Array.isArray(body.screens) || body.screens.length === 0) {
    return c.json(
      {
        error: {
          code: "INVALID_REQUEST",
          message: "screens array is required and must not be empty",
        },
      },
      400
    );
  }

  // Build pipeline input
  const input: PipelineInput = {
    fileName: body.file_name || "Untitled",
    screens: body.screens,
    designTokens: body.design_tokens,
    componentLibrary: body.component_library,
  };

  // Build options
  const options: PipelineOptions = {
    llmProvider: body.options?.llm_provider || "claude",
    llmApiKey: body.options?.llm_api_key,
    generateMissingScreens: body.options?.generate_missing_screens ?? false,
  };

  // Run pipeline with SSE streaming
  return withSSE(c, async (stream) => {
    await runPipeline(auth.userId, input, options, stream);
  });
});
