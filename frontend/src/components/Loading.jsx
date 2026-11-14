export default function Loading({ message = "Loading your workspace…" }) {
  // Displays a loading message and spinner.
  return (
    <div className="screen-state" role="status">
      <span className="spinner" aria-hidden="true" />
      <p>{message}</p>
    </div>
  );
}
