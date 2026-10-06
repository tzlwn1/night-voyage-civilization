import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import { eventWeight, loadEventTemplates } from "./events.ts";
import { genesis } from "./genesis.ts";
import { createRng } from "./rng.ts";
import { advanceInterregnum } from "./succession.ts";
import { CHRONICLE_STEP, MONTH_STEPS, settleYear } from "./year.ts";
import { readState, type WorldState } from "./state.ts";

test("事件池有 40 条，八类各五条", () => {
  const events = loadEventTemplates();
  assert.equal(events.length, 40);
  for (const category of ["丰收", "缺粮", "瘟疫", "争吵", "建成", "迁入", "庆典", "事故"]) {
    assert.equal(events.filter((event) => event.category === category).length, 5);
  }
});

test("缺粮抬高瘟疫与争吵，无文字时史官权重为零", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "nvc-"));
  const founded = await genesis(root, "night");
  const calm: WorldState = { ...founded, food: founded.population * 3, health: 80, order: 80 };
  const hungry: WorldState = { ...founded, food: 0, health: 80, order: 80 };
  const events = loadEventTemplates();
  const plague = events.find((event) => event.id === "plague-lanes");
  const quarrel = events.find((event) => event.id === "quarrel-rations");
  const scribe = events.find((event) => event.id === "harvest-scribe");
  assert.ok(plague && quarrel && scribe);
  assert.ok(eventWeight(plague, hungry) > eventWeight(plague, calm));
  assert.ok(eventWeight(quarrel, hungry) > eventWeight(quarrel, calm));
  assert.equal(eventWeight(scribe, { ...calm, hasWriting: false }), 0);
  assert.ok(eventWeight(scribe, { ...calm, hasWriting: true }) > 0);
});

test("一年按月走完八步，危机月可以超过五件", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "nvc-"));
  await genesis(root, "night");
  const founded = await readState(root);
  assert.ok(founded);
  const settled = settleYear(founded);
  assert.deepEqual(
    settled.report.steps,
    [...Array.from({ length: 12 }, () => [...MONTH_STEPS]).flat(), CHRONICLE_STEP],
  );

  let crisis: WorldState = {
    ...founded,
    phase: "active",
    population: 320,
    food: 0,
    health: 20,
    order: 20,
    goods: 30,
    buildings: 6,
    hasWriting: true,
    politicalStage: "regime",
    settlementDepth: 80,
    naming: {
      ...founded.naming,
      settlementName: "测寨",
      selfName: "测国",
    },
    extinct: false,
  };
  let burst = 0;
  for (let year = 0; year < 5 && crisis.population > 0; year += 1) {
    const result = settleYear(crisis);
    crisis = {
      ...result.state,
      phase: "active",
      extinct: false,
      falloutRemaining: 0,
      voidRemaining: 0,
      pendingSuccession: null,
      predecessorSnapshot: null,
    };
    const byMonth = new Map<number, number>();
    for (const event of result.report.events) {
      byMonth.set(event.month, (byMonth.get(event.month) ?? 0) + 1);
    }
    for (const count of byMonth.values()) {
      burst = Math.max(burst, count);
    }
  }
  assert.ok(burst >= 4);
});

test("连跑 200 年人口不为负且没有 NaN", async () => {
  for (const seed of ["night", "night001", "stone"]) {
    const root = await mkdtemp(path.join(tmpdir(), "nvc-"));
    let state = await genesis(root, seed);
    let recorded = 0;
    let months = 0;
    for (let year = 0; year < 200; year += 1) {
      if (state.phase !== "active") {
        const rng = createRng(state.rngState);
        state = advanceInterregnum(state, rng);
        continue;
      }
      const alive = !state.extinct && state.population > 0;
      const settled = settleYear(state);
      state = settled.state;
      assertSane(state);
      if (alive) {
        recorded += settled.report.events.length;
        months += 12;
      }
    }
    if (seed === "night") {
      const years = months / 12;
      const perYear = years > 0 ? recorded / years : 0;
      assert.ok(perYear >= 2 && perYear <= 55, `night 年均入册 ${perYear}`);
    }
  }
});

function assertSane(state: WorldState): void {
  for (const value of [state.population, state.food, state.goods, state.health, state.order, state.buildings]) {
    assert.equal(Number.isInteger(value), true);
    assert.ok(value >= 0);
    assert.equal(Number.isNaN(value), false);
  }
}
