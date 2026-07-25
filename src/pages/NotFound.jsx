import React from "react";
import { useNavigate } from "react-router-dom";
import LucideIcon from "../components/ui/LucideIcon";
import "./PublicInfo.css";

export default function NotFound() {
  const navigate = useNavigate();
  return (
    <main className="not-found-page">
      <LucideIcon name="Compass" size={42} />
      <h1>This trail ends here.</h1>
      <p>The page may have moved, but the knives and custom build tools are still close by.</p>
      <div className="public-info-actions">
        <button className="public-info-primary" type="button" onClick={() => navigate("/store")}>Browse available knives</button>
        <button className="public-info-secondary" type="button" onClick={() => navigate("/")}>Return home</button>
      </div>
    </main>
  );
}
