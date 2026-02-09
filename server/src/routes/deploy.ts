/**
 * Deploy Routes
 *
 * Endpoints for deploying prototypes to Vercel.
 */

import { Hono } from "hono";
import { withSSE } from "../lib/sse";
import { deployToVercel, validateVercelToken } from "../services/deployer";
import { getCredential } from "../db/credentials";
import { getJobForUser } from "../db/jobs";
import type { PrototypeFile } from "../lib/types";

export const deployRoutes = new Hono();

interface DeployRequest {
  job_id?: string;
  files?: PrototypeFile[];
  project_name?: string;
}

/**
 * POST /deploy
 *
 * Deploy prototype files to Vercel.
 * Can either pass files directly or reference a job ID.
 */
deployRoutes.post("/", async (c) => {
  const auth = c.get("auth");
  const body = await c.req.json<DeployRequest>();

  // Get Vercel token
  const vercelToken = await getCredential(auth.userId, "vercel");

  if (!vercelToken) {
    return c.json(
      {
        error: {
          code: "MISSING_CREDENTIAL",
          message: "Vercel token not configured. Add it via /credentials endpoint.",
        },
      },
      400
    );
  }

  let files: PrototypeFile[];
  let projectName = body.project_name || "prototype";

  // Get files from job or from request
  if (body.job_id) {
    const job = await getJobForUser(body.job_id, auth.userId);

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

    if (job.status !== "complete") {
      return c.json(
        {
          error: {
            code: "JOB_NOT_COMPLETE",
            message: "Job is not complete yet",
          },
        },
        400
      );
    }

    // Build prototype files from job result
    // In production, you'd have the prototype builder generate these
    files = [
      {
        path: "index.html",
        content: `<!DOCTYPE html><html><head><title>${job.fileName}</title></head><body><h1>Prototype</h1></body></html>`,
      },
    ];
    projectName = job.fileName || projectName;
  } else if (body.files && Array.isArray(body.files)) {
    files = body.files;
  } else {
    return c.json(
      {
        error: {
          code: "INVALID_REQUEST",
          message: "Either job_id or files array is required",
        },
      },
      400
    );
  }

  // Deploy with SSE streaming
  return withSSE(c, async (stream) => {
    const result = await deployToVercel(files, vercelToken, projectName, stream);

    if (result.success) {
      await stream.sendComplete({
        analysis: {} as any, // Not relevant for deploy-only
        prototype_url: result.url,
      });
    } else {
      await stream.sendError({
        code: "DEPLOY_ERROR",
        message: result.error || "Deployment failed",
      });
    }
  });
});

/**
 * POST /deploy/validate
 *
 * Validate a Vercel token without storing it.
 */
deployRoutes.post("/validate", async (c) => {
  const body = await c.req.json<{ token: string }>();

  if (!body.token) {
    return c.json(
      {
        error: {
          code: "INVALID_REQUEST",
          message: "token is required",
        },
      },
      400
    );
  }

  const isValid = await validateVercelToken(body.token);

  return c.json({ valid: isValid });
});
