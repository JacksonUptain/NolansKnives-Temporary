const { GoogleGenAI } = require("@google/genai");

// Two ways to reach the same Gemini model:
//  - Studio: the free Gemini Developer API, keyed by GEMINI_API_KEY. Real
//    money-free tier, rate-limited (RPM/RPD), and Google's terms allow using
//    request data to improve their models.
//  - Vertex: paid, billed to the GCP project, data stays private. Used only
//    as a fallback when Studio returns a quota/rate-limit error, so day-to-day
//    usage for one business owner should cost close to nothing.
const PROJECT = process.env.VERTEX_PROJECT_ID || "nolansknives";
const LOCATION = process.env.VERTEX_LOCATION || "us-central1";
const MODEL = process.env.VERTEX_MODEL || "gemini-2.5-flash";
const STUDIO_MODEL = process.env.GEMINI_STUDIO_MODEL || MODEL;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const MAX_OUTPUT_TOKENS = 2048;
const THINKING_BUDGET = 512;

let studioClient = null;
let vertexClient = null;

function getStudioClient() {
  if (!GEMINI_API_KEY) return null;
  if (!studioClient) studioClient = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  return studioClient;
}

function getVertexClient() {
  if (!vertexClient) vertexClient = new GoogleGenAI({ vertexai: true, project: PROJECT, location: LOCATION });
  return vertexClient;
}

// Studio throws @google/genai's ApiError (a plain `status: number` field) on
// HTTP errors. 429 covers both per-minute and per-day quota exhaustion.
function isQuotaError(error) {
  if (error?.status === 429 || error?.code === 429) return true;
  return /RESOURCE_EXHAUSTED|rate.?limit|quota/i.test(String(error?.message || ""));
}

function buildConfig(systemInstruction, functionDeclarations) {
  return {
    systemInstruction,
    tools: functionDeclarations?.length ? [{ functionDeclarations }] : undefined,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    temperature: 0.4,
    thinkingConfig: { thinkingBudget: THINKING_BUDGET }
  };
}

// contents: [{ role: 'user'|'model', parts: [...] }]
// functionDeclarations: array of Gemini FunctionDeclaration objects
// Returns { stream: AsyncGenerator<GenerateContentResponse>, source: 'studio'|'vertex' }
async function streamTurn({ systemInstruction, contents, functionDeclarations }) {
  const studio = getStudioClient();
  if (studio) {
    try {
      const stream = await studio.models.generateContentStream({
        model: STUDIO_MODEL,
        contents,
        config: buildConfig(systemInstruction, functionDeclarations)
      });
      return { stream, source: "studio" };
    } catch (error) {
      if (!isQuotaError(error)) throw error;
      // Fall through to the paid Vertex path below.
    }
  }

  const stream = await getVertexClient().models.generateContentStream({
    model: MODEL,
    contents,
    config: buildConfig(systemInstruction, functionDeclarations)
  });
  return { stream, source: "vertex" };
}

// Normalizes one streamed chunk into a plain shape the agent loop can use
// without touching SDK-specific getters directly.
function collectChunk(chunk) {
  const usage = chunk.usageMetadata
    ? {
        promptTokens: chunk.usageMetadata.promptTokenCount || 0,
        candidatesTokens: chunk.usageMetadata.candidatesTokenCount || 0
      }
    : null;
  return {
    text: chunk.text || "",
    functionCalls: chunk.functionCalls || [],
    usage
  };
}

module.exports = { streamTurn, collectChunk, MODEL, STUDIO_MODEL };
