import express from "express";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

const PRIMARY_MODEL = "qwen/qwen3.6-27b";             // Primary vision model

 const FALLBACK_MODEL = "openai/gpt-oss-120b";  // Fast, reliable Groq fallback

app.use(express.json({ limit: "50mb" }));

app.use((req, res, next) => {
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; " +
    "connect-src 'self' http://localhost:3000 https://api.groq.com; " +
    "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src 'self' https://fonts.gstatic.com; " +
    "img-src 'self' data: blob:;"
  );
  next();
});

app.use(express.static(path.join(__dirname, "Public")));

app.get('/favicon.png', (req, res) => res.status(204).end());
app.get('/favicon.ico', (req, res) => res.status(204).end());

app.post("/api/model-overview", async (req, res) => {
  try {
    const { screenshot, modelInfo, userPrompt } = req.body;
    const apiKey = process.env.GROQ_API_KEY || process.env.OPENROUTER_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: "GROQ_API_KEY is missing on the server environment." });
    }

    if (!modelInfo || !modelInfo.dimensions) {
      return res.status(400).json({ error: "Missing model geometry metadata." });
    }

    // Dimension Calculations
    const { width, height, depth } = modelInfo.dimensions;
    const widthInches = (width / 25.4).toFixed(2);
    const heightInches = (height / 25.4).toFixed(2);
    const depthInches = (depth / 25.4).toFixed(2);
    const triangleCount = modelInfo.triangles ? modelInfo.triangles.toLocaleString() : "N/A";

    const hasFollowUpQuestion = userPrompt && userPrompt.trim().length > 0;

    // Shared metrics header given to ALL system prompts
    const metricsHeader = `Part Metrics:
- Dimensions (X x Y x Z): ${width}mm x ${height}mm x ${depth}mm (${widthInches}" x ${heightInches}" x ${depthInches}")
- Detail Level: ${triangleCount} triangles`;

    let systemPrompt = "";

    if (hasFollowUpQuestion) {
      systemPrompt = `You are an expert mechanical design engineer and teammate chatting about this 3D model render.

${metricsHeader}

User Question: "${userPrompt}"

CRITICAL INSTRUCTIONS:
- Answer the user's specific question directly with technical depth, but speak naturally like a sharp, helpful colleague in the shop ("Yeah, for PETG you'll want...", "Looking closely at that wall...").
- Keep it concise (1–2 brief paragraphs max).
- Use the Part Metrics above whenever answering questions about scale, wall thicknesses, or sizing.
- Always remember to give inches as a secondary unit after millimeters.
- Point out any parts on the model that are smaller than 0.4mm nozzle or will struggle to print properly/are prone to blurring. If there are no concerns, do not say anything.
- DO NOT repeat full CAD printability sweeps, dimension breakdowns, or generic slicer parameter dumps unless explicitly requested.
- DO NOT use stiff section headers or robotic intro boilerplate. Jump right into a conversational, accurate answer. At the end, ask a follow up based on what the users prompt was, or something that would help you get more information. Tell the user what would help give you more information on how to audit the part. IF(CRUCIAL) you ever need a better view of the model, politely ask the user to reorient the model so you can see a specific part better.`;
    } else {
      systemPrompt = `You are a world-class additive manufacturing expert and mechanical design engineer conducting a visual CAD audit and printability check for a teammate. Always remember to give inches as a secondary unit after millimeters.

${metricsHeader}

Deliver a concise, expert review (270-300 words) written in a warm, direct, first-person voice ("Looking at this...", "I noticed..."). Speak like a knowledgeable colleague—no rigid, robotic section titles or generic boilerplate. Always remember to give inches as a secondary unit after millimeters.

Perform a thorough visual & structural sweep covering:

1. Identification & Positives:
   - Make a solid, educated guess on what the part is or how it functions based on the render and dimensions. Highlight one clean design feature done well.

2. Manufacturability & Failure Prevention:
   - Embossed/Engraved Detail & Text: Check if fine details, logos, or text risk blurring or failing to resolve based on standard 0.4mm nozzle limits.
   - Geometry & Wall Thickness: Flag thin walls, narrow pins, or sharp inner corners that could snap or delaminate under stress.
   - Print Orientation & Supports: Identify steep overhangs (>45°), bridging, or isolated features needing supports. Recommend the optimal bed orientation to minimize supports and maximize layer strength.
   - Point out any parts on the model that are smaller than 0.4mm nozzle or will struggle to print properly/are prone to blurring. If there are no concerns, do not say anything.

3. Slicer Settings:
   - Provide exact slicer parameters: Infill pattern (e.g., Gyroid) and percentage (e.g., 15-20%), wall loop count, and layer height recommendation.

Wrap up with an encouraging, confident sign-off! Keep the formatting clean using natural paragraphs and simple bolding for key specs—no heavy bullet dumps or manual-style headers. Ask a follow up question of what the part might be used for, or what the user is thinking.
IF(CRUCIAL) you ever need a better view of the model, politely ask the user to re-position the model so you can see a specific part better. If this is not needed, give the user a friendly sign off and ask if the user has any other questions.`;
    }

    // Strategic Selection: Follow-up text queries bypass screenshot processing
    let selectedModel = (hasFollowUpQuestion && !screenshot) ? FALLBACK_MODEL : PRIMARY_MODEL;

    // Dispatch request...
    console.log(`[API] Dispatching request via ${selectedModel}...`);
    const overview = await executeGroqCompletion(apiKey, selectedModel, systemPrompt, screenshot);
    return res.json({ overview, modelUsed: selectedModel });

  } catch (error) {
    console.error("Server Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Helper Function Retaining Exact Model API Call Settings
async function executeGroqCompletion(apiKey, modelName, promptText, imageBase64) {
  let contentPayload = [];

  if (imageBase64 && modelName === PRIMARY_MODEL) {
    contentPayload = [
      { type: "text", text: promptText },
      { type: "image_url", image_url: { url: imageBase64 } }
    ];
  } else {
    contentPayload = promptText;
  }

  const requestBody = {
    model: modelName,
    messages: [
      {
        role: "user",
        content: contentPayload
      }
    ],
    temperature: 0.7,
    max_tokens: 1200
  };

  // Attach reasoning_effort only when supported by the model
  if (modelName === PRIMARY_MODEL) {
    requestBody.reasoning_effort = "none";
  }

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody)
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error?.message || `Groq API call returned HTTP ${response.status}`);
  }

  return data.choices?.[0]?.message?.content || "No review output generated.";
}

// Catch-all route to serve SPA
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "Public", "index.html"));
});
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});