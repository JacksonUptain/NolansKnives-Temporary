import React, { useEffect, useMemo, useState } from "react";
import { onValue, ref } from "firebase/database";
import { Link } from "react-router-dom";
import { db } from "../firebase";
import { getPublicKnifeStatus } from "../knifeStatus";
import "../BusinessDashboard.css";
import LucideIcon from "../../components/ui/LucideIcon";

function newestFirst(list) {
  return [...list].sort((a, b) => Number(b.updatedAt || b.createdAt || 0) - Number(a.updatedAt || a.createdAt || 0));
}

function shortId(id) {
  return id ? `#${String(id).slice(-6).toUpperCase()}` : "Item";
}

function formatDate(value) {
  if (!value) return "Recently";
  const date = new Date(Number(value) || value);
  return Number.isNaN(date.getTime()) ? "Recently" : date.toLocaleDateString([], { month: "short", day: "numeric" });
}

export default function Overview() {
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [requests, setRequests] = useState([]);
  const [loadingSources, setLoadingSources] = useState(new Set(["products", "orders", "conversations", "requests"]));

  useEffect(() => {
    const markLoaded = (source) => setLoadingSources((current) => {
      const next = new Set(current);
      next.delete(source);
      return next;
    });

    const unsubscribers = [
      onValue(ref(db, "Products"), (snapshot) => {
        setProducts(Object.entries(snapshot.val() || {}).map(([productId, value]) => ({ productId, ...value })));
        markLoaded("products");
      }, () => markLoaded("products")),
      onValue(ref(db, "orders"), (snapshot) => {
        setOrders(Object.entries(snapshot.val() || {}).map(([orderId, value]) => ({ orderId, ...value })));
        markLoaded("orders");
      }, () => markLoaded("orders")),
      onValue(ref(db, "conversations"), (snapshot) => {
        setConversations(Object.entries(snapshot.val() || {}).map(([conversationId, value]) => ({ conversationId, ...value })));
        markLoaded("conversations");
      }, () => markLoaded("conversations")),
      onValue(ref(db, "customRequests"), (snapshot) => {
        setRequests(Object.entries(snapshot.val() || {}).map(([id, value]) => ({ id, ...value })));
        markLoaded("requests");
      }, () => markLoaded("requests"))
    ];

    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, []);

  const summary = useMemo(() => {
    const available = products.filter((product) => getPublicKnifeStatus(product) === "available").length;
    const paidOrders = orders.filter((order) => ["paid", "approved"].includes(order.status));
    const unfulfilled = paidOrders.filter((order) => !["shipped", "delivered"].includes(order.fulfillmentStatus || "unfulfilled"));
    const unread = conversations.reduce((total, conversation) => total + Number(conversation.staffUnreadCount || 0), 0);
    const reviewRequests = requests.filter((request) => ["priority_review", "pending_review", "needs_review", "pending_payment"].includes(request.status));
    const quoteFollowUps = requests.filter((request) => ["quote_sent", "pending_acceptance"].includes(request.status));
    const activeBuilds = requests.filter((request) => ["quote_accepted", "in_production", "awaiting_final_payment", "paid_in_full", "ready_to_ship"].includes(request.status));
    return { available, paidOrders, unfulfilled, unread, reviewRequests, quoteFollowUps, activeBuilds };
  }, [products, orders, conversations, requests]);

  const actionQueue = useMemo(() => {
    const items = [
      ...summary.reviewRequests.map((request) => ({
        id: `request-${request.id}`,
        label: request.priorityDepositPaid ? "Priority request" : "Request to review",
        title: request.customerName || request.customerEmail || shortId(request.id),
        detail: [request.knifeType, request.steelType].filter(Boolean).join(" · ") || shortId(request.id),
        date: request.createdAt,
        href: "/business/custom-requests",
        icon: "Wand2",
        priority: request.priorityDepositPaid ? 5 : 4
      })),
      ...summary.unfulfilled.map((order) => ({
        id: `order-${order.orderId}`,
        label: "Paid order to fulfill",
        title: shortId(order.orderId),
        detail: order.fulfillmentStatus === "processing" ? "In preparation" : "Ready for the next fulfillment step",
        date: order.updatedAt || order.createdAt,
        href: "/business/fulfillment",
        icon: "PackageCheck",
        priority: 3
      })),
      ...conversations.filter((conversation) => Number(conversation.staffUnreadCount || 0) > 0).map((conversation) => ({
        id: `conversation-${conversation.conversationId}`,
        label: "Unread customer message",
        title: shortId(conversation.conversationId),
        detail: `${conversation.staffUnreadCount} unread message${Number(conversation.staffUnreadCount) === 1 ? "" : "s"}`,
        date: conversation.lastMessageAt || conversation.updatedAt,
        href: "/business/messages",
        icon: "MessageSquare",
        priority: 6
      }))
    ];
    return newestFirst(items.sort((a, b) => b.priority - a.priority)).slice(0, 8);
  }, [summary.reviewRequests, summary.unfulfilled, conversations]);

  if (loadingSources.size > 0) return <div className="business-workspace"><div className="loading-shimmer">Preparing today&apos;s workspace...</div></div>;

  return (
    <div className="business-workspace business-overview-page">
      <div className="workspace-hero">
        <div>
          <h1>What needs your attention</h1>
          <p>Start with the queue below. Everything else is grouped by the next business step.</p>
        </div>
        <Link className="action-btn workspace-primary-action" to="/business/products/new">
          <LucideIcon name="Plus" size={16} /> Add a knife
        </Link>
      </div>

      <section className="overview-action-section">
        <div className="section-title-row">
          <div>
            <h2>{actionQueue.length ? `${actionQueue.length} item${actionQueue.length === 1 ? "" : "s"} to move forward` : "You’re caught up"}</h2>
          </div>
          <Link to="/business/workflow">View workflow guide <LucideIcon name="ArrowRight" size={15} /></Link>
        </div>

        {actionQueue.length === 0 ? (
          <div className="overview-caught-up">
            <LucideIcon name="CircleCheckBig" size={32} />
            <div><strong>No urgent work is waiting.</strong><span>New orders, messages, and custom requests will appear here automatically.</span></div>
          </div>
        ) : (
          <div className="overview-action-list">
            {actionQueue.map((item) => (
              <Link to={item.href} className="overview-action-row" key={item.id}>
                <span className="overview-action-icon"><LucideIcon name={item.icon} size={18} /></span>
                <span className="overview-action-copy">
                  <span>{item.label}</span>
                  <strong>{item.title}</strong>
                  <small>{item.detail}</small>
                </span>
                <time>{formatDate(item.date)}</time>
                <LucideIcon name="ChevronRight" size={18} />
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="overview-pipeline" aria-label="Business pipeline">
        <Link to="/business/products">
          <span><LucideIcon name="Package" size={19} /> Store</span>
          <strong>{summary.available}</strong>
          <small>available knives</small>
        </Link>
        <Link to="/business/custom-requests">
          <span><LucideIcon name="ClipboardCheck" size={19} /> Review</span>
          <strong>{summary.reviewRequests.length}</strong>
          <small>custom requests</small>
        </Link>
        <Link to="/business/quotes">
          <span><LucideIcon name="FileText" size={19} /> Quotes</span>
          <strong>{summary.quoteFollowUps.length}</strong>
          <small>awaiting decision</small>
        </Link>
        <Link to="/business/production">
          <span><LucideIcon name="Hammer" size={19} /> Production</span>
          <strong>{summary.activeBuilds.length}</strong>
          <small>active builds</small>
        </Link>
        <Link to="/business/fulfillment">
          <span><LucideIcon name="Truck" size={19} /> Delivery</span>
          <strong>{summary.unfulfilled.length}</strong>
          <small>to fulfill</small>
        </Link>
        <Link to="/business/messages">
          <span><LucideIcon name="MessageSquare" size={19} /> Messages</span>
          <strong>{summary.unread}</strong>
          <small>unread</small>
        </Link>
      </section>
    </div>
  );
}
