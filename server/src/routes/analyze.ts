/**
 * Analyze Routes
 *
 * Endpoints for starting and monitoring analysis jobs.
 */

import { Hono } from "hono";
import { withSSE } from "../lib/sse";
import { runPipeline, type PipelineInput, type PipelineOptions } from "../services/pipeline";
import { getJobForUser } from "../db/jobs";
import type { AnalyzeRequest } from "../lib/types";

export const analyzeRoutes = new Hono();

/**
 * POST /analyze
 *
 * Start a new analysis job. Returns a job ID and stream URL.
 * The actual analysis runs via SSE streaming.
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
    llmApiKey: body.options?.llm_api_key, // Pass through from client
    generateMissingScreens: body.options?.generate_missing_screens ?? false,
    autoDeploy: false, // Don't auto-deploy on analyze, use /deploy endpoint
  };

  // Run pipeline with SSE streaming
  return withSSE(c, async (stream) => {
    await runPipeline(auth.userId, input, options, stream);
  });
});

/**
 * GET /analyze/:jobId
 *
 * Get the status and results of an analysis job.
 * Fallback for environments where SSE doesn't work.
 */
analyzeRoutes.get("/:jobId", async (c) => {
  const auth = c.get("auth");
  const jobId = c.req.param("jobId");

  const job = await getJobForUser(jobId, auth.userId);

  if (!job) {
    return c.json(
      {
        error: {
          code: "NOT_FOUND",
          message: "Job not found",
        },
      },
      404
    );
  }

  return c.json({
    id: job.id,
    status: job.status,
    created_at: job.createdAt.toISOString(),
    completed_at: job.completedAt?.toISOString(),
    result: job.result,
    generated_layouts: job.generatedLayouts,
    prototype_url: job.prototypeUrl,
    error: job.error,
  });
});

/**
 * GET /analyze/:jobId/stream
 *
 * SSE stream for a specific job (reconnection support).
 * If job is already complete, sends the result immediately.
 */
analyzeRoutes.get("/:jobId/stream", async (c) => {
  const auth = c.get("auth");
  const jobId = c.req.param("jobId");

  const job = await getJobForUser(jobId, auth.userId);

  if (!job) {
    return c.json(
      {
        error: {
          code: "NOT_FOUND",
          message: "Job not found",
        },
      },
      404
    );
  }

  // If job is already complete, return result via SSE
  if (job.status === "complete" || job.status === "error") {
    return withSSE(c, async (stream) => {
      if (job.status === "complete") {
        await stream.sendComplete({
          analysis: job.result as any,
          generated_layouts: job.generatedLayouts as any,
          prototype_url: job.prototypeUrl || undefined,
        });
      } else {
        await stream.sendError({
          code: "JOB_ERROR",
          message: job.error || "Job failed",
        });
      }
    });
  }

  // Job still running - this is a limitation of the current design
  // In a production system, you'd have a pub/sub mechanism to reconnect
  return c.json(
    {
      id: job.id,
      status: job.status,
      message: "Job is still processing. Use the job ID to poll for status.",
    },
    202
  );
});
