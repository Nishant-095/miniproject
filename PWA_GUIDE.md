# UtilityHub PWA

The app remains installable, with shortcuts for **PDF tools, tasks, and expenses**. Its six tools are PDF tools, document converter, tasks/reminders, expense tracker, sticky notes, and image compressor.

## Run and install

Public file tools work without Express or MongoDB. For a local production build, in `frontend`:

```bash
npm run build
npm run preview -- --host 127.0.0.1 --port 5173 --strictPort
```

Use **http://localhost:5173/**. Stop a conflicting dev server first. Choose the navbar's **Install app** button when your browser offers installation, or use the browser menu. On Safari/iPhone, use Share → Add to Home Screen. Installation needs HTTPS or localhost; a phone's localhost refers to the phone itself. An embedded browser may show installation help instead of offering an OS install prompt.

## What works offline

All PDF, document and image actions run only in the browser, connected or offline. Express rejects the former file actions and multipart requests before parsing a body. PDF-to-Word accepts up to 1,000 pages and 10 million extracted text characters. Device memory and document complexity can impose lower practical limits.

After the app finishes caching, PDF creation, merging, splitting, compression, image processing, and document conversion work on the device. PDF-to-DOCX analyzes source page dimensions, columns, text coordinates and styles, and ruled table grids. Editable text boxes and tables keep their page positions; images and graphs are copied as movable images. Scanned text remains part of its image without OCR. Offline DOCX-to-PDF preserves these positioned outputs, plus ordinary tables and supported JPG/PNG images. Fonts can substitute, and rotated text can vary between Word editors; borderless tables, complex clipping and arbitrary layouts may vary. Unsupported table reading order is reported rather than silently discarded. PDF compression optimizes structure and re-encodes supported RGB JPEG images at the selected quality level. Text, vectors, page dimensions and unsupported/masked images are retained. It may save less than a native PDF compressor; an already compact file is kept unchanged if optimization would enlarge it.

Sign in while connected and leave the app open until it finishes preparing your workspace. The app saves an account-specific copy of tasks, notes, expenses, budgets, and activity in this browser's IndexedDB. You can read and edit those records and export expenses offline. Changes are queued and sent when the app is open and reconnects. The device copy persists across sign-out; clearing browser storage removes it and any unsynced changes. Changes on multiple devices are applied in sync order, so avoid editing the same record in two places at once.

New registration and sign-in require the server. Email requires the server and a network connection. Browser reminders can be checked while the app is open, but there is no guarantee of background reminders while it is closed. The service worker does not cache user uploads or generated output files.

Wait for the ready status after the first connected visit. Version 1.6 shows the version/build in the footer. It checks for updates on startup, focus, reconnection and every five minutes while open. **Check for updates** is also available in the footer. When a worker is ready, **Update app** remains in the navbar even if you dismiss the banner. Save forms and download results first; updating reloads the interface. An active file conversion prevents activation. Later keeps the current form. Old cached assets are cleaned after activation; uploaded files and results are never precached.

## Ubuntu desktop shortcut

Use the browser's normal installation option. A desktop shortcut may require right-click → Allow Launching. If Brave's Snap package creates a launcher that cannot open, check its `Exec=` line: the stable executable is `/snap/bin/brave`, followed by the existing profile/app-ID arguments. A missing desktop icon can be corrected by pointing `Icon=` to the installed UtilityHub icon. Keep the original launcher backed up before editing. A launcher originally installed from `http://localhost:5173` belongs to that origin and cannot receive a Vercel release. Install from [the live website](https://utilityhub-phi.vercel.app/) in your normal browser. Compare the version/build in the installed app with the live site. A desktop app-window shortcut pointing at the live URL also opens the hosted origin, but does not replace the browser's managed PWA installation.

## Implementation

- `public/manifest.webmanifest`: standalone display, install icons, and supported shortcuts.
- `src/sw.js`: Workbox precaching, supported-page navigation fallback, explicit update activation, and reminder clicks.
- `src/utils/pwaPolicy.js`: the allowed page paths and safe reminder link policy.
- `src/services/pwa.js`: install events, cache/update state, and connection status.
- `src/services/offlineFiles.js`: local PDF, document, image and export processing.
- `src/services/docxToPdf.js`: offline Word tables and embedded images.
- `backend/src/utils/documentLayout.js`: shared PDF table reconstruction imported into the browser build. Keep both source folders available when building the frontend.
- `src/services/offlineWorkspace.js`: account-specific IndexedDB workspace and queued changes.
- `InstallAppButton.jsx` / `AppUpdateButton.jsx` / `PwaStatus.jsx`: installation help and persistent update controls.
- `src/services/localFilePolicy.js`: size, signature and image dimension validation before local processing.
- `src/services/compressLocalPdf.js`: conservative local JPEG/PDF optimization.
- `backend/src/middleware/filePrivacy.js`: refuses old file actions before body parsing.
- `notificationWorker.js`: reuses the production PWA worker for reminders; development uses the narrower notification-only scope.

The production build precaches the built interface and lazy page modules. Named POST actions at `/server?action=NAME` are never cached. Installing the PWA does not create closed-app Web Push reminders; browser reminders require permission and an open app/tab. Email reminders still run on the Node server.

`npm run dev` does not register the production worker. If switching a previously installed origin back to development, unregister its old worker in DevTools → Application → Service Workers, then reload. Use a separate origin for development if switching frequently.

## Hosting

Serve `frontend/dist` at an HTTPS site root with a React Router fallback to `index.html`. Serve `sw.js`, the manifest and `release.json` with revalidation/no-cache. The release JSON is not precached. Set `VITE_SERVER_URL` to the reachable HTTPS Express server and allow the frontend origin in `CLIENT_URL`. The current manifest/router/worker assume root hosting.
