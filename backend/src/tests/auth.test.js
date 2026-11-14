import { actionRequest } from "./helpers/actionRequest.js";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import app from "../app.js";
import User from "../models/User.js";

// Always use a new test database. Your utilityhub database is never changed.
const databaseName = `utilityhub_test_${randomUUID().replaceAll("-", "")}`;
process.env.JWT_SECRET = randomUUID() + randomUUID();
process.env.CLIENT_URL = "http://localhost:5173";
let server;
let baseURL;
let account;
const password = "CollegeDemo#2026";
async function request(action, options = {}) {
  const response = await actionRequest(baseURL, action, options);
  return { response, data: await response.json() };
}

before(async () => {
  await mongoose.connect(
    process.env.TEST_MONGO_URI || "mongodb://127.0.0.1:27017",
    {
      dbName: databaseName,
      serverSelectionTimeoutMS: 5000,
    },
  );
  await User.init();
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  baseURL = `http://127.0.0.1:${server.address().port}/server`;
});
after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (mongoose.connection.readyState === 1) {
    assert.equal(mongoose.connection.name, databaseName);
    await mongoose.connection.dropDatabase();
  }
  await mongoose.disconnect();
});
test("Phase 1 authentication and API integration", async (t) => {
  await t.test("health reports a real database connection", async () => {
    const { response, data } = await request("serverHealth");
    assert.equal(response.status, 200);
    assert.equal(data.database, "connected");
    assert.ok(response.headers.get("x-content-type-options"));
    assert.equal(response.headers.get("x-powered-by"), null);
  });
  await t.test(
    "registration normalizes email and excludes the password",
    async () => {
      const { response, data } = await request("register", {
        body: JSON.stringify({
          name: "  Test Student  ",
          email: " Student@Example.com ",
          password,
        }),
      });
      assert.equal(response.status, 201);
      assert.equal(data.user.name, "Test Student");
      assert.equal(data.user.email, "student@example.com");
      assert.ok(data.user.createdAt);
      assert.equal(data.user.password, undefined);
      assert.ok(data.token);
      account = data;
    },
  );
  await t.test(
    "MongoDB stores a bcrypt hash instead of plaintext",
    async () => {
      const user = await User.findById(account.user.id).select("+password");
      assert.notEqual(user.password, password);
      assert.match(user.password, /^\$2[aby]\$12\$/);
      assert.equal(await user.comparePassword(password), true);
      assert.equal((await User.findById(user.id)).password, undefined);
    },
  );
  await t.test("duplicate registration returns 409", async () => {
    const { response } = await request("register", {
      body: JSON.stringify({
        name: "Another Student",
        email: "STUDENT@example.com",
        password,
      }),
    });
    assert.equal(response.status, 409);
    assert.equal(await User.countDocuments(), 1);
  });
  await t.test(
    "invalid input and object-based login are rejected",
    async () => {
      for (const body of [
        {
          name: "A",
          email: "student2@example.com",
          password,
        },
        {
          name: "Student",
          email: "not-an-email",
          password,
        },
        {
          name: "Student",
          email: "student2@example.com",
          password: "short",
        },
        {
          name: "Student",
          email: "student2@example.com",
          password: "é".repeat(37),
        },
        {
          name: "Student",
          email: {
            $ne: null,
          },
          password,
        },
      ]) {
        const { response } = await request("register", {
          body: JSON.stringify(body),
        });
        assert.equal(response.status, 400);
      }
      const { response } = await request("login", {
        body: JSON.stringify({
          email: {
            $ne: null,
          },
          password,
        }),
      });
      assert.equal(response.status, 400);
    },
  );
  await t.test("incorrect passwords return a generic 401", async () => {
    const { response, data } = await request("login", {
      body: JSON.stringify({
        email: "student@example.com",
        password: "WrongPassword!",
      }),
    });
    assert.equal(response.status, 401);
    assert.equal(data.message, "Email or password is incorrect.");
  });
  await t.test("login returns a usable, expiring token", async () => {
    const { response, data } = await request("login", {
      body: JSON.stringify({
        email: "STUDENT@example.com",
        password,
      }),
    });
    assert.equal(response.status, 200);
    const payload = jwt.verify(data.token, process.env.JWT_SECRET, {
      algorithms: ["HS256"],
    });
    assert.equal(payload.sub, account.user.id);
    assert.equal(payload.exp - payload.iat, 7 * 24 * 60 * 60);
    assert.equal(data.user.password, undefined);
  });
  await t.test(
    "protected profile is available only with a valid token",
    async () => {
      const valid = await request("getAccount", {
        headers: {
          Authorization: `Bearer ${account.token}`,
        },
      });
      assert.equal(valid.response.status, 200);
      assert.equal(valid.data.user.id, account.user.id);
      assert.equal(valid.data.user.password, undefined);
      const anonymous = await request("getAccount");
      assert.equal(anonymous.response.status, 401);
      const invalid = await request("getAccount", {
        headers: {
          Authorization: "Bearer invalid-token",
        },
      });
      assert.equal(invalid.response.status, 401);
    },
  );
  await t.test(
    "expired tokens and deleted accounts cannot authenticate",
    async () => {
      const expired = jwt.sign({}, process.env.JWT_SECRET, {
        subject: account.user.id,
        expiresIn: -10,
      });
      const missingUser = jwt.sign({}, process.env.JWT_SECRET, {
        subject: new mongoose.Types.ObjectId().toString(),
      });
      for (const token of [expired, missingUser]) {
        const { response } = await request("getAccount", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        assert.equal(response.status, 401);
      }
    },
  );
  await t.test(
    "CORS allows the configured origin and rejects others",
    async () => {
      const allowed = await request("serverHealth", {
        headers: {
          Origin: "http://localhost:5173",
        },
      });
      assert.equal(
        allowed.response.headers.get("access-control-allow-origin"),
        "http://localhost:5173",
      );
      const blocked = await request("serverHealth", {
        headers: {
          Origin: "https://untrusted.example",
        },
      });
      assert.equal(blocked.response.status, 403);
      assert.equal(
        blocked.response.headers.get("access-control-allow-origin"),
        null,
      );
      const preflight = await fetch(`${baseURL}?action=login`, {
        method: "OPTIONS",
        headers: {
          Origin: "http://localhost:5173",
          "Access-Control-Request-Method": "POST",
        },
      });
      assert.equal(preflight.status, 204);
    },
  );
  await t.test(
    "malformed and oversized JSON return useful errors",
    async () => {
      const malformed = await request("register", {
        body: "{invalid",
      });
      assert.equal(malformed.response.status, 400);
      const oversized = await request("register", {
        body: JSON.stringify({
          text: "x".repeat(110000),
        }),
      });
      assert.equal(oversized.response.status, 413);
    },
  );
  await t.test("unknown actions return a useful JSON error", async () => {
    const { response, data } = await request("unknownAction");
    assert.equal(response.status, 400);
    assert.match(data.message, /valid server action/);
  });
  await t.test(
    "only the POST handler accepts actions; old resource routes are absent",
    async () => {
      for (const action of ["__proto__", "constructor", "toString"]) {
        assert.equal((await request(action)).response.status, 400);
      }
      const get = await fetch(`${baseURL}?action=getAccount`);
      assert.equal(get.status, 404);
      const old = await fetch(baseURL.replace("/server", "/api/tasks"));
      assert.equal(old.status, 404);
    },
  );

  await t.test(
    "repeated authentication attempts are rate limited with JSON",
    async () => {
      let limited;
      for (let attempt = 0; attempt < 22; attempt += 1) {
        const result = await request("login", {
          body: "{}",
        });
        if (result.response.status === 429) {
          limited = result;
          break;
        }
      }
      assert.ok(limited, "Expected an HTTP 429 response");
      assert.match(limited.data.message, /Too many sign-in attempts/);
    },
  );
});
