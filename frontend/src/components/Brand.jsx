import { Link } from "react-router-dom";
export default function Brand() {
  // Displays the UtilityHub logo and home link.
  return (
    <Link to="/" className="brand" aria-label="UtilityHub home">
      <img src="/favicon.svg" width="34" height="34" alt="" />
      <span>UtilityHub</span>
    </Link>
  );
}
