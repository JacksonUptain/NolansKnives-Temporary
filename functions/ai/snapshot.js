const admin = require("firebase-admin");

const DAY_MS = 24 * 60 * 60 * 1000;

// Mirrors src/pages/knifeStatus.js:getPublicKnifeStatus — copied rather than
// imported because that file lives in the client bundle, not functions/.
function getPublicKnifeStatus(product = {}, order = null) {
  const saleStatus = String(product.saleStatus || "").toLowerCase();
  if (product.sold || saleStatus === "sold" || order?.status === "paid") return "sold";
  if (saleStatus === "pending" || saleStatus === "reserved" || order?.status === "pending") return "pending";
  return "available";
}

function toArray(snapVal) {
  return Object.entries(snapVal || {}).map(([id, value]) => ({ id, ...value }));
}

function shortId(id) {
  return id ? `#${String(id).slice(-6).toUpperCase()}` : "Item";
}

function daysAgo(timestamp, now) {
  if (!timestamp) return null;
  const ms = now - Number(timestamp);
  return ms > 0 ? Math.floor(ms / DAY_MS) : 0;
}

// Pure — takes already-fetched arrays and a fixed `now`, returns the
// snapshot object. Kept separate from the RTDB fetch below so it can be
// unit tested with plain fixture data (see snapshot.test.js).
function computeSnapshotFromData({ products = [], orders = [], conversations = [], requests = [], campaigns = [], users = [], now = Date.now() }) {
  // ---- Action queue (mirrors src/pages/BusinessDashboard/Overview.jsx summary/actionQueue) ----
  const available = products.filter((p) => getPublicKnifeStatus(p) === "available").length;
  const unpublishedProducts = products.filter((p) => p.published === false);
  const paidOrders = orders.filter((o) => ["paid", "approved"].includes(o.status));
  const unfulfilled = paidOrders.filter((o) => !["shipped", "delivered"].includes(o.fulfillmentStatus || "unfulfilled"));
  const unreadMessages = conversations.reduce((total, c) => total + Number(c.staffUnreadCount || 0), 0);
  const reviewRequests = requests.filter((r) => ["priority_review", "pending_review", "needs_review", "pending_payment"].includes(r.status));
  const quoteFollowUps = requests.filter((r) => ["quote_sent", "pending_acceptance"].includes(r.status));
  const activeBuilds = requests.filter((r) => ["quote_accepted", "in_production", "awaiting_final_payment", "paid_in_full", "ready_to_ship"].includes(r.status));

  const actionQueue = [
    ...reviewRequests.map((r) => ({
      kind: "review_request",
      id: r.id,
      title: r.customerName || r.customerEmail || shortId(r.id),
      detail: [r.knifeType, r.steelType].filter(Boolean).join(" · ") || shortId(r.id),
      priority: r.priorityDepositPaid ? 5 : 4,
      ageDays: daysAgo(r.createdAt, now)
    })),
    ...unfulfilled.map((o) => ({
      kind: "unfulfilled_order",
      id: o.orderId,
      title: shortId(o.orderId),
      detail: o.fulfillmentStatus === "processing" ? "In preparation" : "Ready for the next fulfillment step",
      priority: 3,
      ageDays: daysAgo(o.updatedAt || o.createdAt, now)
    })),
    ...conversations.filter((c) => Number(c.staffUnreadCount || 0) > 0).map((c) => ({
      kind: "unread_conversation",
      id: c.conversationId,
      title: shortId(c.conversationId),
      detail: `${c.staffUnreadCount} unread message${Number(c.staffUnreadCount) === 1 ? "" : "s"}`,
      priority: 6,
      ageDays: daysAgo(c.lastMessageAt || c.updatedAt, now)
    }))
  ].sort((a, b) => b.priority - a.priority).slice(0, 8);

  // ---- Overlooked signals — not surfaced on any existing screen ----
  const overlooked = [];

  requests.filter((r) => r.priceDiscrepancy === true).slice(0, 5).forEach((r) => {
    overlooked.push({ kind: "price_discrepancy", id: r.id, title: r.customerName || shortId(r.id), detail: "Customer-submitted price does not match server calculation." });
  });

  requests.filter((r) => r.payments?.final?.emailStatus === "failed").slice(0, 5).forEach((r) => {
    overlooked.push({ kind: "failed_payment_email", id: r.id, title: r.customerName || shortId(r.id), detail: "Final payment request email failed to send." });
  });

  campaigns.filter((c) => ["partial", "failed"].includes(c.status)).slice(0, 5).forEach((c) => {
    overlooked.push({ kind: "campaign_issue", id: c.id, title: c.campaignName || shortId(c.id), detail: `Campaign status: ${c.status}. ${c.failureCount || 0} failed sends.` });
  });

  requests.filter((r) => ["quote_sent", "pending_acceptance"].includes(r.status) && daysAgo(r.quoteSentAt, now) >= 7).slice(0, 5).forEach((r) => {
    overlooked.push({ kind: "stale_quote", id: r.id, title: r.customerName || shortId(r.id), detail: `Quote sent ${daysAgo(r.quoteSentAt, now)} days ago with no reply.` });
  });

  users.filter((u) => u.emailSuppression?.status && u.status === "active").slice(0, 5).forEach((u) => {
    overlooked.push({ kind: "suppressed_active_customer", id: u.uid, title: u.displayName || u.email, detail: `Email suppressed (${u.emailSuppression.status}) but account is active.` });
  });

  unpublishedProducts.slice(0, 5).forEach((p) => {
    overlooked.push({ kind: "unpublished_product", id: p.productId, title: p.name || shortId(p.productId), detail: "Never published to the store or gallery." });
  });

  products.filter((p) => p.reservedByOrderId && p.reservationExpiresAt && Number(p.reservationExpiresAt) < now).slice(0, 5).forEach((p) => {
    overlooked.push({ kind: "expired_reservation", id: p.productId, title: p.name || shortId(p.productId), detail: "Reservation expired but product is still marked reserved." });
  });

  // ---- Revenue ----
  const paidWithAmount = (days) => paidOrders.filter((o) => daysAgo(o.paidAt || o.createdAt, now) !== null && daysAgo(o.paidAt || o.createdAt, now) <= days);
  const last30 = paidWithAmount(30);
  const last90 = paidWithAmount(90);

  return {
    generatedAt: now,
    counts: {
      availableProducts: available,
      unpublishedProducts: unpublishedProducts.length,
      paidOrders: paidOrders.length,
      unfulfilled: unfulfilled.length,
      unreadMessages,
      requestsToReview: reviewRequests.length,
      quotesAwaiting: quoteFollowUps.length,
      activeBuilds: activeBuilds.length
    },
    actionQueue,
    overlooked: overlooked.slice(0, 8),
    recentRevenue: {
      last30Days: Number(last30.reduce((sum, o) => sum + (Number(o.amount) || 0), 0).toFixed(2)),
      last90Days: Number(last90.reduce((sum, o) => sum + (Number(o.amount) || 0), 0).toFixed(2)),
      orderCount30: last30.length
    }
  };
}

async function buildBusinessSnapshot() {
  const db = admin.database();
  const [productsSnap, ordersSnap, conversationsSnap, requestsSnap, campaignsSnap, usersSnap] = await Promise.all([
    db.ref("Products").once("value"),
    db.ref("orders").once("value"),
    db.ref("conversations").once("value"),
    db.ref("customRequests").once("value"),
    db.ref("emailCampaigns").once("value"),
    db.ref("users").once("value")
  ]);

  return computeSnapshotFromData({
    products: toArray(productsSnap.val()).map((p) => ({ productId: p.id, ...p })),
    orders: toArray(ordersSnap.val()).map((o) => ({ orderId: o.id, ...o })),
    conversations: toArray(conversationsSnap.val()).map((c) => ({ conversationId: c.id, ...c })),
    requests: toArray(requestsSnap.val()),
    campaigns: toArray(campaignsSnap.val()),
    users: toArray(usersSnap.val()).map((u) => ({ uid: u.id, ...u })),
    now: Date.now()
  });
}

module.exports = { buildBusinessSnapshot, computeSnapshotFromData, getPublicKnifeStatus };
