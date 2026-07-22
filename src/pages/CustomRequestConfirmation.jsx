import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { get, ref } from 'firebase/database';
import LucideIcon from '../components/ui/LucideIcon';
import { useAuth } from '../auth/AuthProvider';
import { db } from './firebase';
import { customRequestService } from '../services/customRequestService';
import { showToast } from '../components/Toast';
import './CustomKnifeRequest.css';

function formatRequestId(requestId) {
  if (!requestId) return 'Pending';
  return requestId.length > 8 ? `#${requestId.slice(-6).toUpperCase()}` : `#${requestId.toUpperCase()}`;
}

function firstPositiveNumber(...values) {
  for (const value of values) {
    const amount = Number(value);
    if (Number.isFinite(amount) && amount > 0) return amount;
  }
  return 0;
}

function hasDepositPayment(requestRecord) {
  return !!requestRecord?.priorityDepositPaid || requestRecord?.paymentStatus === 'paid' || !!requestRecord?.depositPaidAt;
}

export default function CustomRequestConfirmation() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, initializing } = useAuth();
  const { requestId } = useParams();
  const [searchParams] = useSearchParams();
  const [requestRecord, setRequestRecord] = useState(null);
  const paypalRef = useRef(null);
  const [paymentError, setPaymentError] = useState('');
  const [depositJustPaid, setDepositJustPaid] = useState(false);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const depositLinkRequested = searchParams.get('deposit') === '1';
  const estimatedPrice = Number(location.state?.estimatedPrice || requestRecord?.finalPrice || requestRecord?.estimatedPrice || 0);
  const depositAmount = firstPositiveNumber(
    location.state?.depositAmount,
    requestRecord?.depositRequired,
    requestRecord?.depositAmount,
    requestRecord?.finalPrice ? Number(requestRecord.finalPrice) * 0.15 : 0
  );
  const depositPaid = hasDepositPayment(requestRecord);
  const depositRequested = Boolean(
    location.state?.depositRequested ||
    (requestRecord && !depositPaid && depositAmount > 0 && (
      depositLinkRequested ||
      requestRecord.status === 'pending_payment'
    ))
  );
  const paymentComplete = depositPaid || depositJustPaid;
  const confirmationComplete = paymentComplete || !depositRequested;

  useEffect(() => {
    let active = true;
    setDepositJustPaid(false);

    get(ref(db, `customRequests/${requestId}`)).then((snapshot) => {
      if (active && snapshot.exists()) {
        setRequestRecord(snapshot.val());
      }
    }).catch(() => {});

    return () => {
      active = false;
    };
  }, [requestId]);

  useEffect(() => {
    if (!depositRequested || paymentComplete || !paypalRef.current || !user) return undefined;

    if (!window.paypal?.Buttons) {
      setPaymentError('PayPal is still loading. Refresh the page if the payment button does not appear.');
      return undefined;
    }

    paypalRef.current.innerHTML = '';
    const buttons = window.paypal.Buttons({
      style: { layout: 'vertical', color: 'gold', shape: 'pill', label: 'pay', height: 42 },
      createOrder: async () => {
        setPaymentLoading(true);
        setPaymentError('');
        try {
          const response = await customRequestService.createDepositPayPalOrder(requestId);
          return response.paypalOrderId;
        } catch (error) {
          const message = error.message || 'Could not start the deposit payment.';
          setPaymentError(message);
          showToast(message, 'error');
          throw error;
        } finally {
          setPaymentLoading(false);
        }
      },
      onApprove: async (data) => {
        setPaymentLoading(true);
        setPaymentError('');
        try {
          await customRequestService.captureDepositPayPalOrder({
            requestId,
            paypalOrderId: data.orderID
          });
          setDepositJustPaid(true);
          showToast('Deposit received. Your request is now in Your Knives.', 'success');
        } catch (error) {
          const message = error.message || 'Could not confirm the deposit payment.';
          setPaymentError(message);
          showToast(message, 'error');
        } finally {
          setPaymentLoading(false);
        }
      },
      onError: (error) => {
        const message = error?.message || 'PayPal payment error.';
        setPaymentError(message);
        showToast(message, 'error');
        setPaymentLoading(false);
      }
    });

    buttons.render(paypalRef.current);

    return () => {
      try {
        buttons.close();
      } catch {}
    };
  }, [depositRequested, paymentComplete, requestId, user]);

  const handleSignInForDeposit = () => {
    showToast('Sign in to pay your deposit.', 'info');
    navigate('/account', { state: { from: location.pathname + location.search } });
  };

  return (
    <div className="custom-request-confirmation">
      <section className="confirmation-card" aria-labelledby="custom-request-confirmation-title">
        <span className="confirmation-icon" aria-hidden="true">
          <LucideIcon name={confirmationComplete ? 'Check' : 'CreditCard'} size={28} />
        </span>

        <div>
            <h1 id="custom-request-confirmation-title">
              {depositRequested && !paymentComplete ? 'Place Priority Deposit' : 'Request Received'}
            </h1>
            <p>
              {depositRequested
                ? 'Pay the 15% deposit to move forward with this custom request.'
                : 'Your request has been sent. Nolan will review it when his schedule allows and follow up if the build is a fit.'}
            </p>
        </div>

        <div className="confirmation-meta">
          <div>
            <span>Request</span>
            <strong>{formatRequestId(requestId)}</strong>
          </div>
          <div>
            <span>{requestRecord?.finalPrice ? 'Quote' : 'Estimate'}</span>
            <strong>{estimatedPrice ? `$${estimatedPrice.toFixed(2)}` : 'To review'}</strong>
          </div>
          <div>
            <span>{depositRequested ? 'Deposit' : 'Next step'}</span>
            <strong>{depositRequested && depositAmount ? `$${depositAmount.toFixed(2)}` : 'Nolan will review'}</strong>
          </div>
        </div>

        {depositRequested && !paymentComplete && (
          <div className="deposit-payment-panel">
            <h2>Priority review deposit</h2>
            <p>
              Nolan will review your request and send a final quote. If it is not the right fit,
              the priority deposit can be refunded.
            </p>
            {!user ? (
              <div className="deposit-signin-panel">
                <p>{initializing ? 'Checking your account...' : 'Sign in to pay this deposit securely.'}</p>
                {!initializing && (
                  <button type="button" onClick={handleSignInForDeposit}>
                    Sign in to pay deposit
                  </button>
                )}
              </div>
            ) : (
              <>
                {paymentError && <div className="alert-error">{paymentError}</div>}
                <div ref={paypalRef} className="paypal-deposit-buttons" />
                {paymentLoading && <p className="loading-text">Processing payment...</p>}
              </>
            )}
          </div>
        )}

        {confirmationComplete && (
          <p>
            {depositRequested
              ? 'Deposit received. Your request is with Nolan, and messages are available in Your Knives.'
              : 'Your request is in Nolan\'s queue. If he is able to take it on, the next step will appear in Your Knives.'}
          </p>
        )}

        <div className="confirmation-actions">
          <button type="button" className="primary" onClick={() => navigate('/my-knives')}>
            View Your Knives
          </button>
          <button type="button" className="secondary" onClick={() => navigate('/Store')}>
            Browse store
          </button>
        </div>
      </section>
    </div>
  );
}
