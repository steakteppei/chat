export default {
  async fetch(request, env, ctx) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });

    try {
      const { text, srcLang, targetLangs, context, mode } = await request.json();

      const LANG_NAMES = {
        ja: 'Japanese',
        en: 'English',
        zh: 'Simplified Chinese (Mandarin)'
      };

      // Build context string
      let contextBlock = '';
      if (context && context.length > 0) {
        contextBlock = '\n\nRecent conversation (for reference only, do NOT translate):\n'
          + context.map(c => `[${LANG_NAMES[c.lang] || c.lang}] ${c.text}`).join('\n');
      }

      // ── MODE: clarify check ──
      // Check if the message is ambiguous (missing subject/object)
      if (mode === 'clarify') {
        const prompt = `You are helping a multilingual restaurant team communicate clearly.

A staff member wrote this message in ${LANG_NAMES[srcLang]}:
"${text}"
${contextBlock}

Decide if this message is ambiguous due to missing subject (who) or object (what/which).
- If the meaning is already CLEAR from the message or context: reply with exactly: {"ambiguous": false}
- If the meaning is UNCLEAR (missing who or what): reply with exactly:
  {"ambiguous": true, "clarified": "<rewritten version in ${LANG_NAMES[srcLang]} that fills in the missing subject/object naturally based on context>", "question": "<short question in ${LANG_NAMES[srcLang]} asking the sender to confirm, e.g. 確認：グリルが壊れたということですか？>"}

Rules:
- Only flag truly ambiguous messages. Don't flag short but clear messages like "OK", "understood", "I'll be right there".
- The clarified version should sound natural, not robotic.
- Return ONLY valid JSON. No markdown, no explanation.`;

        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${env.GEMINI_API_KEY}`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.1, maxOutputTokens: 300, thinkingConfig: { thinkingBudget: 0 } }
          })
        });
        const data = await res.json();
        if (data.error) return new Response(JSON.stringify({ ambiguous: false }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        let raw = '';
        data.candidates?.[0]?.content?.parts?.forEach(p => { if (p.text) raw += p.text; });
        const clean = raw.replace(/```json|```/g, '').trim();
        try {
          const result = JSON.parse(clean);
          return new Response(JSON.stringify(result), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        } catch {
          return new Response(JSON.stringify({ ambiguous: false }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
      }

      // ── MODE: translate (default) ──
      const targetList = targetLangs.map(l => `"${l}": ${LANG_NAMES[l]}`).join(', ');

      const prompt = `You are a professional translator for a Japanese steak restaurant team in Hawaii (Japanese, English, and Chinese speakers).

TRANSLATION RULES:
1. Use conversation context to understand who/what is being referred to.
2. If subjects or objects are implied by context, include them naturally in the translation.
3. Keep tone natural for a workplace chat.
4. For Chinese input: speakers may be from Fujian province and omit subjects/objects — use context to fill in implied meaning.
5. Never add extra explanation — translate only.
${contextBlock}

Translate this message:
Source: ${LANG_NAMES[srcLang]}
Targets: {${targetList}}
Message: """${text}"""

Return ONLY valid JSON with language codes as keys. No markdown, no explanation.`;

      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${env.GEMINI_API_KEY}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 1024, thinkingConfig: { thinkingBudget: 0 } }
        })
      });

      const data = await res.json();
      if (data.error) {
        return new Response(JSON.stringify({ error: data.error.message }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      let raw = '';
      data.candidates?.[0]?.content?.parts?.forEach(p => { if (p.text) raw += p.text; });
      const clean = raw.replace(/```json|```/g, '').trim();
      const translations = JSON.parse(clean);

      return new Response(JSON.stringify({ translations }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }
};
