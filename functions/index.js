const admin = require("firebase-admin");
const axios = require("axios");
const crypto = require("crypto");
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
const MAILGUN_WEBHOOK_SIGNING_KEY = process.env.MAILGUN_WEBHOOK_SIGNING_KEY || process.env.MAILGUN_SIGNING_KEY || "";
const MAILGUN_WEBHOOK_MAX_AGE_SECONDS = Number(process.env.MAILGUN_WEBHOOK_MAX_AGE_SECONDS || 86400);
const FROM_EMAIL = process.env.FROM_EMAIL || "noreply@nolansknives.com";
const BUSINESS_EMAIL = process.env.BUSINESS_EMAIL || "orders@nolansknives.com";
const SITE_URL = (process.env.SITE_URL || "https://nolansknives.com").replace(/\/$/, "");
const FUNCTION_REGION = process.env.FUNCTION_REGION || process.env.GCLOUD_REGION || "us-central1";

const MAILGUN_WEBHOOK_EVENT_OPTIONS = [
  { key: "accepted", label: "Accepted" },
  { key: "delivered", label: "Delivered messages" },
  { key: "opened", label: "Opens" },
  { key: "clicked", label: "Clicked" },
  { key: "permanent_fail", label: "Permanent failure" },
  { key: "temporary_fail", label: "Temporary failure" },
  { key: "unsubscribed", label: "Unsubscribes" },
  { key: "complained", label: "Spam complaints" }
];

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

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const EMAIL_STYLE = {
  bg: "#0a0a0a",
  surface: "#111111",
  raised: "#1a1a1a",
  border: "#2b2b2b",
  text: "#f4f4f4",
  strong: "#ffffff",
  muted: "#b0b0b0",
  subtle: "#999999",
  gold: "#ffcc00",
  goldMuted: "#d8b949",
  danger: "#ff5c5c",
  success: "#4caf50",
  font: "Arial, Helvetica, sans-serif"
};

function emailSafeText(value, fallback = "") {
  const rendered = value === null || value === undefined || value === "" ? fallback : value;
  return escapeHtml(rendered);
}

function emailPlainHtml(value) {
  return emailSafeText(value).replace(/\r?\n/g, "<br/>");
}

function emailMoney(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "$0.00";
  if (/\{\{\s*[\w.-]+\s*\}\}/.test(raw) || raw.startsWith("$")) return emailSafeText(raw);
  const normalized = Number(raw.replace(/[$,]/g, ""));
  return Number.isFinite(normalized) ? `$${normalized.toFixed(2)}` : emailSafeText(raw);
}

function emailPath(path = "") {
  if (/^https?:\/\//i.test(String(path))) return String(path);
  return `${SITE_URL}${String(path).startsWith("/") ? "" : "/"}${path}`;
}

function emailParagraph(text) {
  if (!text) return "";
  return `<p style="margin:0 0 16px;color:${EMAIL_STYLE.text};font-family:${EMAIL_STYLE.font};font-size:16px;line-height:1.6;">${emailSafeText(text)}</p>`;
}

function emailHtmlParagraph(html) {
  if (!html) return "";
  return `<p style="margin:0 0 16px;color:${EMAIL_STYLE.text};font-family:${EMAIL_STYLE.font};font-size:16px;line-height:1.6;">${html}</p>`;
}

function emailButton({ label, url }) {
  if (!label || !url) return "";
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 4px;">
      <tr>
        <td style="border-radius:6px;background:${EMAIL_STYLE.gold};">
          <a href="${emailSafeText(url)}" style="display:inline-block;padding:13px 20px;color:#111111;font-family:${EMAIL_STYLE.font};font-size:15px;font-weight:700;line-height:1.2;text-decoration:none;border-radius:6px;">${emailSafeText(label)}</a>
        </td>
      </tr>
    </table>
  `;
}

function emailTextLink({ label, url }) {
  if (!label || !url) return "";
  return `<p style="margin:14px 0 0;color:${EMAIL_STYLE.muted};font-family:${EMAIL_STYLE.font};font-size:14px;line-height:1.6;"><a href="${emailSafeText(url)}" style="color:${EMAIL_STYLE.gold};font-weight:700;text-decoration:none;">${emailSafeText(label)}</a></p>`;
}

function emailDetailBlock(details = [], title = "Details") {
  const visibleDetails = details.filter((detail) => detail && (detail.value !== null && detail.value !== undefined && detail.value !== "" || detail.valueHtml));
  if (!visibleDetails.length) return "";

  const rows = visibleDetails.map((detail, index) => `
    <tr>
      <td style="padding:${index === 0 ? "0" : "11px"} 0 0;color:${EMAIL_STYLE.subtle};font-family:${EMAIL_STYLE.font};font-size:12px;font-weight:700;line-height:1.4;text-transform:uppercase;vertical-align:top;width:38%;">${emailSafeText(detail.label)}</td>
      <td style="padding:${index === 0 ? "0" : "11px"} 0 0;color:${EMAIL_STYLE.strong};font-family:${EMAIL_STYLE.font};font-size:15px;font-weight:700;line-height:1.4;text-align:right;vertical-align:top;">${detail.valueHtml || emailSafeText(detail.value)}</td>
    </tr>
  `).join("");

  return `
    <div style="margin:22px 0;padding:18px;background:${EMAIL_STYLE.raised};border:1px solid ${EMAIL_STYLE.border};border-radius:8px;">
      <div style="margin:0 0 14px;color:${EMAIL_STYLE.gold};font-family:${EMAIL_STYLE.font};font-size:12px;font-weight:700;letter-spacing:0.04em;line-height:1.4;text-transform:uppercase;">${emailSafeText(title)}</div>
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
        ${rows}
      </table>
    </div>
  `;
}

function emailNote(text, tone = "neutral") {
  if (!text) return "";
  const borderColor = tone === "success" ? EMAIL_STYLE.success : tone === "danger" ? EMAIL_STYLE.danger : EMAIL_STYLE.gold;
  return `
    <div style="margin:20px 0 0;padding:14px 16px;background:${EMAIL_STYLE.bg};border-left:4px solid ${borderColor};border-radius:6px;color:${EMAIL_STYLE.muted};font-family:${EMAIL_STYLE.font};font-size:14px;line-height:1.6;">
      ${emailPlainHtml(text)}
    </div>
  `;
}

function buildPremiumEmail({
  preheader = "",
  eyebrow = "Nolan's Knives",
  title = "Nolan's Knives",
  greeting = "",
  body = "",
  details = [],
  detailTitle = "Details",
  cta = null,
  secondaryCta = null,
  note = "",
  noteTone = "neutral",
  footerNote = `Questions? Reply to this email or contact ${BUSINESS_EMAIL}.`
}) {
  const greetingHtml = greeting ? emailParagraph(`Hi ${greeting},`) : "";
  const detailsHtml = emailDetailBlock(details, detailTitle);
  const ctaHtml = cta ? emailButton(cta) : "";
  const secondaryCtaHtml = secondaryCta ? emailTextLink(secondaryCta) : "";
  const noteHtml = emailNote(note, noteTone);

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${emailSafeText(title)}</title>
  </head>
  <body style="margin:0;padding:0;background:${EMAIL_STYLE.bg};">
    <div style="display:none;max-height:0;max-width:0;opacity:0;overflow:hidden;color:${EMAIL_STYLE.bg};font-size:1px;line-height:1px;">${emailSafeText(preheader)}</div>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:${EMAIL_STYLE.bg};margin:0;padding:28px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:640px;margin:0 auto;">
            <tr>
              <td style="padding:0 0 14px 2px;">
                <div style="color:${EMAIL_STYLE.gold};font-family:${EMAIL_STYLE.font};font-size:13px;font-weight:800;letter-spacing:0.08em;line-height:1.2;text-transform:uppercase;">Nolan's Knives</div>
                <div style="margin-top:5px;color:${EMAIL_STYLE.subtle};font-family:${EMAIL_STYLE.font};font-size:13px;line-height:1.4;">Custom handmade knives, built with purpose.</div>
              </td>
            </tr>
            <tr>
              <td style="background:${EMAIL_STYLE.surface};border:1px solid ${EMAIL_STYLE.border};border-radius:10px;overflow:hidden;">
                <div style="height:4px;background:${EMAIL_STYLE.gold};line-height:4px;font-size:4px;">&nbsp;</div>
                <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                  <tr>
                    <td style="padding:28px 26px 24px;">
                      <div style="margin:0 0 10px;color:${EMAIL_STYLE.goldMuted};font-family:${EMAIL_STYLE.font};font-size:12px;font-weight:800;letter-spacing:0.06em;line-height:1.4;text-transform:uppercase;">${emailSafeText(eyebrow)}</div>
                      <h1 style="margin:0 0 18px;color:${EMAIL_STYLE.strong};font-family:${EMAIL_STYLE.font};font-size:28px;font-weight:800;line-height:1.18;">${emailSafeText(title)}</h1>
                      ${greetingHtml}
                      ${body}
                      ${detailsHtml}
                      ${ctaHtml}
                      ${secondaryCtaHtml}
                      ${noteHtml}
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:18px 26px;background:${EMAIL_STYLE.bg};border-top:1px solid ${EMAIL_STYLE.border};">
                      <p style="margin:0;color:${EMAIL_STYLE.subtle};font-family:${EMAIL_STYLE.font};font-size:13px;line-height:1.6;">${emailSafeText(footerNote)}</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 2px 0;color:${EMAIL_STYLE.subtle};font-family:${EMAIL_STYLE.font};font-size:12px;line-height:1.6;text-align:center;">
                Nolan's Knives &bull; <a href="${emailSafeText(SITE_URL)}" style="color:${EMAIL_STYLE.gold};text-decoration:none;">nolansknives.com</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

// Email Templates
const emailTemplates = {
  adminInvite: (displayName, setupUrl, inviterName = "Nolan's Knives", roleLabel = "Admin") => {
    const role = roleLabel || "Admin";
    const inviter = inviterName || "Nolan's Knives";

    return {
      subject: `You're invited to Nolan's Knives as ${role}`,
      html: buildPremiumEmail({
        preheader: `${inviter} invited you to Nolan's Knives with ${role} access.`,
        eyebrow: "Access Invite",
        title: "You're Invited",
        greeting: displayName || "there",
        body: emailParagraph(`${inviter} invited you to Nolan's Knives with ${role} access.`) +
          emailParagraph("Use the secure setup link below to choose your password and finish your account setup."),
        details: [
          { label: "Access Level", value: role },
          { label: "Invited By", value: inviter }
        ],
        detailTitle: "Invitation Details",
        cta: { label: `Set Up ${role} Access`, url: setupUrl },
        note: "If you were not expecting this invite, you can ignore this email.",
        footerNote: "This invite link is intended only for you."
      })
    };
  },

  customRequestSubmitted: (customerName, requestId, estimatedPrice) => ({
    subject: "Custom Knife Request Received - Nolan's Knives",
    html: buildPremiumEmail({
      preheader: "We received your custom knife request.",
      eyebrow: "Custom Request",
      title: "Request Received",
      greeting: customerName || "there",
      body: emailParagraph("We've received your custom knife request. Nolan's team will review the details and follow up with the next step.") +
        emailParagraph("You can track the request from your account while the details are being reviewed."),
      details: [
        { label: "Request ID", value: requestId },
        { label: "Estimated Price", value: emailMoney(estimatedPrice) }
      ],
      detailTitle: "Request Summary",
      cta: { label: "View Request", url: emailPath(`/custom-knife/confirmation/${encodeURIComponent(String(requestId || ""))}`) }
    })
  }),

  customRequestSubmittedBusiness: (customerName, requestId, estimatedPrice) => ({
    subject: `New Custom Request - ${customerName || "Customer"}`,
    html: buildPremiumEmail({
      preheader: `${customerName || "A customer"} submitted a custom knife request.`,
      eyebrow: "Staff Alert",
      title: "New Custom Request",
      body: emailParagraph(`${customerName || "A customer"} submitted a custom knife request.`) +
        emailParagraph("Open the business dashboard to review the build brief, pricing estimate, and customer details."),
      details: [
        { label: "Customer", value: customerName },
        { label: "Request ID", value: requestId },
        { label: "Estimated Price", value: emailMoney(estimatedPrice) }
      ],
      detailTitle: "Request Details",
      cta: { label: "Open Custom Requests", url: emailPath("/business/custom-requests") },
      footerNote: "Staff alert generated by Nolan's Knives."
    })
  }),

  customRequestPriorityPaid: (customerName, requestId, estimatedPrice, depositAmount) => ({
    subject: "Priority Custom Knife Request Received - Nolan's Knives",
    html: buildPremiumEmail({
      preheader: "Your priority deposit has been received.",
      eyebrow: "Priority Request",
      title: "Priority Request Received",
      greeting: customerName || "there",
      body: emailParagraph("We've received your custom knife request and your priority deposit.") +
        emailParagraph("Nolan will review your brief and send a more detailed quote. If the final quote is not accepted, the deposit can be refunded."),
      details: [
        { label: "Request ID", value: requestId },
        { label: "Estimated Price", value: emailMoney(estimatedPrice) },
        { label: "Deposit Paid", value: emailMoney(depositAmount) }
      ],
      detailTitle: "Priority Deposit",
      cta: { label: "View Request", url: emailPath(`/custom-knife/confirmation/${encodeURIComponent(String(requestId || ""))}`) },
      note: "You can view the request and chat with Nolan's team from your account.",
      noteTone: "success"
    })
  }),

  customRequestPriorityPaidBusiness: (customerName, requestId, estimatedPrice, depositAmount) => ({
    subject: `Priority Custom Request Paid - ${customerName}`,
    html: buildPremiumEmail({
      preheader: `${customerName} paid the priority deposit.`,
      eyebrow: "Staff Alert",
      title: "Priority Request Paid",
      body: emailParagraph(`${customerName} paid the priority deposit for a custom knife request.`) +
        emailParagraph("Review the request in the business dashboard and send the detailed quote when ready."),
      details: [
        { label: "Customer", value: customerName },
        { label: "Request ID", value: requestId },
        { label: "Estimated Price", value: emailMoney(estimatedPrice) },
        { label: "Deposit Paid", value: emailMoney(depositAmount) }
      ],
      detailTitle: "Payment Details",
      cta: { label: "Open Custom Requests", url: emailPath("/business/custom-requests") },
      footerNote: "Staff alert generated by Nolan's Knives."
    })
  }),

  knifePurchasedCustomer: (customerName, orderId, knifeName, amount) => ({
    subject: `Order Confirmed - ${knifeName}`,
    html: buildPremiumEmail({
      preheader: `Your order for ${knifeName} is confirmed.`,
      eyebrow: "Order Confirmation",
      title: "Order Confirmed",
      greeting: customerName || "there",
      body: emailParagraph("Thanks for your purchase from Nolan's Knives.") +
        emailParagraph("Your knife now appears under Your Knives, where you can track status and message Nolan's team."),
      details: [
        { label: "Order ID", value: orderId },
        { label: "Knife", value: knifeName },
        { label: "Total Paid", value: emailMoney(amount) }
      ],
      detailTitle: "Order Summary",
      cta: { label: "View Your Knives", url: emailPath("/my-knives") },
      note: "We'll keep the order details updated as fulfillment moves forward.",
      noteTone: "success"
    })
  }),

  knifePurchasedBusiness: (customerName, orderId, knifeName, amount) => ({
    subject: `Knife Sold - ${knifeName}`,
    html: buildPremiumEmail({
      preheader: `${customerName} completed payment for ${knifeName}.`,
      eyebrow: "Staff Alert",
      title: "Knife Sold",
      body: emailParagraph(`${customerName} completed payment for a store knife.`) +
        emailParagraph("Open the business orders page to review fulfillment and customer details."),
      details: [
        { label: "Customer", value: customerName },
        { label: "Order ID", value: orderId },
        { label: "Knife", value: knifeName },
        { label: "Total Paid", value: emailMoney(amount) }
      ],
      detailTitle: "Sale Details",
      cta: { label: "Open Business Orders", url: emailPath("/business/orders") },
      footerNote: "Staff alert generated by Nolan's Knives."
    })
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
    html: buildPremiumEmail({
      preheader: "Your custom knife quote is ready.",
      eyebrow: "Custom Quote",
      title: "Your Custom Knife Quote",
      greeting: customerName || "there",
      body: emailParagraph("We've prepared a quote for your custom knife request.") +
        emailParagraph(depositAlreadyPaid
          ? "Your priority deposit is already recorded. Nolan will continue from here and send the next payment step when it is ready."
          : "To move forward, pay the deposit using the secure link below. The remaining balance is due later in the build process."),
      details: [
        { label: "Request ID", value: requestId },
        { label: "Final Quote", value: emailMoney(finalPrice) },
        { label: depositAlreadyPaid ? "Deposit Recorded" : "Deposit Due Now", value: emailMoney(depositDue) },
        { label: "Remaining Balance", value: emailMoney(remainingBalance) }
      ],
      detailTitle: "Pricing Breakdown",
      cta: depositAlreadyPaid
        ? { label: "View Request", url: emailPath(`/my-knives/${encodeURIComponent(String(requestId || ""))}`) }
        : { label: "Pay Deposit", url: depositPaymentUrl },
      note: "Questions about the quote? Reply to this email and we'll help from there.",
      noteTone: "success"
    })
  }),

  depositReceived: (customerName, requestId, depositAmount) => ({
    subject: "Deposit Received - Nolan's Knives",
    html: buildPremiumEmail({
      preheader: "Your deposit payment has been received.",
      eyebrow: "Payment Received",
      title: "Quote Accepted",
      greeting: customerName || "there",
      body: emailParagraph(`We've received your deposit payment for request ${requestId}.`) +
        emailParagraph("This confirms the final quote and reserves your custom build. Nolan's team will keep you updated as the work moves forward."),
      details: [
        { label: "Request ID", value: requestId },
        { label: "Deposit Paid", value: emailMoney(depositAmount) }
      ],
      detailTitle: "Payment Summary",
      cta: { label: "Track Your Order", url: emailPath(`/my-knives/${encodeURIComponent(String(requestId || ""))}`) },
      note: "Keep an eye on Your Knives for progress updates and messages from Nolan's team.",
      noteTone: "success"
    })
  }),

  quoteDepositReceivedBusiness: (customerName, requestId, depositAmount) => ({
    subject: `Quote Deposit Paid - ${customerName || "Customer"}`,
    html: buildPremiumEmail({
      preheader: `${customerName || "A customer"} paid the deposit for a final custom quote.`,
      eyebrow: "Staff Alert",
      title: "Quote Deposit Paid",
      body: emailParagraph(`${customerName || "A customer"} paid the quote deposit and accepted the custom knife quote.`) +
        emailParagraph("Open the request to review the accepted quote, customer messages, and next build step."),
      details: [
        { label: "Customer", value: customerName },
        { label: "Request ID", value: requestId },
        { label: "Deposit Paid", value: emailMoney(depositAmount) }
      ],
      detailTitle: "Accepted Quote",
      cta: { label: "Open Custom Requests", url: emailPath("/business/custom-requests") },
      footerNote: "Staff alert generated by Nolan's Knives."
    })
  }),

  finalPaymentRequested: (
    customerName,
    requestId,
    finalPrice,
    depositPaid,
    remainingBalance,
    shippingAmount,
    taxAmount,
    adjustmentAmount,
    totalDue,
    finalPaymentUrl,
    note = ""
  ) => ({
    subject: "Final Payment Requested - Nolan's Knives",
    html: buildPremiumEmail({
      preheader: "Your custom knife final balance is ready.",
      eyebrow: "Final Balance",
      title: "Final Payment Requested",
      greeting: customerName || "there",
      body: emailParagraph("Your custom knife has reached the final payment step.") +
        emailParagraph("Use the secure link below to pay the remaining balance. After payment is recorded, Nolan's team can prepare the knife for pickup or shipping.") +
        (note ? emailNote(note) : ""),
      details: [
        { label: "Request ID", value: requestId },
        { label: "Final Quote", value: emailMoney(finalPrice) },
        { label: "Deposit Paid", value: emailMoney(depositPaid) },
        { label: "Remaining Balance", value: emailMoney(remainingBalance) },
        { label: "Shipping", value: emailMoney(shippingAmount) },
        { label: "Tax", value: emailMoney(taxAmount) },
        { label: "Adjustment", value: emailMoney(adjustmentAmount) },
        { label: "Total Due", value: emailMoney(totalDue) }
      ],
      detailTitle: "Final Payment Summary",
      cta: { label: "Pay Final Balance", url: finalPaymentUrl },
      note: "Questions about the final payment? Reply to this email and we'll help from there.",
      noteTone: "success"
    })
  }),

  finalPaymentReceived: (customerName, requestId, amountPaid) => ({
    subject: "Payment Complete - Nolan's Knives",
    html: buildPremiumEmail({
      preheader: "Your custom knife is paid in full.",
      eyebrow: "Payment Complete",
      title: "Paid In Full",
      greeting: customerName || "there",
      body: emailParagraph(`We've received the final payment for request ${requestId}.`) +
        emailParagraph("Your custom knife is now paid in full. Nolan's team will keep the status updated from here."),
      details: [
        { label: "Request ID", value: requestId },
        { label: "Final Payment", value: emailMoney(amountPaid) }
      ],
      detailTitle: "Payment Summary",
      cta: { label: "View Your Knives", url: emailPath("/my-knives") },
      note: "Thank you for trusting Nolan's Knives with this build.",
      noteTone: "success"
    })
  }),

  finalPaymentReceivedBusiness: (customerName, requestId, amountPaid) => ({
    subject: `Final Payment Paid - ${customerName || "Customer"}`,
    html: buildPremiumEmail({
      preheader: `${customerName || "A customer"} paid the final balance for a custom knife.`,
      eyebrow: "Staff Alert",
      title: "Final Payment Paid",
      body: emailParagraph(`${customerName || "A customer"} paid the final custom knife balance.`) +
        emailParagraph("Open the request to review shipping, pickup, and final delivery steps."),
      details: [
        { label: "Customer", value: customerName },
        { label: "Request ID", value: requestId },
        { label: "Final Payment", value: emailMoney(amountPaid) }
      ],
      detailTitle: "Payment Details",
      cta: { label: "Open Custom Requests", url: emailPath("/business/custom-requests") },
      footerNote: "Staff alert generated by Nolan's Knives."
    })
  }),

  statusUpdate: (customerName, requestId, newStatus, message) => ({
    subject: `Order Update: ${newStatus} - Nolan's Knives`,
    html: buildPremiumEmail({
      preheader: `Your order status is now ${newStatus}.`,
      eyebrow: "Order Update",
      title: "Order Update",
      greeting: customerName || "there",
      body: emailParagraph(`Your custom knife order ${requestId} has been updated.`),
      details: [
        { label: "Request ID", value: requestId },
        { label: "Current Status", value: newStatus }
      ],
      detailTitle: "Current Status",
      cta: { label: "View Full Details", url: emailPath(`/my-knives/${encodeURIComponent(String(requestId || ""))}`) },
      note: message ? `Message from Nolan:\n${message}` : "",
      noteTone: "neutral"
    })
  }),

  unreadMessages: (customerName, requestId, messageCount, senderName = "Nolan's team") => ({
    subject: `${senderName} left you a message - Nolan's Knives`,
    html: buildPremiumEmail({
      preheader: `${senderName} left you a message.`,
      eyebrow: "Message Waiting",
      title: "You Have Unread Messages",
      greeting: customerName || "there",
      body: emailParagraph(`${senderName} left ${messageCount} unread message${messageCount > 1 ? "s" : ""} about your knife order/request.`),
      details: [
        { label: "Request ID", value: requestId },
        { label: "Unread Messages", value: messageCount },
        { label: "From", value: senderName }
      ],
      detailTitle: "Message Summary",
      cta: { label: "View Messages", url: emailPath(`/my-knives/${encodeURIComponent(String(requestId || ""))}`) }
    })
  }),

  unreadCustomerMessages: (customerName, requestId, messageCount) => ({
    subject: `${customerName} left you a message - Nolan's Knives`,
    html: buildPremiumEmail({
      preheader: `${customerName} left an unread message.`,
      eyebrow: "Staff Alert",
      title: "Unread Customer Message",
      body: emailParagraph(`${customerName} left ${messageCount} unread message${messageCount > 1 ? "s" : ""} about ${requestId}.`),
      details: [
        { label: "Customer", value: customerName },
        { label: "Request ID", value: requestId },
        { label: "Unread Messages", value: messageCount }
      ],
      detailTitle: "Message Summary",
      cta: { label: "Open Custom Requests", url: emailPath("/business/custom-requests") },
      footerNote: "Staff alert generated by Nolan's Knives."
    })
  }),

  campaignGeneral: (displayName = "Customer", campaignName = "Nolan's Knives Update") => ({
    subject: `${campaignName} - Nolan's Knives`,
    html: buildPremiumEmail({
      preheader: `An update from Nolan's Knives.`,
      eyebrow: "Nolan's Knives",
      title: campaignName,
      greeting: displayName || "there",
      body: emailParagraph("We wanted to send you an update from Nolan's Knives.") +
        emailParagraph("Take a look around the site for current builds, available knives, and custom request options."),
      cta: { label: "Visit the Store", url: emailPath("/Store") },
      footerNote: `You are receiving this because you have an account with Nolan's Knives. Questions? Reply to this email or contact ${BUSINESS_EMAIL}.`
    })
  }),

  campaignNewInventory: (displayName = "Customer", campaignName = "New Knives Available") => ({
    subject: `${campaignName} - Nolan's Knives`,
    html: buildPremiumEmail({
      preheader: "New available knives have been added to the store.",
      eyebrow: "New Inventory",
      title: campaignName,
      greeting: displayName || "there",
      body: emailParagraph("New knives have been added to the store. If you've been waiting for the next batch, this is a good time to take a look.") +
        emailParagraph("Each available knife is listed with its own photos, details, price, and status."),
      cta: { label: "Shop Available Knives", url: emailPath("/Store") },
      footerNote: `You are receiving this because you have an account with Nolan's Knives. Questions? Reply to this email or contact ${BUSINESS_EMAIL}.`
    })
  }),

  campaignCustomKnifeFollowUp: (displayName = "Customer", campaignName = "Custom Knife Follow-Up") => ({
    subject: `${campaignName} - Nolan's Knives`,
    html: buildPremiumEmail({
      preheader: "Start or resume a custom knife request.",
      eyebrow: "Custom Work",
      title: campaignName,
      greeting: displayName || "there",
      body: emailParagraph("If you're thinking about a custom knife, Nolan can help turn the details into a practical build plan and quote.") +
        emailParagraph("Share the blade style, handle ideas, intended use, and any inspiration details. We'll help shape it from there."),
      cta: { label: "Start a Custom Request", url: emailPath("/custom-knife-request") },
      note: "Questions? Reply to this email and we'll help from there.",
      footerNote: `You are receiving this because you have an account with Nolan's Knives. Questions? Reply to this email or contact ${BUSINESS_EMAIL}.`
    })
  }),

  campaignCareTips: (displayName = "Customer", campaignName = "Knife Care Tips") => ({
    subject: `${campaignName} - Nolan's Knives`,
    html: buildPremiumEmail({
      preheader: "Simple care habits for handmade knives.",
      eyebrow: "Knife Care",
      title: campaignName,
      greeting: displayName || "there",
      body: emailParagraph("A few simple habits keep a handmade knife working beautifully. Treat it like a precision tool and it will reward you for years."),
      details: [
        { label: "Wash", value: "Hand wash only. Avoid the dishwasher." },
        { label: "Dry", value: "Dry completely before putting it away." },
        { label: "Edge", value: "Touch up the edge before it gets fully dull." },
        { label: "Storage", value: "Keep the blade protected and off hard surfaces." }
      ],
      detailTitle: "Care Essentials",
      note: "If you have questions about caring for your knife, reply to this email.",
      footerNote: `You are receiving this because you have an account with Nolan's Knives. Questions? Reply to this email or contact ${BUSINESS_EMAIL}.`
    })
  }),

  campaignAnnouncement: (displayName = "Customer", campaignName = "Nolan's Knives Announcement") => ({
    subject: `${campaignName} - Nolan's Knives`,
    html: buildPremiumEmail({
      preheader: "An announcement from Nolan's Knives.",
      eyebrow: "Announcement",
      title: campaignName,
      greeting: displayName || "there",
      body: emailParagraph("We wanted to share an update from Nolan's Knives.") +
        emailParagraph("You can visit the site for available knives, custom request details, and current account updates."),
      cta: { label: "Visit Nolan's Knives", url: SITE_URL },
      footerNote: `You are receiving this because you have an account with Nolan's Knives. Questions? Reply to this email or contact ${BUSINESS_EMAIL}.`
    })
  }),

  orderComplete: (customerName, requestId, trackingInfo) => ({
    subject: "Your Custom Knife is Ready! - Nolan's Knives",
    html: buildPremiumEmail({
      preheader: "Your custom knife is complete.",
      eyebrow: "Order Complete",
      title: "Your Knife Is Ready",
      greeting: customerName || "there",
      body: emailParagraph("Your custom knife has been completed and is being prepared for delivery.") +
        emailParagraph("You'll receive tracking updates as your package moves."),
      details: [
        { label: "Request ID", value: requestId },
        { label: "Tracking Number", value: trackingInfo }
      ],
      detailTitle: "Shipping Details",
      cta: { label: "View Order", url: emailPath(`/my-knives/${encodeURIComponent(String(requestId || ""))}`) },
      note: "Thank you for choosing Nolan's Knives.",
      noteTone: "success"
    })
  })
};

const emailTemplateMetadata = {
  adminInvite: {
    label: "User Invite",
    description: "Sent when an admin invites a customer, business user, or admin to the site.",
    variables: ["displayName", "firstName", "email", "setupUrl", "inviterName", "role", "roleLabel", "siteUrl", "businessEmail"]
  },
  customRequestSubmitted: {
    label: "Custom Request Confirmation",
    description: "Sent to a customer after a custom knife request is submitted.",
    variables: ["customerName", "firstName", "requestId", "estimatedPrice", "siteUrl", "businessEmail"]
  },
  customRequestSubmittedBusiness: {
    label: "Custom Request Staff Alert",
    description: "Sent to Nolan's team when a customer submits a custom knife request.",
    variables: ["customerName", "firstName", "requestId", "estimatedPrice", "siteUrl", "businessEmail"]
  },
  customRequestPriorityPaid: {
    label: "Priority Request Confirmation",
    description: "Sent to a customer after the priority deposit is paid.",
    variables: ["customerName", "firstName", "requestId", "estimatedPrice", "depositAmount", "siteUrl", "businessEmail"]
  },
  customRequestPriorityPaidBusiness: {
    label: "Priority Request Staff Alert",
    description: "Sent to Nolan's team when a customer pays the priority deposit.",
    variables: ["customerName", "firstName", "requestId", "estimatedPrice", "depositAmount", "siteUrl", "businessEmail"]
  },
  knifePurchasedCustomer: {
    label: "Store Purchase Confirmation",
    description: "Sent to the buyer after a store knife purchase is completed.",
    variables: ["customerName", "firstName", "orderId", "knifeName", "amount", "siteUrl", "businessEmail"]
  },
  knifePurchasedBusiness: {
    label: "Knife Sold Staff Alert",
    description: "Sent to Nolan's team after a store knife purchase is completed.",
    variables: ["customerName", "firstName", "orderId", "knifeName", "amount", "siteUrl", "businessEmail"]
  },
  quoteSent: {
    label: "Custom Quote",
    description: "Sent to a customer when Nolan sends a custom knife quote.",
    variables: ["customerName", "firstName", "requestId", "finalPrice", "depositDue", "remainingBalance", "depositAlreadyPaid", "depositPaymentUrl", "siteUrl", "businessEmail"]
  },
  depositReceived: {
    label: "Quote Deposit Received",
    description: "Sent to a customer after they pay the deposit for a final custom quote.",
    variables: ["customerName", "firstName", "requestId", "depositAmount", "siteUrl", "businessEmail"]
  },
  quoteDepositReceivedBusiness: {
    label: "Quote Deposit Staff Alert",
    description: "Sent to Nolan's team after a customer accepts a final custom quote by paying the deposit.",
    variables: ["customerName", "firstName", "requestId", "depositAmount", "siteUrl", "businessEmail"]
  },
  finalPaymentRequested: {
    label: "Final Payment Request",
    description: "Sent to a customer when Nolan requests the remaining balance on a custom knife.",
    variables: ["customerName", "firstName", "requestId", "finalPrice", "depositPaid", "remainingBalance", "shippingAmount", "taxAmount", "adjustmentAmount", "totalDue", "finalPaymentUrl", "note", "siteUrl", "businessEmail"]
  },
  finalPaymentReceived: {
    label: "Final Payment Confirmation",
    description: "Sent to a customer after the final balance is paid.",
    variables: ["customerName", "firstName", "requestId", "amountPaid", "siteUrl", "businessEmail"]
  },
  finalPaymentReceivedBusiness: {
    label: "Final Payment Staff Alert",
    description: "Sent to Nolan's team after a customer pays the final balance.",
    variables: ["customerName", "firstName", "requestId", "amountPaid", "siteUrl", "businessEmail"]
  },
  statusUpdate: {
    label: "Order Status Update",
    description: "Sent to a customer when a custom request status changes.",
    variables: ["customerName", "firstName", "requestId", "newStatus", "message", "siteUrl", "businessEmail"]
  },
  unreadMessages: {
    label: "Customer Unread Message Reminder",
    description: "Sent to a customer when they have unread staff messages.",
    variables: ["customerName", "firstName", "requestId", "messageCount", "senderName", "siteUrl", "businessEmail"]
  },
  unreadCustomerMessages: {
    label: "Staff Unread Message Reminder",
    description: "Sent to Nolan's team when customers have unread messages.",
    variables: ["customerName", "firstName", "requestId", "messageCount", "siteUrl", "businessEmail"]
  },
  orderComplete: {
    label: "Order Complete / Shipped",
    description: "Sent to a customer when a custom knife is complete or shipped.",
    variables: ["customerName", "firstName", "requestId", "trackingInfo", "siteUrl", "businessEmail"]
  },
  campaignGeneral: {
    label: "Campaign - General",
    description: "A reusable business email campaign template.",
    variables: ["displayName", "firstName", "email", "campaignName", "siteUrl", "businessEmail"]
  },
  campaignNewInventory: {
    label: "Campaign - New Inventory",
    description: "A campaign template for announcing new available knives.",
    variables: ["displayName", "firstName", "email", "campaignName", "siteUrl", "businessEmail"]
  },
  campaignCustomKnifeFollowUp: {
    label: "Campaign - Custom Knife Follow-Up",
    description: "A campaign template for encouraging customers to start or resume custom requests.",
    variables: ["displayName", "firstName", "email", "campaignName", "siteUrl", "businessEmail"]
  },
  campaignCareTips: {
    label: "Campaign - Care Tips",
    description: "A campaign template for care advice and customer education.",
    variables: ["displayName", "firstName", "email", "campaignName", "siteUrl", "businessEmail"]
  },
  campaignAnnouncement: {
    label: "Campaign - Announcement",
    description: "A flexible announcement template for general customer updates.",
    variables: ["displayName", "firstName", "email", "campaignName", "siteUrl", "businessEmail"]
  }
};

const emailTemplateTagConfig = {
  adminInvite: { category: "user-management", audience: "invited-user", lifecycle: "invite" },
  customRequestSubmitted: { category: "custom-request", audience: "customer", lifecycle: "submitted" },
  customRequestSubmittedBusiness: { category: "custom-request", audience: "staff", lifecycle: "submitted" },
  customRequestPriorityPaid: { category: "custom-request", audience: "customer", lifecycle: "priority-paid" },
  customRequestPriorityPaidBusiness: { category: "custom-request", audience: "staff", lifecycle: "priority-paid" },
  knifePurchasedCustomer: { category: "store-order", audience: "customer", lifecycle: "purchase-confirmation" },
  knifePurchasedBusiness: { category: "store-order", audience: "staff", lifecycle: "sale-alert" },
  quoteSent: { category: "custom-quote", audience: "customer", lifecycle: "quote-sent" },
  depositReceived: { category: "custom-quote", audience: "customer", lifecycle: "deposit-received" },
  quoteDepositReceivedBusiness: { category: "custom-quote", audience: "staff", lifecycle: "deposit-received" },
  finalPaymentRequested: { category: "custom-payment", audience: "customer", lifecycle: "final-payment-requested" },
  finalPaymentReceived: { category: "custom-payment", audience: "customer", lifecycle: "final-payment-received" },
  finalPaymentReceivedBusiness: { category: "custom-payment", audience: "staff", lifecycle: "final-payment-received" },
  statusUpdate: { category: "status-update", audience: "customer", lifecycle: "status-update" },
  unreadMessages: { category: "message-reminder", audience: "customer", lifecycle: "unread-message" },
  unreadCustomerMessages: { category: "message-reminder", audience: "staff", lifecycle: "staff-unread" },
  campaignGeneral: { category: "campaign", audience: "marketing", lifecycle: "general" },
  campaignNewInventory: { category: "campaign", audience: "marketing", lifecycle: "new-inventory" },
  campaignCustomKnifeFollowUp: { category: "campaign", audience: "marketing", lifecycle: "custom-knife-follow-up" },
  campaignCareTips: { category: "campaign", audience: "marketing", lifecycle: "care-tips" },
  campaignAnnouncement: { category: "campaign", audience: "marketing", lifecycle: "announcement" },
  orderComplete: { category: "custom-order", audience: "customer", lifecycle: "complete" }
};

const emailTemplateContexts = {
  adminInvite: (displayName, setupUrl, inviterName = "Nolan's Knives", roleLabel = "Admin", role = "admin", email = "") => ({
    displayName,
    email,
    setupUrl,
    inviterName,
    role,
    roleLabel
  }),
  customRequestSubmitted: (customerName, requestId, estimatedPrice) => ({ customerName, requestId, estimatedPrice: formatMoney(estimatedPrice) }),
  customRequestSubmittedBusiness: (customerName, requestId, estimatedPrice) => ({ customerName, requestId, estimatedPrice: formatMoney(estimatedPrice) }),
  customRequestPriorityPaid: (customerName, requestId, estimatedPrice, depositAmount) => ({
    customerName,
    requestId,
    estimatedPrice: formatMoney(estimatedPrice),
    depositAmount: formatMoney(depositAmount)
  }),
  customRequestPriorityPaidBusiness: (customerName, requestId, estimatedPrice, depositAmount) => ({
    customerName,
    requestId,
    estimatedPrice: formatMoney(estimatedPrice),
    depositAmount: formatMoney(depositAmount)
  }),
  knifePurchasedCustomer: (customerName, orderId, knifeName, amount) => ({ customerName, orderId, knifeName, amount: formatMoney(amount) }),
  knifePurchasedBusiness: (customerName, orderId, knifeName, amount) => ({ customerName, orderId, knifeName, amount: formatMoney(amount) }),
  quoteSent: (customerName, requestId, finalPrice, depositDue, remainingBalance, depositAlreadyPaid = false, depositPaymentUrl = "") => ({
    customerName,
    requestId,
    finalPrice: formatMoney(finalPrice),
    depositDue: formatMoney(depositDue),
    remainingBalance: formatMoney(remainingBalance),
    depositAlreadyPaid: depositAlreadyPaid ? "Yes" : "No",
    depositPaymentUrl
  }),
  depositReceived: (customerName, requestId, depositAmount) => ({ customerName, requestId, depositAmount: formatMoney(depositAmount) }),
  quoteDepositReceivedBusiness: (customerName, requestId, depositAmount) => ({ customerName, requestId, depositAmount: formatMoney(depositAmount) }),
  finalPaymentRequested: (
    customerName,
    requestId,
    finalPrice,
    depositPaid,
    remainingBalance,
    shippingAmount,
    taxAmount,
    adjustmentAmount,
    totalDue,
    finalPaymentUrl,
    note = ""
  ) => ({
    customerName,
    requestId,
    finalPrice: formatMoney(finalPrice),
    depositPaid: formatMoney(depositPaid),
    remainingBalance: formatMoney(remainingBalance),
    shippingAmount: formatMoney(shippingAmount),
    taxAmount: formatMoney(taxAmount),
    adjustmentAmount: formatMoney(adjustmentAmount),
    totalDue: formatMoney(totalDue),
    finalPaymentUrl,
    note
  }),
  finalPaymentReceived: (customerName, requestId, amountPaid) => ({ customerName, requestId, amountPaid: formatMoney(amountPaid) }),
  finalPaymentReceivedBusiness: (customerName, requestId, amountPaid) => ({ customerName, requestId, amountPaid: formatMoney(amountPaid) }),
  statusUpdate: (customerName, requestId, newStatus, message) => ({ customerName, requestId, newStatus, message }),
  unreadMessages: (customerName, requestId, messageCount, senderName = "Nolan's team") => ({ customerName, requestId, messageCount, senderName }),
  unreadCustomerMessages: (customerName, requestId, messageCount) => ({ customerName, requestId, messageCount }),
  campaignGeneral: (displayName = "Customer", campaignName = "Nolan's Knives Update") => ({ displayName, campaignName }),
  campaignNewInventory: (displayName = "Customer", campaignName = "New Knives Available") => ({ displayName, campaignName }),
  campaignCustomKnifeFollowUp: (displayName = "Customer", campaignName = "Custom Knife Follow-Up") => ({ displayName, campaignName }),
  campaignCareTips: (displayName = "Customer", campaignName = "Knife Care Tips") => ({ displayName, campaignName }),
  campaignAnnouncement: (displayName = "Customer", campaignName = "Nolan's Knives Announcement") => ({ displayName, campaignName }),
  orderComplete: (customerName, requestId, trackingInfo) => ({ customerName, requestId, trackingInfo })
};

function formatMoney(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "$0.00";
  if (/\{\{\s*[\w.-]+\s*\}\}/.test(raw) || raw.startsWith("$")) return raw;
  const normalized = Number(raw.replace(/[$,]/g, ""));
  return Number.isFinite(normalized) ? `$${normalized.toFixed(2)}` : raw;
}

function firstNameFrom(value) {
  return String(value || "").trim().split(/\s+/)[0] || "";
}

function baseTemplateContext(context = {}) {
  const displayName = context.displayName || context.customerName || "";
  return {
    siteUrl: SITE_URL,
    businessEmail: BUSINESS_EMAIL,
    firstName: firstNameFrom(displayName),
    ...context
  };
}

function renderTemplateString(templateText = "", context = {}, escapeValues = true) {
  return String(templateText).replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_match, key) => {
    const value = key.split(".").reduce((current, part) => current?.[part], context);
    const rendered = value === null || value === undefined ? "" : String(value);
    return escapeValues ? escapeHtml(rendered) : rendered;
  });
}

async function getConfiguredEmailTemplate(templateName) {
  const snap = await db.ref(`emailTemplates/${templateName}`).once("value");
  if (!snap.exists()) return null;

  const template = snap.val() || {};
  if (template.enabled === false) return null;
  if (!template.subject && !template.html) return null;
  return template;
}

async function resolveEmailTemplate(templateName, args = []) {
  const template = emailTemplates[templateName];
  if (!template) {
    throw new Error(`Unknown email template: ${templateName}`);
  }

  const fallback = template(...args);
  const templateContext = emailTemplateContexts[templateName]
    ? emailTemplateContexts[templateName](...args)
    : {};
  const context = baseTemplateContext(templateContext);
  const configured = await getConfiguredEmailTemplate(templateName);
  const subjectSource = configured?.subject || fallback.subject;
  const htmlSource = configured?.html || fallback.html;

  return {
    subject: renderTemplateString(subjectSource, context, false),
    html: renderTemplateString(htmlSource, context, true),
    source: configured ? "database" : "default",
    context
  };
}

function getEmailTemplateCatalogEntry(templateName) {
  const template = emailTemplates[templateName];
  if (!template) return null;

  const sampleArgs = getSampleTemplateArgs(templateName);
  const editableArgs = getEditableTemplateArgs(templateName);
  const editableFallback = template(...(editableArgs.length ? editableArgs : sampleArgs));
  const context = baseTemplateContext(emailTemplateContexts[templateName]
    ? emailTemplateContexts[templateName](...sampleArgs)
    : {});

  return {
    id: templateName,
    label: emailTemplateMetadata[templateName]?.label || templateName,
    description: emailTemplateMetadata[templateName]?.description || "",
    variables: emailTemplateMetadata[templateName]?.variables || [],
    defaultSubject: editableFallback.subject,
    defaultHtml: editableFallback.html,
    editableSubject: editableFallback.subject,
    editableHtml: editableFallback.html,
    previewSubject: renderTemplateString(editableFallback.subject, context, false),
    previewHtml: renderTemplateString(editableFallback.html, context, false),
    sampleContext: context
  };
}

function getSampleTemplateArgs(templateName) {
  const samples = {
    adminInvite: ["Jordan Miller", `${SITE_URL}/account`, "Nolan's Knives", "Business", "business", "jordan@example.com"],
    customRequestSubmitted: ["Jordan Miller", "CR-7K9P2", 575],
    customRequestSubmittedBusiness: ["Jordan Miller", "CR-7K9P2", 575],
    customRequestPriorityPaid: ["Jordan Miller", "CR-7K9P2", 650, 97.5],
    customRequestPriorityPaidBusiness: ["Jordan Miller", "CR-7K9P2", 650, 97.5],
    knifePurchasedCustomer: ["Jordan Miller", "ORD-1042", "Brute-de-Forge Chef Knife", 425],
    knifePurchasedBusiness: ["Jordan Miller", "ORD-1042", "Brute-de-Forge Chef Knife", 425],
    quoteSent: ["Jordan Miller", "CR-7K9P2", 800, 120, 680, false, `${SITE_URL}/custom-knife/confirmation/CR-7K9P2?deposit=1`],
    depositReceived: ["Jordan Miller", "CR-7K9P2", 120],
    quoteDepositReceivedBusiness: ["Jordan Miller", "CR-7K9P2", 120],
    finalPaymentRequested: ["Jordan Miller", "CR-7K9P2", 800, 120, 680, 24, 0, -25, 679, `${SITE_URL}/my-knives/CR-7K9P2/final-payment`, "Your knife is ready for the final balance step."],
    finalPaymentReceived: ["Jordan Miller", "CR-7K9P2", 679],
    finalPaymentReceivedBusiness: ["Jordan Miller", "CR-7K9P2", 679],
    statusUpdate: ["Jordan Miller", "CR-7K9P2", "In Production", "Nolan started your blade this week."],
    unreadMessages: ["Jordan Miller", "CR-7K9P2", 2, "Nolan's team"],
    unreadCustomerMessages: ["Jordan Miller", "CR-7K9P2", 2],
    campaignGeneral: ["Jordan Miller", "Nolan's Knives Update"],
    campaignNewInventory: ["Jordan Miller", "New Knives Available"],
    campaignCustomKnifeFollowUp: ["Jordan Miller", "Custom Knife Follow-Up"],
    campaignCareTips: ["Jordan Miller", "Knife Care Tips"],
    campaignAnnouncement: ["Jordan Miller", "Nolan's Knives Announcement"],
    orderComplete: ["Jordan Miller", "CR-7K9P2", "1Z999AA10123456784"]
  };
  return samples[templateName] || [];
}

function getEditableTemplateArgs(templateName) {
  const variables = {
    adminInvite: ["{{displayName}}", "{{setupUrl}}", "{{inviterName}}", "{{roleLabel}}", "{{role}}", "{{email}}"],
    customRequestSubmitted: ["{{customerName}}", "{{requestId}}", "{{estimatedPrice}}"],
    customRequestSubmittedBusiness: ["{{customerName}}", "{{requestId}}", "{{estimatedPrice}}"],
    customRequestPriorityPaid: ["{{customerName}}", "{{requestId}}", "{{estimatedPrice}}", "{{depositAmount}}"],
    customRequestPriorityPaidBusiness: ["{{customerName}}", "{{requestId}}", "{{estimatedPrice}}", "{{depositAmount}}"],
    knifePurchasedCustomer: ["{{customerName}}", "{{orderId}}", "{{knifeName}}", "{{amount}}"],
    knifePurchasedBusiness: ["{{customerName}}", "{{orderId}}", "{{knifeName}}", "{{amount}}"],
    quoteSent: ["{{customerName}}", "{{requestId}}", "{{finalPrice}}", "{{depositDue}}", "{{remainingBalance}}", false, "{{depositPaymentUrl}}"],
    depositReceived: ["{{customerName}}", "{{requestId}}", "{{depositAmount}}"],
    quoteDepositReceivedBusiness: ["{{customerName}}", "{{requestId}}", "{{depositAmount}}"],
    finalPaymentRequested: ["{{customerName}}", "{{requestId}}", "{{finalPrice}}", "{{depositPaid}}", "{{remainingBalance}}", "{{shippingAmount}}", "{{taxAmount}}", "{{adjustmentAmount}}", "{{totalDue}}", "{{finalPaymentUrl}}", "{{note}}"],
    finalPaymentReceived: ["{{customerName}}", "{{requestId}}", "{{amountPaid}}"],
    finalPaymentReceivedBusiness: ["{{customerName}}", "{{requestId}}", "{{amountPaid}}"],
    statusUpdate: ["{{customerName}}", "{{requestId}}", "{{newStatus}}", "{{message}}"],
    unreadMessages: ["{{customerName}}", "{{requestId}}", "{{messageCount}}", "{{senderName}}"],
    unreadCustomerMessages: ["{{customerName}}", "{{requestId}}", "{{messageCount}}"],
    campaignGeneral: ["{{displayName}}", "{{campaignName}}"],
    campaignNewInventory: ["{{displayName}}", "{{campaignName}}"],
    campaignCustomKnifeFollowUp: ["{{displayName}}", "{{campaignName}}"],
    campaignCareTips: ["{{displayName}}", "{{campaignName}}"],
    campaignAnnouncement: ["{{displayName}}", "{{campaignName}}"],
    orderComplete: ["{{customerName}}", "{{requestId}}", "{{trackingInfo}}"]
  };
  return variables[templateName] || [];
}

function mailgunMetadataValue(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value).slice(0, 998);
  return String(value).slice(0, 998);
}

function safeMailgunTag(value) {
  const tag = String(value || "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9:._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return tag.slice(0, 128);
}

function mailgunTagPart(value) {
  return safeMailgunTag(String(value || "")
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replace(/['’]/g, "")
    .replace(/&/g, "and"))
    .replace(/:/g, "-")
    .toLowerCase()
    .slice(0, 96);
}

function prefixedMailgunTag(prefix, value) {
  const part = mailgunTagPart(value);
  return part ? `${prefix}:${part}` : "";
}

function addMailgunTag(tags, value) {
  const tag = safeMailgunTag(value);
  if (tag && !tags.includes(tag)) tags.push(tag);
}

function normalizeMetadataForMailgun(metadata = {}) {
  return Object.entries(metadata)
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .reduce((acc, [key, value]) => ({ ...acc, [key]: mailgunMetadataValue(value) }), {});
}

function buildMailgunTags(metadata = {}) {
  const cleanMetadata = normalizeMetadataForMailgun(metadata);
  const tags = [];
  const templateName = cleanMetadata.templateName || "raw";
  const templateConfig = emailTemplateTagConfig[templateName] || {};
  const isCampaign =
    !!cleanMetadata.campaignId ||
    cleanMetadata.emailCategory === "campaign" ||
    String(templateName).startsWith("campaign");

  addMailgunTag(tags, "nolans-knives");
  if (templateName) addMailgunTag(tags, `template:${templateName}`);
  if (isCampaign) addMailgunTag(tags, "campaign");

  addMailgunTag(tags, prefixedMailgunTag(
    "category",
    cleanMetadata.emailCategory || templateConfig.category || (isCampaign ? "campaign" : "transactional")
  ));
  addMailgunTag(tags, prefixedMailgunTag(
    "audience",
    cleanMetadata.emailAudience || templateConfig.audience || (isCampaign ? "marketing" : "customer")
  ));
  addMailgunTag(tags, prefixedMailgunTag(
    "lifecycle",
    cleanMetadata.emailLifecycle || templateConfig.lifecycle || templateName
  ));
  addMailgunTag(tags, prefixedMailgunTag("source", cleanMetadata.templateSource));
  addMailgunTag(tags, prefixedMailgunTag("role", cleanMetadata.role || cleanMetadata.recipientRole));
  if (isCampaign) addMailgunTag(tags, prefixedMailgunTag("campaign", cleanMetadata.campaignName));

  const extraTags = metadata.tags || metadata.mailgunTags || [];
  (Array.isArray(extraTags) ? extraTags : [extraTags]).forEach((tag) => addMailgunTag(tags, tag));

  return tags.slice(0, 10);
}

function appendMailgunMetadata(form, metadata = {}) {
  const cleanMetadata = normalizeMetadataForMailgun(metadata);

  Object.entries(cleanMetadata).forEach(([key, value]) => {
    if (/^[a-zA-Z0-9_-]+$/.test(key)) {
      form.append(`v:${key}`, value);
    }
  });

  const tags = buildMailgunTags(metadata);
  tags.forEach((tag) => form.append("o:tag", tag));
  return tags;
}

async function sendViaMailgunHttp({ to, subject, html, metadata = {} }) {
  const form = new URLSearchParams();
  form.append("from", FROM_EMAIL);
  form.append("to", to);
  form.append("subject", subject);
  form.append("html", html);
  const tags = appendMailgunMetadata(form, metadata);

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
    response: response.data?.message || null,
    tags
  };
}

async function sendViaSmtp({ to, subject, html, metadata = {} }) {
  if (!SMTP_PASS) {
    return { skipped: true, mode: "smtp-not-configured" };
  }

  const tags = buildMailgunTags(metadata);
  const result = await transporter.sendMail({
    from: FROM_EMAIL,
    to,
    subject,
    html,
    headers: tags.map((tag) => ({ key: "X-Mailgun-Tag", value: tag }))
  });

  return {
    provider: "smtp",
    messageId: result.messageId || null,
    tags
  };
}

// Helper: Send Email
async function sendEmail(to, templateName, ...args) {
  try {
    const { subject, html, source, context } = await resolveEmailTemplate(templateName, args);
    const tagConfig = emailTemplateTagConfig[templateName] || {};

    if (!MAILGUN_API_KEY && !SMTP_PASS) {
      console.log(`[TEST MODE] Email not sent. To: ${to}, Template: ${templateName}`);
      await logNotificationEvent("email_skipped_test_mode", { to, template: templateName, source });
      return { skipped: true, mode: "test" };
    }

    const metadata = {
      templateName,
      templateSource: source,
      emailCategory: tagConfig.category,
      emailAudience: tagConfig.audience,
      emailLifecycle: tagConfig.lifecycle,
      role: context?.role || ""
    };
    const result = MAILGUN_API_KEY
      ? await sendViaMailgunHttp({ to, subject, html, metadata })
      : await sendViaSmtp({ to, subject, html, metadata });

    // Log successful send
    await logNotificationEvent("email_sent", {
      to,
      template: templateName,
      source,
      provider: result.provider,
      messageId: result.messageId || null,
      mailgunTags: result.tags || []
    });

    return result;
  } catch (error) {
    console.error(`Error sending ${templateName} email to ${to}:`, error);
    await logNotificationEvent("email_failed", { to, template: templateName, error: error.message });
    // Don't throw - email failures shouldn't block the main operation
    return { error: error.message, skipped: true };
  }
}

async function sendRawEmail({ to, subject, html, metadata = {} }) {
  try {
    if (!MAILGUN_API_KEY && !SMTP_PASS) {
      console.log(`[TEST MODE] Raw email not sent. To: ${to}, Subject: ${subject}`);
      await logNotificationEvent("email_skipped_test_mode", { to, template: "raw", ...metadata });
      return { skipped: true, mode: "test" };
    }

    const result = MAILGUN_API_KEY
      ? await sendViaMailgunHttp({ to, subject, html, metadata })
      : await sendViaSmtp({ to, subject, html, metadata });

    await logNotificationEvent("email_sent", {
      to,
      template: metadata.templateName || "raw",
      provider: result.provider,
      messageId: result.messageId || null,
      mailgunTags: result.tags || [],
      ...metadata
    });

    return result;
  } catch (error) {
    console.error(`Error sending raw email to ${to}:`, error);
    await logNotificationEvent("email_failed", { to, template: metadata.templateName || "raw", error: error.message, ...metadata });
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
  res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.set(
    "Access-Control-Allow-Headers",
    req.get("Access-Control-Request-Headers") || "Authorization, Content-Type, X-Firebase-AppCheck, X-Client-Version"
  );
  res.set("Access-Control-Max-Age", "3600");
}

function sendHttpError(res, error, fallbackMessage = "Request failed.") {
  const code = error?.code || "internal";
  const message = error?.message || fallbackMessage;
  const status =
    code === "unauthenticated" ? 401 :
    code === "permission-denied" ? 403 :
    code === "not-found" ? 404 :
    code === "failed-precondition" || code === "invalid-argument" ? 400 :
    500;

  return res.status(status).json({ error: code, message });
}

function publicFunctionUrl(functionName) {
  const projectId = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || "nolansknives";
  return `https://${FUNCTION_REGION}-${projectId}.cloudfunctions.net/${functionName}`;
}

function safeFirebaseKey(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return raw.replace(/[.#$/[\]]/g, "_").slice(0, 700);
}

function hashText(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function parseJsonField(value) {
  if (!value || typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch (_error) {
    return value;
  }
}

function firstFieldValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeMailgunWebhookBody(body = {}) {
  const parsedEventData = parseJsonField(body["event-data"] || body.eventData);
  const eventData = parsedEventData || { ...body };
  if (!parsedEventData && eventData && typeof eventData === "object") {
    delete eventData.signature;
    delete eventData.timestamp;
    delete eventData.token;
    delete eventData["parent-signature"];
  }
  const rawSignature = body.signature;
  const signature = rawSignature && typeof rawSignature === "object"
    ? rawSignature
    : {
      timestamp: firstFieldValue(body.timestamp),
      token: firstFieldValue(body.token),
      signature: firstFieldValue(rawSignature),
      "parent-signature": firstFieldValue(body["parent-signature"])
    };

  return {
    signature: signature || {},
    eventData: eventData || {},
    rawPayload: body
  };
}

function timingSafeEqualHex(left = "", right = "") {
  const leftBuffer = Buffer.from(String(left), "hex");
  const rightBuffer = Buffer.from(String(right), "hex");
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function verifyMailgunWebhookSignature(signature = {}) {
  if (!MAILGUN_WEBHOOK_SIGNING_KEY) {
    return { ok: true, status: "unconfigured", reason: "MAILGUN_WEBHOOK_SIGNING_KEY is not configured." };
  }

  const timestamp = String(signature.timestamp || "");
  const token = String(signature.token || "");
  const providedSignatures = [signature.signature, signature["parent-signature"]]
    .map((value) => String(value || "").trim())
    .filter(Boolean);

  if (!timestamp || !token || providedSignatures.length === 0) {
    return { ok: false, status: "missing", reason: "Missing Mailgun signature fields." };
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  const timestampSeconds = Number(timestamp);
  if (
    Number.isFinite(timestampSeconds) &&
    MAILGUN_WEBHOOK_MAX_AGE_SECONDS > 0 &&
    Math.abs(nowSeconds - timestampSeconds) > MAILGUN_WEBHOOK_MAX_AGE_SECONDS
  ) {
    return { ok: false, status: "expired", reason: "Mailgun webhook timestamp is outside the accepted window." };
  }

  const expected = crypto
    .createHmac("sha256", MAILGUN_WEBHOOK_SIGNING_KEY)
    .update(`${timestamp}${token}`)
    .digest("hex");

  const matched = providedSignatures.some((candidate) => {
    try {
      return timingSafeEqualHex(expected, candidate);
    } catch (_error) {
      return false;
    }
  });

  return matched
    ? { ok: true, status: "verified" }
    : { ok: false, status: "invalid", reason: "Mailgun webhook signature did not match." };
}

async function cacheMailgunWebhookToken(signature = {}) {
  const token = String(signature.token || "").trim();
  if (!token) return { duplicate: false };

  const tokenKey = safeFirebaseKey(token) || hashText(token);
  const tokenRef = db.ref(`mailgunWebhookTokens/${tokenKey}`);
  const tokenSnap = await tokenRef.once("value");
  if (tokenSnap.exists()) {
    return { duplicate: true, tokenKey };
  }

  await tokenRef.set({
    timestamp: Number(signature.timestamp || 0) || null,
    createdAt: admin.database.ServerValue.TIMESTAMP
  });

  return { duplicate: false, tokenKey };
}

function normalizeMailgunUserVariables(value) {
  const parsed = parseJsonField(value);
  if (!parsed) return {};
  if (!Array.isArray(parsed) && typeof parsed === "object") return parsed;
  if (!Array.isArray(parsed)) return {};

  return parsed.reduce((acc, item) => {
    if (!item || typeof item !== "object") return acc;
    const key = item.key || item.name;
    if (!key) return acc;
    acc[key] = item.value ?? item.val ?? "";
    return acc;
  }, {});
}

function normalizeMailgunTags(value) {
  const parsed = parseJsonField(value);
  const list = Array.isArray(parsed)
    ? parsed
    : typeof parsed === "string"
      ? parsed.split(",")
      : [];

  return [...new Set(list
    .map((tag) => String(tag || "").trim())
    .filter(Boolean)
    .map((tag) => tag.slice(0, 128)))];
}

function mailgunEventCounter(eventData = {}) {
  const event = String(eventData.event || "unknown");
  if (event === "failed") {
    return eventData.severity === "permanent" ? "permanentFailures" : "temporaryFailures";
  }
  if (event === "complained") return "complaints";
  if (event === "unsubscribed") return "unsubscribes";
  if (event === "opened") return "opens";
  if (event === "clicked") return "clicks";
  if (event === "delivered") return "delivered";
  if (event === "accepted") return "accepted";
  return "other";
}

function mailgunEventKey(eventData = {}) {
  const event = String(eventData.event || "event");
  const recipient = normalizeEmail(eventData.recipient || eventData.envelope?.targets || "");
  const messageId = eventData.message?.headers?.["message-id"] || "";
  const seed = eventData.id || `${event}:${eventData.timestamp || ""}:${recipient}:${messageId}`;
  return `${safeFirebaseKey(event)}_${hashText(seed).slice(0, 32)}`;
}

function extractMailgunEventSummary(eventData = {}, verification = {}) {
  const headers = eventData.message?.headers || {};
  const userVariables = normalizeMailgunUserVariables(eventData["user-variables"] || eventData.userVariables);
  const eventAt = Number.isFinite(Number(eventData.timestamp))
    ? Math.round(Number(eventData.timestamp) * 1000)
    : Date.now();

  return {
    eventKey: mailgunEventKey(eventData),
    mailgunEventId: eventData.id || "",
    event: eventData.event || "unknown",
    severity: eventData.severity || "",
    reason: eventData.reason || "",
    recipient: normalizeEmail(eventData.recipient || eventData.envelope?.targets || ""),
    recipientDomain: eventData["recipient-domain"] || "",
    domainName: eventData.domain?.name || "",
    accountId: eventData.account?.id || "",
    messageId: headers["message-id"] || "",
    subject: headers.subject || "",
    url: eventData.url || "",
    campaignId: userVariables.campaignId || "",
    campaignName: userVariables.campaignName || "",
    recipientUid: userVariables.recipientUid || "",
    templateName: userVariables.templateName || "",
    templateSource: userVariables.templateSource || "",
    emailCategory: userVariables.emailCategory || "",
    emailAudience: userVariables.emailAudience || "",
    emailLifecycle: userVariables.emailLifecycle || "",
    tags: normalizeMailgunTags(eventData.tags),
    provider: "mailgun",
    counter: mailgunEventCounter(eventData),
    eventAt,
    receivedAt: admin.database.ServerValue.TIMESTAMP,
    signatureStatus: verification.status || "unknown"
  };
}

async function findUserUidForMailgunEvent(summary = {}) {
  if (summary.recipientUid) return summary.recipientUid;
  if (!summary.recipient) return "";

  const snap = await db.ref("users").orderByChild("email").equalTo(summary.recipient).limitToFirst(1).once("value");
  if (!snap.exists()) return "";
  return Object.keys(snap.val() || {})[0] || "";
}

function mailgunUserDeliveryUpdates(summary = {}) {
  const eventPathValue = summary.event === "failed" && summary.severity
    ? `${summary.event}_${summary.severity}`
    : summary.event;
  const updates = {
    "emailDelivery/lastEvent": eventPathValue,
    "emailDelivery/lastEventAt": summary.eventAt,
    "emailDelivery/lastMailgunEventKey": summary.eventKey,
    updatedAt: admin.database.ServerValue.TIMESTAMP
  };

  if (summary.event === "accepted") updates["emailDelivery/acceptedAt"] = summary.eventAt;
  if (summary.event === "delivered") updates["emailDelivery/deliveredAt"] = summary.eventAt;
  if (summary.event === "opened") updates["emailDelivery/openedAt"] = summary.eventAt;
  if (summary.event === "clicked") updates["emailDelivery/clickedAt"] = summary.eventAt;
  if (summary.event === "unsubscribed") {
    updates["emailDelivery/unsubscribedAt"] = summary.eventAt;
    updates["emailPreferences/marketingSubscribed"] = false;
    updates["emailPreferences/marketingUnsubscribedAt"] = summary.eventAt;
    updates["emailSuppression/status"] = "unsubscribed";
    updates["emailSuppression/reason"] = "mailgun_unsubscribed";
    updates["emailSuppression/updatedAt"] = admin.database.ServerValue.TIMESTAMP;
  }
  if (summary.event === "complained") {
    updates["emailDelivery/complainedAt"] = summary.eventAt;
    updates["emailPreferences/marketingSubscribed"] = false;
    updates["emailSuppression/status"] = "complained";
    updates["emailSuppression/reason"] = "mailgun_complaint";
    updates["emailSuppression/updatedAt"] = admin.database.ServerValue.TIMESTAMP;
  }
  if (summary.event === "failed") {
    updates[`emailDelivery/${summary.severity === "permanent" ? "permanentFailureAt" : "temporaryFailureAt"}`] = summary.eventAt;
    if (summary.severity === "permanent") {
      updates["emailSuppression/status"] = "permanent_failure";
      updates["emailSuppression/reason"] = summary.reason || "mailgun_permanent_failure";
      updates["emailSuppression/updatedAt"] = admin.database.ServerValue.TIMESTAMP;
    }
  }

  return updates;
}

async function recordMailgunWebhookEvent(eventData = {}, verification = {}) {
  const summary = extractMailgunEventSummary(eventData, verification);
  const eventRef = db.ref(`mailgunWebhookEvents/${summary.eventKey}`);
  const existing = await eventRef.once("value");
  if (existing.exists()) {
    return { duplicate: true, summary };
  }

  const recipientUid = await findUserUidForMailgunEvent(summary);
  if (recipientUid) summary.recipientUid = recipientUid;

  const eventRecord = {
    ...summary,
    raw: eventData
  };

  const updates = {
    [`mailgunWebhookEvents/${summary.eventKey}`]: eventRecord,
    "mailgunWebhookStatus/latest": summary,
    "mailgunWebhookStatus/updatedAt": admin.database.ServerValue.TIMESTAMP,
    [`mailgunWebhookStatus/counts/${summary.counter}`]: admin.database.ServerValue.increment(1)
  };

  (summary.tags || []).forEach((tag) => {
    const tagKey = safeFirebaseKey(tag);
    if (tagKey) updates[`mailgunWebhookStatus/tagCounts/${tagKey}`] = admin.database.ServerValue.increment(1);
  });

  if (summary.messageId) {
    const messageKey = hashText(summary.messageId);
    updates[`mailgunMessageEvents/${messageKey}/events/${summary.eventKey}`] = summary;
    updates[`mailgunMessageEvents/${messageKey}/latest`] = summary;
  }

  if (summary.campaignId) {
    const campaignKey = safeFirebaseKey(summary.campaignId);
    const recipientKey = safeFirebaseKey(summary.recipientUid || summary.recipient || "unknown");
    updates[`emailCampaigns/${campaignKey}/eventCounts/${summary.counter}`] = admin.database.ServerValue.increment(1);
    updates[`emailCampaigns/${campaignKey}/lastMailgunEvent`] = summary;
    updates[`emailCampaigns/${campaignKey}/updatedAt`] = admin.database.ServerValue.TIMESTAMP;
    updates[`emailCampaigns/${campaignKey}/recipients/${recipientKey}/latestMailgunEvent`] = summary.event;
    updates[`emailCampaigns/${campaignKey}/recipients/${recipientKey}/latestMailgunEventAt`] = summary.eventAt;
    updates[`emailCampaigns/${campaignKey}/recipients/${recipientKey}/events/${summary.eventKey}`] = summary;
    (summary.tags || []).forEach((tag) => {
      const tagKey = safeFirebaseKey(tag);
      if (tagKey) updates[`emailCampaigns/${campaignKey}/tagCounts/${tagKey}`] = admin.database.ServerValue.increment(1);
    });
  }

  if (recipientUid) {
    const userUpdates = mailgunUserDeliveryUpdates(summary);
    Object.entries(userUpdates).forEach(([path, value]) => {
      updates[`users/${recipientUid}/${path}`] = value;
    });
  }

  await db.ref().update(updates);
  await logNotificationEvent("mailgun_webhook_received", {
    event: summary.event,
    severity: summary.severity,
    recipient: summary.recipient,
    campaignId: summary.campaignId || null,
    templateName: summary.templateName || null,
    emailCategory: summary.emailCategory || null,
    emailAudience: summary.emailAudience || null,
    emailLifecycle: summary.emailLifecycle || null,
    tags: summary.tags || [],
    signatureStatus: summary.signatureStatus
  });

  return { duplicate: false, summary };
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

function isQuoteAcceptanceDeposit(customRequest = {}) {
  const status = String(customRequest.status || "").toLowerCase();
  const finalPrice = Number(customRequest.finalPrice || 0);
  return Boolean(
    finalPrice > 0 &&
    (
      status === "quote_sent" ||
      status === "pending_acceptance" ||
      customRequest.quoteId ||
      customRequest.quoteSentAt
    )
  );
}

function getCustomRequestDepositPaymentUrl(requestId) {
  return `${SITE_URL}/custom-knife/confirmation/${encodeURIComponent(requestId)}?deposit=1`;
}

function moneyValue(value, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;
  const amount = Number(String(value).replace(/[$,]/g, ""));
  return Number.isFinite(amount) ? Number(amount.toFixed(2)) : fallback;
}

function getCustomRequestDepositPaidAmount(customRequest = {}) {
  const paymentDeposit = customRequest.payments?.deposit || {};
  const candidates = [
    paymentDeposit.amount,
    paymentDeposit.paidAmount,
    customRequest.depositPaid,
    customRequest.depositAmount
  ];

  if (!hasPaidCustomRequestDeposit(customRequest)) return 0;

  for (const candidate of candidates) {
    const amount = moneyValue(candidate, 0);
    if (amount > 0) return amount;
  }

  return 0;
}

function getCustomRequestFinalPaymentUrl(requestId) {
  return `${SITE_URL}/my-knives/${encodeURIComponent(requestId)}/final-payment`;
}

function hasPaidCustomRequestFinalPayment(customRequest = {}) {
  return Boolean(
    customRequest.finalPaymentStatus === "paid" ||
    customRequest.payments?.final?.status === "paid" ||
    customRequest.finalPaymentPaidAt
  );
}

function getRequestedFinalPaymentAmount(customRequest = {}) {
  return moneyValue(
    customRequest.payments?.final?.amount ??
      customRequest.finalPaymentAmount ??
      customRequest.balanceDue,
    0
  );
}

function buildFinalPaymentSummary(customRequest = {}, paymentDraft = {}) {
  const finalPrice = moneyValue(customRequest.finalPrice || customRequest.quotedPrice || customRequest.quote?.finalPrice, 0);
  const depositPaid = moneyValue(
    paymentDraft.depositPaid,
    getCustomRequestDepositPaidAmount(customRequest) || moneyValue(customRequest.depositAmount, 0)
  );
  const defaultRemaining = Math.max(finalPrice - depositPaid, 0);
  const existingFinal = customRequest.payments?.final || {};
  const remainingBalance = moneyValue(
    paymentDraft.remainingBalance ?? existingFinal.remainingBalance ?? customRequest.remainingBalance,
    defaultRemaining
  );
  const shippingAmount = moneyValue(paymentDraft.shippingAmount ?? existingFinal.shippingAmount, 0);
  const taxAmount = moneyValue(paymentDraft.taxAmount ?? existingFinal.taxAmount, 0);
  const adjustmentAmount = moneyValue(paymentDraft.adjustmentAmount ?? existingFinal.adjustmentAmount, 0);
  const totalDue = moneyValue(paymentDraft.amount, remainingBalance + shippingAmount + taxAmount + adjustmentAmount);

  return {
    finalPrice,
    depositPaid,
    remainingBalance,
    shippingAmount,
    taxAmount,
    adjustmentAmount,
    totalDue: Math.max(totalDue, 0)
  };
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
      await sendEmail(BUSINESS_EMAIL, "customRequestSubmittedBusiness", requestData.customerName, requestId, serverPrice);
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
        await sendEmail(BUSINESS_EMAIL, 'customRequestSubmittedBusiness', request.customerName || 'Customer', requestId, serverPrice);
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
    const quoteAcceptanceDeposit = isQuoteAcceptanceDeposit(customRequest);

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
          description: quoteAcceptanceDeposit
            ? "15% custom knife quote acceptance deposit"
            : "15% custom knife request priority deposit"
        }]
      },
      { auth: { username: paypalClientId, password: paypalClientSecret } }
    );

    const paypalOrderId = paypalResponse.data.id;
    await db.ref(`customRequests/${requestId}`).update({
      "depositPayPal/orderId": paypalOrderId,
      "depositPayPal/status": paypalResponse.data.status || "CREATED",
      "depositPayPal/purpose": quoteAcceptanceDeposit ? "quote_acceptance" : "priority_review",
      updatedAt: admin.database.ServerValue.TIMESTAMP
    });

    await logAuditAction("custom_request_deposit_paypal_created", uid, "customer", uid, {
      requestId,
      paypalOrderId,
      amount,
      depositPurpose: quoteAcceptanceDeposit ? "quote_acceptance" : "priority_review"
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
    const quoteAcceptanceDeposit = isQuoteAcceptanceDeposit(customRequest);
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
      status: quoteAcceptanceDeposit ? "quote_accepted" : "priority_review",
      priority: quoteAcceptanceDeposit ? !!customRequest.priority : true,
      chatEnabled: true,
      priorityDepositPaid: quoteAcceptanceDeposit ? !!customRequest.priorityDepositPaid : true,
      paymentStatus: "paid",
      depositPaidAt: admin.database.ServerValue.TIMESTAMP,
      depositPurpose: quoteAcceptanceDeposit ? "quote_acceptance" : "priority_review",
      depositRequired: 0,
      updatedAt: admin.database.ServerValue.TIMESTAMP,
      "payments/deposit/status": "paid",
      "payments/deposit/amount": amount,
      "payments/deposit/purpose": quoteAcceptanceDeposit ? "quote_acceptance" : "priority_review",
      "payments/deposit/paidAt": admin.database.ServerValue.TIMESTAMP,
      "payments/deposit/paypalOrderId": paypalOrderId,
      "payments/deposit/paypalCaptureId": captureResponse.data.id || null,
      "payments/deposit/paypalStatus": captureResponse.data.status,
      "depositPayPal/orderId": paypalOrderId,
      "depositPayPal/captureId": captureResponse.data.id || null,
      "depositPayPal/payerId": captureResponse.data.payer?.payer_id || null,
      "depositPayPal/payerEmail": captureResponse.data.payer?.email_address || null,
      "depositPayPal/status": captureResponse.data.status,
      "depositPayPal/purpose": quoteAcceptanceDeposit ? "quote_acceptance" : "priority_review"
    };
    if (quoteAcceptanceDeposit) {
      updates.quoteAcceptedAt = admin.database.ServerValue.TIMESTAMP;
    }

    const paymentWrites = [
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
    ];
    if (quoteAcceptanceDeposit && customRequest.quoteId) {
      paymentWrites.push(db.ref(`quotes/${customRequest.quoteId}`).update({
        status: "accepted",
        depositPaid: amount,
        acceptedAt: admin.database.ServerValue.TIMESTAMP,
        updatedAt: admin.database.ServerValue.TIMESTAMP
      }));
    }
    await Promise.all(paymentWrites);

    await logAuditAction(
      quoteAcceptanceDeposit ? "custom_quote_deposit_paid" : "custom_request_priority_deposit_paid",
      uid,
      "customer",
      uid,
      {
        requestId,
        paypalOrderId,
        captureId: captureResponse.data.id || null,
        amount,
        depositPurpose: quoteAcceptanceDeposit ? "quote_acceptance" : "priority_review"
      }
    );

    try {
      if (quoteAcceptanceDeposit) {
        await sendEmail(
          customRequest.customerEmail,
          "depositReceived",
          customRequest.customerName || "Customer",
          requestId,
          amount
        );
        await sendEmail(
          BUSINESS_EMAIL,
          "quoteDepositReceivedBusiness",
          customRequest.customerName || "Customer",
          requestId,
          amount
        );
      } else {
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
      }
    } catch (emailError) {
      console.warn("Custom request deposit email failed:", emailError.message);
    }

    return res.status(200).json({ success: true, requestId, amount });
  } catch (error) {
    const code = error?.code || "internal";
    const message = error?.message || "Failed to capture custom request deposit.";
    return res.status(code === "unauthenticated" ? 401 : 400).json({ error: code, message });
  }
});

exports.requestCustomRequestFinalPaymentHttp = onRequest(async (req, res) => {
  applyCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).send("");
  if (req.method !== "POST") return res.status(405).json({ error: "method-not-allowed" });

  try {
    const uid = await requireUidFromRequest(req);
    const isStaff = await verifyUserRole(uid, "business");
    if (!isStaff) throw new HttpsError("permission-denied", "Only staff can request final payment.");

    const {
      requestId,
      remainingBalance,
      shippingAmount,
      taxAmount,
      adjustmentAmount,
      note = ""
    } = req.body || {};
    if (!requestId) throw new HttpsError("invalid-argument", "requestId is required.");

    const requestSnap = await db.ref(`customRequests/${requestId}`).once("value");
    if (!requestSnap.exists()) throw new HttpsError("not-found", "Custom request not found.");

    const customRequest = requestSnap.val() || {};
    if (!customRequest.customerEmail) {
      throw new HttpsError("failed-precondition", "This request does not have a customer email.");
    }
    if (hasPaidCustomRequestFinalPayment(customRequest)) {
      throw new HttpsError("failed-precondition", "This request is already paid in full.");
    }

    let quote = customRequest.quote || null;
    if (!quote && customRequest.quoteId) {
      const quoteSnap = await db.ref(`quotes/${customRequest.quoteId}`).once("value");
      quote = quoteSnap.exists() ? quoteSnap.val() : null;
    }

    const requestWithQuote = { ...customRequest, quote };
    const summary = buildFinalPaymentSummary(requestWithQuote, {
      remainingBalance,
      shippingAmount,
      taxAmount,
      adjustmentAmount
    });

    if (!summary.finalPrice || summary.finalPrice <= 0) {
      throw new HttpsError("failed-precondition", "Send a final quote before requesting final payment.");
    }
    if (!summary.totalDue || summary.totalDue <= 0) {
      throw new HttpsError("invalid-argument", "Final payment amount must be greater than zero.");
    }

    const cleanNote = String(note || "").trim();
    const finalPaymentUrl = getCustomRequestFinalPaymentUrl(requestId);
    const now = admin.database.ServerValue.TIMESTAMP;
    const finalPaymentRecord = {
      status: "requested",
      amount: summary.totalDue,
      finalPrice: summary.finalPrice,
      depositPaid: summary.depositPaid,
      remainingBalance: summary.remainingBalance,
      shippingAmount: summary.shippingAmount,
      taxAmount: summary.taxAmount,
      adjustmentAmount: summary.adjustmentAmount,
      note: cleanNote,
      paymentUrl: finalPaymentUrl,
      requestedAt: now,
      requestedBy: uid,
      emailStatus: "pending"
    };

    const messageId = db.ref("messages").push().key;
    const profile = await getUserProfile(uid);
    const messageText = `Final payment requested: $${summary.totalDue.toFixed(2)} due.${cleanNote ? ` ${cleanNote}` : ""}`;
    const updates = {
      [`customRequests/${requestId}/status`]: "awaiting_final_payment",
      [`customRequests/${requestId}/balanceDue`]: summary.totalDue,
      [`customRequests/${requestId}/finalPaymentAmount`]: summary.totalDue,
      [`customRequests/${requestId}/finalPaymentStatus`]: "requested",
      [`customRequests/${requestId}/finalPaymentRequestedAt`]: now,
      [`customRequests/${requestId}/finalPaymentRequestedBy`]: uid,
      [`customRequests/${requestId}/finalPaymentUrl`]: finalPaymentUrl,
      [`customRequests/${requestId}/remainingBalance`]: summary.remainingBalance,
      [`customRequests/${requestId}/shippingAmount`]: summary.shippingAmount,
      [`customRequests/${requestId}/taxAmount`]: summary.taxAmount,
      [`customRequests/${requestId}/adjustmentAmount`]: summary.adjustmentAmount,
      [`customRequests/${requestId}/finalPaymentNote`]: cleanNote,
      [`customRequests/${requestId}/payments/final`]: finalPaymentRecord,
      [`customRequests/${requestId}/updatedAt`]: now,
      [`customRequests/${requestId}/lastUpdatedAt`]: now,
      [`customRequests/${requestId}/lastUpdatedBy`]: uid,
      [`messages/${requestId}/${messageId}`]: {
        messageId,
        senderUid: uid,
        senderRole: profile?.role || "business",
        text: messageText,
        createdAt: now,
        readByCustomer: false,
        readByStaff: true,
        isSystemMessage: true
      },
      [`conversations/${requestId}/conversationId`]: requestId,
      [`conversations/${requestId}/customRequestId`]: requestId,
      [`conversations/${requestId}/customerUid`]: customRequest.uid,
      [`conversations/${requestId}/conversationType`]: "customRequest",
      [`conversations/${requestId}/status`]: "open",
      [`conversations/${requestId}/updatedAt`]: now,
      [`conversations/${requestId}/lastMessageAt`]: now,
      [`conversations/${requestId}/unreadByCustomer`]: admin.database.ServerValue.increment(1)
    };

    if (customRequest.quoteId) {
      updates[`quotes/${customRequest.quoteId}/status`] = "final_payment_requested";
      updates[`quotes/${customRequest.quoteId}/remainingBalance`] = summary.remainingBalance;
      updates[`quotes/${customRequest.quoteId}/finalPaymentAmount`] = summary.totalDue;
      updates[`quotes/${customRequest.quoteId}/finalPaymentRequestedAt`] = now;
      updates[`quotes/${customRequest.quoteId}/updatedAt`] = now;
    }

    await db.ref().update(updates);

    try {
      const emailResult = await sendRequiredEmail(
        customRequest.customerEmail,
        "finalPaymentRequested",
        customRequest.customerName || "Customer",
        requestId,
        summary.finalPrice,
        summary.depositPaid,
        summary.remainingBalance,
        summary.shippingAmount,
        summary.taxAmount,
        summary.adjustmentAmount,
        summary.totalDue,
        finalPaymentUrl,
        cleanNote
      );
      await db.ref(`customRequests/${requestId}/payments/final`).update({
        emailStatus: "sent",
        emailMessageId: emailResult.messageId || null,
        emailSentAt: admin.database.ServerValue.TIMESTAMP
      });
    } catch (emailError) {
      await db.ref(`customRequests/${requestId}/payments/final`).update({
        emailStatus: "failed",
        emailError: emailError.message || "Final payment email failed.",
        emailFailedAt: admin.database.ServerValue.TIMESTAMP
      });
      throw new HttpsError("internal", "Final payment request saved, but the email failed to send.");
    }

    await logAuditAction("custom_final_payment_requested", uid, profile?.role || "business", customRequest.uid, {
      requestId,
      amount: summary.totalDue,
      remainingBalance: summary.remainingBalance,
      shippingAmount: summary.shippingAmount,
      taxAmount: summary.taxAmount,
      adjustmentAmount: summary.adjustmentAmount
    });

    return res.status(200).json({ success: true, amount: summary.totalDue, finalPaymentUrl });
  } catch (error) {
    return sendHttpError(res, error, "Failed to request final payment.");
  }
});

exports.createCustomRequestFinalPaymentPayPalOrderHttp = onRequest(async (req, res) => {
  applyCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).send("");
  if (req.method !== "POST") return res.status(405).json({ error: "method-not-allowed" });

  try {
    const uid = await requireUidFromRequest(req);
    const { requestId } = req.body || {};
    if (!requestId) throw new HttpsError("invalid-argument", "requestId is required.");

    const requestSnap = await db.ref(`customRequests/${requestId}`).once("value");
    if (!requestSnap.exists()) throw new HttpsError("not-found", "Custom request not found.");

    const customRequest = requestSnap.val() || {};
    if (customRequest.uid !== uid) throw new HttpsError("permission-denied", "You don't own this request.");
    if (hasPaidCustomRequestFinalPayment(customRequest)) {
      return res.status(200).json({ alreadyPaid: true });
    }

    const amount = getRequestedFinalPaymentAmount(customRequest);
    const paymentStatus = String(customRequest.finalPaymentStatus || customRequest.payments?.final?.status || "").toLowerCase();
    if (paymentStatus !== "requested" || String(customRequest.status || "").toLowerCase() !== "awaiting_final_payment") {
      throw new HttpsError("failed-precondition", "Final payment has not been requested yet.");
    }
    if (!amount || amount <= 0) {
      throw new HttpsError("failed-precondition", "No final balance is currently due.");
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
          custom_id: `custom_request_final:${requestId}`,
          description: "Custom knife final balance"
        }]
      },
      { auth: { username: paypalClientId, password: paypalClientSecret } }
    );

    const paypalOrderId = paypalResponse.data.id;
    await db.ref(`customRequests/${requestId}`).update({
      "payments/final/paypalOrderId": paypalOrderId,
      "payments/final/paypalStatus": paypalResponse.data.status || "CREATED",
      "payments/final/paypalOrderCreatedAt": admin.database.ServerValue.TIMESTAMP,
      updatedAt: admin.database.ServerValue.TIMESTAMP
    });

    await logAuditAction("custom_final_payment_paypal_created", uid, "customer", uid, {
      requestId,
      paypalOrderId,
      amount
    });

    return res.status(200).json({ paypalOrderId, amount });
  } catch (error) {
    return sendHttpError(res, error, "Failed to create final payment.");
  }
});

exports.captureCustomRequestFinalPaymentPayPalOrderHttp = onRequest(async (req, res) => {
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

    const customRequest = requestSnap.val() || {};
    if (customRequest.uid !== uid) throw new HttpsError("permission-denied", "You don't own this request.");
    if (hasPaidCustomRequestFinalPayment(customRequest)) {
      return res.status(200).json({ success: true, alreadyPaid: true, requestId });
    }

    const expectedPayPalOrderId = customRequest.payments?.final?.paypalOrderId;
    if (!expectedPayPalOrderId || expectedPayPalOrderId !== paypalOrderId) {
      throw new HttpsError("invalid-argument", "PayPal order does not match this final payment request.");
    }

    const amount = getRequestedFinalPaymentAmount(customRequest);
    if (!amount || amount <= 0) {
      throw new HttpsError("failed-precondition", "No final balance is currently due.");
    }

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

    const paypalShippingAddress = extractPayPalShippingAddress(captureResponse.data);
    const now = admin.database.ServerValue.TIMESTAMP;
    const updates = {
      [`customRequests/${requestId}/status`]: "paid_in_full",
      [`customRequests/${requestId}/finalPaymentStatus`]: "paid",
      [`customRequests/${requestId}/finalPaymentPaidAt`]: now,
      [`customRequests/${requestId}/finalPaymentAmountPaid`]: amount,
      [`customRequests/${requestId}/balanceDue`]: 0,
      [`customRequests/${requestId}/payments/final/status`]: "paid",
      [`customRequests/${requestId}/payments/final/amountPaid`]: amount,
      [`customRequests/${requestId}/payments/final/paidAt`]: now,
      [`customRequests/${requestId}/payments/final/paypalOrderId`]: paypalOrderId,
      [`customRequests/${requestId}/payments/final/paypalCaptureId`]: captureResponse.data.id || null,
      [`customRequests/${requestId}/payments/final/paypalPayerId`]: captureResponse.data.payer?.payer_id || null,
      [`customRequests/${requestId}/payments/final/paypalPayerEmail`]: captureResponse.data.payer?.email_address || null,
      [`customRequests/${requestId}/payments/final/paypalStatus`]: captureResponse.data.status,
      [`customRequests/${requestId}/updatedAt`]: now,
      [`customRequests/${requestId}/lastUpdatedAt`]: now,
      [`conversations/${requestId}/status`]: "open",
      [`conversations/${requestId}/updatedAt`]: now
    };

    if (paypalShippingAddress) {
      updates[`customRequests/${requestId}/payments/final/paypalShippingAddress`] = paypalShippingAddress;
      if (!customRequest.shippingAddress) {
        updates[`customRequests/${requestId}/shippingAddress`] = paypalShippingAddress;
      }
    }

    if (customRequest.quoteId) {
      updates[`quotes/${customRequest.quoteId}/status`] = "paid_in_full";
      updates[`quotes/${customRequest.quoteId}/finalPaymentPaid`] = amount;
      updates[`quotes/${customRequest.quoteId}/finalPaymentPaidAt`] = now;
      updates[`quotes/${customRequest.quoteId}/remainingBalance`] = 0;
      updates[`quotes/${customRequest.quoteId}/updatedAt`] = now;
    }

    await db.ref().update(updates);
    await logAuditAction("custom_final_payment_paid", uid, "customer", uid, {
      requestId,
      paypalOrderId,
      captureId: captureResponse.data.id || null,
      amount
    });

    try {
      await sendEmail(
        customRequest.customerEmail,
        "finalPaymentReceived",
        customRequest.customerName || "Customer",
        requestId,
        amount
      );
      await sendEmail(
        BUSINESS_EMAIL,
        "finalPaymentReceivedBusiness",
        customRequest.customerName || "Customer",
        requestId,
        amount
      );
    } catch (emailError) {
      console.warn("Custom request final payment email failed:", emailError.message);
    }

    return res.status(200).json({ success: true, requestId, amount });
  } catch (error) {
    return sendHttpError(res, error, "Failed to capture final payment.");
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

exports.mailgunWebhook = onRequest({ invoker: "public" }, async (req, res) => {
  applyCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).send("");

  if (req.method === "GET") {
    return res.status(200).json({
      ok: true,
      domain: MAILGUN_DOMAIN,
      webhookUrl: publicFunctionUrl("mailgunWebhook"),
      events: MAILGUN_WEBHOOK_EVENT_OPTIONS,
      signingConfigured: !!MAILGUN_WEBHOOK_SIGNING_KEY
    });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "method-not-allowed" });
  }

  try {
    const { signature, eventData } = normalizeMailgunWebhookBody(req.body || {});
    if (!eventData?.event) {
      return res.status(400).json({ error: "missing-event-data" });
    }

    const verification = verifyMailgunWebhookSignature(signature);
    if (!verification.ok) {
      await logNotificationEvent("mailgun_webhook_rejected", {
        reason: verification.reason,
        status: verification.status,
        event: eventData.event || null
      });
      return res.status(406).json({ error: "invalid-signature", message: verification.reason });
    }

    const tokenResult = await cacheMailgunWebhookToken(signature);
    if (tokenResult.duplicate) {
      return res.status(200).json({ received: true, duplicate: true, reason: "duplicate-token" });
    }

    const result = await recordMailgunWebhookEvent(eventData, verification);
    return res.status(200).json({
      received: true,
      duplicate: result.duplicate,
      eventKey: result.summary.eventKey,
      event: result.summary.event,
      counter: result.summary.counter,
      signing: verification.status
    });
  } catch (error) {
    console.error("Mailgun webhook error:", error);
    await logNotificationEvent("mailgun_webhook_failed", { error: error.message });
    return res.status(500).json({ error: "internal", message: "Could not process Mailgun webhook." });
  }
});

exports.getMailgunWebhookStatus = onCall({ invoker: "public", cors: true }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "User must be signed in.");

  const isStaff = await verifyUserRole(request.auth.uid, "business");
  if (!isStaff) {
    throw new HttpsError("permission-denied", "Only staff can view Mailgun webhook status.");
  }

  const [statusSnap, recentSnap] = await Promise.all([
    db.ref("mailgunWebhookStatus").once("value"),
    db.ref("mailgunWebhookEvents").orderByChild("receivedAt").limitToLast(25).once("value")
  ]);

  const recentEvents = recentSnap.exists()
    ? Object.entries(recentSnap.val() || {})
      .map(([eventKey, value]) => ({ eventKey, ...value, raw: undefined }))
      .sort((a, b) => Number(b.receivedAt || b.eventAt || 0) - Number(a.receivedAt || a.eventAt || 0))
    : [];

  return {
    domain: MAILGUN_DOMAIN,
    webhookUrl: publicFunctionUrl("mailgunWebhook"),
    events: MAILGUN_WEBHOOK_EVENT_OPTIONS,
    signingConfigured: !!MAILGUN_WEBHOOK_SIGNING_KEY,
    maxAgeSeconds: MAILGUN_WEBHOOK_MAX_AGE_SECONDS,
    status: statusSnap.exists() ? statusSnap.val() : {},
    recentEvents
  };
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

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function createTemporaryPassword() {
  return `${crypto.randomBytes(24).toString("base64url")}Aa1!`;
}

function roleLabel(role) {
  if (role === "admin") return "Admin";
  if (role === "business") return "Business";
  return "Customer";
}

function roleLandingPath(role) {
  if (role === "admin") return "/admin";
  if (role === "business") return "/business";
  return "/my-account";
}

async function getUserByEmailOrNull(email) {
  try {
    return await auth.getUserByEmail(email);
  } catch (error) {
    if (error?.code === "auth/user-not-found") return null;
    throw error;
  }
}

exports.inviteAdminUser = onCall({ invoker: "public", cors: true }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "User must be signed in.");

  const adminUid = request.auth.uid;
  const { displayName } = request.data || {};
  const email = normalizeEmail(request.data?.email);
  const name = String(displayName || "").trim();
  const role = String(request.data?.role || "admin").trim().toLowerCase();

  if (!name || !email) {
    throw new HttpsError("invalid-argument", "Name and email are required.");
  }

  if (!["customer", "business", "admin"].includes(role)) {
    throw new HttpsError("invalid-argument", "Choose a valid role.");
  }

  if (!isValidEmail(email)) {
    throw new HttpsError("invalid-argument", "Enter a valid email address.");
  }

  const isAdmin = await verifyUserRole(adminUid, "admin");
  if (!isAdmin) {
    throw new HttpsError("permission-denied", "Only admins can invite users.");
  }

  let userRecord = await getUserByEmailOrNull(email);
  const created = !userRecord;

  if (!userRecord) {
    userRecord = await auth.createUser({
      email,
      displayName: name,
      password: createTemporaryPassword(),
      emailVerified: false,
      disabled: false
    });
  } else {
    const updates = {};
    if (userRecord.displayName !== name) updates.displayName = name;
    if (userRecord.disabled) updates.disabled = false;

    if (Object.keys(updates).length > 0) {
      userRecord = await auth.updateUser(userRecord.uid, updates);
    }
  }

  await auth.setCustomUserClaims(userRecord.uid, {
    ...(userRecord.customClaims || {}),
    role
  });

  const userRef = db.ref(`users/${userRecord.uid}`);
  const profileSnap = await userRef.once("value");
  const profileUpdates = {
    uid: userRecord.uid,
    displayName: name,
    email,
    role,
    status: "active",
    inviteStatus: "sending",
    invitedBy: adminUid,
    invitedAt: admin.database.ServerValue.TIMESTAMP,
    updatedAt: admin.database.ServerValue.TIMESTAMP
  };

  if (!profileSnap.exists()) {
    profileUpdates.createdAt = admin.database.ServerValue.TIMESTAMP;
  }

  await userRef.update(profileUpdates);

  const inviterName = request.auth.token?.name || request.auth.token?.email || "Nolan's Knives";

  try {
    const setupUrl = await auth.generatePasswordResetLink(email, {
      url: `${SITE_URL}${roleLandingPath(role)}`,
      handleCodeInApp: false
    });

    const emailResult = await sendRequiredEmail(email, "adminInvite", name, setupUrl, inviterName, roleLabel(role), role, email);

    if (!userRecord.emailVerified) {
      try {
        await auth.updateUser(userRecord.uid, { emailVerified: true });
      } catch (verifyError) {
        console.warn("Admin invite sent, but emailVerified update failed:", verifyError.message);
      }
    }

    await userRef.update({
      inviteStatus: "sent",
      inviteEmailSentAt: admin.database.ServerValue.TIMESTAMP,
      inviteEmailError: null,
      updatedAt: admin.database.ServerValue.TIMESTAMP
    });

    await logAuditAction("user_invited", adminUid, "admin", userRecord.uid, {
      email,
      displayName: name,
      role,
      created,
      messageId: emailResult.messageId || null
    });

    return {
      success: true,
      uid: userRecord.uid,
      email,
      role,
      created,
      messageId: emailResult.messageId || null
    };
  } catch (error) {
    await userRef.update({
      inviteStatus: "email_failed",
      inviteEmailError: error?.message || "Invitation email failed.",
      updatedAt: admin.database.ServerValue.TIMESTAMP
    });

    await logAuditAction("user_invite_failed", adminUid, "admin", userRecord.uid, {
      email,
      displayName: name,
      role,
      created,
      error: error?.message || "Invitation email failed."
    });

    throw new HttpsError(
      "internal",
      "User was created, but the invitation email failed to send. Check email configuration and try again."
    );
  }
});

async function setUserRoleAsAdmin(adminUid, uid, requestedRole) {
  const role = String(requestedRole || "").trim().toLowerCase();
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

  if (adminUid === uid) {
    throw new HttpsError("failed-precondition", "You cannot change your own role.");
  }

  const targetUser = await auth.getUser(uid);

  // Set custom claims
  await auth.setCustomUserClaims(uid, {
    ...(targetUser.customClaims || {}),
    role
  });

  // Update database profile
  await db.ref(`users/${uid}`).update({
    role,
    updatedAt: admin.database.ServerValue.TIMESTAMP
  });

  // Log audit
  await logAuditAction("role_changed", adminUid, "admin", uid, { newRole: role });

  return { success: true, role };
}

exports.setUserRole = onCall({ invoker: "public", cors: true }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "User must be signed in.");

  return setUserRoleAsAdmin(request.auth.uid, request.data?.uid, request.data?.role);
});

exports.setUserRoleHttp = onRequest({ invoker: "public" }, async (req, res) => {
  applyCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).send("");
  if (req.method !== "POST") return res.status(405).json({ error: "method-not-allowed" });

  try {
    const authToken = await requireAuthFromRequest(req);
    const result = await setUserRoleAsAdmin(authToken.uid, req.body?.uid, req.body?.role);
    return res.status(200).json(result);
  } catch (error) {
    return sendHttpError(res, error, "Failed to set user role.");
  }
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

exports.getEmailTemplateCatalog = onCall({ invoker: "public", cors: true }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "User must be signed in.");

  const isStaff = await verifyUserRole(request.auth.uid, "business");
  if (!isStaff) {
    throw new HttpsError("permission-denied", "Only staff can view email templates.");
  }

  const overridesSnap = await db.ref("emailTemplates").once("value");
  const overrides = overridesSnap.exists() ? overridesSnap.val() || {} : {};
  const templateIds = [...new Set([
    ...Object.keys(emailTemplates),
    ...Object.keys(emailTemplateMetadata),
    ...Object.keys(overrides)
  ])].sort((a, b) => {
    const aLabel = emailTemplateMetadata[a]?.label || overrides[a]?.label || a;
    const bLabel = emailTemplateMetadata[b]?.label || overrides[b]?.label || b;
    return aLabel.localeCompare(bLabel);
  });

  const templates = templateIds.map((templateId) => {
    const catalogEntry = getEmailTemplateCatalogEntry(templateId) || {
      id: templateId,
      label: overrides[templateId]?.label || templateId,
      description: overrides[templateId]?.description || "",
      variables: overrides[templateId]?.variables || emailTemplateMetadata[templateId]?.variables || [],
      defaultSubject: "",
      defaultHtml: "",
      editableSubject: "",
      editableHtml: "",
      previewSubject: "",
      previewHtml: "",
      sampleContext: baseTemplateContext({})
    };
    const override = overrides[templateId] || {};
    const tagConfig = emailTemplateTagConfig[templateId] || {};
    const customTemplate = !!override.custom || !emailTemplates[templateId];
    const mailgunTags = buildMailgunTags({
      templateName: templateId,
      templateSource: override.subject || override.html ? "database" : "default",
      emailCategory: tagConfig.category || (customTemplate ? "campaign" : ""),
      emailAudience: tagConfig.audience || (customTemplate ? "marketing" : ""),
      emailLifecycle: tagConfig.lifecycle || (customTemplate ? "custom-template" : "")
    });

    return {
      ...catalogEntry,
      label: override.label || catalogEntry.label,
      description: override.description || catalogEntry.description,
      variables: override.variables || catalogEntry.variables,
      subject: override.subject || "",
      html: override.html || "",
      enabled: override.enabled !== false,
      custom: customTemplate,
      updatedAt: override.updatedAt || null,
      effectiveSubject: override.subject || catalogEntry.previewSubject || catalogEntry.defaultSubject,
      effectiveHtml: override.html || catalogEntry.previewHtml || catalogEntry.defaultHtml,
      mailgunTags
    };
  });

  return { templates };
});

function normalizeUidList(value) {
  if (!value) return [];
  const list = Array.isArray(value)
    ? value
    : Object.entries(value || {})
      .filter(([, selected]) => selected !== false && selected !== null && selected !== undefined)
      .map(([uid]) => uid);
  return [...new Set(list.map((item) => String(item || "").trim()).filter(Boolean))];
}

function isEmailSuppressedForCampaign(profile = {}) {
  const suppressionStatus = profile.emailSuppression?.status || "";
  return profile.emailPreferences?.marketingSubscribed === false ||
    ["unsubscribed", "complained", "permanent_failure"].includes(suppressionStatus);
}

async function getCampaignRecipients({ recipientUids = [], groupIds = [] }) {
  const uidSet = new Set(normalizeUidList(recipientUids));
  const selectedGroupIds = normalizeUidList(groupIds);
  const groups = [];

  for (const groupId of selectedGroupIds) {
    const groupSnap = await db.ref(`emailGroups/${groupId}`).once("value");
    if (!groupSnap.exists()) continue;
    const group = groupSnap.val() || {};
    groups.push({ groupId, ...group });
    normalizeUidList(group.members).forEach((uid) => uidSet.add(uid));
  }

  const recipients = [];
  for (const uid of uidSet) {
    const profile = await getUserProfile(uid);
    if (!profile?.email || profile.status === "blocked") continue;
    if (isEmailSuppressedForCampaign(profile)) continue;
    recipients.push({ uid, ...profile, email: normalizeEmail(profile.email) });
  }

  const dedupedByEmail = new Map();
  recipients.forEach((recipient) => {
    if (!dedupedByEmail.has(recipient.email)) {
      dedupedByEmail.set(recipient.email, recipient);
    }
  });

  return {
    recipients: [...dedupedByEmail.values()].sort((a, b) => (a.displayName || a.email || "").localeCompare(b.displayName || b.email || "")),
    groups
  };
}

function campaignRecipientContext(recipient = {}, campaignName = "") {
  const displayName = recipient.displayName || recipient.email || "there";
  return baseTemplateContext({
    uid: recipient.uid,
    displayName,
    customerName: displayName,
    firstName: firstNameFrom(displayName),
    email: recipient.email || "",
    role: recipient.role || "customer",
    campaignName: campaignName || "Nolan's Knives Update"
  });
}

async function resolveCampaignTemplateSources(templateId, campaignName) {
  const configured = await getConfiguredEmailTemplate(templateId);
  if (configured?.subject && configured?.html) {
    return {
      templateName: templateId,
      subject: configured.subject,
      html: configured.html,
      source: "database"
    };
  }

  const template = emailTemplates[templateId];
  if (!template) {
    throw new HttpsError("not-found", "Email template not found.");
  }

  const campaignTemplateArgs = {
    campaignGeneral: ["{{displayName}}", campaignName || "{{campaignName}}"],
    campaignNewInventory: ["{{displayName}}", campaignName || "New Knives Available"],
    campaignCustomKnifeFollowUp: ["{{displayName}}", campaignName || "Custom Knife Follow-Up"],
    campaignCareTips: ["{{displayName}}", campaignName || "Knife Care Tips"],
    campaignAnnouncement: ["{{displayName}}", campaignName || "Nolan's Knives Announcement"]
  };
  const sampleArgs = campaignTemplateArgs[templateId] || getSampleTemplateArgs(templateId);
  const fallback = template(...sampleArgs);

  return {
    templateName: templateId,
    subject: fallback.subject,
    html: fallback.html,
    source: "default"
  };
}

exports.sendEmailCampaign = onCall({ invoker: "public", cors: true, timeoutSeconds: 540, memory: "512MiB" }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "User must be signed in.");

  const uid = request.auth.uid;
  const isStaff = await verifyUserRole(uid, "business");
  if (!isStaff) {
    throw new HttpsError("permission-denied", "Only staff can send email campaigns.");
  }

  const {
    campaignName = "Nolan's Knives Update",
    recipientUids = [],
    groupIds = [],
    templateId = "",
    subject = "",
    html = "",
    mode = "custom"
  } = request.data || {};

  const { recipients, groups } = await getCampaignRecipients({ recipientUids, groupIds });
  if (recipients.length === 0) {
    throw new HttpsError("invalid-argument", "Select at least one active recipient with an email address.");
  }
  if (recipients.length > 500) {
    throw new HttpsError("failed-precondition", "Campaigns are limited to 500 recipients per send.");
  }

  let sourceSubject = String(subject || "").trim();
  let sourceHtml = String(html || "").trim();
  let templateName = mode === "template" ? String(templateId || "").trim() : "custom";
  let templateSource = "custom";

  if (mode === "template") {
    if (!templateName) {
      throw new HttpsError("invalid-argument", "Choose an email template.");
    }
    const resolved = await resolveCampaignTemplateSources(templateName, campaignName);
    sourceSubject = resolved.subject;
    sourceHtml = resolved.html;
    templateSource = resolved.source;
  }

  if (!sourceSubject || !sourceHtml) {
    throw new HttpsError("invalid-argument", "Subject and HTML are required.");
  }

  const senderProfile = await getUserProfile(uid);
  const campaignId = db.ref("emailCampaigns").push().key;
  const startedAt = admin.database.ServerValue.TIMESTAMP;

  await db.ref(`emailCampaigns/${campaignId}`).set({
    campaignId,
    campaignName: String(campaignName || "").trim() || "Nolan's Knives Update",
    mode,
    templateName,
    templateSource,
    subject: sourceSubject,
    html: sourceHtml,
    groupIds: groups.reduce((acc, group) => ({ ...acc, [group.groupId]: true }), {}),
    recipientCount: recipients.length,
    status: "sending",
    createdBy: uid,
    createdByEmail: senderProfile?.email || request.auth.token?.email || "",
    createdAt: startedAt,
    updatedAt: startedAt
  });

  const successes = [];
  const failures = [];
  const skipped = [];

  for (const recipient of recipients) {
    const context = campaignRecipientContext(recipient, campaignName);
    const renderedSubject = renderTemplateString(sourceSubject, context, false);
    const renderedHtml = renderTemplateString(sourceHtml, context, true);

    const result = await sendRawEmail({
      to: recipient.email,
      subject: renderedSubject,
      html: renderedHtml,
      metadata: {
        templateName,
        campaignId,
        campaignName: String(campaignName || "").trim() || "Nolan's Knives Update",
        recipientUid: recipient.uid,
        emailCategory: "campaign",
        emailAudience: "marketing",
        emailLifecycle: templateName === "custom" ? "custom-campaign" : templateName
      }
    });

    const recipientLog = {
      uid: recipient.uid,
      email: recipient.email,
      displayName: recipient.displayName || "",
      messageId: result.messageId || null,
      sentAt: admin.database.ServerValue.TIMESTAMP
    };

    if (result?.error) {
      failures.push({ ...recipientLog, error: result.error });
    } else if (result?.skipped) {
      skipped.push({ ...recipientLog, mode: result.mode || "skipped" });
    } else {
      successes.push(recipientLog);
    }
  }

  const status = failures.length > 0
    ? (successes.length > 0 || skipped.length > 0 ? "partial" : "failed")
    : (successes.length > 0 ? "sent" : "skipped");

  await db.ref(`emailCampaigns/${campaignId}`).update({
    status,
    successCount: successes.length,
    failureCount: failures.length,
    skippedCount: skipped.length,
    recipients: [...successes, ...failures, ...skipped].reduce((acc, item) => {
      acc[item.uid || item.email.replace(/[.#$/[\]]/g, "_")] = item;
      return acc;
    }, {}),
    updatedAt: admin.database.ServerValue.TIMESTAMP,
    completedAt: admin.database.ServerValue.TIMESTAMP
  });

  await logAuditAction("email_campaign_sent", uid, senderProfile?.role || "business", null, {
    campaignId,
    campaignName,
    templateName,
    recipientCount: recipients.length,
    successCount: successes.length,
    failureCount: failures.length,
    skippedCount: skipped.length
  });

  return {
    success: failures.length === 0,
    campaignId,
    recipientCount: recipients.length,
    successCount: successes.length,
    failureCount: failures.length,
    skippedCount: skipped.length,
    failures: failures.slice(0, 10)
  };
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

async function createImpersonationSessionAsAdmin(adminUid, authToken = {}, payload = {}) {
  const { targetUid } = payload;
  const reason = String(payload?.reason || "Admin dashboard impersonation").trim();
  if (!targetUid) {
    throw new HttpsError("invalid-argument", "targetUid is required.");
  }

  if (targetUid === adminUid) {
    throw new HttpsError("failed-precondition", "You cannot impersonate yourself.");
  }

  if (authToken?.impersonated) {
    throw new HttpsError("failed-precondition", "Quit the current impersonation before starting another one.");
  }

  // Verify admin
  const isAdmin = await verifyUserRole(adminUid, "admin");
  if (!isAdmin) {
    throw new HttpsError("permission-denied", "Only admins can impersonate.");
  }

  const [adminUser, targetUser, adminProfile, targetProfile] = await Promise.all([
    auth.getUser(adminUid),
    auth.getUser(targetUid),
    getUserProfile(adminUid),
    getUserProfile(targetUid)
  ]);

  const adminRole = adminUser.customClaims?.role || adminProfile?.role || "admin";
  const targetRole = targetUser.customClaims?.role || targetProfile?.role || "customer";
  const startedAt = Date.now();
  const expiresAt = startedAt + 3600000;

  // Create short-lived custom tokens for entering and leaving impersonation.
  const token = await auth.createCustomToken(targetUid, {
    role: targetRole,
    impersonated: true,
    impersonatedBy: adminUid,
    impersonationStartedAt: startedAt,
    impersonationExpiresAt: expiresAt
  });

  const restoreToken = await auth.createCustomToken(adminUid, {
    role: adminRole,
    impersonationRestore: true,
    restoredFromUid: targetUid
  });

  // Log audit
  await logAuditAction("impersonation_started", adminUid, "admin", targetUid, {
    reason,
    targetRole,
    expiresAt
  });

  return {
    customToken: token,
    restoreToken,
    expiresIn: 3600,
    expiresAt,
    admin: {
      uid: adminUid,
      email: adminUser.email || adminProfile?.email || "",
      displayName: adminUser.displayName || adminProfile?.displayName || "Admin",
      role: adminRole
    },
    target: {
      uid: targetUid,
      email: targetUser.email || targetProfile?.email || "",
      displayName: targetUser.displayName || targetProfile?.displayName || "User",
      role: targetRole,
      status: targetProfile?.status || "active"
    }
  };
}

exports.createImpersonationSession = onCall({ invoker: "public", cors: true }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "User must be signed in.");

  return createImpersonationSessionAsAdmin(request.auth.uid, request.auth.token || {}, request.data || {});
});

exports.createImpersonationSessionHttp = onRequest({ invoker: "public" }, async (req, res) => {
  applyCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).send("");
  if (req.method !== "POST") return res.status(405).json({ error: "method-not-allowed" });

  try {
    const authToken = await requireAuthFromRequest(req);
    const result = await createImpersonationSessionAsAdmin(authToken.uid, authToken, req.body || {});
    return res.status(200).json(result);
  } catch (error) {
    return sendHttpError(res, error, "Failed to create impersonation session.");
  }
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
