import assert from "node:assert/strict";
import { test } from "node:test";
import sendAction from "../services/server.js";
import { downloadFile } from "../utils/download.js";

function browser(t) {
  const old = new Map(
    ["localStorage", "window", "document"].map((key) => [
      key,
      Object.getOwnPropertyDescriptor(globalThis, key),
    ]),
  );
  const events = [];
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: { getItem: () => "test-token" },
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { dispatchEvent: (event) => events.push(event.type) },
  });
  t.after(() => {
    for (const [key, descriptor] of old) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  return events;
}

test("React sends a named POST action with fields and the account token", async (t) => {
  browser(t);
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(url, "http://localhost:5000/server?action=updateTask");
    assert.equal(options.method, "POST");
    assert.equal(options.headers.Authorization, "Bearer test-token");
    assert.deepEqual(JSON.parse(options.body), {
      id: "task-1",
      completed: true,
    });
    return new Response(JSON.stringify({ task: { completed: true } }), {
      headers: { "Content-Type": "application/json" },
    });
  });
  assert.equal(
    (await sendAction("updateTask", { id: "task-1", completed: true })).data
      .task.completed,
    true,
  );
});
test("file actions preserve multipart boundaries, binary results, and size headers", async (t) => {
  browser(t);
  const form = new FormData();
  form.set("file", new Blob(["%PDF-test"]), "test.pdf");
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    assert.equal(options.body, form);
    assert.equal(options.headers["Content-Type"], undefined);
    return new Response("converted file", {
      headers: { "X-Output-Size": "14" },
    });
  });
  const result = await sendAction("compressPdf", form, {
    responseType: "blob",
  });
  assert.equal(await result.data.text(), "converted file");
  assert.equal(result.headers["x-output-size"], "14");
});
test("file errors retain server messages, and only expired private actions sign out", async (t) => {
  const events = browser(t);
  t.mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response(JSON.stringify({ message: "Choose a PDF." }), {
        status: 401,
      }),
  );
  await assert.rejects(
    sendAction("login"),
    (error) => error.status === 401 && error.message === "Choose a PDF.",
  );
  assert.deepEqual(events, []);
  await assert.rejects(sendAction("getAccount"), /Choose a PDF/);
  assert.deepEqual(events, ["utilityhub:unauthorized"]);
});
test("timeouts abort pending work and return a readable error", async (t) => {
  browser(t);
  t.mock.method(
    globalThis,
    "fetch",
    (_url, { signal }) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener(
          "abort",
          () => reject(new DOMException("Aborted", "AbortError")),
          { once: true },
        );
      }),
  );
  await assert.rejects(
    sendAction("listTasks", {}, { timeout: 5 }),
    /took too long/,
  );
});
test("clearing a form cannot revoke a download before the browser starts it", (t) => {
  browser(t);
  const actions = [],
    blob = new Blob(["download content"]);
  let cleanup;
  t.mock.method(URL, "createObjectURL", (value) => {
    assert.equal(value, blob);
    return "blob:download";
  });
  t.mock.method(URL, "revokeObjectURL", (url) => actions.push("revoke " + url));
  t.mock.method(globalThis, "setTimeout", (callback, delay) => {
    assert.equal(delay, 60000);
    cleanup = callback;
  });
  const link = {
    click() {
      actions.push("click " + this.download);
    },
    remove() {
      actions.push("remove");
    },
  };
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      createElement: () => link,
      body: {
        appendChild() {
          actions.push("append");
        },
      },
    },
  });
  downloadFile(blob, "result.pdf");
  assert.deepEqual(actions, ["append", "click result.pdf", "remove"]);
  cleanup();
  assert.equal(actions.at(-1), "revoke blob:download");
});
