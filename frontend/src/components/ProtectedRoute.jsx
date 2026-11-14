import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import Loading from "./Loading.jsx";
export default function ProtectedRoute() {
  // Checks login before showing private pages.
  const { user, loading, sessionError, retrySession, logout } = useAuth();
  const location = useLocation();
  if (loading) return <Loading />;
  if (sessionError) {
    return (
      <section className="screen-state shell">
        <h1>Connection interrupted</h1>
        <p role="alert">{sessionError}</p>
        <div className="flex flex-wrap justify-center gap-3">
          <button className="button" onClick={retrySession}>
            Try again
          </button>
          <button className="button button-outline" onClick={logout}>
            Sign out
          </button>
        </div>
      </section>
    );
  }
  return user ? (
    <Outlet />
  ) : (
    <Navigate
      to="/login"
      replace
      state={{
        from: location.pathname,
      }}
    />
  );
}
