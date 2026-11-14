# Free deployment: Vercel + Render + MongoDB Atlas

The frontend runs on Vercel Hobby. The Express backend runs in a Docker container on Render Free, with Ghostscript and LibreOffice installed. MongoDB Atlas Free stores accounts, tasks, expenses, notes and notifications.

## Live installation

| Service | Address |
| --- | --- |
| Website | [utilityhub-phi.vercel.app](https://utilityhub-phi.vercel.app/) |
| Backend health | [utilityhub-api-rnnc.onrender.com/health](https://utilityhub-api-rnnc.onrender.com/health) |
| Source | [Nishant-095/miniproject](https://github.com/Nishant-095/miniproject) |

Deployment checked on 14 November 2026: MongoDB connection, production CORS/preflight, login validation and protected access, PDF merge/order, page extraction, Ghostscript compression, LibreOffice Word-to-PDF, PDF-to-Word with a table and chart image, image resizing, and PDF creation through the live website. These checks used small sample documents; they do not establish a large-file capacity guarantee.

Vercel deploys new pushes to `main`. This Render service uses the public repository URL: after backend changes, open its dashboard and choose **Manual Deploy → Deploy latest commit**. Public-URL services do not auto-deploy without a connected Git provider. See [Render deploys](https://render.com/docs/deploys).

## 1. MongoDB Atlas

Create a **Free** cluster. Create a password-authenticated database user with the specific `readWrite` role on database `utilityhub`; leave the collection blank. Save the password privately. The application does not need Atlas administrator access.

Obtain the Node.js connection string from **Connect → Drivers**. Replace the username and password placeholders and add `/utilityhub` before the query string. Percent-encode special characters in the password. Keep this URI out of Git, screenshots and frontend settings.

Under **Database & Network Access → IP Access List**, allow the Render service's outbound IP ranges, shown in that service's **Connect → Outbound** panel. Check the ranges for the actual service region. Do not add your Vercel frontend's addresses: only the backend connects to MongoDB.

## 2. Render backend

Create a **Web Service** from this repository with these settings:

| Setting | Value |
| --- | --- |
| Branch | `main` |
| Language/runtime | Docker |
| Root directory | Leave blank |
| Dockerfile path | `./backend/Dockerfile` |
| Docker build context | Repository root (`.`) |
| Compute plan | **Free ($0/month)** |
| Health check path | `/health` |

Add these environment variables in the Render dashboard:

| Variable | Value |
| --- | --- |
| `MONGO_URI` | Your private Atlas connection URI |
| `JWT_SECRET` | A unique random secret, at least 32 characters |
| `CLIENT_URL` | Exact Vercel production origin, such as `https://your-project.vercel.app` |
| `NODE_ENV` | `production` |
| `TRUST_PROXY` | `1` |
| `MAX_ACTIVE_FILE_JOBS` | `1` |

Render supplies `PORT`. The container uses `/tmp/utilityhub` for disposable conversion files. Do not add a persistent disk. `render.yaml` contains equivalent Blueprint settings; do not create a second service if you already created one manually.

Once the database allowlist and credentials are ready, deploy. `https://YOUR-SERVICE.onrender.com/health` must return status `ok` and database `connected`. The `/server` endpoint handles named POST actions; it is not a normal web page.

## 3. Vercel frontend

Import this repository into a **Hobby** project. Use the **repository root** as Root Directory and **Other** as framework. Keep both application folders in the checkout: PDF conversion shares two backend utility modules. Vercel installs frontend dependencies only; it does not run the Express backend.

The root `vercel.json` supplies installation, build, output and SPA fallback settings. Add this environment variable for Production:

```dotenv
VITE_SERVER_URL=https://YOUR-SERVICE.onrender.com
```

Use the backend origin without `/server` or a trailing slash. This value is public and must never contain a secret. Deploy, copy the resulting production origin into Render's `CLIENT_URL`, and redeploy the backend if that value changed. Changing a Vite environment variable requires a new frontend build.

If local development should also access the hosted API, `CLIENT_URL` accepts a comma-separated list of exact origins. Add only origins you use; a preview domain must be explicitly included. Do not use a wildcard.

## 4. Check the deployment

1. Open the production frontend over HTTPS and refresh a nested tool page.
2. Register a new account on the new cloud database, then sign in and create a task, note and expense. Local MongoDB accounts are separate and are not automatically copied.
3. Try a small PDF merge and DOCX-to-PDF conversion; these check both JavaScript and native conversion dependencies.
4. Install the PWA, wait for its offline-ready message, open the tools, then test offline mode. Existing offline workspace edits should sync after reconnecting.
5. Keep `.env` files private. Only `.env.example` files belong in Git.

## Free-plan limits

- Render Free sleeps after 15 minutes without inbound traffic. The next request can take about a minute to wake it. Scheduled reminder checks do not run while it sleeps; overdue checks resume when it wakes. Installing the PWA does not provide closed-app push reminders.
- Render Free provides 512 MB RAM and 0.1 CPU. Only one heavy conversion runs at once with the settings above. The application accepts up to 1,000 PDF pages, but that input limit does not guarantee enough memory or time for a large conversion on free hosting. The offline PWA can process supported files on the user's device.
- Render Free blocks outbound SMTP on ports 25, 465 and 587. The current Nodemailer/Gmail setup cannot send emails on that plan. In-app alerts remain available; email requires a supported HTTPS email integration or different hosting.
- Render's free instance hours are shared across the workspace. Existing free services share the monthly allowance. Free instances have ephemeral storage; MongoDB holds permanent records, while temporary uploaded/output files can disappear on restart.
- Atlas Free has a storage limit. Monitor usage in the Atlas dashboard. Vercel Hobby is intended for personal, non-commercial projects; review current provider limits before using this beyond a college demo.

Official references: [Render Free](https://render.com/docs/free), [Render Docker](https://render.com/docs/docker), [Vercel project configuration](https://vercel.com/docs/project-configuration/vercel-json), [Atlas Free limitations](https://www.mongodb.com/docs/atlas/reference/free-shared-limitations/).
