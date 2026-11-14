import { Link } from "react-router-dom";
import Brand from "./Brand.jsx";
export default function Footer() {
  // Displays the site footer and links.
  return (
    <footer className="footer">
      <div className="shell footer-top">
        <div>
          <Brand />
          <p>A little help for your everyday.</p>
        </div>
        <div className="footer-links">
          <Link to="/#tools">All tools</Link>
          <Link to="/#how-it-works">About the project</Link>
          <Link to="/dashboard">Your workspace</Link>
        </div>
      </div>
      <div className="shell footer-bottom">
        <span>© {new Date().getFullYear()} UtilityHub</span>
        <span>A college mini project · Built with React & Express</span>
      </div>
    </footer>
  );
}
