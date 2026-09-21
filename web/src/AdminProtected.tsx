import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "./auth";

export function AdminProtected() {
  const { ready, user, isAdmin } = useAuth();
  const location = useLocation();
  if (!ready) {
    return <p className="muted">Loading…</p>;
  }
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  if (!isAdmin) {
    return (
      <section>
        <h1>Reports</h1>
        <p className="flash error">Admin group required. Sign out and sign in again after you are added to Cognito group admin.</p>
      </section>
    );
  }
  return <Outlet />;
}
