import React, { useEffect, useMemo, useRef, useState } from 'react';
import { onValue, orderByChild, query, ref } from 'firebase/database';
import { db } from '../firebase';
import { useAuth } from '../../auth/AuthProvider';
import { markConversationRead, sendStaffMessage } from '../../services/chatService';
import { showToast } from '../../components/Toast';
import LucideIcon from '../../components/ui/LucideIcon';

function formatDate(value) {
  if (!value) return '';
  const date = new Date(Number(value) || value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

function shortId(id) {
  return id ? `#${String(id).slice(-6).toUpperCase()}` : 'Conversation';
}

export default function Conversations() {
  const { user } = useAuth();
  const [conversations, setConversations] = useState([]);
  const [profiles, setProfiles] = useState({});
  const [orders, setOrders] = useState({});
  const [requests, setRequests] = useState({});
  const [products, setProducts] = useState({});
  const [messages, setMessages] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [search, setSearch] = useState('');
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const threadEndRef = useRef(null);

  useEffect(() => {
    const unsubscribers = [
      onValue(ref(db, 'conversations'), (snapshot) => {
        const rows = Object.entries(snapshot.val() || {}).map(([conversationId, value]) => ({ conversationId, ...value }));
        rows.sort((a, b) => Number(b.lastMessageAt || b.updatedAt || 0) - Number(a.lastMessageAt || a.updatedAt || 0));
        setConversations(rows);
        setSelectedId((current) => current || rows[0]?.conversationId || '');
        setLoading(false);
      }),
      onValue(ref(db, 'users'), (snapshot) => setProfiles(snapshot.val() || {})),
      onValue(ref(db, 'orders'), (snapshot) => setOrders(snapshot.val() || {})),
      onValue(ref(db, 'customRequests'), (snapshot) => setRequests(snapshot.val() || {})),
      onValue(ref(db, 'Products'), (snapshot) => setProducts(snapshot.val() || {}))
    ];
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      return undefined;
    }
    const messagesQuery = query(ref(db, `messages/${selectedId}`), orderByChild('createdAt'));
    return onValue(messagesQuery, (snapshot) => {
      const rows = Object.entries(snapshot.val() || {}).map(([id, value]) => ({ id, ...value }));
      rows.sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0));
      setMessages(rows);
      window.requestAnimationFrame(() => threadEndRef.current?.scrollIntoView({ block: 'nearest' }));
    });
  }, [selectedId]);

  const visibleConversations = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return conversations.filter((conversation) => {
      const profile = profiles[conversation.customerUid] || {};
      const order = orders[conversation.orderId || conversation.conversationId] || {};
      const request = requests[conversation.requestId || conversation.conversationId] || {};
      const product = products[conversation.knifeId || order.knifeId] || {};
      return !normalizedSearch || [
        profile.displayName,
        profile.email,
        product.name,
        request.knifeType,
        conversation.conversationId
      ].join(' ').toLowerCase().includes(normalizedSearch);
    });
  }, [conversations, profiles, orders, requests, products, search]);

  const selected = visibleConversations.find((conversation) => conversation.conversationId === selectedId) || visibleConversations[0] || null;
  const selectedProfile = selected ? profiles[selected.customerUid] || {} : {};
  const selectedOrder = selected ? orders[selected.orderId || selected.conversationId] || {} : {};
  const selectedRequest = selected ? requests[selected.requestId || selected.conversationId] || {} : {};
  const selectedProduct = selected ? products[selected.knifeId || selectedOrder.knifeId] || {} : {};
  const subject = selectedProduct.name || (selectedRequest.knifeType ? `${selectedRequest.knifeType} custom knife` : 'Knife conversation');

  const selectConversation = async (conversation) => {
    setSelectedId(conversation.conversationId);
    if (Number(conversation.staffUnreadCount || 0) > 0) {
      try {
        await markConversationRead({ orderId: conversation.conversationId });
      } catch (error) {
        showToast(error?.message || 'Could not mark the conversation read.', 'warning');
      }
    }
  };

  const sendReply = async (event) => {
    event.preventDefault();
    const text = reply.trim();
    if (!selected || !text) return;
    try {
      setSending(true);
      await sendStaffMessage({ orderId: selected.conversationId, text });
      setReply('');
      showToast('Message sent.', 'success');
    } catch (error) {
      showToast(error?.message || 'Message could not be sent.', 'error');
    } finally {
      setSending(false);
    }
  };

  if (loading) return <div className="business-workspace"><div className="loading-shimmer">Loading messages...</div></div>;

  return (
    <div className="business-workspace messages-page">
      <div className="workspace-hero">
        <div>
          <h1>Messages</h1>
          <p>Reply to store and custom-build customers from one focused inbox.</p>
        </div>
      </div>

      <div className="message-workspace">
        <section className="message-inbox" aria-label="Conversation list">
          <label className="toolbar-search">
            <LucideIcon name="Search" size={16} />
            <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search messages" />
          </label>
          <div className="message-inbox-list">
            {visibleConversations.length === 0 ? (
              <div className="empty-state refined"><h2>No conversations yet.</h2><p>Paid orders and eligible custom requests will appear here.</p></div>
            ) : visibleConversations.map((conversation) => {
              const profile = profiles[conversation.customerUid] || {};
              const order = orders[conversation.orderId || conversation.conversationId] || {};
              const request = requests[conversation.requestId || conversation.conversationId] || {};
              const product = products[conversation.knifeId || order.knifeId] || {};
              const conversationSubject = product.name || (request.knifeType ? `${request.knifeType} custom knife` : 'Knife conversation');
              const unread = Number(conversation.staffUnreadCount || 0);
              return (
                <button
                  type="button"
                  key={conversation.conversationId}
                  className={`message-inbox-item ${selected?.conversationId === conversation.conversationId ? 'active' : ''}`}
                  onClick={() => selectConversation(conversation)}
                >
                  <span className="customer-avatar">{String(profile.displayName || profile.email || 'C').charAt(0).toUpperCase()}</span>
                  <span className="message-inbox-copy">
                    <span><strong>{profile.displayName || profile.email || 'Customer'}</strong>{unread > 0 && <em>{unread}</em>}</span>
                    <b>{conversationSubject}</b>
                    <small>{formatDate(conversation.lastMessageAt || conversation.updatedAt)}</small>
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="message-thread-panel" aria-label="Selected conversation">
          {selected ? (
            <>
              <header className="message-thread-header">
                <div>
                  <span>{shortId(selected.conversationId)}</span>
                  <h2>{subject}</h2>
                  <p>{selectedProfile.displayName || 'Customer'} · {selectedProfile.email || 'No email captured'}</p>
                </div>
                {selectedProfile.email && <a className="action-btn secondary" href={`mailto:${selectedProfile.email}`}><LucideIcon name="Mail" size={15} /> Email</a>}
              </header>
              <div className="message-thread">
                {messages.length === 0 ? (
                  <div className="no-messages">No messages yet. Send the first update below.</div>
                ) : messages.map((message) => {
                  const fromStaff = ['business', 'admin', 'staff'].includes(message.senderRole) || message.senderUid === user?.uid;
                  return (
                    <div className={`thread-message ${fromStaff ? 'message-staff' : 'message-customer'}`} key={message.id}>
                      <div className="thread-meta"><strong>{fromStaff ? 'Nolan’s Knives' : selectedProfile.displayName || 'Customer'}</strong><span>{formatDate(message.createdAt)}</span></div>
                      <p>{message.text}</p>
                    </div>
                  );
                })}
                <div ref={threadEndRef} />
              </div>
              <form className="message-composer" onSubmit={sendReply}>
                <label htmlFor="business-message-reply">Reply to {selectedProfile.displayName || 'customer'}</label>
                <textarea id="business-message-reply" rows="4" maxLength="1000" value={reply} onChange={(event) => setReply(event.target.value)} placeholder="Write a clear order or build update…" />
                <div><span>{reply.length}/1000</span><button className="action-btn" type="submit" disabled={sending || !reply.trim()}><LucideIcon name="Send" size={15} /> {sending ? 'Sending…' : 'Send message'}</button></div>
              </form>
            </>
          ) : (
            <div className="empty-state refined"><LucideIcon name="MessageSquare" size={42} /><h2>Select a conversation.</h2><p>Choose a customer from the inbox to read and reply.</p></div>
          )}
        </section>
      </div>
    </div>
  );
}
