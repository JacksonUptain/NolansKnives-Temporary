import React, { useEffect, useMemo, useState } from 'react';
import { db } from './firebase';
import { ref, onValue, update, serverTimestamp } from 'firebase/database';
import { emailService } from '../services/emailService';
import { showToast } from '../components/Toast';
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
  'completed',
  'shipped',
  'cancelled'
];

const NEXT_STATUSES = REQUEST_STATUSES.filter((status) => status !== 'all');

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

function hasQuoteBeenSent(request = {}) {
  return !!request.quoteSentAt || !!request.quoteSentTo;
}

function CustomRequestDashboard() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRequestId, setSelectedRequestId] = useState('');
  const [statusDrafts, setStatusDrafts] = useState({});
  const [quoteDrafts, setQuoteDrafts] = useState({});
  const [savingRequestId, setSavingRequestId] = useState('');
  const [savingAction, setSavingAction] = useState('');

  useEffect(() => {
    const requestsRef = ref(db, 'customRequests');
    const unsubscribe = onValue(requestsRef, (snapshot) => {
      const data = snapshot.val();
      const list = data
        ? Object.entries(data).map(([id, value]) => ({ id, ...value }))
        : [];

      list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      setRequests(list);
      setSelectedRequestId((current) => current || list[0]?.id || '');
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
      const matchesSearch = !normalizedSearch ||
        request.customerName?.toLowerCase().includes(normalizedSearch) ||
        request.customerEmail?.toLowerCase().includes(normalizedSearch) ||
        request.id?.toLowerCase().includes(normalizedSearch) ||
        request.knifeType?.toLowerCase().includes(normalizedSearch);
      const matchesFilter = filterStatus === 'all' || request.status === filterStatus;
      return matchesSearch && matchesFilter;
    });
  }, [requests, searchTerm, filterStatus]);

  const selectedRequest = filteredRequests.find((request) => request.id === selectedRequestId) || filteredRequests[0] || null;

  const stats = useMemo(() => ({
    awaitingReview: requests.filter((request) => ['priority_review', 'pending_review', 'needs_review', 'pending_payment'].includes(request.status)).length,
    unverified: requests.filter((request) => request.status === 'unpaid_unverified').length,
    quotes: requests.filter((request) => ['quote_sent', 'pending_acceptance'].includes(request.status)).length,
    active: requests.filter((request) => ['priority_review', 'quote_accepted', 'in_production'].includes(request.status)).length
  }), [requests]);

  const getQuoteDraft = (request) => {
    const draft = quoteDrafts[request.id] || {};
    const estimatedPrice = Number(request.finalPrice || request.estimatedPrice || 0);
    return {
      finalPrice: draft.finalPrice ?? (estimatedPrice ? estimatedPrice.toFixed(2) : ''),
      depositAmount: draft.depositAmount ?? (estimatedPrice ? (estimatedPrice * 0.15).toFixed(2) : ''),
      notes: draft.notes ?? ''
    };
  };

  const updateStatus = async (request, nextStatus) => {
    if (!request?.id) return;
    if (nextStatus === request.status) {
      showToast('No status change to save.', 'info');
      return;
    }

    try {
      setSavingAction('status');
      setSavingRequestId(request.id);
      await update(ref(db, `customRequests/${request.id}`), {
        status: nextStatus,
        updatedAt: serverTimestamp()
      });
      setStatusDrafts((prev) => {
        const next = { ...prev };
        delete next[request.id];
        return next;
      });
      showToast(`Request ${formatRequestId(request.id)} moved to ${labelize(nextStatus)}.`, 'success');
    } catch (err) {
      const message = err?.message || 'Failed to update request status';
      setError(message);
      showToast(message, 'error');
    } finally {
      setSavingRequestId('');
      setSavingAction('');
    }
  };

  const sendQuote = async (request) => {
    if (!request?.id) return;
    const draft = getQuoteDraft(request);
    const finalPrice = Number(draft.finalPrice);
    const depositAmount = Number(draft.depositAmount);
    const resending = hasQuoteBeenSent(request);

    if (!Number.isFinite(finalPrice) || finalPrice <= 0) {
      showToast('Enter a valid final price before sending a quote.', 'error');
      return;
    }

    try {
      setSavingAction('quote');
      setSavingRequestId(request.id);
      await update(ref(db, `customRequests/${request.id}`), {
        finalPrice,
        depositAmount: Number.isFinite(depositAmount) ? depositAmount : Number((finalPrice * 0.15).toFixed(2)),
        quoteNotes: draft.notes,
        updatedAt: serverTimestamp()
      });

      const emailResult = await emailService.sendQuote(
        request.id,
        request.uid,
        request.customerName || 'Customer',
        request.customerEmail,
        finalPrice,
        Number.isFinite(depositAmount) ? depositAmount : Number((finalPrice * 0.15).toFixed(2))
      );

      if (emailResult.success) {
        showToast(resending ? 'Quote updated and email resent.' : 'Quote saved and email sent.', 'success');
      } else {
        showToast(resending ? 'Quote updated, but the resend email failed.' : 'Quote saved, but the email failed to send.', 'warning');
      }
    } catch (err) {
      const message = err?.message || 'Failed to send quote';
      setError(message);
      showToast(message, 'error');
    } finally {
      setSavingRequestId('');
      setSavingAction('');
    }
  };

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
          <p className="workspace-eyebrow">Custom work</p>
          <h1>Custom Requests</h1>
          <p>Review customer build briefs, prepare quotes, and keep each request moving.</p>
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
          {REQUEST_STATUSES.map((status) => (
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
        <div className="request-workspace-layout">
          <div className="request-queue">
            {filteredRequests.map((request) => {
              const active = selectedRequest?.id === request.id;
              const statusDraft = statusDrafts[request.id] ?? request.status ?? 'pending_review';
              const statusDirty = statusDraft !== (request.status || 'pending_review');
              const isSavingStatus = savingRequestId === request.id && savingAction === 'status';

              return (
                <article
                  key={request.id}
                  className={`request-queue-card ${active ? 'active' : ''}`}
                  onClick={() => setSelectedRequestId(request.id)}
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

                  <div className="queue-status-editor" onClick={(event) => event.stopPropagation()}>
                    <select
                      value={statusDraft}
                      onChange={(event) => setStatusDrafts((prev) => ({ ...prev, [request.id]: event.target.value }))}
                    >
                      {NEXT_STATUSES.map((status) => <option key={status} value={status}>{labelize(status)}</option>)}
                    </select>
                    <button
                      className="action-btn"
                      disabled={!statusDirty || savingRequestId === request.id}
                      onClick={() => updateStatus(request, statusDraft)}
                    >
                      {isSavingStatus ? 'Saving...' : statusDirty ? 'Save change' : 'Saved'}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>

          <aside className="request-detail-panel">
            {selectedRequest ? (
              <>
                <div className="detail-panel-header">
                  <span>Selected request</span>
                  <h2>{formatRequestId(selectedRequest.id)}</h2>
                  <p>{selectedRequest.customerName || 'Customer'} · {selectedRequest.customerEmail || 'No email'}</p>
                </div>

                <div className="detail-info-grid">
                  <div><span>Status</span><strong>{labelize(selectedRequest.status)}</strong></div>
                  <div><span>Submitted</span><strong>{formatDate(selectedRequest.createdAt)}</strong></div>
                  <div><span>Estimate</span><strong>{formatCurrency(selectedRequest.estimatedPrice)}</strong></div>
                  <div><span>Deposit</span><strong>{selectedRequest.depositAmount ? formatCurrency(selectedRequest.depositAmount) : 'Not paid'}</strong></div>
                  <div><span>Delivery</span><strong>{labelize(selectedRequest.deliveryPreference)}</strong></div>
                  <div><span>Desired date</span><strong>{selectedRequest.desiredCompletionDate || 'Flexible'}</strong></div>
                </div>

                <section className="detail-section-card">
                  <h3>Build Brief</h3>
                  <div className="request-spec-grid">
                    <div><span>Type</span><strong>{labelize(selectedRequest.knifeType)}</strong></div>
                    <div><span>Use</span><strong>{labelize(selectedRequest.intendedUse)}</strong></div>
                    <div><span>Blade</span><strong>{labelize(selectedRequest.bladeStyle)}</strong></div>
                    <div><span>Size</span><strong>{labelize(selectedRequest.bladeSizeCategory)}</strong></div>
                    <div><span>Steel</span><strong>{labelize(selectedRequest.steelType)}</strong></div>
                    <div><span>Handle</span><strong>{labelize(selectedRequest.handleMaterial)}</strong></div>
                    <div><span>Handle style</span><strong>{labelize(selectedRequest.handleStyle)}</strong></div>
                    <div><span>Finish</span><strong>{labelize(selectedRequest.finish)}</strong></div>
                  </div>
                </section>

                <section className="detail-section-card">
                  <h3>Customer Notes</h3>
                  <p>{selectedRequest.additionalNotes || 'No additional notes included.'}</p>
                  {selectedRequest.engravingText && <p><strong>Engraving:</strong> "{selectedRequest.engravingText}"</p>}
                  {selectedRequest.sheathRequested && <p><strong>Sheath:</strong> Custom sheath requested</p>}
                </section>

                <section className="detail-section-card quote-panel">
                  <div className="quote-panel-heading">
                    <h3>Quote</h3>
                    {hasQuoteBeenSent(selectedRequest) && (
                      <span className="quote-sent-pill">
                        Sent {selectedRequest.quoteSentAt ? formatDate(selectedRequest.quoteSentAt) : ''}
                      </span>
                    )}
                  </div>
                  <div className="quote-grid">
                    <label>
                      <span>Final price</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={getQuoteDraft(selectedRequest).finalPrice}
                        onChange={(event) => setQuoteDrafts((prev) => ({
                          ...prev,
                          [selectedRequest.id]: { ...getQuoteDraft(selectedRequest), finalPrice: event.target.value }
                        }))}
                      />
                    </label>
                    <label>
                      <span>Deposit</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={getQuoteDraft(selectedRequest).depositAmount}
                        onChange={(event) => setQuoteDrafts((prev) => ({
                          ...prev,
                          [selectedRequest.id]: { ...getQuoteDraft(selectedRequest), depositAmount: event.target.value }
                        }))}
                      />
                    </label>
                    <label className="quote-notes">
                      <span>Internal quote notes</span>
                      <textarea
                        rows="3"
                        value={getQuoteDraft(selectedRequest).notes}
                        onChange={(event) => setQuoteDrafts((prev) => ({
                          ...prev,
                          [selectedRequest.id]: { ...getQuoteDraft(selectedRequest), notes: event.target.value }
                        }))}
                        placeholder="Material assumptions, timeline, or follow-up details."
                      />
                    </label>
                  </div>
                  <button
                    className="action-btn"
                    disabled={savingRequestId === selectedRequest.id || !selectedRequest.customerEmail}
                    onClick={() => sendQuote(selectedRequest)}
                  >
                    <LucideIcon name={hasQuoteBeenSent(selectedRequest) ? 'RefreshCw' : 'Send'} size={15} />
                    {savingRequestId === selectedRequest.id && savingAction === 'quote'
                      ? hasQuoteBeenSent(selectedRequest) ? 'Resending...' : 'Sending...'
                      : hasQuoteBeenSent(selectedRequest) ? 'Resend Quote Email' : 'Send Quote Email'}
                  </button>
                </section>
              </>
            ) : (
              <div className="empty-state refined">
                <h2>Select a request</h2>
                <p>Choose a request to review the build brief and quote details.</p>
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}

export default CustomRequestDashboard;
