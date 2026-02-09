/**
 * Database Client
 *
 * Postgres client with Drizzle ORM.
 */

import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";

// Initialize postgres client
const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("POSTGRES_URL or DATABASE_URL environment variable is required");
}

const client = postgres(connectionString);

// Initialize Drizzle with postgres-js
export const db = drizzle(client);

// Export client for raw queries if needed
export { client };
