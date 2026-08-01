import React, { useEffect, useState } from 'react';
import { NavLink, Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import '../BusinessDashboard.css';
import Overview from './Overview';
import Products from './Products';
import Orders from './Orders';
import EmailCampaigns from './EmailCampaigns';
import Analytics from './Analytics';
import Customers from './Customers';
import Conversations from './Conversations';
import Workflow from './Workflow';
import CustomRequestDashboard from '../CustomRequestDashboard';
import CustomRequestDetail from '../CustomRequestDetail';
import ProductEditor from '../ProductEditor';
import LucideIcon from '../../components/ui/LucideIcon';

export default function BusinessDashboardShell() {
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
    <div className="business-dashboard-shell">
      <header className="workspace-mobile-header">
        <button type="button" className="workspace-menu-button" onClick={() => setMobileOpen(true)} aria-label="Open business navigation">
          <LucideIcon name="Menu" size={20} />
        </button>
        <div>
          <span>Business workspace</span>
          <strong>Nolan&apos;s Knives</strong>
        </div>
        <button type="button" className="workspace-site-button" onClick={() => navigate('/')} aria-label="Exit to public site">
          <LucideIcon name="ExternalLink" size={19} />
        </button>
      </header>

      {mobileOpen && <button className="workspace-nav-scrim" type="button" aria-label="Close business navigation" onClick={() => setMobileOpen(false)} />}

      <aside className={`bd-sidebar ${mobileOpen ? 'is-open' : ''}`}>
        <div className="bd-sidebar-heading">
          <button type="button" className="bd-brand" onClick={() => navigate('/')}>
            <span>Nolan&apos;s Knives</span>
            <small>Business workspace</small>
          </button>
          <button type="button" className="workspace-close-button" onClick={() => setMobileOpen(false)} aria-label="Close business navigation">
            <LucideIcon name="X" size={20} />
          </button>
        </div>
        <nav aria-label="Business workspace">
          <p className="bd-nav-label">Today</p>
          <ul>
            <li>
              <NavLink to="/business" end className={({ isActive }) => isActive ? 'active' : ''}>
                <LucideIcon name="LayoutDashboard" size={18} /> Overview
              </NavLink>
            </li>
            <li>
              <NavLink to="/business/products" className={({ isActive }) => isActive ? 'active' : ''}>
                <LucideIcon name="Package" size={18} /> Products & Inventory
              </NavLink>
            </li>
            <li>
              <NavLink to="/business/orders" className={({ isActive }) => isActive ? 'active' : ''}>
                <LucideIcon name="ShoppingCart" size={18} /> Orders
              </NavLink>
            </li>
            <li>
              <NavLink to="/business/custom-requests" className={({ isActive }) => isActive ? 'active' : ''}>
                <LucideIcon name="Wand2" size={18} /> Custom Requests
              </NavLink>
            </li>
            <li>
              <NavLink to="/business/messages" className={({ isActive }) => isActive ? 'active' : ''}>
                <LucideIcon name="MessageSquare" size={18} /> Messages
              </NavLink>
            </li>
          </ul>

          <p className="bd-nav-label">Build pipeline</p>
          <ul>
            <li>
              <NavLink to="/business/quotes" className={({ isActive }) => isActive ? 'active' : ''}>
                <LucideIcon name="FileText" size={18} /> Quotes
              </NavLink>
            </li>
            <li>
              <NavLink to="/business/production" className={({ isActive }) => isActive ? 'active' : ''}>
                <LucideIcon name="Hammer" size={18} /> Production
              </NavLink>
            </li>
            <li>
              <NavLink to="/business/fulfillment" className={({ isActive }) => isActive ? 'active' : ''}>
                <LucideIcon name="Truck" size={18} /> Fulfillment
              </NavLink>
            </li>
          </ul>

          <p className="bd-nav-label">Business</p>
          <ul>
            <li>
              <NavLink to="/business/customers" className={({ isActive }) => isActive ? 'active' : ''}>
                <LucideIcon name="Users" size={18} /> Customers
              </NavLink>
            </li>
            <li>
              <NavLink to="/business/email-campaigns" className={({ isActive }) => isActive ? 'active' : ''}>
                <LucideIcon name="Mails" size={18} /> Email Campaigns
              </NavLink>
            </li>
            <li>
              <NavLink to="/business/analytics" className={({ isActive }) => isActive ? 'active' : ''}>
                <LucideIcon name="BarChart3" size={18} /> Reports
              </NavLink>
            </li>
            <li>
              <NavLink to="/business/workflow" className={({ isActive }) => isActive ? 'active' : ''}>
                <LucideIcon name="Route" size={18} /> Workflow Guide
              </NavLink>
            </li>
          </ul>
        </nav>

        <div className="bd-sidebar-footer">
          <button className="bd-back-btn" onClick={() => navigate('/')}>
            <LucideIcon name="ArrowLeft" size={16} /> Exit to Site
          </button>
        </div>
      </aside>

      <main className="bd-main">
        <Routes>
          <Route index element={<Overview />} />
          <Route path="products" element={<Products />} />
          <Route path="products/new" element={<ProductEditor />} />
          <Route path="products/:productId" element={<ProductEditor />} />
          <Route path="product/:productId" element={<ProductEditor />} />
          <Route path="orders" element={<Orders />} />
          <Route path="fulfillment" element={<Orders view="fulfillment" />} />
          <Route path="analytics" element={<Analytics />} />
          <Route path="custom-requests" element={<CustomRequestDashboard />} />
          <Route path="custom-requests/:requestId" element={<CustomRequestDetail />} />
          <Route path="quotes" element={<CustomRequestDashboard view="quotes" />} />
          <Route path="production" element={<CustomRequestDashboard view="production" />} />
          <Route path="messages" element={<Conversations />} />
          <Route path="customers" element={<Customers />} />
          <Route path="workflow" element={<Workflow />} />
          <Route path="email-campaigns" element={<EmailCampaigns />} />
        </Routes>
      </main>
    </div>
  );
}
