import React, { useEffect, useState } from 'react';
import { ref, onValue } from 'firebase/database';
import { db } from '../firebase';
import { inviteAdminUser, setUserRole, setUserBlocked } from '../../services/adminService';
import { showToast } from '../../components/Toast';
import { showConfirm } from '../../components/ConfirmDialog';
import Modal from '../../components/ui/Modal';
import LucideIcon from '../../components/ui/LucideIcon';
import '../AdminDashboard.css';

const ROLE_OPTIONS = ['customer', 'business', 'admin'];

export default function Users() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [roleDrafts, setRoleDrafts] = useState({});
  const [savingUid, setSavingUid] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState({ displayName: '', email: '', role: 'admin' });
  const [inviting, setInviting] = useState(false);

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

  const closeInvite = () => {
    if (inviting) return;
    setInviteOpen(false);
    setInviteForm({ displayName: '', email: '', role: 'admin' });
  };

  const handleInviteChange = (event) => {
    const { name, value } = event.target;
    setInviteForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleInviteSubmit = async (event) => {
    event.preventDefault();

    const displayName = inviteForm.displayName.trim();
    const email = inviteForm.email.trim();
    const role = inviteForm.role || 'admin';

    if (!displayName || !email) {
      showToast('Name and email are required.', 'error');
      return;
    }

    try {
      setError(null);
      setInviting(true);
      const result = await inviteAdminUser({ displayName, email, role });
      showToast(`${result.role || role} invite sent to ${result.email || email}.`, 'success');
      setInviteOpen(false);
      setInviteForm({ displayName: '', email: '', role: 'admin' });
    } catch (err) {
      const message = err?.message || 'Failed to send admin invite.';
      setError(message);
      showToast(message, 'error');
    } finally {
      setInviting(false);
    }
  };

  if (loading) return <div className="dashboard-container"><div className="spinner">Loading users...</div></div>;

  return (
    <div className="admin-dashboard-page admin-users-page">
      <div className="dashboard-header admin-users-header">
        <div>
          <h1>Users</h1>
          <p>Manage site users and roles.</p>
        </div>
        <button type="button" className="action-btn invite-user-btn" onClick={() => setInviteOpen(true)}>
          <LucideIcon name="UserPlus" size={16} /> Invite User
        </button>
      </div>

      {error && <div className="alert-error">{error}</div>}

      <Modal open={inviteOpen} onClose={closeInvite} title="Invite User">
        <form className="admin-invite-form" onSubmit={handleInviteSubmit}>
          <label htmlFor="inviteDisplayName">
            Name
            <input
              id="inviteDisplayName"
              name="displayName"
              className="input-field"
              value={inviteForm.displayName}
              onChange={handleInviteChange}
              autoComplete="name"
              required
            />
          </label>
          <label htmlFor="inviteEmail">
            Email
            <input
              id="inviteEmail"
              name="email"
              type="email"
              className="input-field"
              value={inviteForm.email}
              onChange={handleInviteChange}
              autoComplete="email"
              required
            />
          </label>
          <label htmlFor="inviteRole">
            Role
            <select
              id="inviteRole"
              name="role"
              className="select-input"
              value={inviteForm.role}
              onChange={handleInviteChange}
            >
              {ROLE_OPTIONS.map((role) => (
                <option key={role} value={role}>{role}</option>
              ))}
            </select>
          </label>
          <div className="admin-modal-actions">
            <button type="button" className="action-btn secondary" onClick={closeInvite} disabled={inviting}>
              <LucideIcon name="X" size={16} /> Cancel
            </button>
            <button type="submit" className="action-btn" disabled={inviting}>
              <LucideIcon name={inviting ? 'Loader2' : 'Send'} size={16} className={inviting ? 'nk-icon spin' : 'nk-icon'} />
              {inviting ? 'Sending...' : 'Send Invite'}
            </button>
          </div>
        </form>
      </Modal>

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
                <td className="table-email">{u.email || '—'}</td>
                <td>
                  <select className="select-input" value={roleDrafts[u.uid] ?? u.role ?? 'customer'} onChange={(e) => setRoleDrafts((prev) => ({ ...prev, [u.uid]: e.target.value }))}>
                    {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </td>
                <td>
                  <span className={`status-badge status-${u.status === 'blocked' ? 'blocked' : 'active'}`}>
                    {u.status === 'blocked' ? 'Blocked' : 'Active'}
                  </span>
                </td>
                <td className="action-cell">
                  <button className="action-btn" disabled={savingUid === u.uid} onClick={() => handleSaveRole(u.uid, u.role, u.email)}>
                    <LucideIcon name="Save" size={15} /> {savingUid === u.uid ? 'Saving...' : 'Save'}
                  </button>
                  <button className="action-btn danger" disabled={savingUid === u.uid} onClick={() => handleToggleBlocked(u.uid, u.status === 'blocked', u.email)}>
                    <LucideIcon name={u.status === 'blocked' ? 'ShieldCheck' : 'Ban'} size={15} />
                    {savingUid === u.uid ? 'Working...' : u.status === 'blocked' ? 'Unblock' : 'Block'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
