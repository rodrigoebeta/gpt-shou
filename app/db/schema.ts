import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const installations = sqliteTable("installations", {
  id: integer("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  settings: text("settings").notNull(),
  taxonomy: text("taxonomy").notNull(),
  taxonomyRevision: integer("taxonomy_revision").notNull().default(1),
  runId: text("run_id"),
  leaseEpoch: integer("lease_epoch").notNull().default(0),
  leaseExpires: text("lease_expires"),
  cursor: text("cursor").notNull().default('{"new_saves":null,"initial_import":null}'),
  cooldowns: text("cooldowns").notNull().default("[]"),
  reclassification: text("reclassification"),
});

export const references = sqliteTable("references", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  sourceKey: text("source_key").notNull().unique(),
  sourceUrl: text("source_url").notNull(),
  creator: text("creator"),
  collections: text("collections").notNull().default("[]"),
  discoveredAt: text("discovered_at").notNull(),
  savedAt: text("saved_at"),
  saveOrder: integer("save_order"),
  revision: integer("revision").notNull().default(1),
  outcome: text("outcome").notNull().default("pending"),
  removed: integer("removed").notNull().default(0),
  manualCategories: integer("manual_categories").notNull().default(0),
  manualTopics: integer("manual_topics").notNull().default(0),
  analysis: text("analysis"),
  classification: text("classification").notNull().default('{"category_ids":[],"topic_ids":[]}'),
  searchText: text("search_text").notNull().default(""),
  resultSha: text("result_sha"),
  cover: text("cover"),
  coverKey: text("cover_key"),
  failure: text("failure"),
  lastAttemptAt: text("last_attempt_at"),
  lastAttemptRunId: text("last_attempt_run_id"),
  updatedAt: text("updated_at").notNull(),
});

export const receipts = sqliteTable("receipts", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  tool: text("tool").notNull(),
  inputSha: text("input_sha").notNull(),
  result: text("result").notNull(),
  expiresAt: text("expires_at").notNull(),
});

export const runs = sqliteTable("runs", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  epoch: integer("epoch").notNull(),
  trigger: text("trigger").notNull(),
  startedAt: text("started_at").notNull(),
  endedAt: text("ended_at"),
  outcome: text("outcome").notNull().default("running"),
});

export const discoveryLists = sqliteTable("discovery_lists", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  revision: integer("revision").notNull(),
  anchorSourceKey: text("anchor_source_key"),
  pages: integer("pages").notNull(),
  completed: integer("completed").notNull(),
  updatedAt: text("updated_at").notNull(),
  baselineCompletedAt: text("baseline_completed_at"),
});

export const baselineSources = sqliteTable("baseline_sources", {
  sourceKey: text("source_key").primaryKey(),
  ownerId: text("owner_id").notNull(),
});
