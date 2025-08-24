import 'dotenv/config';
import { Pool } from 'pg';

/**
 * No pgvector; store embedding as BYTEA.
 */
export async function ensureDb(poolExternal) {
  const pool = poolExternal || new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS docs (
        id SERIAL PRIMARY KEY,
        source TEXT NOT NULL,
        url TEXT,
        title TEXT,
        text TEXT NOT NULL,
        updated_at BIGINT NOT NULL
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS chunks (
        id SERIAL PRIMARY KEY,
        doc_id INTEGER NOT NULL REFERENCES docs(id) ON DELETE CASCADE,
        chunk_index INTEGER NOT NULL,
        content TEXT NOT NULL,
        embedding BYTEA NOT NULL
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS chats (
        id SERIAL PRIMARY KEY,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at BIGINT NOT NULL
      );
    `);

    await client.query(`CREATE INDEX IF NOT EXISTS idx_chats_session ON chats(session_id)`);

    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

if (process.argv[1] && process.argv[1].includes('db_init.js')) {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  ensureDb(pool)
    .then(() => { console.log('DB ready'); process.exit(0); })
    .catch(err => { console.error(err); process.exit(1); });
}
