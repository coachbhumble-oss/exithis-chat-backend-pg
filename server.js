import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { OpenAI } from 'openai';
import { Pool } from 'pg';
import { embedTexts } from './src/embeddings.js';
import { ensureDb } from './tools/db_init.js';

const app = express();
app.use(express.json({ limit: '2mb' }));

// DB pool with SSL forced
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});
await ensureDb(pool);

// ---------- CORS (robust) ----------
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error('CORS blocked'));
  },
  methods: ['GET','POST','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization'],
  maxAge: 86400
}));
app.use((req, res, next) => { res.setHeader('Vary','Origin'); next(); });
app.options('*', cors());

// ---------- Gate by Referer OR Origin ----------
const refererRe = new RegExp(process.env.REFERER_REGEX || '^$', 'i');
function allowedByOriginOrReferer(req) {
  const referer = req.get('referer') || '';
  const origin  = req.get('origin')  || '';
  const refererOk = refererRe.test(referer);
  const originOk  = allowedOrigins.includes(origin);
  return refererOk || originOk;
}

// Optional: root health routes
app.get('/', (req, res) => res.type('text/plain').send('Exithis API: OK'));
app.get('/healthz', (req, res) => res.json({ ok: true }));

// --- CHAT endpoint ---
app.post('/api/chat', async (req, res) => {
  try {
    if (!allowedByOriginOrReferer(req)) return res.status(403).send('Forbidden');

    const { message, session_id = 'anon' } = req.body || {};
    if (!message) return res.status(400).send('Missing message');

    await pool.query(
      'INSERT INTO chats (session_id, role, content, created_at) VALUES ($1,$2,$3,$4)',
      [session_id, 'user', message, Date.now()]
    );

    const [qVec] = await embedTexts([message]);

    const { rows: allChunks } = await pool.query('SELECT content, embedding FROM chunks');
    const scored = allChunks.map(r => ({
      content: r.content,
      score: cosine(qVec, fromBytea(r.embedding))
    }));
    scored.sort((a,b) => b.score - a.score);
    const top = scored.slice(0, 6);
    const context = top.map(t => `• ${t.content}`).join('\n');

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

// --- INGEST endpoint ---
app.post('/api/ingest', async (req, res) => {
  const auth = req.get('authorization') || '';
  if (!auth.startsWith('Bearer ')) return res.status(401).send('Unauthorized');

  const { source = 'manual', url = null, title = null, text } = req.body || {};
  if (!text || text.length < 20) return res.status(400).send('text too short');

  const { chunk } = await import('./src/chunking.js');
  const chunks = chunk(text);
  const vecs = await embedTexts(chunks);

  const { rows: docRows } = await pool.query(
    'INSERT INTO docs (source, url, title, text, updated_at) VALUES ($1,$2,$3,$4,$5) RETURNING id',
    [source, url, title, text, Date.now()]
  );
  const docId = docRows[0].id;

  const qs = [];
  const params = [];
  let p = 1;
  for (let i=0;i<chunks.length;i++) {
    qs.push(`($${p++}, $${p++}, $${p++}, $${p++})`);
    params.push(docId, i, chunks[i], toBytea(vecs[i]));
  }
  await pool.query(
    `INSERT INTO chunks (doc_id, chunk_index, content, embedding) VALUES ${qs.join(',')}`,
    params
  );

  res.json({ docId, chunks: chunks.length });
});

// ---- Local helpers ----
function cosine(a, b) {
  let dot=0, na=0, nb=0;
  for (let i=0;i<a.length;i++){ dot+=a[i]*b[i]; na+=a[i]*a[i]; nb+=b[i]*b[i]; }
  return dot / (Math.sqrt(na)*Math.sqrt(nb) + 1e-8);
}
function fromBytea(buf) {
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  return new Float32Array(ab);
}
function toBytea(f32) {
  return Buffer.from(f32.buffer, f32.byteOffset, f32.byteLength);
}

const port = process.env.PORT || 3000;
app.listen(port, () => console.log('Exithis PG backend (corsfix) on :' + port));
