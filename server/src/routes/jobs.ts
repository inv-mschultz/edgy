/**
 * Jobs Routes
 *
 * Endpoints for managing analysis job history.
 */

import { Hono } from "hono";
import { listJobsForUser, getJobForUser, deleteJob } from "../db/jobs";

export const jobsRoutes = new Hono();

/**
 * GET /jobs
 *
 * List all jobs for the current user.
 */
jobsRoutes.get("/", async (c) => {
  const auth = c.get("auth");
  const limit = parseInt(c.req.query("limit") || "20", 10);
  const offset = parseInt(c.req.query("offset") || "0", 10);

  const jobs = await listJobsForUser(auth.userId, limit, offset);

  return c.json({
    jobs: jobs.map((job) => ({
      id: job.id,
      file_name: job.fileName,
      status: job.status,
      created_at: job.createdAt.toISOString(),
      completed_at: job.completedAt?.toISOString(),
      prototype_url: job.prototypeUrl,
      summary: job.result
        ? {
            screens_analyzed: (job.result as any).summary?.screens_analyzed,
            total_findings: (job.result as any).summary?.total_findings,
            critical: (job.result as any).summary?.critical,
            warning: (job.result as any).summary?.warning,
            info: (job.result as any).summary?.info,
          }
        : null,
      error: job.error,
    })),
    pagination: {
      limit,
      offset,
    },
  });
});

/**
 * GET /jobs/:jobId
 *
 * Get full details of a specific job.
 */
jobsRoutes.get("/:jobId", async (c) => {
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
    file_name: job.fileName,
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
 * DELETE /jobs/:jobId
 *
 * Delete a job and its results.
 */
jobsRoutes.delete("/:jobId", async (c) => {
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

  await deleteJob(jobId, auth.userId);

  return c.json({
    success: true,
    message: "Job deleted successfully",
  });
});
