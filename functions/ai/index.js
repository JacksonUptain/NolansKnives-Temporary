const admin = require("firebase-admin");
const db = admin.database();
const { onRequest } = require("firebase-functions/v2/https");

const { getInternals } = require("./internalsRegistry");
const { buildBusinessSnapshot } = require("./snapshot");
const { buildSystemPrompt } = require("./systemPrompt");
const { getFunctionDeclarations, runTool, describeCall } = require("./tools");
const { revertAction } = require("./mutations");
const { streamTurn, collectChunk } = require("./vertexClient");

const MAX_TOOL_ROUNDS = Number(process.env.AI_MAX_TOOL_ROUNDS || 6);
const HISTORY_MESSAGE_LIMIT = 12;
const DAILY_TOKEN_BUDGET = Number(process.env.AI_DAILY_TOKEN_BUDGET || 2000000);

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

// Only the paid Vertex path counts against the daily budget — Studio (the
// free Gemini Developer API) has its own quota enforced by Google, and
// hitting it is exactly what triggers the Vertex fallback, not something we
// need to additionally throttle ourselves.
async function isOverDailyBudget() {
  const snap = await db.ref(`aiUsage/${todayKey()}/vertexTotalTokens`).once("value");
  return Number(snap.val() || 0) >= DAILY_TOKEN_BUDGET;
}

function emptyUsage() {
  return { studio: { promptTokens: 0, candidatesTokens: 0, calls: 0 }, vertex: { promptTokens: 0, candidatesTokens: 0, calls: 0 } };
}

async function recordUsage(usage) {
  const studioTotal = usage.studio.promptTokens + usage.studio.candidatesTokens;
  const vertexTotal = usage.vertex.promptTokens + usage.vertex.candidatesTokens;
  if (studioTotal <= 0 && vertexTotal <= 0 && usage.studio.calls === 0 && usage.vertex.calls === 0) return;

  await db.ref(`aiUsage/${todayKey()}`).transaction((current) => {
    const c = current || {
      studioPromptTokens: 0, studioCandidatesTokens: 0, studioTotalTokens: 0, studioCalls: 0,
      vertexPromptTokens: 0, vertexCandidatesTokens: 0, vertexTotalTokens: 0, vertexCalls: 0
    };
    return {
      studioPromptTokens: (c.studioPromptTokens || 0) + usage.studio.promptTokens,
      studioCandidatesTokens: (c.studioCandidatesTokens || 0) + usage.studio.candidatesTokens,
      studioTotalTokens: (c.studioTotalTokens || 0) + studioTotal,
      studioCalls: (c.studioCalls || 0) + usage.studio.calls,
      vertexPromptTokens: (c.vertexPromptTokens || 0) + usage.vertex.promptTokens,
      vertexCandidatesTokens: (c.vertexCandidatesTokens || 0) + usage.vertex.candidatesTokens,
      vertexTotalTokens: (c.vertexTotalTokens || 0) + vertexTotal,
      vertexCalls: (c.vertexCalls || 0) + usage.vertex.calls,
      updatedAt: Date.now()
    };
  });
}

async function loadHistory(threadId, uid) {
  if (!threadId) return [];
  const threadSnap = await db.ref(`aiThreads/${uid}/${threadId}`).once("value");
  if (!threadSnap.exists()) return [];
  const snap = await db.ref(`aiMessages/${threadId}`)
    .orderByChild("createdAt")
    .limitToLast(HISTORY_MESSAGE_LIMIT)
    .once("value");
  const messages = Object.values(snap.val() || {}).sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0));
  return messages.map((m) => ({ role: m.role, parts: [{ text: m.text }] }));
}

async function persistTurn(threadId, uid, userMessage, modelText) {
  const now = admin.database.ServerValue.TIMESTAMP;
  const userMsgId = db.ref(`aiMessages/${threadId}`).push().key;
  const modelMsgId = db.ref(`aiMessages/${threadId}`).push().key;

  const updates = {
    [`aiMessages/${threadId}/${userMsgId}`]: { role: "user", text: userMessage, createdAt: now },
    [`aiThreads/${uid}/${threadId}/threadId`]: threadId,
    [`aiThreads/${uid}/${threadId}/uid`]: uid,
    [`aiThreads/${uid}/${threadId}/updatedAt`]: now,
    [`aiThreads/${uid}/${threadId}/lastMessagePreview`]: userMessage.slice(0, 140)
  };
  if (modelText) {
    updates[`aiMessages/${threadId}/${modelMsgId}`] = { role: "model", text: modelText, createdAt: now };
  }

  const threadSnap = await db.ref(`aiThreads/${uid}/${threadId}/createdAt`).once("value");
  if (!threadSnap.exists()) updates[`aiThreads/${uid}/${threadId}/createdAt`] = now;

  await db.ref().update(updates);
}

exports.aiAssistantSnapshot = onRequest({ invoker: "public" }, async (req, res) => {
  const { applyCors, requireAuthFromRequest, sendHttpError, verifyUserRole } = getInternals();
  applyCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).send("");

  try {
    const token = await requireAuthFromRequest(req);
    const isStaff = await verifyUserRole(token.uid, "business");
    if (!isStaff) return sendHttpError(res, { code: "permission-denied", message: "Business access required." });

    const snapshot = await buildBusinessSnapshot();
    return res.status(200).json(snapshot);
  } catch (error) {
    return sendHttpError(res, error, "Failed to load snapshot.");
  }
});

exports.aiAssistantAction = onRequest({ invoker: "public" }, async (req, res) => {
  const { applyCors, requireAuthFromRequest, sendHttpError, verifyUserRole } = getInternals();
  applyCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).send("");
  if (req.method !== "POST") return res.status(405).json({ error: "method-not-allowed" });

  try {
    const token = await requireAuthFromRequest(req);
    const isStaff = await verifyUserRole(token.uid, "business");
    if (!isStaff) return sendHttpError(res, { code: "permission-denied", message: "Business access required." });

    const { action, actionId } = req.body || {};
    if (action !== "revert" || !actionId) {
      return sendHttpError(res, { code: "invalid-argument", message: "action must be 'revert' with an actionId." });
    }
    const result = await revertAction(actionId, token.uid);
    return res.status(200).json(result);
  } catch (error) {
    return sendHttpError(res, error, "Failed to apply action.");
  }
});

exports.aiAssistantChat = onRequest({ invoker: "public", timeoutSeconds: 120, memory: "512MiB" }, async (req, res) => {
  const { applyCors, requireAuthFromRequest, sendHttpError, verifyUserRole, getUserProfile } = getInternals();
  applyCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).send("");
  if (req.method !== "POST") return res.status(405).json({ error: "method-not-allowed" });

  let token;
  try {
    token = await requireAuthFromRequest(req);
    const isStaff = await verifyUserRole(token.uid, "business");
    if (!isStaff) return sendHttpError(res, { code: "permission-denied", message: "Business access required." });
  } catch (error) {
    return sendHttpError(res, error, "Authentication failed.");
  }

  const message = String(req.body?.message || "").trim();
  if (!message) return sendHttpError(res, { code: "invalid-argument", message: "message is required." });

  if (await isOverDailyBudget()) {
    return sendHttpError(res, { code: "failed-precondition", message: "Daily AI budget reached. Resets at midnight UTC." });
  }

  res.set("Content-Type", "application/x-ndjson");
  res.set("Cache-Control", "no-cache");
  res.set("X-Accel-Buffering", "no");
  const emit = (payload) => {
    res.write(`${JSON.stringify(payload)}\n`);
    if (typeof res.flush === "function") res.flush();
  };

  const threadId = req.body.threadId || db.ref("aiThreads").push().key;

  try {
    const [snapshot, profile] = await Promise.all([buildBusinessSnapshot(), getUserProfile(token.uid)]);
    const systemInstruction = buildSystemPrompt(snapshot, profile);
    const contents = await loadHistory(threadId, token.uid);
    contents.push({ role: "user", parts: [{ text: message }] });

    const functionDeclarations = getFunctionDeclarations();
    const usage = emptyUsage();
    let finalText = "";

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const { stream, source } = await streamTurn({ systemInstruction, contents, functionDeclarations });
      usage[source].calls += 1;
      let roundText = "";
      const calls = [];

      for await (const chunk of stream) {
        const c = collectChunk(chunk);
        if (c.text) {
          roundText += c.text;
          emit({ t: "text", v: c.text });
        }
        if (c.functionCalls?.length) calls.push(...c.functionCalls);
        if (c.usage) {
          usage[source].promptTokens += c.usage.promptTokens;
          usage[source].candidatesTokens += c.usage.candidatesTokens;
        }
      }

      finalText += roundText;
      contents.push({
        role: "model",
        parts: [...(roundText ? [{ text: roundText }] : []), ...calls.map((fc) => ({ functionCall: fc }))]
      });

      if (!calls.length) break;

      const responseParts = [];
      const ctx = { uid: token.uid, threadId };
      for (const call of calls) {
        emit({ t: "tool", name: call.name, status: "running", summary: describeCall(call) });
        const result = await runTool(call, ctx);
        emit({
          t: "tool",
          name: call.name,
          status: result?.error ? "error" : "done",
          summary: result?.summary || describeCall(call),
          actionId: result?.actionId || null,
          message: result?.error || null
        });
        responseParts.push({ functionResponse: { name: call.name, response: result || {} } });
      }
      contents.push({ role: "user", parts: responseParts });

      if (round === MAX_TOOL_ROUNDS - 1) {
        contents.push({ role: "user", parts: [{ text: "Tool limit reached for this turn. Summarize what you did and what's left." }] });
        const { stream: wrapStream, source: wrapSource } = await streamTurn({ systemInstruction, contents, functionDeclarations: [] });
        usage[wrapSource].calls += 1;
        for await (const chunk of wrapStream) {
          const c = collectChunk(chunk);
          if (c.text) {
            finalText += c.text;
            emit({ t: "text", v: c.text });
          }
          if (c.usage) {
            usage[wrapSource].promptTokens += c.usage.promptTokens;
            usage[wrapSource].candidatesTokens += c.usage.candidatesTokens;
          }
        }
      }
    }

    await Promise.all([persistTurn(threadId, token.uid, message, finalText), recordUsage(usage)]);
    emit({ t: "done", threadId, usage });
    res.end();
  } catch (error) {
    emit({ t: "error", message: error?.message || "The assistant hit an error." });
    res.end();
  }
});
