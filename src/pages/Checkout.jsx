import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ref, onValue, off } from "firebase/database";
import { db } from "./firebase";
import { useAuth } from "../auth/AuthProvider";
import { startKnifeCheckout, createPayPalOrder, capturePayPalOrder } from "../services/checkoutService";
import { clearPurchaseIntent } from "../services/purchaseIntent";
import { getPublicKnifeStatus } from "./knifeStatus";
import "./Checkout.css";
import LucideIcon from '../components/ui/LucideIcon';
import { showToast } from "../components/Toast";

export default function Checkout() {
  const { knifeId } = useParams();
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [knife, setKnife] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [checkoutError, setCheckoutError] = useState("");
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [orderCreated, setOrderCreated] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState("paypal");
  const [shippingInfo, setShippingInfo] = useState({
    fullName: "",
    email: "",
    addressLine1: "",
    addressLine2: "",
    city: "",
    state: "",
    postalCode: ""
  });
  const paypalRef = React.useRef();

  useEffect(() => {
    setShippingInfo((prev) => ({
      ...prev,
      fullName: prev.fullName || profile?.displayName || "",
      email: prev.email || user?.email || ""
    }));
  }, [profile?.displayName, user?.email]);

  // Load knife details
  useEffect(() => {
    const knifeRef = ref(db, `Products/${knifeId}`);
    const unsub = onValue(knifeRef, (snapshot) => {
      if (snapshot.exists()) {
        setKnife(snapshot.val());
      } else {
        setError("Knife not found.");
      }
      setLoading(false);
    });

    return () => off(knifeRef, "value", unsub);
  }, [knifeId]);

  // Initialize checkout
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!knife || !user || orderCreated) return;

    const initCheckout = async () => {
      try {
        setCheckoutError("");
        const checkoutData = await startKnifeCheckout(knifeId);
        setOrderCreated(checkoutData);
      } catch (err) {
        setCheckoutError(err.message || "Failed to start checkout");
        console.error("Checkout init error:", err);
      }
    };

    initCheckout();
  }, [knife, user, knifeId, orderCreated, navigate]);

  // Initialize PayPal button
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!paypalRef.current || !window.paypal || !orderCreated || paymentMethod !== "paypal") return;

    paypalRef.current.innerHTML = "";

    const createOrder = async (data, actions) => {
      try {
        const missingShipping = ['fullName', 'addressLine1', 'city', 'state', 'postalCode'].filter((field) => !shippingInfo[field]?.trim());
        if (missingShipping.length > 0) {
          throw new Error("Complete the shipping information before paying.");
        }
        setPaymentLoading(true);
        const paypalOrderData = await createPayPalOrder({
          knifeId,
          orderId: orderCreated.orderId,
          amount: knife.price,
          shippingInfo
        });
        return paypalOrderData.paypalOrderId;
      } catch (err) {
        setCheckoutError(err.message || "Failed to create PayPal order");
        throw err;
      } finally {
        setPaymentLoading(false);
      }
    };

    const onApprove = async (data, actions) => {
      try {
        setPaymentLoading(true);
        const captureData = await capturePayPalOrder({
          paypalOrderId: data.orderID,
          orderId: orderCreated.orderId,
          knifeId
        });

        if (captureData.success) {
          clearPurchaseIntent();
          showToast("Payment complete. Your order is now in Your Knives.", "success");
          navigate(`/my-knives`, { replace: true, state: { purchaseSuccess: true } });
        }
      } catch (err) {
        setCheckoutError(err.message || "Failed to complete payment");
        console.error("Capture error:", err);
      } finally {
        setPaymentLoading(false);
      }
    };

    const onError = (err) => {
      setCheckoutError(err.message || "Payment error occurred");
      console.error("PayPal error:", err);
    };

    const button = window.paypal.Buttons({
      style: { layout: "vertical", color: "gold", shape: "pill", label: "pay", height: 40 },
      createOrder,
      onApprove,
      onError
    });

    button.render(paypalRef.current);

    return () => {
      try {
        button.close();
      } catch {}
    };
  }, [orderCreated, knife, knifeId, paymentMethod, navigate, shippingInfo]);

  if (loading) {
    return (
      <div className="checkout-page">
        <div className="checkout-container">
          <p>Loading knife details...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="checkout-page">
        <div className="checkout-container">
          <h2>Error</h2>
          <p className="error-message">{error}</p>
          <button className="btn btn-warning" onClick={() => navigate("/store")}>
            Return to Store
          </button>
        </div>
      </div>
    );
  }

  if (!knife) {
    return (
      <div className="checkout-page">
        <div className="checkout-container">
          <h2>Knife Not Found</h2>
          <p>The knife you're trying to purchase is no longer available.</p>
          <button className="btn btn-warning" onClick={() => navigate("/store")}>
            Return to Store
          </button>
        </div>
      </div>
    );
  }

  if (knife.sold) {
    return (
      <div className="checkout-page">
        <div className="checkout-container">
          <h2>No Longer Available</h2>
          <p>This knife has already been sold.</p>
          <button className="btn btn-warning" onClick={() => navigate("/store")}>
            Return to Store
          </button>
        </div>
      </div>
    );
  }

  const publicStatus = getPublicKnifeStatus(knife);

  if (publicStatus === "pending") {
    return (
      <div className="checkout-page">
        <div className="checkout-container">
          <h2>Purchase Pending</h2>
          <p>This knife is currently reserved or awaiting completion. Please check back soon.</p>
          <button className="btn btn-warning" onClick={() => navigate("/store")}>Return to Store</button>
        </div>
      </div>
    );
  }

  const priceNum = typeof knife.price === "string" ? parseFloat(knife.price) : knife.price;
  const totalDisplay = Number.isFinite(priceNum) ? priceNum.toFixed(2) : "0.00";

  return (
    <div className="checkout-page">
      <div className="checkout-container">
        <div className="checkout-main">
          {/* Summary Section */}
          <div className="checkout-summary">
            <h1>Checkout</h1>

            {/* Order Summary Card */}
            <div className="order-summary-card">
              <h3>Order Summary</h3>

              {knife.src && knife.src.length > 0 && (
                <div className="checkout-knife-image">
                  <img src={knife.src[0]} alt={knife.name} />
                </div>
              )}

              <div className="summary-details">
                <h4>{knife.name}</h4>
                <p className="summary-price">${priceNum.toFixed(2)} USD</p>

                {knife.description && (
                  <p className="summary-description">{knife.description.substring(0, 200)}...</p>
                )}

                <div className="summary-row">
                  <span>Signed-in as:</span>
                  <span className="summary-value">{profile?.displayName}</span>
                </div>
                <div className="summary-row">
                  <span>Email:</span>
                  <span className="summary-value">{user?.email}</span>
                </div>
              </div>
            </div>

            {/* Customer Info */}
            <div className="customer-info-card">
              <h3>Shipping Information</h3>
              <p>Confirm where the knife should be shipped. This information is shown before payment.</p>

              <div className="checkout-shipping-grid">
                <input className="checkout-input" placeholder="Full name" value={shippingInfo.fullName} onChange={(e) => setShippingInfo((p) => ({ ...p, fullName: e.target.value }))} />
                <input className="checkout-input" placeholder="Email address" value={shippingInfo.email} onChange={(e) => setShippingInfo((p) => ({ ...p, email: e.target.value }))} />
                <input className="checkout-input checkout-span-2" placeholder="Street address" value={shippingInfo.addressLine1} onChange={(e) => setShippingInfo((p) => ({ ...p, addressLine1: e.target.value }))} />
                <input className="checkout-input checkout-span-2" placeholder="Apartment, suite, etc. (optional)" value={shippingInfo.addressLine2} onChange={(e) => setShippingInfo((p) => ({ ...p, addressLine2: e.target.value }))} />
                <input className="checkout-input" placeholder="City" value={shippingInfo.city} onChange={(e) => setShippingInfo((p) => ({ ...p, city: e.target.value }))} />
                <input className="checkout-input" placeholder="State" value={shippingInfo.state} onChange={(e) => setShippingInfo((p) => ({ ...p, state: e.target.value }))} />
                <input className="checkout-input" placeholder="Postal code" value={shippingInfo.postalCode} onChange={(e) => setShippingInfo((p) => ({ ...p, postalCode: e.target.value }))} />
              </div>
            </div>
          </div>

          {/* Payment Section */}
          <div className="checkout-payment">
            <div className="payment-card">
              <h2>Payment Method</h2>

              <div className="checkout-order-meta">
                <div><span>Item</span><strong>{knife.name}</strong></div>
                <div><span>Total</span><strong>${totalDisplay} USD</strong></div>
              </div>

              {checkoutError && (
                <div className="error-message mb-3">{checkoutError}</div>
              )}

              {!orderCreated && !checkoutError && (
                <div className="checkout-loading">
                  <p>Initializing checkout...</p>
                </div>
              )}

              {orderCreated && (
                <>
                  <div className="payment-methods">
                    <label className="payment-method-option">
                      <input
                        type="radio"
                        name="payment"
                        value="paypal"
                        checked={paymentMethod === "paypal"}
                        onChange={(e) => setPaymentMethod(e.target.value)}
                      />
                      <span>PayPal / Debit or Credit Card</span>
                    </label>
                  </div>

                  {paymentMethod === "paypal" && (
                    <div className="payment-button-container">
                      <div ref={paypalRef} style={{ width: "100%" }}></div>
                      {paymentLoading && <p className="loading-text">Processing...</p>}
                    </div>
                  )}

                  <p className="secure-payment-notice">
                    <LucideIcon name="Lock" size={14} /> Your payment information is secure and processed by PayPal. We never store your payment details.
                  </p>
                </>
              )}

              <button
                className="btn btn-outline-light w-100 mt-3"
                onClick={() => {
                  showToast("Checkout cancelled.", "info");
                  navigate("/store");
                }}
                disabled={paymentLoading}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
