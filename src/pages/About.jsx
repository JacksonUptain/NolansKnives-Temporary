import React from "react";
import { useNavigate } from "react-router-dom";
import LucideIcon from "../components/ui/LucideIcon";
import "./PublicInfo.css";

const workshopImage = "https://raw.githubusercontent.com/nolansknives/website-database/refs/heads/main/images/knife4.jpg";
const detailImage = "https://raw.githubusercontent.com/nolansknives/website-database/refs/heads/main/images/knife7.jpg";

export default function About() {
  const navigate = useNavigate();

  return (
    <main className="public-info-page">
      <section className="public-info-hero">
        <div className="public-info-copy">
          <h1>About Nolan&apos;s Knives</h1>
          <p className="public-info-lede">
            Nolan is a self-taught bladesmith based in Huntsville, Alabama. He continues to study the craft and applies what he learns to each new knife.
          </p>
          <div className="public-info-actions">
            <button className="public-info-primary" type="button" onClick={() => navigate("/gallery")}>
              View the gallery <LucideIcon name="ArrowRight" size={17} />
            </button>
            <button className="public-info-secondary" type="button" onClick={() => navigate("/custom-knife-request")}>
              Request a custom knife
            </button>
          </div>
        </div>
        <div className="public-info-hero-media">
          <img src={workshopImage} alt="A knife made by Nolan's Knives" />
        </div>
      </section>

      <section className="public-info-values" aria-label="About the business">
        <article>
          <LucideIcon name="Hammer" size={24} />
          <h2>Independent maker</h2>
          <p>Nolan&apos;s Knives is a small bladesmithing business focused on handmade knives and continued improvement in the craft.</p>
        </article>
        <article>
          <LucideIcon name="MessageCircle" size={24} />
          <h2>Custom requests</h2>
          <p>The request form collects the intended use, preferred materials, design details, budget, and timing for Nolan to review.</p>
        </article>
        <article>
          <LucideIcon name="ShieldCheck" size={24} />
          <h2>Order information</h2>
          <p>Customers can review quotes, payments, messages, production status, and fulfillment details from their account.</p>
        </article>
      </section>

      <section className="public-info-story">
        <div className="public-info-story-media">
          <img src={detailImage} alt="Close view of a Nolan's Knives blade" />
        </div>
        <div>
          <h2>How custom orders work</h2>
          <p>
            Submit a custom request with the knife&apos;s intended use and your design preferences. Nolan reviews the request and follows up with the scope, materials, price, and timing.
          </p>
          <p>
            If you approve the quote, your account keeps the request, payment stages, build status, messages, and delivery information together.
          </p>
          <div className="custom-deposit-explainer">
            <h3>The 15% deposit</h3>
            <ol>
              <li>
                <strong>The request form calculates an estimate.</strong>
                <span>The optional priority deposit is 15% of that estimate.</span>
              </li>
              <li>
                <strong>You can submit with or without paying it.</strong>
                <span>Paying moves the request into priority review and opens customer messages. Submitting without it does not charge you.</span>
              </li>
              <li>
                <strong>Nolan sends the final quote after review.</strong>
                <span>If you already paid the priority deposit, that payment is credited toward the final price. If you did not, the deposit to accept the quote is 15% of the final price.</span>
              </li>
              <li>
                <strong>The remaining balance is paid later.</strong>
                <span>The account shows the amount already paid and the balance due as the build moves toward completion.</span>
              </li>
            </ol>
            <p className="custom-deposit-note">A priority deposit can be refunded if the final quote is not accepted.</p>
          </div>
          <button className="public-info-text-link" type="button" onClick={() => navigate("/contact")}>
            Contact Nolan <LucideIcon name="ArrowUpRight" size={16} />
          </button>
        </div>
      </section>
    </main>
  );
}
