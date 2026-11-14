import { createContext, useContext, useEffect, useState } from "react";
import sendAction, { TOKEN_KEY, prepareOfflineWorkspace } from "../services/server.js";
const AuthContext = createContext(null);
export function AuthProvider({ children }) {
  // Shares the signed-in account across pages.
  const [token, setToken] = useState(() =>
    // Reads the initial saved state.
    localStorage.getItem(TOKEN_KEY),
  );
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(token));
  const [sessionError, setSessionError] = useState("");
  const [retryCount, setRetryCount] = useState(0);
  function logout() {
    // Clears the current login session.
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem("utilityhub_user");
    setToken(null);
    setUser(null);
    setSessionError("");
    setLoading(false);
  }
  useEffect(() => {
    // Synchronizes page state and cleans up listeners.
    window.addEventListener("utilityhub:unauthorized", logout);
    return () =>
      // Runs the returned operation when called.
      window.removeEventListener("utilityhub:unauthorized", logout);
  }, []);
  useEffect(() => {
    // Loads the account for the saved token.
    if (!token) return;
    const controller = new AbortController();
    setLoading(true);
    setSessionError("");
    sendAction(
      "getAccount",
      {},
      {
        signal: controller.signal,
      },
    )
      .then(({ data }) => {
        localStorage.setItem("utilityhub_user", JSON.stringify(data.user));
        setUser(data.user);
        void prepareOfflineWorkspace().catch(() => {});
      })
      .catch((error) => {
        // Handles a failed operation.
        if (controller.signal.aborted) return;
        if (error.status === 401) logout();
        else
          setSessionError(
            "We could not check your session. Make sure the backend and MongoDB are running.",
          );
      })
      .finally(() => {
        // Releases the completed request state.
        if (!controller.signal.aborted) setLoading(false);
      });
    return () =>
      // Cancels pending work and releases resources.
      controller.abort();
  }, [token, retryCount]);
  async function authenticate(action, details) {
    // Signs in or registers an account.
    const { data } = await sendAction(action, details);
    localStorage.setItem(TOKEN_KEY, data.token);
    localStorage.setItem("utilityhub_user", JSON.stringify(data.user));
    setToken(data.token);
    setUser(data.user);
    setSessionError("");
    void prepareOfflineWorkspace().catch(() => {});
  }
  const value = {
    user,
    loading,
    sessionError,
    logout,
    login: (details) =>
      // Signs in using the submitted credentials.
      authenticate("login", details),
    register: (details) =>
      // Registers the submitted account details.
      authenticate("register", details),
    retrySession: () =>
      // Requests fresh server data.
      setRetryCount(
        (count) =>
          // Increments the refresh counter.
          count + 1,
      ),
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export const useAuth = () =>
  // Reads the current account context.
  useContext(AuthContext);
