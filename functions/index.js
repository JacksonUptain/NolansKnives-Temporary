const admin = require("firebase-admin");
const axios = require("axios");
const nodemailer = require("nodemailer");
const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");

admin.initializeApp();

const db = admin.database();
const auth = admin.auth();
const functionsLib = require('firebase-functions');

// Email Configuration (Mailgun)
const MAILGUN_DOMAIN = process.env.MAILGUN_DOMAIN || "mail.nolansknives.com";
const MAILGUN_API_KEY = process.env.MAILGUN_API_KEY || "";
const MAILGUN_API_BASE = (process.env.MAILGUN_API_BASE || "https://api.mailgun.net").replace(/\/$/, "");
const FROM_EMAIL = process.env.FROM_EMAIL || "noreply@nolansknives.com";
const BUSINESS_EMAIL = process.env.BUSINESS_EMAIL || "orders@nolansknives.com";
const SITE_URL = (process.env.SITE_URL || "https://nolansknives.com").replace(/\/$/, "");

// SMTP remains available for explicit credentials, but Mailgun sending keys use the HTTP API.
const SMTP_HOST = process.env.SMTP_HOST || `smtp.mailgun.org`;
const SMTP_PORT = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587;
const SMTP_USER = process.env.SMTP_USER || `postmaster@${MAILGUN_DOMAIN}`;
const SMTP_PASS = process.env.SMTP_PASS || "";

const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_PORT === 465,
  auth: {
    user: SMTP_USER,
    pass: SMTP_PASS
  }
});

// Email Templates
const emailTemplates = {
  customRequestSubmitted: (customerName, requestId, estimatedPrice) => ({
    subject: "Custom Knife Request Received - Nolan's Knives",
    html: `
      <h2>Thank You for Your Custom Request!</h2>
      <p>Hi ${customerName},</p>
      <p>We've received your custom knife request. Our team will review your specifications and get back to you within 2-3 business days.</p>
      <div style="background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
        <p><strong>Request ID:</strong> ${requestId}</p>
        <p><strong>Estimated Price:</strong> $${estimatedPrice.toFixed(2)}</p>
      </div>
      <p>In the meantime, you can track your request by logging into your account at <a href="https://nolansknives.com">nolansknives.com</a>.</p>
      <p>Questions? Reply to this email or contact us at ${BUSINESS_EMAIL}</p>
      <p>Best regards,<br/>Nolan's Knives Team</p>
    `
  }),

  customRequestPriorityPaid: (customerName, requestId, estimatedPrice, depositAmount) => ({
    subject: "Priority Custom Knife Request Received - Nolan's Knives",
    html: `
      <h2>Priority Request Received</h2>
      <p>Hi ${customerName},</p>
      <p>We've received your custom knife request and your 15% priority deposit.</p>
      <div style="background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
        <p><strong>Request ID:</strong> ${requestId}</p>
        <p><strong>Estimated Price:</strong> $${estimatedPrice.toFixed(2)}</p>
        <p><strong>Deposit Paid:</strong> $${depositAmount.toFixed(2)}</p>
      </div>
      <p>Nolan will review your brief and send a more detailed quote. If the final quote is not accepted, the deposit can be refunded.</p>
      <p>You can view the request and chat with Nolan's team from your account.</p>
      <p>Best regards,<br/>Nolan's Knives Team</p>
    `
  }),

  customRequestPriorityPaidBusiness: (customerName, requestId, estimatedPrice, depositAmount) => ({
    subject: `Priority Custom Request Paid - ${customerName}`,
    html: `
      <h2>Priority Custom Request Paid</h2>
      <p>${customerName} paid the 15% priority deposit for a custom knife request.</p>
      <div style="background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
        <p><strong>Request ID:</strong> ${requestId}</p>
        <p><strong>Estimated Price:</strong> $${estimatedPrice.toFixed(2)}</p>
        <p><strong>Deposit Paid:</strong> $${depositAmount.toFixed(2)}</p>
      </div>
      <p>Review the request in the business dashboard and send the detailed quote when ready.</p>
    `
  }),

  knifePurchasedCustomer: (customerName, orderId, knifeName, amount) => ({
    subject: `Order Confirmed - ${knifeName}`,
    html: `
      <h2>Order Confirmed</h2>
      <p>Hi ${customerName},</p>
      <p>Thanks for your purchase from Nolan's Knives.</p>
      <div style="background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
        <p><strong>Order ID:</strong> ${orderId}</p>
        <p><strong>Knife:</strong> ${knifeName}</p>
        <p><strong>Total Paid:</strong> $${Number(amount || 0).toFixed(2)}</p>
      </div>
      <p>Your knife now appears under Your Knives, where you can track status and message Nolan's team.</p>
      <p>Best regards,<br/>Nolan's Knives Team</p>
    `
  }),

  knifePurchasedBusiness: (customerName, orderId, knifeName, amount) => ({
    subject: `Knife Sold - ${knifeName}`,
    html: `
      <h2>Knife Sold</h2>
      <p>${customerName} completed payment for a store knife.</p>
      <div style="background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
        <p><strong>Order ID:</strong> ${orderId}</p>
        <p><strong>Knife:</strong> ${knifeName}</p>
        <p><strong>Total Paid:</strong> $${Number(amount || 0).toFixed(2)}</p>
      </div>
      <p>Open the business orders page to review fulfillment and customer details.</p>
    `
  }),

  quoteSent: (
    customerName,
    requestId,
    finalPrice,
    depositDue,
    remainingBalance,
    depositAlreadyPaid = false,
    depositPaymentUrl = `${SITE_URL}/custom-knife/confirmation/${encodeURIComponent(requestId)}?deposit=1`
  ) => ({
    subject: "Your Custom Knife Quote - Nolan's Knives",
    html: `
      <h2>Your Custom Knife Quote</h2>
      <p>Hi ${customerName},</p>
      <p>We've prepared a quote for your custom knife request.</p>
      <div style="background: #e8f5e9; padding: 20px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #27ae60;">
        <p style="margin: 0; font-size: 14px; color: #666;">PRICING BREAKDOWN</p>
        <h3 style="margin: 10px 0 0 0; color: #27ae60;">$${finalPrice.toFixed(2)}</h3>
        <p style="margin: 10px 0 0 0; font-size: 14px;">
          <strong>${depositAlreadyPaid ? "Deposit Recorded" : "15% Deposit Due Now"}:</strong> $${depositDue.toFixed(2)}<br/>
          <strong>Remaining Balance:</strong> $${remainingBalance.toFixed(2)}
        </p>
      </div>
      ${depositAlreadyPaid ? `
        <p>Your priority deposit is already recorded. Nolan will continue from here and send the next payment step when it is ready.</p>
        <p><a href="${SITE_URL}/my-knives/${encodeURIComponent(requestId)}" style="display: inline-block; background: #8b6f47; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">View Request</a></p>
      ` : `
        <p>To move forward, pay the 15% deposit using the secure link below. The remaining balance is due later in the build process.</p>
        <p><a href="${depositPaymentUrl}" style="display: inline-block; background: #8b6f47; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Pay 15% Deposit</a></p>
      `}
      <p>Questions about the quote? Reply to this email.</p>
      <p>Best regards,<br/>Nolan's Knives Team</p>
    `
  }),

  depositReceived: (customerName, requestId, depositAmount) => ({
    subject: "Deposit Received - Nolan's Knives",
    html: `
      <h2>Deposit Received!</h2>
      <p>Hi ${customerName},</p>
      <p>We've received your deposit payment of $${depositAmount.toFixed(2)} for request #${requestId}.</p>
      <p>Your custom knife is now officially in production. We'll keep you updated on progress and ship as soon as it's complete.</p>
      <p>You can track your order at: <a href="https://nolansknives.com/my-knives/${requestId}">https://nolansknives.com/my-knives/${requestId}</a></p>
      <p>Best regards,<br/>Nolan's Knives Team</p>
    `
  }),

  statusUpdate: (customerName, requestId, newStatus, message) => ({
    subject: `Order Update: ${newStatus} - Nolan's Knives`,
    html: `
      <h2>Order Update</h2>
      <p>Hi ${customerName},</p>
      <p>Your custom knife order (${requestId}) has been updated.</p>
      <div style="background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
        <p><strong>Status:</strong> ${newStatus}</p>
        ${message ? `<p><strong>Message from Nolan:</strong></p><p>${message}</p>` : ''}
      </div>
      <p><a href="https://nolansknives.com/my-knives/${requestId}">View Full Details</a></p>
      <p>Best regards,<br/>Nolan's Knives Team</p>
    `
  }),

  unreadMessages: (customerName, requestId, messageCount, senderName = "Nolan's team") => ({
    subject: `${senderName} left you a message - Nolan's Knives`,
    html: `
      <h2>You Have Unread Messages</h2>
      <p>Hi ${customerName},</p>
      <p>${senderName} left ${messageCount} unread message${messageCount > 1 ? 's' : ''} about your knife order/request (${requestId}).</p>
      <p><a href="https://nolansknives.com/my-knives/${requestId}" style="display: inline-block; background: #8b6f47; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">View Messages</a></p>
      <p>Best regards,<br/>Nolan's Knives Team</p>
    `
  }),

  unreadCustomerMessages: (customerName, requestId, messageCount) => ({
    subject: `${customerName} left you a message - Nolan's Knives`,
    html: `
      <h2>Unread Customer Message</h2>
      <p>${customerName} left ${messageCount} unread message${messageCount > 1 ? 's' : ''} about ${requestId}.</p>
      <p><a href="https://nolansknives.com/business/orders" style="display: inline-block; background: #8b6f47; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Open Business Orders</a></p>
    `
  }),

  orderComplete: (customerName, requestId, trackingInfo) => ({
    subject: "Your Custom Knife is Ready! - Nolan's Knives",
    html: `
      <h2>Your Custom Knife is Ready!</h2>
      <p>Hi ${customerName},</p>
      <p>Congratulations! Your custom knife has been completed and is being shipped to you.</p>
      ${trackingInfo ? `
      <div style="background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
        <p><strong>Tracking Number:</strong> ${trackingInfo}</p>
      </div>
      ` : ''}
      <p>You'll receive tracking updates as your package moves. Expected delivery: 3-5 business days</p>
      <p>Thank you for choosing Nolan's Knives!</p>
      <p>Best regards,<br/>Nolan's Knives Team</p>
    `
  })
};

async function sendViaMailgunHttp({ to, subject, html }) {
  const form = new URLSearchParams();
  form.append("from", FROM_EMAIL);
  form.append("to", to);
  form.append("subject", subject);
  form.append("html", html);

  const response = await axios.post(
    `${MAILGUN_API_BASE}/v3/${MAILGUN_DOMAIN}/messages`,
    form.toString(),
    {
      auth: { username: "api", password: MAILGUN_API_KEY },
      headers: { "Content-Type": "application/x-www-form-urlencoded" }
    }
  );

  return {
    provider: "mailgun-http",
    messageId: response.data?.id || null,
    response: response.data?.message || null
  };
}

async function sendViaSmtp({ to, subject, html }) {
  if (!SMTP_PASS) {
    return { skipped: true, mode: "smtp-not-configured" };
  }

  const result = await transporter.sendMail({
    from: FROM_EMAIL,
    to,
    subject,
    html
  });

  return {
    provider: "smtp",
    messageId: result.messageId || null
  };
}

// Helper: Send Email
async function sendEmail(to, templateName, ...args) {
  try {
    const template = emailTemplates[templateName];
    if (!template) {
      throw new Error(`Unknown email template: ${templateName}`);
    }

    const { subject, html } = template(...args);

    if (!MAILGUN_API_KEY && !SMTP_PASS) {
      console.log(`[TEST MODE] Email not sent. To: ${to}, Template: ${templateName}`);
      await logNotificationEvent("email_skipped_test_mode", { to, template: templateName });
      return { skipped: true, mode: "test" };
    }

    const result = MAILGUN_API_KEY
      ? await sendViaMailgunHttp({ to, subject, html })
      : await sendViaSmtp({ to, subject, html });

    // Log successful send
    await logNotificationEvent("email_sent", {
      to,
      template: templateName,
      provider: result.provider,
      messageId: result.messageId || null
    });

    return result;
  } catch (error) {
    console.error(`Error sending ${templateName} email to ${to}:`, error);
    await logNotificationEvent("email_failed", { to, template: templateName, error: error.message });
    // Don't throw - email failures shouldn't block the main operation
    return { error: error.message, skipped: true };
  }
}

async function sendRequiredEmail(to, templateName, ...args) {
  const result = await sendEmail(to, templateName, ...args);
  if (result?.error || result?.skipped) {
    throw new Error(result?.error || "Email was not sent.");
  }
  return result;
}

// Helper: Log Notification Event
async function logNotificationEvent(eventType, metadata = {}) {
  try {
    const eventId = db.ref("notificationEvents").push().key;
    await db.ref(`notificationEvents/${eventId}`).set({
      eventType,
      timestamp: admin.database.ServerValue.TIMESTAMP,
      ...metadata
    });
  } catch (error) {
    console.error("Error logging notification event:", error);
  }
}

function applyCors(req, res) {
  const origin = req.get("origin") || "*";
  res.set("Access-Control-Allow-Origin", origin);
  res.set("Vary", "Origin");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set(
    "Access-Control-Allow-Headers",
    req.get("Access-Control-Request-Headers") || "Authorization, Content-Type, X-Firebase-AppCheck, X-Client-Version"
  );
  res.set("Access-Control-Max-Age", "3600");
}

function hasPaidCustomRequestDeposit(customRequest = {}) {
  return !!customRequest.priorityDepositPaid || customRequest.paymentStatus === "paid" || !!customRequest.depositPaidAt;
}

function getCustomRequestDepositAmount(customRequest = {}, finalPrice, requestedDepositAmount) {
  const candidates = [
    requestedDepositAmount,
    customRequest.depositRequired,
    customRequest.depositAmount,
    finalPrice ? Number(finalPrice) * DEPOSIT_PERCENTAGE : 0
  ];

  for (const candidate of candidates) {
    const amount = Number(candidate);
    if (Number.isFinite(amount) && amount > 0) {
      return Number(amount.toFixed(2));
    }
  }

  return 0;
}

function getCustomRequestDepositPaymentUrl(requestId) {
  return `${SITE_URL}/custom-knife/confirmation/${encodeURIComponent(requestId)}?deposit=1`;
}

async function requireUidFromRequest(req) {
  const decoded = await requireAuthFromRequest(req);
  return decoded.uid;
}

async function requireAuthFromRequest(req) {
  const authHeader = req.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.substring(7) : "";
  if (!token) {
    throw new HttpsError("unauthenticated", "Missing auth token.");
  }
  return auth.verifyIdToken(token);
}

// ============================================================================
// UTILITIES
// ============================================================================

async function verifyUserRole(uid, requiredRole = "customer") {
  try {
    const userRecord = await auth.getUser(uid);
    const claims = userRecord.customClaims || {};
    let userRole = claims.role;

    // Fallback to database role for easier admin setup and claim drift recovery.
    if (!userRole) {
      const profile = await getUserProfile(uid);
      userRole = profile?.role || "customer";
    }

    if (requiredRole === "customer") return true;
    if (requiredRole === "business" && (userRole === "business" || userRole === "admin")) return true;
    if (requiredRole === "admin" && userRole === "admin") return true;
    return false;
  } catch (error) {
    console.error(`Error verifying role for user ${uid}:`, error);
    // Allow access attempt to proceed - database rules will enforce
    return requiredRole === "customer";
  }
}

async function getUserProfile(uid) {
  const snap = await db.ref(`users/${uid}`).once("value");
  return snap.val();
}

function extractPayPalShippingAddress(paypalOrder = {}) {
  const shipping = paypalOrder.purchase_units?.[0]?.shipping;
  if (!shipping) return null;

  const address = shipping.address || {};
  return {
    fullName: shipping.name?.full_name || "",
    addressLine1: address.address_line_1 || "",
    addressLine2: address.address_line_2 || "",
    city: address.admin_area_2 || "",
    state: address.admin_area_1 || "",
    postalCode: address.postal_code || "",
    countryCode: address.country_code || "",
    source: "paypal"
  };
}

function normalizeShippingAddress(shippingInfo = {}, source = "checkout") {
  const hasAddress = ["fullName", "email", "addressLine1", "addressLine2", "city", "state", "postalCode", "countryCode"]
    .some((field) => String(shippingInfo[field] || "").trim());
  const normalized = {
    fullName: String(shippingInfo.fullName || "").trim(),
    email: String(shippingInfo.email || "").trim(),
    addressLine1: String(shippingInfo.addressLine1 || "").trim(),
    addressLine2: String(shippingInfo.addressLine2 || "").trim(),
    city: String(shippingInfo.city || "").trim(),
    state: String(shippingInfo.state || "").trim(),
    postalCode: String(shippingInfo.postalCode || "").trim(),
    countryCode: String(shippingInfo.countryCode || "US").trim(),
    source
  };

  return hasAddress ? normalized : null;
}

async function logAuditAction(action, actorUid, actorRole, targetUid, data = {}) {
  const logId = db.ref("auditLogs").push().key;
  const logEntry = {
    action,
    actorUid,
    actorRole,
    targetUid: targetUid || null,
    ...data,
    createdAt: admin.database.ServerValue.TIMESTAMP
  };
  await db.ref(`auditLogs/${logId}`).set(logEntry);
  return logId;
}

// Server-side price calculator for custom requests — authoritative
const CUSTOM_BASE_PRICE = 250;
const DEPOSIT_PERCENTAGE = 0.15;
const KNIFE_OPTION_PRICES = {
  knifeType: {
    chef: 0, paring: -50, utility: -25, boning: -30, filleting: -40, hunting: 100, bushcraft: 150, custom: 0
  },
  intendedUse: { kitchen: 0, outdoor: 50, hunting: 75, collecting: 25, general: 0 },
  bladeStyle: { straight: 0, serrated: 50, tanto: 75, drop: 50, clip: 50 },
  bladeSizeCategory: { small: -100, medium: 0, large: 100, xlarge: 250 },
  steelType: { carbon: 0, stainless: 50, damascus: 300, highcarbon: 75, nodifference: 0 },
  handleMaterial: { wood: 0, micarta: 50, g10: 60, bone: 40, horn: 75, leather: 60 },
  handleStyle: { full: 0, half: -50, hidden: 75, scaled: 50 },
  finish: { polished: 0, satin: 0, matte: 25, etched: 50 }
};

function computeServerEstimatedPrice(requestData) {
  let total = CUSTOM_BASE_PRICE;
  if (!requestData) return total;
  Object.keys(KNIFE_OPTION_PRICES).forEach((key) => {
    const val = requestData[key];
    if (val && KNIFE_OPTION_PRICES[key] && KNIFE_OPTION_PRICES[key][val] != null) {
      total += KNIFE_OPTION_PRICES[key][val];
    }
  });
  if (requestData.engravingText && String(requestData.engravingText).trim().length > 0) total += 35;
  if (requestData.sheathRequested) total += 75;
  return Math.max(total, 100);
}

async function createCustomRequestForUser(uid, authToken = {}, formData = {}, createdVia = "callable") {
  // Check if user is active
  const profile = await getUserProfile(uid);
  if (!profile || profile.status === "blocked") {
    throw new HttpsError("permission-denied", "Account is not active.");
  }

  const serverPrice = computeServerEstimatedPrice(formData);
  const serverDeposit = Number((serverPrice * DEPOSIT_PERCENTAGE).toFixed(2));

  const skipPayment = !!formData.skipPayment;

  const requestId = db.ref("customRequests").push().key;
  const requestData = {
    requestId,
    uid,
    customerEmail: profile.email || authToken.email,
    customerName: profile.displayName || authToken.name || "Valued Customer",
    ...formData,
    estimatedPrice: serverPrice,
    depositAmount: serverDeposit,
    depositRequired: skipPayment ? 0 : serverDeposit,
    status: skipPayment ? "unpaid_unverified" : "pending_payment",
    createdAt: admin.database.ServerValue.TIMESTAMP,
    createdVia,
    notes: `Request created via server function. Skip deposit: ${skipPayment}`
  };

  await db.ref(`customRequests/${requestId}`).set(requestData);

  await logAuditAction("custom_request_created_callable", uid, profile.role || "customer", uid, {
    requestId,
    serverEstimatedPrice: serverPrice,
    serverDepositAmount: serverDeposit,
    skipPayment
  });

  if (skipPayment) {
    try {
      await sendEmail(BUSINESS_EMAIL, "customRequestSubmitted", requestData.customerName, requestId, serverPrice);
      await sendEmail(requestData.customerEmail, "customRequestSubmitted", requestData.customerName, requestId, serverPrice);
    } catch (err) {
      console.warn("Failed to send low-priority custom request email:", err.message);
    }
  }

  return { requestId, estimatedPrice: serverPrice, depositAmount: serverDeposit };
}

exports.createCustomRequest = onCall({ invoker: "public", cors: true }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "User must be signed in.");

  return createCustomRequestForUser(
    request.auth.uid,
    request.auth.token || {},
    request.data || {},
    "callable"
  );
});

exports.createCustomRequestHttp = onRequest(async (req, res) => {
  applyCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).send("");
  if (req.method !== "POST") return res.status(405).json({ error: "method-not-allowed" });

  try {
    const authToken = await requireAuthFromRequest(req);
    const result = await createCustomRequestForUser(
      authToken.uid,
      authToken,
      req.body || {},
      "http"
    );
    return res.status(200).json(result);
  } catch (error) {
    const code = error?.code || "internal";
    const message = error?.message || "Failed to create custom request.";
    const status = code === "unauthenticated" ? 401 : code === "permission-denied" ? 403 : 400;
    return res.status(status).json({ error: code, message });
  }
});

// Database trigger: when a custom request is created, recompute price server-side,
// correct depositRequired if needed, and write an audit entry for forensic trace.
exports.onCustomRequestCreated = functionsLib.database.ref('customRequests/{requestId}').onCreate(async (snap, context) => {
  try {
    const request = snap.val() || {};
    const requestId = context.params.requestId;
    const serverPrice = computeServerEstimatedPrice(request);
    const serverDeposit = Number((serverPrice * DEPOSIT_PERCENTAGE).toFixed(2));

    const updates = {
      serverEstimatedPrice: serverPrice,
      serverDepositAmount: serverDeposit,
      serverComputedAt: admin.database.ServerValue.TIMESTAMP
    };

    let discrepancy = false;
    const clientPrice = Number(request.estimatedPrice || 0);
    if (!clientPrice || Math.abs(clientPrice - serverPrice) > 0.5) {
      updates.priceDiscrepancy = true;
      discrepancy = true;
      // Flag for staff review if client claimed a lower price or mismatch
      updates.status = request.status === 'pending_payment' ? 'needs_review' : request.status || 'pending_review';
    }

    // Ensure depositRequired is authoritative. Low-priority skipped requests owe no up-front deposit.
    const expectedDepositRequired = request.skipPayment ? 0 : serverDeposit;
    if (request.depositRequired == null || Number(request.depositRequired) !== expectedDepositRequired) {
      updates.depositRequired = expectedDepositRequired;
      updates.depositCorrected = true;
    }

    await db.ref(`customRequests/${requestId}`).update(updates);

    await logAuditAction('custom_request_created', request.uid || 'unknown', 'customer', request.uid || null, {
      requestId,
      clientEstimatedPrice: clientPrice,
      serverEstimatedPrice: serverPrice,
      serverDepositAmount: serverDeposit,
      discrepancy
    });

    // Direct database writes still get a business notification here. Server-created
    // requests send their notifications in createCustomRequest to avoid doubles.
    if (!request.createdVia) {
      try {
        await sendEmail(BUSINESS_EMAIL, 'customRequestSubmitted', request.customerName || 'Customer', requestId, serverPrice);
      } catch (emailErr) {
        console.warn('Business notification failed for custom request:', emailErr);
      }
    }
  } catch (err) {
    console.error('onCustomRequestCreated error:', err);
  }
});

async function finalizePurchase(orderId, order, patch = {}, audit = {}) {
  const knifeId = order.knifeId;
  const customerUid = order.uid;

  await Promise.all([
    db.ref(`orders/${orderId}`).update({
      status: "paid",
      paidAt: patch.paidAt || admin.database.ServerValue.TIMESTAMP,
      updatedAt: admin.database.ServerValue.TIMESTAMP,
      ...patch.order
    }),
    db.ref(`Products/${knifeId}`).update({
      sold: true,
      saleStatus: "sold",
      soldAt: admin.database.ServerValue.TIMESTAMP,
      reservedByOrderId: null,
      reservationExpiresAt: null
    }),
    db.ref(`conversations/${orderId}`).update({
      conversationId: orderId,
      orderId,
      knifeId,
      customerUid,
      status: "open",
      updatedAt: admin.database.ServerValue.TIMESTAMP,
      ...patch.conversation
    })
  ]);

  await logAuditAction("purchase_completed", audit.actorUid || "system", audit.actorRole || "system", customerUid, {
    orderId,
    knifeId,
    amount: order.amount,
    paypalOrderId: audit.paypalOrderId || null,
    captureId: audit.captureId || null,
    source: audit.source || "checkout",
    ...audit.data
  });

  try {
    const [customerProfile, knife] = await Promise.all([
      getUserProfile(customerUid),
      getKnifeById(knifeId)
    ]);
    const customerName = customerProfile?.displayName || customerProfile?.email || "Customer";
    const knifeName = knife?.name || "Knife";

    if (customerProfile?.email) {
      await sendEmail(customerProfile.email, "knifePurchasedCustomer", customerName, orderId, knifeName, order.amount);
    }
    await sendEmail(BUSINESS_EMAIL, "knifePurchasedBusiness", customerName, orderId, knifeName, order.amount);
  } catch (emailError) {
    console.warn("Purchase notification email failed:", emailError.message);
  }
}

async function ensureConversation(orderId, order) {
  const conversationRef = db.ref(`conversations/${orderId}`);
  const conversationSnap = await conversationRef.once("value");

  if (conversationSnap.exists()) {
    return conversationSnap.val();
  }

  const conversation = {
    conversationId: orderId,
    orderId,
    knifeId: order.knifeId,
    customerUid: order.uid,
    status: "open",
    createdAt: admin.database.ServerValue.TIMESTAMP,
    updatedAt: admin.database.ServerValue.TIMESTAMP,
    lastMessageAt: null,
    staffUnreadCount: 0
  };

  await conversationRef.set(conversation);
  return conversation;
}

function orderAllowsMessaging(order = {}) {
  return ["paid", "approved"].includes(order.status);
}

function customRequestAllowsCustomerMessaging(customRequest = {}) {
  return !!customRequest.chatEnabled || [
    "priority_review",
    "quote_sent",
    "pending_acceptance",
    "quote_accepted",
    "in_production",
    "completed"
  ].includes(customRequest.status);
}

function customRequestAllowsStaffMessaging(customRequest = {}) {
  return customRequestAllowsCustomerMessaging(customRequest) || !["unpaid_unverified", "pending_payment"].includes(customRequest.status);
}

async function getCustomerConversationSubject(conversationId, uid) {
  const userOrderSnap = await db.ref(`userOrders/${uid}/${conversationId}`).once("value");
  if (userOrderSnap.exists()) {
    const orderSnap = await db.ref(`orders/${conversationId}`).once("value");
    if (!orderSnap.exists() || !orderAllowsMessaging(orderSnap.val())) {
      throw new HttpsError("failed-precondition", "Can only message about paid or approved orders.");
    }
    return { type: "order", record: orderSnap.val() };
  }

  const requestSnap = await db.ref(`customRequests/${conversationId}`).once("value");
  if (requestSnap.exists()) {
    const customRequest = requestSnap.val();
    if (customRequest.uid !== uid) {
      throw new HttpsError("permission-denied", "You don't have access to this conversation.");
    }
    if (!customRequestAllowsCustomerMessaging(customRequest)) {
      throw new HttpsError("failed-precondition", "Chat opens after the request is prioritized or approved by Nolan.");
    }
    return { type: "customRequest", record: { ...customRequest, knifeId: customRequest.knifeId || null } };
  }

  throw new HttpsError("permission-denied", "You don't have access to this conversation.");
}

async function getStaffConversationSubject(conversationId) {
  const orderSnap = await db.ref(`orders/${conversationId}`).once("value");
  if (orderSnap.exists()) {
    if (!orderAllowsMessaging(orderSnap.val())) {
      throw new HttpsError("failed-precondition", "Can only message about paid or approved orders.");
    }
    return { type: "order", record: orderSnap.val() };
  }

  const requestSnap = await db.ref(`customRequests/${conversationId}`).once("value");
  if (requestSnap.exists()) {
    const customRequest = requestSnap.val();
    if (!customRequestAllowsStaffMessaging(customRequest)) {
      throw new HttpsError("failed-precondition", "Approve or prioritize the request before starting chat.");
    }
    return { type: "customRequest", record: { ...customRequest, knifeId: customRequest.knifeId || null } };
  }

  throw new HttpsError("not-found", "Conversation subject not found.");
}

async function getKnifeById(knifeId) {
  const knifeSnap = await db.ref(`Products/${knifeId}`).once("value");
  return knifeSnap.exists() ? knifeSnap.val() : null;
}

// ============================================================================
// CHECKOUT & PAYMENT FUNCTIONS
// ============================================================================

exports.startKnifeCheckout = onCall({ invoker: "public" }, async (request) => {
  const { auth: authContext } = request;
  if (!authContext) throw new HttpsError("unauthenticated", "User must be signed in.");

  const uid = authContext.uid;
  const { knifeId } = request.data;

  if (!knifeId) throw new HttpsError("invalid-argument", "knifeId is required.");

  // Check if user is active
  const profile = await getUserProfile(uid);
  if (!profile || profile.status === "blocked") {
    throw new HttpsError("permission-denied", "Account is not active.");
  }

  // Get knife details
  const knifeSnap = await db.ref(`Products/${knifeId}`).once("value");
  if (!knifeSnap.exists()) {
    throw new HttpsError("not-found", "Knife not found.");
  }

  const knife = knifeSnap.val();
    if (knife.sold) {
    throw new HttpsError("failed-precondition", "Knife has already been sold.");
  }

  if (knife.displayLocation === "gallery") {
    throw new HttpsError("failed-precondition", "Knife is not available for checkout.");
  }

  // Create pending order
  const orderId = db.ref("orders").push().key;
  const order = {
    orderId,
    uid,
    knifeId,
    status: "pending",
    fulfillmentStatus: "unfulfilled",
    amount: knife.price,
    currency: "USD",
    createdAt: admin.database.ServerValue.TIMESTAMP,
    updatedAt: admin.database.ServerValue.TIMESTAMP
  };

  await Promise.all([
    db.ref(`orders/${orderId}`).set(order),
    db.ref(`userOrders/${uid}/${orderId}`).set(true)
  ]);

  await logAuditAction("checkout_started", uid, profile.role || "customer", uid, {
    orderId,
    knifeId,
    amount: knife.price
  });

  return {
    orderId,
    knifeId,
    price: knife.price,
    currency: "USD"
  };
});

exports.createPayPalOrder = onCall({ invoker: "public" }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "User must be signed in.");

  const uid = request.auth.uid;
  const { knifeId, orderId, amount, shippingInfo } = request.data;

  if (!orderId || !knifeId || !amount) {
    throw new HttpsError("invalid-argument", "Missing required parameters.");
  }

  // Verify order ownership
  const orderSnap = await db.ref(`orders/${orderId}`).once("value");
  if (!orderSnap.exists()) {
    throw new HttpsError("not-found", "Order not found.");
  }

  const order = orderSnap.val();
  if (order.uid !== uid) {
    throw new HttpsError("permission-denied", "You don't own this order.");
  }

  // Get PayPal credentials from Secret Manager
  const paypalClientId = process.env.PAYPAL_CLIENT_ID;
  const paypalClientSecret = process.env.PAYPAL_CLIENT_SECRET;
  const paypalEnvironment = process.env.PAYPAL_ENVIRONMENT || "sandbox";

  if (!paypalClientId || !paypalClientSecret) {
    throw new HttpsError("internal", "PayPal credentials not configured.");
  }

  const baseUrl =
    paypalEnvironment === "production"
      ? "https://api.paypal.com"
      : "https://api.sandbox.paypal.com";

  try {
    // Create PayPal order
    const paypalResponse = await axios.post(
      `${baseUrl}/v2/checkout/orders`,
      {
        intent: "CAPTURE",
        purchase_units: [
          {
            reference_id: orderId,
            amount: {
              currency_code: "USD",
              value: amount.toString()
            },
            custom_id: orderId
          }
        ]
      },
      {
        auth: {
          username: paypalClientId,
          password: paypalClientSecret
        }
      }
    );

    const paypalOrderId = paypalResponse.data.id;

    // Save PayPal order ID with our order
    const checkoutShippingAddress = normalizeShippingAddress(shippingInfo, "checkout");
    await db.ref(`orders/${orderId}`).update({
      "paypal/orderId": paypalOrderId,
      ...(checkoutShippingAddress ? { shippingAddress: checkoutShippingAddress } : {}),
      updatedAt: admin.database.ServerValue.TIMESTAMP
    });

    await logAuditAction("paypal_order_created", uid, "customer", uid, {
      orderId,
      knifeId,
      paypalOrderId,
      amount
    });

    return { paypalOrderId };
  } catch (error) {
    console.error("PayPal API error:", error.response?.data || error.message);
    throw new HttpsError("internal", "Failed to create PayPal order.");
  }
});

exports.capturePayPalOrder = onCall({ invoker: "public" }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "User must be signed in.");

  const uid = request.auth.uid;
  const { paypalOrderId, orderId, knifeId } = request.data;

  if (!paypalOrderId || !orderId) {
    throw new HttpsError("invalid-argument", "Missing required parameters.");
  }

  // Verify order ownership
  const orderSnap = await db.ref(`orders/${orderId}`).once("value");
  if (!orderSnap.exists()) {
    throw new HttpsError("not-found", "Order not found.");
  }

  const order = orderSnap.val();
  if (order.uid !== uid) {
    throw new HttpsError("permission-denied", "You don't own this order.");
  }

  const paypalClientId = process.env.PAYPAL_CLIENT_ID;
  const paypalClientSecret = process.env.PAYPAL_CLIENT_SECRET;
  const paypalEnvironment = process.env.PAYPAL_ENVIRONMENT || "sandbox";

  const baseUrl =
    paypalEnvironment === "production"
      ? "https://api.paypal.com"
      : "https://api.sandbox.paypal.com";

  try {
    // Capture PayPal order
    const captureResponse = await axios.post(
      `${baseUrl}/v2/checkout/orders/${paypalOrderId}/capture`,
      {},
      {
        auth: {
          username: paypalClientId,
          password: paypalClientSecret
        }
      }
    );

    if (captureResponse.data.status === "COMPLETED") {
      const paypalShippingAddress = extractPayPalShippingAddress(captureResponse.data);
      await finalizePurchase(
        orderId,
        order,
        {
          order: {
            "paypal/orderId": paypalOrderId,
            "paypal/captureId": captureResponse.data.id || null,
            "paypal/payerId": captureResponse.data.payer?.payer_id || null,
            "paypal/payerEmail": captureResponse.data.payer?.email_address || null,
            "paypal/status": captureResponse.data.status,
            ...(paypalShippingAddress ? { shippingAddress: paypalShippingAddress } : {})
          }
        },
        {
          actorUid: uid,
          actorRole: "customer",
          source: "checkout-capture",
          paypalOrderId,
          captureId: captureResponse.data.id,
          data: { amount: order.amount }
        }
      );

      return { success: true };
    } else {
      throw new Error("PayPal capture not completed");
    }
  } catch (error) {
    console.error("PayPal capture error:", error.response?.data || error.message);
    throw new HttpsError("internal", "Failed to capture PayPal order.");
  }
});

exports.getMyPurchases = onCall({ invoker: "public" }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "User must be signed in.");

  const uid = request.auth.uid;
  const userOrdersSnap = await db.ref(`userOrders/${uid}`).once("value");
  const linkedOrderIds = userOrdersSnap.exists() ? Object.keys(userOrdersSnap.val()) : [];
  const userCustomRequestsSnap = await db.ref(`userCustomRequests/${uid}`).once("value");
  const linkedRequestIds = userCustomRequestsSnap.exists() ? Object.keys(userCustomRequestsSnap.val()) : [];

  const ordersSnap = await db.ref("orders").once("value");
  const allOrders = ordersSnap.exists() ? Object.entries(ordersSnap.val()).map(([orderId, value]) => ({ orderId, ...value })) : [];
  const customRequestsSnap = await db.ref("customRequests").once("value");
  const allCustomRequests = customRequestsSnap.exists()
    ? Object.entries(customRequestsSnap.val()).map(([requestId, value]) => ({ requestId, ...value }))
    : [];

  const ownOrders = allOrders.filter((order) => order.uid === uid);
  const orderIds = [...new Set([...linkedOrderIds, ...ownOrders.map((order) => order.orderId)])];
  const ownCustomRequests = allCustomRequests.filter((customRequest) => customRequest.uid === uid);
  const requestIds = [...new Set([...linkedRequestIds, ...ownCustomRequests.map((customRequest) => customRequest.requestId)])];

  const purchases = [];
  for (const orderId of orderIds) {
    const order = allOrders.find((item) => item.orderId === orderId) || null;
    if (!order || order.uid !== uid) continue;

    const knife = await getKnifeById(order.knifeId);
    if (!knife) continue;

    purchases.push({
      orderId,
      order,
      knife
    });

    if (!linkedOrderIds.includes(orderId)) {
      await db.ref(`userOrders/${uid}/${orderId}`).set(true);
    }
  }

  const customRequests = [];
  for (const requestId of requestIds) {
    const customRequest = allCustomRequests.find((item) => item.requestId === requestId) || null;
    if (!customRequest || customRequest.uid !== uid) continue;

    customRequests.push({
      requestId,
      request: customRequest
    });

    if (!linkedRequestIds.includes(requestId)) {
      await db.ref(`userCustomRequests/${uid}/${requestId}`).set(true);
    }
  }

  purchases.sort((a, b) => (b.order.createdAt || 0) - (a.order.createdAt || 0));
  customRequests.sort((a, b) => (b.request.createdAt || 0) - (a.request.createdAt || 0));

  return { purchases, customRequests };
});

// HTTP fallback endpoints for checkout flow.
// These are used when callable endpoints are blocked by gateway CORS/permission behavior.
exports.startKnifeCheckoutHttp = onRequest(async (req, res) => {
  applyCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).send("");
  if (req.method !== "POST") return res.status(405).json({ error: "method-not-allowed" });

  try {
    const uid = await requireUidFromRequest(req);
    const { knifeId } = req.body || {};

    if (!knifeId) throw new HttpsError("invalid-argument", "knifeId is required.");

    const profile = await getUserProfile(uid);
    if (!profile || profile.status === "blocked") {
      throw new HttpsError("permission-denied", "Account is not active.");
    }

    const knifeSnap = await db.ref(`Products/${knifeId}`).once("value");
    if (!knifeSnap.exists()) throw new HttpsError("not-found", "Knife not found.");

    const knife = knifeSnap.val();
    if (knife.sold) throw new HttpsError("failed-precondition", "Knife has already been sold.");

    if (knife.displayLocation === "gallery") {
      throw new HttpsError("failed-precondition", "Knife is not available for checkout.");
    }

    const orderId = db.ref("orders").push().key;
    const order = {
      orderId,
      uid,
      knifeId,
      status: "pending",
      fulfillmentStatus: "unfulfilled",
      amount: knife.price,
      currency: "USD",
      createdAt: admin.database.ServerValue.TIMESTAMP,
      updatedAt: admin.database.ServerValue.TIMESTAMP
    };

    await Promise.all([
      db.ref(`orders/${orderId}`).set(order),
      db.ref(`userOrders/${uid}/${orderId}`).set(true)
    ]);

    return res.status(200).json({ orderId, knifeId, price: knife.price, currency: "USD" });
  } catch (error) {
    const code = error?.code || "internal";
    const message = error?.message || "Failed to start checkout.";
    return res.status(code === "unauthenticated" ? 401 : 400).json({ error: code, message });
  }
});

exports.createPayPalOrderHttp = onRequest(async (req, res) => {
  applyCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).send("");
  if (req.method !== "POST") return res.status(405).json({ error: "method-not-allowed" });

  try {
    const uid = await requireUidFromRequest(req);
    const { knifeId, orderId, amount, shippingInfo } = req.body || {};

    if (!orderId || !knifeId || !amount) {
      throw new HttpsError("invalid-argument", "Missing required parameters.");
    }

    const orderSnap = await db.ref(`orders/${orderId}`).once("value");
    if (!orderSnap.exists()) throw new HttpsError("not-found", "Order not found.");

    const order = orderSnap.val();
    if (order.uid !== uid) throw new HttpsError("permission-denied", "You don't own this order.");

    const paypalClientId = process.env.PAYPAL_CLIENT_ID;
    const paypalClientSecret = process.env.PAYPAL_CLIENT_SECRET;
    const paypalEnvironment = process.env.PAYPAL_ENVIRONMENT || "sandbox";
    if (!paypalClientId || !paypalClientSecret) {
      throw new HttpsError("internal", "PayPal credentials not configured.");
    }

    const baseUrl = paypalEnvironment === "production"
      ? "https://api.paypal.com"
      : "https://api.sandbox.paypal.com";

    const paypalResponse = await axios.post(
      `${baseUrl}/v2/checkout/orders`,
      {
        intent: "CAPTURE",
        purchase_units: [{
          reference_id: orderId,
          amount: { currency_code: "USD", value: amount.toString() },
          custom_id: orderId
        }]
      },
      { auth: { username: paypalClientId, password: paypalClientSecret } }
    );

    const paypalOrderId = paypalResponse.data.id;
    const checkoutShippingAddress = normalizeShippingAddress(shippingInfo, "checkout");
    await db.ref(`orders/${orderId}`).update({
      "paypal/orderId": paypalOrderId,
      ...(checkoutShippingAddress ? { shippingAddress: checkoutShippingAddress } : {}),
      updatedAt: admin.database.ServerValue.TIMESTAMP
    });

    await logAuditAction("paypal_order_created", uid, "customer", uid, {
      orderId,
      knifeId,
      paypalOrderId,
      amount
    });

    return res.status(200).json({ paypalOrderId });
  } catch (error) {
    const message = error?.message || "Failed to create PayPal order.";
    return res.status(400).json({ error: "internal", message });
  }
});

exports.capturePayPalOrderHttp = onRequest(async (req, res) => {
  applyCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).send("");
  if (req.method !== "POST") return res.status(405).json({ error: "method-not-allowed" });

  try {
    const uid = await requireUidFromRequest(req);
    const { paypalOrderId, orderId } = req.body || {};
    if (!paypalOrderId || !orderId) {
      throw new HttpsError("invalid-argument", "Missing required parameters.");
    }

    const orderSnap = await db.ref(`orders/${orderId}`).once("value");
    if (!orderSnap.exists()) throw new HttpsError("not-found", "Order not found.");

    const order = orderSnap.val();
    if (order.uid !== uid) throw new HttpsError("permission-denied", "You don't own this order.");

    const paypalClientId = process.env.PAYPAL_CLIENT_ID;
    const paypalClientSecret = process.env.PAYPAL_CLIENT_SECRET;
    const paypalEnvironment = process.env.PAYPAL_ENVIRONMENT || "sandbox";
    const baseUrl = paypalEnvironment === "production"
      ? "https://api.paypal.com"
      : "https://api.sandbox.paypal.com";

    const captureResponse = await axios.post(
      `${baseUrl}/v2/checkout/orders/${paypalOrderId}/capture`,
      {},
      { auth: { username: paypalClientId, password: paypalClientSecret } }
    );

    if (captureResponse.data.status === "COMPLETED") {
      const paypalShippingAddress = extractPayPalShippingAddress(captureResponse.data);
      await finalizePurchase(
        orderId,
        order,
        {
          order: {
            "paypal/orderId": paypalOrderId,
            "paypal/captureId": captureResponse.data.id || null,
            "paypal/payerId": captureResponse.data.payer?.payer_id || null,
            "paypal/payerEmail": captureResponse.data.payer?.email_address || null,
            "paypal/status": captureResponse.data.status,
            ...(paypalShippingAddress ? { shippingAddress: paypalShippingAddress } : {})
          }
        },
        {
          actorUid: uid,
          actorRole: "customer",
          source: "checkout-capture-http",
          paypalOrderId,
          captureId: captureResponse.data.id,
          data: { amount: order.amount }
        }
      );
      return res.status(200).json({ success: true });
    }

    return res.status(400).json({ error: "internal", message: "PayPal capture not completed." });
  } catch (error) {
    const message = error?.message || "Failed to capture PayPal order.";
    return res.status(400).json({ error: "internal", message });
  }
});

exports.createCustomRequestDepositPayPalOrderHttp = onRequest(async (req, res) => {
  applyCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).send("");
  if (req.method !== "POST") return res.status(405).json({ error: "method-not-allowed" });

  try {
    const uid = await requireUidFromRequest(req);
    const { requestId } = req.body || {};
    if (!requestId) throw new HttpsError("invalid-argument", "requestId is required.");

    const requestSnap = await db.ref(`customRequests/${requestId}`).once("value");
    if (!requestSnap.exists()) throw new HttpsError("not-found", "Custom request not found.");

    const customRequest = requestSnap.val();
    if (customRequest.uid !== uid) throw new HttpsError("permission-denied", "You don't own this request.");
    if (hasPaidCustomRequestDeposit(customRequest)) {
      return res.status(200).json({ alreadyPaid: true });
    }

    const amount = getCustomRequestDepositAmount(customRequest, customRequest.finalPrice);
    if (!amount || amount <= 0) {
      throw new HttpsError("failed-precondition", "This request does not require an up-front deposit.");
    }

    const paypalClientId = process.env.PAYPAL_CLIENT_ID;
    const paypalClientSecret = process.env.PAYPAL_CLIENT_SECRET;
    const paypalEnvironment = process.env.PAYPAL_ENVIRONMENT || "sandbox";
    if (!paypalClientId || !paypalClientSecret) {
      throw new HttpsError("internal", "PayPal credentials not configured.");
    }

    const baseUrl = paypalEnvironment === "production"
      ? "https://api.paypal.com"
      : "https://api.sandbox.paypal.com";

    const paypalResponse = await axios.post(
      `${baseUrl}/v2/checkout/orders`,
      {
        intent: "CAPTURE",
        purchase_units: [{
          reference_id: requestId,
          amount: { currency_code: "USD", value: amount.toFixed(2) },
          custom_id: `custom_request:${requestId}`,
          description: "15% custom knife request priority deposit"
        }]
      },
      { auth: { username: paypalClientId, password: paypalClientSecret } }
    );

    const paypalOrderId = paypalResponse.data.id;
    await db.ref(`customRequests/${requestId}`).update({
      "depositPayPal/orderId": paypalOrderId,
      "depositPayPal/status": paypalResponse.data.status || "CREATED",
      updatedAt: admin.database.ServerValue.TIMESTAMP
    });

    await logAuditAction("custom_request_deposit_paypal_created", uid, "customer", uid, {
      requestId,
      paypalOrderId,
      amount
    });

    return res.status(200).json({ paypalOrderId, amount });
  } catch (error) {
    const code = error?.code || "internal";
    const message = error?.message || "Failed to create custom request deposit payment.";
    return res.status(code === "unauthenticated" ? 401 : 400).json({ error: code, message });
  }
});

exports.captureCustomRequestDepositPayPalOrderHttp = onRequest(async (req, res) => {
  applyCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).send("");
  if (req.method !== "POST") return res.status(405).json({ error: "method-not-allowed" });

  try {
    const uid = await requireUidFromRequest(req);
    const { requestId, paypalOrderId } = req.body || {};
    if (!requestId || !paypalOrderId) {
      throw new HttpsError("invalid-argument", "requestId and paypalOrderId are required.");
    }

    const requestSnap = await db.ref(`customRequests/${requestId}`).once("value");
    if (!requestSnap.exists()) throw new HttpsError("not-found", "Custom request not found.");

    const customRequest = requestSnap.val();
    if (customRequest.uid !== uid) throw new HttpsError("permission-denied", "You don't own this request.");

    const amount = getCustomRequestDepositAmount(customRequest, customRequest.finalPrice);
    const paypalClientId = process.env.PAYPAL_CLIENT_ID;
    const paypalClientSecret = process.env.PAYPAL_CLIENT_SECRET;
    const paypalEnvironment = process.env.PAYPAL_ENVIRONMENT || "sandbox";
    const baseUrl = paypalEnvironment === "production"
      ? "https://api.paypal.com"
      : "https://api.sandbox.paypal.com";

    const captureResponse = await axios.post(
      `${baseUrl}/v2/checkout/orders/${paypalOrderId}/capture`,
      {},
      { auth: { username: paypalClientId, password: paypalClientSecret } }
    );

    if (captureResponse.data.status !== "COMPLETED") {
      return res.status(400).json({ error: "internal", message: "PayPal capture not completed." });
    }

    const updates = {
      status: "priority_review",
      priority: true,
      chatEnabled: true,
      priorityDepositPaid: true,
      paymentStatus: "paid",
      depositPaidAt: admin.database.ServerValue.TIMESTAMP,
      updatedAt: admin.database.ServerValue.TIMESTAMP,
      "depositPayPal/orderId": paypalOrderId,
      "depositPayPal/captureId": captureResponse.data.id || null,
      "depositPayPal/payerId": captureResponse.data.payer?.payer_id || null,
      "depositPayPal/payerEmail": captureResponse.data.payer?.email_address || null,
      "depositPayPal/status": captureResponse.data.status
    };

    await Promise.all([
      db.ref(`customRequests/${requestId}`).update(updates),
      db.ref(`userCustomRequests/${uid}/${requestId}`).set(true),
      db.ref(`conversations/${requestId}`).update({
        conversationId: requestId,
        customRequestId: requestId,
        customerUid: uid,
        conversationType: "customRequest",
        status: "open",
        createdAt: customRequest.createdAt || admin.database.ServerValue.TIMESTAMP,
        updatedAt: admin.database.ServerValue.TIMESTAMP,
        lastMessageAt: null,
        staffUnreadCount: 0,
        unreadByCustomer: 0
      })
    ]);

    await logAuditAction("custom_request_priority_deposit_paid", uid, "customer", uid, {
      requestId,
      paypalOrderId,
      captureId: captureResponse.data.id || null,
      amount
    });

    try {
      await sendEmail(
        customRequest.customerEmail,
        "customRequestPriorityPaid",
        customRequest.customerName || "Customer",
        requestId,
        Number(customRequest.estimatedPrice || 0),
        amount
      );
      await sendEmail(
        BUSINESS_EMAIL,
        "customRequestPriorityPaidBusiness",
        customRequest.customerName || "Customer",
        requestId,
        Number(customRequest.estimatedPrice || 0),
        amount
      );
    } catch (emailError) {
      console.warn("Custom request priority email failed:", emailError.message);
    }

    return res.status(200).json({ success: true, requestId, amount });
  } catch (error) {
    const code = error?.code || "internal";
    const message = error?.message || "Failed to capture custom request deposit.";
    return res.status(code === "unauthenticated" ? 401 : 400).json({ error: code, message });
  }
});

exports.paypalWebhook = onRequest(async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).send("Method not allowed");
  }

  try {
    const event = req.body;
    const eventId = event.id;
    const eventType = event.event_type;

    // Check if already processed
    const processedSnap = await db.ref(`processedPayPalEvents/${eventId}`).once("value");
    if (processedSnap.exists()) {
      return res.status(200).send("Event already processed");
    }

    if (eventType === "CHECKOUT.ORDER.COMPLETED") {
      const orderId = event.resource.supplementary_data?.custom_id;
      if (!orderId) {
        return res.status(400).send("No order ID in webhook");
      }

      const orderSnap = await db.ref(`orders/${orderId}`).once("value");
      if (!orderSnap.exists()) {
        return res.status(404).send("Order not found");
      }

      const order = orderSnap.val();

      // Mark order as paid
      await finalizePurchase(
        orderId,
        order,
        {
          order: {
            "paypal/orderId": event.resource.id || null,
            "paypal/captureId": event.resource.purchase_units?.[0]?.payments?.captures?.[0]?.id,
            "paypal/payerId": event.resource.payer?.payer_info?.payer_id,
            "paypal/payerEmail": event.resource.payer?.email_address,
            "paypal/status": "COMPLETED",
            paidAt: admin.database.ServerValue.TIMESTAMP
          },
          conversation: {
            createdAt: admin.database.ServerValue.TIMESTAMP,
            lastMessageAt: null
          }
        },
        {
          actorUid: "paypal-webhook",
          actorRole: "system",
          source: "paypal-webhook",
          paypalOrderId: event.resource.id,
          captureId: event.resource.purchase_units?.[0]?.payments?.captures?.[0]?.id,
          data: { amount: order.amount, eventType }
        }
      );

      // Mark event as processed
      await db.ref(`processedPayPalEvents/${eventId}`).set(true);
    }

    res.status(200).send("OK");
  } catch (error) {
    console.error("Webhook error:", error);
    res.status(500).send("Internal server error");
  }
});

// ============================================================================
// CHAT FUNCTIONS
// ============================================================================

exports.sendChatMessage = onCall({ invoker: "public" }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "User must be signed in.");

  const uid = request.auth.uid;
  const { orderId, text } = request.data;

  if (!orderId || !text) {
    throw new HttpsError("invalid-argument", "orderId and text are required.");
  }

  // Validate text length
  if (text.length > 1000) {
    throw new HttpsError("invalid-argument", "Message too long (max 1000 characters).");
  }

  if (text.trim().length === 0) {
    throw new HttpsError("invalid-argument", "Message cannot be empty.");
  }

  // Check user profile
  const profile = await getUserProfile(uid);
  if (!profile || profile.status === "blocked") {
    throw new HttpsError("permission-denied", "Account is not active.");
  }

  const subject = await getCustomerConversationSubject(orderId, uid);
  await ensureConversation(orderId, subject.record);

  // Create message
  const messageId = db.ref("messages").push().key;
  const message = {
    messageId,
    senderUid: uid,
    senderRole: profile.role || "customer",
    text: text.trim(),
    createdAt: admin.database.ServerValue.TIMESTAMP,
    readByCustomer: true,
    readByStaff: false
  };

  // Update conversation and add message
  await Promise.all([
    db.ref(`messages/${orderId}/${messageId}`).set(message),
    db.ref(`conversations/${orderId}`).update({
      lastMessageAt: admin.database.ServerValue.TIMESTAMP,
      lastCustomerMessageAt: admin.database.ServerValue.TIMESTAMP,
      lastMessageSenderRole: message.senderRole,
      staffUnreadSince: admin.database.ServerValue.TIMESTAMP,
      staffUnreadReminderSentAt: null,
      staffUnreadCount: admin.database.ServerValue.increment(1)
    })
  ]);

  return { messageId, success: true };
});

exports.sendChatMessageHttp = onRequest(async (req, res) => {
  applyCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).send("");
  if (req.method !== "POST") return res.status(405).json({ error: "method-not-allowed" });

  try {
    const uid = await requireUidFromRequest(req);
    const { orderId, text } = req.body || {};

    if (!orderId || !text) {
      throw new HttpsError("invalid-argument", "orderId and text are required.");
    }

    if (text.length > 1000) {
      throw new HttpsError("invalid-argument", "Message too long (max 1000 characters).");
    }

    if (text.trim().length === 0) {
      throw new HttpsError("invalid-argument", "Message cannot be empty.");
    }

    const profile = await getUserProfile(uid);
    if (!profile || profile.status === "blocked") {
      throw new HttpsError("permission-denied", "Account is not active.");
    }

    const subject = await getCustomerConversationSubject(orderId, uid);
    await ensureConversation(orderId, subject.record);

    const messageId = db.ref("messages").push().key;
    const message = {
      messageId,
      senderUid: uid,
      senderRole: profile.role || "customer",
      text: text.trim(),
      createdAt: admin.database.ServerValue.TIMESTAMP,
      readByCustomer: true,
      readByStaff: false
    };

    await Promise.all([
      db.ref(`messages/${orderId}/${messageId}`).set(message),
      db.ref(`conversations/${orderId}`).update({
        lastMessageAt: admin.database.ServerValue.TIMESTAMP,
        lastCustomerMessageAt: admin.database.ServerValue.TIMESTAMP,
        lastMessageSenderRole: message.senderRole,
        staffUnreadSince: admin.database.ServerValue.TIMESTAMP,
        staffUnreadReminderSentAt: null,
        staffUnreadCount: admin.database.ServerValue.increment(1)
      })
    ]);

    return res.status(200).json({ messageId, success: true });
  } catch (error) {
    const code = error?.code || "internal";
    const message = error?.message || "Failed to send message.";
    return res.status(code === "unauthenticated" ? 401 : 400).json({ error: code, message });
  }
});

exports.sendStaffMessage = onCall({ invoker: "public" }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "User must be signed in.");

  const uid = request.auth.uid;
  const { orderId, text } = request.data;

  if (!orderId || !text) {
    throw new HttpsError("invalid-argument", "orderId and text are required.");
  }

  if (text.trim().length === 0) {
    throw new HttpsError("invalid-argument", "Message cannot be empty.");
  }

  const isStaff = await verifyUserRole(uid, "business");
  if (!isStaff) {
    throw new HttpsError("permission-denied", "Only staff can reply in this conversation.");
  }

  const profile = await getUserProfile(uid);
  const subject = await getStaffConversationSubject(orderId);
  await ensureConversation(orderId, subject.record);

  const messageId = db.ref("messages").push().key;
  const message = {
    messageId,
    senderUid: uid,
    senderRole: profile?.role || "business",
    text: text.trim(),
    createdAt: admin.database.ServerValue.TIMESTAMP,
    readByCustomer: false,
    readByStaff: true
  };

  await Promise.all([
    db.ref(`messages/${orderId}/${messageId}`).set(message),
    db.ref(`conversations/${orderId}`).update({
      lastMessageAt: admin.database.ServerValue.TIMESTAMP,
      lastStaffMessageAt: admin.database.ServerValue.TIMESTAMP,
      lastMessageSenderRole: message.senderRole,
      customerUnreadSince: admin.database.ServerValue.TIMESTAMP,
      customerUnreadReminderSentAt: null,
      unreadByCustomer: admin.database.ServerValue.increment(1),
      updatedAt: admin.database.ServerValue.TIMESTAMP
    })
  ]);

  return { messageId, success: true };
});

exports.sendStaffMessageHttp = onRequest(async (req, res) => {
  applyCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).send("");
  if (req.method !== "POST") return res.status(405).json({ error: "method-not-allowed" });

  try {
    const uid = await requireUidFromRequest(req);
    const { orderId, text } = req.body || {};

    if (!orderId || !text) {
      throw new HttpsError("invalid-argument", "orderId and text are required.");
    }

    if (text.trim().length === 0) {
      throw new HttpsError("invalid-argument", "Message cannot be empty.");
    }

    const isStaff = await verifyUserRole(uid, "business");
    if (!isStaff) {
      throw new HttpsError("permission-denied", "Only staff can reply in this conversation.");
    }

    const profile = await getUserProfile(uid);
    const subject = await getStaffConversationSubject(orderId);
    await ensureConversation(orderId, subject.record);

    const messageId = db.ref("messages").push().key;
    const message = {
      messageId,
      senderUid: uid,
      senderRole: profile?.role || "business",
      text: text.trim(),
      createdAt: admin.database.ServerValue.TIMESTAMP,
      readByCustomer: false,
      readByStaff: true
    };

    await Promise.all([
      db.ref(`messages/${orderId}/${messageId}`).set(message),
      db.ref(`conversations/${orderId}`).update({
        lastMessageAt: admin.database.ServerValue.TIMESTAMP,
        lastStaffMessageAt: admin.database.ServerValue.TIMESTAMP,
        lastMessageSenderRole: message.senderRole,
        customerUnreadSince: admin.database.ServerValue.TIMESTAMP,
        customerUnreadReminderSentAt: null,
        unreadByCustomer: admin.database.ServerValue.increment(1),
        updatedAt: admin.database.ServerValue.TIMESTAMP
      })
    ]);

    return res.status(200).json({ messageId, success: true });
  } catch (error) {
    const code = error?.code || "internal";
    const message = error?.message || "Failed to send message.";
    return res.status(code === "unauthenticated" ? 401 : 400).json({ error: code, message });
  }
});

exports.markConversationRead = onCall({ invoker: "public" }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "User must be signed in.");

  const uid = request.auth.uid;
  const { orderId } = request.data;

  if (!orderId) {
    throw new HttpsError("invalid-argument", "orderId is required.");
  }

  // Check if user is staff (business or admin)
  const isStaff = await verifyUserRole(uid, "business");
  if (!isStaff) {
    throw new HttpsError("permission-denied", "Only staff can mark as read.");
  }

  // Mark all messages in conversation as read
  const messagesSnap = await db.ref(`messages/${orderId}`).once("value");
  const updates = {};

  if (messagesSnap.exists()) {
    Object.keys(messagesSnap.val()).forEach((msgId) => {
      updates[`messages/${orderId}/${msgId}/readByStaff`] = true;
    });
  }

  updates[`conversations/${orderId}/staffUnreadCount`] = 0;
  updates[`conversations/${orderId}/staffUnreadSince`] = null;
  updates[`conversations/${orderId}/staffUnreadReminderSentAt`] = null;
  updates[`conversations/${orderId}/staffReadAt`] = admin.database.ServerValue.TIMESTAMP;

  await db.ref().update(updates);

  return { success: true };
});

exports.markCustomerConversationRead = onCall({ invoker: "public" }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "User must be signed in.");

  const uid = request.auth.uid;
  const { orderId } = request.data;

  if (!orderId) {
    throw new HttpsError("invalid-argument", "orderId is required.");
  }

  await getCustomerConversationSubject(orderId, uid);

  const messagesSnap = await db.ref(`messages/${orderId}`).once("value");
  const updates = {};

  if (messagesSnap.exists()) {
    Object.keys(messagesSnap.val()).forEach((msgId) => {
      updates[`messages/${orderId}/${msgId}/readByCustomer`] = true;
    });
  }

  updates[`conversations/${orderId}/unreadByCustomer`] = 0;
  updates[`conversations/${orderId}/customerUnreadSince`] = null;
  updates[`conversations/${orderId}/customerUnreadReminderSentAt`] = null;
  updates[`conversations/${orderId}/customerReadAt`] = admin.database.ServerValue.TIMESTAMP;

  await db.ref().update(updates);

  return { success: true };
});

// ============================================================================
// ADMIN & USER MANAGEMENT FUNCTIONS
// ============================================================================

exports.setUserRole = onCall({ invoker: "public" }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "User must be signed in.");

  const adminUid = request.auth.uid;
  const { uid, role } = request.data;

  if (!uid || !role) {
    throw new HttpsError("invalid-argument", "uid and role are required.");
  }

  if (!["customer", "business", "admin"].includes(role)) {
    throw new HttpsError("invalid-argument", "Invalid role.");
  }

  // Verify admin
  const isAdmin = await verifyUserRole(adminUid, "admin");
  if (!isAdmin) {
    throw new HttpsError("permission-denied", "Only admins can change roles.");
  }

  // Set custom claims
  await auth.setCustomUserClaims(uid, { role });

  // Update database profile
  await db.ref(`users/${uid}`).update({
    role,
    updatedAt: admin.database.ServerValue.TIMESTAMP
  });

  // Log audit
  await logAuditAction("role_changed", adminUid, "admin", uid, { newRole: role });

  return { success: true, role };
});

exports.setUserBlocked = onCall({ invoker: "public" }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "User must be signed in.");

  const adminUid = request.auth.uid;
  const { uid, blocked } = request.data;

  if (!uid || typeof blocked !== "boolean") {
    throw new HttpsError("invalid-argument", "uid and blocked flag are required.");
  }

  // Verify admin
  const isAdmin = await verifyUserRole(adminUid, "admin");
  if (!isAdmin) {
    throw new HttpsError("permission-denied", "Only admins can block users.");
  }

  // Prevent blocking self
  if (adminUid === uid) {
    throw new HttpsError("failed-precondition", "You cannot block yourself.");
  }

  // Update auth user
  await auth.updateUser(uid, { disabled: blocked });

  // Update database profile
  await db.ref(`users/${uid}`).update({
    status: blocked ? "blocked" : "active",
    updatedAt: admin.database.ServerValue.TIMESTAMP
  });

  // Log audit
  await logAuditAction(blocked ? "user_blocked" : "user_unblocked", adminUid, "admin", uid, {});

  return { success: true, status: blocked ? "blocked" : "active" };
});

exports.assignHistoricalPurchase = onCall({ invoker: "public" }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "User must be signed in.");

  const adminUid = request.auth.uid;
  const { customerUid, knifeId, purchaseDate } = request.data;

  if (!customerUid || !knifeId) {
    throw new HttpsError("invalid-argument", "customerUid and knifeId are required.");
  }

  // Verify admin
  const isAdmin = await verifyUserRole(adminUid, "admin");
  if (!isAdmin) {
    throw new HttpsError("permission-denied", "Only admins can assign purchases.");
  }

  // Get knife
  const knifeSnap = await db.ref(`Products/${knifeId}`).once("value");
  if (!knifeSnap.exists()) {
    throw new HttpsError("not-found", "Knife not found.");
  }

  // Create historical order
  const orderId = db.ref("orders").push().key;
  const order = {
    orderId,
    uid: customerUid,
    knifeId,
    status: "paid",
    fulfillmentStatus: "delivered",
    amount: knifeSnap.val().price,
    currency: "USD",
    source: "manual-legacy",
    paidAt: purchaseDate || admin.database.ServerValue.TIMESTAMP,
    createdAt: purchaseDate || admin.database.ServerValue.TIMESTAMP,
    updatedAt: admin.database.ServerValue.TIMESTAMP
  };

  // Create conversation
  await Promise.all([
    db.ref(`orders/${orderId}`).set(order),
    db.ref(`userOrders/${customerUid}/${orderId}`).set(true),
    db.ref(`conversations/${orderId}`).set({
      conversationId: orderId,
      orderId,
      knifeId,
      customerUid,
      status: "open",
      createdAt: admin.database.ServerValue.TIMESTAMP,
      updatedAt: admin.database.ServerValue.TIMESTAMP,
      lastMessageAt: null
    })
  ]);

  // Log audit
  await logAuditAction("historical_purchase_assigned", adminUid, "admin", customerUid, {
    orderId,
    knifeId
  });

  return { success: true, orderId };
});

exports.updateFulfillmentStatus = onCall({ invoker: "public" }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "User must be signed in.");

  const uid = request.auth.uid;
  const { orderId, status, expectedArrivalDate, trackingUrl, trackingNumber } = request.data;

  if (!orderId || (!status && expectedArrivalDate === undefined && trackingUrl === undefined && trackingNumber === undefined)) {
    throw new HttpsError("invalid-argument", "orderId and at least one update field are required.");
  }

  if (status && !["unfulfilled", "processing", "shipped", "delivered"].includes(status)) {
    throw new HttpsError("invalid-argument", "Invalid fulfillment status.");
  }

  // Verify user is business or admin
  const isBusiness = await verifyUserRole(uid, "business");
  if (!isBusiness) {
    throw new HttpsError("permission-denied", "Only business users can update fulfillment status.");
  }

  const updates = {
    updatedAt: admin.database.ServerValue.TIMESTAMP
  };
  if (status) updates.fulfillmentStatus = status;
  if (expectedArrivalDate !== undefined) updates.expectedArrivalDate = expectedArrivalDate || null;
  if (trackingUrl !== undefined) updates.trackingUrl = trackingUrl || null;
  if (trackingNumber !== undefined) updates.trackingNumber = trackingNumber || null;

  await db.ref(`orders/${orderId}`).update(updates);

  // Log audit
  const profile = await getUserProfile(uid);
  await logAuditAction("fulfillment_updated", uid, profile.role || "business", null, {
    orderId,
    newStatus: status || null,
    expectedArrivalDate: expectedArrivalDate || null,
    trackingUrl: trackingUrl || null,
    trackingNumber: trackingNumber || null
  });

  return { success: true, status };
});

exports.updateOrderShippingAddress = onCall({ invoker: "public" }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "User must be signed in.");

  const uid = request.auth.uid;
  const { orderId, shippingAddress } = request.data;

  if (!orderId || !shippingAddress) {
    throw new HttpsError("invalid-argument", "orderId and shippingAddress are required.");
  }

  const orderSnap = await db.ref(`orders/${orderId}`).once("value");
  if (!orderSnap.exists()) throw new HttpsError("not-found", "Order not found.");

  const order = orderSnap.val();
  if (order.uid !== uid) throw new HttpsError("permission-denied", "You don't own this order.");

  if (["shipped", "delivered"].includes(order.fulfillmentStatus)) {
    throw new HttpsError("failed-precondition", "Shipping address is locked after an order ships.");
  }

  const normalized = {
    fullName: String(shippingAddress.fullName || "").trim(),
    addressLine1: String(shippingAddress.addressLine1 || "").trim(),
    addressLine2: String(shippingAddress.addressLine2 || "").trim(),
    city: String(shippingAddress.city || "").trim(),
    state: String(shippingAddress.state || "").trim(),
    postalCode: String(shippingAddress.postalCode || "").trim(),
    countryCode: String(shippingAddress.countryCode || "US").trim(),
    source: "customer"
  };

  if (!normalized.fullName || !normalized.addressLine1 || !normalized.city || !normalized.state || !normalized.postalCode) {
    throw new HttpsError("invalid-argument", "Name, street, city, state, and postal code are required.");
  }

  await db.ref(`orders/${orderId}`).update({
    shippingAddress: normalized,
    updatedAt: admin.database.ServerValue.TIMESTAMP
  });

  await logAuditAction("shipping_address_updated", uid, "customer", uid, {
    orderId
  });

  return { success: true };
});

// ============================================================================
// ADMIN IMPERSONATION
// ============================================================================

exports.createImpersonationSession = onCall({ invoker: "public" }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "User must be signed in.");

  const adminUid = request.auth.uid;
  const { targetUid, reason } = request.data;

  if (!targetUid || !reason) {
    throw new HttpsError("invalid-argument", "targetUid and reason are required.");
  }

  // Verify admin
  const isAdmin = await verifyUserRole(adminUid, "admin");
  if (!isAdmin) {
    throw new HttpsError("permission-denied", "Only admins can impersonate.");
  }

  // Create short-lived custom token
  const token = await auth.createCustomToken(targetUid, {
    impersonated: true,
    impersonatedBy: adminUid,
    impersonationExpiresAt: Date.now() + 3600000 // 1 hour
  });

  // Log audit
  await logAuditAction("impersonation_started", adminUid, "admin", targetUid, {
    reason,
    expiresAt: Date.now() + 3600000
  });

  return { customToken: token, expiresIn: 3600 };
});

// ============================================================================
// CUSTOM KNIFE REQUEST FUNCTIONS
// ============================================================================

exports.getCustomRequests = onCall({ invoker: "public" }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "User must be signed in.");

  const uid = request.auth.uid;
  const { forBusiness } = request.data || {};

  // If business/admin, get all requests; otherwise get only user's requests
  if (forBusiness) {
    const isStaff = await verifyUserRole(uid, "business");
    if (!isStaff) {
      throw new HttpsError("permission-denied", "Only staff can view all requests.");
    }

    const requestsSnap = await db.ref("customRequests").once("value");
    if (!requestsSnap.exists()) return { requests: [] };

    const requests = Object.entries(requestsSnap.val()).map(([id, data]) => ({
      id,
      ...data
    }));

    requests.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    return { requests };
  } else {
    // Customer - get only their own requests
    const requestsSnap = await db.ref("customRequests").once("value");
    if (!requestsSnap.exists()) return { requests: [] };

    const allRequests = Object.entries(requestsSnap.val()).map(([id, data]) => ({
      id,
      ...data
    }));

    const userRequests = allRequests.filter(r => r.uid === uid);
    userRequests.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    return { requests: userRequests };
  }
});

exports.updateCustomRequestStatus = onCall({ invoker: "public" }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "User must be signed in.");

  const uid = request.auth.uid;
  const { requestId, newStatus, internalNotes, customerMessage } = request.data;

  if (!requestId || !newStatus) {
    throw new HttpsError("invalid-argument", "requestId and newStatus are required.");
  }

  // Verify staff access
  const isStaff = await verifyUserRole(uid, "business");
  if (!isStaff) {
    throw new HttpsError("permission-denied", "Only staff can update requests.");
  }

  const requestSnap = await db.ref(`customRequests/${requestId}`).once("value");
  if (!requestSnap.exists()) {
    throw new HttpsError("not-found", "Request not found.");
  }

  const customRequest = requestSnap.val();

  // Update status and notes
  await db.ref(`customRequests/${requestId}`).update({
    status: newStatus,
    internalNotes: internalNotes || customRequest.internalNotes || "",
    lastUpdatedAt: admin.database.ServerValue.TIMESTAMP,
    lastUpdatedBy: uid
  });

  // If there's a customer message, create a notification
  if (customerMessage) {
    const messageId = db.ref("messages").push().key;
    const conversationId = requestId; // Use request ID as conversation ID
    const profile = await getUserProfile(uid);

    await Promise.all([
      db.ref(`messages/${conversationId}/${messageId}`).set({
        messageId,
        senderUid: uid,
        senderRole: profile?.role || "business",
        text: customerMessage,
        createdAt: admin.database.ServerValue.TIMESTAMP,
        readByCustomer: false,
        readByStaff: true
      }),
      db.ref(`conversations/${conversationId}`).update({
        lastMessageAt: admin.database.ServerValue.TIMESTAMP,
        updatedAt: admin.database.ServerValue.TIMESTAMP
      })
    ]);
  }

  // Send email notification if status changed to something customer should know about
  const statusesToNotify = ["quote_sent", "in_production", "completed", "shipped"];
  if (statusesToNotify.includes(newStatus)) {
    try {
      await sendEmail(
        customRequest.customerEmail,
        "statusUpdate",
        customRequest.customerName || "Valued Customer",
        requestId,
        newStatus.replace(/_/g, " ").toUpperCase(),
        customerMessage || ""
      );
    } catch (emailError) {
      console.warn("Failed to send status update email:", emailError);
    }
  }

  // Log audit
  await logAuditAction("custom_request_status_updated", uid, "business", customRequest.uid, {
    requestId,
    newStatus,
    hadCustomerMessage: !!customerMessage
  });

  return { success: true };
});

exports.sendCustomKnifeQuote = onCall({ invoker: "public" }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "User must be signed in.");

  const uid = request.auth.uid;
  const { requestId, finalPrice, remainingBalance, notes, paymentTerms } = request.data;

  if (!requestId || !finalPrice) {
    throw new HttpsError("invalid-argument", "requestId and finalPrice are required.");
  }

  // Verify staff access
  const isStaff = await verifyUserRole(uid, "business");
  if (!isStaff) {
    throw new HttpsError("permission-denied", "Only staff can send quotes.");
  }

  const requestSnap = await db.ref(`customRequests/${requestId}`).once("value");
  if (!requestSnap.exists()) {
    throw new HttpsError("not-found", "Request not found.");
  }

  const customRequest = requestSnap.val();
  const numericFinalPrice = Number(finalPrice);
  if (!Number.isFinite(numericFinalPrice) || numericFinalPrice <= 0) {
    throw new HttpsError("invalid-argument", "finalPrice must be a positive number.");
  }

  const depositAlreadyPaid = hasPaidCustomRequestDeposit(customRequest);
  const quoteDepositAmount = depositAlreadyPaid
    ? getCustomRequestDepositAmount(customRequest, numericFinalPrice)
    : getCustomRequestDepositAmount(customRequest, numericFinalPrice, numericFinalPrice * DEPOSIT_PERCENTAGE);
  const requestedRemainingBalance = Number(remainingBalance);
  const remainingAfterDeposit = Number.isFinite(requestedRemainingBalance) && requestedRemainingBalance >= 0
    ? Number(requestedRemainingBalance.toFixed(2))
    : Number((numericFinalPrice - quoteDepositAmount).toFixed(2));

  // Create quote record
  const quoteId = db.ref("quotes").push().key;
  await db.ref(`quotes/${quoteId}`).set({
    quoteId,
    requestId,
    customerUid: customRequest.uid,
    finalPrice: numericFinalPrice,
    remainingBalance: remainingAfterDeposit,
    depositAmount: quoteDepositAmount,
    depositPaid: depositAlreadyPaid ? quoteDepositAmount : 0,
    paymentTerms: paymentTerms || "Net 30",
    notes: notes || "",
    sentBy: uid,
    sentAt: admin.database.ServerValue.TIMESTAMP,
    status: "pending_acceptance"
  });

  // Update custom request with quote reference
  await db.ref(`customRequests/${requestId}`).update({
    status: "quote_sent",
    quoteId,
    finalPrice: numericFinalPrice,
    depositAmount: quoteDepositAmount,
    depositRequired: depositAlreadyPaid ? 0 : quoteDepositAmount,
    lastUpdatedAt: admin.database.ServerValue.TIMESTAMP,
    lastUpdatedBy: uid
  });

  // Send notification message
  const messageId = db.ref("messages").push().key;
  const conversationId = requestId;
  const profile = await getUserProfile(uid);

  await Promise.all([
    db.ref(`messages/${conversationId}/${messageId}`).set({
      messageId,
      senderUid: uid,
      senderRole: profile?.role || "business",
      text: `Quote sent: Final price: $${numericFinalPrice.toFixed(2)}. Remaining balance: $${remainingAfterDeposit.toFixed(2)}. ${notes ? 'Notes: ' + notes : ''}`,
      createdAt: admin.database.ServerValue.TIMESTAMP,
      readByCustomer: false,
      readByStaff: true,
      isSystemMessage: true
    }),
    db.ref(`conversations/${conversationId}`).update({
      lastMessageAt: admin.database.ServerValue.TIMESTAMP,
      updatedAt: admin.database.ServerValue.TIMESTAMP
    })
  ]);

  // Send email notification to customer
  try {
    await sendRequiredEmail(
      customRequest.customerEmail,
      "quoteSent",
      customRequest.customerName || "Valued Customer",
      requestId,
      numericFinalPrice,
      quoteDepositAmount,
      remainingAfterDeposit,
      depositAlreadyPaid,
      depositAlreadyPaid ? `${SITE_URL}/my-knives/${encodeURIComponent(requestId)}` : getCustomRequestDepositPaymentUrl(requestId)
    );
    await db.ref(`customRequests/${requestId}`).update({
      quoteSentAt: admin.database.ServerValue.TIMESTAMP,
      quoteSentTo: customRequest.customerEmail
    });
  } catch (emailError) {
    console.warn("Failed to send quote email but quote was created:", emailError);
    throw new HttpsError("internal", "Quote saved, but the email failed to send.");
  }

  // Log audit
  await logAuditAction("custom_quote_sent", uid, "business", customRequest.uid, {
    requestId,
    quoteId,
    finalPrice,
    remainingBalance
  });

  return { success: true, quoteId };
});

// ============================================================================
// DIAGNOSTIC FUNCTIONS (for testing & debugging)
// ============================================================================

exports.testEnvironment = onCall({ invoker: "public" }, async (request) => {
  if (!request.auth) {
    return {
      authenticated: false,
      message: "User not authenticated"
    };
  }

  try {
    const uid = request.auth.uid;

    // Test user profile access
    const profileSnap = await db.ref(`users/${uid}`).once("value");
    const profile = profileSnap.val();

    // Test role verification
    const role = await verifyUserRole(uid, "customer");

    // Test writing to a test collection
    const testRef = db.ref(`_test/${uid}`);
    await testRef.set({ timestamp: admin.database.ServerValue.TIMESTAMP });
    await testRef.remove();

    return {
      authenticated: true,
      uid,
      hasProfile: !!profile,
      canReadDatabase: true,
      canWriteDatabase: true,
      role: profile?.role || "unknown",
      message: "Environment test passed"
    };
  } catch (error) {
    return {
      authenticated: true,
      error: error.message,
      message: "Environment test failed"
    };
  }
});

exports.createTestUser = onCall({ invoker: "public" }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Must be signed in");

  const uid = request.auth.uid;
  const email = request.auth.token.email;

  try {
    // Create user profile if it doesn't exist
    const profileSnap = await db.ref(`users/${uid}`).once("value");

    if (!profileSnap.exists()) {
      await db.ref(`users/${uid}`).set({
        uid,
        email,
        displayName: email.split("@")[0],
        role: "customer",
        status: "active",
        createdAt: admin.database.ServerValue.TIMESTAMP
      });

      return { success: true, message: "Test user profile created" };
    }

    return { success: true, message: "User profile already exists" };
  } catch (error) {
    console.error("Error creating test user:", error);
    throw new HttpsError("internal", `Failed to create user profile: ${error.message}`);
  }
});

// ============================================================================
// EMAIL & NOTIFICATION FUNCTIONS
// ============================================================================

exports.sendUnreadMessageReminders = onSchedule("every 1 hours", async (context) => {
  try {
    const conversationsSnap = await db.ref("conversations").once("value");
    if (!conversationsSnap.exists()) return;

    const conversations = conversationsSnap.val();
    let remindersSent = 0;
    const now = Date.now();
    const fourHoursAgo = now - (4 * 60 * 60 * 1000);
    const updates = {};

    for (const [conversationId, conversation] of Object.entries(conversations)) {
      const customerUid = conversation.customerUid;
      let profile = null;
      try {
        profile = customerUid ? await getUserProfile(customerUid) : null;
      } catch (error) {
        console.warn(`Could not load customer profile for ${conversationId}:`, error.message);
      }

      const customerUnreadCount = conversation.unreadByCustomer || 0;
      const customerUnreadSince = Number(conversation.customerUnreadSince || 0);
      const customerReminderSentAt = Number(conversation.customerUnreadReminderSentAt || 0);
      if (
        customerUnreadCount > 0 &&
        customerUnreadSince > 0 &&
        customerUnreadSince <= fourHoursAgo &&
        customerReminderSentAt < customerUnreadSince &&
        profile?.email
      ) {
        try {
          await sendEmail(
            profile.email,
            "unreadMessages",
            profile.displayName || "there",
            conversationId,
            customerUnreadCount,
            "Nolan"
          );
          updates[`conversations/${conversationId}/customerUnreadReminderSentAt`] = admin.database.ServerValue.TIMESTAMP;
          remindersSent++;
        } catch (error) {
          console.warn(`Could not send customer reminder for conversation ${conversationId}:`, error.message);
        }
      }

      const staffUnreadCount = conversation.staffUnreadCount || 0;
      const staffUnreadSince = Number(conversation.staffUnreadSince || 0);
      const staffReminderSentAt = Number(conversation.staffUnreadReminderSentAt || 0);
      if (
        staffUnreadCount > 0 &&
        staffUnreadSince > 0 &&
        staffUnreadSince <= fourHoursAgo &&
        staffReminderSentAt < staffUnreadSince
      ) {
        try {
          await sendEmail(
            BUSINESS_EMAIL,
            "unreadCustomerMessages",
            profile?.displayName || profile?.email || "A customer",
            conversationId,
            staffUnreadCount
          );
          updates[`conversations/${conversationId}/staffUnreadReminderSentAt`] = admin.database.ServerValue.TIMESTAMP;
          remindersSent++;
        } catch (error) {
          console.warn(`Could not send staff reminder for conversation ${conversationId}:`, error.message);
        }
      }
    }

    if (Object.keys(updates).length > 0) {
      await db.ref().update(updates);
    }

    console.log(`Sent ${remindersSent} unread message reminders`);
    return { remindersSent };
  } catch (error) {
    console.error("Error sending unread message reminders:", error);
    throw error;
  }
});

exports.notifyCustomRequestSubmitted = onCall({ invoker: "public" }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "User must be signed in.");

  const uid = request.auth.uid;
  const { requestId, customerName, estimatedPrice, customerEmail } = request.data;

  if (!requestId || !customerEmail) {
    throw new HttpsError("invalid-argument", "requestId and customerEmail are required.");
  }

  try {
    await sendRequiredEmail(
      customerEmail,
      "customRequestSubmitted",
      customerName || "there",
      requestId,
      estimatedPrice || 250
    );

    return { success: true };
  } catch (error) {
    console.error("Error sending request submitted email:", error);
    throw new HttpsError("internal", "Failed to send confirmation email.");
  }
});

exports.notifyQuoteSent = onCall({ invoker: "public" }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "User must be signed in.");

  const uid = request.auth.uid;
  const { requestId, customerUid, customerName, customerEmail, finalPrice, depositAmount } = request.data;

  if (!customerEmail || !requestId) {
    throw new HttpsError("invalid-argument", "customerEmail and requestId are required.");
  }

  // Verify staff access
  const isStaff = await verifyUserRole(uid, "business");
  if (!isStaff) {
    throw new HttpsError("permission-denied", "Only staff can send quote emails.");
  }

  try {
    const numericFinalPrice = Number(finalPrice);
    if (!Number.isFinite(numericFinalPrice) || numericFinalPrice <= 0) {
      throw new HttpsError("invalid-argument", "finalPrice must be a positive number.");
    }

    const requestSnap = await db.ref(`customRequests/${requestId}`).once("value");
    if (!requestSnap.exists()) {
      throw new HttpsError("not-found", "Custom request not found.");
    }

    const customRequest = requestSnap.val() || {};
    const depositAlreadyPaid = hasPaidCustomRequestDeposit(customRequest);
    const deposit = depositAlreadyPaid
      ? getCustomRequestDepositAmount(customRequest, numericFinalPrice)
      : getCustomRequestDepositAmount(customRequest, numericFinalPrice, depositAmount || numericFinalPrice * DEPOSIT_PERCENTAGE);
    const remaining = Number((numericFinalPrice - deposit).toFixed(2));

    const emailResult = await sendRequiredEmail(
      customerEmail,
      "quoteSent",
      customerName || "there",
      requestId,
      numericFinalPrice,
      deposit,
      remaining,
      depositAlreadyPaid,
      depositAlreadyPaid ? `${SITE_URL}/my-knives/${encodeURIComponent(requestId)}` : getCustomRequestDepositPaymentUrl(requestId)
    );

    // Update request with email sent flag
    await db.ref(`customRequests/${requestId}`).update({
      status: "quote_sent",
      finalPrice: numericFinalPrice,
      depositAmount: deposit,
      depositRequired: depositAlreadyPaid ? 0 : deposit,
      quoteSentAt: admin.database.ServerValue.TIMESTAMP,
      quoteSentTo: customerEmail
    });

    return { success: true, messageId: emailResult.messageId || null };
  } catch (error) {
    console.error("Error sending quote email:", error);
    throw new HttpsError("internal", "Failed to send quote email.");
  }
});

exports.notifyStatusChange = onCall({ invoker: "public" }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "User must be signed in.");

  const uid = request.auth.uid;
  const { requestId, newStatus, customerName, customerEmail, message } = request.data;

  if (!customerEmail || !requestId || !newStatus) {
    throw new HttpsError("invalid-argument", "customerEmail, requestId, and newStatus are required.");
  }

  // Verify staff access
  const isStaff = await verifyUserRole(uid, "business");
  if (!isStaff) {
    throw new HttpsError("permission-denied", "Only staff can send status emails.");
  }

  try {
    await sendRequiredEmail(
      customerEmail,
      "statusUpdate",
      customerName || "there",
      requestId,
      newStatus,
      message || ""
    );

    return { success: true };
  } catch (error) {
    console.error("Error sending status email:", error);
    throw new HttpsError("internal", "Failed to send status email.");
  }
});

exports.notifyOrderComplete = onCall({ invoker: "public" }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "User must be signed in.");

  const uid = request.auth.uid;
  const { requestId, customerName, customerEmail, trackingNumber } = request.data;

  if (!customerEmail || !requestId) {
    throw new HttpsError("invalid-argument", "customerEmail and requestId are required.");
  }

  // Verify staff access
  const isStaff = await verifyUserRole(uid, "business");
  if (!isStaff) {
    throw new HttpsError("permission-denied", "Only staff can send completion emails.");
  }

  try {
    await sendRequiredEmail(
      customerEmail,
      "orderComplete",
      customerName || "there",
      requestId,
      trackingNumber || ""
    );

    // Update request with shipped flag
    await db.ref(`customRequests/${requestId}`).update({
      status: "shipped",
      shippedAt: admin.database.ServerValue.TIMESTAMP,
      trackingNumber: trackingNumber || null
    });

    return { success: true };
  } catch (error) {
    console.error("Error sending completion email:", error);
    throw new HttpsError("internal", "Failed to send completion email.");
  }
});

module.exports = exports;
