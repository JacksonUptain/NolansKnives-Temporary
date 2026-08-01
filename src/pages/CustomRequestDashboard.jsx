import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from './firebase';
import { ref, onValue } from 'firebase/database';
import './CustomRequestDashboard.css';
import LucideIcon from '../components/ui/LucideIcon';

const REQUEST_STATUSES = [
  'all',
  'unpaid_unverified',
  'pending_payment',
  'needs_review',
  'pending_review',
  'priority_review',
  'quote_sent',
  'pending_acceptance',
  'quote_accepted',
  'in_production',
  'awaiting_final_payment',
  'paid_in_full',
  'ready_to_ship',
  'completed',
  'shipped',
  'cancelled'
];

function labelize(value) {
  if (!value) return 'Not specified';
  return String(value).replace(/_/g, ' ').replace(/\b\w/g, (match) => match.toUpperCase());
}

function formatRequestId(id) {
  if (!id) return '-';
  return id.length > 8 ? `#${id.slice(-6).toUpperCase()}` : `#${id.toUpperCase()}`;
}

function formatCurrency(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function formatDate(value) {
  if (!value) return 'No date';
  const date = typeof value === 'number' ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) return 'No date';
  return date.toLocaleString();
}

const EMAIL_ACTIVITY_LABELS = {
  quote: 'Quote email',
  final_payment_request: 'Final payment request',
  quote_deposit_confirmation: 'Deposit confirmation',
  quote_deposit_staff_alert: 'Deposit staff alert',
  priority_deposit_confirmation: 'Priority deposit confirmation',
  priority_deposit_staff_alert: 'Priority deposit staff alert',
  custom_request_confirmation: 'Request confirmation',
  custom_request_staff_alert: 'Staff request alert',
  custom_request_status_update: 'Status update',
  custom_request_completion: 'Completion notice',
  final_payment_confirmation: 'Final payment confirmation',
  final_payment_staff_alert: 'Final payment staff alert',
  customer_unread_message_reminder: 'Unread message reminder',
  staff_unread_customer_message_reminder: 'Staff unread reminder',
  store_purchase_confirmation: 'Store purchase confirmation',
  store_purchase_staff_alert: 'Store purchase staff alert'
};

const EMAIL_EVENT_LABELS = {
  accepted: 'Accepted',
  delivered: 'Delivered',
  opened: 'Opened',
  clicked: 'Clicked',
  permanentFailure: 'Permanent failure',
  temporaryFailure: 'Temporary failure',
  complained: 'Spam complaint',
  unsubscribed: 'Unsubscribed'
};

function getLatestActivityEvent(activity = {}) {
  const events = Object.values(activity.events || {}).filter(Boolean);
  if (events.length === 0) return null;
  return events.sort((a, b) => Number(b.eventAt || b.receivedAt || 0) - Number(a.eventAt || a.receivedAt || 0))[0];
}

function emailActivityLabel(key, activity = {}) {
  return EMAIL_ACTIVITY_LABELS[activity.emailPurpose] ||
    EMAIL_ACTIVITY_LABELS[key] ||
    labelize(activity.label || activity.emailPurpose || activity.templateName || key);
}

function emailEventLabel(value) {
  return EMAIL_EVENT_LABELS[value] || labelize(value || 'waiting');
}

export function getEmailActivityRows(request) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) return [];
  const emailActivity = request.emailActivity;
  if (!emailActivity || typeof emailActivity !== 'object' || Array.isArray(emailActivity)) return [];

  return Object.entries(emailActivity)
    .filter(([, activity]) => activity && typeof activity === 'object')
    .map(([key, activity]) => {
      const latest = getLatestActivityEvent(activity);
      const counts = activity.counts || {};
      const lastEvent = activity.lastEvent || latest?.eventName || latest?.event || '';
      const lastEventAt = activity.lastEventAt || latest?.eventAt || latest?.receivedAt || activity.sentAt || 0;
      const failures = Number(counts.permanentFailures || 0) + Number(counts.temporaryFailures || 0);

      return {
        key,
        label: emailActivityLabel(key, activity),
        recipient: activity.recipient || latest?.recipient || '',
        subject: activity.subject || latest?.subject || '',
        templateName: activity.templateName || latest?.templateName || '',
        sentAt: activity.sentAt || 0,
        lastEvent,
        lastEventLabel: lastEvent ? emailEventLabel(lastEvent) : (activity.sentAt ? 'Sent' : 'Waiting'),
        lastEventAt,
        lastClickedUrl: activity.lastClickedUrl || latest?.url || '',
        metrics: [
          ['Accepted', counts.accepted || 0],
          ['Delivered', counts.delivered || 0],
          ['Opens', counts.opens || 0],
          ['Clicks', counts.clicks || 0],
          ['Failures', failures]
        ]
      };
    })
    .sort((a, b) => Number(b.lastEventAt || b.sentAt || 0) - Number(a.lastEventAt || a.sentAt || 0));
}

const REQUEST_VIEW_CONFIG = {
  all: {
    title: 'Custom Requests',
    description: 'Review customer build briefs, prepare quotes, and keep each request moving.',
    statuses: null,
    defaultFilter: 'all'
  },
  quotes: {
    title: 'Quotes',
    description: 'Focus on requests that need a quote, customer approval, or a quote follow-up.',
    statuses: ['priority_review', 'pending_review', 'needs_review', 'quote_sent', 'pending_acceptance'],
    defaultFilter: 'all'
  },
  production: {
    title: 'Production',
    description: 'Keep accepted builds moving through production, final payment, and ready-to-ship stages.',
    statuses: ['quote_accepted', 'in_production', 'awaiting_final_payment', 'paid_in_full', 'ready_to_ship'],
    defaultFilter: 'all'
  }
};

function CustomRequestDashboard({ view = 'all' }) {
  const navigate = useNavigate();
  const viewConfig = REQUEST_VIEW_CONFIG[view] || REQUEST_VIEW_CONFIG.all;
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    setFilterStatus(viewConfig.defaultFilter);
  }, [view, viewConfig.defaultFilter]);

  useEffect(() => {
    const requestsRef = ref(db, 'customRequests');
    const unsubscribe = onValue(requestsRef, (snapshot) => {
      const data = snapshot.val();
      const list = data
        ? Object.entries(data)
            .map(([id, value]) => (
              value && typeof value === 'object' && !Array.isArray(value)
                ? { id, ...value }
                : null
            ))
            .filter(Boolean)
        : [];

      list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      setRequests(list);
      setLoading(false);
      setError('');
    }, (err) => {
      setError(err?.message || 'Failed to load custom requests');
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const filteredRequests = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return requests.filter((request) => {
      const searchableFields = [
        request.customerName,
        request.customerEmail,
        request.id,
        request.knifeType
      ].map((value) => String(value || '').toLowerCase());
      const matchesSearch = !normalizedSearch ||
        searchableFields.some((value) => value.includes(normalizedSearch));
      const matchesView = !viewConfig.statuses || viewConfig.statuses.includes(request.status);
      const matchesFilter = filterStatus === 'all' || request.status === filterStatus;
      return matchesSearch && matchesView && matchesFilter;
    });
  }, [requests, searchTerm, filterStatus, viewConfig.statuses]);

  const stats = useMemo(() => ({
    awaitingReview: requests.filter((request) => ['priority_review', 'pending_review', 'needs_review', 'pending_payment'].includes(request.status)).length,
    unverified: requests.filter((request) => request.status === 'unpaid_unverified').length,
    quotes: requests.filter((request) => ['quote_sent', 'pending_acceptance'].includes(request.status)).length,
    active: requests.filter((request) => ['priority_review', 'quote_accepted', 'in_production', 'awaiting_final_payment', 'paid_in_full', 'ready_to_ship'].includes(request.status)).length
  }), [requests]);


  if (loading) {
    return (
      <div className="custom-request-dashboard">
        <div className="loading-shimmer">Loading custom requests...</div>
      </div>
    );
  }

  return (
    <div className="custom-request-dashboard">
      <div className="workspace-hero">
        <div>
          <h1>{viewConfig.title}</h1>
          <p>{viewConfig.description}</p>
        </div>
      </div>

      {error && <div className="alert-error">{error}</div>}

      <div className="workspace-stats">
        <div className="stat-card compact urgent"><span>Awaiting review</span><strong>{stats.awaitingReview}</strong></div>
        <div className="stat-card compact"><span>Unverified</span><strong>{stats.unverified}</strong></div>
        <div className="stat-card compact"><span>Quotes sent</span><strong>{stats.quotes}</strong></div>
        <div className="stat-card compact"><span>Active builds</span><strong>{stats.active}</strong></div>
      </div>

      <div className="workspace-toolbar">
        <label className="toolbar-search">
          <LucideIcon name="Search" size={16} />
          <input
            type="search"
            placeholder="Search request, customer, email, or knife type"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
        </label>

        <select value={filterStatus} onChange={(event) => setFilterStatus(event.target.value)} aria-label="Filter custom requests">
          {REQUEST_STATUSES.filter((status) => status === 'all' || !viewConfig.statuses || viewConfig.statuses.includes(status)).map((status) => (
            <option key={status} value={status}>{status === 'all' ? 'All requests' : labelize(status)}</option>
          ))}
        </select>
      </div>

      {filteredRequests.length === 0 ? (
        <div className="empty-state refined">
          <LucideIcon name="Wand2" size={42} />
          <h2>No custom requests match this view.</h2>
          <p>New customer requests will appear here after submission.</p>
        </div>
      ) : (
        <div className="request-queue">
          {filteredRequests.map((request) => (
            <article
              key={request.id}
              className="request-queue-card"
              onClick={() => navigate(`/business/custom-requests/${request.id}`)}
            >
              <div className="queue-card-top">
                <div>
                  <span>{formatRequestId(request.id)}</span>
                  <h2>{request.customerName || 'Customer'}</h2>
                  <p>{request.customerEmail || 'No email captured'}</p>
                </div>
                <span className={`status-badge status-${request.status || 'pending_review'}`}>{labelize(request.status || 'pending_review')}</span>
              </div>

              <div className="request-brief-line">
                <strong>{labelize(request.knifeType)}</strong>
                <span>{labelize(request.steelType)} / {labelize(request.handleMaterial)}</span>
              </div>

              <div className="request-card-meta">
                <div><span>Estimate</span><strong>{formatCurrency(request.estimatedPrice)}</strong></div>
                <div><span>Submitted</span><strong>{formatDate(request.createdAt).split(',')[0]}</strong></div>
              </div>

              <div className="request-card-actions">
                <button type="button" onClick={(event) => { event.stopPropagation(); navigate(`/business/custom-requests/${request.id}`); }}>
                  Open request
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

export default CustomRequestDashboard;
