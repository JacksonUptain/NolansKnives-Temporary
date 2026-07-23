import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { limitToLast, onValue, orderByChild, query, ref } from 'firebase/database';
import { db } from '../firebase';
import { getMailgunWebhookStatus } from '../../services/adminService';
import { showToast } from '../../components/Toast';
import LucideIcon from '../../components/ui/LucideIcon';
import '../AdminDashboard.css';

const fallbackEvents = [
  { key: 'accepted', label: 'Accepted' },
  { key: 'delivered', label: 'Delivered messages' },
  { key: 'opened', label: 'Opens' },
  { key: 'clicked', label: 'Clicked' },
  { key: 'permanent_fail', label: 'Permanent failure' },
  { key: 'temporary_fail', label: 'Temporary failure' },
  { key: 'unsubscribed', label: 'Unsubscribes' },
  { key: 'complained', label: 'Spam complaints' }
];

const statItems = [
  ['accepted', 'Accepted'],
  ['delivered', 'Delivered'],
  ['opens', 'Opens'],
  ['clicks', 'Clicks'],
  ['permanentFailures', 'Permanent'],
  ['temporaryFailures', 'Temporary'],
  ['unsubscribes', 'Unsubscribes'],
  ['complaints', 'Complaints']
];

function formatDate(value) {
  if (!value) return 'No date';
  const date = new Date(Number(value));
  if (Number.isNaN(date.getTime())) return 'No date';
  return date.toLocaleString();
}

function eventLabel(event) {
  if (event === 'failed') return 'failed';
  return event || 'unknown';
}

export default function MailgunWebhooks() {
  const [status, setStatus] = useState(null);
  const [recentEvents, setRecentEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadStatus = useCallback(async () => {
    try {
      const result = await getMailgunWebhookStatus();
      setStatus(result);
      setError('');
    } catch (err) {
      const message = err?.message || 'Failed to load Mailgun webhook status.';
      setError(message);
      showToast(message, 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
    const eventsQuery = query(ref(db, 'mailgunWebhookEvents'), orderByChild('receivedAt'), limitToLast(25));
    const unsub = onValue(eventsQuery, (snapshot) => {
      const list = snapshot.exists()
        ? Object.entries(snapshot.val() || {}).map(([eventKey, value]) => ({ eventKey, ...value, raw: undefined }))
        : [];
      list.sort((a, b) => Number(b.receivedAt || b.eventAt || 0) - Number(a.receivedAt || a.eventAt || 0));
      setRecentEvents(list);
    });
    return () => unsub();
  }, [loadStatus]);

  const events = status?.events?.length ? status.events : fallbackEvents;
  const counts = status?.status?.counts || {};
  const latest = status?.status?.latest || null;
  const webhookUrl = status?.webhookUrl || '';

  const eventColumns = useMemo(() => {
    const midpoint = Math.ceil(events.length / 2);
    return [events.slice(0, midpoint), events.slice(midpoint)];
  }, [events]);

  const copyUrl = async () => {
    if (!webhookUrl) return;
    try {
      await navigator.clipboard.writeText(webhookUrl);
      showToast('Webhook URL copied.', 'success');
    } catch (_err) {
      showToast('Could not copy URL.', 'error');
    }
  };

  if (loading) return <div className="admin-dashboard-page"><div className="loading-shimmer">Loading Mailgun webhooks...</div></div>;

  return (
    <div className="admin-dashboard-page mailgun-webhooks-page">
      <div className="dashboard-header admin-users-header">
        <div>
          <h1>Mailgun Webhooks</h1>
          <p>Connect domain-level Mailgun events and monitor delivery, opens, clicks, failures, complaints, and unsubscribes.</p>
        </div>
        <button className="action-btn secondary" onClick={loadStatus}>
          <LucideIcon name="RefreshCw" size={16} /> Refresh
        </button>
      </div>

      {error && <div className="alert-error">{error}</div>}

      <div className="webhook-setup-grid">
        <section className="webhook-panel">
          <div className="webhook-panel-header">
            <div>
              <p className="workspace-eyebrow">Setup</p>
              <h2>Domain-Level Webhook</h2>
            </div>
            <span className={`status-badge status-${status?.signingConfigured ? 'active' : 'warning'}`}>
              {status?.signingConfigured ? 'Signature verified' : 'Signing key missing'}
            </span>
          </div>

          <label>
            Description
            <input className="input-field" value="All events hook" readOnly />
          </label>

          <label>
            HTTP post URL
            <div className="copy-input-row">
              <input className="input-field" value={webhookUrl} readOnly />
              <button type="button" className="action-btn" onClick={copyUrl}>
                <LucideIcon name="Copy" size={15} /> Copy
              </button>
            </div>
          </label>

          <label>
            Domain
            <input className="input-field" value={status?.domain || 'nolansknives.com'} readOnly />
          </label>

          <div className="webhook-events-box">
            <strong>Events</strong>
            <label className="webhook-check select-all"><input type="checkbox" checked readOnly /> Select all</label>
            <div className="webhook-event-columns">
              {eventColumns.map((column, columnIndex) => (
                <div key={columnIndex}>
                  {column.map((event) => (
                    <label className="webhook-check" key={event.key}>
                      <input type="checkbox" checked readOnly />
                      {event.label}
                    </label>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="webhook-panel">
          <div className="webhook-panel-header">
            <div>
              <p className="workspace-eyebrow">Status</p>
              <h2>Event Activity</h2>
            </div>
            <LucideIcon name="Activity" size={22} />
          </div>

          <div className="webhook-stats">
            {statItems.map(([key, label]) => (
              <div className="stat-card compact" key={key}>
                <span>{label}</span>
                <strong>{counts[key] || 0}</strong>
              </div>
            ))}
          </div>

          <div className="webhook-latest">
            <span>Latest event</span>
            <strong>{latest ? `${eventLabel(latest.event)} ${latest.severity ? `(${latest.severity})` : ''}` : 'None yet'}</strong>
            <small>{latest ? `${latest.recipient || 'No recipient'} - ${formatDate(latest.receivedAt || latest.eventAt)}` : 'Waiting for Mailgun to post events.'}</small>
          </div>
        </section>
      </div>

      <section className="webhook-panel webhook-events-table-panel">
        <div className="webhook-panel-header">
          <div>
            <p className="workspace-eyebrow">Recent</p>
            <h2>Webhook Events</h2>
          </div>
        </div>

        <div className="table-wrap">
          <table className="data-table webhook-events-table">
            <thead>
              <tr>
                <th>Event</th>
                <th>Recipient</th>
                <th>Subject</th>
                <th>Campaign</th>
                <th>Signature</th>
                <th>Received</th>
              </tr>
            </thead>
            <tbody>
              {recentEvents.length === 0 && <tr><td colSpan={6} className="table-empty">No Mailgun events received yet.</td></tr>}
              {recentEvents.map((event) => (
                <tr key={event.eventKey}>
                  <td>
                    <span className={`status-badge status-${event.severity === 'permanent' || event.event === 'complained' ? 'blocked' : 'active'}`}>
                      {eventLabel(event.event)}{event.severity ? ` ${event.severity}` : ''}
                    </span>
                  </td>
                  <td className="table-email">{event.recipient || '-'}</td>
                  <td>{event.subject || '-'}</td>
                  <td>{event.campaignName || event.campaignId || event.templateName || '-'}</td>
                  <td>{event.signatureStatus || '-'}</td>
                  <td>{formatDate(event.receivedAt || event.eventAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
