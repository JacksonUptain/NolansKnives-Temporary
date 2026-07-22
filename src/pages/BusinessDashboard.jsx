import React, { useEffect, useMemo, useState } from "react";
import { ref, onValue, push, remove, serverTimestamp, set, update } from "firebase/database";
import { db } from "./firebase";
import { updateFulfillmentStatus } from "../services/adminService";
import { markConversationRead, sendStaffMessage } from "../services/chatService";
import { formatKnifeStatus, getPublicKnifeStatus } from "./knifeStatus";
import { showToast } from "../components/Toast";
import { showConfirm } from "../components/ConfirmDialog";
import "./BusinessDashboard.css";

const FULFILLMENT_STATUSES = ["unfulfilled", "processing", "shipped", "delivered"];
const KNIFE_STATUSES = ["available", "pending", "sold"];
const DISPLAY_LOCATIONS = ["store", "gallery", "both"];

export default function BusinessDashboard() {
  const [stats, setStats] = useState({
    availableKnives: 0,
    pendingKnives: 0,
    soldKnives: 0,
    pendingOrders: 0,
    paidOrders: 0,
    unfulfilledOrders: 0,
    unreadConversations: 0
  });
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [messages, setMessages] = useState([]);
  const [selectedConversationId, setSelectedConversationId] = useState("");
  const [statusDrafts, setStatusDrafts] = useState({});
  const [productDrafts, setProductDrafts] = useState({});
  const [newProduct, setNewProduct] = useState({
    name: "",
    description: "",
    price: "",
    src: "",
    saleStatus: "available",
    displayLocation: "store"
  });
  const [replyText, setReplyText] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingOrderId, setSavingOrderId] = useState("");
  const [savingProductId, setSavingProductId] = useState("");

  useEffect(() => {
    let productsLoaded = false;
    let ordersLoaded = false;
    let conversationsLoaded = false;
    const loadingTimeout = window.setTimeout(() => {
      setLoading(false);
    }, 7000);

    const maybeDoneLoading = () => {
      if (productsLoaded && ordersLoaded && conversationsLoaded) {
        setLoading(false);
      }
    };

    const markError = (label, err) => {
      const message = err?.message || `Failed to load ${label.toLowerCase()}.`;
      setError((prev) => (prev ? `${prev}\n${message}` : message));
      setLoading(false);
    };

    const unsubProducts = onValue(ref(db, "Products"), (snapshot) => {
      const knives = snapshot.exists()
        ? Object.entries(snapshot.val()).map(([productId, value]) => ({ productId, ...value }))
        : [];

      const available = knives.filter((k) => getPublicKnifeStatus(k) === "available").length;
      const pending = knives.filter((k) => getPublicKnifeStatus(k) === "pending").length;
      const sold = knives.filter((k) => getPublicKnifeStatus(k) === "sold").length;

      setProducts(knives.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)));
      setStats((prev) => ({
        ...prev,
        availableKnives: available,
        pendingKnives: pending,
        soldKnives: sold
      }));

      productsLoaded = true;
      maybeDoneLoading();
    }, (err) => markError("products", err));

    const unsubOrders = onValue(ref(db, "orders"), (snapshot) => {
      const list = snapshot.exists()
        ? Object.entries(snapshot.val()).map(([orderId, value]) => ({ orderId, ...value }))
        : [];

      list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      setOrders(list);

      setStats((prev) => ({
        ...prev,
        pendingOrders: list.filter((o) => o.status === "pending").length,
        paidOrders: list.filter((o) => o.status === "paid" || o.status === "approved").length,
        unfulfilledOrders: list.filter((o) => (o.fulfillmentStatus || "unfulfilled") === "unfulfilled").length
      }));

      ordersLoaded = true;
      maybeDoneLoading();
    }, (err) => markError("orders", err));

    const unsubConversations = onValue(ref(db, "conversations"), (snapshot) => {
      const list = snapshot.exists()
        ? Object.entries(snapshot.val()).map(([conversationId, value]) => ({
            conversationId,
            ...value,
            staffUnreadCount: value.staffUnreadCount || 0
          }))
        : [];

      list.sort((a, b) => (b.lastMessageAt || 0) - (a.lastMessageAt || 0));
      setConversations(list);

      setStats((prev) => ({
        ...prev,
        unreadConversations: list.filter((c) => (c.staffUnreadCount || 0) > 0).length
      }));

      conversationsLoaded = true;
      maybeDoneLoading();
    }, (err) => markError("conversations", err));

    return () => {
      window.clearTimeout(loadingTimeout);
      unsubProducts();
      unsubOrders();
      unsubConversations();
    };
  }, []);

  useEffect(() => {
    if (!selectedConversationId) {
      setMessages([]);
      return;
    }

    const unsubMessages = onValue(ref(db, `messages/${selectedConversationId}`), (snapshot) => {
      const list = snapshot.exists()
        ? Object.entries(snapshot.val()).map(([messageId, value]) => ({ messageId, ...value }))
        : [];

      list.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
      setMessages(list);
    });

    return () => unsubMessages();
  }, [selectedConversationId]);

  const ordersById = useMemo(() => {
    const map = {};
    orders.forEach((o) => {
      map[o.orderId] = o;
    });
    return map;
  }, [orders]);

  const selectedConversation = useMemo(
    () => conversations.find((conv) => (conv.orderId || conv.conversationId) === selectedConversationId),
    [conversations, selectedConversationId]
  );

  const selectedConversationMessages = useMemo(() => messages, [messages]);

  const normalizeImages = (value) =>
    value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

  const handleCreateProduct = async (event) => {
    event.preventDefault();
    const name = newProduct.name.trim();
    if (!name) {
      showToast("Please enter a knife name.", "error");
      return;
    }

    if (!newProduct.price || Number(newProduct.price) <= 0) {
      showToast("Please enter a valid price.", "error");
      return;
    }

    try {
      setError("");
      const productRef = push(ref(db, "Products"));
      await set(productRef, {
        name,
        description: newProduct.description.trim(),
        price: Number(newProduct.price || 0),
        src: normalizeImages(newProduct.src),
        saleStatus: newProduct.saleStatus,
        displayLocation: newProduct.displayLocation,
        sold: newProduct.saleStatus === "sold",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      setNewProduct({ name: "", description: "", price: "", src: "", saleStatus: "available", displayLocation: "store" });
      showToast("Knife added to catalog.", "success");
    } catch (err) {
      const msg = err?.message || "Failed to create knife.";
      setError(msg);
      showToast(msg, "error");
    }
  };

  const handleSaveProduct = async (product) => {
    const draft = productDrafts[product.productId] || {};
    const nextName = draft.name ?? product.name ?? "";
    const nextDescription = draft.description ?? product.description ?? "";
    const nextPrice = Number(draft.price ?? product.price ?? 0);
    const nextSaleStatus = draft.saleStatus ?? product.saleStatus ?? "available";
    const nextDisplayLocation = draft.displayLocation ?? product.displayLocation ?? "store";
    const nextSrc = typeof draft.src === "string" ? normalizeImages(draft.src) : product.src || [];

    try {
      setError("");
      setSavingProductId(product.productId);
      await update(ref(db, `Products/${product.productId}`), {
        name: nextName,
        description: nextDescription,
        price: nextPrice,
        src: nextSrc,
        saleStatus: nextSaleStatus,
        displayLocation: nextDisplayLocation,
        sold: nextSaleStatus === "sold",
        updatedAt: serverTimestamp()
      });
      setProductDrafts(prev => {
        const next = {...prev};
        delete next[product.productId];
        return next;
      });
      showToast(`"${nextName}" updated.`, "success");
    } catch (err) {
      const msg = err?.message || "Failed to save knife.";
      setError(msg);
      showToast(msg, "error");
    } finally {
      setSavingProductId("");
    }
  };

  const handleDeleteProduct = async (productId, productName) => {
    await showConfirm(
      "Delete Knife",
      `Remove "${productName}" from the catalog? This action cannot be undone.`,
      async () => {
        try {
          setError("");
          await remove(ref(db, `Products/${productId}`));
          showToast("Knife deleted from catalog.", "success");
        } catch (err) {
          const msg = err?.message || "Failed to delete knife.";
          setError(msg);
          showToast(msg, "error");
        }
      }
    );
  };

  const handleSetDisplayLocation = async (product, displayLocation) => {
    try {
      setError("");
      await update(ref(db, `Products/${product.productId}`), {
        displayLocation,
        updatedAt: serverTimestamp()
      });
    } catch (err) {
      setError(err?.message || "Failed to move knife.");
    }
  };

  const handleSendReply = async () => {
    if (!selectedConversationId || !replyText.trim()) {
      showToast("Enter a message to send.", "error");
      return;
    }

    try {
      setError("");
      await sendStaffMessage({ orderId: selectedConversationId, text: replyText.trim() });
      setReplyText("");
      showToast("Message sent.", "success");
    } catch (err) {
      const msg = err?.message || "Failed to send reply.";
      setError(msg);
      showToast(msg, "error");
    }
  };

  const handleStatusSave = async (orderId) => {
    const order = ordersById[orderId];
    if (!order) return;

    const nextStatus = statusDrafts[orderId] || order.fulfillmentStatus || "unfulfilled";
    if (nextStatus === (order.fulfillmentStatus || "unfulfilled")) {
      showToast("No change to fulfillment status.", "info");
      return;
    }

    try {
      setError("");
      setSavingOrderId(orderId);
      await updateFulfillmentStatus({ orderId, status: nextStatus });
      setStatusDrafts(prev => {
        const next = {...prev};
        delete next[orderId];
        return next;
      });
      showToast(`Order status updated to ${nextStatus}.`, "success");
    } catch (e) {
      const msg = e?.message || "Failed to update fulfillment status.";
      setError(msg);
      showToast(msg, "error");
    } finally {
      setSavingOrderId("");
    }
  };

  const handleMarkRead = async (orderId) => {
    try {
      setError("");
      await markConversationRead({ orderId });
      showToast("Marked as read.", "success");
    } catch (e) {
      const msg = e?.message || "Failed to mark conversation as read.";
      setError(msg);
      showToast(msg, "error");
    }
  };

  return (
    <div className="business-dashboard-page">
      <div className="dashboard-container">
        <h1>Business Dashboard</h1>

        {loading && <p>Loading dashboard...</p>}
        {!!error && <p className="dashboard-error">{error}</p>}

        {!loading && (
          <>
            <div className="dashboard-stats">
              <div className="stat-card"><h3>Available Knives</h3><p className="stat-number">{stats.availableKnives}</p></div>
              <div className="stat-card"><h3>Pending Knives</h3><p className="stat-number">{stats.pendingKnives}</p></div>
              <div className="stat-card"><h3>Sold Knives</h3><p className="stat-number">{stats.soldKnives}</p></div>
              <div className="stat-card"><h3>Pending Orders</h3><p className="stat-number">{stats.pendingOrders}</p></div>
              <div className="stat-card"><h3>Paid Orders</h3><p className="stat-number">{stats.paidOrders}</p></div>
              <div className="stat-card"><h3>Unread Messages</h3><p className="stat-number">{stats.unreadConversations}</p></div>
            </div>

            <section className="dashboard-panel">
              <h2>Knife Catalog</h2>
              <div className="panel-help">
                <small>Add and manage your knife inventory. Control visibility and sale status.</small>
              </div>
              <form className="catalog-create-form" onSubmit={handleCreateProduct}>
                <input className="input-field" placeholder="Knife name *" value={newProduct.name} onChange={(e) => setNewProduct((prev) => ({ ...prev, name: e.target.value }))} required />
                <input className="input-field" placeholder="Price *" type="number" step="0.01" value={newProduct.price} onChange={(e) => setNewProduct((prev) => ({ ...prev, price: e.target.value }))} required />
                <select className="select-input" value={newProduct.saleStatus} onChange={(e) => setNewProduct((prev) => ({ ...prev, saleStatus: e.target.value }))}>
                  {KNIFE_STATUSES.map((status) => <option key={status} value={status}>{formatKnifeStatus(status)}</option>)}
                </select>
                <select className="select-input" value={newProduct.displayLocation} onChange={(e) => setNewProduct((prev) => ({ ...prev, displayLocation: e.target.value }))}>
                  {DISPLAY_LOCATIONS.map((location) => <option key={location} value={location}>{location}</option>)}
                </select>
                <input className="input-field catalog-span-2" placeholder="Image URLs (comma-separated)" value={newProduct.src} onChange={(e) => setNewProduct((prev) => ({ ...prev, src: e.target.value }))} />
                <textarea className="input-field catalog-textarea" placeholder="Knife description" value={newProduct.description} onChange={(e) => setNewProduct((prev) => ({ ...prev, description: e.target.value }))} />
                <button type="submit" className="action-btn">Add Knife</button>
              </form>

              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Price</th>
                      <th>Public Status</th>
                      <th>Location</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.length === 0 && <tr><td colSpan={5} className="table-empty">No knives in catalog.</td></tr>}
                    {products.map((product) => {
                      const draft = productDrafts[product.productId] || {};
                      const publicStatus = getPublicKnifeStatus(product);

                      return (
                        <tr key={product.productId}>
                          <td>
                            <input
                              className="input-field"
                              value={draft.name ?? product.name ?? ""}
                              onChange={(e) => setProductDrafts((prev) => ({ ...prev, [product.productId]: { ...(prev[product.productId] || {}), name: e.target.value } }))}
                            />
                          </td>
                          <td>
                            <input
                              className="input-field"
                              type="number"
                              step="0.01"
                              value={draft.price ?? product.price ?? ""}
                              onChange={(e) => setProductDrafts((prev) => ({ ...prev, [product.productId]: { ...(prev[product.productId] || {}), price: e.target.value } }))}
                            />
                          </td>
                          <td>
                            <select
                              className="select-input"
                              value={draft.saleStatus ?? product.saleStatus ?? "available"}
                              onChange={(e) => setProductDrafts((prev) => ({ ...prev, [product.productId]: { ...(prev[product.productId] || {}), saleStatus: e.target.value } }))}
                            >
                              {KNIFE_STATUSES.map((status) => <option key={status} value={status}>{formatKnifeStatus(status)}</option>)}
                            </select>
                            <div className="status-note">{formatKnifeStatus(publicStatus)}</div>
                          </td>
                          <td>
                            <select
                              className="select-input"
                              value={draft.displayLocation ?? product.displayLocation ?? "store"}
                              onChange={(e) => setProductDrafts((prev) => ({ ...prev, [product.productId]: { ...(prev[product.productId] || {}), displayLocation: e.target.value } }))}
                            >
                              {DISPLAY_LOCATIONS.map((location) => <option key={location} value={location}>{location}</option>)}
                            </select>
                          </td>
                          <td className="action-cell">
                            <button className="action-btn" disabled={savingProductId === product.productId} onClick={() => handleSaveProduct(product)}>
                              {savingProductId === product.productId ? "…" : "Save"}
                            </button>
                            <button className="action-btn secondary" onClick={() => handleSetDisplayLocation(product, "store")}>Store</button>
                            <button className="action-btn secondary" onClick={() => handleSetDisplayLocation(product, "gallery")}>Gallery</button>
                            <button className="action-btn danger" onClick={() => handleDeleteProduct(product.productId, product.name)}>Delete</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="dashboard-panel">
              <h2>Order Management</h2>
              <div className="panel-help">
                <small>Track orders and update fulfillment status as you work through them.</small>
              </div>
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Order ID</th>
                      <th>Customer</th>
                      <th>Payment Status</th>
                      <th>Fulfillment</th>
                      <th>Amount</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.length === 0 && (
                      <tr><td colSpan={6} className="table-empty">No orders yet.</td></tr>
                    )}
                    {orders.slice(0, 50).map((order) => (
                      <tr key={order.orderId}>
                        <td className="order-id">{order.orderId.substring(0, 12)}</td>
                        <td className="order-customer">{order.customerEmail || order.uid?.substring(0, 8) || "—"}</td>
                        <td>
                          <span className={`status-badge status-${order.status}`}>
                            {order.status || "—"}
                          </span>
                        </td>
                        <td>
                          <select
                            className="select-input"
                            value={statusDrafts[order.orderId] ?? order.fulfillmentStatus ?? "unfulfilled"}
                            onChange={(e) => setStatusDrafts((prev) => ({ ...prev, [order.orderId]: e.target.value }))}
                          >
                            {FULFILLMENT_STATUSES.map((s) => (
                              <option key={s} value={s}>{s}</option>
                            ))}
                          </select>
                        </td>
                        <td><strong>${Number(order.amount || 0).toFixed(2)}</strong></td>
                        <td>
                          <button
                            className="action-btn"
                            disabled={savingOrderId === order.orderId}
                            onClick={() => handleStatusSave(order.orderId)}
                          >
                            {savingOrderId === order.orderId ? "…" : "Save"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="dashboard-panel">
              <h2>Customer Conversations</h2>
              <div className="panel-help">
                <small>Manage customer inquiries about their orders. New messages will appear here.</small>
              </div>
              <div className="conversation-layout">
                <div className="conversation-list">
                  {conversations.length === 0 && <p className="no-conversations">No conversations yet.</p>}
                  {conversations.slice(0, 50).map((conv) => (
                    <button
                      key={conv.conversationId}
                      className={`conversation-row ${selectedConversationId === (conv.orderId || conv.conversationId) ? "active" : ""}`}
                      onClick={() => setSelectedConversationId(conv.orderId || conv.conversationId)}
                    >
                      <div className="conversation-info">
                        <span className="conversation-label">Order: {conv.orderId?.substring(0, 12)}</span>
                        <span className={`badge ${conv.staffUnreadCount > 0 ? "badge-unread" : "badge-read"}`}>
                          {conv.staffUnreadCount} new
                        </span>
                      </div>
                    </button>
                  ))}
                </div>

                <div className="conversation-thread">
                  {!selectedConversationId && <div className="empty-conversation"><p>Select a conversation to start.</p></div>}
                  {!!selectedConversationId && (
                    <>
                      <div className="thread-header">
                        <div>
                          <h3>Conversation</h3>
                          <p className="thread-subtitle">Order: {selectedConversationId?.substring(0, 12)}</p>
                        </div>
                        {selectedConversation?.staffUnreadCount > 0 && (
                          <button className="action-btn secondary" onClick={() => handleMarkRead(selectedConversationId)}>
                            Mark Read
                          </button>
                        )}
                      </div>
                      <div className="thread-messages">
                        {selectedConversationMessages.length === 0 && <p className="no-messages">No messages yet. Start the conversation.</p>}
                        {selectedConversationMessages.map((m) => (
                          <div key={m.messageId} className={`thread-message message-${m.senderRole || "customer"}`}>
                            <div className="thread-meta">
                              <strong>{m.senderRole === "staff" ? "You" : "Customer"}</strong>
                              <span>{m.createdAt ? new Date(m.createdAt).toLocaleString() : ""}</span>
                            </div>
                            <p>{m.text}</p>
                          </div>
                        ))}
                      </div>
                      <div className="thread-reply-box">
                        <textarea
                          className="input-field"
                          rows="3"
                          placeholder="Reply to customer"
                          value={replyText}
                          onChange={(e) => setReplyText(e.target.value)}
                        />
                        <button className="action-btn" onClick={handleSendReply}>Send Reply</button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
