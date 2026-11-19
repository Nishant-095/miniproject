import { startTransition, useEffect, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { Menu, X, Sun, Moon } from "lucide-react";
import { useTheme } from "../context/ThemeContext.jsx";
import Brand from "./Brand.jsx";
import NotificationBell from "./NotificationBell.jsx";
import InstallAppButton from "./InstallAppButton.jsx";
import AppUpdateButton from "./AppUpdateButton.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useToast } from "../context/ToastContext.jsx";
export default function Navbar() {
  // Displays navigation, account, and app controls.
  const { theme, toggleTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const { user, loading, logout } = useAuth();
  const notify = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(
    () =>
      // Synchronizes page state and cleans up listeners.
      setOpen(false),
    [location.pathname, location.hash, location.search],
  );
  function signOut() {
    // Signs out and returns to the home page.
    setOpen(false);
    // Keep the account update and Router navigation in the same transition.
    startTransition(() => {
      // Signs out and returns to the home page.
      logout();
      navigate("/", {
        replace: true,
      });
    });
    notify("You have signed out.");
  }
  return (
    <header className="nav-wrap">
      <nav className="navbar shell" aria-label="Main navigation">
        <Brand />
        <div className="nav-utilities">
          <AppUpdateButton compact />
          <InstallAppButton />
          <button
            className="theme-button"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          >
            {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          {user && <NotificationBell key={user.id} />}
        </div>
        <button
          className="menu-button"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          aria-controls="main-menu"
          onClick={() =>
            // Toggles the navigation or reminder panel.
            setOpen(!open)
          }
        >
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
        <div id="main-menu" className={`nav-links ${open ? "nav-open" : ""}`}>
          <NavLink to="/" end>Home</NavLink>
          <NavLink to="/tools/pdf" className={location.pathname.startsWith("/tools/") ? "active" : ""}>Documents</NavLink>
          <NavLink to="/tasks">Tasks</NavLink>
          <NavLink to="/expenses">Expenses</NavLink>
          {loading ? (
            <span className="muted text-sm">Checking session…</span>
          ) : user ? (
            <>
              <NavLink to="/dashboard">Dashboard</NavLink>
              <NavLink to="/notes">Notes</NavLink>
              <button
                className="button button-outline button-small"
                onClick={signOut}
              >
                Sign out
              </button>
            </>
          ) : (
            <>
              <NavLink to="/login">Sign in</NavLink>
              <Link to="/register" className="button button-small">
                Get started
              </Link>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
