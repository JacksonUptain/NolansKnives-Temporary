import React, { useEffect, useState } from 'react';
import { ref, onValue } from 'firebase/database';
import { db } from '../firebase';
import { setUserRole, setUserBlocked } from '../../services/adminService';
import { showToast } from '../../components/Toast';
import { showConfirm } from '../../components/ConfirmDialog';
import '../AdminDashboard.css';

const ROLE_OPTIONS = ['customer', 'business', 'admin'];

export default function Users() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [roleDrafts, setRoleDrafts] = useState({});
  const [savingUid, setSavingUid] = useState('');

  useEffect(() => {
    const unsub = onValue(ref(db, 'users'), (snapshot) => {
      const data = snapshot.val();
      const list = data
        ? Object.entries(data).map(([uid, value]) => ({ uid, ...value }))
        : [];
      list.sort((a, b) => (a.displayName || a.email || '').localeCompare(b.displayName || b.email || ''));
      setUsers(list);
      setLoading(false);
    }, (err) => {
      setError(err?.message || 'Failed to load users');
      setLoading(false);
    });

    return () => unsub();
  }, []);

  const handleSaveRole = async (uid, currentRole, email) => {
    const nextRole = roleDrafts[uid] || currentRole || 'customer';
    if (nextRole === currentRole) return showToast('No role change made.', 'info');

    try {
      setError(null);
      setSavingUid(uid);
      await setUserRole(uid, nextRole);
      setRoleDrafts((prev) => { const next = { ...prev }; delete next[uid]; return next; });
      showToast(`${email || 'User'} role updated to ${nextRole}.`, 'success');
    } catch (err) {
      setError(err?.message || 'Failed to set role');
      showToast(err?.message || 'Failed to set role', 'error');
    } finally {
      setSavingUid('');
    }
  };

  const handleToggleBlocked = async (uid, isBlocked, email) => {
    const action = isBlocked ? 'unblock' : 'block';
    await showConfirm(
      `${action.charAt(0).toUpperCase() + action.slice(1)} User`,
      `Are you sure you want to ${action} ${email || uid}? This action cannot be easily undone.`,
      async () => {
        try {
          setError(null);
          await setUserBlocked(uid, !isBlocked);
          showToast(`User ${action}ed successfully.`, 'success');
        } catch (err) {
          setError(err?.message || `Failed to ${action} user`);
          showToast(err?.message || `Failed to ${action} user`, 'error');
        }
      }
    );
  };

  if (loading) return <div className="dashboard-container"><div className="spinner">Loading users...</div></div>;

  return (
    <div className="admin-users-page">
      <div className="dashboard-header"><h1>Users</h1><p>Manage site users and roles.</p></div>

      {error && <div className="alert-error">{error}</div>}

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
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
                <td>{u.displayName || '—'}</td>
                <td>{u.email || '—'}</td>
                <td>
                  <select value={roleDrafts[u.uid] ?? u.role ?? 'customer'} onChange={(e) => setRoleDrafts((prev) => ({ ...prev, [u.uid]: e.target.value }))}>
                    {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </td>
                <td>{u.status === 'blocked' ? 'Blocked' : 'Active'}</td>
                <td>
                  <button className="action-btn" disabled={savingUid === u.uid} onClick={() => handleSaveRole(u.uid, u.role, u.email)}>{savingUid === u.uid ? 'Saving...' : 'Save'}</button>
                  <button className="action-btn danger" disabled={savingUid === u.uid} onClick={() => handleToggleBlocked(u.uid, u.status === 'blocked', u.email)}>{savingUid === u.uid ? 'Working...' : u.status === 'blocked' ? 'Unblock' : 'Block'}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
