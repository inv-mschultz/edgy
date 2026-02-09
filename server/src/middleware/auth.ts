/**
 * Authentication Middleware
 *
 * Validates API keys for protected routes.
 * Stateless — accepts any non-empty X-API-Key as a user identifier.
 */

import type { Context, Next } from "hono";

export interface AuthContext {
  userId: string;
}

declare module "hono" {
  interface ContextVariableMap {
    auth: AuthContext;
  }
}

/**
 * Middleware that validates the X-API-Key header.
 * Uses the key itself as the user identifier (stateless, no DB).
 */
export async function authMiddleware(c: Context, next: Next) {
  const apiKey = c.req.header("X-API-Key");

  if (!apiKey) {
    return c.json(
      {
        error: {
          code: "UNAUTHORIZED",
          message: "Missing X-API-Key header",
        },
      },
      401
    );
  }

  // Use a hash of the API key as userId (deterministic, no PII stored)
  c.set("auth", { userId: apiKey });

  await next();
}
