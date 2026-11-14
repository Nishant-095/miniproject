import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { CheckCircle2, X } from "lucide-react";
const ToastContext = createContext(null);
function Toast({ toast, remove }) {
  // Displays and automatically dismisses a notification.
  useEffect(() => {
    // Synchronizes page state and cleans up listeners.
    const timer = setTimeout(
      () =>
        // Runs this step after a short delay.
        remove(toast.id),
      4500,
    );
    return () =>
      // Stops the timer when no longer needed.
      clearTimeout(timer);
  }, [toast.id, remove]);
  return (
    <div className="toast" role="status">
      <CheckCircle2 size={19} aria-hidden="true" />
      <span>{toast.message}</span>
      <button
        onClick={() =>
          // Removes the selected item.
          remove(toast.id)
        }
        aria-label="Dismiss notification"
      >
        <X size={16} />
      </button>
    </div>
  );
}
export function ToastProvider({ children }) {
  // Shares brief notification messages across pages.
  const [toasts, setToasts] = useState([]);
  const remove = useCallback((id) => {
    // Removes the selected item.
    setToasts((items) =>
      // Removes the dismissed notification message.
      items.filter(
        (toast) =>
          // Checks which items match the condition.
          toast.id !== id,
      ),
    );
  }, []);
  const notify = useCallback((message) => {
    // Adds a brief notification message.
    setToasts((items) =>
      // Adds a message while limiting visible notifications.
      [
        ...items.slice(-2),
        {
          id: crypto.randomUUID(),
          message,
        },
      ],
    );
  }, []);
  return (
    <ToastContext.Provider value={notify}>
      {children}
      <div className="toast-stack" aria-live="polite" aria-atomic="false">
        {toasts.map((toast) => (
          // Builds a value for each item.
          <Toast key={toast.id} toast={toast} remove={remove} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}
export const useToast = () =>
  // Reads the notification message helper.
  useContext(ToastContext);
