import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ref, onValue, update, serverTimestamp } from 'firebase/database';
import { db } from './firebase';
import { emailService } from '../services/emailService';
import { customRequestService } from '../services/customRequestService';
import { showToast } from '../components/Toast';
import LucideIcon from '../components/ui/LucideIcon';
import './CustomRequestDashboard.css';

const REQUEST_STATUSES = [
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

function toMoneyNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === '') return fallback;
  const amount = Number(value);
  return Number.isFinite(amount) ? Number(amount.toFixed(2)) : fallback;
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

function getDepositPaid(request = {}) {
  if (!(request.priorityDepositPaid || request.paymentStatus === 'paid' || request.depositPaidAt)) return 0;
  return toMoneyNumber(
    request.payments?.deposit?.amount ||
      request.payments?.deposit?.paidAmount ||
      request.depositPaid ||
      request.depositAmount,
    0
  );
}

function calculateFinalPaymentTotal(draft = {}) {
  return Math.max(
    toMoneyNumber(draft.remainingBalance) +
      toMoneyNumber(draft.shippingAmount) +
      toMoneyNumber(draft.taxAmount) +
      toMoneyNumber(draft.adjustmentAmount),
    0
  );
}

export default function CustomRequestDetail() {
  const navigate = useNavigate();
  const { requestId } = useParams();
  const [request, setRequest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [quoteDraft, setQuoteDraft] = useState({ finalPrice: '', depositAmount: '', notes: '' });
  const [finalPaymentDraft, setFinalPaymentDraft] = useState({ remainingBalance: '', shippingAmount: '', taxAmount: '', adjustmentAmount: '', note: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!requestId) return;
    const refPath = ref(db, `customRequests/${requestId}`);
    const unsubscribe = onValue(refPath, (snapshot) => {
      const value = snapshot.val();
      setRequest(value ? { id: requestId, ...value } : null);
      setStatus(value?.status || '');
      setLoading(false);
      setError('');
    }, (err) => {
      setError(err?.message || 'Failed to load request');
      setLoading(false);
    });
    return () => unsubscribe();
  }, [requestId]);

  useEffect(() => {
    if (!request) return;
    const estimatedPrice = Number(request.finalPrice || request.estimatedPrice || 0);
    setQuoteDraft({
      finalPrice: request.finalPrice ? String(request.finalPrice) : (estimatedPrice ? estimatedPrice.toFixed(2) : ''),
      depositAmount: request.depositAmount ? String(request.depositAmount) : (estimatedPrice ? (estimatedPrice * 0.15).toFixed(2) : ''),
      notes: request.quoteNotes || ''
    });

    const payment = request.payments?.final || {};
    const finalPrice = toMoneyNumber(request.finalPrice || request.quotedPrice, 0);
    const depositPaid = getDepositPaid(request);
    const defaultRemaining = Math.max(finalPrice - depositPaid, 0);
    setFinalPaymentDraft({
      remainingBalance: request.remainingBalance ? String(request.remainingBalance) : String(payment.remainingBalance ?? request.remainingBalance ?? defaultRemaining),
      shippingAmount: payment.shippingAmount ? String(payment.shippingAmount) : (request.shippingAmount ? String(request.shippingAmount) : '0'),
      taxAmount: payment.taxAmount ? String(payment.taxAmount) : (request.taxAmount ? String(request.taxAmount) : '0'),
      adjustmentAmount: payment.adjustmentAmount ? String(payment.adjustmentAmount) : (request.adjustmentAmount ? String(request.adjustmentAmount) : '0'),
      note: payment.note ?? request.finalPaymentNote ?? ''
    });
  }, [request]);

  const updateStatus = async () => {
    if (!request?.id || !status || status === request.status) return;
    try {
      setSaving(true);
      await update(ref(db, `customRequests/${request.id}`), { status, updatedAt: serverTimestamp() });
      showToast('Status updated.', 'success');
    } catch (err) {
      showToast(err?.message || 'Failed to update status', 'error');
    } finally {
      setSaving(false);
    }
  };

  const sendQuote = async () => {
    if (!request?.id) return;
    const finalPrice = Number(quoteDraft.finalPrice);
    const depositAmount = Number(quoteDraft.depositAmount);
    if (!Number.isFinite(finalPrice) || finalPrice <= 0) {
      showToast('Enter a valid quote total.', 'error');
      return;
    }
    try {
      setSaving(true);
      await update(ref(db, `customRequests/${request.id}`), {
        finalPrice,
        depositAmount: Number.isFinite(depositAmount) ? depositAmount : Number((finalPrice * 0.15).toFixed(2)),
        quoteNotes: quoteDraft.notes,
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
        showToast(hasQuoteBeenSent(request) ? 'Quote updated and resent.' : 'Quote sent.', 'success');
      } else {
        showToast('Quote saved but the email failed to send.', 'warning');
      }
    } catch (err) {
      showToast(err?.message || 'Failed to send quote', 'error');
    } finally {
      setSaving(false);
    }
  };

  const requestFinalPayment = async () => {
    if (!request?.id) return;
    const finalPrice = toMoneyNumber(request.finalPrice || request.quotedPrice, 0);
    if (!finalPrice) {
      showToast('Send a quote first.', 'error');
      return;
    }
    const draft = {
      remainingBalance: toMoneyNumber(finalPaymentDraft.remainingBalance),
      shippingAmount: toMoneyNumber(finalPaymentDraft.shippingAmount),
      taxAmount: toMoneyNumber(finalPaymentDraft.taxAmount),
      adjustmentAmount: toMoneyNumber(finalPaymentDraft.adjustmentAmount),
      note: finalPaymentDraft.note
    };
    const totalDue = calculateFinalPaymentTotal(draft);
    if (!totalDue) {
      showToast('Final payment total must be greater than zero.', 'error');
      return;
    }
    try {
      setSaving(true);
      await customRequestService.requestFinalPayment({
        requestId: request.id,
        remainingBalance: draft.remainingBalance,
        shippingAmount: draft.shippingAmount,
        taxAmount: draft.taxAmount,
        adjustmentAmount: draft.adjustmentAmount,
        note: draft.note
      });
      showToast('Final payment request sent.', 'success');
    } catch (err) {
      showToast(err?.message || 'Failed to request final payment', 'error');
    } finally {
      setSaving(false);
    }
  };

  const topSummary = useMemo(() => [
    ['Customer', request?.customerName || 'Customer'],
    ['Email', request?.customerEmail || 'No email'],
    ['Status', labelize(request?.status)],
    ['Submitted', formatDate(request?.createdAt)]
  ], [request]);

  if (loading) {
    return <div className="custom-request-dashboard"><div className="loading-shimmer">Loading request...</div></div>;
  }

  if (!request) {
    return (
      <div className="custom-request-dashboard">
        <div className="empty-state refined">
          <LucideIcon name="Wand2" size={42} />
          <h2>Request not found.</h2>
          <p>The requested custom request could not be loaded.</p>
          <button className="action-btn secondary" onClick={() => navigate('/business/custom-requests')}>Back to requests</button>
        </div>
      </div>
    );
  }

  return (
    <div className="custom-request-dashboard">
      {error ? <div className="detail-section-card" style={{ marginBottom: '1rem', color: '#b42318' }}>{error}</div> : null}
      <div className="workspace-hero">
        <div>
          <h1>{formatRequestId(request.id)}</h1>
          <p>{request.customerName || 'Customer'} · {request.customerEmail || 'No email'}</p>
        </div>
        <button className="action-btn secondary" onClick={() => navigate('/business/custom-requests')}>
          <LucideIcon name="ArrowLeft" size={15} /> Back
        </button>
      </div>

      <div className="detail-grid">
        <section className="detail-section-card">
          <h3>Quick summary</h3>
          <div className="request-spec-grid">
            {topSummary.map(([label, value]) => (
              <div key={label}><span>{label}</span><strong>{value}</strong></div>
            ))}
          </div>
          <div className="detail-inline-actions">
            <label className="detail-select">
              <span>Status</span>
              <select value={status || request.status || ''} onChange={(event) => setStatus(event.target.value)}>
                {REQUEST_STATUSES.map((option) => <option key={option} value={option}>{labelize(option)}</option>)}
              </select>
            </label>
            <button className="action-btn" onClick={updateStatus} disabled={saving || !status || status === request.status}>
              {saving ? 'Saving...' : 'Save status'}
            </button>
          </div>
        </section>

        <section className="detail-section-card">
          <h3>Build brief</h3>
          <div className="request-spec-grid">
            <div><span>Knife type</span><strong>{labelize(request.knifeType)}</strong></div>
            <div><span>Intended use</span><strong>{labelize(request.intendedUse)}</strong></div>
            <div><span>Blade style</span><strong>{labelize(request.bladeStyle)}</strong></div>
            <div><span>Blade size</span><strong>{labelize(request.bladeSizeCategory)}</strong></div>
            <div><span>Steel</span><strong>{labelize(request.steelType)}</strong></div>
            <div><span>Handle</span><strong>{labelize(request.handleMaterial)}</strong></div>
            <div><span>Finish</span><strong>{labelize(request.finish)}</strong></div>
            <div><span>Delivery</span><strong>{labelize(request.deliveryPreference)}</strong></div>
          </div>
          <p className="detail-copy">{request.additionalNotes || 'No additional notes included.'}</p>
          {request.engravingText && <p className="detail-copy"><strong>Engraving:</strong> {request.engravingText}</p>}
        </section>

        <section className="detail-section-card">
          <h3>Quote</h3>
          <div className="quote-grid">
            <label>
              <span>Final price</span>
              <input type="number" min="0" step="0.01" value={quoteDraft.finalPrice} onChange={(event) => setQuoteDraft((prev) => ({ ...prev, finalPrice: event.target.value }))} />
            </label>
            <label>
              <span>Deposit</span>
              <input type="number" min="0" step="0.01" value={quoteDraft.depositAmount} onChange={(event) => setQuoteDraft((prev) => ({ ...prev, depositAmount: event.target.value }))} />
            </label>
            <label className="quote-notes">
              <span>Notes</span>
              <textarea rows="3" value={quoteDraft.notes} onChange={(event) => setQuoteDraft((prev) => ({ ...prev, notes: event.target.value }))} />
            </label>
          </div>
          <button className="action-btn" onClick={sendQuote} disabled={saving || !request.customerEmail}>
            {saving ? 'Sending...' : hasQuoteBeenSent(request) ? 'Resend quote' : 'Send quote'}
          </button>
        </section>

        <section className="detail-section-card">
          <h3>Final payment</h3>
          <div className="quote-grid">
            <label>
              <span>Remaining balance</span>
              <input type="number" min="0" step="0.01" value={finalPaymentDraft.remainingBalance} onChange={(event) => setFinalPaymentDraft((prev) => ({ ...prev, remainingBalance: event.target.value }))} />
            </label>
            <label>
              <span>Shipping</span>
              <input type="number" min="0" step="0.01" value={finalPaymentDraft.shippingAmount} onChange={(event) => setFinalPaymentDraft((prev) => ({ ...prev, shippingAmount: event.target.value }))} />
            </label>
            <label>
              <span>Tax</span>
              <input type="number" min="0" step="0.01" value={finalPaymentDraft.taxAmount} onChange={(event) => setFinalPaymentDraft((prev) => ({ ...prev, taxAmount: event.target.value }))} />
            </label>
            <label>
              <span>Adjustment</span>
              <input type="number" min="0" step="0.01" value={finalPaymentDraft.adjustmentAmount} onChange={(event) => setFinalPaymentDraft((prev) => ({ ...prev, adjustmentAmount: event.target.value }))} />
            </label>
            <label className="quote-notes">
              <span>Note</span>
              <textarea rows="3" value={finalPaymentDraft.note} onChange={(event) => setFinalPaymentDraft((prev) => ({ ...prev, note: event.target.value }))} />
            </label>
          </div>
          <div className="final-payment-total">
            <span>Total due</span>
            <strong>{formatCurrency(calculateFinalPaymentTotal(finalPaymentDraft))}</strong>
          </div>
          <button className="action-btn" onClick={requestFinalPayment} disabled={saving || !request.customerEmail}>
            {saving ? 'Sending...' : 'Request final payment'}
          </button>
        </section>
      </div>
    </div>
  );
}
