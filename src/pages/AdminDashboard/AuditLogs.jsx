import React, { useEffect, useMemo, useState } from 'react';
import { ref, onValue } from 'firebase/database';
import { db } from '../firebase';
import '../AdminDashboard.css';
import LucideIcon from '../../components/ui/LucideIcon';

function formatDate(value) {
  if (!value) return 'No date';
  const date = typeof value === 'number' ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) return 'No date';
  return date.toLocaleString();
}

function labelize(value) {
  return String(value || '-').replace(/_/g, ' ').replace(/\b\w/g, (match) => match.toUpperCase());
}

function shortId(value) {
  if (!value) return '-';
  return String(value).length > 14 ? `${String(value).slice(0, 8)}...${String(value).slice(-4)}` : value;
}

export default function AuditLogs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [actionFilter, setActionFilter] = useState('all');

  useEffect(() => {
    const unsub = onValue(ref(db, 'auditLogs'), (snapshot) => {
      const list = snapshot.exists()
        ? Object.entries(snapshot.val()).map(([logId, value]) => ({ logId, ...value }))
        : [];

      list.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      setLogs(list);
      setLoading(false);
      setError('');
    }, (err) => {
      setError(err?.message || 'Failed to load audit logs');
      setLoading(false);
    });

    return () => unsub();
  }, []);

  const actionOptions = useMemo(() => {
    const actions = [...new Set(logs.map((log) => log.action).filter(Boolean))].sort();
    return ['all', ...actions];
  }, [logs]);

  const filteredLogs = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return logs.filter((log) => {
      const matchesAction = actionFilter === 'all' || log.action === actionFilter;
      const searchable = [
        log.action,
        log.actorUid,
        log.actorRole,
        log.targetUid,
        log.logId,
        JSON.stringify(log.data || {})
      ].join(' ').toLowerCase();
      return matchesAction && (!normalizedSearch || searchable.includes(normalizedSearch));
    });
  }, [logs, searchTerm, actionFilter]);

  if (loading) return <div className="loading-shimmer">Loading audit logs...</div>;

  return (
    <div className="admin-audit-page">
      <div className="dashboard-header">
        <h1>Audit Logs</h1>
        <p>Review role changes, purchases, custom requests, fulfillment updates, and other sensitive actions.</p>
      </div>

      {error && <div className="alert-error">{error}</div>}

      <div className="admin-toolbar">
        <label className="admin-search">
          <LucideIcon name="Search" size={16} />
          <input
            type="search"
            placeholder="Search action, actor, target, or payload"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
        </label>
        <select value={actionFilter} onChange={(event) => setActionFilter(event.target.value)} aria-label="Filter audit action">
          {actionOptions.map((action) => (
            <option key={action} value={action}>{action === 'all' ? 'All actions' : labelize(action)}</option>
          ))}
        </select>
      </div>

      <div className="audit-log-list">
        {filteredLogs.length === 0 ? (
          <div className="empty-state refined">
            <LucideIcon name="History" size={36} />
            <h2>No audit logs match this view.</h2>
          </div>
        ) : (
          filteredLogs.slice(0, 250).map((log) => (
            <article className="audit-log-card" key={log.logId}>
              <div className="audit-log-main">
                <span>{formatDate(log.timestamp)}</span>
                <h2>{labelize(log.action)}</h2>
                <p>Actor: {shortId(log.actorUid)} ({log.actorRole || 'unknown'})</p>
              </div>
              <div className="audit-log-meta">
                <div><span>Target</span><strong>{shortId(log.targetUid)}</strong></div>
                <div><span>Log ID</span><strong>{shortId(log.logId)}</strong></div>
              </div>
              {log.data && (
                <pre className="audit-log-data">{JSON.stringify(log.data, null, 2)}</pre>
              )}
            </article>
          ))
        )}
      </div>
    </div>
  );
}
