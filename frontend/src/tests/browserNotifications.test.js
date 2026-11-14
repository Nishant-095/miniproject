import assert from "node:assert/strict";
import { test } from "node:test";
import {
  deliverBrowserReminders,
  enabledKey,
} from "../services/browserNotifications.js";

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}
const now = Date.parse("2026-10-25T12:00:00Z");
const note = (id = "a") => ({
  _id: id,
  task: "task-1",
  title: "Study",
  readAt: null,
  createdAt: "2026-10-25T11:59:00Z",
});
function setup() {
  const storage = memoryStorage();
  storage.setItem(enabledKey("student-1"), "true");
  const shown = [];
  return {
    shown,
    options: {
      notifications: [note()],
      userId: "student-1",
      storage,
      permission: "granted",
      now,
      show: async (item, userId) => shown.push([item._id, userId]),
    },
  };
}
test("OS notification requires both permission and this account’s opt-in", async () => {
  for (const permission of ["default", "denied", "unsupported"]) {
    const { shown, options } = setup();
    await deliverBrowserReminders({ ...options, permission });
    assert.equal(shown.length, 0);
  }
  const { shown, options } = setup();
  await deliverBrowserReminders({ ...options, userId: "another-student" });
  assert.equal(shown.length, 0);
});
test("a reminder is displayed once across polling and page refreshes", async () => {
  const { shown, options } = setup();
  await deliverBrowserReminders(options);
  await deliverBrowserReminders(options);
  assert.deepEqual(shown, [["a", "student-1"]]);
});
test("read and old reminders do not create distracting desktop popups", async () => {
  const { shown, options } = setup();
  await deliverBrowserReminders({
    ...options,
    notifications: [
      { ...note("old"), createdAt: "2026-10-23T10:00:00Z" },
      { ...note("read"), readAt: "2026-10-25T12:00:00Z" },
    ],
  });
  assert.equal(shown.length, 0);
});
test("a rejected OS notification is not recorded as successfully shown", async () => {
  const { shown, options } = setup();
  await assert.rejects(
    deliverBrowserReminders({
      ...options,
      show: async () => {
        throw new Error("Blocked");
      },
    }),
  );
  await deliverBrowserReminders(options);
  assert.equal(shown.length, 1);
});
test("logout or account changes stop queued native notifications", async () => {
  const { shown, options } = setup();
  await deliverBrowserReminders({ ...options, isCurrent: () => false });
  assert.equal(shown.length, 0);
});
test("corrupted seen storage is recoverable and a burst is limited to three", async () => {
  const { shown, options } = setup();
  options.storage.setItem("utilityhub_seen_reminders_student-1", "{}");
  await deliverBrowserReminders({
    ...options,
    notifications: ["a", "b", "c", "d"].map(note),
  });
  assert.equal(shown.length, 3);
});

test("a cancelled asynchronous display is not marked seen for the next session", async () => {
  const { shown, options } = setup();
  await deliverBrowserReminders({ ...options, show: async () => false });
  await deliverBrowserReminders(options);
  assert.equal(shown.length, 1);
});
