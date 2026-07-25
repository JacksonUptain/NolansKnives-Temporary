import React from "react";
import { Link } from "react-router-dom";
import LucideIcon from "./ui/LucideIcon";
import "./siteFooter.css";

export default function SiteFooter() {
  return (
    <footer className="nk-footer">
      <div className="nk-footer-inner">
        <div className="nk-footer-brand">
          <h2>Nolan&apos;s Knives</h2>
          <p>Handmade knives and custom orders from Nolan in Huntsville, Alabama.</p>
        </div>

        <nav className="nk-footer-links" aria-label="Footer navigation">
          <div>
            <span>Explore</span>
            <Link to="/store">Available knives</Link>
            <Link to="/gallery">Past work</Link>
            <Link to="/custom-knife-request">Request a custom knife</Link>
          </div>
          <div>
            <span>Learn</span>
            <Link to="/about">About Nolan</Link>
            <Link to="/contact">Contact</Link>
            <Link to="/my-knives">Your knives</Link>
          </div>
          <div>
            <span>Follow</span>
            <a href="https://www.instagram.com/nolansknives/" target="_blank" rel="noreferrer">
              <LucideIcon name="Camera" size={16} /> Instagram
            </a>
            <a href="https://www.youtube.com/@NolansKnives" target="_blank" rel="noreferrer">
              <LucideIcon name="CirclePlay" size={16} /> YouTube
            </a>
            <a href="mailto:orders@nolansknives.com">
              <LucideIcon name="Mail" size={16} /> Email
            </a>
          </div>
        </nav>
      </div>
      <div className="nk-footer-bottom">
        <span>© {new Date().getFullYear()} Nolan&apos;s Knives · Huntsville, Alabama</span>
        <span><a href="mailto:orders@nolansknives.com">orders@nolansknives.com</a></span>
      </div>
    </footer>
  );
}
