export function chunk(text, maxChars = 1200, overlap = 150) {
  const parts = [];
  let i = 0;
  while (i < text.length) {
    const end = Math.min(text.length, i + maxChars);
    parts.push(text.slice(i, end));
    i = end - overlap;
    if (i < 0) i = 0;
  }
  return parts.map(t => t.trim()).filter(Boolean);
}
