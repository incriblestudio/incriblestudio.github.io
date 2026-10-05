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
      const question = body?.question?.trim();

      const apiKey = env.GEMINI_API_KEY;
      if (!apiKey) {
        return new Response(JSON.stringify({ reply: "Cloudflare Error: env.GEMINI_API_KEY is not defined or empty." }), {
          status: 200,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
        });
      }

      const models = [
        "gemini-3.8-flash",
        "gemini-3.7-flash",
        "gemini-3.6-flash",
        "gemini-3.5-flash",
        "gemini-3.5-flash-lite"
      ];

      const promptText = `You are the community assistant for 'Anima Clip'. Answer concisely in plain text: ${question}`;

      const payload = {
        contents: [{ role: "user", parts: [{ text: promptText }] }]
      };

      let finalReply = null;
      let diagnosticLog = [];

      for (const model of models) {
        try {
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey.trim()}`;
          const response = await fetch(url, {
            method: "POST",
            headers: { 
              "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
          });

          if (!response.ok) {
            const errText = await response.text();
            diagnosticLog.push(`${model} -> HTTP ${response.status}: ${errText.slice(0, 120)}`);
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
          diagnosticLog.push(`${model} -> Fetch exception: ${err.message}`);
        }
      }

      if (!finalReply) {
        // Output the exact Google error response directly to the chat
        finalReply = `[API Error Diagnostics]: ` + diagnosticLog.join(" | ");
      }

      return new Response(JSON.stringify({ reply: finalReply }), {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
      });

    } catch (err) {
      return new Response(JSON.stringify({ error: "Worker crash: " + err.message }), {
        status: 500,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
      });
    }
  }
};
