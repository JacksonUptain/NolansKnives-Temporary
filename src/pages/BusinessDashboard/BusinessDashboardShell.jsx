import React from 'react';
import { NavLink, Routes, Route, useNavigate } from 'react-router-dom';
import '../BusinessDashboard.css';
import Overview from './Overview';
import Products from './Products';
import Orders from './Orders';
import EmailCampaigns from './EmailCampaigns';
import Analytics from './Analytics';
import CustomRequestDashboard from '../CustomRequestDashboard';
import ProductEditor from '../ProductEditor';
import LucideIcon from '../../components/ui/LucideIcon';

export default function BusinessDashboardShell() {
  const navigate = useNavigate();

  return (
    <div className="business-dashboard-shell">
      <aside className="bd-sidebar">
        <div className="bd-brand" onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>
          Nolan's Knives
        </div>
        <nav>
          <ul>
            <li>
              <NavLink to="/business" end className={({ isActive }) => isActive ? 'active' : ''}>
                <LucideIcon name="LayoutDashboard" size={18} /> Overview
              </NavLink>
            </li>
            <li>
              <NavLink to="/business/products" className={({ isActive }) => isActive ? 'active' : ''}>
                <LucideIcon name="Package" size={18} /> Products
              </NavLink>
            </li>
            <li>
              <NavLink to="/business/products/new" className={({ isActive }) => isActive ? 'active' : ''}>
                <LucideIcon name="PlusCircle" size={18} /> New Product
              </NavLink>
            </li>
            <li>
              <NavLink to="/business/orders" className={({ isActive }) => isActive ? 'active' : ''}>
                <LucideIcon name="ShoppingCart" size={18} /> Orders
              </NavLink>
            </li>
            <li>
              <NavLink to="/business/analytics" className={({ isActive }) => isActive ? 'active' : ''}>
                <LucideIcon name="BarChart3" size={18} /> Analytics
              </NavLink>
            </li>
            <li>
              <NavLink to="/business/custom-requests" className={({ isActive }) => isActive ? 'active' : ''}>
                <LucideIcon name="Wand2" size={18} /> Custom Requests
              </NavLink>
            </li>
            <li>
              <NavLink to="/business/email-campaigns" className={({ isActive }) => isActive ? 'active' : ''}>
                <LucideIcon name="Mails" size={18} /> Email Campaigns
              </NavLink>
            </li>
          </ul>
        </nav>

        <div className="bd-sidebar-footer" style={{ marginTop: 'auto', padding: '1.5rem' }}>
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
          <Route path="analytics" element={<Analytics />} />
          <Route path="custom-requests" element={<CustomRequestDashboard />} />
          <Route path="email-campaigns" element={<EmailCampaigns />} />
        </Routes>
      </main>
    </div>
  );
}
