import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { showToast } from "../components/Toast";
import LucideIcon from "../components/ui/LucideIcon";
import "./MyAccount.css";

export default function MyAccount() {
  const navigate = useNavigate();
  const { user, profile, updateMyProfile, signOutUser } = useAuth();
  const [form, setForm] = useState({ displayName: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (profile) {
      setForm({ displayName: profile.displayName || "" });
    }
  }, [profile]);

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (form.displayName.trim().length === 0) {
        showToast("Display name cannot be empty.", "error");
        return;
      }

      await updateMyProfile({
        displayName: form.displayName.trim()
      });
      showToast("Profile updated successfully.", "success");
    } catch (err) {
      const msg = err.message || "Failed to update profile";
      setError(msg);
      showToast(msg, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOutUser();
      showToast("Signed out successfully.", "success");
      navigate("/", { replace: true });
    } catch (err) {
      const msg = "Failed to sign out";
      setError(msg);
      showToast(msg, "error");
    }
  };

  if (!user) {
    return (
      <div className="my-account-page">
        <div className="my-account-container">
          <div className="empty-state">
            <h2>Authentication Required</h2>
            <p>Please sign in to view your account.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="my-account-page">
      <div className="my-account-container">
        <div className="account-header">
          <h1>My Account</h1>
          <p className="header-subtitle">Manage your profile and purchases.</p>
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        <div className="account-layout">
          <div className="account-main">
            {/* Profile Information */}
            <div className="info-card">
              <div className="card-header">
                <h2>Profile Information</h2>
              </div>
              <div className="card-content">
                <div className="info-detail">
                  <label>Email Address</label>
                  <p className="info-value">{user.email}</p>
                  <small className="info-hint">Email address cannot be changed</small>
                </div>

                <form onSubmit={handleUpdate}>
                  <div className="form-group">
                    <label htmlFor="displayName">Display Name</label>
                    <input
                      id="displayName"
                      name="displayName"
                      type="text"
                      className="form-control"
                      value={form.displayName}
                      onChange={handleChange}
                      required
                      placeholder="Your name"
                    />
                  </div>

                  <button type="submit" className="btn btn-primary" disabled={loading}>
                    {loading ? "Saving..." : "Save Changes"}
                  </button>
                </form>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="info-card">
              <div className="card-header">
                <h2>Quick Actions</h2>
              </div>
              <div className="card-content">
                <div className="action-grid">
                  <button className="action-link" onClick={() => navigate("/my-knives")}>
                    <LucideIcon name="Package" size={22} className="action-icon" />
                    <span className="action-text">
                      <strong>My Knives</strong>
                      <span className="action-desc">Review purchases and custom requests</span>
                    </span>
                  </button>
                  <button className="action-link" onClick={() => navigate("/store")}>
                    <LucideIcon name="ShoppingCart" size={22} className="action-icon" />
                    <span className="action-text">
                      <strong>Browse Store</strong>
                      <span className="action-desc">Explore available knives</span>
                    </span>
                  </button>
                </div>
              </div>
            </div>

            {/* Danger Zone */}
            <div className="info-card danger-zone">
              <div className="card-header">
                <h2>Sign Out</h2>
              </div>
              <div className="card-content">
                <p className="danger-text">Sign out of your account on this device.</p>
                <button className="btn btn-outline" onClick={handleSignOut}>
                  Sign Out
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
