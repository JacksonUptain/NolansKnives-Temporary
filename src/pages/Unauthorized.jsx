import React from "react";
import { Link } from "react-router-dom";

export default function Unauthorized() {
  return (
    <div style={{ minHeight: "65vh", color: "white", display: "grid", placeItems: "center", textAlign: "center", padding: "2rem" }}>
      <div>
        <h1 style={{ color: "#ffcc00" }}>Not Authorized</h1>
        <p>You do not have access to this page.</p>
        <Link to="/" className="btn btn-warning">Return Home</Link>
      </div>
    </div>
  );
}
