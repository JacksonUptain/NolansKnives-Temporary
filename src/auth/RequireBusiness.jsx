import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "./AuthProvider";
import { hasAtLeastBusiness } from "./roleHelpers";

export default function RequireBusiness({ children }) {
  const { role } = useAuth();

  if (!hasAtLeastBusiness(role)) {
    return <Navigate to="/unauthorized" replace />;
  }

  return children;
}
