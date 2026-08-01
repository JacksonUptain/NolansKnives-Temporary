import { auth } from "../pages/firebase";

const FUNCTIONS_BASE_URL = "https://us-central1-nolansknives.cloudfunctions.net";

async function authHeaders() {
  const user = auth.currentUser;
  if (!user) throw new Error("You must be signed in.");
  const token = await user.getIdToken();
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

export async function fetchSnapshot() {
  const headers = await authHeaders();
  const response = await fetch(`${FUNCTIONS_BASE_URL}/aiAssistantSnapshot`, { headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.message || "Failed to load business snapshot.");
  return data;
}

export async function revertAction(actionId) {
  const headers = await authHeaders();
  const response = await fetch(`${FUNCTIONS_BASE_URL}/aiAssistantAction`, {
    method: "POST",
    headers,
    body: JSON.stringify({ action: "revert", actionId })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.message || "Failed to revert that action.");
  return data;
}

// Streams NDJSON — one JSON object per line — from aiAssistantChat.
// onEvent receives each parsed line: { t: 'text'|'tool'|'done'|'error', ... }
export async function streamChat({ threadId, message, onEvent, signal }) {
  const headers = await authHeaders();
  const response = await fetch(`${FUNCTIONS_BASE_URL}/aiAssistantChat`, {
    method: "POST",
    signal,
    headers,
    body: JSON.stringify({ threadId, message })
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data?.message || "The assistant is unavailable right now.");
  }
  if (!response.body) throw new Error("Streaming is not supported in this browser.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop();
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        onEvent(JSON.parse(line));
      } catch {
        // Ignore a malformed line rather than killing the stream.
      }
    }
  }
  if (buffer.trim()) {
    try {
      onEvent(JSON.parse(buffer));
    } catch {
      // Ignore trailing partial line.
    }
  }
}
