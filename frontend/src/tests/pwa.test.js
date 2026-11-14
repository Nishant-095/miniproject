import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs/promises";
import { isAppPath, reminderTarget } from "../utils/pwaPolicy.js";
import { notificationRegistration } from "../services/notificationWorker.js";

function globals() {
  const oldWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const oldNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const window = new EventTarget();
  window.isSecureContext = true;
  const media = new EventTarget();
  media.matches = false;
  window.matchMedia = () => media;
  const navigator = { onLine: true, serviceWorker: {} };
  Object.defineProperty(globalThis, "window", {
    value: window,
    configurable: true,
  });
  Object.defineProperty(globalThis, "navigator", {
    value: navigator,
    configurable: true,
  });
  return {
    window,
    navigator,
    media,
    restore() {
      for (const [key, descriptor] of [
        ["window", oldWindow],
        ["navigator", oldNavigator],
      ]) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else delete globalThis[key];
      }
    },
  };
}
let moduleId = 0;
const manager = () => import(`../services/pwa.js?test=${moduleId++}`);
test("installation is offered only by a real browser event and consumed once", async () => {
  const env = globals();
  try {
    const pwa = await manager();
    let options,
      updateCalls = 0,
      prompts = 0;
    await pwa.registerPwa({
      production: true,
      registerWorker: (callbacks) => {
        options = callbacks;
        return async () => {
          updateCalls++;
        };
      },
    });
    let changes = 0;
    const unsubscribe = pwa.subscribePwa(() => changes++);
    const event = new Event("beforeinstallprompt", { cancelable: true });
    event.prompt = async () => {
      prompts++;
    };
    event.userChoice = Promise.resolve({ outcome: "accepted" });
    env.window.dispatchEvent(event);
    assert.equal(event.defaultPrevented, true);
    assert.equal(pwa.getPwaState().available, true);
    assert.equal(await pwa.promptInstall(), true);
    assert.equal(await pwa.promptInstall(), false);
    assert.equal(prompts, 1);
    assert.equal(
      pwa.getPwaState().installed,
      false,
      "Acceptance alone is not installation confirmation.",
    );
    env.window.dispatchEvent(new Event("appinstalled"));
    assert.equal(pwa.getPwaState().installed, true);
    options.onOfflineReady();
    assert.equal(pwa.getPwaState().ready, true);
    options.onNeedRefresh();
    assert.equal(pwa.getPwaState().updateAvailable, true);
    assert.equal(updateCalls, 0, "An update never reloads automatically.");
    env.navigator.onLine = false;
    env.window.dispatchEvent(new Event("offline"));
    assert.equal(await pwa.applyPwaUpdate(), false);
    env.navigator.onLine = true;
    env.window.dispatchEvent(new Event("online"));
    assert.equal(await pwa.applyPwaUpdate(), true);
    assert.equal(updateCalls, 1);
    assert.ok(changes > 0);
    unsubscribe();
  } finally {
    env.restore();
  }
});
test("declined installation stays uninstalled and registration/update errors are visible", async () => {
  const env = globals();
  try {
    const pwa = await manager();
    let callbacks;
    await pwa.registerPwa({
      production: true,
      registerWorker: (options) => {
        callbacks = options;
        return async () => {
          throw new Error("Offline");
        };
      },
    });
    const event = new Event("beforeinstallprompt", { cancelable: true });
    event.prompt = async () => {};
    event.userChoice = Promise.resolve({ outcome: "dismissed" });
    env.window.dispatchEvent(event);
    assert.equal(await pwa.promptInstall(), false);
    assert.equal(pwa.getPwaState().installed, false);
    callbacks.onRegisterError(new Error("Failure"));
    assert.match(pwa.getPwaState().error, /Reload while connected/);
    callbacks.onNeedRefresh();
    assert.equal(pwa.getPwaState().error, "");
    assert.equal(await pwa.applyPwaUpdate(), false);
    assert.match(pwa.getPwaState().error, /Could not update/);
  } finally {
    env.restore();
  }
});
test("development and insecure contexts do not register a PWA worker", async () => {
  const env = globals();
  try {
    let called = 0;
    const registerWorker = () => {
      called++;
    };
    const dev = await manager();
    await dev.registerPwa({ production: false, registerWorker });
    const event = new Event("beforeinstallprompt", { cancelable: true });
    env.window.dispatchEvent(event);
    assert.equal(event.defaultPrevented, false);
    env.window.isSecureContext = false;
    const insecure = await manager();
    await insecure.registerPwa({ production: true, registerWorker });
    assert.equal(called, 0);
  } finally {
    env.restore();
  }
});
test("notification delivery reuses production registration and isolates development scope", async () => {
  const active = { showNotification() {} };
  let registrations = 0;
  const production = await notificationRegistration(
    {
      ready: Promise.resolve(active),
      register: () => {
        registrations++;
      },
    },
    true,
  );
  assert.equal(production, active);
  assert.equal(registrations, 0);
  const development = await notificationRegistration(
    {
      register: async (script, options) => {
        assert.equal(script, "/notification-sw.js");
        assert.equal(options.scope, "/notifications/");
        return { active };
      },
    },
    false,
  );
  assert.equal(development.active, active);
  const worker = new EventTarget();
  worker.state = "installing";
  const pending = notificationRegistration(
    { register: async () => ({ installing: worker }) },
    false,
  );
  await new Promise((resolve) => setTimeout(resolve, 0));
  worker.state = "activated";
  worker.dispatchEvent(new Event("statechange"));
  await pending;
});
test("navigation fallback excludes server actions and downloads; reminder clicks stay on local tasks", () => {
  for (const route of [
    "/",
    "/tools/pdf",
    "/tools/convert",
    "/tools/images",
    "/dashboard",
    "/notes",
    "/tasks",
  ])
    assert.equal(isAppPath(route), true);
  for (const route of [
    "/server",
    "/server?action=getAccount",
    "/server?action=processImage",
    "/uploads/a.pdf",
    "/outputs/a.pdf",
    "/assets/app.js",
    "/tasksmith",
    "/tools/qr",
    "/tools/units",
    "/tools/passwords",
    "/tools/calculators",
    "/tools/pomodoro",
    "/tools/text",
  ])
    assert.equal(isAppPath(route), false);
  const origin = "https://utilityhub.example";
  assert.equal(
    reminderTarget("/tasks?task=abc", origin),
    origin + "/tasks?task=abc",
  );
  for (const value of [
    "https://other.example/tasks",
    "//other.example/tasks",
    "javascript:alert(1)",
    "/login",
    undefined,
  ])
    assert.equal(reminderTarget(value, origin), origin + "/tasks");
});
test("manifest has standalone scope, launch shortcuts, and correctly sized PNG icons", async () => {
  const root = new URL("../../public/", import.meta.url);
  const manifest = JSON.parse(
    await fs.readFile(new URL("manifest.webmanifest", root), "utf8"),
  );
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.scope, "/");
  assert.equal(manifest.start_url, "/");
  assert.equal(manifest.id, "/");
  assert.equal(manifest.short_name, "UtilityHub");
  assert.equal(manifest.icons.length, 3);
  for (const icon of manifest.icons) {
    const bytes = await fs.readFile(new URL(icon.src.slice(1), root));
    const size = Number(icon.sizes.split("x")[0]);
    assert.equal(bytes.subarray(1, 4).toString(), "PNG");
    assert.equal(bytes.readUInt32BE(16), size);
    assert.equal(bytes.readUInt32BE(20), size);
  }
  assert.ok(manifest.icons.some((icon) => icon.purpose === "maskable"));
  for (const shortcut of manifest.shortcuts)
    assert.equal(isAppPath(shortcut.url), true);
});
