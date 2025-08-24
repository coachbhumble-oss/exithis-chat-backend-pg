# Exithis Chat Backend (Postgres + pgvector)

This version uses **Render PostgreSQL** (or any Postgres) so your data **persists on the free plan** — no disks needed.

## What you get
- `/api/chat` — streaming chat with RAG (retrieval)
- `/api/ingest` — add/update docs (FAQs, room blurbs, policies)
- CORS + referer lock to `https://exithis.com/chat`
- Postgres schema with **pgvector** (`vector(3072)`) for OpenAI `text-embedding-3-large`

## 1) Set up Postgres on Render
1. In Render → **New + → PostgreSQL** (free tier is fine).  
2. After it creates, click the DB → copy the **External Connection** string (starts with `postgres://...`).  
3. Create a **Web Service** for this project:
   - Build: `npm install`
   - Start: `npm start`
   - Environment Variables:
     - `OPENAI_API_KEY` = your key
     - `ALLOWED_ORIGINS` = `https://exithis.com,https://www.exithis.com`
     - `REFERER_REGEX` = `^https://(www\.)?exithis\.com/chat`
     - `DATABASE_URL` = your Postgres connection string
4. On first start the app auto‑creates the `vector` extension, tables and index.

## 2) Test locally (optional)
```bash
cp .env.example .env
# fill in OPENAI_API_KEY and DATABASE_URL (from Render or local Postgres)
npm install
npm run db:init
npm run dev
```

## 3) Ingest content
```bash
# local
export SEED_API="http://localhost:3000/api/ingest"
export SEED_BEARER="DEV_TOKEN"
npm run seed
# or deploy URL
export SEED_API="https://YOUR_WEB_SERVICE_URL/api/ingest"
npm run seed
```

## 4) Hook up Squarespace widget
On your `/chat` page (Page Settings → Advanced → Header Code Injection), set:
```js
const CHAT_API_ENDPOINT = "https://YOUR_WEB_SERVICE_URL/api/chat";
```

## Notes
- Uses cosine distance `<=>` with an IVFFLAT index (`vector_cosine_ops`).  
- For scale, tune IVFFLAT `lists` and run `ANALYZE` on the table.  
- Add rate-limits/IP checks as needed.
