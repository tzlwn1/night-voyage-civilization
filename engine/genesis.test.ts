import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import { chronicleFile, formatCivId, FIRST_CIV_SEQ } from "./paths.ts";
import { genesis } from "./genesis.ts";
import { readState } from "./state.ts";

test("同一种子创世结果相同，并写下第一年草稿", async () => {
  const left = await mkdtemp(path.join(tmpdir(), "nvc-"));
  const right = await mkdtemp(path.join(tmpdir(), "nvc-"));

  const a = await genesis(left, "night");
  const b = await genesis(right, "night");
  assert.deepEqual(a, b);
  assert.equal(a.year, 0);
  assert.equal(a.population, a.foundingPopulation);
  assert.ok(a.population >= 36 && a.population <= 420);

  const draft = await readFile(chronicleFile(left, formatCivId(FIRST_CIV_SEQ), 1), "utf8");
  assert.match(draft, /状态: 草稿/);
  assert.match(draft, /地理: /);
  assert.match(draft, /气候: /);
  assert.match(draft, /来历: /);
  assert.match(draft, new RegExp(`初始人口: ${a.foundingPopulation}`));

  const saved = await readState(left);
  assert.deepEqual(saved, a);
  await assert.rejects(genesis(left, "night"), /已有存档/);
});
