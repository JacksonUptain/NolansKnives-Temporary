import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { showToast } from "../components/Toast";

export default function VerifyEmailPage() {
  const { resendVerification, refreshTokenClaims, signOutUser } = useAuth();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const navigate = useNavigate();

  const resend = async () => {
    setMessage("");
    setError("");
    setResending(true);
    try {
      await resendVerification();
      setMessage("Verification email sent.");
      showToast("Verification email sent.", "success");
    } catch (err) {
      const message = err.message || "Could not send verification email.";
      setError(message);
      showToast(message, "error");
    } finally {
      setResending(false);
    }
  };

  const recheck = async () => {
    setLoading(true);
    try {
      await refreshTokenClaims();
      showToast("Email checked. Continuing to your knives.", "success");
      navigate("/my-knives", { replace: true });
    } catch (err) {
      const message = err.message || "Could not check verification yet.";
      setError(message);
      showToast(message, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleSwitchAccount = async () => {
    await signOutUser();
    showToast("Signed out.", "success");
  };

  return (
    <div className="account-page">
      <div className="account-card">
        <h1>Verify Your Email</h1>
        <p>Verify your email address before continuing checkout.</p>
        {!!message && <p className="account-inline account-ok">{message}</p>}
        {!!error && <p className="account-inline account-error">{error}</p>}
        <button type="button" className="btn btn-warning w-100 mb-2" onClick={resend} disabled={resending}>
          {resending ? "Sending..." : message ? "Resend Verification Email" : "Send Verification Email"}
        </button>
        <button type="button" className="btn btn-outline-light w-100 mb-2" onClick={recheck} disabled={loading}>
          {loading ? "Checking..." : "I've Verified My Email"}
        </button>
        <button type="button" className="btn btn-link text-warning w-100" onClick={handleSwitchAccount}>Sign Out and Switch Account</button>
      </div>
    </div>
  );
}
