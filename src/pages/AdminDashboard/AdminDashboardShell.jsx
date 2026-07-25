import React, { useEffect, useState } from 'react';
import { NavLink, Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import Overview from './Overview';
import Users from './Users';
import AuditLogs from './AuditLogs';
import HomeEditor from './HomeEditor';
import EmailTemplates from './EmailTemplates';
import MailgunWebhooks from './MailgunWebhooks';
import '../AdminDashboard.css';
import LucideIcon from '../../components/ui/LucideIcon';

export default function AdminDashboardShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!mobileOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setMobileOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [mobileOpen]);

  return (
    <div className="admin-dashboard-shell">
      <header className="admin-mobile-header">
        <button type="button" onClick={() => setMobileOpen(true)} aria-label="Open admin navigation"><LucideIcon name="Menu" size={20} /></button>
        <div><span>Administration</span><strong>Nolan&apos;s Knives</strong></div>
        <button type="button" onClick={() => navigate('/')} aria-label="Exit to public site"><LucideIcon name="ExternalLink" size={19} /></button>
      </header>

      {mobileOpen && <button className="admin-nav-scrim" type="button" aria-label="Close admin navigation" onClick={() => setMobileOpen(false)} />}

      <aside className={`ad-sidebar ${mobileOpen ? 'is-open' : ''}`}>
        <div className="ad-sidebar-heading">
          <button type="button" className="ad-brand" onClick={() => navigate('/')}>
            <span>Site Admin</span>
            <small>Security & system tools</small>
          </button>
          <button type="button" className="admin-close-button" onClick={() => setMobileOpen(false)} aria-label="Close admin navigation">
            <LucideIcon name="X" size={20} />
          </button>
        </div>
        <nav aria-label="Administration">
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
              <NavLink to="/admin/home" className={({ isActive }) => isActive ? 'active' : ''}>
                <LucideIcon name="PanelTop" size={18} /> Home Editor
              </NavLink>
            </li>
            <li>
              <NavLink to="/admin/email-templates" className={({ isActive }) => isActive ? 'active' : ''}>
                <LucideIcon name="MailCheck" size={18} /> Email Templates
              </NavLink>
            </li>
            <li>
              <NavLink to="/admin/mailgun-webhooks" className={({ isActive }) => isActive ? 'active' : ''}>
                <LucideIcon name="Webhook" size={18} /> Mailgun Webhooks
              </NavLink>
            </li>
            <li>
              <NavLink to="/admin/activity" className={({ isActive }) => isActive ? 'active' : ''}>
                <LucideIcon name="History" size={18} /> Audit Logs
              </NavLink>
            </li>
          </ul>
        </nav>

        <div className="ad-sidebar-footer">
          <button className="bd-back-btn" onClick={() => navigate('/')}>
            <LucideIcon name="ArrowLeft" size={16} /> Exit to Site
          </button>
        </div>
      </aside>

      <main className="ad-main">
        <Routes>
          <Route index element={<Overview />} />
          <Route path="users" element={<Users />} />
          <Route path="home" element={<HomeEditor />} />
          <Route path="email-templates" element={<EmailTemplates />} />
          <Route path="mailgun-webhooks" element={<MailgunWebhooks />} />
          <Route path="activity" element={<AuditLogs />} />
        </Routes>
      </main>
    </div>
  );
}
