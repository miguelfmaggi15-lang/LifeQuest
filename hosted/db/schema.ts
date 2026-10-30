import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const rooms = sqliteTable("rooms", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  code: text("code").notNull().unique(),
  status: text("status").notNull().default("lobby"),
  gameType: text("game_type").notNull().default("life"),
  boardSize: integer("board_size").notNull().default(60),
  stateJson: text("state_json").notNull(),
  version: integer("version").notNull().default(1),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const playerSessions = sqliteTable("player_sessions", {
  token: text("token").primaryKey(),
  roomId: integer("room_id").notNull().references(() => rooms.id, { onDelete: "cascade" }),
  playerId: integer("player_id").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
