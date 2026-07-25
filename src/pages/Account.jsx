import React, { useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { readPurchaseIntent } from "../services/purchaseIntent";
import { showToast } from "../components/Toast";
import "./account.css";

export default function Account() {
  const [mode, setMode] = useState("signin");
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({ displayName: "", email: "", password: "", confirmPassword: "" });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const { signInEmail, registerEmail, continueWithGoogle, resetPassword, authErrorMessage, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const returnPath = useMemo(() => {
    const from = location.state?.from;
    const intent = readPurchaseIntent();
    if (from) return from;
    if (intent?.knifeId) return `/checkout/${intent.knifeId}`;
    return "/my-knives";
  }, [location.state]);

  const onChange = (event) => {
    setForm((prev) => ({ ...prev, [event.target.name]: event.target.value }));
  };

  const goAfterAuth = (firebaseUser) => {
    if (firebaseUser.providerData?.some((item) => item.providerId === "password") && !firebaseUser.emailVerified) {
      navigate("/account/verify-email", { replace: true });
      return;
    }
    navigate(returnPath, { replace: true });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);

    try {
      if (mode === "create") {
        if (form.password !== form.confirmPassword) {
          throw new Error("Passwords do not match.");
        }
        const created = await registerEmail({
          displayName: form.displayName.trim(),
          email: form.email.trim(),
          password: form.password
        });
        setMessage("Account created. Verify your email to continue checkout.");
        showToast("Account created. Check your email to verify it.", "success");
        goAfterAuth(created);
      } else {
        const signedIn = await signInEmail(form.email.trim(), form.password);
        showToast("Signed in.", "success");
        goAfterAuth(signedIn);
      }
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setError("");
    setLoading(true);
    try {
      const result = await continueWithGoogle();
      showToast("Signed in with Google.", "success");
      goAfterAuth(result);
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    if (!form.email) {
      setError("Enter your email first for password reset.");
      return;
    }
    setError("");
    setMessage("");
    try {
      await resetPassword(form.email.trim());
      setMessage("Password reset email sent.");
      showToast("Password reset email sent.", "success");
    } catch (err) {
      setError(authErrorMessage(err));
    }
  };

  return (
    <div className="account-page">
      <div className="account-card">
        <h1>{mode === "signin" ? "Sign In" : "Create Account"}</h1>

        {!!user && <p className="account-inline">Signed in as {user.email}</p>}
        {!!message && <p className="account-inline account-ok">{message}</p>}
        {!!error && <p className="account-inline account-error">{error}</p>}

        <button type="button" className="btn btn-warning w-100 mb-3" onClick={handleGoogle} disabled={loading}>
          Continue with Google
        </button>

        <form onSubmit={handleSubmit}>
          {mode === "create" && (
            <div className="mb-3">
              <label htmlFor="displayName">Display Name</label>
              <input id="displayName" name="displayName" className="form-control" value={form.displayName} onChange={onChange} required />
            </div>
          )}

          <div className="mb-3">
            <label htmlFor="email">Email Address</label>
            <input id="email" name="email" type="email" className="form-control" value={form.email} onChange={onChange} required />
          </div>

          <div className="mb-3">
            <label htmlFor="password">Password</label>
            <input id="password" name="password" type={showPassword ? "text" : "password"} className="form-control" value={form.password} onChange={onChange} required />
          </div>

          {mode === "create" && (
            <div className="mb-3">
              <label htmlFor="confirmPassword">Confirm Password</label>
              <input id="confirmPassword" name="confirmPassword" type={showPassword ? "text" : "password"} className="form-control" value={form.confirmPassword} onChange={onChange} required />
            </div>
          )}

          <div className="d-flex align-items-center justify-content-between mb-3">
            <button type="button" className="btn btn-sm btn-outline-light" onClick={() => setShowPassword((v) => !v)}>
              {showPassword ? "Hide Password" : "Show Password"}
            </button>
            {mode === "signin" && (
              <button type="button" className="btn btn-link text-warning p-0" onClick={handleReset}>
                Forgot password?
              </button>
            )}
          </div>

          <button type="submit" className="btn btn-warning w-100" disabled={loading}>
            {loading ? "Please wait..." : mode === "signin" ? "Sign In" : "Create Account"}
          </button>
        </form>

        <div className="account-footer-links">
          {mode === "signin" ? (
            <button type="button" onClick={() => setMode("create")}>Need an account? Create one</button>
          ) : (
            <button type="button" onClick={() => setMode("signin")}>Already have an account? Sign in</button>
          )}
          <Link to="/store">Return to Store</Link>
        </div>
      </div>
    </div>
  );
}
