/**
 * Edgy Server - Main Entry Point
 *
 * Hono-based server that handles analysis, generation, and deployment
 * for the Edgy Figma plugin.
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { handle } from "hono/vercel";

import { analyzeRoutes } from "./routes/analyze";
import { deployRoutes } from "./routes/deploy";
import { credentialsRoutes } from "./routes/credentials";
import { jobsRoutes } from "./routes/jobs";
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
app.use("/deploy/*", authMiddleware);
app.use("/credentials/*", authMiddleware);
app.use("/jobs/*", authMiddleware);

// Mount routes
app.route("/analyze", analyzeRoutes);
app.route("/deploy", deployRoutes);
app.route("/credentials", credentialsRoutes);
app.route("/jobs", jobsRoutes);

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

// Export for Vercel
export default handle(app);

// Also export the app for local development
export { app };

// Local development server
if (process.env.NODE_ENV !== "production") {
  const port = parseInt(process.env.PORT || "3000", 10);
  import("@hono/node-server").then(({ serve }) => {
    serve({ fetch: app.fetch, port });
    console.log(`[edgy-server] Running at http://localhost:${port}`);
  });
}
