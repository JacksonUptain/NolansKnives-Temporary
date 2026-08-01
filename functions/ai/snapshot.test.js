const test = require("node:test");
const assert = require("node:assert/strict");
const { computeSnapshotFromData, getPublicKnifeStatus } = require("./snapshot");

const NOW = Date.UTC(2026, 7, 1); // 2026-08-01
const DAY_MS = 24 * 60 * 60 * 1000;

function baseArgs(overrides = {}) {
  return {
    products: [],
    orders: [],
    conversations: [],
    requests: [],
    campaigns: [],
    users: [],
    now: NOW,
    ...overrides
  };
}

test("getPublicKnifeStatus: sold/pending/available", () => {
  assert.equal(getPublicKnifeStatus({ sold: true }), "sold");
  assert.equal(getPublicKnifeStatus({ saleStatus: "sold" }), "sold");
  assert.equal(getPublicKnifeStatus({}, { status: "paid" }), "sold");
  assert.equal(getPublicKnifeStatus({ saleStatus: "reserved" }), "pending");
  assert.equal(getPublicKnifeStatus({}), "available");
});

test("overlooked: flags a custom request with a price discrepancy", () => {
  const snapshot = computeSnapshotFromData(baseArgs({
    requests: [{ id: "r1", priceDiscrepancy: true, customerName: "Jordan" }]
  }));
  const hit = snapshot.overlooked.find((o) => o.kind === "price_discrepancy");
  assert.ok(hit, "expected a price_discrepancy entry");
  assert.equal(hit.id, "r1");
  assert.equal(hit.title, "Jordan");
});

test("overlooked: flags a failed final-payment email", () => {
  const snapshot = computeSnapshotFromData(baseArgs({
    requests: [{ id: "r2", payments: { final: { emailStatus: "failed" } } }]
  }));
  assert.ok(snapshot.overlooked.some((o) => o.kind === "failed_payment_email" && o.id === "r2"));
});

test("overlooked: flags a partially-failed or failed campaign", () => {
  const snapshot = computeSnapshotFromData(baseArgs({
    campaigns: [
      { id: "c1", status: "partial", campaignName: "Spring Sale", failureCount: 3 },
      { id: "c2", status: "failed", campaignName: "Recall" },
      { id: "c3", status: "sent", campaignName: "Fine" }
    ]
  }));
  const kinds = snapshot.overlooked.filter((o) => o.kind === "campaign_issue").map((o) => o.id);
  assert.deepEqual(kinds.sort(), ["c1", "c2"]);
});

test("overlooked: flags a quote sitting unanswered for 7+ days but not a fresh one", () => {
  const snapshot = computeSnapshotFromData(baseArgs({
    requests: [
      { id: "stale", status: "quote_sent", quoteSentAt: NOW - 8 * DAY_MS, customerName: "Stale Customer" },
      { id: "fresh", status: "pending_acceptance", quoteSentAt: NOW - 2 * DAY_MS, customerName: "Fresh Customer" }
    ]
  }));
  const ids = snapshot.overlooked.filter((o) => o.kind === "stale_quote").map((o) => o.id);
  assert.deepEqual(ids, ["stale"]);
});

test("overlooked: flags a suppressed customer who is still active, not a blocked one", () => {
  const snapshot = computeSnapshotFromData(baseArgs({
    users: [
      { id: "u1", uid: "u1", status: "active", emailSuppression: { status: "unsubscribed" }, email: "a@example.com" },
      { id: "u2", uid: "u2", status: "blocked", emailSuppression: { status: "complained" }, email: "b@example.com" }
    ]
  }));
  const ids = snapshot.overlooked.filter((o) => o.kind === "suppressed_active_customer").map((o) => o.id);
  assert.deepEqual(ids, ["u1"]);
});

test("overlooked: flags an unpublished product", () => {
  const snapshot = computeSnapshotFromData(baseArgs({
    products: [
      { productId: "p1", name: "Chef Knife", published: false },
      { productId: "p2", name: "Bowie", published: true }
    ]
  }));
  const ids = snapshot.overlooked.filter((o) => o.kind === "unpublished_product").map((o) => o.id);
  assert.deepEqual(ids, ["p1"]);
  assert.equal(snapshot.counts.unpublishedProducts, 1);
});

test("overlooked: flags an expired reservation but not an active one", () => {
  const snapshot = computeSnapshotFromData(baseArgs({
    products: [
      { productId: "p1", name: "Expired", reservedByOrderId: "o1", reservationExpiresAt: NOW - DAY_MS },
      { productId: "p2", name: "Active", reservedByOrderId: "o2", reservationExpiresAt: NOW + DAY_MS }
    ]
  }));
  const ids = snapshot.overlooked.filter((o) => o.kind === "expired_reservation").map((o) => o.id);
  assert.deepEqual(ids, ["p1"]);
});

test("overlooked: caps at 8 entries even when more signals fire", () => {
  const requests = Array.from({ length: 10 }, (_, i) => ({ id: `r${i}`, priceDiscrepancy: true }));
  const snapshot = computeSnapshotFromData(baseArgs({ requests }));
  assert.ok(snapshot.overlooked.length <= 8);
});

test("action queue: unfulfilled paid orders are surfaced and prioritized above review requests", () => {
  const snapshot = computeSnapshotFromData(baseArgs({
    orders: [{ orderId: "o1", status: "paid", fulfillmentStatus: "unfulfilled" }],
    requests: [{ id: "r1", status: "pending_payment" }]
  }));
  assert.equal(snapshot.counts.unfulfilled, 1);
  assert.equal(snapshot.counts.requestsToReview, 1);
  const kinds = snapshot.actionQueue.map((item) => item.kind);
  assert.ok(kinds.includes("unfulfilled_order"));
  assert.ok(kinds.includes("review_request"));
});

test("revenue: only counts paid/approved orders within the window", () => {
  const snapshot = computeSnapshotFromData(baseArgs({
    orders: [
      { orderId: "o1", status: "paid", amount: 100, paidAt: NOW - 5 * DAY_MS },
      { orderId: "o2", status: "paid", amount: 50, paidAt: NOW - 40 * DAY_MS },
      { orderId: "o3", status: "pending", amount: 999, paidAt: NOW }
    ]
  }));
  assert.equal(snapshot.recentRevenue.last30Days, 100);
  assert.equal(snapshot.recentRevenue.last90Days, 150);
  assert.equal(snapshot.recentRevenue.orderCount30, 1);
});
