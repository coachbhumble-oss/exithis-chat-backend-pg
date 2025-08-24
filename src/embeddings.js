import { OpenAI } from 'openai';
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function embedTexts(texts) {
  const r = await openai.embeddings.create({ model: 'text-embedding-3-large', input: texts });
  return r.data.map(d => Float32Array.from(d.embedding));
}
