import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import { writeSettledYear } from "./chronicle.ts";
import { annalsFile } from "./paths.ts";
import { runSimulation } from "./simulate.ts";
import { writeAnnals } from "./succession.ts";
import { readState, writeState } from "./state.ts";
import { settleYear } from "./year.ts";

test("灭亡后生成 annals，旧编年史不被改写，只新增后世修订", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "nvc-succ-"));
  await runSimulation({ root, years: 1, seed: "night" });
  const original = await readFile(path.join(root, "chronicle", "civ-001", "0001.md"), "utf8");
  let state = await readState(root);
  assert.ok(state);

  const doomed = settleYear({
    ...state,
    phase: "active",
    population: 0,
    sparseYears: 2,
    famineYears: 0,
    order: 3,
    health: 3,
  });
  assert.ok(doomed.report.extinction);
  assert.equal(doomed.report.year, 2);
  await writeSettledYear(root, doomed.report);
  await writeAnnals(root, doomed.state, doomed.report.extinction!);
  await writeState(root, doomed.state);

  const afterExtinct = await readFile(path.join(root, "chronicle", "civ-001", "0001.md"), "utf8");
  assert.equal(afterExtinct, original);

  const annals = await readFile(annalsFile(root, "civ-001"), "utf8");
  assert.match(annals, /startYear:/);
  assert.match(annals, /endYear:/);
  assert.match(annals, /cause:/);
  assert.match(annals, /finalPopulation:/);

  await runSimulation({ root, years: 20, seed: "night" });
  const revisions = await readdir(path.join(root, "chronicle", "civ-001", "revisions"));
  assert.ok(revisions.length > 0);
  const heritage = await readdir(path.join(root, "chronicle", "civ-002", "heritage"));
  assert.ok(heritage.some((name) => name.includes("civ-001")));
});
