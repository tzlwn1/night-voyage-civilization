import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import { parseArgs } from "./cli.ts";
import { chronicleFile, formatCivId, FIRST_CIV_SEQ } from "./paths.ts";
import { runSimulation } from "./simulate.ts";
import { readState } from "./state.ts";

test("命令行接受 --years 与 --seed", () => {
  assert.deepEqual(parseArgs(["--years=1", "--seed=night"]), { years: 1, seed: "night" });
  assert.throws(() => parseArgs(["--years=0", "--seed=night"]), /正整数/);
  assert.throws(() => parseArgs(["--seed=night"]), /用法/);
});

test("无存档时一年模拟可复现，并覆盖第一年草稿", async () => {
  const left = await mkdtemp(path.join(tmpdir(), "nvc-"));
  const right = await mkdtemp(path.join(tmpdir(), "nvc-"));
  const a = await runSimulation({ root: left, years: 1, seed: "night" });
  const b = await runSimulation({ root: right, years: 1, seed: "night" });
  assert.deepEqual(a, b);
  assert.equal(a[0]?.year, 1);

  const state = await readState(left);
  assert.equal(state?.year, 1);
  assert.equal(state?.population, a[0]?.populationAfter);

  const chronicle = await readFile(chronicleFile(left, formatCivId(FIRST_CIV_SEQ), 1), "utf8");
  assert.match(chronicle, /口传纪事|状态: 已结算/);
  assert.doesNotMatch(chronicle, /状态: 草稿/);
  if (chronicle.includes("口传纪事")) {
    assert.match(chronicle, /口传:/);
  } else {
    assert.match(chronicle, /## 年度汇总/);
    assert.match(chronicle, /## 记事/);
  }
});

test("再次运行从存档继续，种子不一致则拒绝", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "nvc-"));
  await runSimulation({ root, years: 1, seed: "night" });
  const second = await runSimulation({ root, years: 1, seed: "night" });
  assert.equal(second[0]?.year, 2);
  const state = await readState(root);
  assert.equal(state?.year, 2);
  await assert.rejects(runSimulation({ root, years: 1, seed: "other" }), /不一致/);
});
