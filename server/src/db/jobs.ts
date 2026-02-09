/**
 * Jobs Database Queries
 *
 * Handles persistence of analysis jobs and results.
 */

import { eq, desc, and } from "drizzle-orm";
import { db } from "./client";
import { jobs, type Job, type NewJob } from "./schema";
import type { AnalysisOutput, GeneratedScreenLayout } from "../lib/types";

export type JobStatus = "pending" | "processing" | "complete" | "error";

/**
 * Create a new job
 */
export async function createJob(
  userId: string,
  fileName?: string
): Promise<Job> {
  const [job] = await db
    .insert(jobs)
    .values({
      userId,
      fileName,
      status: "pending",
    })
    .returning();

  return job;
}

/**
 * Get job by ID
 */
export async function getJob(jobId: string): Promise<Job | null> {
  const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId));
  return job || null;
}

/**
 * Get job by ID with user ownership check
 */
export async function getJobForUser(
  jobId: string,
  userId: string
): Promise<Job | null> {
  const [job] = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.id, jobId), eq(jobs.userId, userId)));
  return job || null;
}

/**
 * Update job status
 */
export async function updateJobStatus(
  jobId: string,
  status: JobStatus
): Promise<void> {
  const updates: Partial<Job> = { status };

  if (status === "complete" || status === "error") {
    updates.completedAt = new Date();
  }

  await db.update(jobs).set(updates).where(eq(jobs.id, jobId));
}

/**
 * Set job result (marks as complete)
 */
export async function setJobResult(
  jobId: string,
  result: AnalysisOutput,
  generatedLayouts?: Record<string, GeneratedScreenLayout>,
  prototypeUrl?: string
): Promise<void> {
  await db
    .update(jobs)
    .set({
      status: "complete",
      completedAt: new Date(),
      result: result as any,
      generatedLayouts: generatedLayouts as any,
      prototypeUrl,
    })
    .where(eq(jobs.id, jobId));
}

/**
 * Set job error
 */
export async function setJobError(jobId: string, error: string): Promise<void> {
  await db
    .update(jobs)
    .set({
      status: "error",
      completedAt: new Date(),
      error,
    })
    .where(eq(jobs.id, jobId));
}

/**
 * List jobs for a user
 */
export async function listJobsForUser(
  userId: string,
  limit: number = 20,
  offset: number = 0
): Promise<Job[]> {
  return db
    .select()
    .from(jobs)
    .where(eq(jobs.userId, userId))
    .orderBy(desc(jobs.createdAt))
    .limit(limit)
    .offset(offset);
}

/**
 * Delete a job
 */
export async function deleteJob(jobId: string, userId: string): Promise<boolean> {
  const result = await db
    .delete(jobs)
    .where(and(eq(jobs.id, jobId), eq(jobs.userId, userId)));

  return true; // Drizzle doesn't return affected rows easily, assume success
}
