# UtilityHub PWA

The app remains installable, with shortcuts for **PDF tools, tasks, and expenses**. Its six tools are PDF tools, document converter, tasks/reminders, expense tracker, sticky notes, and image compressor.

## Run and install

Keep MongoDB and Express running. In `frontend`:

```bash
npm run build
npm run preview -- --host 127.0.0.1 --port 5173 --strictPort
```

Use **http://localhost:5173/**. Stop a conflicting dev server first. Choose the navbar's **Install app** button when your browser offers installation, or use the browser menu. On Safari/iPhone, use Share → Add to Home Screen. Installation needs HTTPS or localhost; a phone's localhost refers to the phone itself. An embedded browser may show installation help instead of offering an OS install prompt.

## What works offline

PDF-to-Word accepts up to 1,000 PDF pages and 10 million text characters, using the same limits as the server.

After the app finishes caching, PDF creation, merging, splitting, compression, image processing, and document conversion work on the device. PDF-to-DOCX analyzes source page dimensions, columns, text coordinates and styles, and ruled table grids. Editable text boxes and tables keep their page positions; images and graphs are copied as movable images. Scanned text remains part of its image without OCR. Offline DOCX-to-PDF preserves these positioned outputs, plus ordinary tables and supported JPG/PNG images. Fonts can substitute, and rotated text can vary between Word editors; borderless tables, complex clipping and arbitrary layouts may vary. Unsupported table reading order is reported rather than silently discarded. Offline PDF compression optimizes the PDF structure; its levels do not change the result and it may save less space than Ghostscript.

Sign in while connected and leave the app open until it finishes preparing your workspace. The app saves an account-specific copy of tasks, notes, expenses, budgets, and activity in this browser's IndexedDB. You can read and edit those records and export expenses offline. Changes are queued and sent when the app is open and reconnects. The device copy persists across sign-out; clearing browser storage removes it and any unsynced changes. Changes on multiple devices are applied in sync order, so avoid editing the same record in two places at once.

New registration and sign-in require the server. Email requires the server and a network connection. Browser reminders can be checked while the app is open, but there is no guarantee of background reminders while it is closed. The service worker does not cache user uploads or generated output files.

Wait for the ready status after the first connected visit. A new build offers **Update now / Later**. Save open forms before choosing Update now; it activates the waiting worker and reloads the interface. Later preserves the current form. After upgrading from an older version, Update now loads the current six-tool catalogue and removes outdated precached bundles.

## Ubuntu desktop shortcut

Use the browser's normal installation option. A desktop shortcut may require right-click → Allow Launching. If Brave's Snap package creates a launcher that cannot open, check its `Exec=` line: the stable executable is `/snap/bin/brave`, followed by the existing profile/app-ID arguments. A missing desktop icon can be corrected by pointing `Icon=` to the installed UtilityHub icon. Keep the original launcher backed up before editing. The current workspace shortcut has already been repaired.

## Implementation

- `public/manifest.webmanifest`: standalone display, install icons, and supported shortcuts.
- `src/sw.js`: Workbox precaching, supported-page navigation fallback, explicit update activation, and reminder clicks.
- `src/utils/pwaPolicy.js`: the allowed page paths and safe reminder link policy.
- `src/services/pwa.js`: install events, cache/update state, and connection status.
- `src/services/offlineFiles.js`: local PDF, document, image and export processing.
- `src/services/docxToPdf.js`: offline Word tables and embedded images.
- `backend/src/utils/documentLayout.js`: shared PDF table reconstruction used by server and PWA. Keep both source folders available when building the frontend.
- `src/services/offlineWorkspace.js`: account-specific IndexedDB workspace and queued changes.
- `InstallAppButton.jsx` / `PwaStatus.jsx`: installation help and status controls.
- `notificationWorker.js`: reuses the production PWA worker for reminders; development uses the narrower notification-only scope.

The production build precaches the built interface and lazy page modules. Named POST actions at `/server?action=NAME` are never cached. Installing the PWA does not create closed-app Web Push reminders; browser reminders require permission and an open app/tab. Email reminders still run on the Node server.

`npm run dev` does not register the production worker. If switching a previously installed origin back to development, unregister its old worker in DevTools → Application → Service Workers, then reload. Use a separate origin for development if switching frequently.

## Hosting

Serve `frontend/dist` at an HTTPS site root with a React Router fallback to `index.html`. Serve `sw.js` with revalidation/no-cache. Set `VITE_SERVER_URL` to the reachable HTTPS Express server and allow the frontend origin in `CLIENT_URL`. The current manifest/router/worker assume root hosting.
