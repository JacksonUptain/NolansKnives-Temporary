import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "./AuthProvider";

export default function RequireActiveUser({ children }) {
  const { profile } = useAuth();

  if (profile?.status === "blocked") {
    return <Navigate to="/account?blocked=1" replace />;
  }

  return children;
}
