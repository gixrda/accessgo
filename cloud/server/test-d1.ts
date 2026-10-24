import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Executes real SQLite SQL from the checked-in D1 migrations; no mocked SQL predicates. */
export function testDatabase() {
  const sqlite = new DatabaseSync(':memory:');
  const migrations = fileURLToPath(new URL('../drizzle/', import.meta.url));
  const files = readdirSync(migrations).filter((name) => name.endsWith('.sql')).sort();
  if (!files.length) throw new Error('Generate the D1 schema migration before running the backend tests.');
  for (const name of files) sqlite.exec(readFileSync(`${migrations}/${name}`, 'utf8'));

  function statement(sql: string, values: unknown[] = []) {
    return {
      bind(...next: unknown[]) { return statement(sql, next); },
      async first(column?: string) {
        const row = sqlite.prepare(sql).get(...values as (string | number | null)[]);
        return row ? column ? row[column] : row : null;
      },
      async all() {
        return { success: true, results: sqlite.prepare(sql).all(...values as (string | number | null)[]), meta: {} };
      },
      async run() {
        const result = sqlite.prepare(sql).run(...values as (string | number | null)[]);
        return { success: true, results: [], meta: { changes: Number(result.changes) } };
      },
    };
  }
  return { db: { prepare: statement } as unknown as D1Database, sqlite };
}
