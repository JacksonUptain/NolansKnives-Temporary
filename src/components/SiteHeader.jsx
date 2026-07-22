import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { hasAtLeastBusiness, isAdmin } from "../auth/roleHelpers";
import "./siteHeader.css";
import LucideIcon from "./ui/LucideIcon";
import { showToast } from "./Toast";

const navLinks = [
  { name: "Home", href: "/Home", icon: "home" },
  { name: "Gallery", href: "/Gallery", icon: "gallery" },
  { name: "Store", href: "/Store", icon: "store" },
  { name: "Custom Knife", href: "/custom-knife-request", icon: "request" }
];

const customerLinks = [
  { label: "My Knives", href: "/my-knives", icon: "knives" },
  { label: "My Account", href: "/my-account", icon: "account" },
  { label: "Request Custom Knife", href: "/custom-knife-request", icon: "request" }
];

// Icons are provided via Lucide through src/components/ui/LucideIcon.jsx

export default function SiteHeader() {
  const { isAuthenticated, role, profile, signOutUser } = useAuth();
  const [open, setOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const dropdownRef = useRef(null);
  const isHomePage = location.pathname === "/" || location.pathname === "/Home";

  const displayName = useMemo(() => {
    if (!profile?.displayName) return "Account";
    return profile.displayName.split(" ")[0];
  }, [profile?.displayName]);

  useEffect(() => {
    setOpen(false);
    setMobileNavOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!isHomePage) {
      setScrolled(false);
      return;
    }

    const handleScroll = () => {
      const threshold = 60; // px scrolled before making header solid
      setScrolled(window.scrollY > threshold);
    };

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [isHomePage]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSignOut = async () => {
    await signOutUser();
    setOpen(false);
    setMobileNavOpen(false);
    showToast("Signed out.", "success");
    navigate("/Home");
  };

  const dropdownItems = [
    ...customerLinks,
    // Business and admin links intentionally removed from account dropdown.
  ];

  return (
    <header className={`nk-header ${isHomePage ? "nk-header-home" : ""} ${isHomePage && scrolled ? "scrolled" : ""}`}>
      <div className="nk-header-inner">
        <Link to="/Home" className="nk-brand">Nolan&apos;s Knives</Link>

        <button
          type="button"
          className="nk-nav-toggle"
          onClick={() => setMobileNavOpen((value) => !value)}
          aria-expanded={mobileNavOpen}
          aria-label="Toggle navigation"
        >
          <LucideIcon name="menu" />
        </button>

        <nav className={`nk-nav-links ${mobileNavOpen ? "is-open" : ""}`} aria-label="Primary navigation">
          {navLinks.map((link) => (
            <Link key={link.href} to={link.href} className="nk-nav-link">
              <LucideIcon name={link.icon} />
              <span>{link.name}</span>
            </Link>
          ))}
          {hasAtLeastBusiness(role) && (
            <Link to="/business" className="nk-nav-link nk-nav-dashboard">
              <LucideIcon name="Building2" />
              <span>Business</span>
            </Link>
          )}
          {isAdmin(role) && (
            <Link to="/admin" className="nk-nav-link nk-nav-admin">
              <LucideIcon name="Shield" />
              <span>Admin</span>
            </Link>
          )}
        </nav>

        <div className="nk-account-wrap" ref={dropdownRef}>
          {!isAuthenticated && <Link to="/account" className="nk-account-btn">Sign In</Link>}

          {isAuthenticated && (
            <>
                <button
                type="button"
                className="nk-account-btn"
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
                aria-haspopup="menu"
              >
                <span className="nk-account-avatar" aria-hidden="true">
                  {displayName.charAt(0).toUpperCase()}
                </span>
                <span className="nk-account-labels">
                  <span className="nk-account-kicker">Account</span>
                </span>
                <LucideIcon name="chevron" />
              </button>
              {open && (
                <div className="nk-dropdown" role="menu" aria-label="Account menu">
                  <div className="nk-dropdown-header">
                    <span className="nk-dropdown-title">Signed in</span>
                    <span className="nk-dropdown-subtitle">{profile?.displayName || displayName}</span>
                  </div>

                  {dropdownItems.map((item) => (
                    <Link key={item.href} to={item.href} onClick={() => setOpen(false)} className="nk-dropdown-link">
                      <LucideIcon name={item.icon} />
                      <span>{item.label}</span>
                    </Link>
                  ))}

                  <button type="button" className="nk-dropdown-link nk-dropdown-signout" onClick={handleSignOut}>
                    <LucideIcon name="signout" />
                    <span>Sign Out</span>
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </header>
  );
}
