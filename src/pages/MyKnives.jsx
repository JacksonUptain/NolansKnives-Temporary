import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import Conversation from "../components/Conversation";
import LucideIcon from "../components/ui/LucideIcon";
import Skeleton from "../components/ui/Skeleton";
import { formatKnifeStatus, getPublicKnifeStatus } from "./knifeStatus";
import { getMyPurchases } from "../services/myKnivesService";
import "./MyKnives.css";

function formatOrderId(id) {
  if (!id) return "-";
  if (id.length <= 8) return id;
  return `#${id.slice(-6).toUpperCase()}`;
}

function formatCurrency(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function formatDate(value) {
  if (!value) return "-";
  const date = typeof value === "number" ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString();
}

function labelize(value) {
  return String(value || "-").replace(/_/g, " ").replace(/\b\w/g, (match) => match.toUpperCase());
}

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
  return labels[normalized] || labelize(normalized);
}

function isPriorityRequest(request = {}) {
  const normalized = String(request.status || "").toLowerCase();
  if (request.depositPurpose === "quote_acceptance" || request.quoteAcceptedAt || normalized === "quote_accepted") {
    return false;
  }
  return !!request.priority || !!request.priorityDepositPaid || normalized === "priority_review";
}

function customRequestTypeLabel(request = {}) {
  const normalized = String(request.status || "").toLowerCase();
  if (["quote_accepted", "in_production", "completed", "shipped", "delivered"].includes(normalized)) {
    return "Custom build";
  }
  return isPriorityRequest(request) ? "Priority custom request" : "Custom request";
}

function customerRequestStatus(request = {}) {
  const normalized = String(request.status || "").toLowerCase();
  const labels = {
    pending_payment: "Deposit ready",
    unpaid_unverified: "Sent",
    pending_review: "With Nolan",
    needs_review: "With Nolan",
    priority_review: "With Nolan",
    quote_sent: "Quote ready",
    pending_acceptance: "Quote ready",
    quote_accepted: "Accepted",
    in_production: "In progress",
    completed: "Complete",
    shipped: "Shipped",
    delivered: "Delivered",
    cancelled: "Closed",
    canceled: "Closed"
  };
  return labels[normalized] || "Sent";
}

function customerRequestDeposit(request = {}) {
  if (request.priorityDepositPaid || request.paymentStatus === "paid") return "Paid";
  if (request.skipPayment) return "No deposit";
  if (request.depositAmount) return formatCurrency(request.depositAmount);
  return "Not requested";
}

function customerRequestNextStep(request = {}) {
  if (request.chatEnabled) return "Messages available";
  if (String(request.status || "").toLowerCase() === "pending_payment") return "Place deposit";
  return "Awaiting review";
}

function firstImage(knife = {}) {
  if (Array.isArray(knife.src)) return knife.src[0] || "";
  return knife.src || "";
}

export default function MyKnives() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [purchases, setPurchases] = useState([]);
  const [customRequests, setCustomRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedKey, setSelectedKey] = useState("");

  useEffect(() => {
    if (!user) return;

    let active = true;

    const loadPurchases = async () => {
      try {
        const response = await getMyPurchases();
        if (!active) return;

        const orderRows = response.purchases || [];
        const requestRows = response.customRequests || [];
        setPurchases(orderRows);
        setCustomRequests(requestRows);
        setSelectedKey((current) => current || (orderRows[0]?.orderId ? `order:${orderRows[0].orderId}` : requestRows[0]?.requestId ? `request:${requestRows[0].requestId}` : ""));
      } catch (error) {
        console.error("Failed to load purchases", error);
        if (active) {
          setPurchases([]);
          setCustomRequests([]);
          setSelectedKey("");
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    loadPurchases();

    return () => {
      active = false;
    };
  }, [user]);

  const items = useMemo(() => {
    const orderItems = purchases.map((row) => ({
      key: `order:${row.orderId}`,
      type: "order",
      id: row.orderId,
      order: row.order || {},
      knife: row.knife || {},
      createdAt: row.order?.createdAt || 0
    }));

    const requestItems = customRequests.map((row) => ({
      key: `request:${row.requestId}`,
      type: "request",
      id: row.requestId,
      request: row.request || {},
      createdAt: row.request?.createdAt || 0
    }));

    return [...orderItems, ...requestItems].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }, [purchases, customRequests]);

  const selectedItem = items.find((item) => item.key === selectedKey) || items[0] || null;

  if (loading) {
    return (
      <div className="my-knives-page">
        <div className="my-knives-container">
          <div style={{display:'grid',gap:12}}>
            <Skeleton height="28px" style={{width:'40%'}} />
            <Skeleton height="14px" style={{width:'60%'}} />
            <Skeleton height="120px" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="my-knives-page">
      <div className="my-knives-container">
        <div className="my-knives-header">
          <div>
            <h1>Your Knives</h1>
            <p>Follow your purchases and custom requests in one place.</p>
          </div>
          <button className="btn btn-outline-light" onClick={() => navigate("/Store")}>Browse the Store</button>
        </div>

        {items.length === 0 ? (
          <div className="empty-state">
            <h2>No purchases or requests yet.</h2>
            <p>Your store purchases and custom requests will appear here.</p>
            <button className="btn btn-warning" onClick={() => navigate("/Store")}>
              Browse the Store
            </button>
          </div>
        ) : (
          <div className="my-knives-layout">
            <div className="purchases-grid">
              {items.map((item) => {
                const isSelected = selectedItem?.key === item.key;
                const isOrder = item.type === "order";
                const order = item.order || {};
                const knife = item.knife || {};
                const request = item.request || {};
                const image = isOrder ? firstImage(knife) : "";

                return (
                  <button key={item.key} className={`purchase-card purchase-card-button ${isSelected ? "selected" : ""}`} onClick={() => setSelectedKey(item.key)}>
                    {image ? (
                      <div className="purchase-image">
                        <img src={image} alt={knife.name || "Knife"} />
                      </div>
                    ) : (
                      <div className="purchase-image request-image-placeholder">
                        <LucideIcon name={isOrder ? "Image" : "Wand2"} size={30} />
                      </div>
                    )}

                    <div className="purchase-details">
                      <span className="item-type-pill">{isOrder ? "Store purchase" : customRequestTypeLabel(request)}</span>
                      <h3>{isOrder ? knife.name || "Knife purchase" : "Custom Knife Request"}</h3>

                      <div className="detail-row">
                        <span className="label">{isOrder ? "Order" : "Request"}:</span>
                        <span className="value">{formatOrderId(item.id)}</span>
                      </div>

                      <div className="detail-row">
                        <span className="label">{isOrder ? "Price" : "Estimate"}:</span>
                        <span className="value">{formatCurrency(isOrder ? order.amount || knife.price : request.estimatedPrice)}</span>
                      </div>

                      <div className="detail-row">
                        <span className="label">Submitted:</span>
                        <span className="value">{formatDate(isOrder ? order.createdAt : request.createdAt)}</span>
                      </div>

                      <div className="detail-row">
                        <span className="label">Status:</span>
                        <span className={`status ${isOrder ? `status-${order.fulfillmentStatus || "unfulfilled"}` : "status-public"}`}>
                          {isOrder ? customerFulfillmentStatus(order.fulfillmentStatus) : customerRequestStatus(request)}
                        </span>
                      </div>
                    </div>

                    <div className="purchase-actions">
                      {isOrder && (
                        <button className="btn btn-outline-light btn-sm" onClick={(event) => { event.stopPropagation(); navigate(`/my-knives/${item.id}`); }}>
                          <LucideIcon name="Eye" size={14} /> <span>Open</span>
                        </button>
                      )}
                      <button className="btn btn-warning btn-sm" onClick={(event) => { event.stopPropagation(); setSelectedKey(item.key); }}>
                        <LucideIcon name="MessageSquare" size={14} /> <span>{isOrder || request.chatEnabled ? "Chat" : "Details"}</span>
                      </button>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="my-knives-detail-panel">
              {selectedItem?.type === "order" && (
                <>
                  <div className="detail-summary-card">
                    <h2>{selectedItem.knife.name}</h2>
                    <p>{selectedItem.knife.description}</p>
                    <div className="detail-summary-grid">
                      <div><span>Order</span><strong>{formatOrderId(selectedItem.id)}</strong></div>
                      <div><span>Payment</span><strong>{customerPaymentStatus(selectedItem.order.status)}</strong></div>
                      <div><span>Fulfillment</span><strong>{customerFulfillmentStatus(selectedItem.order.fulfillmentStatus)}</strong></div>
                      <div><span>Knife</span><strong>{formatKnifeStatus(getPublicKnifeStatus(selectedItem.knife, selectedItem.order))}</strong></div>
                      <div><span>Expected arrival</span><strong>{selectedItem.order.expectedArrivalDate || "To be confirmed"}</strong></div>
                      <div><span>Tracking</span><strong>{selectedItem.order.trackingUrl ? "Available" : "Not available yet"}</strong></div>
                    </div>
                    <button className="btn btn-warning" onClick={() => navigate(`/my-knives/${selectedItem.id}`)}>Open Full Detail</button>
                  </div>
                  <div className="detail-chat-card">
                    <h3>Messages</h3>
                    {["paid", "approved"].includes(selectedItem.order.status) ? (
                      <Conversation orderId={selectedItem.id} knife={selectedItem.knife} />
                    ) : (
                      <p>Messages will be available after payment is complete.</p>
                    )}
                  </div>
                </>
              )}

              {selectedItem?.type === "request" && (
                <>
                  <div className="detail-summary-card">
                    <h2>Custom Knife Request</h2>
                    <p>{selectedItem.request.additionalNotes || "No custom notes included."}</p>
                    <div className="detail-summary-grid">
                      <div><span>Request</span><strong>{formatOrderId(selectedItem.id)}</strong></div>
                      <div><span>Status</span><strong>{customerRequestStatus(selectedItem.request)}</strong></div>
                      <div><span>Estimate</span><strong>{formatCurrency(selectedItem.request.estimatedPrice)}</strong></div>
                      <div><span>Deposit</span><strong>{customerRequestDeposit(selectedItem.request)}</strong></div>
                      <div><span>Next step</span><strong>{customerRequestNextStep(selectedItem.request)}</strong></div>
                    </div>
                  </div>
                  <div className="detail-chat-card">
                    <h3>Request Messages</h3>
                    {selectedItem.request.chatEnabled ? (
                      <Conversation orderId={selectedItem.id} knife={{ name: "Custom Knife Request" }} />
                    ) : (
                      <p>Messages will appear here if Nolan has follow-up questions or sends a quote.</p>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
