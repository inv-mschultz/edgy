/**
 * Edgy Server - Main Entry Point
 *
 * Stateless Hono API that handles analysis for the Edgy Figma plugin.
 * No database required — results streamed via SSE.
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
// Note: We do NOT use @hono/node-server/vercel handle() because it
// fails to pass the request body on Vercel (body stream already consumed).
// Instead, api/index.js manually constructs a Request and calls app.fetch().

import { analyzeRoutes } from "./routes/analyze";
import { authMiddleware } from "./middleware/auth";

// Create Hono app
const app = new Hono().basePath("/api/v1");

// Global middleware
app.use("*", logger());
app.use(
  "*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "X-API-Key"],
    exposeHeaders: ["Content-Type"],
  })
);

// Health check (no auth required)
app.get("/health", (c) => {
  return c.json({ status: "ok", version: "0.1.0" });
});

// Protected routes
app.use("/analyze/*", authMiddleware);

// Mount routes
app.route("/analyze", analyzeRoutes);

// Error handling
app.onError((err, c) => {
  console.error("[edgy-server] Error:", err);
  return c.json(
    {
      error: {
        code: "INTERNAL_ERROR",
        message: err.message || "An unexpected error occurred",
      },
    },
    500
  );
});

// 404 handler
app.notFound((c) => {
  return c.json(
    {
      error: {
        code: "NOT_FOUND",
        message: "Endpoint not found",
      },
    },
    404
  );
});

// Export the app for both Vercel (via api/index.js) and local development
export { app };
export default app;
