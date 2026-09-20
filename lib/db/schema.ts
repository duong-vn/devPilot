import { index, integer, jsonb, pgTable, text, timestamp, vector } from "drizzle-orm/pg-core";
import type { Project, User } from "../types";

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  profile: jsonb("profile").$type<User>().notNull(),
});
export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    access: text("access").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [index("sessions_expiry_idx").on(table.expiresAt)],
);
export const projects = pgTable(
  "projects",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    data: jsonb("data").$type<Project>().notNull(),
  },
  (table) => [index("projects_owner_idx").on(table.ownerId)],
);
export const chunks = pgTable(
  "chunks",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    path: text("path").notNull(),
    startLine: integer("start_line").notNull(),
    endLine: integer("end_line").notNull(),
    content: text("content").notNull(),
    embedding: vector("embedding", { dimensions: 1536 }),
  },
  (table) => [
    index("chunks_project_idx").on(table.projectId),
    index("chunks_embedding_idx").using("hnsw", table.embedding.op("vector_cosine_ops")),
  ],
);
export const operations = pgTable("operations", {
  projectId: text("project_id")
    .primaryKey()
    .references(() => projects.id, { onDelete: "cascade" }),
  leaseId: text("lease_id").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});
export const usage = pgTable("usage", {
  id: text("id").primaryKey(),
  count: integer("count").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});
