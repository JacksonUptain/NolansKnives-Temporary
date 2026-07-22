import React, { useEffect, useState } from "react";
import { ref, onValue, off, query, orderByChild } from "firebase/database";
import { db } from "../pages/firebase";
import { useAuth } from "../auth/AuthProvider";
import { markCustomerConversationRead, sendChatMessage } from "../services/chatService";
import { showToast } from "./Toast";
import "./Conversation.css";

export default function Conversation({ orderId, knife }) {
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [messageText, setMessageText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const messagesEndRef = React.useRef(null);

  // Load messages
  useEffect(() => {
    const messagesRef = query(ref(db, `messages/${orderId}`), orderByChild("createdAt"));
    const unsub = onValue(messagesRef, (snapshot) => {
      if (snapshot.exists()) {
        const msgData = snapshot.val();
        const msgArray = Object.entries(msgData)
          .map(([id, value]) => ({ id, ...value }))
          .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
        setMessages(msgArray);
      } else {
        setMessages([]);
      }
      setLoading(false);
    });

    return () => off(messagesRef, "value", unsub);
  }, [orderId]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!orderId || messages.length === 0) return;
    markCustomerConversationRead({ orderId }).catch(() => {});
  }, [orderId, messages.length]);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!messageText.trim()) return;

    setSending(true);
    setError("");

    try {
      await sendChatMessage({ orderId, text: messageText.trim() });
      setMessageText("");
      showToast("Message sent.", "success");
    } catch (err) {
      const message = err.message || "Failed to send message";
      setError(message);
      showToast(message, "error");
      console.error("Send message error:", err);
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return <div className="conversation-container"><p>Loading conversation...</p></div>;
  }

  return (
    <div className="conversation-container">
      <div className="conversation-header">
        <h3>Conversation about {knife?.name || "Knife"}</h3>
      </div>

      <div className="messages-list">
        {messages.length === 0 ? (
          <div className="empty-messages">
            <p>No messages yet. Start the conversation with Nolan's team.</p>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`message ${msg.senderUid === user?.uid ? "sent" : "received"}`}
            >
              <div className="message-header">
                <span className="message-sender">
                  {msg.senderUid === user?.uid ? "You" : "Nolan's Team"}
                </span>
                <span className="message-time">
                  {msg.createdAt
                    ? new Date(msg.createdAt).toLocaleString()
                    : ""}
                </span>
              </div>
              <p className="message-text">{msg.text}</p>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="message-composer">
        {error && <div className="error-message">{error}</div>}
        <form onSubmit={handleSendMessage}>
          <textarea
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            placeholder="Type your message..."
            disabled={sending}
            rows="3"
          />
          <button type="submit" className="btn btn-warning" disabled={sending || !messageText.trim()}>
            {sending ? "Sending..." : "Send Message"}
          </button>
        </form>
      </div>
    </div>
  );
}
