/**
 * Credentials Routes
 *
 * Endpoints for managing user API keys for external services.
 */

import { Hono } from "hono";
import {
  setCredential,
  getCredential,
  deleteCredential,
  listCredentials,
  type CredentialProvider,
} from "../db/credentials";

export const credentialsRoutes = new Hono();

const VALID_PROVIDERS: CredentialProvider[] = ["anthropic", "gemini", "vercel"];

/**
 * GET /credentials
 *
 * List all configured credentials for the user.
 * Returns provider names only, not the actual keys.
 */
credentialsRoutes.get("/", async (c) => {
  const auth = c.get("auth");

  const credentials = await listCredentials(auth.userId);

  return c.json({
    credentials: credentials.map((cred) => ({
      provider: cred.provider,
      created_at: cred.createdAt.toISOString(),
    })),
  });
});

/**
 * GET /credentials/:provider
 *
 * Check if a specific credential is configured.
 */
credentialsRoutes.get("/:provider", async (c) => {
  const auth = c.get("auth");
  const provider = c.req.param("provider") as CredentialProvider;

  if (!VALID_PROVIDERS.includes(provider)) {
    return c.json(
      {
        error: {
          code: "INVALID_PROVIDER",
          message: `Invalid provider. Must be one of: ${VALID_PROVIDERS.join(", ")}`,
        },
      },
      400
    );
  }

  const key = await getCredential(auth.userId, provider);

  return c.json({
    provider,
    configured: key !== null,
    // Optionally return masked key
    masked_key: key ? `${key.slice(0, 4)}...${key.slice(-4)}` : null,
  });
});

/**
 * PUT /credentials/:provider
 *
 * Set or update a credential.
 */
credentialsRoutes.put("/:provider", async (c) => {
  const auth = c.get("auth");
  const provider = c.req.param("provider") as CredentialProvider;
  const body = await c.req.json<{ key: string }>();

  if (!VALID_PROVIDERS.includes(provider)) {
    return c.json(
      {
        error: {
          code: "INVALID_PROVIDER",
          message: `Invalid provider. Must be one of: ${VALID_PROVIDERS.join(", ")}`,
        },
      },
      400
    );
  }

  if (!body.key || typeof body.key !== "string") {
    return c.json(
      {
        error: {
          code: "INVALID_REQUEST",
          message: "key is required and must be a string",
        },
      },
      400
    );
  }

  // Basic validation based on provider
  if (provider === "anthropic" && !body.key.startsWith("sk-ant-")) {
    return c.json(
      {
        error: {
          code: "INVALID_KEY_FORMAT",
          message: "Anthropic API keys should start with 'sk-ant-'",
        },
      },
      400
    );
  }

  await setCredential(auth.userId, provider, body.key);

  return c.json({
    success: true,
    provider,
    message: `${provider} credential saved successfully`,
  });
});

/**
 * DELETE /credentials/:provider
 *
 * Remove a credential.
 */
credentialsRoutes.delete("/:provider", async (c) => {
  const auth = c.get("auth");
  const provider = c.req.param("provider") as CredentialProvider;

  if (!VALID_PROVIDERS.includes(provider)) {
    return c.json(
      {
        error: {
          code: "INVALID_PROVIDER",
          message: `Invalid provider. Must be one of: ${VALID_PROVIDERS.join(", ")}`,
        },
      },
      400
    );
  }

  await deleteCredential(auth.userId, provider);

  return c.json({
    success: true,
    provider,
    message: `${provider} credential removed successfully`,
  });
});
