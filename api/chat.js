// Vercel Serverless Function — Gemini API プロキシ
// GEMINI_API_KEY は Vercel の環境変数に設定する（コードには書かない）

const GEMINI_MODEL = 'gemini-2.5-flash';

export default async function handler(req, res) {
  // CORS ヘッダー
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

  const { contents, system_instruction } = req.body || {};
  if (!Array.isArray(contents) || contents.length === 0) {
    return res.status(400).json({ error: 'Invalid request body' });
  }

  try {
    const upstream = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction,
          contents: contents.slice(-40), // 過去20ターンまでに制限
          generationConfig: {
            temperature: 0.9,
            maxOutputTokens: 512,
            // responseMimeType は指定しない（モデルによって挙動が異なるため）
          },
        }),
      }
    );

    if (!upstream.ok) {
      let errMsg = 'Upstream error';
      try {
        const err = await upstream.json();
        errMsg = err.error?.message || errMsg;
      } catch (_) {}
      // クォータ/レート制限は 429 で返ってくる
      // フロント側がエラーメッセージ文字列でキャラクター発言に振り分けるため
      // ステータスコードをそのまま転送する
      return res.status(upstream.status).json({ error: errMsg });
    }

    const data = await upstream.json();

    // サーバーサイドでテキストを結合してJSONをパース
    const parts = data.candidates?.[0]?.content?.parts || [];
    const rawText = parts.filter(p => p.text).map(p => p.text).join('');

    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return res.status(500).json({ error: `JSONパース失敗: ${rawText.slice(0, 200)}` });
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // type / score / reply のバリデーション
    if (!parsed.type || !['EXCUSE', 'ACTION', 'NEUTRAL'].includes(parsed.type)) {
      return res.status(500).json({ error: 'Invalid response type from model' });
    }

    return res.status(200).json({
      type: parsed.type,
      score: Math.abs(parseInt(parsed.score) || 0),
      reply: String(parsed.reply || ''),
      // フロント側で会話履歴に追加するためにrawTextも返す
      rawText,
    });

  } catch (err) {
    console.error('api/chat error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
