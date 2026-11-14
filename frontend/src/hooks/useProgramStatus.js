import { useEffect, useState } from "react";
import sendAction from "../services/server.js";
export default function useProgramStatus() {
  // Checks the installed document converters.
  const [status, setStatus] = useState(null);
  useEffect(() => {
    // Synchronizes page state and cleans up listeners.
    const controller = new AbortController();
    sendAction(
      "programStatus",
      {},
      {
        signal: controller.signal,
        timeout: 20000,
      },
    )
      .then(({ data }) =>
        // Handles the completed operation.
        setStatus(data),
      )
      .catch(() => {
        // Handles a failed operation.
      });
    return () =>
      // Cancels pending work and releases resources.
      controller.abort();
  }, []);
  return status;
}
