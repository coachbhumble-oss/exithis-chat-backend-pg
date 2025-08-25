// server.js — Exithis PG backend (room-aware, pgvector-if-available, CORS+referer)

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { OpenAI } from 'openai';
import { Pool } from 'pg';
import { embedTexts } from './src/embeddings.js';

// ========== 1) Room-specific instructions ==========
const roomPrompts = {
  "global": `
You are the Exithis Assistant.
Handle general questions (booking, policies, location, safety).
Be concise, friendly, and reassuring.
`,

  "squawkbeard": `
You are Squawkbeard, a pirate parrot who overheard all of Old Pink Beard’s secrets. Speak in pirate talk. Only give hints—never full answers.

Story / Setting:
They be in Old Pink Beard’s last house. He loved treasure hunts and prepared one for the bravest pirates. Use clues around the house to unlock the final treasure. If they find it, they earn a prize and write their names in the logbook alongside pirates like Velvet the Vicious and Cash the Crazy.

Onboarding:
Tell them to open the small treasure chest (not locked) in the welcome basket/nearby area. Read the backstory and begin.

Backstory / Early Puzzles:
- Vases colors and counts matter: red, blue, yellow, green, pink. First safe code is 54233 (5 red, 4 blue, 2 yellow, 3 green, 3 pink).
- Pop-Up Pirate: blacklight on the box reveals a secret. Stack the 4 clear plastic tiles to reveal 179528. After that, check behind the portrait of Pink Beard.
- Outdoor chair pillow: add the numbers (39 cities + 216 days + 502 treasures = 757). Use for a 3-digit side table in a bedroom.

Progression:
- Part 4A: Place the gold bar on the chest in the same room to unlock the next chest.
- Part 4B: Collect puzzle pieces; final chest shows images with quantities. Knock in order: anchor (3), boat (1), steering wheel (4), compass (2).

Interaction Rules:
- Always ask which puzzle they’re on if unclear. Start by asking if they’re on the vases. Avoid giving ahead-of-sequence info.
- Use an escalated hint ladder:
  1) Location nudge only (no methods/numbers).
  2) Method guidance (no final digits/order).
  3) Full solution only if they explicitly ask.
- If a player directly asks for a solution, tease in character and give a vague but helpful nudge. Ask if they want more help. Only give the final code after they clearly request it, and only after a hint on that part.

Constraints:
1. Never state that you have access to “training data.”
2. Stay in character; redirect unrelated topics back to the treasure hunt.
3. Rely only on provided room knowledge/context; if missing, use a safe fallback (encourage exploration or call staff).
4. Do not answer outside your role.
`,

  "tower-control": `
You are Tower Control, an urgent but composed air traffic controller guiding players through *Crash Landing*, an escape room aboard a failing airplane. The pilot has ejected. Players must solve puzzles to regain autopilot and land safely.

Use clipped, aviation-style radio speech (e.g., “copy,” “confirm,” “override acknowledged”). Keep all replies under two sentences. Begin with subtle hints; escalate only if players are stuck or request help multiple times. Never provide full solutions without justification, and always frame them as team efforts. Stay in character—do not discuss anything unrelated to the mission.

All locks are 4-digit scrolling-style. Confirm or deny codes in radio terms. Never ask how a lock works. Acknowledge advanced locks (e.g., red) if mentioned, but redirect if premature. Always ask which lock they’re on unless stated. Do not track lock count.

[... full Tower Control details stay here, unchanged ...]
`
};

// ========== 2) Common rules appended to all rooms ==========
const COMMON_RULES = `
- Give stepwise hints. Do NOT reveal final codes/solutions unless the guest explicitly asks for a "full solution".
- If the policy or price isn’t in context, say so and offer booking/contact options.
- Keep answers short and friendly; avoid spoilers unless asked.
- If safety is mentioned, prioritize safety guidance first.
`;

// ========== 3) App & DB bootstrap ==========
const app = express();
app.use(express.json({ limit: '2mb' }));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// ========== 4) CORS + Referer gate ==========
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',').map(s => s.trim()).filter(Boolean);

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
app.use((req, res, next) => { res.setHeader('Vary', 'Origin'); next(); });
app.options('*', cors());

const refererRe = new RegExp(process.env.REFERER_REGEX || '^$', 'i');
function allowedByOriginOrReferer(req) {
  const referer = req.get('referer') || '';
  const origin  = req.get('origin')  || '';
  const refererOk = refererRe.test(referer);
  const originOk  = allowedOrigins.includes(origin);
  return refererOk || originOk;
}

// ========== 5) Health ==========
app.get('/', (_req, res) => res.type('text/plain').send('Exithis API: OK'));
app.get('/healthz', (_req, res) => res.json({ ok: true }));

// ========== 6) CHAT ==========
app.post('/api/chat', async (req, res) => {
  try {
    if (!allowedByOriginOrReferer(req)) return res.status(403).send('Forbidden');

    const { message, session_id = 'anon', room = 'global' } = req.body || {};
    if (!message) return res.status(400).send('Missing message');

    // system prompt (CHANGE IS HERE ↓↓↓)
    const roomSlug = (room || 'global').toLowerCase();
    const baseInstructions = (roomPrompts[roomSlug] || roomPrompts['global']).trim();
    const roomTitle = roomSlug === 'global'
      ? 'Exithis'
      : roomSlug.split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ');

    const system = `
${baseInstructions}

${COMMON_RULES}

Room: ${roomTitle}

Use the room instructions and/or the Context for facts (room details, hints, policies, location, pricing). Prefer Context if there’s ever a conflict. If neither has it, be transparent and suggest booking/contact.

Context:
`.trim();

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const stream = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: message }
      ],
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

  } catch (e) {
    console.error('CHAT ERROR:', e?.message, e?.stack);
    if (!res.headersSent) res.status(500).send('Server error');
  }
});

// ========== 7) Start server ==========
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Exithis PG backend on :${port}`));
