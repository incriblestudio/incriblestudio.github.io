const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://incriblestudio.github.io",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default {
  async fetch(request, env) {
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

      const apiKey = env.GEMINI_API_KEY;
      if (!apiKey) {
        return new Response(JSON.stringify({ 
          reply: "The AI Assistant is currently unavailable, a community member or our developer will reach out to you soon." 
        }), {
          status: 200,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
        });
      }

      // Fast models list: lightweight model first for speed, standard models as backup
      const models = [
        "gemini-3.5-flash-lite",
        "gemini-3.5-flash",
        "gemini-3.6-flash"
      ];

      // Grounded prompt: gives the lightweight model the exact rules of Anima Clip
      const promptText = `You are the official in-app community assistant for 'Anima Clip', a 2D animation mobile app by Incrible Studio.
Provide helpful, sensible, and accurate advice specifically for mobile 2D animators.

Guidelines:
- Answer directly and sensibly in 2 to 3 concise steps (1., 2., 3.).
- Keep answers grounded in 2D frame-by-frame animation (timeline, canvas, layers, onion skin, brushes, colors, export).
- If a user asks about complex 3D modeling, rigging, or things unrelated to mobile 2D animation, politely clarify that Anima Clip is a 2D frame-by-frame animation app.
- Do NOT use markdown symbols like asterisks (**bold** or *italic*). Output plain, clean text only.
- No generic intro ("Hello animator!") or closing boilerplate ("Hope this helps!").

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
          temperature: 0.3, // Lower temperature prevents hallucinations and nonsense
          maxOutputTokens: 350
        }
      };

      let finalReply = null;

      for (const model of models) {
        try {
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey.trim()}`;
          const response = await fetch(url, {
            method: "POST",
            headers: { 
              "Content-Type": "application/json",
              "x-goog-api-key": apiKey.trim()
            },
            body: JSON.stringify(payload)
          });

          if (!response.ok) {
            continue;
          }

          const data = await response.json();
          let rawOutput = data.candidates?.[0]?.content?.parts?.[0]?.text;

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
          // Continue to next model on network error
        }
      }

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
