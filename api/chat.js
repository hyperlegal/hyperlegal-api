export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // Ensure we have a parsed body (works on Vercel Serverless & Next API routes)
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const {
      messages = [],
      max_tokens = 500,
      temperature = 0.7,
      model = 'gpt-5',                   // try GPT-5 first
      fallback_model = 'gpt-4.1'         // auto-fallback so UX doesn’t break
    } = body;

    async function callOpenAI(modelName) {
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model: modelName, messages, max_tokens, temperature })
      });
      const data = await r.json().catch(() => ({}));
      return { ok: r.ok, status: r.status, data };
    }

    // 1st attempt: GPT-5
    let { ok, status, data } = await callOpenAI(model);

    // If GPT-5 is unavailable for this key, fall back once
    if (!ok && (status === 404 || status === 403)) {
      console.warn(`Model ${model} unavailable (status ${status}). Falling back to ${fallback_model}.`, data);
      ({ ok, status, data } = await callOpenAI(fallback_model));
      // annotate which model actually replied so the client can verify
      if (ok && data) data._used_model = fallback_model;
    } else if (ok && data) {
      data._used_model = model;
    }

    if (!ok) {
      console.error('OpenAI error:', status, data);
      return res.status(status).json({ error: 'OpenAI API error', detail: data });
    }

    return res.status(200).json(data);

  } catch (err) {
    console.error('API route error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

