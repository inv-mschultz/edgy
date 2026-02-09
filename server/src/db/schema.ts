/**
 * Database Schema
 *
 * Drizzle ORM schema definitions for Vercel Postgres.
 */

import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  primaryKey,
} from "drizzle-orm/pg-core";

/**
 * Users table - stores user accounts and API keys
 */
export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").unique(),
  apiKey: text("api_key").unique().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * User credentials table - stores encrypted API keys for external services
 */
export const userCredentials = pgTable(
  "user_credentials",
  {
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    provider: text("provider").notNull(), // 'anthropic', 'gemini', 'vercel'
    encryptedKey: text("encrypted_key").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.provider] }),
  })
);

/**
 * Analysis jobs table - stores job history and results
 */
export const jobs = pgTable("jobs", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  fileName: text("file_name"),
  status: text("status").default("pending").notNull(), // pending, processing, complete, error
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
  result: jsonb("result"), // AnalysisOutput
  generatedLayouts: jsonb("generated_layouts"), // Record<string, GeneratedScreenLayout>
  prototypeUrl: text("prototype_url"),
  error: text("error"),
});

// Type exports for use in queries
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type UserCredential = typeof userCredentials.$inferSelect;
export type NewUserCredential = typeof userCredentials.$inferInsert;
export type Job = typeof jobs.$inferSelect;
export type NewJob = typeof jobs.$inferInsert;
