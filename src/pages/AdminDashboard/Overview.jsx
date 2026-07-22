import React, { useEffect, useState } from "react";
import { ref, onValue } from "firebase/database";
import { db } from "../firebase";
import "../AdminDashboard.css";
import LucideIcon from "../../components/ui/LucideIcon";

export default function Overview() {
  const [stats, setStats] = useState({
    totalUsers: 0,
    admins: 0,
    staff: 0,
    blocked: 0,
    auditLogs: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let usersLoaded = false;
    let logsLoaded = false;

    const maybeDoneLoading = () => {
      if (usersLoaded && logsLoaded) {
        setLoading(false);
      }
    };

    const unsubUsers = onValue(ref(db, "users"), (snapshot) => {
      const list = snapshot.exists() ? Object.values(snapshot.val()) : [];
      setStats((prev) => ({
        ...prev,
        totalUsers: list.length,
        admins: list.filter(u => u.role === 'admin').length,
        staff: list.filter(u => u.role === 'business').length,
        blocked: list.filter(u => u.status === 'blocked').length
      }));
      usersLoaded = true;
      maybeDoneLoading();
    });

    const unsubLogs = onValue(ref(db, "auditLogs"), (snapshot) => {
      const list = snapshot.exists() ? Object.keys(snapshot.val()) : [];
      setStats((prev) => ({ ...prev, auditLogs: list.length }));
      logsLoaded = true;
      maybeDoneLoading();
    });

    return () => {
      unsubUsers();
      unsubLogs();
    };
  }, []);

  if (loading) return <div className="loading-shimmer">Loading Admin stats...</div>;

  return (
    <div className="admin-overview">
      <div className="dashboard-header">
        <h1>Administrative Overview</h1>
        <p>Security and user management summary.</p>
      </div>

      <div className="dashboard-stats">
        <div className="stat-card">
          <LucideIcon name="Users" size={24} color="#ffcc00" />
          <h3>Total Users</h3>
          <p className="stat-number">{stats.totalUsers}</p>
        </div>
        <div className="stat-card">
          <LucideIcon name="ShieldCheck" size={24} color="#ffcc00" />
          <h3>Admins / Staff</h3>
          <p className="stat-number">{stats.admins} / {stats.staff}</p>
        </div>
        <div className="stat-card">
          <LucideIcon name="UserX" size={24} color="#ffcc00" />
          <h3>Blocked Users</h3>
          <p className="stat-number">{stats.blocked}</p>
        </div>
        <div className="stat-card">
          <LucideIcon name="Activity" size={24} color="#ffcc00" />
          <h3>Audit Events</h3>
          <p className="stat-number">{stats.auditLogs}</p>
        </div>
      </div>
    </div>
  );
}
