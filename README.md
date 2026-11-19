# UtilityHub

A college mini project with six tools: **PDF tools, document converter, tasks and reminders, expense tracker, sticky notes, and image compressor**.

**Live website:** [utilityhub-phi.vercel.app](https://utilityhub-phi.vercel.app/) · **Backend health:** [utilityhub-api-rnnc.onrender.com/health](https://utilityhub-api-rnnc.onrender.com/health)

## File privacy and the installed app

In version 1.6, PDF tools, document conversion and image processing run **only in the browser**, online and offline. Selected files, extracted text and generated documents never go to Express. The server rejects every former file action and multipart request before body parsing. Files and generated results are not saved in the service-worker cache, IndexedDB or MongoDB. Download a result to keep it; original files are not edited.

The website and PWA use the same converter. The footer shows the version and build. The app checks for new workers at startup, on focus/reconnect, and periodically. Use **Update app** in the navbar or **Check for updates** in the footer; download results and save forms first. An active conversion blocks an update. A PWA installed from localhost is a separate installation from the hosted site: open the live site in your normal browser and install that origin for future cloud updates. See [PWA_GUIDE.md](PWA_GUIDE.md).

Tasks, notes, expenses and account details still sync to your authenticated MongoDB workspace. That account data is separate from local file processing. Offline workspace records and queued edits stay in this browser's account-specific IndexedDB and sync on reconnect.

## Features

| Tool | What it does | Login |
| --- | --- | --- |
| PDF tools | Compress, merge/reorder, split selected pages, make PDFs from images or text | No |
| Document converter | PDF→DOCX, DOCX→PDF, UTF-8 TXT→PDF, JPG/PNG→PDF | No |
| Tasks and reminders | CRUD, priorities, due times, filters, in-app and browser reminders | Yes |
| Expense tracker | Expenses, budgets, alerts, charts and CSV/PDF export | Yes |
| Sticky notes | Private colored notes, pins, search and pagination | Yes |
| Image compressor | JPG/PNG input, JPEG/PNG/WebP output, quality and resizing | No |

PDF-to-Word preserves source page sizes, positioned editable text, detected tables (including blank cells), images and graphs. Scans remain images; OCR is not performed. Fonts, borderless tables and complex layouts can vary. Browser Word-to-PDF preserves UtilityHub's positioned exports; ordinary Word documents support text, alignment, page breaks, tables and embedded JPG/PNG images, with limitations for advanced Word layouts.

PDF compression keeps text, vectors and page geometry. Levels adjust supported RGB JPEG images; other content uses lossless structural optimization. Masked, CMYK and unsupported images remain unchanged. An already compact PDF is returned unchanged if the result would be larger.

## Technology

| Part | Libraries |
| --- | --- |
| Frontend | React, Vite, JavaScript, Tailwind CSS, React Router, Lucide, Recharts |
| Local documents | pdf-lib, fontkit, PDF.js, pdf-parse, docx, Mammoth, fflate, browser canvas |
| Account API | Node.js, Express, Mongoose, JWT, bcryptjs, Helmet, rate limiting |
| Reminders | node-cron, Nodemailer |
| PWA | Web app manifest, Workbox, vite-plugin-pwa |

Both source folders must be present for a frontend build because the converter shares `backend/src/utils/documentLayout.js` and `backend/src/utils/pdfStructure.js`. These shared modules run in the browser; importing their source does not contact a backend. Ghostscript, LibreOffice and multer are not used by the production API. Older native converter helpers remain for development regression comparisons only.

## Run locally

Install [Node.js 22.16 or newer](https://nodejs.org/en/download). MongoDB is needed for account features; public file tools work without it or Express.

```bash
git clone https://github.com/Nishant-095/miniproject.git utilityhub
cd utilityhub/frontend
npm install
cp .env.example .env
npm run dev
```

On Windows, use `copy .env.example .env`. Open [http://localhost:5173](http://localhost:5173). To test the production PWA:

```bash
npm run build
npm run preview -- --host 127.0.0.1 --port 5173 --strictPort
```

Stop the dev server first. The development server does not register a production service worker. After caching, file tools can run with the preview and backend servers stopped.

For accounts, install [MongoDB Community](https://www.mongodb.com/try/download/community) (Windows: install it as a service; Ubuntu: follow MongoDB's official Linux setup) or use Atlas. In a second terminal:

```bash
cd utilityhub/backend
npm install
cp .env.example .env
```

Set `MONGO_URI`, a unique `JWT_SECRET` of at least 32 random characters, and `CLIENT_URL=http://localhost:5173` in `.env`. Generate a secret with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Start MongoDB, then `npm start`. Frontend `VITE_SERVER_URL` defaults to `http://localhost:5000`; it is used for account APIs, never file tools. Keep real `.env` files private.

For hosting and free-plan limitations, see [DEPLOYMENT.md](DEPLOYMENT.md).

## File limits

- 80 MB per selected file and 80 MB combined; at most 10 files per operation.
- At most 1,000 PDF pages, including a merged result; 10 million extracted PDF text characters.
- TXT and typed text: 100,000 characters, UTF-8 and the bundled font's character set.
- Images: 40 megapixels each, 60 megapixels combined, 12,000 pixels per side; resize output up to 6,000 pixels. No enlargement; metadata is removed. Transparent pixels become white in JPEG. PNG output is lossless.
- DOCX archives: at most 100 MB expanded content. Advanced text boxes, unsupported image types and unusually wide/tall tables can require editing in a Word editor first.
- Browser memory and processing capacity vary; accepting 1,000 pages is not a guarantee that every device can process every document of that size.

Downloading clears the file form and releases the browser download URL after 60 seconds. A normal page cannot detect whether the browser's Save dialog was completed or cancelled.

## Reminders and budgets

Task reminders run every minute and at server startup. Browser reminders need permission and an open app. Installing the PWA does not add closed-app push notifications. Gmail credentials use an app password; optional SMTP settings are in `.env.example`. Render Free blocks common SMTP ports, so email is not enabled in the current free deployment. In-app notifications remain available when the backend runs.

Expenses use whole paise. Budgets warn at 80% and alert strictly above 100%, overall and per category. Exports cover the selected month, up to 5,000 expense rows. Offline account edits sync in order; avoid editing the same record on multiple devices at once.

## API endpoints

All account actions use `POST /server?action=NAME` with a JSON body. Protected actions require `Authorization: Bearer TOKEN`. `GET /health` returns live database status. File content is never part of this API.

| Method | Route/action | Description |
| --- | --- | --- |
| GET | `/health` | Database health check |
| POST | `serverHealth` | API and database status |
| POST | `programStatus` | Reports `fileProcessing: client`, `uploads: false` |
| POST | `register`, `login` | Create an account / receive a JWT |
| POST | `getAccount`, `offlineSnapshot` | Current user / account workspace for offline use |
| POST | `listTasks`, `getTask`, `createTask`, `updateTask`, `deleteTask` | Task CRUD |
| POST | `todayTasks`, `recentActivity` | Dashboard summaries |
| POST | `listNotifications`, `reminderSettings`, `readNotification`, `readAllNotifications` | Reminder preferences and notification bell |
| POST | `listExpenses`, `getExpense`, `createExpense`, `updateExpense`, `deleteExpense` | Expense CRUD |
| POST | `getBudget`, `saveBudget`, `expenseSummary`, `exportExpenses` | Budgets, charts and expense export |
| POST | `listNotes`, `createNote`, `updateNote`, `deleteNote` | Notes CRUD |
| POST | `compressPdf`, `mergePdfs`, `splitPdf`, `imagesToPdf`, `textToPdf`, `convertDocument`, `processImage` | **410 Gone** before body parsing: file tools are client-only |

## MongoDB schema — User

The implementation is in `backend/src/models/User.js`. Mongoose stores documents in the `users` collection.

| Field       | Type     | Rules                                                                                                                                          |
| ----------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `_id`       | ObjectId | Generated by MongoDB                                                                                                                           |
| `name`      | String   | Required; trimmed; 2–60 characters                                                                                                             |
| `email`     | String   | Required; unique index; trimmed; lowercase; valid email pattern; max 254 characters                                                            |
| `password`  | String   | Required; raw password at least 8 characters, at most 72 UTF-8 bytes; hashed with bcrypt cost 12 before save; excluded from queries by default |
| `createdAt` | Date     | Added automatically by Mongoose timestamps                                                                                                     |
| `updatedAt` | Date     | Updated automatically by Mongoose timestamps                                                                                                   |
| `__v`       | Number   | Mongoose internal version field                                                                                                                |

Example stored document (hash shortened for illustration):

```json
{
  "_id": "generated-object-id",
  "name": "Test Student",
  "email": "student@example.com",
  "password": "$2b$12$...",
  "createdAt": "2026-10-25T00:00:00.000Z",
  "updatedAt": "2026-10-25T00:00:00.000Z",
  "__v": 0
}
```

## MongoDB schema — Task

Implemented in `backend/src/models/Task.js`; collection `tasks`. Every task query includes the signed-in user ID.

| Field                                  | Type                         | Rules/default                                                   |
| -------------------------------------- | ---------------------------- | --------------------------------------------------------------- |
| `user`                                 | ObjectId → User              | Required, indexed; assigned by the server                       |
| `title`                                | String                       | Required, trimmed, 1–120 characters; one line                   |
| `description`                          | String                       | Trimmed, up to 2,000 characters; empty string                   |
| `priority`                             | String enum                  | low / medium / high; medium                                     |
| `category`                             | String                       | Trimmed, up to 40 characters; General                           |
| `dueAt`                                | Date or null                 | UTC instant; server requires ISO time with Z or an offset       |
| `timeZone`                             | String                       | Valid IANA timezone; Asia/Kolkata; used in email formatting     |
| `completed`                            | Boolean                      | false                                                           |
| `completedAt`                          | Date or null                 | Set on completion, cleared on reopening; used for today’s count |
| `reminderVersion`                      | Number                       | Internal; starts at zero, increments when rearmed/rescheduled   |
| `reminderQueued`                       | Boolean                      | Internal; false until a notification is queued                  |
| `_id`, `createdAt`, `updatedAt`, `__v` | ObjectId, Date, Date, Number | Mongoose defaults; optimistic concurrency for edits             |

Indexes: `{user, completed, dueAt}` and `{completed, reminderQueued, dueAt}`, plus user. Internal reminder fields and `__v` are removed from task responses. The backend validates types, rejects unknown fields, and rejects impossible calendar dates. It returns 404 for a missing or another user’s task.

## MongoDB schema — Notification

Implemented in `backend/src/models/Notification.js`; collection `notifications`. This collection is both the persistent bell history and a small email outbox.

| Field                                  | Type                     | Rules/default                                           |
| -------------------------------------- | ------------------------ | ------------------------------------------------------- |
| `user`, `task`                         | ObjectId → User, Task    | Required; user owns the reminder                        |
| `reminderVersion`                      | Number                   | Required; the task revision this reminder belongs to    |
| `title`, `dueAt`                       | String, Date             | Required snapshot of title/deadline                     |
| `readAt`                               | Date or null             | null means unread                                       |
| `emailStatus`                          | String enum              | pending / sending / sent / cancelled; pending           |
| `emailAttempts`                        | Number                   | Starts at zero; increments on claimed attempts          |
| `nextAttemptAt`                        | Date                     | Earliest retry time; now                                |
| `emailLockUntil`, `emailClaimToken`    | Date or null, String     | Internal expiring lease and worker token                |
| `sentAt`                               | Date or null             | SMTP acceptance time                                    |
| `lastError`                            | String                   | Internal generic delivery error, maximum 300 characters |
| `_id`, `createdAt`, `updatedAt`, `__v` | Standard Mongoose fields | Automatically maintained                                |

Indexes: unique `{task, reminderVersion}`, `{user, createdAt:-1}`, and `{emailStatus, nextAttemptAt}`. The public reminder response contains only `_id`, task, title, dueAt, readAt, emailStatus, sentAt, and createdAt. Cancelled reminders are hidden from the bell. No SMTP credentials are stored here.

## MongoDB schema — Activity

Implemented in `backend/src/models/Activity.js`; collection `activities`.

| Field                                  | Type                     | Rules/default                                                                                                                                                                  |
| -------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `user`                                 | ObjectId → User          | Required; used in every activity query                                                                                                                                         |
| `task`                                 | ObjectId → Task or null  | Optional reference; the title remains after deletion                                                                                                                           |
| `action`                               | String enum              | task_created / task_updated / task_completed / task_reopened / task_deleted / expense_created / expense_updated / expense_deleted / note_created / note_updated / note_deleted |
| `title`                                | String                   | Required activity title snapshot; maximum 120 characters                                                                                                                       |
| `_id`, `createdAt`, `updatedAt`, `__v` | Standard Mongoose fields | Automatically maintained                                                                                                                                                       |

Index: `{user, createdAt:-1}`. The dashboard reads ten recent records. Activity logging is best effort; a logging failure does not undo a successful task update. Transactions/replica-set setup are not required for this project. Expense, Budget, BudgetAlert, and Note are implemented below. File processing adds no collections.

## MongoDB schema — Expense

Implemented in `backend/src/models/Expense.js`; collection `expenses`.

| Field                                  | Type                     | Rules/default                                                                                               |
| -------------------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `user`                                 | ObjectId → User          | Required; assigned by the server                                                                            |
| `amountPaise`                          | Number                   | Required safe integer, 1–1,000,000,000; INR 0.01–1,00,00,000                                                |
| `category`                             | String enum              | Food, Transport, Shopping, Bills, Education, Health, Entertainment, Other                                   |
| `date`                                 | String                   | Required calendar date YYYY-MM-DD; server validates real dates in 2000–2099                                 |
| `note`                                 | String                   | Trimmed, maximum 300 characters and eight lines; empty by default; server rejects binary control characters |
| `paymentMethod`                        | String enum              | cash / card / upi / bank transfer / other; upi                                                              |
| `_id`, `createdAt`, `updatedAt`, `__v` | Standard Mongoose fields | Automatically maintained                                                                                    |

Indexes: user and `{user, date:-1, _id:-1}`. Responses omit `__v` and add `amount`, an exact decimal string such as `"123.45"`. Dates are calendar strings so changing timezone cannot move an expense to another month. List, summary, detail, mutation, and export queries always include the JWT owner. Private financial responses use Cache-Control: no-store.

## MongoDB schema — Budget

Implemented in `backend/src/models/Budget.js`; collection `budgets`.

| Field                                  | Type                     | Rules/default                                                                                                        |
| -------------------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `user`                                 | ObjectId → User          | Required                                                                                                             |
| `month`                                | String                   | Required YYYY-MM in 2000–2099                                                                                        |
| `overallPaise`                         | Number or null           | Safe integer 0–1,000,000,000; null means unset                                                                       |
| `categories`                           | Array                    | At most eight `{category, limitPaise}` entries, without subdocument IDs; server rejects duplicate/unknown categories |
| `categories[].limitPaise`              | Number                   | Required safe integer 0–1,000,000,000                                                                                |
| `revision`                             | Number                   | Starts at zero; increments when a saved configuration changes                                                        |
| `_id`, `createdAt`, `updatedAt`, `__v` | Standard Mongoose fields | Automatically maintained; optimistic concurrency for saves                                                           |

Unique index: `{user, month}`. Overall and category limits are checked independently; their sum need not equal the overall budget. Zero means a real zero-spend limit; null or an omitted category means no limit. Public budget responses contain month, overallPaise, and categories, without revision or other queue metadata.

## MongoDB schema — BudgetAlert

Implemented in `backend/src/models/BudgetAlert.js`; collection `budgetalerts`. This is the email outbox; live UI alerts are calculated from current expenses and limits.

| Field                                  | Type                     | Rules/default                                   |
| -------------------------------------- | ------------------------ | ----------------------------------------------- |
| `user`, `budget`                       | ObjectId → User, Budget  | Required owners/references                      |
| `month`, `revision`                    | String, Number           | Budget month and configuration revision         |
| `scope`                                | String enum              | overall or an expense category                  |
| `level`                                | String enum              | warning / exceeded                              |
| `spentPaise`, `limitPaise`             | Number                   | Required amount snapshots                       |
| `emailStatus`                          | String enum              | pending / sending / sent / cancelled; pending   |
| `emailAttempts`, `nextAttemptAt`       | Number, Date             | Zero attempts initially; earliest retry time    |
| `emailLockUntil`, `emailClaimToken`    | Date or null, String     | Internal five-minute lease and worker token     |
| `sentAt`, `lastError`                  | Date or null, String     | SMTP acceptance time and internal generic error |
| `_id`, `createdAt`, `updatedAt`, `__v` | Standard Mongoose fields | Automatically maintained                        |

Indexes: unique `{budget, revision, scope, level}`, `{user, month}`, and `{emailStatus, nextAttemptAt}`. The summary action returns only the email status of a current alert, alongside its scope/amounts; it never exposes leases, errors, or credentials.

## MongoDB schema — Note

Implemented in `backend/src/models/Note.js`; collection `notes`. Every query includes the authenticated user ID.

| Field                    | Type            | Rules                                                    |
| ------------------------ | --------------- | -------------------------------------------------------- |
| `_id`                    | ObjectId        | Generated by MongoDB                                     |
| `user`                   | ObjectId → User | Required, indexed; always assigned by the server         |
| `title`                  | String          | Trimmed, optional, default empty, maximum 100 characters |
| `content`                | String          | Trimmed, required, 1–5,000 characters                    |
| `color`                  | String enum     | yellow/pink/blue/green/purple; yellow by default         |
| `pinned`                 | Boolean         | False by default                                         |
| `createdAt`, `updatedAt` | Date            | Automatic timestamps                                     |
| `__v`                    | Number          | Mongoose version; omitted from lists                     |

Index: `{user:1, pinned:-1, updatedAt:-1}`. List results sort pinned first, then newest update and ID. Search escapes regex metacharacters and accepts at most 100 characters. Updates reject unknown fields and non-string text rather than coercing objects. Note activity stores a title/content snapshot; deleting a note does not erase its activity history.

Note create body:

```json
{
  "title": "Project idea",
  "content": "Make the daily tools easy to use.",
  "color": "yellow",
  "pinned": true
}
```

## Verification

Run `npm test` in each application folder, then `npm run build` in `frontend`. Tests cover file upload rejection before parsing/storage, client dispatch without network requests, file validation and original integrity, the 1,000-page limit, account APIs, notifications and PWA update safety.

Backend account tests use separate temporary MongoDB databases (`TEST_MONGO_URI`, default localhost). Older geometry/native comparison tests also use Ghostscript and LibreOffice; install those only if running the full development regression suite. They are not required by the production app or Docker image. Local SMTP tests do not send external email.

## Troubleshooting

| Issue | Check |
| --- | --- |
| PWA looks older than the website | Check its origin and footer version; use Update app / Check for updates. A localhost installation does not receive hosted updates. |
| File tool works only on first connected visit | Wait for the app-ready cache message before going offline. Reconnect once if offline setup failed. |
| Conversion rejects a complex document | Read the message; use supported fonts/images, reduce the selected page range, or edit the document in a Word editor. There is no backend upload fallback. |
| Account features do not connect | Check MongoDB, `VITE_SERVER_URL`, the exact `CLIENT_URL` and backend health. Public file tools remain local. |
| First cloud account request is slow | Render Free may take about a minute to wake up. |

## Screenshots

![Home](home-preview.jpg)
![Image compressor](image-compressor-preview.jpg)

## Project report

Use [COLLEGE_REPORT.md](COLLEGE_REPORT.md) for the abstract, architecture, and future scope. Use [PROJECT_EXPLANATION.md](PROJECT_EXPLANATION.md) to study the main flows and demonstrate them in your own words.
