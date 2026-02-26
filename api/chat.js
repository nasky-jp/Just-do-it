// Vercel Serverless Function — Gemini API プロキシ
// GEMINI_API_KEY は Vercel の環境変数に設定する（コードには書かない）

const GEMINI_MODEL = 'gemini-2.5-flash';
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*'; // 本番では自ドメインを指定推奨

export default async function handler(req, res) {
  // CORS ヘッダー
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // プリフライトリクエスト
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  // POST のみ受け付ける
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  // リクエストボディのバリデーション
  const { contents, system_instruction } = req.body || {};
  if (!Array.isArray(contents) || contents.length === 0) {
    return res.status(400).json({ error: 'Invalid request body' });
  }

  // 会話履歴の長さ制限（過去20ターンまで）
  const trimmedContents = contents.slice(-40);

  try {
    const upstream = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction,
          contents: trimmedContents,
          generationConfig: {
            temperature: 0.9,
            maxOutputTokens: 512,
            responseMimeType: 'application/json',
          },
        }),
      }
    );

    if (!upstream.ok) {
      const err = await upstream.json();
      return res.status(upstream.status).json({ error: err.error?.message || 'Upstream error' });
    }

    const data = await upstream.json();
    return res.status(200).json(data);

  } catch (err) {
    return res.status(500).json({ error: 'Internal server error' });
  }
}
