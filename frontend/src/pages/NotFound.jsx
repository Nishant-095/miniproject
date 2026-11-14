import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import usePageTitle from "../hooks/usePageTitle.js";
export default function NotFound() {
  // Displays a page-not-found message.
  usePageTitle("Page not found");
  return (
    <section className="screen-state shell">
      <span className="error-code">404</span>
      <h1>This page wandered off.</h1>
      <p>Head back to the toolkit and find what you need.</p>
      <Link className="button" to="/">
        <ArrowLeft size={17} /> Back to home
      </Link>
    </section>
  );
}
