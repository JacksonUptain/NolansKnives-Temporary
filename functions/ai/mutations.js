const admin = require("firebase-admin");
const db = admin.database();

async function logAuditAction(action, actorUid, actorRole, targetUid, data = {}) {
  const logId = db.ref("auditLogs").push().key;
  await db.ref(`auditLogs/${logId}`).set({
    action,
    actorUid,
    actorRole,
    targetUid: targetUid || null,
    ...data,
    createdAt: admin.database.ServerValue.TIMESTAMP
  });
  return logId;
}

// mode: 'update' | 'set' | 'remove'. Captures a before-snapshot at `path`
// so the action can be reverted, then writes, then records it in aiActions
// and auditLogs. Nothing in tools.js should write to the database directly —
// every AI-initiated write goes through here.
async function applyMutation({ uid, threadId, tool, path, nextValue, summary, mode = "update" }) {
  const beforeSnap = await db.ref(path).once("value");
  const before = beforeSnap.val();

  if (mode === "remove") await db.ref(path).remove();
  else if (mode === "update") await db.ref(path).update(nextValue);
  else await db.ref(path).set(nextValue);

  const actionId = db.ref("aiActions").push().key;
  await db.ref(`aiActions/${actionId}`).set({
    actionId,
    threadId: threadId || null,
    uid,
    tool,
    path,
    mode,
    summary,
    before: before === undefined ? null : before,
    after: mode === "remove" ? null : nextValue,
    revertible: true,
    status: "applied",
    createdAt: admin.database.ServerValue.TIMESTAMP
  });

  await logAuditAction(`ai.${tool}`, uid, "ai", null, { path, summary, actionId, threadId: threadId || null });

  return { actionId, summary };
}

// For the four outbound (email-sending) tools: not revertible, but still
// audited so it shows up alongside every other AI action.
async function logNonRevertibleAction({ uid, threadId, tool, summary, detail = {} }) {
  const actionId = db.ref("aiActions").push().key;
  await db.ref(`aiActions/${actionId}`).set({
    actionId,
    threadId: threadId || null,
    uid,
    tool,
    summary,
    detail,
    revertible: false,
    status: "applied",
    createdAt: admin.database.ServerValue.TIMESTAMP
  });
  await logAuditAction(`ai.${tool}`, uid, "ai", null, { summary, actionId, threadId: threadId || null, ...detail });
  return { actionId, summary };
}

async function revertAction(actionId, uid) {
  const snap = await db.ref(`aiActions/${actionId}`).once("value");
  if (!snap.exists()) throw new Error("Action not found.");
  const action = snap.val();
  if (!action.revertible) throw new Error("This action cannot be reverted.");
  if (action.status === "reverted") throw new Error("Already reverted.");

  if (action.before === null) await db.ref(action.path).remove();
  else await db.ref(action.path).set(action.before);

  await db.ref(`aiActions/${actionId}`).update({
    status: "reverted",
    revertedAt: admin.database.ServerValue.TIMESTAMP,
    revertedBy: uid
  });

  await logAuditAction("ai.revert", uid, "ai", null, { actionId, originalTool: action.tool, path: action.path });

  return { actionId, reverted: true };
}

module.exports = { applyMutation, logNonRevertibleAction, revertAction, logAuditAction };
