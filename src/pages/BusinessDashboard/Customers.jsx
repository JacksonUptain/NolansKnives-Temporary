import React, { useEffect, useMemo, useState } from 'react';
import { onValue, ref } from 'firebase/database';
import { db } from '../firebase';
import LucideIcon from '../../components/ui/LucideIcon';

function formatDate(value) {
  if (!value) return 'No activity yet';
  const date = new Date(Number(value) || value);
  return Number.isNaN(date.getTime()) ? 'No activity yet' : date.toLocaleDateString();
}

export default function Customers() {
  const [users, setUsers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [requests, setRequests] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let usersLoaded = false;
    let ordersLoaded = false;
    let requestsLoaded = false;
    const finish = () => {
      if (usersLoaded && ordersLoaded && requestsLoaded) setLoading(false);
    };

    const unsubUsers = onValue(ref(db, 'users'), (snapshot) => {
      const value = snapshot.val() || {};
      setUsers(Object.entries(value).map(([uid, user]) => ({ uid, ...user })));
      usersLoaded = true;
      finish();
    });
    const unsubOrders = onValue(ref(db, 'orders'), (snapshot) => {
      setOrders(Object.values(snapshot.val() || {}));
      ordersLoaded = true;
      finish();
    });
    const unsubRequests = onValue(ref(db, 'customRequests'), (snapshot) => {
      setRequests(Object.values(snapshot.val() || {}));
      requestsLoaded = true;
      finish();
    });

    return () => {
      unsubUsers();
      unsubOrders();
      unsubRequests();
    };
  }, []);

  const customerRows = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return users
      .filter((user) => user.role === 'customer' || !user.role)
      .map((user) => {
        const customerOrders = orders.filter((order) => order.uid === user.uid);
        const customerRequests = requests.filter((request) => request.uid === user.uid);
        const latestActivity = [...customerOrders, ...customerRequests].reduce((latest, item) => Math.max(latest, Number(item.updatedAt || item.createdAt || 0)), 0);
        const paidTotal = customerOrders
          .filter((order) => ['paid', 'approved'].includes(order.status))
          .reduce((total, order) => total + Number(order.amount || 0), 0);
        return { ...user, customerOrders, customerRequests, latestActivity, paidTotal };
      })
      .filter((user) => !normalizedSearch || [user.displayName, user.email].join(' ').toLowerCase().includes(normalizedSearch))
      .sort((a, b) => b.latestActivity - a.latestActivity || String(a.displayName || a.email).localeCompare(String(b.displayName || b.email)));
  }, [users, orders, requests, search]);

  if (loading) return <div className="business-workspace"><div className="loading-shimmer">Loading customers...</div></div>;

  return (
    <div className="business-workspace">
      <div className="workspace-hero">
        <div>
          <h1>Customers</h1>
          <p>See each customer&apos;s orders, requests, activity, and contact details without searching separate records.</p>
        </div>
      </div>

      <div className="workspace-toolbar customer-toolbar">
        <label className="toolbar-search">
          <LucideIcon name="Search" size={16} />
          <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search customer name or email" />
        </label>
        <span className="toolbar-result-count">{customerRows.length} customer{customerRows.length === 1 ? '' : 's'}</span>
      </div>

      {customerRows.length === 0 ? (
        <div className="empty-state refined">
          <LucideIcon name="Users" size={42} />
          <h2>No customers match this search.</h2>
          <p>Customer accounts appear here after registration.</p>
        </div>
      ) : (
        <div className="customer-grid">
          {customerRows.map((customer) => (
            <article className="customer-card" key={customer.uid}>
              <div className="customer-card-heading">
                <span className="customer-avatar">{String(customer.displayName || customer.email || 'C').charAt(0).toUpperCase()}</span>
                <div>
                  <h2>{customer.displayName || 'Customer'}</h2>
                  <a href={`mailto:${customer.email}`}>{customer.email || 'No email'}</a>
                </div>
              </div>
              <dl>
                <div><dt>Orders</dt><dd>{customer.customerOrders.length}</dd></div>
                <div><dt>Custom requests</dt><dd>{customer.customerRequests.length}</dd></div>
                <div><dt>Paid purchases</dt><dd>${customer.paidTotal.toFixed(2)}</dd></div>
                <div><dt>Last activity</dt><dd>{formatDate(customer.latestActivity)}</dd></div>
              </dl>
              <a className="action-btn secondary customer-email-action" href={`mailto:${customer.email}?subject=Nolan%27s%20Knives`}>
                <LucideIcon name="Mail" size={15} /> Email customer
              </a>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
