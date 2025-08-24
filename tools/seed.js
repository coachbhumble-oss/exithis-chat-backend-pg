import 'dotenv/config';
import fetch from 'node-fetch';

const API = process.env.SEED_API || 'http://localhost:3000/api/ingest';
const BEARER = process.env.SEED_BEARER || 'DEV_TOKEN';

async function main() {
  const docs = [{
    source: 'faq',
    title: 'Exithis FAQ',
    text: `
About Exithis:
- Standard game length: 60 minutes.
- Booking: online at exithis.com; walk-ins subject to availability.
Policies:
- Age recommendations, rescheduling, cancellation, arrival instructions.
Rooms:
- Pink Beard: short blurb + difficulty + family-friendly tips.
- Assassins Hideout, Spaceship, etc. Add key details customers ask often.
Hints:
- We provide gentle, stepwise hints upon request; just ask "hint" in chat.
Contact:
- Best email/phone/hours.
` }];

  for (const d of docs) {
    const res = await fetch(API, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${BEARER}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(d)
    });
    console.log(d.title, res.status, await res.text());
  }
}
main().catch(console.error);
