import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ref, onValue, query, orderByChild } from 'firebase/database';
import { db } from '../firebase';
import { useAuth } from '../../auth/AuthProvider';
import { updateFulfillmentStatus } from '../../services/adminService';
import { sendStaffMessage, markConversationRead } from '../../services/chatService';
import { showToast } from '../../components/Toast';
import LucideIcon from '../../components/ui/LucideIcon';
import '../BusinessDashboard.css';

const FULFILLMENT_STATUSES = ['unfulfilled', 'processing', 'shipped', 'delivered'];
const PAYMENT_FILTERS = ['all', 'pending', 'paid', 'approved'];
const FULFILLMENT_FILTERS = ['all', ...FULFILLMENT_STATUSES];
const MESSAGEABLE_ORDER_STATUSES = ['paid', 'approved'];
const IMAGE_URL_PATTERN = /(firebasestorage|googleusercontent|githubusercontent|images\/|\.)(png|jpe?g|webp|gif|avif|svg)(\?|$|&)/i;

function formatCurrency(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function formatOrderId(id) {
  if (!id) return '-';
  return id.length > 8 ? `#${id.slice(-6).toUpperCase()}` : `#${id.toUpperCase()}`;
}

function formatStatus(status) {
  return String(status || 'unfulfilled').replace(/_/g, ' ').replace(/\b\w/g, (match) => match.toUpperCase());
}

function formatLabel(value) {
  return String(value || '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function formatDate(value) {
  if (!value) return 'No date';
  const date = typeof value === 'number' ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) return 'No date';
  return date.toLocaleString();
}

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function isImageUrl(value) {
  return typeof value === 'string' && IMAGE_URL_PATTERN.test(value);
}

function normalizeImages(value) {
  const images = [];

  if (Array.isArray(value)) {
    value.forEach((item) => images.push(...normalizeImages(item)));
  } else if (typeof value === 'string') {
    value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
      .forEach((item) => {
        if (isImageUrl(item)) images.push(item);
      });
  }

  return [...new Set(images)];
}

function primaryImage(product) {
  return normalizeImages(product?.src)[0] || normalizeImages(product?.images)[0] || '';
}

function collectImageUrls(value, bucket = new Set()) {
  if (!value) return bucket;

  if (typeof value === 'string') {
    normalizeImages(value).forEach((url) => bucket.add(url));
    return bucket;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => collectImageUrls(item, bucket));
    return bucket;
  }

  if (isPlainObject(value)) {
    Object.values(value).forEach((item) => collectImageUrls(item, bucket));
  }

  return bucket;
}

function scalarDisplay(value) {
  if (value === null || value === undefined || value === '') return '-';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') {
    if (value > 1000000000000) return `${value} (${formatDate(value)})`;
    return String(value);
  }
  return String(value);
}

function DataValue({ value, depth = 0 }) {
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="data-empty">Empty list</span>;
    return (
      <div className="data-list">
        {value.map((item, index) => (
          <div className="data-list-item" key={`${depth}-${index}`}>
            <span className="data-index">{index + 1}</span>
            <DataValue value={item} depth={depth + 1} />
          </div>
        ))}
      </div>
    );
  }

  if (isPlainObject(value)) {
    if (depth > 4) {
      return <pre className="data-json">{JSON.stringify(value, null, 2)}</pre>;
    }
    return <DataInspector data={value} depth={depth + 1} />;
  }

  if (isImageUrl(value)) {
    return (
      <a href={value} target="_blank" rel="noreferrer" className="data-link">
        Image URL
      </a>
    );
  }

  if (typeof value === 'string' && /^https?:\/\//i.test(value)) {
    return (
      <a href={value} target="_blank" rel="noreferrer" className="data-link">
        {value}
      </a>
    );
  }

  return <span>{scalarDisplay(value)}</span>;
}

function DataInspector({ data, depth = 0 }) {
  const entries = Object.entries(data || {}).sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) return <span className="data-empty">No data</span>;

  return (
    <div className={`data-inspector data-depth-${Math.min(depth, 3)}`}>
      {entries.map(([key, value]) => (
        <div className="data-row" key={`${depth}-${key}`}>
          <span className="data-key">{formatLabel(key)}</span>
          <div className="data-value">
            <DataValue value={value} depth={depth} />
          </div>
        </div>
      ))}
    </div>
  );
}

function getShippingAddress(order = {}) {
  return order.shippingAddress || order.shipping || order.paypal?.shipping || order.paypalShipping || null;
}

function getPaypalSummary(order = {}) {
  return order.paypal || {
    orderId: order.paypalOrderId,
    captureId: order.paypalCaptureId || order.captureId,
    payerId: order.paypalPayerId,
    payerEmail: order.paypalPayerEmail,
    status: order.paypalStatus
  };
}

function isMessageableOrder(order = {}) {
  return MESSAGEABLE_ORDER_STATUSES.includes(order.status);
}

function messageLabel(message, currentUid) {
  if (message.senderUid === currentUid) return 'You';
  if (['business', 'admin', 'staff'].includes(message.senderRole)) return "Nolan's Team";
  return 'Customer';
}

export default function Orders({ view = 'orders' }) {
  const { user } = useAuth();
  const [orders, setOrders] = useState([]);
  const [productsById, setProductsById] = useState({});
  const [conversationsById, setConversationsById] = useState({});
  const [customerProfile, setCustomerProfile] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('all');
  const [fulfillmentFilter, setFulfillmentFilter] = useState(view === 'fulfillment' ? 'unfulfilled' : 'all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [statusDrafts, setStatusDrafts] = useState({});
  const [detailDrafts, setDetailDrafts] = useState({});
  const [savingOrderId, setSavingOrderId] = useState('');
  const [savingOrderAction, setSavingOrderAction] = useState('');
  const [markingRead, setMarkingRead] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);

  useEffect(() => {
    setFulfillmentFilter(view === 'fulfillment' ? 'unfulfilled' : 'all');
  }, [view]);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    let ordersLoaded = false;
    let productsLoaded = false;

    const maybeFinish = () => {
      if (ordersLoaded && productsLoaded) setLoading(false);
    };

    const unsubProducts = onValue(ref(db, 'Products'), (snapshot) => {
      const map = snapshot.exists() ? snapshot.val() : {};
      setProductsById(map || {});
      productsLoaded = true;
      maybeFinish();
    }, (err) => {
      setError(err?.message || 'Failed to load products');
      productsLoaded = true;
      maybeFinish();
    });

    const unsubOrders = onValue(ref(db, 'orders'), (snapshot) => {
      const data = snapshot.val();
      const list = data
        ? Object.entries(data).map(([orderId, value]) => ({ orderId, ...value }))
        : [];
      list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      setOrders(list);
      setSelectedOrderId((current) => current || list[0]?.orderId || '');
      ordersLoaded = true;
      maybeFinish();
    }, (err) => {
      setError(err?.message || 'Failed to load orders');
      ordersLoaded = true;
      maybeFinish();
    });

    return () => {
      unsubProducts();
      unsubOrders();
    };
  }, []);

  useEffect(() => {
    const unsubConversations = onValue(ref(db, 'conversations'), (snapshot) => {
      setConversationsById(snapshot.exists() ? snapshot.val() : {});
    }, (err) => {
      setError(err?.message || 'Failed to load conversations');
    });

    return () => unsubConversations();
  }, []);

  const filteredOrders = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return orders.filter((order) => {
      const product = productsById[order.knifeId] || {};
      const paymentStatus = order.status || 'pending';
      const fulfillmentStatus = order.fulfillmentStatus || 'unfulfilled';
      const customerLabel = order.customerEmail || order.uid || getPaypalSummary(order).payerEmail || '';
      const matchesSearch = !normalizedSearch ||
        order.orderId?.toLowerCase().includes(normalizedSearch) ||
        order.knifeId?.toLowerCase().includes(normalizedSearch) ||
        customerLabel.toLowerCase().includes(normalizedSearch) ||
        product.name?.toLowerCase().includes(normalizedSearch) ||
        product.description?.toLowerCase().includes(normalizedSearch);
      const matchesPayment = paymentFilter === 'all' || paymentStatus === paymentFilter;
      const matchesFulfillment = fulfillmentFilter === 'all' || fulfillmentStatus === fulfillmentFilter;
      return matchesSearch && matchesPayment && matchesFulfillment;
    });
  }, [orders, productsById, searchTerm, paymentFilter, fulfillmentFilter]);

  const selectedOrder = filteredOrders.find((order) => order.orderId === selectedOrderId) || filteredOrders[0] || null;
  const selectedProduct = selectedOrder ? productsById[selectedOrder.knifeId] || {} : {};
  const selectedConversation = selectedOrder ? conversationsById[selectedOrder.orderId] || null : null;
  const selectedShipping = getShippingAddress(selectedOrder || {});
  const selectedPaypal = getPaypalSummary(selectedOrder || {});
  const selectedProductImages = normalizeImages(selectedProduct.src || selectedProduct.images);
  const selectedOrderImages = selectedOrder
    ? [...collectImageUrls(selectedOrder)].filter((url) => !selectedProductImages.includes(url))
    : [];
  const selectedCustomerEmail =
    selectedOrder?.customerEmail ||
    selectedOrder?.email ||
    selectedPaypal?.payerEmail ||
    customerProfile?.email ||
    '';

  useEffect(() => {
    if (!selectedOrder?.uid) {
      setCustomerProfile(null);
      return undefined;
    }

    const unsubProfile = onValue(ref(db, `users/${selectedOrder.uid}`), (snapshot) => {
      setCustomerProfile(snapshot.exists() ? snapshot.val() : null);
    }, () => {
      setCustomerProfile(null);
    });

    return () => unsubProfile();
  }, [selectedOrder?.uid]);

  useEffect(() => {
    if (!selectedOrder?.orderId) {
      setMessages([]);
      return undefined;
    }

    const messagesRef = query(ref(db, `messages/${selectedOrder.orderId}`), orderByChild('createdAt'));
    const unsubMessages = onValue(messagesRef, (snapshot) => {
      const list = snapshot.exists()
        ? Object.entries(snapshot.val()).map(([messageId, value]) => ({ messageId, ...value }))
        : [];
      list.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
      setMessages(list);
    }, (err) => {
      setError(err?.message || 'Failed to load order messages');
    });

    return () => unsubMessages();
  }, [selectedOrder?.orderId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const stats = useMemo(() => ({
    needsAction: orders.filter((order) => (order.fulfillmentStatus || 'unfulfilled') === 'unfulfilled' && ['paid', 'approved'].includes(order.status)).length,
    processing: orders.filter((order) => (order.fulfillmentStatus || 'unfulfilled') === 'processing').length,
    shipped: orders.filter((order) => ['shipped', 'delivered'].includes(order.fulfillmentStatus)).length,
    unread: Object.values(conversationsById || {}).filter((conversation) => (conversation.staffUnreadCount || 0) > 0).length,
    revenue: orders.filter((order) => ['paid', 'approved'].includes(order.status)).reduce((sum, order) => sum + Number(order.amount || 0), 0)
  }), [orders, conversationsById]);

  const handleStatusSave = async (orderId) => {
    const order = orders.find((item) => item.orderId === orderId);
    if (!order) return;

    const nextStatus = statusDrafts[orderId] ?? order.fulfillmentStatus ?? 'unfulfilled';
    if (nextStatus === (order.fulfillmentStatus || 'unfulfilled')) {
      showToast('No change to fulfillment status.', 'info');
      return;
    }

    try {
      setError('');
      setSavingOrderId(orderId);
      setSavingOrderAction('status');
      await updateFulfillmentStatus({ orderId, status: nextStatus });
      setStatusDrafts((prev) => {
        const next = { ...prev };
        delete next[orderId];
        return next;
      });
      showToast(`Order ${formatOrderId(orderId)} moved to ${formatStatus(nextStatus)}.`, 'success');
    } catch (err) {
      const message = err?.message || 'Failed to update order status';
      setError(message);
      showToast(message, 'error');
    } finally {
      setSavingOrderId('');
      setSavingOrderAction('');
    }
  };

  const getDetailDraft = (order) => detailDrafts[order.orderId] || {
    expectedArrivalDate: order.expectedArrivalDate || '',
    trackingUrl: order.trackingUrl || '',
    trackingNumber: order.trackingNumber || ''
  };

  const handleDetailDraftChange = (orderId, field, value) => {
    const order = orders.find((item) => item.orderId === orderId);
    setDetailDrafts((prev) => ({
      ...prev,
      [orderId]: {
        ...(order ? getDetailDraft(order) : {}),
        ...(prev[orderId] || {}),
        [field]: value
      }
    }));
  };

  const handleSaveFulfillmentDetails = async (order) => {
    if (!order?.orderId) return;
    const draft = getDetailDraft(order);

    try {
      setError('');
      setSavingOrderId(order.orderId);
      setSavingOrderAction('details');
      await updateFulfillmentStatus({
        orderId: order.orderId,
        expectedArrivalDate: draft.expectedArrivalDate,
        trackingUrl: draft.trackingUrl,
        trackingNumber: draft.trackingNumber
      });
      setDetailDrafts((prev) => {
        const next = { ...prev };
        delete next[order.orderId];
        return next;
      });
      showToast('Fulfillment details updated.', 'success');
    } catch (err) {
      const message = err?.message || 'Failed to update fulfillment details';
      setError(message);
      showToast(message, 'error');
    } finally {
      setSavingOrderId('');
      setSavingOrderAction('');
    }
  };

  const handleSendMessage = async (event) => {
    event.preventDefault();
    if (!selectedOrder?.orderId || !replyText.trim()) {
      showToast('Enter a message to send.', 'error');
      return;
    }

    if (!isMessageableOrder(selectedOrder)) {
      showToast('Chat is available after the order is paid or approved.', 'warning');
      return;
    }

    try {
      setError('');
      setSendingMessage(true);
      await sendStaffMessage({ orderId: selectedOrder.orderId, text: replyText.trim() });
      setReplyText('');
      showToast('Message sent to customer.', 'success');
    } catch (err) {
      const message = err?.message || 'Failed to send message';
      setError(message);
      showToast(message, 'error');
    } finally {
      setSendingMessage(false);
    }
  };

  const handleMarkRead = async () => {
    if (!selectedOrder?.orderId) return;

    try {
      setError('');
      setMarkingRead(true);
      await markConversationRead({ orderId: selectedOrder.orderId });
      showToast('Conversation marked read.', 'success');
    } catch (err) {
      const message = err?.message || 'Failed to mark conversation read';
      setError(message);
      showToast(message, 'error');
    } finally {
      setMarkingRead(false);
    }
  };

  if (loading) {
    return (
      <div className="business-workspace">
        <div className="loading-shimmer">Loading orders...</div>
      </div>
    );
  }

  return (
    <div className="business-workspace business-orders-page">
      <div className="workspace-hero">
        <div>
          <h1>{view === 'fulfillment' ? 'Fulfillment' : 'Orders'}</h1>
          <p>{view === 'fulfillment'
            ? 'Move paid orders from preparation to shipment and delivery with tracking kept in one place.'
            : 'See the complete order, product, customer, payment, shipping, and conversation history in one place.'}</p>
        </div>
      </div>

      {error && <div className="alert-error">{error}</div>}

      <div className="workspace-stats">
        <div className="stat-card compact urgent"><span>Needs action</span><strong>{stats.needsAction}</strong></div>
        <div className="stat-card compact"><span>Processing</span><strong>{stats.processing}</strong></div>
        <div className="stat-card compact"><span>Shipped or delivered</span><strong>{stats.shipped}</strong></div>
        <div className="stat-card compact urgent"><span>Unread chats</span><strong>{stats.unread}</strong></div>
        <div className="stat-card compact"><span>Paid revenue</span><strong>{formatCurrency(stats.revenue)}</strong></div>
      </div>

      <div className="workspace-toolbar">
        <label className="toolbar-search">
          <LucideIcon name="Search" size={16} />
          <input
            placeholder="Search order, customer, knife, or description"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
        </label>

        <select value={paymentFilter} onChange={(event) => setPaymentFilter(event.target.value)} aria-label="Filter by payment">
          {PAYMENT_FILTERS.map((status) => (
            <option key={status} value={status}>{status === 'all' ? 'All payments' : formatStatus(status)}</option>
          ))}
        </select>

        <select value={fulfillmentFilter} onChange={(event) => setFulfillmentFilter(event.target.value)} aria-label="Filter by fulfillment">
          {FULFILLMENT_FILTERS.map((status) => (
            <option key={status} value={status}>{status === 'all' ? 'All fulfillment' : formatStatus(status)}</option>
          ))}
        </select>
      </div>

      {filteredOrders.length === 0 ? (
        <div className="empty-state refined">
          <LucideIcon name="ClipboardList" size={42} />
          <h2>No orders match this queue.</h2>
          <p>Paid purchases and assigned historical orders will appear here.</p>
        </div>
      ) : (
        <div className="orders-workspace-layout">
          <div className="order-queue">
            {filteredOrders.map((order) => {
              const product = productsById[order.knifeId] || {};
              const image = primaryImage(product);
              const active = selectedOrder?.orderId === order.orderId;
              const fulfillmentStatus = order.fulfillmentStatus || 'unfulfilled';
              const statusDraft = statusDrafts[order.orderId] ?? fulfillmentStatus;
              const isDirty = statusDraft !== fulfillmentStatus;
              const conversation = conversationsById[order.orderId] || {};
              const unreadCount = conversation.staffUnreadCount || 0;
              const isSavingStatus = savingOrderId === order.orderId && savingOrderAction === 'status';

              return (
                <article
                  className={`order-queue-card ${active ? 'active' : ''}`}
                  key={order.orderId}
                  onClick={() => setSelectedOrderId(order.orderId)}
                >
                  <div className="order-thumb">
                    {image ? <img src={image} alt={product.name || 'Knife'} /> : <LucideIcon name="Package" size={22} />}
                  </div>

                  <div className="order-card-main">
                    <div className="order-card-title">
                      <h2>{product.name || 'Knife order'}</h2>
                      <span>{formatOrderId(order.orderId)}</span>
                    </div>
                    <p>{order.customerEmail || getPaypalSummary(order).payerEmail || (order.uid ? `Customer ${order.uid.slice(0, 8)}` : 'Customer unavailable')}</p>
                    <div className="order-card-meta">
                      <span className={`status-badge status-${order.status || 'pending'}`}>{formatStatus(order.status || 'pending')}</span>
                      <span className={`status-badge status-${fulfillmentStatus}`}>{formatStatus(fulfillmentStatus)}</span>
                      {unreadCount > 0 && <span className="status-badge status-quote_sent">{unreadCount} chat</span>}
                      <strong>{formatCurrency(order.amount)}</strong>
                    </div>
                  </div>

                  <div className="queue-status-editor" onClick={(event) => event.stopPropagation()}>
                    <select
                      value={statusDraft}
                      onChange={(event) => setStatusDrafts((prev) => ({ ...prev, [order.orderId]: event.target.value }))}
                    >
                      {FULFILLMENT_STATUSES.map((status) => <option key={status} value={status}>{formatStatus(status)}</option>)}
                    </select>
                    <button
                      className="action-btn"
                      disabled={!isDirty || savingOrderId === order.orderId}
                      onClick={() => handleStatusSave(order.orderId)}
                    >
                      {isSavingStatus ? 'Saving...' : isDirty ? 'Save change' : 'Saved'}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>

          <aside className="order-detail-panel order-detail-panel-expanded">
            {selectedOrder ? (
              <>
                <div className="detail-panel-header">
                  <span>Selected order</span>
                  <h2>{formatOrderId(selectedOrder.orderId)}</h2>
                  <p>{formatDate(selectedOrder.createdAt)}</p>
                </div>

                <section className="detail-section-card order-product-section">
                  <div className="section-title-row">
                    <h3>Knife Images & Description</h3>
                    <button className="action-btn secondary" onClick={() => window.open(`/product/${selectedOrder.knifeId}`, '_blank', 'noopener,noreferrer')}>
                      <LucideIcon name="ExternalLink" size={15} /> Public Page
                    </button>
                  </div>

                  {selectedProductImages.length > 0 ? (
                    <div className="order-image-gallery">
                      {selectedProductImages.map((imageUrl, index) => (
                        <a href={imageUrl} target="_blank" rel="noreferrer" className="order-image-tile" key={imageUrl}>
                          <img src={imageUrl} alt={`${selectedProduct.name || 'Knife'} ${index + 1}`} />
                          {index === 0 && <span>Primary</span>}
                        </a>
                      ))}
                    </div>
                  ) : (
                    <div className="image-placeholder"><LucideIcon name="Image" size={22} /> No product images found</div>
                  )}

                  <div className="detail-product-copy">
                    <h4>{selectedProduct.name || 'Knife order'}</h4>
                    <p>{selectedProduct.description || 'No product description available.'}</p>
                    {selectedProduct.specifications && (
                      <p><strong>Specifications:</strong> {selectedProduct.specifications}</p>
                    )}
                  </div>
                </section>

                <div className="detail-info-grid order-info-grid">
                  <div><span>Customer email</span><strong>{selectedCustomerEmail || 'Unknown'}</strong></div>
                  <div><span>Customer UID</span><strong>{selectedOrder.uid || 'Unknown'}</strong></div>
                  <div><span>Payment</span><strong>{formatStatus(selectedOrder.status || 'pending')}</strong></div>
                  <div><span>Fulfillment</span><strong>{formatStatus(selectedOrder.fulfillmentStatus || 'unfulfilled')}</strong></div>
                  <div><span>Total</span><strong>{formatCurrency(selectedOrder.amount)}</strong></div>
                  <div><span>Knife reference</span><strong>{selectedOrder.knifeId || '-'}</strong></div>
                  <div><span>PayPal order</span><strong>{selectedPaypal?.orderId || selectedOrder.paypalOrderId || '-'}</strong></div>
                  <div><span>PayPal capture</span><strong>{selectedPaypal?.captureId || selectedOrder.captureId || '-'}</strong></div>
                </div>

                <section className="detail-section-card">
                  <h3>Customer Profile</h3>
                  {customerProfile ? (
                    <DataInspector data={customerProfile} />
                  ) : (
                    <p>No customer profile record was found for this order.</p>
                  )}
                </section>

                <section className="detail-section-card">
                  <h3>Shipping</h3>
                  {selectedShipping ? (
                    <DataInspector data={selectedShipping} />
                  ) : (
                    <p>No shipping address has been captured for this order.</p>
                  )}
                </section>

                <section className="detail-section-card">
                  <h3>Payment / PayPal</h3>
                  <DataInspector data={selectedPaypal || {}} />
                </section>

                {selectedOrderImages.length > 0 && (
                  <section className="detail-section-card">
                    <h3>Order Image Attachments</h3>
                    <div className="order-image-gallery compact">
                      {selectedOrderImages.map((imageUrl) => (
                        <a href={imageUrl} target="_blank" rel="noreferrer" className="order-image-tile" key={imageUrl}>
                          <img src={imageUrl} alt="Order attachment" />
                        </a>
                      ))}
                    </div>
                  </section>
                )}

                <section className="detail-section-card order-chat-card">
                  <div className="section-title-row">
                    <div>
                      <h3>Customer Chat</h3>
                      <p>Conversation tied directly to this order.</p>
                    </div>
                    {(selectedConversation?.staffUnreadCount || 0) > 0 && (
                      <button className="action-btn secondary" onClick={handleMarkRead} disabled={markingRead}>
                        {markingRead ? 'Marking...' : 'Mark Read'}
                      </button>
                    )}
                  </div>

                  <div className="order-chat-thread">
                    {messages.length === 0 ? (
                      <div className="no-messages">No messages yet. Start the order conversation here.</div>
                    ) : (
                      messages.map((message) => {
                        const fromStaff = ['business', 'admin', 'staff'].includes(message.senderRole) || message.senderUid === user?.uid;
                        return (
                          <div key={message.messageId || message.id} className={`thread-message ${fromStaff ? 'message-staff' : 'message-customer'}`}>
                            <div className="thread-meta">
                              <strong>{messageLabel(message, user?.uid)}</strong>
                              <span>{message.createdAt ? formatDate(message.createdAt) : ''}</span>
                            </div>
                            <p>{message.text}</p>
                          </div>
                        );
                      })
                    )}
                    <div ref={messagesEndRef} />
                  </div>

                  <form className="order-chat-composer" onSubmit={handleSendMessage}>
                    {!isMessageableOrder(selectedOrder) && (
                      <p className="status-note">Chat opens after the order is paid or approved.</p>
                    )}
                    <textarea
                      rows="4"
                      value={replyText}
                      onChange={(event) => setReplyText(event.target.value)}
                      placeholder="Write a message to the customer about this order..."
                      disabled={sendingMessage || !isMessageableOrder(selectedOrder)}
                    />
                    <button className="action-btn" type="submit" disabled={sendingMessage || !replyText.trim() || !isMessageableOrder(selectedOrder)}>
                      <LucideIcon name="Send" size={15} /> {sendingMessage ? 'Sending...' : 'Send Message'}
                    </button>
                  </form>
                </section>

                <section className="detail-section-card">
                  <div className="section-title-row">
                    <h3>Fulfillment Control</h3>
                  </div>
                  <div className="fulfillment-detail-grid">
                    <label>
                      <span>Expected arrival</span>
                      <input
                        type="date"
                        value={getDetailDraft(selectedOrder).expectedArrivalDate}
                        onChange={(event) => handleDetailDraftChange(selectedOrder.orderId, 'expectedArrivalDate', event.target.value)}
                      />
                    </label>
                    <label>
                      <span>Tracking number</span>
                      <input
                        value={getDetailDraft(selectedOrder).trackingNumber}
                        onChange={(event) => handleDetailDraftChange(selectedOrder.orderId, 'trackingNumber', event.target.value)}
                        placeholder="Carrier tracking number"
                      />
                    </label>
                    <label className="span-2">
                      <span>Tracking link</span>
                      <input
                        value={getDetailDraft(selectedOrder).trackingUrl}
                        onChange={(event) => handleDetailDraftChange(selectedOrder.orderId, 'trackingUrl', event.target.value)}
                        placeholder="https://..."
                      />
                    </label>
                  </div>
                  <div className="detail-actions">
                    <select
                      value={statusDrafts[selectedOrder.orderId] ?? selectedOrder.fulfillmentStatus ?? 'unfulfilled'}
                      onChange={(event) => setStatusDrafts((prev) => ({ ...prev, [selectedOrder.orderId]: event.target.value }))}
                    >
                      {FULFILLMENT_STATUSES.map((status) => <option key={status} value={status}>{formatStatus(status)}</option>)}
                    </select>
                    <button
                      className="action-btn"
                      disabled={savingOrderId === selectedOrder.orderId}
                      onClick={() => handleStatusSave(selectedOrder.orderId)}
                    >
                      {savingOrderId === selectedOrder.orderId && savingOrderAction === 'status' ? 'Updating...' : 'Update Fulfillment'}
                    </button>
                    <button
                      className="action-btn secondary"
                      disabled={savingOrderId === selectedOrder.orderId}
                      onClick={() => handleSaveFulfillmentDetails(selectedOrder)}
                    >
                      {savingOrderId === selectedOrder.orderId && savingOrderAction === 'details' ? 'Saving...' : 'Save Tracking Details'}
                    </button>
                  </div>
                </section>

                <section className="detail-section-card full-record-card">
                  <h3>Complete Order Record</h3>
                  <DataInspector data={selectedOrder} />
                </section>

                <section className="detail-section-card full-record-card">
                  <h3>Complete Product Record</h3>
                  <DataInspector data={selectedProduct} />
                </section>
              </>
            ) : (
              <div className="empty-state refined">
                <h2>Select an order</h2>
                <p>Choose an order from the queue to see fulfillment details.</p>
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
