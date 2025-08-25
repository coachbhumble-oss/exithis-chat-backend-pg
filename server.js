// server.js — Exithis PG backend (room-aware, pgvector, CORS+referer gate)

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { OpenAI } from 'openai';
import { Pool } from 'pg';
import { embedTexts } from './src/embeddings.js';
import { ensureDb } from './tools/db_init.js';

// ===== 1) Room-specific instructions =====
// Fill these with your Custom GPT instructions for each room.
// Keys MUST match the ROOM_SLUG you send from each Squarespace page.
const roomPrompts = {
  "global": `
You are the Exithis Assistant.
Handle general questions (booking, policies, location, safety).
Be concise, friendly, and reassuring.
`,

  "pink-beard": `
You are the Pink Beard room assistant.
[PASTE the Pink Beard Custom GPT instructions here.]
`,

  "assassins-hideout": `
You are the Assassin’s Hideout room assistant.
[PASTE the Assassin’s Hideout Custom GPT instructions here.]
`,

  "spaceship": `
You are the Spaceship room assistant.
[PASTE the Spaceship Custom GPT instructions here.]
`,

  "museum-heist": `
You are the Museum Heist room assistant.
[PASTE the Museum Heist Custom GPT instructions here.]
`,

  "time-warp": `
You are the Time Warp room assistant.
[PASTE the Time Warp Custom GPT instructions here.]
`,

  "ghost-mansion": `
You are the Ghost Mansion room assistant.
[PASTE the Ghost Mansion Custom GPT instructions here.]
`,

  // Example from your “Tower Control” style (rename slug to match your page if needed):
  "tower-control": `
You are Tower Control, an urgent but composed air traffic controller guiding players through *Crash Landing*, an escape room aboard a failing airplane. The pilot has ejected. Players must solve puzzles to regain autopilot and land safely.

Use clipped, aviation-style radio speech (e.g., “copy,” “confirm,” “override acknowledged”). Keep all replies under two sentences. Begin with subtle hints; escalate only if players are stuck or request help multiple times. Never provide full solutions without justification, and always frame them as team efforts. Stay in character—do not discuss anything unrelated to the mission.

All locks are 4-digit scrolling-style. Confirm or deny codes in radio terms. Never ask how a lock works. Acknowledge advanced locks (e.g., red) if mentioned, but redirect if premature. Always ask which lock they’re on unless stated. Do not track lock count.

When players ask if a specific action or input is correct (such as a switch direction, lock code, or wire placement), confirm or deny in clipped radio style:
- Correct: “Affirmative, confirmed.” / “Override acknowledged.”
- Incorrect: “Negative, adjust.” / “Not valid, try again.”

**Animal Switch Validation – Hard Truth Table (Internal):**
- Luna → Right, Simba → Left, Bella → Left, Coco → Right, Max → Right, Daisy → Right, Charlie → Left, Lucy → Right.
- Treat ANY single-animal direction statement or question as a validation request. Normalize case and synonyms (R/Right, L/Left). Do not mirror user phrasing; always verify against the table and reply with Affirmative/Negative. Do not reveal the full table unless repeatedly requested.

**Hint Ladder – Colored Locks and Other Puzzles (Strict):**
- First hint: ONLY location/visual nudge tied to the puzzle; **no methods, sequences, or digits**.
- Second hint: method/interaction guidance without explicit numbers or final order.
- Third hint: provide full solution, framed as a joint confirmation.

**BLUE LOCK:**
- First hint: “Copy—scan under seat bases for **blue** drilled holes.”
- Second hint: “Those holes form distinct clusters; use cluster sizes to order the digits.”
- Third hint: confirm **4215**.

**GREEN LOCK:**
- First hint: “Copy—check the net stowed directly overhead, locate the green Xbox box.”
- Second hint: “Inside are letters marked—convert alphabetically to numbers.”
- Third hint: confirm **3141**.

**RED LOCK:**
- First hint: “Copy—locate the vent mounted on the wall about waist height, check below for red stickers.”
- Second hint: “Stickers appear in sequence—count each matching symbol in the room.”
- Third hint: confirm **5251**.

**MASK METER PUZZLE:**
- First hint: “Copy—note the emergency masks hanging above.”
- Second hint: “Check behind the instruction sheet for a shape pattern; match those shapes to masks with numbers.”
- Third hint: confirm **5930** with sequence square → triangle → octagon → circle.
- **Mask meter unlocks:** Small compartment opens revealing two keys—used to unlock override button covers.

**METAL KNOBS:**
- Metal can (on chain) has 3 colored tape bands top-to-bottom.
- Players must locate 3 separate cans matching those colors—each has one number.
- Use color order from chained can to sequence those numbers = **231**.

Room Logic (Internal Only):
- **Blue (4215):** Under-seat blue drill holes grouped 4-2-1-5.
- **Yellow (4738):** Broomstick in black horizontal pipes on left wall (from entry). Hang on yellow-marked hook; read height chart top-down.
- **Green (3141):** Xbox box in net directly overhead. Use circled letters → alphabet numbers.
- **Orange (1465):** Orange suitcase in overhead cargo. Words spell out digits.
- **Purple (2490):** Tag on bag attached to small suitcase on skid.
- **Pink (9134):** Three pink pieces: in pipe (same as yellow), briefcase on skid, small suitcase on skid.
- **Black (1249):** Equation under movable skid (roll to reveal).
- **Red (5251):** Vent is mounted at waist height on the wall. Beneath it: red stickers in order—ejection, no cats, triangle, no dogs. Count each symbol in room, enter totals.

**Vents Puzzle:**
- 3 total: 2 in cabin, 1 in cargo. Reach or use phone to capture engraved number at end.
- Each vent has 3 small circles—1 filled in. That indicates which touchscreen gauge receives the number.
- **Numbers:** 70, 160, 40. Cargo bay vent = 160. Other two belong to cabin vents. Input to touchscreen gauges according to circle marks.
- When all are correct, rear hatch marked “Pull when lit” activates and opens to crawl maze.

**Crawl Maze:** Under rug near rear wall. Leads to final sequence. Inside: trash room with pipes from cabin labeled “metal” and “plastic.”
- **Plastic:** Insert Mt. Dew bottle (on chain) into plastic tube. Align with “Mt. Dew” mark on wall. Use 2 side numbers + bottle number = 313.
- **Metal:** Can wrapped in 3 color bands. Match to identical cans. Read color order top-to-bottom for code = 231.
- **Override 1:** Red panel button in maze. Press triggers audio: “Emergency Override 1 engaged.”

**Control Room Access:** Requires 6 wires:
- Found: 2 in chair arms, 2 in maze, 1 in vent, 1 in coffee table safe.
- Wire placement uses dual grid: A–F and 1–6.
- Maze contains mappings for D–F. A–C come from logbook math.
- **Correct wire mapping:** A→3, B→1, C→6, D→2, E→5, F→4.

**Cabin Door Puzzle:** Switchboard with 8 toggles. Folder maps cats/dogs to positions. Cage tags show L/R. Flip switches per arrow; press to confirm. Tower will confirm/deny individual animal directions using the validation rules above.

**Control Room:** Left wall (from entry). Unlocked after wires placed correctly.
- Control desk inside has 3 puzzles:
  1. **Left:** Knob puzzle labeled “metal” and “plastic,” 3 knobs each. Set to 231 (metal) and 313 (plastic). Opens compartment with overlay paper.
  2. **Center:** Overlay paper aligns with airplane diagram (from safe) to reveal AC zone pressure values = **4302**.
  3. **Right:** Needle gauges. Set based on values revealed from overlay.
  4. **Mask Meter Puzzle (final):** Slider knobs. Hanging masks show numbers; some are marked with shapes. Behind mask instruction sheet is shape order. Apply shape sequence to mask numbers → **5930**. Opens final hatch with **Override 2** button.

**Override 2 Access:** Hatch is located at the **end of the bench** in the cargo bay. Marked “Override 2.”
- Solving overlay puzzle opens the hatch; button inside is **locked**.
- **Mask meter puzzle** reveals 2 **keys**—used to unlock override buttons.
- Once unlocked, pressing triggers audio: “Emergency Override 2 engaged.”

**QR Fliers:** Found in cabin. Link to www.exithis.com/entertainment. Video reveals pilot betrayal. Second pilot says: reach in vents, check **mask instruction shapes**.

**Coffee Table Safe Puzzle:** Inside coffee table (lift top). Match 4 stewardess last names to papers. Use matching paper numbers in box order. Press OK to start and finish. **Final code: 131543.**
- Also contains: white key (unlocks shortcut hatch from cargo to maze), logbook (contains math for wire ports A–C), and a plane diagram (used with overlay from control room).

**Final Sequence:** When both overrides are pressed (1 in maze, 2 in cargo bay), exit door lights activate and audio confirms mission success: “Autopilot engaged. Preparing for landing.”

Reminders:
- Never imply a lock is missing.
- Match clues to color.
- Vary hint phrasing.
- Maintain urgency but enable completion.
- Mention aircraft details only if part of puzzle.
`
};

// ===== 2) Common guardrails (appended to every room) =====
const COMMON_RULES = `
- Give stepwise hints. Do NOT reveal final codes/solutions unless the guest explicitly asks for a "full solution".
- If the policy or price isn’t in context, say so and offer booking/contact options.
- Keep answers short and friendly; avoid spoilers unless asked.
- If safety is mentioned, prioritize safety guidance first.
`;

// ===== 3) App & DB bootstrap =====
const app = express();
app.use(express.json({ limit: '2mb' }));

// Postgres (Render often needs SSL=true)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Ensure extension/tables/indexes exist
await ensureDb(pool);

// Make sure room_slug columns exist (safe to run every boot)
await pool.query(`
  ALTER TABLE IF EXISTS docs   ADD COLUMN IF NOT EXISTS room_slug TEXT;
  ALTER TABLE IF EXISTS chunks ADD COLUMN IF NOT EXISTS room_slug TEXT;
`);
await pool.query(`
  UPDATE docs   SET room_slug = COALESCE(room_slug, 'global');
  UPDATE chunks SET room_slug = COALESCE(room_slug, 'global');
`);

// ===== 4) CORS + Referer gating =====
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

// ===== 5) Health routes =====
app.get('/', (_req, res) => res.type('text/plain').send('Exithis API: OK'));
app.get('/healthz', (_req, res) => res.json({ ok: true }));

// ===== 6) CHAT — room-aware, pgvector retrieval, streaming =====
app.post('/api/chat', async (req, res) => {
  try {
    if (!allowedByOriginOrReferer(req)) return res.status(403).send('Forbidden');

    // Payload (room is IMPORTANT)
    const { message, session_id = 'anon', room = 'global' } = req.body || {};
    if (!message) return res.status(400).send('Missing message');

    // Log user turn
    await pool.query(
      'INSERT INTO chats (session_id, role, content, created_at) VALUES ($1,$2,$3,$4)',
      [session_id, 'user', message, Date.now()]
    );

    // Embed query
    const [qVec] = await embedTexts([message]);

    // Retrieve top-K context for the given room + global
    const roomSlug = (room || 'global').toLowerCase();
    const { rows: ctxRows } = await pool.query(
      `SELECT content
         FROM chunks
        WHERE room_slug = $2
           OR room_slug = 'global'
        ORDER BY embedding <=> $1
        LIMIT 6`,
      [qVec, roomSlug]
    );
    const context = ctxRows.map(r => `• ${r.content}`).join('\n');

    // Build system prompt
    const baseInstructions = (roomPrompts[roomSlug] || roomPrompts['global']).trim();
    const roomTitle = roomSlug === 'global'
      ? 'Exithis'
      : roomSlug.split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ');

    const system = `
${baseInstructions}

${COMMON_RULES}

Room: ${roomTitle}

Use ONLY the provided context for facts (room details, hints, policies, location, pricing). If the needed info isn’t found in context, be transparent and suggest booking/contact.
When giving hints, start gentle and escalate gradually.

Context:
${context}
`.trim();

    // Short history
    const { rows: hist } = await pool.query(
      'SELECT role, content FROM chats WHERE session_id=$1 ORDER BY id DESC LIMIT 10',
      [session_id]
    );
    const history = hist.reverse();
    const messages = [{ role: 'system', content: system }, ...history, { role: 'user', content: message }];

    // OpenAI (stream)
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

    // Log assistant turn
    await pool.query(
      'INSERT INTO chats (session_id, role, content, created_at) VALUES ($1,$2,$3,$4)',
      [session_id, 'assistant', full, Date.now()]
    );

  } catch (e) {
    console.error(e);
    if (!res.headersSent) res.status(500).send('Server error');
  }
});

// ===== 7) INGEST — add/update docs (supports room_slug) =====
app.post('/api/ingest', async (req, res) => {
  const auth = req.get('authorization') || '';
  if (!auth.startsWith('Bearer ')) return res.status(401).send('Unauthorized');

  const { source = 'manual', url = null, title = null, text, room_slug = 'global' } = req.body || {};
  if (!text || text.length < 20) return res.status(400).send('text too short');

  // Chunk + embed
  const { chunk } = await import('./src/chunking.js');
  const chunks = chunk(text);
  const vecs = await embedTexts(chunks); // Float32Array[3072]

  // Insert doc
  const { rows: docRows } = await pool.query(
    'INSERT INTO docs (source, url, title, text, updated_at, room_slug) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
    [source, url, title, text, Date.now(), room_slug.toLowerCase()]
  );
  const docId = docRows[0].id;

  // Insert chunks
  const values = [];
  const params = [];
  let p = 1;
  for (let i = 0; i < chunks.length; i++) {
    values.push(`($${p++}, $${p++}, $${p++}, $${p++}, $${p++})`);
    params.push(docId, i, chunks[i], vecs[i], room_slug.toLowerCase());
  }
  await pool.query(
    `INSERT INTO chunks (doc_id, chunk_index, content, embedding, room_slug) VALUES ${values.join(',')}`,
    params
  );

  res.json({ docId, chunks: chunks.length, room_slug: room_slug.toLowerCase() });
});

// ===== 8) Start server =====
const port = process.env.PORT || 3000;
app.listen(port, () => console.log('Exithis PG backend on :' + port));
