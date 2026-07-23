import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { onValue, ref } from "firebase/database";
import { useAuth } from "../auth/AuthProvider";
import LucideIcon from "../components/ui/LucideIcon";
import { showToast } from "../components/Toast";
import { db } from "./firebase";
import { customRequestService } from "../services/customRequestService";
import "./Checkout.css";

function formatRequestId(id) {
  if (!id) return "-";
  return id.length > 8 ? `#${id.slice(-6).toUpperCase()}` : `#${id.toUpperCase()}`;
}

function formatCurrency(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function moneyValue(value, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;
  const amount = Number(value);
  return Number.isFinite(amount) ? Number(amount.toFixed(2)) : fallback;
}

function finalPaymentSummary(request = {}) {
  const payment = request.payments?.final || {};
  const finalPrice = moneyValue(payment.finalPrice || request.finalPrice || request.quotedPrice, 0);
  const depositPaid = moneyValue(payment.depositPaid || request.payments?.deposit?.amount || request.depositAmount, 0);
  const remainingBalance = moneyValue(payment.remainingBalance || request.remainingBalance, Math.max(finalPrice - depositPaid, 0));
  const shippingAmount = moneyValue(payment.shippingAmount || request.shippingAmount, 0);
  const taxAmount = moneyValue(payment.taxAmount || request.taxAmount, 0);
  const adjustmentAmount = moneyValue(payment.adjustmentAmount || request.adjustmentAmount, 0);
  const amount = moneyValue(payment.amount || request.finalPaymentAmount || request.balanceDue, remainingBalance + shippingAmount + taxAmount + adjustmentAmount);

  return {
    finalPrice,
    depositPaid,
    remainingBalance,
    shippingAmount,
    taxAmount,
    adjustmentAmount,
    amount: Math.max(amount, 0),
    note: payment.note || request.finalPaymentNote || ""
  };
}

function isFinalPaymentPaid(request = {}) {
  return Boolean(request.finalPaymentStatus === "paid" || request.payments?.final?.status === "paid" || request.finalPaymentPaidAt);
}

function isFinalPaymentRequested(request = {}) {
  const status = String(request.finalPaymentStatus || request.payments?.final?.status || "").toLowerCase();
  return status === "requested" || String(request.status || "").toLowerCase() === "awaiting_final_payment";
}

export default function CustomFinalPayment() {
  const { requestId } = useParams();
  const navigate = useNavigate();
  const { user, initializing } = useAuth();
  const paypalRef = useRef(null);
  const [requestRecord, setRequestRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentComplete, setPaymentComplete] = useState(false);

  useEffect(() => {
    if (!requestId) return undefined;
    const requestRef = ref(db, `customRequests/${requestId}`);
    const unsubscribe = onValue(requestRef, (snapshot) => {
      if (snapshot.exists()) {
        setRequestRecord(snapshot.val());
        setError("");
      } else {
        setError("Final payment request not found.");
      }
      setLoading(false);
    }, (err) => {
      setError(err?.message || "Could not load final payment.");
      setLoading(false);
    });

    return () => unsubscribe();
  }, [requestId]);

  const summary = useMemo(() => finalPaymentSummary(requestRecord || {}), [requestRecord]);
  const ownsRequest = !requestRecord || requestRecord.uid === user?.uid;
  const alreadyPaid = paymentComplete || isFinalPaymentPaid(requestRecord || {});
  const canPay = Boolean(requestRecord && ownsRequest && !alreadyPaid && isFinalPaymentRequested(requestRecord) && summary.amount > 0);

  useEffect(() => {
    if (!canPay || !paypalRef.current || !user) return undefined;

    let closed = false;
    let retryTimer = null;
    let buttons = null;

    const renderButtons = () => {
      if (closed || !paypalRef.current) return;
      if (!window.paypal?.Buttons) {
        retryTimer = window.setTimeout(renderButtons, 400);
        return;
      }

      paypalRef.current.innerHTML = "";
      buttons = window.paypal.Buttons({
        style: { layout: "vertical", color: "gold", shape: "pill", label: "pay", height: 42 },
        createOrder: async () => {
          setPaymentLoading(true);
          setError("");
          try {
            const response = await customRequestService.createFinalPaymentPayPalOrder(requestId);
            if (response.alreadyPaid) {
              setPaymentComplete(true);
              throw new Error("This final balance has already been paid.");
            }
            return response.paypalOrderId;
          } catch (err) {
            const message = err.message || "Could not start final payment.";
            setError(message);
            showToast(message, "error");
            throw err;
          } finally {
            setPaymentLoading(false);
          }
        },
        onApprove: async (data) => {
          setPaymentLoading(true);
          setError("");
          try {
            await customRequestService.captureFinalPaymentPayPalOrder({
              requestId,
              paypalOrderId: data.orderID
            });
            setPaymentComplete(true);
            showToast("Final payment received. Your custom knife is paid in full.", "success");
            navigate("/my-knives", { replace: true, state: { finalPaymentSuccess: true } });
          } catch (err) {
            const message = err.message || "Could not confirm final payment.";
            setError(message);
            showToast(message, "error");
          } finally {
            setPaymentLoading(false);
          }
        },
        onError: (err) => {
          const message = err?.message || "PayPal payment error.";
          setError(message);
          showToast(message, "error");
          setPaymentLoading(false);
        }
      });

      buttons.render(paypalRef.current);
    };

    renderButtons();

    return () => {
      closed = true;
      if (retryTimer) window.clearTimeout(retryTimer);
      try {
        buttons?.close();
      } catch {}
    };
  }, [canPay, navigate, requestId, user]);

  if (loading || initializing) {
    return (
      <div className="checkout-page">
        <div className="checkout-container">
          <p>Loading final payment...</p>
        </div>
      </div>
    );
  }

  if (!ownsRequest) {
    return (
      <div className="checkout-page">
        <div className="checkout-container">
          <h2>Unavailable</h2>
          <p className="error-message">This final payment link is not connected to your account.</p>
          <button className="btn btn-warning" onClick={() => navigate("/my-knives")}>Back to Your Knives</button>
        </div>
      </div>
    );
  }

  return (
    <div className="checkout-page">
      <div className="checkout-container">
        <div className="checkout-main">
          <div className="checkout-summary">
            <h1>{alreadyPaid ? "Paid In Full" : "Final Payment"}</h1>

            <div className="order-summary-card">
              <h3>Custom Knife Balance</h3>
              <div className="summary-details">
                <h4>{formatRequestId(requestId)}</h4>
                <p className="summary-price">{formatCurrency(summary.amount)} USD</p>
                <p className="summary-description">
                  {alreadyPaid
                    ? "Your final balance has been paid. Nolan's team will keep your request updated from here."
                    : "Review the final payment summary below, then pay securely with PayPal or card."}
                </p>
                {summary.note && <p className="secure-payment-notice">{summary.note}</p>}
              </div>
            </div>

            <div className="customer-info-card">
              <h3>Payment Breakdown</h3>
              <div className="checkout-order-meta">
                <div><span>Final quote</span><strong>{formatCurrency(summary.finalPrice)}</strong></div>
                <div><span>Deposit paid</span><strong>{formatCurrency(summary.depositPaid)}</strong></div>
                <div><span>Remaining balance</span><strong>{formatCurrency(summary.remainingBalance)}</strong></div>
                <div><span>Shipping</span><strong>{formatCurrency(summary.shippingAmount)}</strong></div>
                <div><span>Tax</span><strong>{formatCurrency(summary.taxAmount)}</strong></div>
                <div><span>Adjustment</span><strong>{formatCurrency(summary.adjustmentAmount)}</strong></div>
              </div>
            </div>
          </div>

          <div className="checkout-payment">
            <div className="payment-card">
              <h2>{alreadyPaid ? "Payment Complete" : "Pay Final Balance"}</h2>
              <div className="checkout-order-meta">
                <div><span>Request</span><strong>{formatRequestId(requestId)}</strong></div>
                <div><span>Total due</span><strong>{alreadyPaid ? "$0.00 USD" : `${formatCurrency(summary.amount)} USD`}</strong></div>
              </div>

              {error && <div className="error-message mb-3">{error}</div>}

              {alreadyPaid && (
                <p className="secure-payment-notice">
                  <LucideIcon name="CheckCircle" size={14} /> This custom knife is paid in full.
                </p>
              )}

              {!alreadyPaid && !isFinalPaymentRequested(requestRecord || {}) && (
                <p className="error-message">Final payment has not been requested for this custom knife yet.</p>
              )}

              {canPay && (
                <>
                  <div className="payment-methods">
                    <label className="payment-method-option">
                      <input type="radio" name="payment" value="paypal" checked readOnly />
                      <span>PayPal / Debit or Credit Card</span>
                    </label>
                  </div>
                  <div className="payment-button-container">
                    <div ref={paypalRef} style={{ width: "100%" }} />
                    {paymentLoading && <p className="loading-text">Processing...</p>}
                  </div>
                  <p className="secure-payment-notice">
                    <LucideIcon name="Lock" size={14} /> Your payment information is secure and processed by PayPal.
                  </p>
                </>
              )}

              <button
                className="btn btn-outline-light w-100 mt-3"
                onClick={() => navigate("/my-knives")}
                disabled={paymentLoading}
              >
                Back to Your Knives
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
