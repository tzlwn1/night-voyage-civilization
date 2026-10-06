import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import { manifestationChronicleLine, settleYearDream } from "./dream.ts";
import { genesis } from "./genesis.ts";
import { createRng, rngStateFromSeed } from "./rng.ts";
import { runSimulation } from "./simulate.ts";
import type { RecordedEvent, YearSummary } from "./report.ts";
import { settleYear } from "./year.ts";

test("同种子同年梦境文本完全一致", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "nvc-dream-"));
  const founded = await genesis(root, "night");
  const first = settleYear(founded);
  const second = settleYear(founded);
  assert.equal(first.report.dream.text, second.report.dream.text);
  assert.equal(first.report.dream.brought, second.report.dream.brought);
});

test("梦境落地后写入编年史，并在后续年份影响结算", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "nvc-dream-"));
  let state = await genesis(root, "night");
  const rng = createRng(rngStateFromSeed("dream-seed"));
  const events: RecordedEvent[] = [
    { month: 3, id: "shortage-empty", title: "空仓", category: "缺粮", level: "严重" },
  ];
  const summary: YearSummary = {
    births: 2,
    deaths: 1,
    foodStart: 100,
    foodEnd: 40,
    foodProduced: 50,
    foodConsumed: 110,
    goodsStart: 10,
    goodsEnd: 12,
    goodsCrafted: 2,
    healthStart: 70,
    healthEnd: 60,
    orderStart: 70,
    orderEnd: 55,
    buildingsStart: 1,
    buildingsEnd: 1,
  };
  let manifested = false;
  for (let i = 0; i < 80; i += 1) {
    const result = settleYearDream(state, rng, 1, events, summary, state.population);
    state = result.state;
    if (result.dream.manifestation) {
      manifested = true;
      assert.match(manifestationChronicleLine(result.dream), /昨夜之梦带来了/);
      break;
    }
  }
  assert.equal(manifested, true);
  await runSimulation({ root, years: 30, seed: "night" });
  const chronicle = await readFile(path.join(root, "chronicle", "civ-001", "0030.md"), "utf8");
  assert.match(chronicle, /## 梦境|夜梦:/);
  assert.match(chronicle, /昨夜之梦带来了|昨夜之梦未落地|夜梦:/);
});
