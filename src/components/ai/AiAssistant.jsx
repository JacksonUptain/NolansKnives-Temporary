import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchSnapshot, revertAction, streamChat } from "../../services/aiAssistantService";
import { showToast } from "../Toast";
import LucideIcon from "../ui/LucideIcon";
import AiMascot from "./AiMascot";
import "./AiAssistant.css";

const SUGGESTIONS = [
  { icon: "ListChecks", label: "What needs to get done?", prompt: "What needs to get done, and what have I overlooked?" },
  { icon: "PenLine", label: "Rewrite a product description", prompt: "Help me rewrite a product description." },
  { icon: "Mail", label: "Draft an email campaign", prompt: "Help me put together a new email campaign." }
];

function snapshotGreeting(snapshot) {
  if (!snapshot) return "Ask me anything about the business, or pick a starting point below.";
  const { counts } = snapshot;
  const parts = [];
  if (counts.unfulfilled > 0) parts.push(`${counts.unfulfilled} order${counts.unfulfilled === 1 ? "" : "s"} to fulfill`);
  if (counts.requestsToReview > 0) parts.push(`${counts.requestsToReview} custom request${counts.requestsToReview === 1 ? "" : "s"} to review`);
  if (counts.unreadMessages > 0) parts.push(`${counts.unreadMessages} unread message${counts.unreadMessages === 1 ? "" : "s"}`);
  if (parts.length === 0) return "Everything looks caught up. Ask me anything, or pick a starting point below.";
  return `Right now: ${parts.join(", ")}.`;
}

function ToolChip({ tool, onRevert }) {
  const [reverting, setReverting] = useState(false);
  const [reverted, setReverted] = useState(false);

  const handleRevert = async () => {
    setReverting(true);
    try {
      await revertAction(tool.actionId);
      setReverted(true);
      showToast("Reverted.", "success");
    } catch (err) {
      showToast(err.message || "Could not revert that action.", "error");
    } finally {
      setReverting(false);
    }
  };

  return (
    <div className={`nk-ai-chip nk-ai-chip-${tool.status}`}>
      <span className="nk-ai-chip-icon">
        {tool.status === "running" && <span className="nk-ai-chip-dot" />}
        {tool.status === "done" && <LucideIcon name="Check" size={13} />}
        {tool.status === "error" && <LucideIcon name="X" size={13} />}
      </span>
      <span className="nk-ai-chip-summary">{tool.summary}</span>
      {tool.status === "done" && tool.actionId && !reverted && (
        <button type="button" className="nk-ai-chip-revert" onClick={() => onRevert ? onRevert(tool) : handleRevert()} disabled={reverting}>
          {reverting ? "Reverting…" : "Revert"}
        </button>
      )}
      {reverted && <span className="nk-ai-chip-reverted">Reverted</span>}
    </div>
  );
}

export default function AiAssistant() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [snapshot, setSnapshot] = useState(null);
  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const [threadId, setThreadId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState("idle"); // idle | thinking | working
  const abortRef = useRef(null);
  const inputRef = useRef(null);
  const fabRef = useRef(null);
  const endRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    window.requestAnimationFrame(() => inputRef.current?.focus());
    if (!snapshot && !snapshotLoading) {
      setSnapshotLoading(true);
      fetchSnapshot()
        .then(setSnapshot)
        .catch(() => {})
        .finally(() => setSnapshotLoading(false));
    }
  }, [open, snapshot, snapshotLoading]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") closePanel();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function closePanel() {
    setOpen(false);
    window.requestAnimationFrame(() => fabRef.current?.focus());
  }

  function appendModelDelta(text) {
    setMessages((current) => {
      const next = [...current];
      const last = next[next.length - 1];
      if (last && last.role === "model" && last.streaming) {
        next[next.length - 1] = { ...last, text: last.text + text };
        return next;
      }
      next.push({ role: "model", text, tools: [], streaming: true });
      return next;
    });
  }

  function upsertToolChip(evt) {
    setMessages((current) => {
      const next = [...current];
      let last = next[next.length - 1];
      if (!last || last.role !== "model" || !last.streaming) {
        last = { role: "model", text: "", tools: [], streaming: true };
        next.push(last);
      }
      const tools = [...last.tools];
      const idx = tools.findIndex((t) => t.name === evt.name && t.status === "running");
      const entry = { name: evt.name, status: evt.status, summary: evt.summary, actionId: evt.actionId, message: evt.message };
      if (idx >= 0) tools[idx] = entry;
      else tools.push(entry);
      next[next.length - 1] = { ...last, tools };
      return next;
    });
  }

  function finalizeModelMessage() {
    setMessages((current) => {
      const next = [...current];
      const last = next[next.length - 1];
      if (last && last.role === "model") next[next.length - 1] = { ...last, streaming: false };
      return next;
    });
  }

  async function send(promptText) {
    const text = (promptText ?? input).trim();
    if (!text || status !== "idle") return;
    setInput("");
    setMessages((current) => [...current, { role: "user", text }]);
    setStatus("thinking");

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await streamChat({
        threadId,
        message: text,
        signal: controller.signal,
        onEvent: (evt) => {
          if (evt.t === "text") {
            setStatus("thinking");
            appendModelDelta(evt.v);
          } else if (evt.t === "tool") {
            setStatus("working");
            upsertToolChip(evt);
          } else if (evt.t === "done") {
            setThreadId(evt.threadId);
          } else if (evt.t === "error") {
            showToast(evt.message || "The assistant hit an error.", "error");
          }
        }
      });
    } catch (err) {
      if (err.name !== "AbortError") showToast(err.message || "The assistant is unavailable right now.", "error");
    } finally {
      finalizeModelMessage();
      setStatus("idle");
      abortRef.current = null;
    }
  }

  function handleSubmit(event) {
    event.preventDefault();
    send();
  }

  function newChat() {
    setThreadId(null);
    setMessages([]);
    setInput("");
  }

  function renderMessageText(text) {
    const draftMatch = text.match(/\/business\/email-campaigns\?draft=[\w-]+/);
    if (!draftMatch) return <p>{text}</p>;
    const [before, after] = [text.slice(0, draftMatch.index), text.slice(draftMatch.index + draftMatch[0].length)];
    return (
      <p>
        {before}
        <button type="button" className="nk-ai-inline-link" onClick={() => { closePanel(); navigate(draftMatch[0]); }}>
          Open the draft
        </button>
        {after}
      </p>
    );
  }

  return (
    <>
      <button
        type="button"
        ref={fabRef}
        className={`nk-ai-fab ${open ? "is-open" : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close Ember, Nolan's Business Assistant" : "Open Ember, Nolan's Business Assistant"}
      >
        {open ? <LucideIcon name="X" size={22} /> : (
          <span className="nk-ai-fab-mascot"><AiMascot status="idle" size={30} /></span>
        )}
      </button>

      {open && (
        <div className="nk-ai-panel" role="dialog" aria-modal="false" aria-label="Ember, Nolan's Business Assistant">
          <header className="nk-ai-header">
            <div className="nk-ai-header-title">
              <span className="nk-ai-header-mascot"><AiMascot status={status} size={24} /></span>
              <strong>Ember</strong>
            </div>
            <div className="nk-ai-header-actions">
              <button type="button" onClick={newChat} className="nk-ai-header-btn" aria-label="Start a new chat">
                <LucideIcon name="Plus" size={16} />
              </button>
              <button type="button" onClick={closePanel} className="nk-ai-header-btn" aria-label="Close">
                <LucideIcon name="X" size={16} />
              </button>
            </div>
          </header>
          {status !== "idle" && <div className="nk-ai-thinking-bar" />}

          <div className="nk-ai-body" aria-live="polite">
            {messages.length === 0 ? (
              <div className="nk-ai-empty">
                <div className="nk-ai-empty-mascot"><AiMascot status="idle" size={48} /></div>
                <p className="nk-ai-greeting">{snapshotLoading ? "Checking the dashboard…" : snapshotGreeting(snapshot)}</p>
                <div className="nk-ai-suggestions">
                  {SUGGESTIONS.map((s) => (
                    <button key={s.label} type="button" className="nk-ai-suggestion-card" onClick={() => send(s.prompt)}>
                      <LucideIcon name={s.icon} size={18} />
                      <span>{s.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="nk-ai-messages">
                {messages.map((m, i) => (
                  <div key={i} className={`nk-ai-bubble nk-ai-bubble-${m.role}`}>
                    {m.role === "model" && m.text === "" && m.streaming && m.tools.length === 0 ? (
                      <div className="nk-ai-typing"><span /><span /><span /></div>
                    ) : (
                      renderMessageText(m.text)
                    )}
                    {m.role === "model" && m.streaming && m.text && <span className="nk-ai-caret" />}
                    {m.tools?.length > 0 && (
                      <div className="nk-ai-chips">
                        {m.tools.map((tool, ti) => <ToolChip key={ti} tool={tool} />)}
                      </div>
                    )}
                  </div>
                ))}
                <div ref={endRef} />
              </div>
            )}
          </div>

          <form className="nk-ai-composer" onSubmit={handleSubmit}>
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask Ember…"
              disabled={status !== "idle"}
            />
            <button type="submit" disabled={status !== "idle" || !input.trim()} aria-label="Send">
              <LucideIcon name="ArrowUp" size={18} />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
