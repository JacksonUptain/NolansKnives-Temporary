import React, { useEffect, useState } from "react";
import { ref, onValue } from "firebase/database";
import { db } from "../firebase";
import { getPublicKnifeStatus } from "../knifeStatus";
import "../BusinessDashboard.css";
import LucideIcon from "../../components/ui/LucideIcon";

export default function Overview() {
  const [stats, setStats] = useState({
    availableKnives: 0,
    pendingKnives: 0,
    soldKnives: 0,
    pendingOrders: 0,
    paidOrders: 0,
    unfulfilledOrders: 0,
    unreadConversations: 0,
    customRequests: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let productsLoaded = false;
    let ordersLoaded = false;
    let conversationsLoaded = false;
    let customLoaded = false;

    const maybeDoneLoading = () => {
      if (productsLoaded && ordersLoaded && conversationsLoaded && customLoaded) {
        setLoading(false);
      }
    };

    const unsubProducts = onValue(ref(db, "Products"), (snapshot) => {
      const knives = snapshot.exists() ? Object.values(snapshot.val()) : [];
      const available = knives.filter((k) => getPublicKnifeStatus(k) === "available").length;
      const pending = knives.filter((k) => getPublicKnifeStatus(k) === "pending").length;
      const sold = knives.filter((k) => getPublicKnifeStatus(k) === "sold").length;

      setStats((prev) => ({ ...prev, availableKnives: available, pendingKnives: pending, soldKnives: sold }));
      productsLoaded = true;
      maybeDoneLoading();
    });

    const unsubOrders = onValue(ref(db, "orders"), (snapshot) => {
      const list = snapshot.exists() ? Object.values(snapshot.val()) : [];
      setStats((prev) => ({
        ...prev,
        pendingOrders: list.filter((o) => o.status === "pending").length,
        paidOrders: list.filter((o) => o.status === "paid" || o.status === "approved").length,
        unfulfilledOrders: list.filter((o) => (o.fulfillmentStatus || "unfulfilled") === "unfulfilled").length
      }));
      ordersLoaded = true;
      maybeDoneLoading();
    });

    const unsubConversations = onValue(ref(db, "conversations"), (snapshot) => {
      const list = snapshot.exists() ? Object.values(snapshot.val()) : [];
      setStats((prev) => ({
        ...prev,
        unreadConversations: list.filter((c) => (c.staffUnreadCount || 0) > 0).length
      }));
      conversationsLoaded = true;
      maybeDoneLoading();
    });

    const unsubCustom = onValue(ref(db, "customRequests"), (snapshot) => {
      const list = snapshot.exists() ? Object.values(snapshot.val()) : [];
      setStats((prev) => ({ ...prev, customRequests: list.length }));
      customLoaded = true;
      maybeDoneLoading();
    });

    return () => {
      unsubProducts();
      unsubOrders();
      unsubConversations();
      unsubCustom();
    };
  }, []);

  if (loading) return <div className="loading-shimmer">Loading overview...</div>;

  return (
    <div className="overview-container">
      <div className="dashboard-header">
        <h1>Dashboard Overview</h1>
        <p>Real-time performance and inventory metrics.</p>
      </div>

      <div className="dashboard-stats">
        <div className="stat-card">
          <LucideIcon name="Package" size={24} color="#ffcc00" />
          <h3>Available Knives</h3>
          <p className="stat-number">{stats.availableKnives}</p>
        </div>
        <div className="stat-card">
          <LucideIcon name="ShoppingCart" size={24} color="#ffcc00" />
          <h3>Paid Orders</h3>
          <p className="stat-number">{stats.paidOrders}</p>
        </div>
        <div className="stat-card">
          <LucideIcon name="AlertCircle" size={24} color="#ffcc00" />
          <h3>Unfulfilled</h3>
          <p className="stat-number">{stats.unfulfilledOrders}</p>
        </div>
        <div className="stat-card">
          <LucideIcon name="MessageSquare" size={24} color="#ffcc00" />
          <h3>Unread Chats</h3>
          <p className="stat-number">{stats.unreadConversations}</p>
        </div>
        <div className="stat-card">
          <LucideIcon name="Wand2" size={24} color="#ffcc00" />
          <h3>Custom Requests</h3>
          <p className="stat-number">{stats.customRequests}</p>
        </div>
      </div>
    </div>
  );
}
