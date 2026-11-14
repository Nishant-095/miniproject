import { useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import PwaStatus from "./PwaStatus.jsx";
import Navbar from "./Navbar.jsx";
import Footer from "./Footer.jsx";
export default function Layout() {
  // Displays the shared navigation and page layout.
  const { pathname, hash } = useLocation();
  useEffect(() => {
    // Synchronizes page state and cleans up listeners.
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView();
    else window.scrollTo(0, 0);
  }, [pathname, hash]);
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <Navbar />
      <main id="main-content" tabIndex="-1">
        <Outlet />
      </main>
      <Footer />
      <PwaStatus />
    </div>
  );
}
