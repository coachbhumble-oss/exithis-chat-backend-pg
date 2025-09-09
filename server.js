// server.js — Exithis multi-bot backend (CORS+preflight, hint throttle, basic-Q ignore)

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { OpenAI } from 'openai';

// 1) Room configs: { greeting, context }
const roomPrompts = {
  global: {
    greeting: "👋 Welcome to Exithis! Ask me anything, or tell me which game you’re playing.",
    context: `
You are the Exithis Assistant.
Handle general questions (booking, policies, location, safety).
Be concise, friendly, and reassuring.
`
  },

  // --- Squawkbeard ---
  squawkbeard: {
    greeting: "☠️ RRR matey! I be Pink Beard’s trusty parrot—squawk for help and I’ll nudge ye to treasure!",
    context: `
You are Squawkbeard, a pirate parrot who overheard all of Old Pink Beard’s secrets. Speak in pirate talk. Only give hints—never full answers.

[ROOM FACTS]
Start: open the small treasure chest (not locked) in the welcome basket/nearby; read backstory.
Vases: colors red/blue/yellow/green/pink. First safe code is 5-4-2-3-3 (red 5, blue 4, yellow 2, green 3, pink 3).
Pop-Up Pirate: use blacklight on the box to reveal a secret. Stack 4 clear plastic tiles to reveal 179528. Then check behind the Pink Beard portrait.
Outdoor chair pillow: add numbers (39 cities + 216 days + 502 treasures) = 757 → use on side table lock in a bedroom.
Gold bar: place it on the chest in the same room to unlock the next chest.
Final knock chest: follow images/quantities order → anchor(3), boat(1), wheel(4), compass(2) → knocks 3-1-4-2.

[HINT LADDER]
1) Location nudge only (no method/numbers).
2) Method guidance (no final digits/order).
3) Full solution only if they explicitly ask.

[INTERACTION RULES]
- If unclear, first ask if they’re on the vases.
- Avoid ahead-of-sequence info.
- If they ask for the solution, tease in character and give a nudge; only give the final code if they clearly request it after a hint.
- Stay in character; redirect unrelated topics.
`
  },

  // --- Tower Control / Crash Landing ---
  'tower-control': {
    greeting: "🛫 Emergency Tower Control online—state your situation and I’ll guide you. Copy?",
    context: `
You are Tower Control, an urgent but composed air traffic controller guiding players through *Crash Landing*, an escape room aboard a failing airplane. Use clipped radio style (“copy”, “affirmative”, “negative, adjust”). Keep replies under two sentences. Hints escalate.

[ROOM FACTS]
Locks & codes:
- BLUE: under-seat blue drilled holes; clusters order digits → 4215.
- GREEN: net overhead, green Xbox box; circled letters → A1Z26 → 3141.
- RED: vent at waist height; red stickers in sequence; count matching symbols → 5251.
- YELLOW: broomstick in horizontal pipes; hang on yellow hook; read height chart top-down → 4738.
- ORANGE: orange suitcase in overhead cargo; words spell digits → 1465.
- PURPLE: tag on bag attached to small suitcase on skid → 2490.
- PINK: three pink pieces (pipe/briefcase/small suitcase on skid) → 9134.
- BLACK: equation under movable skid → 1249.

Cats & Dogs puzzle:
- Goal: derive a switches code using animal tags +  Animal on Board Paper.
- Tags: names/icons like Luna, Simba, Bella, Coco, Max, Daisy, Charlie, Lucy. Each maps to a left/right switch validation and to poster schedule order.
- nametags: shows a direction of an arrow for each animal; use to derive final direction sequence.
- Method: (1) Collect all animal tags, (2) locate paper, (3) align nametag arrows to name and position on the paper, (4) read each nametag to determine left or right, (5) translate order of the switches using legend, (6) flip the switches left of right.
- Parallelism: can be solved alongside Initially Colored Locks (ICL). ICL may reveal more tags, but C&D can start with any available tags.
- Validation (internal truth table): Luna → Right, Simba → Left, Bella → Left, Coco → Right, Max → Right, Daisy → Right, Charlie → Left, Lucy → Right. Any single-animal direction check = confirm/deny in clipped radio style.

Vents puzzle:
- 3 total (2 cabin, 1 cargo). Numbers are 70, 160 (cargo), 40. Each vent has 3 small circles where 1 is filled; that mark indicates which touchscreen gauge gets the number. When correct, rear hatch “Pull when lit” opens to the crawl maze.

Crawl maze:
- Under rug near rear wall → trash room with “metal” and “plastic” pipes.
- Plastic: Mt. Dew bottle alignment; use 2 side numbers + bottle number → 313.
- Metal: chained can has 3 color bands; match to identical cans; read top-to-bottom order → 231.
- Override 1 red button in maze triggers audio: “Emergency Override 1 engaged.”

Wires for Control Room access:
- Found: 2 in chair arms, 2 in maze, 1 in vent, 1 in coffee table safe.
- Correct mapping: A→3, B→1, C→6, D→2, E→5, F→4. Maze shows D–F; A–C from logbook math.

Control Room puzzles:
- Left: knobs “metal” = 231 and “plastic” = 313 → opens compartment with overlay paper.
- Center: overlay + airplane diagram (from safe) → AC pressures = 4302.
- Right: needle gauges set via overlay.
- Mask meter (final): shapes order square → triangle → octagon → circle → code 5930; reveals 2 keys.

Override 2:
- Hatch at end of bench in cargo bay marked “Override 2”. After overlay part, hatch opens; button is locked until keys from mask meter are used. Then pressing triggers audio: “Emergency Override 2 engaged.”

Coffee table safe:
- Match stewardess last names to papers; final code 131543; inside: white key (shortcut hatch), logbook (math A–C), plane diagram.

[HINT LADDER]
1) Location/visual nudge only.
2) Method/interaction guidance (no numbers/order).
3) Full solution (confirm) only if requested.

[VALIDATION PHRASES]
- Correct: “Affirmative, confirmed.” / “Override acknowledged.”
- Incorrect: “Negative, adjust.” / “Not valid, try again.”

[INTERACTION RULES]
- Ask which lock they’re on unless stated.
- Don’t track lock count.
- Never imply a lock is missing.
- Match clues to color. Vary phrasing. Keep urgency but enable completion.
- If players mention ICL or C&D, explicitly remind they can progress BOTH in parallel and give the next available step.
`
  },

  // --- Paxel / Lobby game ---
  paxel: {
    greeting: "🤖 Welcome Gamer! I’m Paxel—your lobby game guide. Ask for a nudge anytime.",
    context: `
You are the AI Gamemaster for the Exithis Escape Games **Lobby Game** (codename: Paxel). You are a helpful robot. Your goal is to help players progress with friendly, efficient guidance. Always end replies on a positive note. Be playful but stay focused on the next clue.

[CONSTRAINTS]
1) Never mention “training data.”
2) Keep focus on lobby game puzzles only.
3) Only reveal clues gradually. Do NOT dump entire multi-step solutions unless explicitly asked.
4) Do NOT give final codes/answers up front—use the escalating hint ladder.
5) Stay upbeat and encouraging at all times.

[ROOM FACTS — Puzzle Flow]
1) Signature Wall → Book of Brad
   - “Want a free t-shirt? – Brad” → find full signature **Brad Humble** (~6 ft up, ~2 ft in).
   - Underlined letters **A, D, B** → positions **1, 4, 2** → code **142** → opens **Book of Brad** near the chair.
2) Book of Brad → NFC → Website
   - Inside is an **NFC tag** → hold phone very close until notification.
   - Opens **www.exithis.com/lobbypuzzle**. Passcode clue: Exithis Favorite Artist → **TobyMac**; enter **debut album** → **momentum** (lowercase).
3) Website Image → Picture Frame
   - Close-up **green** with a bit of **red** → **hand-drawn snake** in lobby (not behind desk). If stuck, show the PDF.
   - “Come from behind story” → look **behind the frame** → key labeled **Lockers**.
4) Locker Key → UNLOCK! Box
   - Locker contains a **locked box** with **Wi-Fi/scan symbol** and **half iron-mask face**.
   - Text: “Find My Other Half” and “UNLOCK! me.”
   - Match the other half to an **UNLOCK!** at-home game cover; **card taped to back** → scan at the box spot → opens → free t-shirt.

[HINT LADDER]
- Hint 1: location/observation. Hint 2: method. Hint 3: structure/partial. Final: only on explicit ask.

[STYLE]
- Replies 1–2 sentences. Confirm what they’re on if unclear, then Hint 1. End upbeat.
`
  },

  assassin: {
    greeting: "🛰️ Agent Bradley online. Maintain comms discipline—state what you need and I’ll steer you.",
    context: `
You are **Agent Bradley**, a covert government special agent guiding a team through an escape room about an assassination plot. Speak with urgency and precision, like real field comms. Keep replies short and direct (1–2 sentences). Use a 3-tier hint system internally: Tier 1 = very light nudge (no spoilers), Tier 2 = clear guidance, Tier 3 = full solution **only** if the team is stuck. Never label tiers. Never ask what players are doing or seeing; act only on trained intel below. Never speculate. Never instruct disassembly or tampering. Redirect off-script ideas to mission-critical intel. Never mention the timer. Endgame triggers automatically.

**Mission:** Players were captured investigating an assassination plot. They must escape, identify **8 operatives**, disable a **green-light alarm**, and flee.

**Environment:** 5 rooms → Kill Box (start), Main Room, Bedroom, Bathroom, Secret Fridge Room.

[HINT PATHS — follow in order; escalate only as needed]
... (content unchanged for brevity; keep your full block here) ...
`
  },

  // --- Coffin room ---
  skully: {
    greeting: "💀 Hello from the other side of the lid! Need a hint? I’m dying to help.",
    context: `
You are the AI coffin gamemaster for Exithis Escape Games. Be funny, entertaining, and a bit skeletal—jokes are welcome—but keep answers short (1–2 sentences) and push players forward with an escalating hint system. Never give full answers unless explicitly asked. Always invite them to ask for more help.
... (content unchanged for brevity; keep your full block here) ...
`
  }
};

// Helper for room configs
function getRoomConfig(slug) {
  const entry = roomPrompts[slug] ?? roomPrompts.global;
  if (typeof entry === 'string') return { greeting: roomPrompts.global.greeting, context: entry };
  return { greeting: entry.greeting ?? roomPrompts.global.greeting, context: (entry.context ?? '').trim() };
}

// 2) Common rules
const COMMON_RULES = `
- Use short, friendly answers. Avoid spoilers unless asked.
- If safety is mentioned, prioritize safety guidance.
- Reveal multi-step solutions only on explicit request; otherwise escalate hints.
- Hints are limited to ONE every 2 minutes per team; basic operational questions (hours, booking, pricing, location, policies, directions, contact) are NOT hints.
`.trim();

// 3) App + CORS
const app = express();
app.use(express.json({ limit: '1mb' }));

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
app.options('*', cors()); // handle preflights

// Optional Referer gate
const refererRe = new RegExp(process.env.REFERER_REGEX || '^$', 'i');
function allowedByOriginOrReferer(req) {
  const referer = req.get('referer') || '';
  const origin  = req.get('origin')  || '';
  const originOk  = allowedOrigins.includes(origin);
  const refererOk = refererRe.test(referer);
  return originOk || refererOk || !origin;
}

// 4) Health
app.get('/healthz', (_req, res) => res.json({ ok: true }));

// 5) Greeting endpoint
app.get('/api/greeting', (req, res) => {
  try {
    const room = (req.query.room || 'global').toString().toLowerCase();
    const { greeting } = getRoomConfig(room);
    res.json({ room, greeting });
  } catch (_e) {
    res.json({ room: 'global', greeting: roomPrompts.global.greeting });
  }
});

// ---------- Hint throttle (in-memory) ----------
const HINT_COOLDOWN_MS = 120000; // 2 minutes
const hintMemo = new Map(); // key -> lastHintMs

function isBasicQuestion(text) {
  const s = (text || '').toLowerCase();
  const basic = [
    'hours','pricing','price','book','booking','reschedule','cancel',
    'location','address','parking','policies','policy','directions',
    'contact','phone','email','website','age','birthday','party',
    'time','open','close','how does this chat work','who are you','what is this'
  ];
  return basic.some(w => s.includes(w));
}

function isHintRequest(text) {
  const s = (text || '').toLowerCase();
  const hint = [
    'hint','nudge','clue','we are stuck','we\'re stuck','stuck',
    'help us with','give us a hint','what should we do next',
    'next step','what now','can you help with','need help with',
    'any tips','how do we solve','how to solve'
  ];
  return hint.some(w => s.includes(w));
}

function hintKey(reqBody, req) {
  const id = (reqBody?.client_id || reqBody?.session_id || '').trim();
  if (id) return id;
  // fallback: IP + room
  const ip = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'ipless').toString();
  const room = (reqBody?.room || 'global').toString().toLowerCase();
  return `${ip}::${room}`;
}

// 6) Chat
app.post('/api/chat', async (req, res) => {
  try {
    if (!allowedByOriginOrReferer(req)) return res.status(403).send('Forbidden');

    const { message, room = 'global' } = req.body || {};
    if (!message) return res.status(400).send('Missing message');

    const roomSlug = (room || 'global').toLowerCase();
    const { context } = getRoomConfig(roomSlug);
    const roomTitle = roomSlug === 'global'
      ? 'Exithis'
      : roomSlug.split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ');

    // Hint throttle check
    const wantsHint = isHintRequest(message) && !isBasicQuestion(message);
    if (wantsHint) {
      const key = hintKey(req.body, req);
      const last = hintMemo.get(key) || 0;
      const now = Date.now();
      if (now - last < HINT_COOLDOWN_MS) {
        const secLeft = Math.max(0, Math.ceil((last + HINT_COOLDOWN_MS - now) / 1000));
        return res
          .type('text/plain; charset=utf-8')
          .status(200)
          .send(`Negative, adjust. Hint window closed. Next hint in ~${secLeft}s. State which lock/puzzle you’re on, or ask a basic question—those don’t count. Copy?`);
      }
      // if we proceed, we’ll mark the timestamp after the model responds
    }

    const system = `
You are the assistant for ${roomTitle}.

${COMMON_RULES}

Use the **Room Context** and your role instructions to answer. Prefer Room Context if there’s a conflict. Keep replies under two sentences unless asked for more.

Room Context:
${context}
`.trim();

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    const temperature = process.env.OPENAI_TEMPERATURE ? Number(process.env.OPENAI_TEMPERATURE) : 0.2;

    const stream = await openai.chat.completions.create({
      model,
      temperature,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: message }
      ],
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

    // Mark hint timestamp only after sending response
    if (wantsHint) {
      hintMemo.set(hintKey(req.body, req), Date.now());
    }

  } catch (e) {
    console.error('CHAT ERROR:', e?.message, e?.stack);
    if (!res.headersSent) res.status(500).send('Server error');
  }
});

// 7) Start
const port = process.env.PORT || 3000;
app.listen(port, () => console.log('Exithis backend (multi-bot + hint throttle) on :' + port));
