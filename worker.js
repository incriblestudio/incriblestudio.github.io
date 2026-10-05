const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://incriblestudio.github.io",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default {
  async fetch(request, env) {
    // 1. Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method Not Allowed" }), { 
        status: 405, 
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" } 
      });
    }

    try {
      const body = await request.json();
      const question = (body?.question || body?.title || body?.content || "").trim();

      if (!question) {
        return new Response(JSON.stringify({ error: "No question provided" }), {
          status: 400,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
        });
      }

      const apiKey = env.GEMINI_API_KEY ? env.GEMINI_API_KEY.trim() : null;
      if (!apiKey) {
        return new Response(JSON.stringify({ 
          reply: "The AI Assistant is currently unavailable, a community member or our developer will reach out to you soon." 
        }), {
          status: 200,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
        });
      }

      // Priority list of standard Flash models (Lite variants removed)
      const models = [
        "gemini-3.8-flash",
        "gemini-3.7-flash",
        "gemini-3.6-flash",
        "gemini-3.5-flash",
        "gemini-2.5-flash"
      ];

      const promptText = `You are the official in-app community assistant for 'Anima Clip', a 2D animation mobile app by Incrible Studio.
Answer helpfully, naturally, and concisely like a human animator in the community forum.
- Do NOT use markdown symbols like asterisks (**bold** or *italic*). Output clean, regular text.
- If giving steps, use simple numbering (1., 2., 3.).
- Keep the answer direct and under 3-4 steps. No generic welcome or closing boilerplate.
- Finish all thoughts and sentences completely.

User Question: ${question}
Assistant:`;

      const payload = {
        contents: [
          {
            role: "user",
            parts: [{ text: promptText }]
          }
        ],
        generationConfig: {
          temperature: 0.6,
          maxOutputTokens: 1000
        }
      };

      let finalReply = null;

      for (const model of models) {
        try {
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
          
          // 5-second per-model timeout prevents cold-start request abortion
          const response = await fetch(url, {
            method: "POST",
            headers: { 
              "Content-Type": "application/json",
              "x-goog-api-key": apiKey
            },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(5000)
          });

          if (!response.ok) {
            continue;
          }

          const data = await response.json();
          const candidateParts = data.candidates?.[0]?.content?.parts || [];
          let rawOutput = candidateParts.map(p => p.text || "").join("").trim();

          if (rawOutput) {
            finalReply = rawOutput
              .replace(/\*\*/g, "")
              .replace(/\*/g, "")
              .replace(/#{1,6}\s?/g, "")
              .replace(/^[:\s-]+/, "")
              .trim();
            break;
          }
        } catch (err) {
          // If a model errors or times out, immediately proceed to next candidate
          continue;
        }
      }

      // Polite, natural fallback
      if (!finalReply) {
        const lowerQ = question.toLowerCase();
        const isCompliment = /thank|amazing|love|great|awesome|good job|congrat|dev|best|cool/.test(lowerQ);

        if (isCompliment) {
          finalReply = "Thank you so much for the kind words and support! The Incrible Studio team really appreciates having you in our animation community.";
        } else {
          finalReply = "The AI Assistant is currently unavailable, a community member or our developer will reach out to you soon.";
        }
      }

      return new Response(JSON.stringify({ reply: finalReply }), {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
      });

    } catch (err) {
      return new Response(JSON.stringify({ error: "Worker internal failure: " + err.message }), {
        status: 500,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
      });
    }
  }
};
