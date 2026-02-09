/**
 * Authentication Middleware
 *
 * Validates API keys for protected routes.
 */

import type { Context, Next } from "hono";
import { getUserByApiKey } from "../db/users";

export interface AuthContext {
  userId: string;
  email?: string;
}

declare module "hono" {
  interface ContextVariableMap {
    auth: AuthContext;
  }
}

/**
 * Middleware that validates the X-API-Key header and attaches user info to context.
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

  try {
    const user = await getUserByApiKey(apiKey);

    if (!user) {
      return c.json(
        {
          error: {
            code: "UNAUTHORIZED",
            message: "Invalid API key",
          },
        },
        401
      );
    }

    // Attach user info to context
    c.set("auth", {
      userId: user.id,
      email: user.email ?? undefined,
    });

    await next();
  } catch (error) {
    console.error("[auth] Error validating API key:", error);
    return c.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to validate API key",
        },
      },
      500
    );
  }
}
