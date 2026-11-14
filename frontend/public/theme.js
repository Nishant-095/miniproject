// Run before the page paints to avoid a bright flash when dark mode is saved.
(() => {
  // Restores the saved theme before rendering.
  let theme;
  try {
    theme = localStorage.getItem("utilityhub_theme");
  } catch {
    /* Use the system preference. */
  }
  if (!["light", "dark"].includes(theme))
    theme = matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  document.documentElement.dataset.theme = theme;
  document.documentElement.classList.toggle("dark", theme === "dark");
})();
