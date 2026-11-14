import assert from "node:assert/strict";
import { test } from "node:test";
import { tools } from "../utils/tools.js";

test("the catalogue contains exactly the six supported tools", () => {
  assert.deepEqual(
    tools.map((tool) => tool.id),
    ["pdf", "convert", "tasks", "expenses", "notes", "images"],
  );
  assert.equal(new Set(tools.map((tool) => tool.path)).size, 6);
  assert.deepEqual(
    tools.filter((tool) => tool.private).map((tool) => tool.id),
    ["tasks", "expenses", "notes"],
  );
});
