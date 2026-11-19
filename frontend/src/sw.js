import { clientsClaim, setCacheNameDetails } from "workbox-core";
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from "workbox-precaching";
import { registerRoute } from "workbox-routing";
import { isAppPath, reminderTarget } from "./utils/pwaPolicy.js";
import { APP_VERSION, APP_BUILD } from "./utils/version.js";
setCacheNameDetails({
  prefix: "utilityhub",
});
// Vite fills this list with the built interface and every lazy tool bundle.
// There is deliberately no runtime caching of API responses or user files.
// Including the release changes the worker for every deployment.
self.addEventListener("message", event => {
  if (event.data?.type === "APP_VERSION") event.ports[0]?.postMessage({ version: APP_VERSION, build: APP_BUILD });
});
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
clientsClaim();
registerRoute(
  ({ request, url }) =>
    // Matches supported frontend navigation requests.
    request.mode === "navigate" &&
    url.origin === self.location.origin &&
    isAppPath(url.pathname),
  createHandlerBoundToURL("/index.html"),
);

// Wait for the user's Update button so an open form is never reloaded automatically.
self.addEventListener("message", (event) => {
  // Activates the waiting worker when requested.
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});
self.addEventListener("notificationclick", (event) => {
  // Opens the task linked to the reminder.
  event.notification.close();
  const target = reminderTarget(
    event.notification.data?.url,
    self.location.origin,
  );
  event.waitUntil(
    (async () => {
      // Opens or focuses the linked task page.
      const tabs = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      const tab = tabs.find(
        (client) =>
          // Checks which items match the condition.
          new URL(client.url).origin === self.location.origin,
      );
      if (tab) {
        await tab.navigate(target);
        await tab.focus();
      } else await self.clients.openWindow(target);
    })(),
  );
});
