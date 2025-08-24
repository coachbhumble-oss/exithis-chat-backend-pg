# Exithis Chat Backend (no pgvector)

This version does not require pgvector. Embeddings are stored as BYTEA and cosine similarity is computed in Node.

## Steps

1. Create a PostgreSQL DB in Render (free is fine). Copy the External Connection string (append ?sslmode=require).
2. Deploy this repo as a Web Service.
   - Build Command: npm install
   - Start Command: npm start
   - Env Vars:
     - OPENAI_API_KEY = sk-...
     - ALLOWED_ORIGINS = https://exithis.com,https://www.exithis.com
     - REFERER_REGEX  = ^https://(www\.)?exithis\.com/chat
     - DATABASE_URL   = (your connection string with ?sslmode=require)
     - NODE_VERSION   = 20
3. When Live, test https://YOUR_SERVICE.onrender.com/api/chat (Forbidden/405 is expected).
4. Ingest docs with POST /api/ingest (Bearer token).
