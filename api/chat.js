// Vercel Serverless Function — Gemini API プロキシ
// GEMINI_API_KEY は Vercel の環境変数に設定する（コードには書かない）

const GEMINI_MODEL = 'gemini-2.5-flash';

/** JSONが切り捨てられた場合のフォールバック: 正規表現でフィールドを個別抽出 */
function extractFieldsFallback(text) {
  const typeMatch = text.match(/"type"\s*:\s*"(EXCUSE|ACTION|NEUTRAL)"/);
  const scoreMatch = text.match(/"score"\s*:\s*(\d+)/);
  // reply の抽出: 終端 " がなくても取得
  const replyMatch = text.match(/"reply"\s*:\s*"((?:[^"\\]|\\.)*)(?:"|$)/);

  if (typeMatch && replyMatch) {
    return {
      type: typeMatch[1],
      score: scoreMatch ? parseInt(scoreMatch[1], 10) : 0,
      reply: replyMatch[1]
        .replace(/\\n/g, '\n')
        .replace(/\\"/g, '"')
        .replace(/\\\\/, '\\')
        .trim(),
    };
  }
  return null;
}

/** rawText から JSON を取り出してパースする（複数フォールバック付き） */
function parseModelResponse(rawText) {
  // 1. Markdown コードブロック内の JSON を試みる
  const mdMatch = rawText.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
  if (mdMatch) {
    try { return JSON.parse(mdMatch[1]); } catch (_) {}
  }

  // 2. 最初の { から最後の } までを取り出す
  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try { return JSON.parse(jsonMatch[0]); } catch (_) {}
    // 3. JSON が切り捨てられている → フォールバック抽出
    const fallback = extractFieldsFallback(jsonMatch[0]);
    if (fallback) return fallback;
  }

  // 4. テキスト全体でフォールバック抽出
  const fallback = extractFieldsFallback(rawText);
  if (fallback) return fallback;

  return null;
}

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
            maxOutputTokens: 1024, // 512では日本語で切り捨てが発生するため増量
          },
        }),
      }
    );

    if (!upstream.ok) {
      let errMsg = `HTTP ${upstream.status}`;
      try {
        const err = await upstream.json();
        errMsg = err.error?.message || errMsg;
      } catch (_) {}
      // クォータ/レート制限は 429 で返ってくる
      return res.status(upstream.status).json({ error: errMsg });
    }

    const data = await upstream.json();

    const parts = data.candidates?.[0]?.content?.parts || [];
    const rawText = parts.filter(p => p.text).map(p => p.text).join('');

    if (!rawText) {
      // finishReason が SAFETY や RECITATION の場合など
      const finishReason = data.candidates?.[0]?.finishReason;
      return res.status(500).json({ error: `Empty response (finishReason: ${finishReason || 'unknown'})` });
    }

    const parsed = parseModelResponse(rawText);

    if (!parsed) {
      return res.status(500).json({ error: `応答の解析に失敗しました: ${rawText.slice(0, 100)}` });
    }

    // type / score / reply のバリデーション
    if (!parsed.type || !['EXCUSE', 'ACTION', 'NEUTRAL'].includes(parsed.type)) {
      parsed.type = 'NEUTRAL'; // フォールバック
    }

    return res.status(200).json({
      type: parsed.type,
      score: Math.abs(parseInt(parsed.score) || 0),
      reply: String(parsed.reply || '…'),
      rawText,
    });

  } catch (err) {
    console.error('api/chat error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
