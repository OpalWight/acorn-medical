import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const ward = sqliteTable("ward", {
  id: integer("id").primaryKey(),
  version: integer("version").notNull(),
  state: text("state").notNull(),
});
