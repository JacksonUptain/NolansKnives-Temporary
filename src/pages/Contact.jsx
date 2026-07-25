import React from "react";
import { Link } from "react-router-dom";
import LucideIcon from "../components/ui/LucideIcon";
import "./PublicInfo.css";

export default function Contact() {
  return (
    <main className="public-info-page contact-page">
      <section className="contact-hero">
        <h1>Contact Nolan&apos;s Knives</h1>
        <p>Use the custom request form for a new build, email Nolan about a listed knife, or sign in to review an existing order.</p>
      </section>

      <section className="contact-paths">
        <article>
          <span className="contact-icon"><LucideIcon name="Wand2" size={25} /></span>
          <h2>Custom knife requests</h2>
          <p>Provide the intended use, design preferences, materials, budget, timing, and delivery preference for Nolan to review.</p>
          <Link to="/custom-knife-request">Open the request form <LucideIcon name="ArrowRight" size={16} /></Link>
        </article>
        <article>
          <span className="contact-icon"><LucideIcon name="ShoppingBag" size={25} /></span>
          <h2>Available knives</h2>
          <p>Email Nolan with the name of the knife if you need more information about its specifications, availability, or delivery.</p>
          <a href="mailto:orders@nolansknives.com?subject=Question%20about%20a%20Nolan%27s%20Knives%20listing">
            Send an email <LucideIcon name="ArrowUpRight" size={16} />
          </a>
        </article>
        <article>
          <span className="contact-icon"><LucideIcon name="PackageCheck" size={25} /></span>
          <h2>Existing orders</h2>
          <p>Sign in to review payments, production status, shipping or pickup details, and messages associated with your order.</p>
          <Link to="/my-knives">View your orders <LucideIcon name="ArrowRight" size={16} /></Link>
        </article>
      </section>

      <section className="contact-direct">
        <div>
          <h2>Email</h2>
          <p>Send general questions to <a href="mailto:orders@nolansknives.com">orders@nolansknives.com</a>. Include the knife name or request number when applicable.</p>
        </div>
        <div className="contact-social">
          <a href="https://www.instagram.com/nolansknives/" target="_blank" rel="noreferrer"><LucideIcon name="Camera" size={19} /> Instagram</a>
          <a href="https://www.youtube.com/@NolansKnives" target="_blank" rel="noreferrer"><LucideIcon name="CirclePlay" size={19} /> YouTube</a>
        </div>
      </section>
    </main>
  );
}
