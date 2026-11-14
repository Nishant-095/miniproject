import { useEffect } from "react";
export default function usePageTitle(title) {
  // Updates the browser tab title.
  useEffect(() => {
    // Sets the title for this page.
    document.title = `${title} | UtilityHub`;
  }, [title]);
}
