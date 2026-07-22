import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ref, get } from "firebase/database";
import { db } from "./firebase";
import { useAuth } from "../auth/AuthProvider";
import Conversation from "../components/Conversation";
import LucideIcon from '../components/ui/LucideIcon';
import { formatKnifeStatus, getPublicKnifeStatus } from "./knifeStatus";
import { updateOrderShippingAddress } from "../services/myKnivesService";
import { showToast } from "../components/Toast";
import "./PurchaseDetail.css";

function customerPaymentStatus(status) {
  const normalized = String(status || "").toLowerCase();
  if (["paid", "approved", "captured", "completed"].includes(normalized)) return "Paid";
  if (["pending", "created", "pending_payment"].includes(normalized)) return "Payment pending";
  if (["failed", "declined", "cancelled", "canceled"].includes(normalized)) return "Payment issue";
  return "In review";
}

function customerFulfillmentStatus(status) {
  const normalized = String(status || "unfulfilled").toLowerCase();
  const labels = {
    unfulfilled: "Getting started",
    pending: "Getting started",
    processing: "In progress",
    in_production: "In progress",
    ready: "Ready",
    shipped: "Shipped",
    delivered: "Delivered",
    completed: "Complete",
    cancelled: "Closed",
    canceled: "Closed"
  };
  return labels[normalized] || formatKnifeStatus(normalized);
}

export default function PurchaseDetail() {
  const navigate = useNavigate();
  const { orderId } = useParams();
  const { user } = useAuth();
  const [order, setOrder] = useState(null);
  const [knife, setKnife] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState('overview');
  const [shippingDraft, setShippingDraft] = useState({
    fullName: "",
    addressLine1: "",
    addressLine2: "",
    city: "",
    state: "",
    postalCode: "",
    countryCode: "US"
  });
  const [savingShipping, setSavingShipping] = useState(false);
  const [shippingSaved, setShippingSaved] = useState(false);

  useEffect(() => {
    if (!user || !orderId) return;

    const loadPurchaseDetail = async () => {
      try {
        // Verify user owns this order
        const userOrderRef = ref(db, `userOrders/${user.uid}/${orderId}`);
        const userOrderSnap = await get(userOrderRef);

        if (!userOrderSnap.exists()) {
          setError("Order not found for this account.");
          setLoading(false);
          return;
        }

        // Load order details
        const orderRef = ref(db, `orders/${orderId}`);
        const orderSnap = await get(orderRef);

        if (orderSnap.exists()) {
          const orderData = orderSnap.val();
          setOrder(orderData);
          setShippingDraft({
            fullName: orderData.shippingAddress?.fullName || "",
            addressLine1: orderData.shippingAddress?.addressLine1 || "",
            addressLine2: orderData.shippingAddress?.addressLine2 || "",
            city: orderData.shippingAddress?.city || "",
            state: orderData.shippingAddress?.state || "",
            postalCode: orderData.shippingAddress?.postalCode || "",
            countryCode: orderData.shippingAddress?.countryCode || "US"
          });

          // Load knife details
          const knifeRef = ref(db, `Products/${orderData.knifeId}`);
          const knifeSnap = await get(knifeRef);

          if (knifeSnap.exists()) {
            setKnife(knifeSnap.val());
          }
        }
      } catch (err) {
        setError(err.message || "Failed to load purchase details");
        console.error("Load error:", err);
      } finally {
        setLoading(false);
      }
    };

    loadPurchaseDetail();
  }, [user, orderId]);

  if (loading) {
    return (
      <div className="purchase-detail-page">
        <div className="detail-container">
          <p>Loading your order...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="purchase-detail-page">
        <div className="detail-container">
          <p className="error-message">{error}</p>
          <button className="btn btn-warning" onClick={() => navigate("/my-knives")}>
            Back to My Knives
          </button>
        </div>
      </div>
    );
  }

  if (!order || !knife) {
    return (
      <div className="purchase-detail-page">
        <div className="detail-container">
          <p>Purchase not found.</p>
          <button className="btn btn-warning" onClick={() => navigate("/my-knives")}>
            Back to My Knives
          </button>
        </div>
      </div>
    );
  }

  const publicStatus = getPublicKnifeStatus(knife, order);
  const shippingLocked = ["shipped", "delivered"].includes(order.fulfillmentStatus);
  const formatOrderId = (id) => {
    if (!id) return "-";
    if (id.length <= 8) return id;
    return `#${id.slice(-6).toUpperCase()}`;
  };

  const handleShippingChange = (field, value) => {
    setShippingSaved(false);
    setShippingDraft((prev) => ({ ...prev, [field]: value }));
  };

  const handleSaveShipping = async () => {
    try {
      setSavingShipping(true);
      await updateOrderShippingAddress({ orderId, shippingAddress: shippingDraft });
      setOrder((prev) => ({ ...prev, shippingAddress: { ...shippingDraft, source: "customer" } }));
      setShippingSaved(true);
      showToast("Shipping address updated.", "success");
    } catch (err) {
      showToast(err?.message || "Failed to update shipping address.", "error");
    } finally {
      setSavingShipping(false);
    }
  };


  return (
    <div className="purchase-detail-page">
      <div className="detail-container">
        <button className="back-button" onClick={() => navigate('/my-knives')}>
          <LucideIcon name="ArrowLeft" size={16} />
          Back to My Knives
        </button>

        <div className="purchase-tabs">
          <button className={`tab ${activeTab === 'overview' ? 'active' : ''}`} onClick={() => setActiveTab('overview')}>
            <LucideIcon name="FileText" size={14} /> Overview
          </button>
          <button className={`tab ${activeTab === 'status' ? 'active' : ''}`} onClick={() => setActiveTab('status')}>
            <LucideIcon name="Activity" size={14} /> Status
          </button>
          <button className={`tab ${activeTab === 'payments' ? 'active' : ''}`} onClick={() => setActiveTab('payments')}>
            <LucideIcon name="CreditCard" size={14} /> Payments
          </button>
          <button className={`tab ${activeTab === 'shipping' ? 'active' : ''}`} onClick={() => setActiveTab('shipping')}>
            <LucideIcon name="Truck" size={14} /> Shipping
          </button>
          <button className={`tab ${activeTab === 'messages' ? 'active' : ''}`} onClick={() => setActiveTab('messages')}>
            <LucideIcon name="MessageSquare" size={14} /> Messages
          </button>
          <button className={`tab ${activeTab === 'documents' ? 'active' : ''}`} onClick={() => setActiveTab('documents')}>
            <LucideIcon name="Image" size={14} /> Documents
          </button>
        </div>

        <div className="detail-content">
          {activeTab === 'overview' && (
            <div className="detail-section">
              <h1>{knife.name}</h1>

              {knife.src && knife.src.length > 0 && (
                <img src={knife.src[0]} alt={knife.name} className="detail-image" />
              )}

              <div className="detail-info">
                <div className="info-row">
                  <span className="label">Price:</span>
                  <span className="value">${parseFloat(knife.price || 0).toFixed(2)}</span>
                </div>

                <div className="info-row">
                  <span className="label">Order:</span>
                  <span className="value">{formatOrderId(orderId)}</span>
                </div>

                {order.createdAt && (
                  <div className="info-row">
                    <span className="label">Purchased:</span>
                    <span className="value">{new Date(order.createdAt).toLocaleDateString()}</span>
                  </div>
                )}

                <div className="info-row">
                  <span className="label">Knife:</span>
                  <span className={`status status-${publicStatus}`}>{formatKnifeStatus(publicStatus)}</span>
                </div>

                {knife.description && (
                  <div className="description-section">
                    <h3>Description</h3>
                    <p>{knife.description}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'status' && (
            <div className="detail-section">
              <h2>Production & Fulfillment</h2>
              <p>Current status: <strong>{customerFulfillmentStatus(order.fulfillmentStatus)}</strong></p>
              <div className="detail-info">
                <div className="info-row"><span className="label">Expected arrival</span><span className="value">{order.expectedArrivalDate || 'To be confirmed'}</span></div>
                <div className="info-row"><span className="label">Tracking number</span><span className="value">{order.trackingNumber || 'Not available yet'}</span></div>
                <div className="info-row">
                  <span className="label">Tracking link</span>
                  <span className="value">
                    {order.trackingUrl ? <a href={order.trackingUrl} target="_blank" rel="noreferrer">Open tracking</a> : 'Not available yet'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'payments' && (
            <div className="detail-section">
              <h2>Payments</h2>
              <div className="info-row"><span className="label">Payment status</span><span className="value">{customerPaymentStatus(order.status)}</span></div>
              <p>Your PayPal receipt is tied to this order.</p>
            </div>
          )}

          {activeTab === 'shipping' && (
            <div className="detail-section">
              <h2>Shipping</h2>
              <p>{shippingLocked ? 'The shipping address can no longer be changed because this order has shipped.' : 'You can update this address until the order ships.'}</p>
              <div className="shipping-edit-grid">
                <label><span>Full name</span><input value={shippingDraft.fullName} disabled={shippingLocked} onChange={(e) => handleShippingChange('fullName', e.target.value)} /></label>
                <label><span>Street address</span><input value={shippingDraft.addressLine1} disabled={shippingLocked} onChange={(e) => handleShippingChange('addressLine1', e.target.value)} /></label>
                <label><span>Apartment, suite, etc.</span><input value={shippingDraft.addressLine2} disabled={shippingLocked} onChange={(e) => handleShippingChange('addressLine2', e.target.value)} /></label>
                <label><span>City</span><input value={shippingDraft.city} disabled={shippingLocked} onChange={(e) => handleShippingChange('city', e.target.value)} /></label>
                <label><span>State</span><input value={shippingDraft.state} disabled={shippingLocked} onChange={(e) => handleShippingChange('state', e.target.value)} /></label>
                <label><span>Postal code</span><input value={shippingDraft.postalCode} disabled={shippingLocked} onChange={(e) => handleShippingChange('postalCode', e.target.value)} /></label>
              </div>
              <button className="btn btn-warning" disabled={shippingLocked || savingShipping} onClick={handleSaveShipping}>
                {savingShipping ? 'Saving...' : shippingSaved ? 'Saved' : 'Save Shipping Address'}
              </button>
            </div>
          )}

          {activeTab === 'messages' && (
            <div className="detail-section chat-section" id="chat">
              <h2>Messages</h2>
              <Conversation orderId={orderId} knife={knife} />
            </div>
          )}

          {activeTab === 'documents' && (
            <div className="detail-section">
              <h2>Knife Images</h2>
              {knife.src && knife.src.length > 0 ? (
                <div className="image-gallery">
                  {knife.src.map((src, i) => (
                    <img key={i} src={src} alt={`${knife.name || 'Knife'} angle ${i + 1}`} style={{maxWidth: 200, marginRight: 12}} />
                  ))}
                </div>
              ) : (
                <p>No additional images are attached.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
