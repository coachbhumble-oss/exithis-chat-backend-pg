import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { OpenAI } from 'openai';
import { Pool } from 'pg';
import { embedTexts } from './src/embeddings.js';
import { ensureDb } from './tools/db_init.js';

const app = express();
app.use(express.json({ limit: '2mb' }));

// DB pool
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Ensure DB objects exist (extension/tables/indexes)
await ensureDb(pool);

// CORS allowlist
const allowed = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (allowed.includes(origin)) return cb(null, true);
    cb(new Error('CORS blocked'));
  }
}));

// Health / preflight for widget
app.options('/api/chat', (_, res) => res.status(204).end());

// Referer lock to /chat
const refererRe = new RegExp(process.env.REFERER_REGEX || '^$', 'i');

// --- CHAT (stream w/ RAG via pgvector) ---
app.post('/api/chat', async (req, res) => {
  try {
    const referer = req.get('referer') || '';
    if (!refererRe.test(referer)) return res.status(403).send('Forbidden');

    const { message, session_id = 'anon' } = req.body || {};
    if (!message) return res.status(400).send('Missing message');

    // store user turn
    await pool.query(
      'INSERT INTO chats (session_id, role, content, created_at) VALUES ($1,$2,$3,$4)',
      [session_id, 'user', message, Date.now()]
    );

    // embed query
    const [qVec] = await embedTexts([message]);

    // top-K via cosine distance
    const { rows: ctxRows } = await pool.query(
      `SELECT content
       FROM chunks
       ORDER BY embedding <=> $1
       LIMIT 6`,
      [qVec]
    );
    const context = ctxRows.map(r => `• ${r.content}`).join('\n');

    const system = `You are Exithis Assistant. Be concise, friendly, and helpful.
Use only the provided context for facts about Exithis rooms, rules, pricing, location, and hints.
If unsure, ask a brief clarifying question.

Context:
${context}`;

    const { rows: hist } = await pool.query(
      'SELECT role, content FROM chats WHERE session_id=$1 ORDER BY id DESC LIMIT 10',
      [session_id]
    );
    const history = hist.reverse();

    const messages = [{ role: 'system', content: system }, ...history, { role: 'user', content: message }];

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const stream = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      temperature: 0.3,
      stream: true
    });

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');

    let full = '';
    for await (const chunk of stream) {
      const token = chunk.choices?.[0]?.delta?.content || '';
      if (token) { full += token; res.write(token); }
    }
    res.end();

    await pool.query(
      'INSERT INTO chats (session_id, role, content, created_at) VALUES ($1,$2,$3,$4)',
      [session_id, 'assistant', full, Date.now()]
    );

  } catch (e) {
    console.error(e);
    if (!res.headersSent) res.status(500).send('Server error');
  }
});

// --- INGEST (add/update text) ---
app.post('/api/ingest', async (req, res) => {
  const auth = req.get('authorization') || '';
  if (!auth.startsWith('Bearer ')) return res.status(401).send('Unauthorized');

  const { source = 'manual', url = null, title = null, text } = req.body || {};
  if (!text || text.length < 20) return res.status(400).send('text too short');

  // chunk + embed server-side
  const { chunk } = await import('./src/chunking.js');
  const chunks = chunk(text);
  const vecs = await embedTexts(chunks); // 3072-d vectors

  // insert doc
  const { rows: docRows } = await pool.query(
    'INSERT INTO docs (source, url, title, text, updated_at) VALUES ($1,$2,$3,$4,$5) RETURNING id',
    [source, url, title, text, Date.now()]
  );
  const docId = docRows[0].id;

  // batch insert chunks
  const qs = [];
  const params = [];
  let p = 1;
  for (let i=0; i<chunks.length; i++) {
    qs.push(`($${p++}, $${p++}, $${p++}, $${p++})`);
    params.push(docId, i, chunks[i], vecs[i]);
  }
  await pool.query(
    `INSERT INTO chunks (doc_id, chunk_index, content, embedding) VALUES ${qs.join(',')}`,
    params
  );

  res.json({ docId, chunks: chunks.length });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log('Exithis PG backend on :' + port));
