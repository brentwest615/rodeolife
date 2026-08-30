// Vercel serverless function — proxies a sign-up sheet photo to Claude's vision
// API. RodeoLife is a public static site (its JS is fully readable via
// view-source), so the Anthropic API key can never live in client code; this
// function holds it as a private env var (ANTHROPIC_API_KEY, set in the Vercel
// dashboard) and is the only thing that talks to api.anthropic.com.
const MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 4096;

const SYSTEM_PROMPT = `You read a posted rodeo sign-up sheet from a photo and extract every contestant.

Output ONLY this JSON (no markdown, no commentary):
{ "riders": [{ "name": "<string>", "back_number": "<string|null>", "confidence": "high|medium|low" }] }

Rules:
- One object per line/row on the sheet.
- Names as written.
- If a back number column exists, read it precisely — get it exactly right or leave it null, never guess a number.
- If you can't read part of a name, give your best guess and set confidence "low".
- Ignore times, scores, titles, and decoration — only the contestant list.`;

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'Server is missing ANTHROPIC_API_KEY' });
    return;
  }

  const { imageBase64, mediaType } = req.body || {};
  if (!imageBase64 || typeof imageBase64 !== 'string') {
    res.status(400).json({ error: 'Missing imageBase64' });
    return;
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mediaType || 'image/jpeg', data: imageBase64 } },
              { type: 'text', text: 'Extract the sign-up sheet contestants from this photo as JSON.' },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      res.status(502).json({ error: `Claude API ${response.status}: ${errText}` });
      return;
    }

    const data = await response.json();
    const text = (data.content || []).map(b => b.text || '').join('').trim();
    let json = text;
    if (json.startsWith('```')) {
      json = json.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    }

    let parsed;
    try {
      parsed = JSON.parse(json);
    } catch {
      res.status(502).json({ error: 'Could not parse a rider list from the photo. Try a clearer image.' });
      return;
    }

    if (!parsed || !Array.isArray(parsed.riders)) {
      res.status(502).json({ error: 'Unexpected response shape from the model.' });
      return;
    }

    res.status(200).json({ riders: parsed.riders });
  } catch (err) {
    res.status(500).json({ error: err.message || 'OCR request failed' });
  }
};
