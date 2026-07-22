import React, { useEffect, useMemo, useState } from "react";
import { ref, onValue, push, remove, serverTimestamp, set, update } from "firebase/database";
import { db } from "./firebase";
import {
  assignHistoricalPurchase,
  setUserBlocked,
  setUserRole
} from "../services/adminService";
import { showToast } from "../components/Toast";
import { showConfirm } from "../components/ConfirmDialog";
import "./AdminDashboard.css";

const ROLE_OPTIONS = ["customer", "business", "admin"];

export default function AdminDashboard() {
  const [users, setUsers] = useState([]);
  const [products, setProducts] = useState([]);
  const [homeCards, setHomeCards] = useState([]);
  const [orders, setOrders] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [roleDrafts, setRoleDrafts] = useState({});
  const [homeDrafts, setHomeDrafts] = useState({});
  const [savingUid, setSavingUid] = useState("");
  const [savingHomeId, setSavingHomeId] = useState("");

  const [historyForm, setHistoryForm] = useState({
    customerUid: "",
    customerEmail: "",
    knifeId: "",
    purchaseDate: ""
  });
  const [newHomeCard, setNewHomeCard] = useState({
    title: "",
    text: "",
    hrefText: "Learn More",
    href: "/Store",
    src: "",
    sortOrder: ""
  });

  useEffect(() => {
    let usersLoaded = false;
    let productsLoaded = false;
    let homeLoaded = false;
    let ordersLoaded = false;
    let logsLoaded = false;
    const loadingTimeout = window.setTimeout(() => {
      setLoading(false);
    }, 7000);

    const maybeDoneLoading = () => {
      if (usersLoaded && productsLoaded && homeLoaded && ordersLoaded && logsLoaded) {
        setLoading(false);
      }
    };

    const markError = (label, err) => {
      const message = err?.message || `Failed to load ${label.toLowerCase()}.`;
      setError((prev) => (prev ? `${prev}\n${message}` : message));
      setLoading(false);
    };

    const unsubUsers = onValue(ref(db, "users"), (snapshot) => {
      const list = snapshot.exists()
        ? Object.entries(snapshot.val()).map(([uid, value]) => ({ uid, ...value }))
        : [];
      list.sort((a, b) => (a.displayName || a.email || "").localeCompare(b.displayName || b.email || ""));
      setUsers(list);
      usersLoaded = true;
      maybeDoneLoading();
    }, (err) => markError("users", err));

    const unsubProducts = onValue(ref(db, "Products"), (snapshot) => {
      const list = snapshot.exists()
        ? Object.entries(snapshot.val()).map(([knifeId, value]) => ({ knifeId, ...value }))
        : [];
      list.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
      setProducts(list);
      productsLoaded = true;
      maybeDoneLoading();
    }, (err) => markError("products", err));

    const unsubHome = onValue(ref(db, "Home"), (snapshot) => {
      const list = snapshot.exists()
        ? Object.entries(snapshot.val()).map(([homeId, value]) => ({ homeId, ...value }))
        : [];

      list.sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0) || (a.title || "").localeCompare(b.title || ""));
      setHomeCards(list);
      homeLoaded = true;
      maybeDoneLoading();
    }, (err) => markError("home content", err));

    const unsubOrders = onValue(ref(db, "orders"), (snapshot) => {
      const list = snapshot.exists()
        ? Object.entries(snapshot.val()).map(([orderId, value]) => ({ orderId, ...value }))
        : [];
      setOrders(list);
      ordersLoaded = true;
      maybeDoneLoading();
    }, (err) => markError("orders", err));

    const unsubLogs = onValue(ref(db, "auditLogs"), (snapshot) => {
      const list = snapshot.exists()
        ? Object.entries(snapshot.val()).map(([logId, value]) => ({ logId, ...value }))
        : [];
      list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      setAuditLogs(list);
      logsLoaded = true;
      maybeDoneLoading();
    }, (err) => markError("audit logs", err));

    return () => {
      window.clearTimeout(loadingTimeout);
      unsubUsers();
      unsubProducts();
      unsubHome();
      unsubOrders();
      unsubLogs();
    };
  }, []);

  const stats = useMemo(() => {
    const availableKnives = products.filter((k) => !k.sold && k.saleStatus !== "reserved").length;
    const soldKnives = products.filter((k) => k.sold).length;
    const pendingOrders = orders.filter((o) => o.status === "pending").length;
    const paidOrders = orders.filter((o) => o.status === "paid" || o.status === "approved").length;
    const blockedUsers = users.filter((u) => u.status === "blocked").length;

    return {
      totalUsers: users.length,
      blockedUsers,
      availableKnives,
      soldKnives,
      pendingOrders,
      paidOrders
    };
  }, [users, products, orders]);

  const handleSaveRole = async (uid, currentRole, userEmail) => {
    const nextRole = roleDrafts[uid] || currentRole || "customer";
    if (nextRole === currentRole) {
      showToast("No role change made.", "info");
      return;
    }

    try {
      setError("");
      setSavingUid(uid);
      await setUserRole(uid, nextRole);
      setRoleDrafts(prev => {
        const next = {...prev};
        delete next[uid];
        return next;
      });
      showToast(`${userEmail || "User"} role updated to ${nextRole}.`, "success");
    } catch (e) {
      const msg = e?.message || "Failed to set role.";
      setError(msg);
      showToast(msg, "error");
    } finally {
      setSavingUid("");
    }
  };

  const handleToggleBlocked = async (uid, isBlocked, userEmail) => {
    const action = isBlocked ? "unblock" : "block";
    await showConfirm(
      `${action.charAt(0).toUpperCase() + action.slice(1)} User`,
      `Are you sure you want to ${action} ${userEmail || uid}? This action cannot be easily undone.`,
      async () => {
        try {
          setError("");
          setSavingUid(uid);
          await setUserBlocked(uid, !isBlocked);
          showToast(`User ${action}ed successfully.`, "success");
        } catch (e) {
          const msg = e?.message || `Failed to ${action} user.`;
          setError(msg);
          showToast(msg, "error");
        } finally {
          setSavingUid("");
        }
      }
    );
  };

  const handleCreateHomeCard = async (e) => {
    e.preventDefault();

    if (!newHomeCard.title.trim()) {
      showToast("Please enter a card title.", "error");
      return;
    }

    try {
      setError("");
      const homeRef = push(ref(db, "Home"));
      await set(homeRef, {
        title: newHomeCard.title.trim(),
        text: newHomeCard.text.trim(),
        hrefText: newHomeCard.hrefText.trim() || "Learn More",
        href: newHomeCard.href.trim() || "/Store",
        src: newHomeCard.src.trim(),
        sortOrder: Number(newHomeCard.sortOrder || 0),
        updatedAt: serverTimestamp(),
        createdAt: serverTimestamp()
      });
      setNewHomeCard({ title: "", text: "", hrefText: "Learn More", href: "/Store", src: "", sortOrder: "" });
      showToast("Home card created successfully.", "success");
    } catch (err) {
      const msg = err?.message || "Failed to create home card.";
      setError(msg);
      showToast(msg, "error");
    }
  };

  const handleSaveHomeCard = async (homeCard) => {
    const draft = homeDrafts[homeCard.homeId] || {};

    try {
      setError("");
      setSavingHomeId(homeCard.homeId);
      await update(ref(db, `Home/${homeCard.homeId}`), {
        title: draft.title ?? homeCard.title ?? "",
        text: draft.text ?? homeCard.text ?? "",
        hrefText: draft.hrefText ?? homeCard.hrefText ?? "Learn More",
        href: draft.href ?? homeCard.href ?? "/Store",
        src: draft.src ?? homeCard.src ?? "",
        sortOrder: Number(draft.sortOrder ?? homeCard.sortOrder ?? 0),
        updatedAt: serverTimestamp()
      });
      setHomeDrafts(prev => {
        const next = {...prev};
        delete next[homeCard.homeId];
        return next;
      });
      showToast("Home card updated successfully.", "success");
    } catch (err) {
      const msg = err?.message || "Failed to save home card.";
      setError(msg);
      showToast(msg, "error");
    } finally {
      setSavingHomeId("");
    }
  };

  const handleDeleteHomeCard = async (homeId, title) => {
    await showConfirm(
      "Delete Home Card",
      `Are you sure you want to delete "${title || "this card"}"? This cannot be undone.`,
      async () => {
        try {
          setError("");
          await remove(ref(db, `Home/${homeId}`));
          showToast("Home card deleted successfully.", "success");
        } catch (err) {
          const msg = err?.message || "Failed to delete home card.";
          setError(msg);
          showToast(msg, "error");
        }
      }
    );
  };

  const handleAssignHistorical = async (e) => {
    e.preventDefault();

    if (!historyForm.knifeId || (!historyForm.customerUid && !historyForm.customerEmail)) {
      showToast("Please select a customer and knife.", "error");
      return;
    }

    const uid = historyForm.customerUid || users.find(u => u.email === historyForm.customerEmail)?.uid;
    if (!uid) {
      showToast("Please select a valid customer.", "error");
      return;
    }

    try {
      setError("");
      await assignHistoricalPurchase({
        customerUid: uid,
        knifeId: historyForm.knifeId,
        purchaseDate: historyForm.purchaseDate ? new Date(historyForm.purchaseDate).getTime() : undefined
      });
      setHistoryForm({ customerUid: "", customerEmail: "", knifeId: "", purchaseDate: "" });
      showToast("Historical purchase assigned successfully.", "success");
    } catch (err) {
      const msg = err?.message || "Failed to assign historical purchase.";
      setError(msg);
      showToast(msg, "error");
    }
  };

  return (
    <div className="admin-dashboard-page">
      <div className="dashboard-container">
        <h1>Admin Dashboard</h1>

        {loading && <p>Loading dashboard...</p>}
        {!!error && <p className="dashboard-error">{error}</p>}

        {!loading && (
          <>
            <div className="dashboard-stats">
              <div className="stat-card"><h3>Total Users</h3><p className="stat-number">{stats.totalUsers}</p></div>
              <div className="stat-card"><h3>Blocked Users</h3><p className="stat-number">{stats.blockedUsers}</p></div>
              <div className="stat-card"><h3>Available Knives</h3><p className="stat-number">{stats.availableKnives}</p></div>
              <div className="stat-card"><h3>Sold Knives</h3><p className="stat-number">{stats.soldKnives}</p></div>
              <div className="stat-card"><h3>Pending Orders</h3><p className="stat-number">{stats.pendingOrders}</p></div>
              <div className="stat-card"><h3>Paid Orders</h3><p className="stat-number">{stats.paidOrders}</p></div>
            </div>

            <section className="dashboard-panel">
              <h2>User Management</h2>
              <div className="panel-help">
                <small>Manage user roles and account status. Block/unblock users as needed.</small>
              </div>
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Email</th>
                      <th>Role</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.length === 0 && <tr><td colSpan={5} className="table-empty">No users found.</td></tr>}
                    {users.map((u) => (
                      <tr key={u.uid}>
                        <td><strong>{u.displayName || "—"}</strong></td>
                        <td className="table-email">{u.email || "—"}</td>
                        <td>
                          <select
                            className="select-input"
                            value={roleDrafts[u.uid] ?? u.role ?? "customer"}
                            onChange={(e) => setRoleDrafts((prev) => ({ ...prev, [u.uid]: e.target.value }))}
                          >
                            {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
                          </select>
                        </td>
                        <td>
                          <span className={`status-badge status-${u.status || "active"}`}>
                            {u.status || "active"}
                          </span>
                        </td>
                        <td className="action-cell">
                          <button className="action-btn" disabled={savingUid === u.uid} onClick={() => handleSaveRole(u.uid, u.role || "customer", u.email)}>
                            {savingUid === u.uid ? "…" : "Save"}
                          </button>
                          <button className="action-btn secondary" disabled={savingUid === u.uid} onClick={() => handleToggleBlocked(u.uid, u.status === "blocked", u.email)}>
                            {u.status === "blocked" ? "Unblock" : "Block"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="dashboard-panel">
              <h2>Home Page Content</h2>
              <div className="panel-help">
                <small>Manage marketing cards that appear on the homepage. Cards are displayed in sort order.</small>
              </div>
              <form className="home-create-form" onSubmit={handleCreateHomeCard}>
                <input className="input-field" placeholder="Card title *" value={newHomeCard.title} onChange={(e) => setNewHomeCard((prev) => ({ ...prev, title: e.target.value }))} required />
                <textarea className="input-field home-textarea" placeholder="Card text" value={newHomeCard.text} onChange={(e) => setNewHomeCard((prev) => ({ ...prev, text: e.target.value }))} />
                <input className="input-field" placeholder="Button text" value={newHomeCard.hrefText} onChange={(e) => setNewHomeCard((prev) => ({ ...prev, hrefText: e.target.value }))} />
                <input className="input-field" placeholder="Link URL" value={newHomeCard.href} onChange={(e) => setNewHomeCard((prev) => ({ ...prev, href: e.target.value }))} />
                <input className="input-field" placeholder="Image URL" value={newHomeCard.src} onChange={(e) => setNewHomeCard((prev) => ({ ...prev, src: e.target.value }))} />
                <input className="input-field" placeholder="Sort order" type="number" value={newHomeCard.sortOrder} onChange={(e) => setNewHomeCard((prev) => ({ ...prev, sortOrder: e.target.value }))} />
                <button type="submit" className="action-btn">Add Card</button>
              </form>

              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Title</th>
                      <th>Text</th>
                      <th>Link</th>
                      <th>Sort</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {homeCards.length === 0 && <tr><td colSpan={5} className="table-empty">No home cards found.</td></tr>}
                    {homeCards.map((card) => {
                      const draft = homeDrafts[card.homeId] || {};

                      return (
                        <tr key={card.homeId}>
                          <td>
                            <input className="input-field" value={draft.title ?? card.title ?? ""} onChange={(e) => setHomeDrafts((prev) => ({ ...prev, [card.homeId]: { ...(prev[card.homeId] || {}), title: e.target.value } }))} />
                          </td>
                          <td>
                            <textarea className="input-field home-table-textarea" value={draft.text ?? card.text ?? ""} onChange={(e) => setHomeDrafts((prev) => ({ ...prev, [card.homeId]: { ...(prev[card.homeId] || {}), text: e.target.value } }))} />
                          </td>
                          <td>
                            <input className="input-field" value={draft.href ?? card.href ?? ""} onChange={(e) => setHomeDrafts((prev) => ({ ...prev, [card.homeId]: { ...(prev[card.homeId] || {}), href: e.target.value } }))} />
                            <input className="input-field home-inline-input" value={draft.hrefText ?? card.hrefText ?? ""} onChange={(e) => setHomeDrafts((prev) => ({ ...prev, [card.homeId]: { ...(prev[card.homeId] || {}), hrefText: e.target.value } }))} />
                          </td>
                          <td>
                            <input className="input-field" type="number" value={draft.sortOrder ?? card.sortOrder ?? 0} onChange={(e) => setHomeDrafts((prev) => ({ ...prev, [card.homeId]: { ...(prev[card.homeId] || {}), sortOrder: e.target.value } }))} />
                          </td>
                          <td className="action-cell">
                            <button className="action-btn" disabled={savingHomeId === card.homeId} onClick={() => handleSaveHomeCard(card)}>
                              {savingHomeId === card.homeId ? "…" : "Save"}
                            </button>
                            <button className="action-btn danger" onClick={() => handleDeleteHomeCard(card.homeId, card.title)}>Delete</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="dashboard-panel">
              <h2>Assign Historical Purchase</h2>
              <div className="panel-help">
                <small>Create purchase records for knives customers acquired before the system was implemented.</small>
              </div>
              <form className="form-grid" onSubmit={handleAssignHistorical}>
                <select
                  className="select-input"
                  value={historyForm.customerEmail}
                  onChange={(e) => {
                    const email = e.target.value;
                    setHistoryForm((p) => ({
                      ...p,
                      customerEmail: email,
                      customerUid: users.find(u => u.email === email)?.uid || ""
                    }));
                  }}
                  required
                >
                  <option value="">Select customer</option>
                  {users.map((u) => (
                    <option key={u.uid} value={u.email}>{u.displayName || u.email}</option>
                  ))}
                </select>
                <select
                  className="select-input"
                  value={historyForm.knifeId}
                  onChange={(e) => setHistoryForm((p) => ({ ...p, knifeId: e.target.value }))}
                  required
                >
                  <option value="">Select knife</option>
                  {products.map((p) => (
                    <option key={p.knifeId} value={p.knifeId}>{p.name || p.knifeId}</option>
                  ))}
                </select>
                <input
                  type="date"
                  className="input-field"
                  value={historyForm.purchaseDate}
                  onChange={(e) => setHistoryForm((p) => ({ ...p, purchaseDate: e.target.value }))}
                />
                <button type="submit" className="action-btn">Assign Purchase</button>
              </form>
            </section>

            <section className="dashboard-panel">
              <h2>Audit Logs</h2>
              <div className="panel-help">
                <small>Recent system actions. Showing last 100 entries. Latest first.</small>
              </div>
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Action</th>
                      <th>Actor</th>
                      <th>Target</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditLogs.length === 0 && <tr><td colSpan={4} className="table-empty">No audit logs found.</td></tr>}
                    {auditLogs.slice(0, 100).map((log) => (
                      <tr key={log.logId}>
                        <td className="log-time">{log.createdAt ? new Date(log.createdAt).toLocaleString() : "—"}</td>
                        <td className="log-action"><code>{log.action || "—"}</code></td>
                        <td className="log-actor" title={log.actorUid}>{log.actorUid ? log.actorUid.substring(0, 8) : "—"}</td>
                        <td className="log-target" title={log.targetUid}>{log.targetUid ? log.targetUid.substring(0, 8) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
