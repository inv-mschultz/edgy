/**
 * User Database Queries
 */

import { eq } from "drizzle-orm";
import { db } from "./client";
import { users, type User, type NewUser } from "./schema";
import { randomBytes } from "crypto";

/**
 * Generate a new API key
 */
export function generateApiKey(): string {
  return `edgy_${randomBytes(32).toString("hex")}`;
}

/**
 * Create a new user with a generated API key
 */
export async function createUser(email?: string): Promise<User> {
  const apiKey = generateApiKey();

  const [user] = await db
    .insert(users)
    .values({
      email,
      apiKey,
    })
    .returning();

  return user;
}

/**
 * Get user by API key
 */
export async function getUserByApiKey(apiKey: string): Promise<User | null> {
  const [user] = await db.select().from(users).where(eq(users.apiKey, apiKey));
  return user || null;
}

/**
 * Get user by ID
 */
export async function getUserById(id: string): Promise<User | null> {
  const [user] = await db.select().from(users).where(eq(users.id, id));
  return user || null;
}

/**
 * Get user by email
 */
export async function getUserByEmail(email: string): Promise<User | null> {
  const [user] = await db.select().from(users).where(eq(users.email, email));
  return user || null;
}

/**
 * Regenerate API key for a user
 */
export async function regenerateApiKey(userId: string): Promise<string> {
  const newApiKey = generateApiKey();

  await db.update(users).set({ apiKey: newApiKey }).where(eq(users.id, userId));

  return newApiKey;
}
