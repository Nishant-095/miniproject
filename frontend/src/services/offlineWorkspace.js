// A per-account copy of the workspace and a durable queue of offline edits.
const DB_NAME = "utilityhub-offline";
const DB_VERSION = 1;
let dbPromise;
function database() {
  if (!dbPromise) dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => request.result.createObjectStore("accounts");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}
async function accountTransaction(userId, callback) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("accounts", "readwrite"), store = tx.objectStore("accounts"), request = store.get(userId);
    let output;
    request.onsuccess = () => {
      try {
        const state = request.result || { snapshot: null, queue: [], localRead: {} };
        output = callback(state);
        if (output?.changed) store.put(state, userId);
      } catch (error) { tx.abort(); reject(error); }
    };
    tx.oncomplete = () => resolve(output?.value);
    tx.onerror = () => reject(tx.error || new Error("Offline storage failed."));
    tx.onabort = () => reject(tx.error || new Error("Offline storage failed."));
  });
}
export function currentOfflineUser() {
  try { return JSON.parse(localStorage.getItem("utilityhub_user") || "null"); } catch { return null; }
}
function announce(detail) { window.dispatchEvent(new CustomEvent("utilityhub:sync-status", { detail })); }
export async function saveSnapshot(userId, snapshot) {
  return accountTransaction(userId, state => {
    if (state.queue.length) return { value: false };
    state.snapshot = snapshot;
    return { changed: true, value: true };
  });
}
export async function hasPendingChanges(userId) {
  return accountTransaction(userId, state => ({ value: state.queue.length > 0 }));
}
export async function syncWorkspace(userId, request) {
  if (!userId || navigator.onLine === false) return;
  const work = async () => {
    while (true) {
      const item = await accountTransaction(userId, state => ({ value: state.queue[0] || null }));
      if (!item) break;
      try { await request(item.action, item.fields); }
      catch (error) {
        if (!(error.status === 404 && /^delete/.test(item.action))) {
          announce({ error: "Some offline changes could not sync. Reconnect and try again.", pending: true });
          throw error;
        }
      }
      await accountTransaction(userId, state => {
        if (state.queue[0]?.key === item.key) state.queue.shift();
        return { changed: true };
      });
    }
    const { data } = await request("offlineSnapshot", {});
    await saveSnapshot(userId, data);
    announce({ pending: false, ready: true });
  };
  if (navigator.locks?.request) return navigator.locks.request(`utilityhub-sync-${userId}`, work);
  if (syncWorkspace.pending) return syncWorkspace.pending;
  syncWorkspace.pending = work().finally(() => { syncWorkspace.pending = null; });
  return syncWorkspace.pending;
}
const iso = () => new Date().toISOString();
const newId = () => [...crypto.getRandomValues(new Uint8Array(12))].map(n => n.toString(16).padStart(2, "0")).join("");
const asPaise = value => Math.round(Number(value) * 100);
const pageResult = (items, page, limit) => ({ page, limit, total: items.length, pages: Math.max(1, Math.ceil(items.length / limit)) });
const overdue = item => !item.completed && item.dueAt && new Date(item.dueAt).getTime() < Date.now();
function shiftMonth(month, offset) {
  const [year, m] = month.split("-").map(Number), date = new Date(Date.UTC(year, m - 1 + offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}
function expenseSummary(snapshot, month) {
  const entries = snapshot.expenses.filter(x => x.date?.startsWith(month));
  const sums = new Map();
  for (const item of entries) { const row = sums.get(item.category) || { category: item.category, totalPaise: 0, count: 0 }; row.totalPaise += item.amountPaise; row.count++; sums.set(item.category, row); }
  const categories = [...sums.values()].sort((a,b) => b.totalPaise - a.totalPaise || a.category.localeCompare(b.category));
  const totalPaise = entries.reduce((sum, x) => sum + x.amountPaise, 0);
  const found = snapshot.budgets.find(x => x.month === month), budget = { month, overallPaise: found?.overallPaise ?? null, categories: found?.categories || [] };
  const limits = [...(budget.overallPaise === null ? [] : [{ scope: "overall", spentPaise: totalPaise, limitPaise: budget.overallPaise }]), ...budget.categories.map(x => ({ scope: x.category, spentPaise: sums.get(x.category)?.totalPaise || 0, limitPaise: x.limitPaise }))];
  const progress = limits.map(row => ({ ...row, level: row.spentPaise > row.limitPaise ? "exceeded" : row.limitPaise > 0 && row.spentPaise * 5 >= row.limitPaise * 4 ? "warning" : null, percent: row.limitPaise > 0 ? row.spentPaise / row.limitPaise * 100 : null }));
  const [year, number] = month.split("-").map(Number), length = new Date(Date.UTC(year, number, 0)).getUTCDate();
  const daily = Array.from({length}, (_, i) => { const date = `${month}-${String(i + 1).padStart(2, "0")}`; return { date, day: i + 1, totalPaise: entries.filter(x => x.date === date).reduce((sum,x) => sum + x.amountPaise, 0) }; });
  const monthly = Array.from({length: 12}, (_, i) => { const key = shiftMonth(month, i - 11); return { month: key, totalPaise: snapshot.expenses.filter(x => x.date?.startsWith(key)).reduce((sum,x) => sum + x.amountPaise, 0) }; });
  return { month, totalPaise, count: entries.length, categories, budget, remainingPaise: budget.overallPaise === null ? null : budget.overallPaise - totalPaise, daily, monthly, progress, alerts: progress.filter(x => x.level).map(x => ({ ...x, emailStatus: "offline" })), emailConfigured: false, schedulerEnabled: false };
}
function expenseView(item) { return { ...item, amount: (item.amountPaise / 100).toFixed(2) }; }
function notesFor(snapshot, q, page) {
  const search = String(q || "").trim().toLowerCase(), all = snapshot.notes;
  const filtered = all.filter(x => `${x.title} ${x.content}`.toLowerCase().includes(search)).sort((a,b) => Number(b.pinned) - Number(a.pinned) || String(b.updatedAt).localeCompare(String(a.updatedAt)));
  return { notes: filtered.slice((page - 1) * 24, page * 24), total: filtered.length, pinned: all.filter(x => x.pinned).length, page, pages: Math.max(1, Math.ceil(filtered.length / 24)) };
}
function notificationsFor(state) {
  const stored = (state.snapshot.notifications || []).filter(x => x.emailStatus !== "cancelled");
  const local = state.snapshot.tasks.filter(x => overdue(x)).map(x => ({ _id: `local:${x._id}:${x.dueAt}`, task: x._id, title: x.title, dueAt: x.dueAt, createdAt: x.dueAt, readAt: state.localRead[`local:${x._id}:${x.dueAt}`] || null, emailStatus: "offline" }));
  const taskIds = new Set(stored.map(x => String(x.task)));
  const notifications = [...stored, ...local.filter(x => !taskIds.has(x.task))].sort((a,b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0,20);
  return { notifications, unreadCount: notifications.filter(x => !x.readAt).length };
}
export async function offlineAction(action, fields = {}) {
  const user = currentOfflineUser();
  if (!user?.id) throw new Error("Sign in while connected before using your workspace offline.");
  let output = await accountTransaction(user.id, state => {
    if (!state.snapshot) throw new Error("Offline workspace is not ready. Sign in and connect once to download your records.");
    const s = state.snapshot, now = iso(), page = Number(fields.page || 1), limit = Number(fields.limit || 20);
    const queue = (name, data) => state.queue.push({ key: crypto.randomUUID(), action: name, fields: data });
    const activity = (name, title, task = null) => s.activities.unshift({ _id: newId(), action: name, title: String(title || "").slice(0,120), task, createdAt: now });
    if (action === "getAccount") return { value: { user } };
    if (action === "reminderSettings") return { value: { emailConfigured: false, schedulerEnabled: false } };
    if (action === "listNotifications") return { value: notificationsFor(state) };
    if (action === "readNotification" || action === "readAllNotifications") {
      const all = notificationsFor(state).notifications, selected = action === "readAllNotifications" ? all : all.filter(x => x._id === fields.id);
      for (const item of selected) { if (item._id.startsWith("local:")) state.localRead[item._id] = now; else { const found = s.notifications.find(x => x._id === item._id); if (found) found.readAt = now; queue("readNotification", { id: item._id }); } }
      return { changed: true, value: { message: "Reminders marked as read." } };
    }
    if (action === "listTasks") {
      const all = s.tasks, counts = { all: all.length, pending: all.filter(x => !x.completed).length, completed: all.filter(x => x.completed).length, overdue: all.filter(overdue).length };
      const q = String(fields.q || "").toLowerCase(), filter = fields.status || "all";
      const rows = all.filter(x => (filter === "all" || (filter === "completed" ? x.completed : filter === "pending" ? !x.completed : overdue(x))) && `${x.title} ${x.description} ${x.category}`.toLowerCase().includes(q)).sort((a,b) => Number(a.completed)-Number(b.completed) || String(a.dueAt || "").localeCompare(String(b.dueAt || "")) || String(b.createdAt).localeCompare(String(a.createdAt)));
      return { value: { tasks: rows.slice((page-1)*limit, page*limit), counts, pagination: pageResult(rows,page,limit) } };
    }
    if (action === "getTask") { const task = s.tasks.find(x => x._id === fields.id); if (!task) throw new Error("Task not found."); return { value: { task } }; }
    if (action === "todayTasks") {
      const start = new Date(fields.start).getTime(), end = new Date(fields.end).getTime();
      const inRange = value => value && new Date(value).getTime() >= start && new Date(value).getTime() < end;
      const due = s.tasks.filter(x => !x.completed && inRange(x.dueAt)).sort((a,b) => String(a.dueAt).localeCompare(String(b.dueAt)));
      return { value: { tasks: due.slice(0,8), dueToday: due.length, completedToday: s.tasks.filter(x => x.completed && inRange(x.completedAt)).length, overdue: s.tasks.filter(overdue).length, start: fields.start, end: fields.end } };
    }
    if (action === "recentActivity") return { value: { activities: s.activities.filter(x => !fields.tasksOnly || x.action.startsWith("task_")).slice(0,10) } };
    if (action === "listNotes") return { value: notesFor(s, fields.q, page) };
    if (action === "listExpenses") { const rows = s.expenses.filter(x => x.date?.startsWith(fields.month)).sort((a,b) => String(b.date).localeCompare(String(a.date)) || String(b.createdAt).localeCompare(String(a.createdAt))); return { value: { month: fields.month, expenses: rows.slice((page-1)*limit,page*limit).map(expenseView), pagination: pageResult(rows,page,limit) } }; }
    if (action === "getExpense") { const expense = s.expenses.find(x => x._id === fields.id); if (!expense) throw new Error("Expense not found."); return { value: { expense: expenseView(expense) } }; }
    if (action === "expenseSummary") return { value: expenseSummary(s, fields.month) };
    if (action === "getBudget") return { value: { budget: expenseSummary(s,fields.month).budget } };
    if (action === "exportExpenses") return { value: { exportData: s.expenses.filter(x => x.date?.startsWith(fields.month)).map(expenseView), month: fields.month, format: fields.format } };
    if (action === "saveBudget") {
      const budget = { month: fields.month, overallPaise: fields.overall === null ? null : asPaise(fields.overall), categories: fields.categories.map(x => ({ category: x.category, limitPaise: asPaise(x.amount) })) };
      s.budgets = s.budgets.filter(x => x.month !== fields.month); s.budgets.push(budget); queue(action,fields); return { changed: true, value: { budget } };
    }
    const match = action.match(/^(create|update|delete)(Task|Note|Expense)$/);
    if (!match) throw new Error("This action needs a connection.");
    const [, verb, kind] = match, key = `${kind.toLowerCase()}s`, list = s[key], name = kind.toLowerCase();
    const { id, ...values } = fields;
    if (verb === "create") {
      const _id = newId(), item = { _id, createdAt: now, updatedAt: now, ...values };
      if (kind === "Task") Object.assign(item, { completed: false, completedAt: null, description: item.description || "", priority: item.priority || "medium", category: item.category || "General" });
      if (kind === "Note") Object.assign(item, { title: item.title || "", color: item.color || "yellow", pinned: Boolean(item.pinned) });
      if (kind === "Expense") { item.amountPaise = asPaise(item.amount); delete item.amount; }
      list.push(item); queue(action, { ...values, offlineId: _id }); activity(`${name}_created`, item.title || item.content || item.category, kind === "Task" ? _id : null);
      return { changed: true, value: { [name]: kind === "Expense" ? expenseView(item) : item } };
    }
    const index = list.findIndex(x => x._id === id);
    if (index < 0) throw new Error(`${kind} not found.`);
    const item = list[index];
    if (verb === "delete") { list.splice(index,1); queue(action,fields); activity(`${name}_deleted`, item.title || item.content || item.category, kind === "Task" ? id : null); return { changed: true, value: { message: `${kind} deleted.` } }; }
    const wasCompleted = item.completed;
    Object.assign(item, values, { updatedAt: now });
    if (kind === "Expense" && values.amount !== undefined) { item.amountPaise = asPaise(values.amount); delete item.amount; }
    if (kind === "Task" && values.completed !== undefined) item.completedAt = values.completed ? now : null;
    queue(action,fields); activity(kind === "Task" && values.completed !== undefined && wasCompleted !== values.completed ? (values.completed ? "task_completed" : "task_reopened") : `${name}_updated`, item.title || item.content || item.category, kind === "Task" ? id : null);
    return { changed: true, value: { [name]: kind === "Expense" ? expenseView(item) : item } };
  });
  if (output?.exportData) {
    const { exportOfflineExpenses } = await import("./offlineFiles.js");
    output = await exportOfflineExpenses(output.exportData, output.month, output.format);
  }
  if (/^(create|update|delete|saveBudget|read)/.test(action)) announce({ pending: true });
  return { data: output, headers: {} };
}
