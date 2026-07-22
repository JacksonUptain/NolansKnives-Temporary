import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./AuthProvider";
import RouteLoading from "./RouteLoading";

export default function RequireAuth({ children }) {
  const { initializing, isAuthenticated } = useAuth();
  const location = useLocation();

  if (initializing) return <RouteLoading />;
  if (!isAuthenticated) {
    return <Navigate to="/account" replace state={{ from: location.pathname + location.search }} />;
  }

  return children;
}
