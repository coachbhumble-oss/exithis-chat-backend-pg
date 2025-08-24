# Exithis Chat Backend (CORS fix, no pgvector)

- Proper CORS with OPTIONS preflight handled
- Referer OR Origin gating
- No pgvector (embeddings stored as BYTEA; similarity computed in Node)
- SSL forced for Postgres

## Deploy

1. Create a PostgreSQL DB in Render (free tier ok). Copy the External Connection string (append ?sslmode=require).
2. Deploy this repo as a Web Service.
   - Build Command: npm install
   - Start Command: npm start
   - Env Vars:
     - OPENAI_API_KEY = sk-...
     - ALLOWED_ORIGINS = https://exithis.com,https://www.exithis.com,https://exithis.squarespace.com,https://account.squarespace.com
     - REFERER_REGEX  = ^https://(www\.)?exithis\.com(/.*)?$|^https://([a-z0-9-]+\.)*squarespace\.com(/.*)?$
     - DATABASE_URL   = postgresql://.../DB?sslmode=require
     - NODE_VERSION   = 20

Check:
- GET / -> "Exithis API: OK"
- GET /healthz -> { ok: true }
- POST /api/chat
- POST /api/ingest (Authorization: Bearer DEV_TOKEN)
