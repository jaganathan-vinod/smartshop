import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "./auth";

export function Protected() {
  const { ready, user } = useAuth();
  const location = useLocation();

  if (!ready) {
    return <p className="muted">Loading…</p>;
  }
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return <Outlet />;
}
