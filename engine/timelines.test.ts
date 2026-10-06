import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";

import { loadTimelines } from "./timelines.ts";

test("world/timelines.json 可解析活跃时间线", () => {
  const root = path.resolve(".");
  const timelines = loadTimelines(root);
  assert.ok(timelines.length >= 1);
  assert.ok(timelines.some((entry) => entry.active && entry.branch.length > 0));
});
