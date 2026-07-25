import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { limitToLast, onValue, orderByChild, query, ref } from 'firebase/database';
import { db } from '../firebase';
import { getMailgunWebhookStatus } from '../../services/adminService';
import { showToast } from '../../components/Toast';
import LucideIcon from '../../components/ui/LucideIcon';
import '../AdminDashboard.css';

const fallbackEvents = [
  { key: 'accepted', label: 'Accepted', plain: 'Accepted', description: 'Mailgun accepted the email for delivery.', websiteUse: 'Adds accepted counts and confirms Mailgun received the send.' },
  { key: 'delivered', label: 'Delivered messages', plain: 'Delivered messages', description: 'The message reached the recipient mail server.', websiteUse: 'Adds delivered counts and updates delivery history.' },
  { key: 'opened', label: 'Opens', plain: 'Opens', description: 'A recipient opened the email.', websiteUse: 'Adds campaign open counts and recipient engagement.' },
  { key: 'clicked', label: 'Clicked', plain: 'Clicked', description: 'A recipient clicked a link.', websiteUse: 'Adds campaign click counts and recipient engagement.' },
  { key: 'permanent_fail', label: 'Permanent failure', plain: 'Permanent failure', description: 'The address permanently failed.', websiteUse: 'Suppresses future marketing to that address.' },
  { key: 'temporary_fail', label: 'Temporary failure', plain: 'Temporary failure', description: 'Delivery failed temporarily.', websiteUse: 'Adds temporary failure counts without suppressing the user.' },
  { key: 'unsubscribed', label: 'Unsubscribes', plain: 'Unsubscribes', description: 'A recipient unsubscribed.', websiteUse: 'Turns off marketing subscription for that user.' },
  { key: 'complained', label: 'Spam complaints', plain: 'Spam complaints', description: 'A recipient marked email as spam.', websiteUse: 'Suppresses future marketing to protect deliverability.' }
];

const webhookPresets = [
  {
    id: 'all',
    name: 'All Events Hook',
    badge: 'Recommended',
    description: 'Best default for Nolan\'s Knives. Tracks delivery, engagement, failures, unsubscribes, and spam complaints in one place.',
    mailgunDescription: 'All events hook',
    events: ['accepted', 'delivered', 'opened', 'clicked', 'permanent_fail', 'temporary_fail', 'unsubscribed', 'complained']
  },
  {
    id: 'delivery',
    name: 'Delivery Health',
    badge: 'Deliverability',
    description: 'Use this if you only care whether emails are accepted, delivered, or failing.',
    mailgunDescription: 'Delivery health hook',
    events: ['accepted', 'delivered', 'permanent_fail', 'temporary_fail']
  },
  {
    id: 'engagement',
    name: 'Campaign Engagement',
    badge: 'Marketing',
    description: 'Use this to track opens and clicks for email campaigns and template performance.',
    mailgunDescription: 'Campaign engagement hook',
    events: ['opened', 'clicked']
  },
  {
    id: 'suppression',
    name: 'Suppression Safety',
    badge: 'Compliance',
    description: 'Use this to keep unsubscribes, complaints, and permanent failures out of future marketing sends.',
    mailgunDescription: 'Suppression safety hook',
    events: ['permanent_fail', 'unsubscribed', 'complained']
  }
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

function formatObjectLink(event = {}) {
  if (event.requestId) return `Request ${event.requestId.length > 8 ? `#${event.requestId.slice(-6).toUpperCase()}` : event.requestId}`;
  if (event.orderId) return `Order ${event.orderId.length > 8 ? `#${event.orderId.slice(-6).toUpperCase()}` : event.orderId}`;
  if (event.knifeId) return `Product ${event.knifeId.length > 8 ? `#${event.knifeId.slice(-6).toUpperCase()}` : event.knifeId}`;
  if (event.objectType && event.objectId) return `${event.objectType.replace(/_/g, ' ')} ${event.objectId}`;
  return '-';
}

function normalizeEvents(events = []) {
  const byKey = fallbackEvents.reduce((acc, event) => ({ ...acc, [event.key]: event }), {});
  return events.map((event) => ({ ...byKey[event.key], ...event, plain: event.plain || event.label })).filter((event) => event.key);
}

export default function MailgunWebhooks() {
  const [status, setStatus] = useState(null);
  const [recentEvents, setRecentEvents] = useState([]);
  const [selectedPresetId, setSelectedPresetId] = useState('all');
  const [testResult, setTestResult] = useState(null);
  const [testingReceiver, setTestingReceiver] = useState(false);
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

  const events = normalizeEvents(status?.events?.length ? status.events : fallbackEvents);
  const counts = status?.status?.counts || {};
  const latest = status?.status?.latest || null;
  const webhookUrl = status?.webhookUrl || '';
  const selectedPreset = webhookPresets.find((preset) => preset.id === selectedPresetId) || webhookPresets[0];
  const selectedEventSet = new Set(selectedPreset.events);
  const selectedEvents = events.filter((event) => selectedEventSet.has(event.key));

  const eventColumns = useMemo(() => {
    const midpoint = Math.ceil(events.length / 2);
    return [events.slice(0, midpoint), events.slice(midpoint)];
  }, [events]);

  const setupSummary = useMemo(() => [
    `Description: ${selectedPreset.mailgunDescription}`,
    `HTTP post URL: ${webhookUrl}`,
    `Domain: ${status?.domain || 'nolansknives.com'}`,
    `Events: ${selectedEvents.map((event) => event.plain || event.label).join(', ')}`
  ].join('\n'), [selectedPreset, selectedEvents, status?.domain, webhookUrl]);

  const copyText = async (value, successMessage) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      showToast(successMessage, 'success');
    } catch (_err) {
      showToast('Could not copy to clipboard.', 'error');
    }
  };

  const testReceiver = async () => {
    if (!webhookUrl) return;
    try {
      setTestingReceiver(true);
      setTestResult(null);
      const response = await fetch(webhookUrl);
      if (!response.ok) throw new Error(`Receiver returned ${response.status}`);
      const result = await response.json();
      setTestResult({ ok: true, message: result?.ok ? 'Receiver is reachable.' : 'Receiver responded.' });
      showToast('Webhook receiver is reachable.', 'success');
    } catch (err) {
      const message = err?.message || 'Webhook receiver test failed.';
      setTestResult({ ok: false, message });
      showToast(message, 'error');
    } finally {
      setTestingReceiver(false);
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

      <section className="webhook-panel webhook-guide-panel">
        <div className="webhook-panel-header">
          <div>
            <h2>Choose What Mailgun Should Send Here</h2>
          </div>
          <span className={`status-badge status-${status?.signingConfigured ? 'active' : 'warning'}`}>
            {status?.signingConfigured ? 'Signature verified' : 'Signing key missing'}
          </span>
        </div>

        <div className="webhook-explainer">
          <LucideIcon name="Info" size={18} />
          <p>The HTTP post URL is the receiver. Mailgun posts event data to that URL, then this website reads the event type and updates delivery counts, campaign history, user suppression, opens, clicks, and recent activity.</p>
        </div>

        <div className="webhook-preset-grid">
          {webhookPresets.map((preset) => (
            <button
              type="button"
              key={preset.id}
              className={`webhook-preset-card ${selectedPreset.id === preset.id ? 'active' : ''}`}
              onClick={() => {
                setSelectedPresetId(preset.id);
                setTestResult(null);
              }}
            >
              <span>{preset.badge}</span>
              <strong>{preset.name}</strong>
              <small>{preset.description}</small>
            </button>
          ))}
        </div>
      </section>

      <div className="webhook-setup-grid">
        <section className="webhook-panel webhook-builder-panel">
          <div className="webhook-panel-header">
            <div>
              <h2>{selectedPreset.name}</h2>
            </div>
            <button type="button" className="action-btn secondary" onClick={() => copyText(setupSummary, 'Setup copied.')}>
              <LucideIcon name="ClipboardCopy" size={15} /> Copy Setup
            </button>
          </div>

          <div className="webhook-step-list">
            <article className="webhook-step-card">
              <div className="webhook-step-number">1</div>
              <div>
                <h3>Description</h3>
                <p>Paste this into Mailgun's Description field.</p>
                <div className="copy-input-row">
                  <input className="input-field" value={selectedPreset.mailgunDescription} readOnly />
                  <button type="button" className="action-btn secondary" onClick={() => copyText(selectedPreset.mailgunDescription, 'Description copied.')}>
                    <LucideIcon name="Copy" size={15} /> Copy
                  </button>
                </div>
              </div>
            </article>

            <article className="webhook-step-card">
              <div className="webhook-step-number">2</div>
              <div>
                <h3>HTTP post URL</h3>
                <p>This is what goes in the Mailgun HTTP post URL field.</p>
                <div className="copy-input-row">
                  <input className="input-field webhook-url-input" value={webhookUrl} readOnly />
                  <button type="button" className="action-btn" onClick={() => copyText(webhookUrl, 'Webhook URL copied.')}>
                    <LucideIcon name="Copy" size={15} /> Copy
                  </button>
                </div>
                <div className="webhook-url-actions">
                  <button type="button" className="action-btn secondary" onClick={testReceiver} disabled={testingReceiver || !webhookUrl}>
                    <LucideIcon name="RadioTower" size={15} /> {testingReceiver ? 'Testing...' : 'Test Receiver'}
                  </button>
                  {testResult && (
                    <span className={`webhook-test-result ${testResult.ok ? 'ok' : 'bad'}`}>
                      {testResult.message}
                    </span>
                  )}
                </div>
              </div>
            </article>

            <article className="webhook-step-card">
              <div className="webhook-step-number">3</div>
              <div>
                <h3>Events</h3>
                <p>Check these event boxes in Mailgun for this setup.</p>
                <div className="webhook-selected-events">
                  {selectedEvents.map((event) => (
                    <span key={event.key}><LucideIcon name="Check" size={13} /> {event.label}</span>
                  ))}
                </div>
              </div>
            </article>

            <article className="webhook-step-card">
              <div className="webhook-step-number">4</div>
              <div>
                <h3>Domain</h3>
                <p>Apply the webhook to this Mailgun domain.</p>
                <input className="input-field" value={status?.domain || 'nolansknives.com'} readOnly />
              </div>
            </article>
          </div>
        </section>

        <section className="webhook-panel webhook-mailgun-preview">
          <div className="webhook-panel-header">
            <div>
              <h2>What To Select</h2>
            </div>
          </div>

          <div className="webhook-events-box">
            <strong>Events</strong>
            <label className="webhook-check select-all">
              <input type="checkbox" checked={selectedPreset.events.length === events.length} readOnly />
              Select all
            </label>
            <div className="webhook-event-columns">
              {eventColumns.map((column, columnIndex) => (
                <div key={columnIndex}>
                  {column.map((event) => (
                    <label className={`webhook-check ${selectedEventSet.has(event.key) ? 'checked' : 'muted'}`} key={event.key}>
                      <input type="checkbox" checked={selectedEventSet.has(event.key)} readOnly />
                      {event.label}
                    </label>
                  ))}
                </div>
              ))}
            </div>
          </div>

          <div className="webhook-event-meaning-list">
            {selectedEvents.map((event) => (
              <article key={event.key}>
                <strong>{event.label}</strong>
                <p>{event.description}</p>
                <small>{event.websiteUse}</small>
              </article>
            ))}
          </div>
        </section>
      </div>

      <div className="webhook-setup-grid">
        <section className="webhook-panel webhook-how-it-works">
          <div className="webhook-panel-header">
            <div>
              <h2>What Happens After Mailgun Posts</h2>
            </div>
          </div>
          <div className="webhook-outcome-grid">
            <article>
              <LucideIcon name="BarChart3" size={18} />
              <strong>Campaign stats update</strong>
              <p>Opens, clicks, delivered messages, and failures roll into campaign history.</p>
            </article>
            <article>
              <LucideIcon name="ShieldAlert" size={18} />
              <strong>Bad addresses get protected</strong>
              <p>Permanent failures, unsubscribes, and spam complaints suppress future marketing sends.</p>
            </article>
            <article>
              <LucideIcon name="Activity" size={18} />
              <strong>Business records get context</strong>
              <p>Quote, payment, order, and product emails can write opens and clicks back onto the matching record.</p>
            </article>
          </div>
        </section>

        <section className="webhook-panel">
          <div className="webhook-panel-header">
            <div>
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

          <div className="webhook-security-note">
            <LucideIcon name={status?.signingConfigured ? 'ShieldCheck' : 'ShieldAlert'} size={18} />
            <p>{status?.signingConfigured ? 'Webhook signatures are being verified before events are recorded.' : 'Events can be received, but signature verification needs the Mailgun signing key configured in Firebase.'}</p>
          </div>
        </section>
      </div>

      <section className="webhook-panel webhook-walkthrough-panel">
        <div className="webhook-panel-header">
          <div>
            <h2>Adding It In Mailgun</h2>
          </div>
        </div>

        <div className="webhook-walkthrough-grid">
          {[
            ['Open Mailgun', 'Go to Sending > Webhooks for the domain.'],
            ['Create domain-level webhook', 'Choose the domain-level webhook option from the screen you showed.'],
            ['Paste the fields', 'Use the Description, HTTP post URL, selected Events, and Domain shown above.'],
            ['Test and save', 'Click Mailgun Test, then Create webhook. Come back here and refresh to see the event.']
          ].map(([title, copy], index) => (
            <article key={title}>
              <span>{index + 1}</span>
              <strong>{title}</strong>
              <p>{copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="webhook-panel webhook-events-table-panel">
        <div className="webhook-panel-header">
          <div>
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
                <th>Object</th>
                <th>Campaign</th>
                <th>Tags</th>
                <th>Signature</th>
                <th>Received</th>
              </tr>
            </thead>
            <tbody>
              {recentEvents.length === 0 && <tr><td colSpan={8} className="table-empty">No Mailgun events received yet.</td></tr>}
              {recentEvents.map((event) => (
                <tr key={event.eventKey}>
                  <td>
                    <span className={`status-badge status-${event.severity === 'permanent' || event.event === 'complained' ? 'blocked' : 'active'}`}>
                      {eventLabel(event.event)}{event.severity ? ` ${event.severity}` : ''}
                    </span>
                  </td>
                  <td className="table-email">{event.recipient || '-'}</td>
                  <td>{event.subject || '-'}</td>
                  <td className="webhook-object-cell">{formatObjectLink(event)}</td>
                  <td>{event.campaignName || event.campaignId || event.templateName || '-'}</td>
                  <td>
                    <div className="webhook-tag-list">
                      {(event.tags || []).slice(0, 4).map((tag) => <span key={tag}>{tag}</span>)}
                      {(event.tags || []).length > 4 && <em>+{event.tags.length - 4}</em>}
                      {(!event.tags || event.tags.length === 0) && <small>-</small>}
                    </div>
                  </td>
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
