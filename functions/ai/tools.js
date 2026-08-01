const admin = require("firebase-admin");
const db = admin.database();
const { getInternals } = require("./internalsRegistry");
const { applyMutation, logNonRevertibleAction } = require("./mutations");
const { buildProductPayload } = require("./productPayload");
const { buildBusinessSnapshot, getPublicKnifeStatus } = require("./snapshot");

const READ_LIMIT_DEFAULT = 25;
const READ_LIMIT_MAX = 25;

function clampLimit(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return READ_LIMIT_DEFAULT;
  return Math.min(n, READ_LIMIT_MAX);
}

function toEntries(snapVal) {
  return Object.entries(snapVal || {});
}

function contains(haystack, needle) {
  return String(haystack || "").toLowerCase().includes(String(needle || "").toLowerCase());
}

// Every outbound (email-sending) tool must be confirmed in chat first. The
// model is instructed (functions/ai/systemPrompt.js) to describe the send
// and wait for a yes before calling again with confirmedByUser: true. This
// is a server-side floor, not just a prompt instruction — if the flag is
// missing, the tool returns an { error } the model reads as "ask him".
function requireConfirmation(args, toolName, description) {
  if (args.confirmedByUser !== true) {
    return {
      error: `${toolName} ${description}. Ask Nolan to confirm in the chat first, ` +
        `then call ${toolName} again with confirmedByUser: true.`
    };
  }
  return null;
}

function obj(properties, required = []) {
  return { type: "OBJECT", properties, required };
}
function str(description, extra = {}) {
  return { type: "STRING", description, ...extra };
}
function num(description) {
  return { type: "NUMBER", description };
}
function bool(description) {
  return { type: "BOOLEAN", description };
}
function arr(itemsType, description) {
  return { type: "ARRAY", description, items: { type: itemsType } };
}

// ============================================================================
// READ TOOLS — cheap, uncapped by round budget, no audit trail
// ============================================================================

const readTools = [
  {
    declaration: {
      name: "get_business_snapshot",
      description: "Get a fresh summary of the business: counts, the action queue, overlooked items, and recent revenue. Useful after making changes to see the updated picture.",
      parameters: obj({})
    },
    kind: "read",
    handler: async () => buildBusinessSnapshot()
  },
  {
    declaration: {
      name: "find_products",
      description: "Search products/knives by name or id substring, optionally filtered by status.",
      parameters: obj({
        query: str("Substring to match against product name or id. Omit to list all."),
        status: str("Filter by status.", { enum: ["available", "pending", "sold"] }),
        limit: num("Max results, default 25, max 25.")
      })
    },
    kind: "read",
    handler: async ({ query, status, limit }) => {
      const snap = await db.ref("Products").once("value");
      let items = toEntries(snap.val()).map(([productId, v]) => ({ productId, ...v }));
      if (query) items = items.filter((p) => contains(p.name, query) || contains(p.productId, query) || contains(p.custom_id, query));
      if (status) items = items.filter((p) => getPublicKnifeStatus(p) === status);
      items = items.slice(0, clampLimit(limit));
      return {
        products: items.map((p) => ({
          productId: p.productId, name: p.name, price: p.price, stock: p.stock,
          status: getPublicKnifeStatus(p), published: p.published, displayLocation: p.displayLocation,
          saleStatus: p.saleStatus
        }))
      };
    }
  },
  {
    declaration: {
      name: "get_product",
      description: "Get full detail for one product by id, including description and specifications.",
      parameters: obj({ productId: str("Product id.") }, ["productId"])
    },
    kind: "read",
    handler: async ({ productId }) => {
      const snap = await db.ref(`Products/${productId}`).once("value");
      if (!snap.exists()) return { error: "Product not found." };
      return { productId, ...snap.val() };
    }
  },
  {
    declaration: {
      name: "find_orders",
      description: "Search orders by status and/or fulfillment status.",
      parameters: obj({
        status: str("Order status filter.", { enum: ["pending", "paid", "approved"] }),
        fulfillmentStatus: str("Fulfillment status filter.", { enum: ["unfulfilled", "processing", "shipped", "delivered"] }),
        limit: num("Max results, default 25, max 25.")
      })
    },
    kind: "read",
    handler: async ({ status, fulfillmentStatus, limit }) => {
      const snap = await db.ref("orders").once("value");
      let items = toEntries(snap.val()).map(([orderId, v]) => ({ orderId, ...v }));
      if (status) items = items.filter((o) => o.status === status);
      if (fulfillmentStatus) items = items.filter((o) => (o.fulfillmentStatus || "unfulfilled") === fulfillmentStatus);
      items = items.slice(0, clampLimit(limit));
      return {
        orders: items.map((o) => ({
          orderId: o.orderId, knifeId: o.knifeId, status: o.status,
          fulfillmentStatus: o.fulfillmentStatus || "unfulfilled", amount: o.amount,
          createdAt: o.createdAt, trackingNumber: o.trackingNumber || null
        }))
      };
    }
  },
  {
    declaration: {
      name: "get_order",
      description: "Get full detail for one order by id, including shipping address and internal notes.",
      parameters: obj({ orderId: str("Order id.") }, ["orderId"])
    },
    kind: "read",
    handler: async ({ orderId }) => {
      const snap = await db.ref(`orders/${orderId}`).once("value");
      if (!snap.exists()) return { error: "Order not found." };
      return { orderId, ...snap.val() };
    }
  },
  {
    declaration: {
      name: "find_custom_requests",
      description: "Search custom knife requests by status.",
      parameters: obj({
        status: str("Status filter, e.g. priority_review, quote_sent, in_production, awaiting_final_payment."),
        limit: num("Max results, default 25, max 25.")
      })
    },
    kind: "read",
    handler: async ({ status, limit }) => {
      const snap = await db.ref("customRequests").once("value");
      let items = toEntries(snap.val()).map(([id, v]) => ({ id, ...v }));
      if (status) items = items.filter((r) => r.status === status);
      items = items.slice(0, clampLimit(limit));
      return {
        requests: items.map((r) => ({
          id: r.id, status: r.status, customerName: r.customerName, customerEmail: r.customerEmail,
          knifeType: r.knifeType, steelType: r.steelType, estimatedPrice: r.estimatedPrice,
          finalPrice: r.finalPrice || null, createdAt: r.createdAt
        }))
      };
    }
  },
  {
    declaration: {
      name: "get_custom_request",
      description: "Get full detail for one custom knife request by id, including all spec fields, quote, and payment status.",
      parameters: obj({ requestId: str("Custom request id.") }, ["requestId"])
    },
    kind: "read",
    handler: async ({ requestId }) => {
      const snap = await db.ref(`customRequests/${requestId}`).once("value");
      if (!snap.exists()) return { error: "Custom request not found." };
      return { id: requestId, ...snap.val() };
    }
  },
  {
    declaration: {
      name: "find_customers",
      description: "Search customers/users by name or email substring, optionally filtered by role.",
      parameters: obj({
        query: str("Substring to match against display name or email."),
        role: str("Filter by role.", { enum: ["customer", "business", "admin"] }),
        limit: num("Max results, default 25, max 25.")
      })
    },
    kind: "read",
    handler: async ({ query, role, limit }) => {
      const snap = await db.ref("users").once("value");
      let items = toEntries(snap.val()).map(([uid, v]) => ({ uid, ...v }));
      if (query) items = items.filter((u) => contains(u.displayName, query) || contains(u.email, query));
      if (role) items = items.filter((u) => u.role === role);
      items = items.slice(0, clampLimit(limit));
      return {
        customers: items.map((u) => ({
          uid: u.uid, displayName: u.displayName, email: u.email, role: u.role,
          status: u.status, emailSuppressed: !!u.emailSuppression?.status
        }))
      };
    }
  },
  {
    declaration: {
      name: "get_conversation",
      description: "Get recent messages for a conversation (an order id or custom request id).",
      parameters: obj({
        conversationId: str("Conversation id — same as the order id or custom request id."),
        limit: num("Max messages to return, default 25, max 25.")
      }, ["conversationId"])
    },
    kind: "read",
    handler: async ({ conversationId, limit }) => {
      const [convSnap, msgSnap] = await Promise.all([
        db.ref(`conversations/${conversationId}`).once("value"),
        db.ref(`messages/${conversationId}`).once("value")
      ]);
      if (!convSnap.exists()) return { error: "Conversation not found." };
      const messages = toEntries(msgSnap.val())
        .map(([id, v]) => ({ id, ...v }))
        .sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0))
        .slice(-clampLimit(limit));
      return {
        conversationId,
        status: convSnap.val().status,
        messages: messages.map((m) => ({ senderRole: m.senderRole, text: m.text, createdAt: m.createdAt }))
      };
    }
  },
  {
    declaration: {
      name: "list_email_groups",
      description: "List saved email audience groups with member counts.",
      parameters: obj({})
    },
    kind: "read",
    handler: async () => {
      const snap = await db.ref("emailGroups").once("value");
      const items = toEntries(snap.val()).map(([groupId, v]) => ({
        groupId, name: v.name, description: v.description || "",
        memberCount: Object.keys(v.members || {}).length
      }));
      return { groups: items.slice(0, clampLimit()) };
    }
  },
  {
    declaration: {
      name: "list_email_campaigns",
      description: "List recent email campaigns, including drafts, with status and recipient counts.",
      parameters: obj({ limit: num("Max results, default 25, max 25.") })
    },
    kind: "read",
    handler: async ({ limit }) => {
      const snap = await db.ref("emailCampaigns").once("value");
      const items = toEntries(snap.val())
        .map(([campaignId, v]) => ({ campaignId, ...v }))
        .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))
        .slice(0, clampLimit(limit));
      return {
        campaigns: items.map((c) => ({
          campaignId: c.campaignId, campaignName: c.campaignName, status: c.status,
          recipientCount: c.recipientCount || 0, successCount: c.successCount || null,
          failureCount: c.failureCount || null, createdAt: c.createdAt
        }))
      };
    }
  },
  {
    declaration: {
      name: "get_analytics",
      description: "Get revenue and order-volume totals for a recent date range.",
      parameters: obj({ rangeDays: num("How many days back to include. Default 30.") })
    },
    kind: "read",
    handler: async ({ rangeDays }) => {
      const days = clampLimit(rangeDays) || 30;
      const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
      const snap = await db.ref("orders").once("value");
      const paid = toEntries(snap.val())
        .map(([orderId, v]) => ({ orderId, ...v }))
        .filter((o) => ["paid", "approved"].includes(o.status) && Number(o.paidAt || o.createdAt || 0) >= cutoff);
      return {
        rangeDays: days,
        orderCount: paid.length,
        totalRevenue: Number(paid.reduce((sum, o) => sum + (Number(o.amount) || 0), 0).toFixed(2))
      };
    }
  }
];

// ============================================================================
// WRITE TOOLS — execute immediately via applyMutation, audited + revertible
// ============================================================================

const PRODUCT_SPEC_NOTE = "Product copy should be operational, not promotional — concrete materials, dimensions, and construction details over adjectives.";

const writeTools = [
  {
    declaration: {
      name: "create_product",
      description: `Create a new knife listing. ${PRODUCT_SPEC_NOTE}`,
      parameters: obj({
        name: str("Product name."),
        description: str("Product description."),
        price: num("Price in USD."),
        stock: num("Stock count, default 1."),
        specifications: str("Specifications text (steel, dimensions, etc.)."),
        saleStatus: str("Sale status.", { enum: ["available", "pending", "reserved", "sold"] }),
        displayLocation: str("Where it shows.", { enum: ["store", "gallery"] }),
        publish: bool("Whether to publish immediately. Default false (draft).")
      }, ["name", "price"])
    },
    kind: "write",
    handler: async (args, ctx) => {
      const productId = db.ref("Products").push().key;
      const payload = buildProductPayload(args, { publish: args.publish });
      return applyMutation({
        uid: ctx.uid, threadId: ctx.threadId, tool: "create_product",
        path: `Products/${productId}`, mode: "set", nextValue: payload,
        summary: `Created product "${payload.name}" ($${payload.price}).`
      });
    }
  },
  {
    declaration: {
      name: "update_product",
      description: `Update fields on an existing product. Only send fields that are changing. ${PRODUCT_SPEC_NOTE}`,
      parameters: obj({
        productId: str("Product id to update."),
        name: str("Product name."),
        description: str("Product description."),
        price: num("Price in USD."),
        stock: num("Stock count."),
        specifications: str("Specifications text."),
        saleStatus: str("Sale status.", { enum: ["available", "pending", "reserved", "sold"] }),
        displayLocation: str("Where it shows.", { enum: ["store", "gallery"] }),
        published: bool("Whether it's published.")
      }, ["productId"])
    },
    kind: "write",
    handler: async (args, ctx) => {
      const { productId, ...fields } = args;
      const existingSnap = await db.ref(`Products/${productId}`).once("value");
      if (!existingSnap.exists()) return { error: "Product not found." };
      const merged = { ...existingSnap.val(), ...fields };
      const payload = buildProductPayload(merged, { publish: fields.published ?? existingSnap.val().published });
      return applyMutation({
        uid: ctx.uid, threadId: ctx.threadId, tool: "update_product",
        path: `Products/${productId}`, mode: "set", nextValue: payload,
        summary: `Updated product "${payload.name}" (${Object.keys(fields).join(", ") || "no fields"}).`
      });
    }
  },
  {
    declaration: {
      name: "delete_product",
      description: "Permanently delete a product listing.",
      parameters: obj({ productId: str("Product id to delete.") }, ["productId"])
    },
    kind: "write",
    handler: async ({ productId }, ctx) => applyMutation({
      uid: ctx.uid, threadId: ctx.threadId, tool: "delete_product",
      path: `Products/${productId}`, mode: "remove",
      summary: `Deleted product ${productId}.`
    })
  },
  {
    declaration: {
      name: "update_order_fulfillment",
      description: "Update an order's fulfillment status and/or tracking info.",
      parameters: obj({
        orderId: str("Order id."),
        status: str("Fulfillment status.", { enum: ["unfulfilled", "processing", "shipped", "delivered"] }),
        trackingNumber: str("Carrier tracking number."),
        trackingUrl: str("Carrier tracking URL."),
        expectedArrivalDate: str("Expected arrival date, e.g. 2026-08-10.")
      }, ["orderId"])
    },
    kind: "write",
    handler: async ({ orderId, status, trackingNumber, trackingUrl, expectedArrivalDate }, ctx) => {
      if (status && !["unfulfilled", "processing", "shipped", "delivered"].includes(status)) {
        return { error: "Invalid fulfillment status." };
      }
      const nextValue = { updatedAt: admin.database.ServerValue.TIMESTAMP };
      if (status) nextValue.fulfillmentStatus = status;
      if (trackingNumber !== undefined) nextValue.trackingNumber = trackingNumber || null;
      if (trackingUrl !== undefined) nextValue.trackingUrl = trackingUrl || null;
      if (expectedArrivalDate !== undefined) nextValue.expectedArrivalDate = expectedArrivalDate || null;
      return applyMutation({
        uid: ctx.uid, threadId: ctx.threadId, tool: "update_order_fulfillment",
        path: `orders/${orderId}`, mode: "update", nextValue,
        summary: `Order ${orderId}: ${status ? `status → ${status}` : "tracking updated"}.`
      });
    }
  },
  {
    declaration: {
      name: "update_order_notes",
      description: "Update the internal (staff-only) notes on an order.",
      parameters: obj({ orderId: str("Order id."), internalNotes: str("Internal notes text.") }, ["orderId", "internalNotes"])
    },
    kind: "write",
    handler: async ({ orderId, internalNotes }, ctx) => applyMutation({
      uid: ctx.uid, threadId: ctx.threadId, tool: "update_order_notes",
      path: `orders/${orderId}`, mode: "update",
      nextValue: { internalNotes, updatedAt: admin.database.ServerValue.TIMESTAMP },
      summary: `Updated internal notes on order ${orderId}.`
    })
  },
  {
    declaration: {
      name: "update_custom_request",
      description: "Update a custom knife request's status, internal notes, or pricing fields.",
      parameters: obj({
        requestId: str("Custom request id."),
        status: str("New status, e.g. priority_review, in_production, awaiting_final_payment, completed."),
        internalNotes: str("Internal (staff-only) notes."),
        finalPrice: num("Final agreed price."),
        depositAmount: num("Deposit amount."),
        quoteNotes: str("Notes to include in the next quote.")
      }, ["requestId"])
    },
    kind: "write",
    handler: async ({ requestId, ...fields }, ctx) => {
      const nextValue = { ...fields, lastUpdatedAt: admin.database.ServerValue.TIMESTAMP, lastUpdatedBy: ctx.uid };
      return applyMutation({
        uid: ctx.uid, threadId: ctx.threadId, tool: "update_custom_request",
        path: `customRequests/${requestId}`, mode: "update", nextValue,
        summary: `Updated custom request ${requestId} (${Object.keys(fields).join(", ") || "no fields"}).`
      });
    }
  },
  {
    declaration: {
      name: "mark_conversation_read",
      description: "Mark a conversation's messages as read by staff, clearing the unread badge.",
      parameters: obj({ conversationId: str("Conversation id.") }, ["conversationId"])
    },
    kind: "write",
    handler: async ({ conversationId }, ctx) => {
      const messagesSnap = await db.ref(`messages/${conversationId}`).once("value");
      const updates = {};
      if (messagesSnap.exists()) {
        Object.keys(messagesSnap.val()).forEach((msgId) => {
          updates[`messages/${conversationId}/${msgId}/readByStaff`] = true;
        });
      }
      updates[`conversations/${conversationId}/staffUnreadCount`] = 0;
      updates[`conversations/${conversationId}/staffUnreadSince`] = null;
      updates[`conversations/${conversationId}/staffUnreadReminderSentAt`] = null;
      updates[`conversations/${conversationId}/staffReadAt`] = admin.database.ServerValue.TIMESTAMP;
      await db.ref().update(updates);
      return logNonRevertibleAction({
        uid: ctx.uid, threadId: ctx.threadId, tool: "mark_conversation_read",
        summary: `Marked conversation ${conversationId} as read.`
      });
    }
  },
  {
    declaration: {
      name: "create_email_group",
      description: "Create a new email audience group.",
      parameters: obj({
        name: str("Group name."),
        description: str("Group description."),
        memberUids: arr("STRING", "User ids to include as members.")
      }, ["name"])
    },
    kind: "write",
    handler: async ({ name, description, memberUids }, ctx) => {
      const groupId = db.ref("emailGroups").push().key;
      const members = (memberUids || []).reduce((acc, uid) => ({ ...acc, [uid]: true }), {});
      return applyMutation({
        uid: ctx.uid, threadId: ctx.threadId, tool: "create_email_group",
        path: `emailGroups/${groupId}`, mode: "set",
        nextValue: {
          name, description: description || "", members,
          createdAt: admin.database.ServerValue.TIMESTAMP, updatedAt: admin.database.ServerValue.TIMESTAMP
        },
        summary: `Created email group "${name}" with ${Object.keys(members).length} member(s).`
      });
    }
  },
  {
    declaration: {
      name: "update_email_group",
      description: "Rename, redescribe, or replace the member list of an email group.",
      parameters: obj({
        groupId: str("Group id."),
        name: str("Group name."),
        description: str("Group description."),
        memberUids: arr("STRING", "Full replacement list of member user ids.")
      }, ["groupId"])
    },
    kind: "write",
    handler: async ({ groupId, name, description, memberUids }, ctx) => {
      const nextValue = { updatedAt: admin.database.ServerValue.TIMESTAMP };
      if (name !== undefined) nextValue.name = name;
      if (description !== undefined) nextValue.description = description;
      if (memberUids !== undefined) nextValue.members = memberUids.reduce((acc, uid) => ({ ...acc, [uid]: true }), {});
      return applyMutation({
        uid: ctx.uid, threadId: ctx.threadId, tool: "update_email_group",
        path: `emailGroups/${groupId}`, mode: "update", nextValue,
        summary: `Updated email group ${groupId}.`
      });
    }
  },
  {
    declaration: {
      name: "delete_email_group",
      description: "Delete an email audience group.",
      parameters: obj({ groupId: str("Group id.") }, ["groupId"])
    },
    kind: "write",
    handler: async ({ groupId }, ctx) => applyMutation({
      uid: ctx.uid, threadId: ctx.threadId, tool: "delete_email_group",
      path: `emailGroups/${groupId}`, mode: "remove",
      summary: `Deleted email group ${groupId}.`
    })
  },
  {
    declaration: {
      name: "save_campaign_draft",
      description: "Save an email campaign as a draft for Nolan to review and send from the Email Campaigns page. Does not send anything.",
      parameters: obj({
        campaignName: str("Campaign name."),
        subject: str("Email subject line."),
        html: str("Email HTML body."),
        groupIds: arr("STRING", "Email group ids to target.")
      }, ["campaignName", "subject", "html"])
    },
    kind: "write",
    handler: async ({ campaignName, subject, html, groupIds }, ctx) => {
      const campaignId = db.ref("emailCampaigns").push().key;
      const now = admin.database.ServerValue.TIMESTAMP;
      return applyMutation({
        uid: ctx.uid, threadId: ctx.threadId, tool: "save_campaign_draft",
        path: `emailCampaigns/${campaignId}`, mode: "set",
        nextValue: {
          campaignId, campaignName, mode: "custom", subject, html,
          groupIds: (groupIds || []).reduce((acc, id) => ({ ...acc, [id]: true }), {}),
          status: "draft", createdByAi: true, createdBy: ctx.uid,
          createdAt: now, updatedAt: now
        },
        summary: `Saved campaign draft "${campaignName}". Review it at /business/email-campaigns?draft=${campaignId}.`
      });
    }
  }
];

// ============================================================================
// OUTBOUND TOOLS — send real email to customers. Require confirmedByUser.
// ============================================================================

const outboundTools = [
  {
    declaration: {
      name: "send_quote",
      description: "Send a price quote to the customer for a custom knife request. Emails the customer. Requires confirmation.",
      parameters: obj({
        requestId: str("Custom request id."),
        finalPrice: num("Final price in USD."),
        remainingBalance: num("Remaining balance after deposit, if known."),
        notes: str("Notes to include in the quote."),
        paymentTerms: str("Payment terms, e.g. 'Net 30'."),
        confirmedByUser: bool("Must be true — only set after Nolan has confirmed in chat.")
      }, ["requestId", "finalPrice"])
    },
    kind: "outbound",
    handler: async (args, ctx) => {
      const blocked = requireConfirmation(args, "send_quote", "emails the customer a price quote");
      if (blocked) return blocked;
      const result = await getInternals().sendCustomKnifeQuoteCore(ctx.uid, args);
      return logNonRevertibleAction({
        uid: ctx.uid, threadId: ctx.threadId, tool: "send_quote",
        summary: `Sent quote for request ${args.requestId}: $${args.finalPrice}.`,
        detail: { requestId: args.requestId, quoteId: result.quoteId }
      });
    }
  },
  {
    declaration: {
      name: "request_final_payment",
      description: "Request final payment from the customer on a custom knife request. Emails the customer. Requires confirmation.",
      parameters: obj({
        requestId: str("Custom request id."),
        remainingBalance: num("Remaining balance, if overriding the computed value."),
        shippingAmount: num("Shipping amount to add."),
        taxAmount: num("Tax amount to add."),
        adjustmentAmount: num("Any additional adjustment."),
        note: str("Note to include."),
        confirmedByUser: bool("Must be true — only set after Nolan has confirmed in chat.")
      }, ["requestId"])
    },
    kind: "outbound",
    handler: async (args, ctx) => {
      const blocked = requireConfirmation(args, "request_final_payment", "emails the customer requesting final payment");
      if (blocked) return blocked;
      const result = await getInternals().requestFinalPaymentCore(ctx.uid, args);
      return logNonRevertibleAction({
        uid: ctx.uid, threadId: ctx.threadId, tool: "request_final_payment",
        summary: `Requested final payment of $${result.amount} for request ${args.requestId}.`,
        detail: { requestId: args.requestId }
      });
    }
  },
  {
    declaration: {
      name: "send_customer_message",
      description: "Send a chat message to a customer in an order or custom request conversation. Requires confirmation.",
      parameters: obj({
        orderId: str("Order id or custom request id (conversation id)."),
        text: str("Message text."),
        confirmedByUser: bool("Must be true — only set after Nolan has confirmed in chat.")
      }, ["orderId", "text"])
    },
    kind: "outbound",
    handler: async (args, ctx) => {
      const blocked = requireConfirmation(args, "send_customer_message", "sends a message directly to the customer");
      if (blocked) return blocked;
      const result = await getInternals().sendStaffMessageCore(ctx.uid, args);
      return logNonRevertibleAction({
        uid: ctx.uid, threadId: ctx.threadId, tool: "send_customer_message",
        summary: `Sent a message to the customer on ${args.orderId}.`,
        detail: { orderId: args.orderId, messageId: result.messageId }
      });
    }
  },
  {
    declaration: {
      name: "send_email_campaign",
      description: "Send an email campaign immediately to its audience. Emails potentially many customers at once. Requires confirmation. Prefer save_campaign_draft unless Nolan explicitly asks you to send right now.",
      parameters: obj({
        campaignName: str("Campaign name."),
        subject: str("Email subject line."),
        html: str("Email HTML body."),
        groupIds: arr("STRING", "Email group ids to target."),
        confirmedByUser: bool("Must be true — only set after Nolan has confirmed in chat, including the recipient count.")
      }, ["campaignName", "subject", "html"])
    },
    kind: "outbound",
    handler: async (args, ctx) => {
      const blocked = requireConfirmation(args, "send_email_campaign", "emails every recipient in the selected audience right now");
      if (blocked) return blocked;
      const result = await getInternals().sendEmailCampaignCore(ctx.uid, {
        campaignName: args.campaignName, subject: args.subject, html: args.html,
        groupIds: args.groupIds || [], mode: "custom"
      });
      return logNonRevertibleAction({
        uid: ctx.uid, threadId: ctx.threadId, tool: "send_email_campaign",
        summary: `Sent campaign "${args.campaignName}" to ${result.recipientCount} recipient(s) (${result.successCount} delivered, ${result.failureCount} failed).`,
        detail: { campaignId: result.campaignId }
      });
    }
  }
];

const allTools = [...readTools, ...writeTools, ...outboundTools];
const toolsByName = new Map(allTools.map((t) => [t.declaration.name, t]));

function getFunctionDeclarations() {
  return allTools.map((t) => t.declaration);
}

async function runTool(call, ctx) {
  const tool = toolsByName.get(call.name);
  if (!tool) return { error: `Unknown tool: ${call.name}` };
  try {
    return await tool.handler(call.args || {}, ctx);
  } catch (error) {
    return { error: error?.message || "Tool call failed." };
  }
}

function describeCall(call) {
  const tool = toolsByName.get(call.name);
  const label = call.name.replace(/_/g, " ");
  if (!tool) return label;
  if (tool.kind === "read") return `Looking up ${label.replace(/^(find|get|list) /, "")}...`;
  return `${label}...`;
}

module.exports = { getFunctionDeclarations, runTool, describeCall };
