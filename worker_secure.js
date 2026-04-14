export default {
  async fetch(request, env, ctx) {

    // ── 1. CORS & 許可オリジン ──────────────────────────────
    const ALLOWED_ORIGINS = [
      'https://steakteppei.github.io'
    ];

    const origin = request.headers.get('Origin') || '';
    const isAllowedOrigin = ALLOWED_ORIGINS.includes(origin);

    const corsHeaders = {
      'Access-Control-Allow-Origin': isAllowedOrigin ? origin : 'null',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Client-Secret',
      'Access-Control-Max-Age': '86400',
    };

    // プリフライトリクエスト
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // ── 2. オリジンチェック ──────────────────────────────────
    if (!isAllowedOrigin) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // ── 3. POSTのみ許可 ─────────────────────────────────────
    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ── 4. クライアントシークレット認証 ─────────────────────
    const clientSecret = request.headers.get('X-Client-Secret');
    if (!clientSecret || clientSecret !== env.CLIENT_SECRET) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ── 5. IPベースのレート制限（Cloudflare KV不要の簡易版）──
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const ua = request.headers.get('User-Agent') || '';

    // Botっぽいリクエストをブロック
    const suspiciousUA = ['curl', 'wget', 'python-requests', 'scrapy', 'bot', 'spider'];
    if (suspiciousUA.some(s => ua.toLowerCase().includes(s))) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ── 6. リクエストボディの検証 ────────────────────────────
    let body;
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { prompt } = body;

    if (!prompt || typeof prompt !== 'string') {
      return new Response(JSON.stringify({ error: 'Invalid prompt' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ── 7. プロンプトサニタイズ ──────────────────────────────
    // 長さ制限（15,000文字以内）
    if (prompt.length > 15000) {
      return new Response(JSON.stringify({ error: 'Prompt too long' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // プロンプトインジェクション対策
    const blockedPhrases = [
      'ignore previous instructions',
      'ignore all previous',
      'jailbreak',
      'system prompt',
      'you are now',
      'forget everything',
      'new instructions',
    ];
    const lowerPrompt = prompt.toLowerCase();
    if (blockedPhrases.some(p => lowerPrompt.includes(p))) {
      return new Response(JSON.stringify({ error: 'Invalid request' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ── 8. Gemini API 呼び出し ──────────────────────────────
    try {
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${env.GEMINI_API_KEY}`;

      const response = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 2048,
          }
        })
      });

      const data = await response.json();

      if (data.error) {
        return new Response(JSON.stringify({ error: 'AI service error' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      let text = '';
      if (data.candidates?.[0]?.content?.parts) {
        data.candidates[0].content.parts.forEach(part => {
          if (part.text) text += part.text;
        });
      }

      if (!text) {
        return new Response(JSON.stringify({ error: 'Empty response' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({ text }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    } catch (err) {
      // エラー詳細は外部に漏らさない
      return new Response(JSON.stringify({ error: 'Internal server error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }
};
