import React, { useEffect, useMemo, useState } from 'react';
import { onValue, ref } from 'firebase/database';
import { db } from '../firebase';
import { getPublicKnifeStatus } from '../knifeStatus';
import LucideIcon from '../../components/ui/LucideIcon';
import '../BusinessDashboard.css';

const RANGE_OPTIONS = [
  { id: '30', label: 'Last 30 days', days: 30 },
  { id: '90', label: 'Last 90 days', days: 90 },
  { id: '365', label: 'Last 12 months', days: 365 },
  { id: 'all', label: 'All time', days: null }
];

const SOURCES = [
  { key: 'products', path: 'Products', idKey: 'productId' },
  { key: 'orders', path: 'orders', idKey: 'orderId' },
  { key: 'customRequests', path: 'customRequests', idKey: 'requestId' },
  { key: 'conversations', path: 'conversations', idKey: 'conversationId' },
  { key: 'users', path: 'users', idKey: 'uid' },
  { key: 'emailGroups', path: 'emailGroups', idKey: 'groupId' },
  { key: 'emailCampaigns', path: 'emailCampaigns', idKey: 'campaignId' },
  { key: 'mailgunEvents', path: 'mailgunWebhookEvents', idKey: 'eventKey' },
  {
    key: 'messages',
    path: 'messages',
    transform: (value) => Object.entries(value || {}).flatMap(([conversationId, thread]) => (
      Object.entries(thread || {}).map(([messageId, message]) => ({
        conversationId,
        messageId,
        ...(message || {})
      }))
    ))
  }
];

const SECTION_CONFIG = [
  { id: 'money', label: 'Money', icon: 'BadgeDollarSign' },
  { id: 'orders', label: 'Orders', icon: 'ShoppingCart' },
  { id: 'inventory', label: 'Inventory', icon: 'Package' },
  { id: 'custom', label: 'Custom Work', icon: 'Wand2' },
  { id: 'customers', label: 'Customers', icon: 'Users' },
  { id: 'email', label: 'Email', icon: 'Mail' },
  { id: 'conversations', label: 'Conversations', icon: 'MessagesSquare' },
  { id: 'health', label: 'Data Health', icon: 'Database' }
];

const PAID_ORDER_STATUSES = new Set(['paid', 'approved', 'completed']);
const CLOSED_REQUEST_STATUSES = new Set(['completed', 'shipped', 'cancelled']);
const ACTIVE_REQUEST_STATUSES = new Set(['priority_review', 'quote_accepted', 'in_production']);
const REVIEW_REQUEST_STATUSES = new Set(['needs_review', 'pending_review', 'priority_review', 'pending_payment']);
const QUOTED_REQUEST_STATUSES = new Set(['quote_sent', 'pending_acceptance', 'quote_accepted', 'in_production', 'completed', 'shipped']);
const ACCEPTED_REQUEST_STATUSES = new Set(['quote_accepted', 'in_production', 'completed', 'shipped']);
const ACTIVE_FULFILLMENT_STATUSES = new Set(['unfulfilled', 'processing']);
const IMAGE_URL_PATTERN = /(firebasestorage|googleusercontent|githubusercontent|images\/|\.)(png|jpe?g|webp|gif|avif|svg)(\?|$|&)/i;

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0
});

const preciseCurrencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2
});

const numberFormatter = new Intl.NumberFormat('en-US');

function snapshotToList(snapshot, source) {
  const value = snapshot.val();
  if (!value) return [];
  if (source.transform) return source.transform(value);
  return Object.entries(value).map(([id, item]) => ({
    [source.idKey]: item?.[source.idKey] || id,
    ...(item || {})
  }));
}

function toNumber(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

function timestamp(value) {
  if (!value) return 0;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return 0;
    if (value > 0 && value < 10000000000) return value * 1000;
    return value;
  }
  if (typeof value === 'string') {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) return timestamp(numeric);
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (typeof value === 'object' && value.seconds) return Number(value.seconds) * 1000;
  return 0;
}

function firstTimestamp(item, fields) {
  for (const field of fields) {
    const value = field.split('.').reduce((acc, part) => acc?.[part], item);
    const result = timestamp(value);
    if (result) return result;
  }
  return 0;
}

function isInRange(value, rangeStart) {
  if (!rangeStart) return true;
  const time = timestamp(value);
  return time > 0 && time >= rangeStart;
}

function formatCurrency(value, precise = false) {
  const amount = toNumber(value);
  return precise ? preciseCurrencyFormatter.format(amount) : currencyFormatter.format(amount);
}

function formatNumber(value) {
  return numberFormatter.format(Math.round(toNumber(value)));
}

function formatDecimal(value, digits = 1) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '0';
  return amount.toFixed(digits);
}

function formatPercent(value, total) {
  if (!total) return '0%';
  return `${Math.round((value / total) * 100)}%`;
}

function formatRate(value) {
  if (!Number.isFinite(value)) return '0%';
  return `${Math.round(value * 100)}%`;
}

function formatDate(value) {
  const time = timestamp(value);
  if (!time) return 'No date';
  return new Date(time).toLocaleDateString();
}

function formatAge(value) {
  const time = timestamp(value);
  if (!time) return 'No date';
  const days = Math.max(0, Math.floor((Date.now() - time) / 86400000));
  if (days === 0) return 'Today';
  if (days === 1) return '1 day';
  if (days < 31) return `${days} days`;
  const months = Math.floor(days / 30);
  return months === 1 ? '1 month' : `${months} months`;
}

function labelize(value) {
  const text = String(value || 'not_set')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/-/g, ' ');
  return text.replace(/\b\w/g, (match) => match.toUpperCase());
}

function average(values) {
  const cleanValues = values.map(toNumber).filter((value) => value > 0);
  if (!cleanValues.length) return 0;
  return cleanValues.reduce((sum, value) => sum + value, 0) / cleanValues.length;
}

function minPositive(values) {
  const cleanValues = values.map(toNumber).filter((value) => value > 0);
  return cleanValues.length ? Math.min(...cleanValues) : 0;
}

function sum(items, getter) {
  return items.reduce((total, item) => total + toNumber(getter(item)), 0);
}

function countBy(items, getter) {
  return items.reduce((acc, item) => {
    const key = getter(item) || 'not_set';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function breakdownFromCounts(counts, limit = 8) {
  return Object.entries(counts || {})
    .map(([label, value]) => ({ label: labelize(label), value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

function topCounts(items, getter, limit = 8) {
  return breakdownFromCounts(countBy(items, getter), limit);
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
        if (IMAGE_URL_PATTERN.test(item)) images.push(item);
      });
  }
  return [...new Set(images)];
}

function hasProductImage(product) {
  return normalizeImages(product.src).length > 0 || normalizeImages(product.images).length > 0;
}

function isPaidOrder(order) {
  return PAID_ORDER_STATUSES.has(String(order.status || '').toLowerCase());
}

function orderAmount(order) {
  return toNumber(order.amount || order.total || order.price || order.paypal?.amount?.value || 0);
}

function orderTime(order) {
  return firstTimestamp(order, ['createdAt', 'paidAt', 'capturedAt', 'updatedAt']);
}

function productTime(product) {
  return firstTimestamp(product, ['updatedAt', 'createdAt', 'soldAt']);
}

function customRequestTime(request) {
  return firstTimestamp(request, ['createdAt', 'depositPaidAt', 'updatedAt']);
}

function campaignTime(campaign) {
  return firstTimestamp(campaign, ['createdAt', 'completedAt', 'updatedAt']);
}

function conversationTime(conversation) {
  return firstTimestamp(conversation, ['lastMessageAt', 'updatedAt', 'createdAt']);
}

function webhookEventTime(event) {
  return firstTimestamp(event, ['eventAt', 'receivedAt', 'timestamp']);
}

function userTime(user) {
  return firstTimestamp(user, ['createdAt', 'lastLoginAt', 'updatedAt']);
}

function getShippingAddress(order = {}) {
  return order.shippingAddress || order.shipping || order.paypal?.shipping || order.paypalShipping || null;
}

function hasShippingAddress(order) {
  const shipping = getShippingAddress(order);
  if (!shipping) return false;
  if (typeof shipping === 'string') return shipping.trim().length > 0;
  return Object.values(shipping || {}).some((value) => String(value || '').trim());
}

function fulfillmentStatus(order) {
  return String(order.fulfillmentStatus || 'unfulfilled').toLowerCase();
}

function hasTracking(order) {
  return Boolean(order.trackingNumber || order.trackingUrl || order.fulfillment?.trackingNumber || order.fulfillment?.trackingUrl);
}

function oldestAge(items, timeGetter) {
  const times = items.map(timeGetter).filter(Boolean);
  if (!times.length) return 'No date';
  return formatAge(Math.min(...times));
}

function requestEstimate(request) {
  return toNumber(request.estimatedPrice || request.priceEstimate || request.price || 0);
}

function requestFinalPrice(request) {
  return toNumber(request.finalPrice || request.quotedPrice || request.quote?.finalPrice || 0);
}

function requestDepositAmount(request) {
  const explicit = toNumber(request.depositAmount || request.depositRequired || request.deposit || request.amount);
  if (explicit > 0) return explicit;
  const finalPrice = requestFinalPrice(request);
  if (finalPrice > 0) return finalPrice * 0.15;
  const estimate = requestEstimate(request);
  return estimate > 0 ? estimate * 0.15 : 0;
}

function hasPaidDeposit(request) {
  return Boolean(request.priorityDepositPaid || request.paymentStatus === 'paid' || request.depositPaidAt);
}

function userDisplayName(user) {
  return user.displayName || user.name || user.email || user.uid || 'Unknown customer';
}

function isBlockedUser(user) {
  return user.status === 'blocked' || user.blocked === true;
}

function isMarketingSuppressed(user) {
  return Boolean(
    user.emailSuppression?.status ||
    user.emailPreferences?.marketingSubscribed === false ||
    user.emailDelivery?.unsubscribedAt ||
    user.emailDelivery?.complainedAt ||
    user.emailDelivery?.permanentFailureAt
  );
}

function eventCounterName(event = {}) {
  if (event.counter) return event.counter;
  if (event.event === 'failed') return event.severity === 'permanent' ? 'permanentFailures' : 'temporaryFailures';
  if (event.event === 'opened') return 'opens';
  if (event.event === 'clicked') return 'clicks';
  if (event.event === 'delivered') return 'delivered';
  if (event.event === 'accepted') return 'accepted';
  if (event.event === 'unsubscribed') return 'unsubscribes';
  if (event.event === 'complained') return 'complaints';
  return event.event || 'other';
}

function mailgunEventTags(event = {}) {
  const rawTags = Array.isArray(event.tags)
    ? event.tags
    : Array.isArray(event.raw?.tags)
      ? event.raw.tags
      : [];
  return [...new Set(rawTags.map((tag) => String(tag || '').trim()).filter(Boolean))];
}

function campaignEventCount(campaign, key) {
  return toNumber(campaign.eventCounts?.[key] || 0);
}

function sourceLabel(count, name) {
  return `${formatNumber(count)} ${name}`;
}

function monthKey(time) {
  const date = new Date(time);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(key) {
  const [year, month] = key.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

function buildMonthlySeries(items, timeGetter, valueGetter, months = 12) {
  const now = new Date();
  const buckets = Array.from({ length: months }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (months - 1 - index), 1);
    const key = monthKey(date.getTime());
    return { key, label: monthLabel(key), value: 0 };
  });
  const bucketMap = buckets.reduce((acc, bucket) => ({ ...acc, [bucket.key]: bucket }), {});

  items.forEach((item) => {
    const time = timeGetter(item);
    if (!time) return;
    const key = monthKey(time);
    if (!bucketMap[key]) return;
    bucketMap[key].value += toNumber(valueGetter(item));
  });

  return buckets;
}

function priceBands(items, getter) {
  const bands = [
    { id: 'under_250', label: 'Under $250', min: 0, max: 249.99 },
    { id: '250_499', label: '$250-$499', min: 250, max: 499.99 },
    { id: '500_999', label: '$500-$999', min: 500, max: 999.99 },
    { id: '1000_plus', label: '$1,000+', min: 1000, max: Infinity }
  ];

  return bands.map((band) => ({
    label: band.label,
    value: items.filter((item) => {
      const price = toNumber(getter(item));
      return price >= band.min && price <= band.max;
    }).length
  }));
}

function metric(label, value, helper = '', icon = 'Activity', tone = '') {
  return { label, value, helper, icon, tone, searchText: `${label} ${value} ${helper}`.toLowerCase() };
}

function chart(title, description, type, data, valueFormatter = formatNumber) {
  return { title, description, type, data, valueFormatter };
}

function detailList(title, items) {
  return { title, items };
}

function AnalyticsMetricCard({ item }) {
  return (
    <article className={`analytics-metric ${item.tone ? `tone-${item.tone}` : ''}`}>
      <div className="analytics-metric-icon">
        <LucideIcon name={item.icon || 'Activity'} size={18} />
      </div>
      <div>
        <span>{item.label}</span>
        <strong>{item.value}</strong>
        {item.helper && <p>{item.helper}</p>}
      </div>
    </article>
  );
}

function AnalyticsChart({ item }) {
  const maxValue = Math.max(...item.data.map((point) => toNumber(point.value)), 0);
  const hasData = maxValue > 0;

  return (
    <section className="analytics-chart-card">
      <div className="analytics-chart-header">
        <div>
          <h3>{item.title}</h3>
          {item.description && <p>{item.description}</p>}
        </div>
      </div>

      {!hasData ? (
        <div className="analytics-chart-empty">No chartable data in this view.</div>
      ) : item.type === 'columns' ? (
        <div className="analytics-column-chart">
          {item.data.map((point) => {
            const value = toNumber(point.value);
            const height = Math.max(4, Math.round((value / maxValue) * 100));
            return (
              <div className="analytics-column" key={point.label} title={`${point.label}: ${item.valueFormatter(value)}`}>
                <div className="analytics-column-value">{item.valueFormatter(value)}</div>
                <div className="analytics-column-track">
                  <span style={{ height: `${height}%` }} />
                </div>
                <small>{point.label}</small>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="analytics-bar-list">
          {item.data.map((point) => {
            const value = toNumber(point.value);
            const width = Math.max(3, Math.round((value / maxValue) * 100));
            return (
              <div className="analytics-bar-row" key={point.label}>
                <div className="analytics-bar-label">
                  <span>{point.label}</span>
                  <strong>{item.valueFormatter(value)}</strong>
                </div>
                <div className="analytics-bar-track">
                  <span style={{ width: `${width}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function AnalyticsDetailList({ item }) {
  return (
    <section className="analytics-detail-list">
      <h3>{item.title}</h3>
      {item.items.length === 0 ? (
        <p className="analytics-muted">No data in this view.</p>
      ) : (
        <div>
          {item.items.map((row) => (
            <div className="analytics-detail-row" key={`${item.title}-${row.label}`}>
              <span>{row.label}</span>
              <strong>{row.value}</strong>
              {row.helper && <small>{row.helper}</small>}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function buildAnalytics(data, rangeId) {
  const range = RANGE_OPTIONS.find((item) => item.id === rangeId) || RANGE_OPTIONS[1];
  const rangeStart = range.days ? Date.now() - range.days * 86400000 : 0;

  const products = data.products || [];
  const orders = data.orders || [];
  const customRequests = data.customRequests || [];
  const conversations = data.conversations || [];
  const users = data.users || [];
  const emailGroups = data.emailGroups || [];
  const campaigns = data.emailCampaigns || [];
  const mailgunEvents = data.mailgunEvents || [];
  const messages = data.messages || [];

  const productsInRange = products.filter((product) => isInRange(productTime(product), rangeStart));
  const ordersInRange = orders.filter((order) => isInRange(orderTime(order), rangeStart));
  const paidOrders = orders.filter(isPaidOrder);
  const paidOrdersInRange = ordersInRange.filter(isPaidOrder);
  const pendingOrders = orders.filter((order) => String(order.status || '').toLowerCase() === 'pending');
  const activePaidOrders = paidOrders.filter((order) => ACTIVE_FULFILLMENT_STATUSES.has(fulfillmentStatus(order)));
  const fulfilledOrders = paidOrders.filter((order) => ['shipped', 'delivered'].includes(fulfillmentStatus(order)));
  const deliveredOrders = paidOrders.filter((order) => fulfillmentStatus(order) === 'delivered');
  const ordersMissingEmail = orders.filter((order) => !order.customerEmail && !order.email && !order.paypal?.payerEmail);
  const paidOrdersMissingShipping = paidOrders.filter((order) => !hasShippingAddress(order));
  const shippedWithoutTracking = paidOrders.filter((order) => ['shipped', 'delivered'].includes(fulfillmentStatus(order)) && !hasTracking(order));

  const currentRevenue = sum(paidOrdersInRange, orderAmount);
  const allOrderRevenue = sum(paidOrders, orderAmount);
  const pendingOrderValue = sum(pendingOrders, orderAmount);
  const largestOrder = Math.max(...paidOrders.map(orderAmount), 0);
  const largestOrderInRange = Math.max(...paidOrdersInRange.map(orderAmount), 0);

  const requestsInRange = customRequests.filter((request) => isInRange(customRequestTime(request), rangeStart));
  const openRequests = customRequests.filter((request) => !CLOSED_REQUEST_STATUSES.has(request.status));
  const reviewRequests = customRequests.filter((request) => REVIEW_REQUEST_STATUSES.has(request.status));
  const quotedRequests = customRequests.filter((request) => QUOTED_REQUEST_STATUSES.has(request.status));
  const acceptedRequests = customRequests.filter((request) => ACCEPTED_REQUEST_STATUSES.has(request.status));
  const activeBuilds = customRequests.filter((request) => ACTIVE_REQUEST_STATUSES.has(request.status));
  const paidDepositRequests = customRequests.filter(hasPaidDeposit);
  const paidDepositRequestsInRange = requestsInRange.filter(hasPaidDeposit);
  const customDepositRevenue = sum(paidDepositRequestsInRange, requestDepositAmount);
  const allCustomDepositRevenue = sum(paidDepositRequests, requestDepositAmount);
  const customPipelineValue = sum(openRequests, (request) => requestFinalPrice(request) || requestEstimate(request));
  const customFinalQuoteValue = sum(customRequests, requestFinalPrice);
  const customEstimateValue = sum(customRequests, requestEstimate);

  const productsByStatus = countBy(products, (product) => getPublicKnifeStatus(product));
  const visibleProducts = products.filter((product) => (product.displayLocation || 'store') !== 'hidden');
  const availableProducts = products.filter((product) => getPublicKnifeStatus(product) === 'available');
  const soldProducts = products.filter((product) => getPublicKnifeStatus(product) === 'sold');
  const pendingProducts = products.filter((product) => getPublicKnifeStatus(product) === 'pending');
  const hiddenProducts = products.filter((product) => (product.displayLocation || 'store') === 'hidden');
  const productsMissingImages = products.filter((product) => !hasProductImage(product));
  const productsMissingPrice = products.filter((product) => toNumber(product.price) <= 0);
  const productsMissingDescription = products.filter((product) => !String(product.description || '').trim());
  const completeProducts = products.filter((product) => hasProductImage(product) && toNumber(product.price) > 0 && String(product.description || '').trim()).length;
  const availableInventoryValue = sum(availableProducts, (product) => product.price);
  const totalCatalogValue = sum(products, (product) => product.price);
  const soldCatalogValue = sum(soldProducts, (product) => product.price);
  const visibleInventoryValue = sum(visibleProducts.filter((product) => getPublicKnifeStatus(product) === 'available'), (product) => product.price);

  const usersInRange = users.filter((user) => isInRange(userTime(user), rangeStart));
  const activeUsers = users.filter((user) => !isBlockedUser(user));
  const blockedUsers = users.filter(isBlockedUser);
  const customerUsers = users.filter((user) => !['admin', 'business'].includes(user.role || 'customer'));
  const businessUsers = users.filter((user) => user.role === 'business');
  const adminUsers = users.filter((user) => user.role === 'admin');
  const marketingSuppressedUsers = users.filter(isMarketingSuppressed);
  const marketingSubscribedUsers = users.filter((user) => user.email && !isBlockedUser(user) && !isMarketingSuppressed(user));
  const usersMissingEmail = users.filter((user) => !user.email);
  const usersMissingName = users.filter((user) => !user.displayName && !user.name);

  const paidOrdersByUid = paidOrders.reduce((acc, order) => {
    const uid = order.uid || order.customerUid || order.userId || '';
    if (!uid) return acc;
    acc[uid] = acc[uid] || { count: 0, revenue: 0 };
    acc[uid].count += 1;
    acc[uid].revenue += orderAmount(order);
    return acc;
  }, {});
  const buyerUids = Object.keys(paidOrdersByUid);
  const repeatBuyers = buyerUids.filter((uid) => paidOrdersByUid[uid].count > 1);
  const customerRevenueRows = Object.entries(paidOrdersByUid)
    .map(([uid, value]) => {
      const profile = users.find((user) => user.uid === uid) || {};
      return {
        label: userDisplayName(profile),
        value: formatCurrency(value.revenue),
        helper: `${formatNumber(value.count)} paid order${value.count === 1 ? '' : 's'}`
      };
    })
    .sort((a, b) => toNumber(b.value.replace(/[^0-9.-]/g, '')) - toNumber(a.value.replace(/[^0-9.-]/g, '')))
    .slice(0, 8);

  const campaignsInRange = campaigns.filter((campaign) => isInRange(campaignTime(campaign), rangeStart));
  const campaignRecipients = sum(campaignsInRange, (campaign) => campaign.recipientCount);
  const campaignSuccess = sum(campaignsInRange, (campaign) => campaign.successCount);
  const campaignFailures = sum(campaignsInRange, (campaign) => campaign.failureCount);
  const campaignSkipped = sum(campaignsInRange, (campaign) => campaign.skippedCount);
  const delivered = sum(campaignsInRange, (campaign) => campaignEventCount(campaign, 'delivered'));
  const opens = sum(campaignsInRange, (campaign) => campaignEventCount(campaign, 'opens'));
  const clicks = sum(campaignsInRange, (campaign) => campaignEventCount(campaign, 'clicks'));
  const accepted = sum(campaignsInRange, (campaign) => campaignEventCount(campaign, 'accepted'));
  const permanentFailures = sum(campaignsInRange, (campaign) => campaignEventCount(campaign, 'permanentFailures'));
  const temporaryFailures = sum(campaignsInRange, (campaign) => campaignEventCount(campaign, 'temporaryFailures'));
  const unsubscribes = sum(campaignsInRange, (campaign) => campaignEventCount(campaign, 'unsubscribes'));
  const complaints = sum(campaignsInRange, (campaign) => campaignEventCount(campaign, 'complaints'));
  const mailgunEventsInRange = mailgunEvents.filter((event) => isInRange(webhookEventTime(event), rangeStart));
  const mailgunEventsLast30 = mailgunEvents.filter((event) => isInRange(webhookEventTime(event), Date.now() - 30 * 86400000));

  const conversationsInRange = conversations.filter((conversation) => isInRange(conversationTime(conversation), rangeStart));
  const messagesInRange = messages.filter((message) => isInRange(firstTimestamp(message, ['createdAt', 'sentAt']), rangeStart));
  const unreadConversations = conversations.filter((conversation) => toNumber(conversation.staffUnreadCount) > 0);
  const customerUnreadConversations = conversations.filter((conversation) => toNumber(conversation.unreadByCustomer) > 0);
  const staffUnreadMessages = sum(conversations, (conversation) => conversation.staffUnreadCount);
  const customerUnreadMessages = sum(conversations, (conversation) => conversation.unreadByCustomer);
  const staleStaffUnread = unreadConversations.filter((conversation) => {
    const unreadSince = timestamp(conversation.staffUnreadSince || conversation.lastMessageAt || conversation.updatedAt);
    return unreadSince && unreadSince <= Date.now() - 24 * 86400000;
  });
  const staleCustomerUnread = customerUnreadConversations.filter((conversation) => {
    const unreadSince = timestamp(conversation.customerUnreadSince || conversation.lastMessageAt || conversation.updatedAt);
    return unreadSince && unreadSince <= Date.now() - 48 * 86400000;
  });

  const healthIssues = [
    { label: 'Paid orders needing fulfillment', value: activePaidOrders.length, helper: 'Paid or approved orders still unfulfilled or processing.', severity: 'warning' },
    { label: 'Unread staff conversations', value: unreadConversations.length, helper: 'Customer conversations waiting for the business.', severity: 'warning' },
    { label: 'Custom requests awaiting review', value: reviewRequests.length, helper: 'Requests in review, priority review, or payment steps.', severity: 'warning' },
    { label: 'Products missing photos', value: productsMissingImages.length, helper: 'Catalog items without a usable image URL.', severity: 'danger' },
    { label: 'Products missing prices', value: productsMissingPrice.length, helper: 'Catalog items with no positive price.', severity: 'danger' },
    { label: 'Products missing descriptions', value: productsMissingDescription.length, helper: 'Catalog items without product copy.', severity: 'info' },
    { label: 'Paid orders missing shipping', value: paidOrdersMissingShipping.length, helper: 'Paid orders without a stored shipping address.', severity: 'danger' },
    { label: 'Shipped orders missing tracking', value: shippedWithoutTracking.length, helper: 'Shipped or delivered orders without tracking details.', severity: 'info' },
    { label: 'Users missing names', value: usersMissingName.length, helper: 'Accounts that only have email or UID identity.', severity: 'info' },
    { label: 'Campaign hard failures', value: permanentFailures + complaints, helper: 'Permanent failures and complaints from selected campaign history.', severity: 'danger' }
  ];
  const weightedIssueTotal = healthIssues.reduce((total, issue) => {
    const weight = issue.severity === 'danger' ? 4 : issue.severity === 'warning' ? 2 : 1;
    return total + issue.value * weight;
  }, 0);
  const healthScore = Math.max(0, Math.min(100, 100 - weightedIssueTotal));

  const rangeLabel = range.label.toLowerCase();
  const totalConfirmedRevenue = currentRevenue + customDepositRevenue;
  const allConfirmedRevenue = allOrderRevenue + allCustomDepositRevenue;
  const averagePaidOrder = average(paidOrdersInRange.map(orderAmount));
  const averageAllPaidOrder = average(paidOrders.map(orderAmount));
  const conversionFromInventory = products.length ? soldProducts.length / products.length : 0;
  const fulfillmentRate = paidOrders.length ? fulfilledOrders.length / paidOrders.length : 0;
  const deliveredRate = paidOrders.length ? deliveredOrders.length / paidOrders.length : 0;
  const quoteAcceptanceRate = quotedRequests.length ? acceptedRequests.length / quotedRequests.length : 0;
  const repeatCustomerRate = buyerUids.length ? repeatBuyers.length / buyerUids.length : 0;
  const messageResponseRisk = conversations.length ? unreadConversations.length / conversations.length : 0;
  const deliveryRate = campaignSuccess ? delivered / campaignSuccess : 0;
  const openRate = delivered ? opens / delivered : 0;
  const clickRate = delivered ? clicks / delivered : 0;
  const unsubscribeRate = campaignRecipients ? unsubscribes / campaignRecipients : 0;

  const executiveMetrics = [
    metric('Confirmed Revenue', formatCurrency(totalConfirmedRevenue), `${range.label}. All time: ${formatCurrency(allConfirmedRevenue)}.`, 'DollarSign', 'success'),
    metric('Active Order Queue', formatNumber(activePaidOrders.length), `${formatNumber(staffUnreadMessages)} unread staff message${staffUnreadMessages === 1 ? '' : 's'}.`, 'ShoppingCart', activePaidOrders.length ? 'warning' : 'success'),
    metric('Available Inventory Value', formatCurrency(availableInventoryValue), `${formatNumber(availableProducts.length)} available knives in catalog.`, 'Package', 'success'),
    metric('Custom Pipeline', formatCurrency(customPipelineValue), `${formatNumber(openRequests.length)} open custom request${openRequests.length === 1 ? '' : 's'}.`, 'Wand2', 'info'),
    metric('Campaign Reach', formatNumber(campaignRecipients), `${formatNumber(campaignsInRange.length)} campaign${campaignsInRange.length === 1 ? '' : 's'} in ${rangeLabel}.`, 'Mail', 'info'),
    metric('Data Health Score', `${healthScore}/100`, `${healthIssues.filter((issue) => issue.value > 0).length} active clean-up area${healthIssues.filter((issue) => issue.value > 0).length === 1 ? '' : 's'}.`, 'Gauge', healthScore >= 86 ? 'success' : healthScore >= 70 ? 'warning' : 'danger')
  ];

  const insights = [
    {
      title: activePaidOrders.length ? 'Fulfillment needs attention' : 'Fulfillment is clear',
      value: activePaidOrders.length ? `${formatNumber(activePaidOrders.length)} active paid order${activePaidOrders.length === 1 ? '' : 's'}` : 'No active paid backlog',
      helper: activePaidOrders.length ? `Oldest active order age: ${oldestAge(activePaidOrders, orderTime)}.` : 'Paid orders are shipped or delivered.',
      icon: activePaidOrders.length ? 'Clock' : 'CheckCircle',
      tone: activePaidOrders.length ? 'warning' : 'success'
    },
    {
      title: reviewRequests.length ? 'Custom review queue' : 'Custom queue is calm',
      value: `${formatNumber(reviewRequests.length)} awaiting review`,
      helper: `${formatCurrency(customPipelineValue)} open custom pipeline.`,
      icon: 'Wand2',
      tone: reviewRequests.length ? 'warning' : 'success'
    },
    {
      title: delivered ? 'Email engagement' : 'Email tracking warming up',
      value: `${formatRate(openRate)} opens, ${formatRate(clickRate)} clicks`,
      helper: `${formatNumber(mailgunEventsInRange.length)} Mailgun event${mailgunEventsInRange.length === 1 ? '' : 's'} in ${rangeLabel}.`,
      icon: 'Mail',
      tone: complaints || unsubscribes ? 'warning' : 'info'
    },
    {
      title: healthScore >= 86 ? 'Data looks solid' : 'Data clean-up available',
      value: `${healthScore}/100`,
      helper: healthIssues.filter((issue) => issue.value > 0).slice(0, 2).map((issue) => issue.label).join(' and ') || 'No major data gaps detected.',
      icon: 'Database',
      tone: healthScore >= 86 ? 'success' : healthScore >= 70 ? 'warning' : 'danger'
    }
  ];

  const orderStatusData = breakdownFromCounts(countBy(orders, (order) => order.status || 'pending'));
  const fulfillmentData = breakdownFromCounts(countBy(orders, fulfillmentStatus));
  const inventoryStatusData = breakdownFromCounts(productsByStatus);
  const productLocationData = breakdownFromCounts(countBy(products, (product) => product.displayLocation || 'store'));
  const requestStatusData = breakdownFromCounts(countBy(customRequests, (request) => request.status || 'not_set'), 12);
  const campaignEventData = [
    { label: 'Accepted', value: accepted },
    { label: 'Delivered', value: delivered },
    { label: 'Opens', value: opens },
    { label: 'Clicks', value: clicks },
    { label: 'Hard fails', value: permanentFailures },
    { label: 'Temp fails', value: temporaryFailures },
    { label: 'Unsubs', value: unsubscribes },
    { label: 'Complaints', value: complaints }
  ];
  const webhookEventData = breakdownFromCounts(countBy(mailgunEventsInRange, eventCounterName), 12);
  const mailgunTagCounts = mailgunEventsInRange.reduce((acc, event) => {
    mailgunEventTags(event).forEach((tag) => {
      acc[tag] = (acc[tag] || 0) + 1;
    });
    return acc;
  }, {});
  const mailgunTagData = breakdownFromCounts(mailgunTagCounts, 14);
  const taggedMailgunEvents = mailgunEventsInRange.filter((event) => mailgunEventTags(event).length > 0);
  const topMailgunTag = mailgunTagData[0]?.label || 'No tags yet';
  const conversationTypeData = breakdownFromCounts(countBy(conversations, (conversation) => {
    if (conversation.conversationType) return conversation.conversationType;
    if (customRequests.some((request) => request.requestId === conversation.conversationId)) return 'custom_request';
    if (orders.some((order) => order.orderId === conversation.conversationId)) return 'order';
    return 'general';
  }));

  const completePaidOrders = paidOrders.filter((order) => {
    const status = fulfillmentStatus(order);
    const trackingRequired = ['shipped', 'delivered'].includes(status);
    return hasShippingAddress(order) && (!trackingRequired || hasTracking(order));
  }).length;

  return {
    rangeLabel: range.label,
    sourceSummary: [
      sourceLabel(products.length, 'products'),
      sourceLabel(orders.length, 'orders'),
      sourceLabel(customRequests.length, 'custom requests'),
      sourceLabel(users.length, 'users'),
      sourceLabel(campaigns.length, 'campaigns')
    ].join(' | '),
    executiveMetrics,
    insights,
    sections: {
      money: {
        title: 'Money Analytics',
        description: 'Confirmed revenue, pending money, inventory value, and custom pipeline.',
        metrics: [
          metric('Confirmed revenue', formatCurrency(totalConfirmedRevenue), `${range.label}: paid knife orders plus paid custom deposits.`, 'DollarSign', 'success'),
          metric('Knife order revenue', formatCurrency(currentRevenue), `${formatNumber(paidOrdersInRange.length)} paid order${paidOrdersInRange.length === 1 ? '' : 's'} in range.`, 'ShoppingCart'),
          metric('Custom deposit revenue', formatCurrency(customDepositRevenue), `${formatNumber(paidDepositRequestsInRange.length)} paid custom deposit${paidDepositRequestsInRange.length === 1 ? '' : 's'} in range.`, 'Wand2'),
          metric('All-time confirmed revenue', formatCurrency(allConfirmedRevenue), `${formatCurrency(allOrderRevenue)} orders and ${formatCurrency(allCustomDepositRevenue)} custom deposits.`, 'TrendingUp'),
          metric('Pending order value', formatCurrency(pendingOrderValue), `${formatNumber(pendingOrders.length)} pending order${pendingOrders.length === 1 ? '' : 's'} currently in database.`, 'Clock', pendingOrders.length ? 'warning' : ''),
          metric('Available inventory value', formatCurrency(availableInventoryValue), `${formatNumber(availableProducts.length)} available catalog item${availableProducts.length === 1 ? '' : 's'}.`, 'Package'),
          metric('Visible available value', formatCurrency(visibleInventoryValue), 'Available inventory that is not hidden.', 'Eye'),
          metric('Custom pipeline value', formatCurrency(customPipelineValue), `${formatNumber(openRequests.length)} open custom request${openRequests.length === 1 ? '' : 's'}.`, 'Wand2'),
          metric('Average paid order', formatCurrency(averagePaidOrder || averageAllPaidOrder, true), averagePaidOrder ? `${range.label}.` : 'All-time average because this range has no paid orders.', 'Activity'),
          metric('Largest paid order', formatCurrency(largestOrderInRange || largestOrder, true), largestOrderInRange ? `${range.label}.` : 'All-time largest paid order.', 'BadgeDollarSign'),
          metric('Average available knife price', formatCurrency(average(availableProducts.map((product) => product.price)), true), `${formatNumber(availableProducts.length)} available knives priced.`, 'Package'),
          metric('Total catalog list value', formatCurrency(totalCatalogValue), 'Current value of every product price in the catalog.', 'Database'),
          metric('Sold catalog list value', formatCurrency(soldCatalogValue), 'Current list value of products marked sold.', 'CheckCircle'),
          metric('Revenue per buyer', formatCurrency(buyerUids.length ? allOrderRevenue / buyerUids.length : 0, true), `${formatNumber(buyerUids.length)} buyer${buyerUids.length === 1 ? '' : 's'} with paid orders.`, 'Users')
        ],
        charts: [
          chart('Revenue by Month', 'Paid orders plus paid custom deposits.', 'columns', buildMonthlySeries([...paidOrders, ...paidDepositRequests], (item) => orderTime(item) || customRequestTime(item), (item) => (item.orderId ? orderAmount(item) : requestDepositAmount(item))), formatCurrency),
          chart('Inventory Value by Status', 'Current catalog price value by public status.', 'bars', [
            { label: 'Available', value: availableInventoryValue },
            { label: 'Pending', value: sum(pendingProducts, (product) => product.price) },
            { label: 'Sold', value: soldCatalogValue },
            { label: 'Hidden', value: sum(hiddenProducts, (product) => product.price) }
          ], formatCurrency),
          chart('Custom Pipeline Mix', 'Estimated and quoted value across custom work.', 'bars', [
            { label: 'Open pipeline', value: customPipelineValue },
            { label: 'Final quoted', value: customFinalQuoteValue },
            { label: 'Original estimates', value: customEstimateValue },
            { label: 'Paid deposits', value: allCustomDepositRevenue }
          ], formatCurrency)
        ],
        lists: [
          detailList('Top Customers by Revenue', customerRevenueRows),
          detailList('Revenue Sources', [
            { label: 'Paid knife orders', value: formatCurrency(allOrderRevenue), helper: `${formatNumber(paidOrders.length)} all-time paid orders` },
            { label: 'Paid custom deposits', value: formatCurrency(allCustomDepositRevenue), helper: `${formatNumber(paidDepositRequests.length)} all-time deposits` },
            { label: 'Open custom pipeline', value: formatCurrency(customPipelineValue), helper: `${formatNumber(openRequests.length)} open requests` },
            { label: 'Available inventory', value: formatCurrency(availableInventoryValue), helper: `${formatNumber(availableProducts.length)} available knives` }
          ])
        ]
      },
      orders: {
        title: 'Order Analytics',
        description: 'Payment status, fulfillment movement, buyer activity, and operational backlog.',
        metrics: [
          metric('Total orders', formatNumber(orders.length), `${formatNumber(ordersInRange.length)} created or updated in ${rangeLabel}.`, 'ShoppingCart'),
          metric('Paid or approved orders', formatNumber(paidOrders.length), `${formatCurrency(allOrderRevenue)} all-time paid order revenue.`, 'CheckCircle', 'success'),
          metric('Pending orders', formatNumber(pendingOrders.length), `${formatCurrency(pendingOrderValue)} pending order value.`, 'Clock', pendingOrders.length ? 'warning' : ''),
          metric('Active paid backlog', formatNumber(activePaidOrders.length), 'Paid or approved orders still unfulfilled or processing.', 'ListChecks', activePaidOrders.length ? 'warning' : 'success'),
          metric('Fulfilled paid orders', formatNumber(fulfilledOrders.length), `${formatRate(fulfillmentRate)} of paid orders shipped or delivered.`, 'Package'),
          metric('Delivered paid orders', formatNumber(deliveredOrders.length), `${formatRate(deliveredRate)} of paid orders delivered.`, 'CheckCircle'),
          metric('Unique buyers', formatNumber(buyerUids.length), `${formatNumber(repeatBuyers.length)} repeat buyer${repeatBuyers.length === 1 ? '' : 's'}.`, 'Users'),
          metric('Repeat buyer rate', formatRate(repeatCustomerRate), 'Buyers with more than one paid order.', 'TrendingUp'),
          metric('Average order value', formatCurrency(averageAllPaidOrder, true), 'All-time paid order average.', 'BadgeDollarSign'),
          metric('Orders with tracking', formatNumber(paidOrders.filter(hasTracking).length), `${formatPercent(paidOrders.filter(hasTracking).length, paidOrders.length)} of paid orders.`, 'Package'),
          metric('Paid orders missing shipping', formatNumber(paidOrdersMissingShipping.length), 'Paid orders without a saved shipping address.', 'AlertTriangle', paidOrdersMissingShipping.length ? 'danger' : 'success'),
          metric('Shipped without tracking', formatNumber(shippedWithoutTracking.length), 'Shipped or delivered orders missing tracking details.', 'AlertTriangle', shippedWithoutTracking.length ? 'warning' : 'success'),
          metric('Orders missing customer email', formatNumber(ordersMissingEmail.length), 'Orders without customerEmail, email, or PayPal payer email.', 'Database', ordersMissingEmail.length ? 'warning' : 'success'),
          metric('Oldest active paid order', activePaidOrders.length ? oldestAge(activePaidOrders, orderTime) : 'None', 'Based on order created date.', 'Clock')
        ],
        charts: [
          chart('Order Revenue by Month', 'Paid and approved orders.', 'columns', buildMonthlySeries(paidOrders, orderTime, orderAmount), formatCurrency),
          chart('Payment Status', 'Current order payment status breakdown.', 'bars', orderStatusData),
          chart('Fulfillment Status', 'Current fulfillment status breakdown.', 'bars', fulfillmentData)
        ],
        lists: [
          detailList('Top Customers by Orders', Object.entries(paidOrdersByUid)
            .map(([uid, value]) => {
              const profile = users.find((user) => user.uid === uid) || {};
              return { label: userDisplayName(profile), value: formatNumber(value.count), helper: formatCurrency(value.revenue) };
            })
            .sort((a, b) => toNumber(b.value.replace(/,/g, '')) - toNumber(a.value.replace(/,/g, '')))
            .slice(0, 8)),
          detailList('Backlog Snapshot', [
            { label: 'Unfulfilled paid orders', value: formatNumber(paidOrders.filter((order) => fulfillmentStatus(order) === 'unfulfilled').length), helper: 'Ready for first fulfillment move.' },
            { label: 'Processing paid orders', value: formatNumber(paidOrders.filter((order) => fulfillmentStatus(order) === 'processing').length), helper: 'In active fulfillment.' },
            { label: 'Shipped paid orders', value: formatNumber(paidOrders.filter((order) => fulfillmentStatus(order) === 'shipped').length), helper: 'In transit.' },
            { label: 'Delivered paid orders', value: formatNumber(deliveredOrders.length), helper: 'Closed fulfillment.' }
          ])
        ]
      },
      inventory: {
        title: 'Inventory Analytics',
        description: 'Catalog value, visibility, product quality, price bands, and sale-through.',
        metrics: [
          metric('Total products', formatNumber(products.length), `${formatNumber(productsInRange.length)} changed in ${rangeLabel}.`, 'Package'),
          metric('Available knives', formatNumber(availableProducts.length), `${formatCurrency(availableInventoryValue)} available list value.`, 'CheckCircle', 'success'),
          metric('Pending knives', formatNumber(pendingProducts.length), 'Products reserved or pending.', 'Clock'),
          metric('Sold knives', formatNumber(soldProducts.length), `${formatRate(conversionFromInventory)} of catalog marked sold.`, 'TrendingUp'),
          metric('Visible products', formatNumber(visibleProducts.length), `${formatPercent(visibleProducts.length, products.length)} of catalog visible.`, 'Eye'),
          metric('Hidden products', formatNumber(hiddenProducts.length), 'Products hidden from public display.', 'EyeOff'),
          metric('Average catalog price', formatCurrency(average(products.map((product) => product.price)), true), 'Average across all priced catalog products.', 'BadgeDollarSign'),
          metric('Average sold price', formatCurrency(average(soldProducts.map((product) => product.price)), true), 'Average list price for sold products.', 'DollarSign'),
          metric('Highest product price', formatCurrency(Math.max(...products.map((product) => toNumber(product.price)), 0), true), 'Highest current catalog price.', 'TrendingUp'),
          metric('Lowest product price', formatCurrency(minPositive(products.map((product) => product.price)), true), 'Lowest positive catalog price.', 'Activity'),
          metric('Missing photos', formatNumber(productsMissingImages.length), 'Products without a usable image URL.', 'AlertTriangle', productsMissingImages.length ? 'danger' : 'success'),
          metric('Missing prices', formatNumber(productsMissingPrice.length), 'Products with no positive price.', 'AlertTriangle', productsMissingPrice.length ? 'danger' : 'success'),
          metric('Missing descriptions', formatNumber(productsMissingDescription.length), 'Products without product copy.', 'Database', productsMissingDescription.length ? 'warning' : 'success'),
          metric('Complete product records', formatPercent(completeProducts, products.length), 'Photo, price, and description are present.', 'CheckCircle')
        ],
        charts: [
          chart('Inventory Status', 'Public sale status across all products.', 'bars', inventoryStatusData),
          chart('Display Location', 'Where products are visible.', 'bars', productLocationData),
          chart('Price Bands', 'Current catalog price distribution.', 'bars', priceBands(products, (product) => product.price))
        ],
        lists: [
          detailList('Current Inventory Values', [
            { label: 'All catalog list value', value: formatCurrency(totalCatalogValue), helper: `${formatNumber(products.length)} products` },
            { label: 'Available list value', value: formatCurrency(availableInventoryValue), helper: `${formatNumber(availableProducts.length)} available` },
            { label: 'Pending list value', value: formatCurrency(sum(pendingProducts, (product) => product.price)), helper: `${formatNumber(pendingProducts.length)} pending` },
            { label: 'Sold list value', value: formatCurrency(soldCatalogValue), helper: `${formatNumber(soldProducts.length)} sold` }
          ]),
          detailList('Inventory Quality', [
            { label: 'Products with photos', value: formatPercent(products.length - productsMissingImages.length, products.length), helper: `${formatNumber(products.length - productsMissingImages.length)} of ${formatNumber(products.length)}` },
            { label: 'Products with prices', value: formatPercent(products.length - productsMissingPrice.length, products.length), helper: `${formatNumber(products.length - productsMissingPrice.length)} of ${formatNumber(products.length)}` },
            { label: 'Products with descriptions', value: formatPercent(products.length - productsMissingDescription.length, products.length), helper: `${formatNumber(products.length - productsMissingDescription.length)} of ${formatNumber(products.length)}` }
          ])
        ]
      },
      custom: {
        title: 'Custom Work Analytics',
        description: 'Request volume, quote flow, deposits, pipeline value, and most requested build choices.',
        metrics: [
          metric('Total custom requests', formatNumber(customRequests.length), `${formatNumber(requestsInRange.length)} submitted or updated in ${rangeLabel}.`, 'Wand2'),
          metric('Open custom requests', formatNumber(openRequests.length), `${formatCurrency(customPipelineValue)} estimated or quoted pipeline.`, 'ListChecks', openRequests.length ? 'warning' : 'success'),
          metric('Awaiting review', formatNumber(reviewRequests.length), 'Needs review, priority review, or payment step.', 'Clock', reviewRequests.length ? 'warning' : 'success'),
          metric('Active builds', formatNumber(activeBuilds.length), 'Priority review, accepted quote, or production.', 'Activity'),
          metric('Quotes sent', formatNumber(quotedRequests.length), `${formatCurrency(customFinalQuoteValue)} final quoted value.`, 'Mail'),
          metric('Quotes accepted', formatNumber(acceptedRequests.length), `${formatRate(quoteAcceptanceRate)} acceptance rate among quoted requests.`, 'CheckCircle', 'success'),
          metric('Paid deposits', formatNumber(paidDepositRequests.length), `${formatCurrency(allCustomDepositRevenue)} all-time deposit revenue.`, 'DollarSign'),
          metric('Average estimate', formatCurrency(average(customRequests.map(requestEstimate)), true), 'Average initial custom request estimate.', 'BadgeDollarSign'),
          metric('Average final quote', formatCurrency(average(customRequests.map(requestFinalPrice)), true), 'Average final price where quoted.', 'TrendingUp'),
          metric('Average deposit', formatCurrency(average(paidDepositRequests.map(requestDepositAmount)), true), 'Average paid custom deposit.', 'DollarSign'),
          metric('Completed custom work', formatNumber(customRequests.filter((request) => ['completed', 'shipped'].includes(request.status)).length), 'Requests marked completed or shipped.', 'CheckCircle'),
          metric('Cancelled requests', formatNumber(customRequests.filter((request) => request.status === 'cancelled').length), 'Custom requests marked cancelled.', 'AlertTriangle')
        ],
        charts: [
          chart('Custom Requests by Month', 'Requests submitted or updated.', 'columns', buildMonthlySeries(customRequests, customRequestTime, () => 1)),
          chart('Custom Request Status', 'Current status across all custom requests.', 'bars', requestStatusData),
          chart('Top Knife Types', 'Most selected custom request knife types.', 'bars', topCounts(customRequests, (request) => request.knifeType))
        ],
        lists: [
          detailList('Most Requested Specs', [
            ...topCounts(customRequests, (request) => request.knifeType, 4).map((row) => ({ ...row, helper: 'Knife type' })),
            ...topCounts(customRequests, (request) => request.steelType, 4).map((row) => ({ ...row, helper: 'Steel preference' })),
            ...topCounts(customRequests, (request) => request.handleMaterial, 4).map((row) => ({ ...row, helper: 'Handle material' }))
          ]),
          detailList('Custom Pipeline Detail', [
            { label: 'Open pipeline', value: formatCurrency(customPipelineValue), helper: `${formatNumber(openRequests.length)} open requests` },
            { label: 'Final quoted value', value: formatCurrency(customFinalQuoteValue), helper: `${formatNumber(quotedRequests.length)} quoted requests` },
            { label: 'Estimated value', value: formatCurrency(customEstimateValue), helper: `${formatNumber(customRequests.length)} total requests` },
            { label: 'Deposits collected', value: formatCurrency(allCustomDepositRevenue), helper: `${formatNumber(paidDepositRequests.length)} paid deposits` }
          ])
        ]
      },
      customers: {
        title: 'Customer Analytics',
        description: 'Audience size, account roles, customer value, groups, subscriptions, and suppression health.',
        metrics: [
          metric('Total users', formatNumber(users.length), `${formatNumber(usersInRange.length)} created or updated in ${rangeLabel}.`, 'Users'),
          metric('Customer accounts', formatNumber(customerUsers.length), 'Users without admin or business role.', 'Users'),
          metric('Business users', formatNumber(businessUsers.length), 'Users with business dashboard access.', 'Shield'),
          metric('Admin users', formatNumber(adminUsers.length), 'Users with admin dashboard access.', 'Shield'),
          metric('Active users', formatNumber(activeUsers.length), `${formatPercent(activeUsers.length, users.length)} of all users.`, 'CheckCircle', 'success'),
          metric('Blocked users', formatNumber(blockedUsers.length), 'Users blocked from normal access.', 'AlertTriangle', blockedUsers.length ? 'warning' : 'success'),
          metric('Marketing-ready users', formatNumber(marketingSubscribedUsers.length), 'Users with email, active account, and no suppression flag.', 'Mail', 'success'),
          metric('Suppressed or unsubscribed', formatNumber(marketingSuppressedUsers.length), 'Users with unsubscribe, complaint, permanent failure, or manual suppression.', 'EyeOff', marketingSuppressedUsers.length ? 'warning' : 'success'),
          metric('Unique buyers', formatNumber(buyerUids.length), `${formatCurrency(allOrderRevenue)} paid order revenue.`, 'BadgeDollarSign'),
          metric('Repeat buyers', formatNumber(repeatBuyers.length), `${formatRate(repeatCustomerRate)} repeat buyer rate.`, 'TrendingUp'),
          metric('Customers without orders', formatNumber(Math.max(customerUsers.length - buyerUids.length, 0)), 'Customer accounts that have not paid for a listed knife yet.', 'Users'),
          metric('Email groups', formatNumber(emailGroups.length), `${formatDecimal(average(emailGroups.map((group) => Object.values(group.members || {}).filter(Boolean).length)), 1)} average members.`, 'ListChecks'),
          metric('Users missing email', formatNumber(usersMissingEmail.length), 'Accounts without an email field.', 'Database', usersMissingEmail.length ? 'danger' : 'success'),
          metric('Users missing display name', formatNumber(usersMissingName.length), 'Accounts without displayName or name.', 'Database', usersMissingName.length ? 'warning' : 'success')
        ],
        charts: [
          chart('User Roles', 'Current user role breakdown.', 'bars', breakdownFromCounts(countBy(users, (user) => user.role || 'customer'))),
          chart('User Growth by Month', 'Users created or updated.', 'columns', buildMonthlySeries(users, userTime, () => 1)),
          chart('Marketing Audience', 'Email subscription and suppression readiness.', 'bars', [
            { label: 'Marketing ready', value: marketingSubscribedUsers.length },
            { label: 'Suppressed', value: marketingSuppressedUsers.length },
            { label: 'Blocked', value: blockedUsers.length },
            { label: 'Missing email', value: usersMissingEmail.length }
          ])
        ],
        lists: [
          detailList('Top Customers by Revenue', customerRevenueRows),
          detailList('Audience Groups', emailGroups
            .map((group) => ({
              label: group.name || group.groupId,
              value: formatNumber(Object.values(group.members || {}).filter(Boolean).length),
              helper: group.description || 'No description'
            }))
            .sort((a, b) => toNumber(b.value.replace(/,/g, '')) - toNumber(a.value.replace(/,/g, '')))
            .slice(0, 10))
        ]
      },
      email: {
        title: 'Email Analytics',
        description: 'Campaign performance, Mailgun event flow, failures, unsubscribes, and engagement rates.',
        metrics: [
          metric('Campaigns sent', formatNumber(campaignsInRange.length), `${formatNumber(campaigns.length)} all-time campaign${campaigns.length === 1 ? '' : 's'}.`, 'Mail'),
          metric('Recipients targeted', formatNumber(campaignRecipients), `${formatDecimal(campaignsInRange.length ? campaignRecipients / campaignsInRange.length : 0, 1)} average per campaign.`, 'Users'),
          metric('Send successes', formatNumber(campaignSuccess), `${formatPercent(campaignSuccess, campaignRecipients)} of selected recipients.`, 'CheckCircle', 'success'),
          metric('Send failures', formatNumber(campaignFailures), `${formatPercent(campaignFailures, campaignRecipients)} of selected recipients.`, 'AlertTriangle', campaignFailures ? 'danger' : 'success'),
          metric('Skipped recipients', formatNumber(campaignSkipped), 'Recipients skipped by the email service.', 'EyeOff'),
          metric('Accepted events', formatNumber(accepted), 'Mailgun accepted the message for delivery.', 'CheckCircle'),
          metric('Delivered events', formatNumber(delivered), `${formatRate(deliveryRate)} delivery rate against successful sends.`, 'Mail'),
          metric('Open rate', formatRate(openRate), `${formatNumber(opens)} open event${opens === 1 ? '' : 's'}.`, 'Eye'),
          metric('Click rate', formatRate(clickRate), `${formatNumber(clicks)} click event${clicks === 1 ? '' : 's'}.`, 'Activity'),
          metric('Unsubscribe rate', formatRate(unsubscribeRate), `${formatNumber(unsubscribes)} unsubscribe event${unsubscribes === 1 ? '' : 's'}.`, 'EyeOff', unsubscribes ? 'warning' : 'success'),
          metric('Hard failures', formatNumber(permanentFailures), 'Permanent recipient failures.', 'AlertTriangle', permanentFailures ? 'danger' : 'success'),
          metric('Temporary failures', formatNumber(temporaryFailures), 'Temporary recipient failures.', 'Clock', temporaryFailures ? 'warning' : 'success'),
          metric('Spam complaints', formatNumber(complaints), 'Recipients who complained.', 'AlertTriangle', complaints ? 'danger' : 'success'),
          metric('Webhook events', formatNumber(mailgunEventsInRange.length), `${formatNumber(mailgunEventsLast30.length)} in the last 30 days.`, 'Database'),
          metric('Tagged webhook events', formatNumber(taggedMailgunEvents.length), `${formatNumber(mailgunTagData.length)} unique Mailgun tag${mailgunTagData.length === 1 ? '' : 's'} in range.`, 'Tags'),
          metric('Top Mailgun tag', topMailgunTag, mailgunTagData[0] ? `${formatNumber(mailgunTagData[0].value)} event${mailgunTagData[0].value === 1 ? '' : 's'} in range.` : 'New tagged sends will appear here after Mailgun posts events.', 'Tags')
        ],
        charts: [
          chart('Email Event Funnel', 'Mailgun and campaign event counts.', 'bars', campaignEventData),
          chart('Campaign Volume by Month', 'Campaign sends by created date.', 'columns', buildMonthlySeries(campaigns, campaignTime, (campaign) => campaign.recipientCount || 1)),
          chart('Webhook Event Types', 'Raw Mailgun webhook events in the selected range.', 'bars', webhookEventData),
          chart('Mailgun Tags', 'Template, category, audience, and campaign tags received from Mailgun.', 'bars', mailgunTagData)
        ],
        lists: [
          detailList('Recent Campaign Performance', campaignsInRange
            .slice()
            .sort((a, b) => campaignTime(b) - campaignTime(a))
            .slice(0, 8)
            .map((campaign) => ({
              label: campaign.campaignName || campaign.subject || campaign.campaignId,
              value: `${formatRate(campaignEventCount(campaign, 'opens') / Math.max(campaignEventCount(campaign, 'delivered'), 1))} opens`,
              helper: `${formatNumber(campaign.recipientCount || 0)} recipients | ${formatDate(campaign.createdAt)}`
            }))),
          detailList('Mailgun Event Totals', campaignEventData.map((row) => ({
            label: row.label,
            value: formatNumber(row.value),
            helper: row.label === 'Hard fails' || row.label === 'Complaints' ? 'Suppresses or protects sending reputation.' : 'Tracked from Mailgun events.'
          }))),
          detailList('Mailgun Tag Totals', mailgunTagData.map((row) => ({
            label: row.label,
            value: formatNumber(row.value),
            helper: 'Received from Mailgun webhook event tags.'
          })))
        ]
      },
      conversations: {
        title: 'Conversation Analytics',
        description: 'Message volume, unread pressure, response risk, and conversation mix.',
        metrics: [
          metric('Total conversations', formatNumber(conversations.length), `${formatNumber(conversationsInRange.length)} active in ${rangeLabel}.`, 'MessagesSquare'),
          metric('Total messages', formatNumber(messages.length), `${formatNumber(messagesInRange.length)} sent in ${rangeLabel}.`, 'Mail'),
          metric('Staff unread conversations', formatNumber(unreadConversations.length), `${formatNumber(staffUnreadMessages)} unread staff message${staffUnreadMessages === 1 ? '' : 's'}.`, 'AlertTriangle', unreadConversations.length ? 'warning' : 'success'),
          metric('Customer unread conversations', formatNumber(customerUnreadConversations.length), `${formatNumber(customerUnreadMessages)} unread customer message${customerUnreadMessages === 1 ? '' : 's'}.`, 'Mail'),
          metric('Unread response risk', formatRate(messageResponseRisk), 'Share of conversations with staff unread count.', 'Gauge', messageResponseRisk > 0.2 ? 'warning' : 'success'),
          metric('Staff unread over 24h', formatNumber(staleStaffUnread.length), 'Customer messages waiting at least one day.', 'Clock', staleStaffUnread.length ? 'danger' : 'success'),
          metric('Customer unread over 48h', formatNumber(staleCustomerUnread.length), 'Sent replies the customer has not read yet.', 'Clock'),
          metric('Average messages per conversation', formatDecimal(conversations.length ? messages.length / conversations.length : 0, 1), 'All-time conversation depth.', 'Activity'),
          metric('Staff messages', formatNumber(messages.filter((message) => ['admin', 'business', 'staff'].includes(message.senderRole)).length), 'Messages sent by Nolan or staff.', 'Shield'),
          metric('Customer messages', formatNumber(messages.filter((message) => !['admin', 'business', 'staff'].includes(message.senderRole)).length), 'Messages sent by customers.', 'Users')
        ],
        charts: [
          chart('Messages by Month', 'Message volume by sent date.', 'columns', buildMonthlySeries(messages, (message) => firstTimestamp(message, ['createdAt', 'sentAt']), () => 1)),
          chart('Conversation Mix', 'Order, custom request, and general threads.', 'bars', conversationTypeData),
          chart('Unread Pressure', 'Current unread counts by side.', 'bars', [
            { label: 'Staff unread conversations', value: unreadConversations.length },
            { label: 'Staff unread messages', value: staffUnreadMessages },
            { label: 'Customer unread conversations', value: customerUnreadConversations.length },
            { label: 'Customer unread messages', value: customerUnreadMessages }
          ])
        ],
        lists: [
          detailList('Longest Waiting Staff Conversations', staleStaffUnread
            .slice()
            .sort((a, b) => timestamp(a.staffUnreadSince || a.lastMessageAt || a.updatedAt) - timestamp(b.staffUnreadSince || b.lastMessageAt || b.updatedAt))
            .slice(0, 8)
            .map((conversation) => ({
              label: conversation.customerEmail || conversation.conversationId,
              value: formatAge(conversation.staffUnreadSince || conversation.lastMessageAt || conversation.updatedAt),
              helper: `${formatNumber(conversation.staffUnreadCount || 0)} unread`
            }))),
          detailList('Conversation Sources', conversationTypeData.map((row) => ({
            label: row.label,
            value: formatNumber(row.value),
            helper: `${formatPercent(row.value, conversations.length)} of conversations`
          })))
        ]
      },
      health: {
        title: 'Data Health Analytics',
        description: 'Data gaps and operational risks that make the rest of the dashboard less reliable.',
        metrics: [
          metric('Data health score', `${healthScore}/100`, 'Weighted from catalog, order, customer, conversation, and email issues.', 'Gauge', healthScore >= 86 ? 'success' : healthScore >= 70 ? 'warning' : 'danger'),
          metric('Active issue areas', formatNumber(healthIssues.filter((issue) => issue.value > 0).length), 'Health checks with at least one affected record.', 'ListChecks'),
          metric('Product completeness', formatPercent(completeProducts, products.length), 'Photo, price, and description completeness.', 'Package'),
          metric('Order completeness', formatPercent(completePaidOrders, paidOrders.length), 'Shipping and tracking completeness for paid orders.', 'ShoppingCart'),
          metric('Customer contact completeness', formatPercent(users.length - usersMissingEmail.length, users.length), 'Users with an email address.', 'Users'),
          metric('Email suppression count', formatNumber(marketingSuppressedUsers.length), 'Users protected from marketing sends.', 'Mail'),
          metric('Webhook events last 30 days', formatNumber(mailgunEventsLast30.length), 'Recent Mailgun event activity.', 'Database', campaigns.length && !mailgunEventsLast30.length ? 'warning' : 'success'),
          metric('Campaign deliverability warnings', formatNumber(permanentFailures + temporaryFailures + complaints), 'Failures and complaints in selected range.', 'AlertTriangle', permanentFailures + complaints ? 'danger' : temporaryFailures ? 'warning' : 'success')
        ],
        charts: [
          chart('Health Issues', 'Records currently needing attention.', 'bars', healthIssues.map((issue) => ({ label: issue.label, value: issue.value }))),
          chart('Completeness Scores', 'Core data completeness by area.', 'bars', [
            { label: 'Products', value: products.length ? completeProducts / products.length * 100 : 0 },
            { label: 'Paid orders', value: paidOrders.length ? completePaidOrders / paidOrders.length * 100 : 0 },
            { label: 'Users', value: users.length ? (users.length - usersMissingEmail.length) / users.length * 100 : 0 },
            { label: 'Email', value: campaignRecipients ? Math.max(0, 100 - ((permanentFailures + complaints) / campaignRecipients * 100)) : 100 }
          ], (value) => `${Math.round(value)}%`)
        ],
        lists: [
          detailList('Clean-up Queue', healthIssues
            .filter((issue) => issue.value > 0)
            .sort((a, b) => {
              const severityOrder = { danger: 3, warning: 2, info: 1 };
              return (severityOrder[b.severity] || 0) - (severityOrder[a.severity] || 0) || b.value - a.value;
            })
            .map((issue) => ({
              label: issue.label,
              value: formatNumber(issue.value),
              helper: issue.helper
            }))),
          detailList('Loaded Data Sources', [
            { label: 'Products', value: formatNumber(products.length), helper: 'Products path' },
            { label: 'Orders', value: formatNumber(orders.length), helper: 'orders path' },
            { label: 'Custom requests', value: formatNumber(customRequests.length), helper: 'customRequests path' },
            { label: 'Conversations', value: formatNumber(conversations.length), helper: 'conversations path' },
            { label: 'Messages', value: formatNumber(messages.length), helper: 'messages path' },
            { label: 'Users', value: formatNumber(users.length), helper: 'users path' },
            { label: 'Email groups', value: formatNumber(emailGroups.length), helper: 'emailGroups path' },
            { label: 'Email campaigns', value: formatNumber(campaigns.length), helper: 'emailCampaigns path' },
            { label: 'Mailgun events', value: formatNumber(mailgunEvents.length), helper: 'mailgunWebhookEvents path' }
          ])
        ]
      }
    }
  };
}

export default function Analytics() {
  const [data, setData] = useState(() => SOURCES.reduce((acc, source) => ({ ...acc, [source.key]: [] }), {}));
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState({});
  const [rangeId, setRangeId] = useState('90');
  const [activeSectionId, setActiveSectionId] = useState('money');
  const [showCharts, setShowCharts] = useState(true);
  const [metricSearch, setMetricSearch] = useState('');

  useEffect(() => {
    const loaded = {};

    const markLoaded = (key) => {
      loaded[key] = true;
      if (SOURCES.every((source) => loaded[source.key])) setLoading(false);
    };

    const unsubscribers = SOURCES.map((source) => onValue(ref(db, source.path), (snapshot) => {
      setData((prev) => ({ ...prev, [source.key]: snapshotToList(snapshot, source) }));
      setErrors((prev) => {
        const next = { ...prev };
        delete next[source.key];
        return next;
      });
      markLoaded(source.key);
    }, (error) => {
      setErrors((prev) => ({ ...prev, [source.key]: error?.message || `Failed to load ${source.path}` }));
      markLoaded(source.key);
    }));

    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, []);

  const analytics = useMemo(() => buildAnalytics(data, rangeId), [data, rangeId]);
  const activeSection = analytics.sections[activeSectionId] || analytics.sections.money;
  const normalizedSearch = metricSearch.trim().toLowerCase();
  const visibleMetrics = normalizedSearch
    ? activeSection.metrics.filter((item) => item.searchText.includes(normalizedSearch))
    : activeSection.metrics;
  const sourceErrors = Object.entries(errors);

  if (loading) {
    return (
      <div className="business-workspace analytics-page">
        <div className="loading-shimmer">Loading analytics...</div>
      </div>
    );
  }

  return (
    <div className="business-workspace analytics-page">
      <div className="workspace-hero analytics-hero">
        <div>
          <p className="workspace-eyebrow">Analytics</p>
          <h1>Business Analytics</h1>
          <p>Revenue, orders, inventory, custom work, customers, email performance, conversations, and data health in one focused workspace.</p>
        </div>
        <div className="analytics-hero-controls">
          <label className="analytics-control">
            <LucideIcon name="Calendar" size={16} />
            <select value={rangeId} onChange={(event) => setRangeId(event.target.value)} aria-label="Analytics date range">
              {RANGE_OPTIONS.map((range) => (
                <option key={range.id} value={range.id}>{range.label}</option>
              ))}
            </select>
          </label>
          <button className="action-btn secondary" type="button" onClick={() => setShowCharts((current) => !current)}>
            <LucideIcon name={showCharts ? 'EyeOff' : 'Eye'} size={16} /> {showCharts ? 'Hide Graphs' : 'Show Graphs'}
          </button>
        </div>
      </div>

      {sourceErrors.length > 0 && (
        <div className="alert-error">
          Some analytics sources could not load: {sourceErrors.map(([key]) => key).join(', ')}.
        </div>
      )}

      <div className="analytics-command-bar">
        <label className="toolbar-search analytics-search">
          <LucideIcon name="Search" size={16} />
          <input
            placeholder="Search visible stats"
            value={metricSearch}
            onChange={(event) => setMetricSearch(event.target.value)}
          />
        </label>
        <div className="analytics-source-note">
          <LucideIcon name="Database" size={15} />
          <span>{analytics.sourceSummary}</span>
        </div>
      </div>

      <section className="analytics-executive-grid" aria-label="Executive analytics">
        {analytics.executiveMetrics.map((item) => (
          <AnalyticsMetricCard item={item} key={item.label} />
        ))}
      </section>

      <section className="analytics-insights" aria-label="Analytics insights">
        {analytics.insights.map((item) => (
          <article className={`analytics-insight tone-${item.tone}`} key={item.title}>
            <LucideIcon name={item.icon} size={19} />
            <div>
              <span>{item.title}</span>
              <strong>{item.value}</strong>
              <p>{item.helper}</p>
            </div>
          </article>
        ))}
      </section>

      <nav className="analytics-section-tabs" aria-label="Analytics sections">
        {SECTION_CONFIG.map((section) => (
          <button
            key={section.id}
            type="button"
            className={activeSectionId === section.id ? 'active' : ''}
            onClick={() => setActiveSectionId(section.id)}
          >
            <LucideIcon name={section.icon} size={16} />
            <span>{section.label}</span>
          </button>
        ))}
      </nav>

      <section className="analytics-section-panel">
        <div className="analytics-section-header">
          <div>
            <p className="workspace-eyebrow">{analytics.rangeLabel}</p>
            <h2>{activeSection.title}</h2>
            <p>{activeSection.description}</p>
          </div>
          <span>{formatNumber(visibleMetrics.length)} visible stats</span>
        </div>

        {visibleMetrics.length === 0 ? (
          <div className="empty-state refined compact-empty">
            <LucideIcon name="Search" size={28} />
            <h2>No matching stats.</h2>
          </div>
        ) : (
          <div className="analytics-metric-grid">
            {visibleMetrics.map((item) => (
              <AnalyticsMetricCard item={item} key={`${activeSectionId}-${item.label}`} />
            ))}
          </div>
        )}

        {showCharts && activeSection.charts.length > 0 && (
          <div className="analytics-chart-grid">
            {activeSection.charts.map((item) => (
              <AnalyticsChart item={item} key={`${activeSectionId}-${item.title}`} />
            ))}
          </div>
        )}

        <div className="analytics-detail-grid">
          {activeSection.lists.map((item) => (
            <AnalyticsDetailList item={item} key={`${activeSectionId}-${item.title}`} />
          ))}
        </div>
      </section>
    </div>
  );
}
