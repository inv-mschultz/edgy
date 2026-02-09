/**
 * Credentials Database Queries
 *
 * Handles encrypted storage of external API keys.
 */

import { eq, and } from "drizzle-orm";
import { db } from "./client";
import { userCredentials, type UserCredential } from "./schema";
import { encrypt, decrypt } from "../lib/crypto";

export type CredentialProvider = "anthropic" | "gemini" | "vercel";

/**
 * Store an encrypted credential for a user
 */
export async function setCredential(
  userId: string,
  provider: CredentialProvider,
  apiKey: string
): Promise<void> {
  const encryptedKey = encrypt(apiKey);

  await db
    .insert(userCredentials)
    .values({
      userId,
      provider,
      encryptedKey,
    })
    .onConflictDoUpdate({
      target: [userCredentials.userId, userCredentials.provider],
      set: {
        encryptedKey,
        updatedAt: new Date(),
      },
    });
}

/**
 * Get a decrypted credential for a user
 */
export async function getCredential(
  userId: string,
  provider: CredentialProvider
): Promise<string | null> {
  const [credential] = await db
    .select()
    .from(userCredentials)
    .where(
      and(
        eq(userCredentials.userId, userId),
        eq(userCredentials.provider, provider)
      )
    );

  if (!credential) {
    return null;
  }

  return decrypt(credential.encryptedKey);
}

/**
 * Delete a credential for a user
 */
export async function deleteCredential(
  userId: string,
  provider: CredentialProvider
): Promise<void> {
  await db
    .delete(userCredentials)
    .where(
      and(
        eq(userCredentials.userId, userId),
        eq(userCredentials.provider, provider)
      )
    );
}

/**
 * Get all credentials for a user (returns providers, not keys)
 */
export async function listCredentials(
  userId: string
): Promise<{ provider: string; createdAt: Date }[]> {
  const credentials = await db
    .select({
      provider: userCredentials.provider,
      createdAt: userCredentials.createdAt,
    })
    .from(userCredentials)
    .where(eq(userCredentials.userId, userId));

  return credentials;
}
