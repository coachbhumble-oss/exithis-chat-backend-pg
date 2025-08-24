import 'dotenv/config';
import { Pool } from 'pg';

/**
 * Ensure pgvector extension, tables, and indexes exist.
 * We use cosine distance (<=>) and an IVFFLAT index for speed.
 * Embedding dimension is 3072 for text-embedding-3-large.
 */
export async function ensureDb(poolExternal) {
  const pool = poolExternal || new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Extension
    await client.query('CREATE EXTENSION IF NOT EXISTS vector');

    // Tables
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
        embedding vector(3072) NOT NULL
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

    // Basic btree index for chats lookup
    await client.query(`CREATE INDEX IF NOT EXISTS idx_chats_session ON chats(session_id)`);

    // Vector index (IVFFLAT) with cosine ops
    await client.query(`
      DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_chunks_embedding_cos') THEN
        CREATE INDEX idx_chunks_embedding_cos ON chunks USING ivfflat (embedding vector_cosine_ops);
      END IF;
      END $$;
    `);

    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// Allow running as a script: `npm run db:init`
if (process.argv[1] && process.argv[1].includes('db_init.js')) {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  ensureDb(pool)
    .then(() => { console.log('DB ready'); process.exit(0); })
    .catch(err => { console.error(err); process.exit(1); });
}
