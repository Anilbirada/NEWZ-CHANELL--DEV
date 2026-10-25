import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Pool } = pg;
if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required. Copy .env.example to .env and configure PostgreSQL.');
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.PG_POOL_MAX || 12),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  ...(process.env.NODE_ENV === 'production' ? { ssl: process.env.PG_SSL === 'true' ? { rejectUnauthorized: true } : undefined } : {}),
});

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(text: string, params: unknown[] = []) {
  return pool.query<T>(text, params);
}

export async function initDatabase() {
  const thisDir = path.dirname(fileURLToPath(import.meta.url));
  // Development runs from src/ and reads ../sql; the compiled build includes
  // a copy beside dist/db.js. Try both paths so packaged production builds work.
  const candidates = [path.join(thisDir, '../sql/schema.sql'), path.join(thisDir, 'schema.sql')];
  let schema: string | undefined;
  let lastError: unknown;
  for (const schemaPath of candidates) {
    try { schema = await readFile(schemaPath, 'utf8'); break; }
    catch (error) { lastError = error; }
  }
  if (!schema) throw new Error(`Could not locate sql/schema.sql for database initialization: ${lastError instanceof Error ? lastError.message : 'file not found'}`);
  await pool.query(schema);
}

export async function audit(actorId: string | null, action: string, entityType: string, entityId: string | null, details: Record<string, unknown> = {}, ip?: string) {
  try {
    await query(
      `INSERT INTO audit_events (actor_id, action, entity_type, entity_id, details, ip_address)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::inet)`,
      [actorId, action, entityType, entityId, JSON.stringify(details), ip || null],
    );
  } catch (error) {
    // Audit failure is logged, but does not hide the primary operation's result.
    console.error('Audit log insert failed:', error instanceof Error ? error.message : error);
  }
}
