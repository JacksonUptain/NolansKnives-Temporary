import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./AuthProvider";

export default function RequireVerifiedEmail({ children }) {
  const { user } = useAuth();
  const location = useLocation();

  if (user?.providerData?.some((provider) => provider.providerId === "google.com")) {
    return children;
  }

  if (user && !user.emailVerified) {
    return <Navigate to="/account/verify-email" replace state={{ from: location.pathname }} />;
  }

  return children;
}
