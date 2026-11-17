// Vercel serverless function: receives a meal photo, asks Google Gemini, returns JSON text.
// The API key lives ONLY in the Vercel environment variable GEMINI_API_KEY (never in the page).
// ---- Your Gemini key (server-side only; visitors of the website cannot see this file). ----
// Keep this repository PRIVATE. If you ever make it public, delete this key and use the
// GEMINI_API_KEY environment variable in Vercel instead (it takes priority over this value).
const EMBEDDED_KEY = 'AQ.Ab8RN6JIP-I6QxNgXEz9VplIphXl19-XZFPaDsg8m4r1ko1saQ';

const PROMPT = `You are an expert nutritionist and food recognition system. Look carefully at the photo and the user's description, if any.
Step 1: decide whether it shows food or drink.
Step 2: identify EVERY distinct item separately. For a thali or plate, list each dish (rice, dal, roti, sabzi, salad, sauces, drinks). Use specific common names such as "chicken biryani", "masala dosa" or "paneer butter masala", not vague ones.
Step 3: estimate each portion in grams using cues like plate size, utensils and typical servings, then give calories and macros for THAT portion, including cooking oil, butter, cream and sugar where likely.
Reply with ONLY valid JSON, no markdown, in exactly this shape:
{"is_food":true,"items":[{"name":"","portion":"e.g. 1 cup or 2 pieces","grams":0,"calories":0,"protein_g":0,"carbs_g":0,"fat_g":0,"ingredients":["main ingredients, max 8"],"confidence":"high|medium|low"}],"notes":"one short sentence about uncertainty"}
If the image is not food, return {"is_food":false,"items":[],"notes":"No food detected"}. Every number must be a plain number.`;

// Models are tried in order. Set GEMINI_MODEL in Vercel to force a specific one.
const MODELS = (process.env.GEMINI_MODEL ? [process.env.GEMINI_MODEL] : [])
  .concat(['gemini-2.5-flash', 'gemini-3.5-flash-lite', 'gemini-flash-latest']);

// Simple per-IP limit (resets when the serverless instance restarts) to protect your free quota.
const hits = new Map();
function limited(ip) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < 60000);
  arr.push(now);
  hits.set(ip, arr);
  return arr.length > 8;
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.', code: 'method' });

  const key = process.env.GEMINI_API_KEY || EMBEDDED_KEY;
  if (!key) return res.status(500).json({ error: 'Missing GEMINI_API_KEY.', code: 'server_not_configured' });

  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (limited(ip)) return res.status(429).json({ error: 'Too many requests.', code: 'rate_limited' });

  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
  b = b || {};
  const image = typeof b.image === 'string' ? b.image : '';
  const description = typeof b.description === 'string' ? b.description.slice(0, 400) : '';
  if (!image && !description) return res.status(400).json({ error: 'Send a photo or a description.', code: 'bad_request' });
  if (image.length > 3500000) return res.status(413).json({ error: 'Photo too large.', code: 'image_rejected' });

  const mime = ['image/jpeg', 'image/png', 'image/webp'].includes(b.mime) ? b.mime : 'image/jpeg';
  let text = PROMPT;
  if (description) text += `\n\nThe user says this meal is: "${description}". Trust this description for items, quantities and hidden ingredients.`;
  if (!image) text += '\n\nNo photo was provided: estimate from the description only.';
  const parts = [{ text }];
  if (image) parts.push({ inline_data: { mime_type: mime, data: image } });
  const body = JSON.stringify({
    contents: [{ role: 'user', parts }],
    generationConfig: { temperature: 0.2, responseMimeType: 'application/json', maxOutputTokens: 8192 },
  });

  let last = { status: 502, code: 'upstream_error', msg: '' };
  for (const m of MODELS) {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body,
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        const out = ((d.candidates && d.candidates[0] && d.candidates[0].content && d.candidates[0].content.parts) || [])
          .map((p) => p.text || '').join('');
        if (out) return res.status(200).json({ text: out, model: m });
        last = { status: 502, code: 'empty_completion', msg: 'Empty answer.' };
        continue;
      }
      const msg = (d.error && d.error.message) || '';
      if (r.status === 401 || r.status === 403 || /api key/i.test(msg)) { last = { status: 401, code: 'bad_key', msg }; break; }
      last = { status: r.status, code: r.status === 429 ? 'rate_limited' : 'upstream_error', msg };
    } catch (e) {
      last = { status: 502, code: 'upstream_error', msg: String(e && e.message) };
    }
  }
  return res.status(last.status >= 400 ? last.status : 502).json({ error: last.msg || 'AI request failed.', code: last.code });
};
