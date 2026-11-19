import { createContext, useContext, useEffect, useMemo, useState } from "react";
const ThemeContext = createContext(null);
export function ThemeProvider({ children }) {
  // Shares and saves the light or dark theme.
  const [theme, setTheme] = useState(
    () =>
      // Reads the initial saved state.
      document.documentElement.dataset.theme || "light",
  );
  useEffect(() => {
    // Applies and saves the chosen theme.
    document.documentElement.dataset.theme = theme;
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.style.colorScheme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#14181e" : "#ffffff");
    try {
      localStorage.setItem("utilityhub_theme", theme);
    } catch {
      /* Storage may be disabled. */
    }
  }, [theme]);
  const value = useMemo(
    () =>
      // Keeps shared values stable between renders.
      ({
        theme,
        toggleTheme: () =>
          // Switches between light and dark themes.
          setTheme((value) =>
            // Switches between light and dark themes.
            value === "light" ? "dark" : "light",
          ),
      }),
    [theme],
  );
  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}
export const useTheme = () =>
  // Reads the current theme controls.
  useContext(ThemeContext);
