import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "./AuthProvider";
import { isAdmin } from "./roleHelpers";

export default function RequireAdmin({ children }) {
  const { role } = useAuth();

  if (!isAdmin(role)) {
    return <Navigate to="/unauthorized" replace />;
  }

  return children;
}
