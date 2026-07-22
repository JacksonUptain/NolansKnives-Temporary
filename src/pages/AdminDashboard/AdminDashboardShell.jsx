import React from 'react';
import { NavLink, Routes, Route, useNavigate } from 'react-router-dom';
import Overview from './Overview';
import Users from './Users';
import AuditLogs from './AuditLogs';
import '../AdminDashboard.css';
import LucideIcon from '../../components/ui/LucideIcon';

export default function AdminDashboardShell() {
  const navigate = useNavigate();

  return (
    <div className="admin-dashboard-shell">
      <aside className="ad-sidebar">
        <div className="ad-brand" onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>
          Site Admin
        </div>
        <nav>
          <ul>
            <li>
              <NavLink to="/admin" end className={({ isActive }) => isActive ? 'active' : ''}>
                <LucideIcon name="Shield" size={18} /> Overview
              </NavLink>
            </li>
            <li>
              <NavLink to="/admin/users" className={({ isActive }) => isActive ? 'active' : ''}>
                <LucideIcon name="Users" size={18} /> Users
              </NavLink>
            </li>
            <li>
              <NavLink to="/admin/activity" className={({ isActive }) => isActive ? 'active' : ''}>
                <LucideIcon name="History" size={18} /> Audit Logs
              </NavLink>
            </li>
          </ul>
        </nav>

        <div className="ad-sidebar-footer" style={{ marginTop: 'auto', padding: '1.5rem' }}>
          <button className="bd-back-btn" onClick={() => navigate('/')}>
            <LucideIcon name="ArrowLeft" size={16} /> Exit to Site
          </button>
        </div>
      </aside>

      <main className="ad-main">
        <Routes>
          <Route index element={<Overview />} />
          <Route path="users" element={<Users />} />
          <Route path="activity" element={<AuditLogs />} />
        </Routes>
      </main>
    </div>
  );
}
