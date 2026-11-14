const appPaths = new Set([
  "/",
  "/login",
  "/register",
  "/dashboard",
  "/tasks",
  "/expenses",
  "/notes",
  "/tools/pdf",
  "/tools/convert",
  "/tools/images",
]);
export function isAppPath(pathname) {
  // Checks whether a path belongs to a supported page.
  return appPaths.has(pathname.replace(/\/+$/, "") || "/");
}
export function reminderTarget(value, origin) {
  // Restricts reminder links to local task pages.
  try {
    const target = new URL(
      typeof value === "string" ? value : "/tasks",
      origin,
    );
    if (target.origin === origin && target.pathname === "/tasks")
      return target.href;
  } catch {
    /* Fall back to the local task list. */
  }
  return new URL("/tasks", origin).href;
}
