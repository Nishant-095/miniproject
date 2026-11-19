import { actionRequest } from "./helpers/actionRequest.js";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { before, after, test } from "node:test";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import sharp from "sharp";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import User from "../models/User.js";
import Note from "../models/Note.js";
import Activity from "../models/Activity.js";
import { processImage } from "../services/imageService.js";
const storage = await fs.mkdtemp(
  path.join(os.tmpdir(), "utilityhub-extras-test-"),
);
process.env.FILE_STORAGE_ROOT = storage;
const { default: app } = await import("../app.js");
const { createJob, cleanJob } = await import("../services/tempFileService.js");
const dbName = `utilityhub_extras_test_${randomUUID().replaceAll("-", "")}`;
process.env.JWT_SECRET = randomUUID() + randomUUID();
process.env.CLIENT_URL = "http://localhost:5173";
let server, base, token, otherToken, user, image;
async function request(action, { body, as = token } = {}) {
  const response = await actionRequest(base, action, {
    body,
    headers: as ? { Authorization: `Bearer ${as}` } : {},
  });
  return {
    status: response.status,
    headers: response.headers,
    data: await response.json(),
  };
}

before(async () => {
  await mongoose.connect(
    process.env.TEST_MONGO_URI || "mongodb://127.0.0.1:27017",
    {
      dbName,
      serverSelectionTimeoutMS: 5000,
    },
  );
  await Promise.all([Note.init(), Activity.init()]);
  [user] = await User.create([
    {
      name: "Notes test",
      email: `${randomUUID()}@example.test`,
      password: "unused-test-hash",
    },
    {
      name: "Other user",
      email: `${randomUUID()}@example.test`,
      password: "unused-test-hash",
    },
  ]);
  const other = await User.findOne({
    _id: {
      $ne: user._id,
    },
  });
  token = jwt.sign({}, process.env.JWT_SECRET, {
    subject: String(user._id),
    algorithm: "HS256",
  });
  otherToken = jwt.sign({}, process.env.JWT_SECRET, {
    subject: String(other._id),
    algorithm: "HS256",
  });
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}/server`;
  image = await sharp({
    create: {
      width: 800,
      height: 400,
      channels: 4,
      background: {
        r: 120,
        g: 60,
        b: 200,
        alpha: 0.5,
      },
    },
  })
    .png()
    .toBuffer();
});
after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (mongoose.connection.name === dbName)
    await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  await fs.rm(storage, {
    recursive: true,
    force: true,
  });
});
test("notes require authentication and never accept another owner", async () => {
  assert.equal(
    (
      await request("listNotes", {
        as: null,
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await request("createNote", {
        body: {
          content: "x",
          user: user._id,
        },
      })
    ).status,
    400,
  );
  const created = await request("createNote", {
    body: {
      title: "My note",
      content: "Private thought",
      color: "green",
      pinned: true,
    },
  });
  assert.equal(created.status, 201);
  const id = created.data.note._id;
  assert.equal(
    (
      await request(
        {
          action: "updateNote",
          fields: {
            id: id,
          },
        },
        {
          as: otherToken,
          body: {
            content: "Stolen",
          },
        },
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await request(
        {
          action: "deleteNote",
          fields: {
            id: id,
          },
        },
        {
          as: otherToken,
        },
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await request("listNotes", {
        as: otherToken,
      })
    ).data.total,
    0,
  );
  assert.equal(
    (await request("listNotes")).headers.get("cache-control"),
    "no-store",
  );
});
test("notes validate JSON types, empty text, color, length, and IDs", async () => {
  for (const body of [
    {
      content: "",
    },
    {
      content: {
        $gt: "",
      },
    },
    {
      content: ["text"],
    },
    {
      content: "text",
      pinned: "false",
    },
    {
      content: "text",
      color: "red",
    },
    {
      content: "x".repeat(5001),
    },
    {
      content: "x",
      title: 5,
    },
    {
      content: "x",
      surprise: true,
    },
  ])
    assert.equal(
      (
        await request("createNote", {
          body,
        })
      ).status,
      400,
    );
  assert.equal(
    (
      await request(
        {
          action: "updateNote",
          fields: {
            id: "invalid",
          },
        },
        {
          body: {
            content: "x",
          },
        },
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await request(
        {
          action: "updateNote",
          fields: {
            id: user._id,
          },
        },
        {
          body: {},
        },
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await request({
        action: "listNotes",
        fields: {
          q: {
            x: "1",
          },
        },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request({
        action: "listNotes",
        fields: {
          page: "-1",
        },
      })
    ).status,
    400,
  );
});
test("notes are paginated, pinned first, safely searched, editable, and removable", async () => {
  await Note.deleteMany({
    user: user._id,
  });
  await Note.insertMany(
    Array.from(
      {
        length: 25,
      },
      (_, i) => ({
        user: user._id,
        title: `Thought ${i}`,
        content: i === 0 ? "[literal].*" : "A thought",
        pinned: i === 0,
      }),
    ),
  );
  const first = (await request("listNotes")).data;
  assert.equal(first.total, 25);
  assert.equal(first.notes.length, 24);
  assert.equal(first.notes[0].pinned, true);
  assert.equal(first.pinned, 1);
  assert.equal(
    (
      await request({
        action: "listNotes",
        fields: {
          page: "2",
        },
      })
    ).data.notes.length,
    1,
  );
  assert.equal(
    (
      await request({
        action: "listNotes",
        fields: {
          q: "[literal].*",
        },
      })
    ).data.total,
    1,
  );
  const id = first.notes[0]._id;
  const updated = await request(
    {
      action: "updateNote",
      fields: {
        id: id,
      },
    },
    {
      body: {
        content: "Updated",
        pinned: false,
        color: "blue",
      },
    },
  );
  assert.equal(updated.data.note.content, "Updated");
  assert.equal(updated.data.note.pinned, false);
  assert.equal(
    (
      await request(
        {
          action: "deleteNote",
          fields: {
            id: id,
          },
        },
        {},
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await request(
        {
          action: "deleteNote",
          fields: {
            id: id,
          },
        },
        {},
      )
    ).status,
    404,
  );
  const recent = (await request("recentActivity")).data.activities;
  assert.equal(recent[0].action, "note_deleted");
});
test("legacy image regression helper removes its temporary folders", async () => {
  const job = await createJob();
  try {
    const source = path.join(job.inputDir, "source.png");
    await fs.writeFile(source, image);
    const result = await processImage(
      {
        path: source,
      },
      {
        width: "40",
      },
      job,
    );
    assert.equal((await sharp(result.target).metadata()).width, 40);
  } finally {
    await cleanJob(job);
  }
  await assert.rejects(fs.access(job.inputDir));
  await assert.rejects(fs.access(job.outputDir));
});
test("note actions reject object IDs rather than interpreting database operators", async () => {
  for (const action of ["updateNote", "deleteNote"]) {
    const result = await request(action, {
      body: { id: { $ne: null }, content: "Unexpected change" },
    });
    assert.equal(result.status, 400);
  }
});

test("removed currency actions are no longer exposed", async () => {
  const result = await request("currencyRate", {
    as: null,
    body: { from: "USD", to: "INR" },
  });
  assert.equal(result.status, 400);
});
