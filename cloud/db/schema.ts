import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/** Public report payloads never contain the private owner identifier. */
export const reports = sqliteTable('reports', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  lat: real('lat').notNull(),
  lng: real('lng').notNull(),
  description: text('description').notNull(),
  createdAtMs: integer('created_at_ms').notNull(),
  payload: text('payload').notNull(),
}, (table) => [
  index('reports_owner_created_idx').on(table.userId, table.createdAtMs),
  index('reports_created_idx').on(table.createdAtMs),
]);

export const geocodeCache = sqliteTable('geocode_cache', {
  key: text('key').primaryKey(),
  payload: text('payload').notNull(),
  expires: integer('expires').notNull(),
});

export const providerLimits = sqliteTable('provider_limits', {
  key: text('key').primaryKey(),
  nextAt: integer('next_at').notNull(),
});
