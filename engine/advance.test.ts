import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import { advanceOneYear } from "./advance.ts";
import { yearHeadline } from "./headline.ts";
import { buildExtinctionTag } from "./tags.ts";
import { settleYear } from "./year.ts";
import { readState } from "./state.ts";
import { genesis } from "./genesis.ts";

test("头条优先取灾变或严重事件", () => {
  const headline = yearHeadline({
    civId: "civ-001",
    year: 3,
    populationBefore: 100,
    populationAfter: 90,
    events: [
      { month: 2, id: "a", title: "小雨", category: "丰收", level: "平常" },
      { month: 7, id: "b", title: "瘟疫蔓延", category: "瘟疫", level: "灾变" },
    ],
    namingNotes: [],
    dream: { tag: "x", text: "", brought: "" },
    extinction: null,
    summary: {
      births: 0,
      deaths: 0,
      foodStart: 0,
      foodEnd: 0,
      foodProduced: 0,
      foodConsumed: 0,
      goodsStart: 0,
      goodsEnd: 0,
      goodsCrafted: 0,
      healthStart: 0,
      healthEnd: 0,
      orderStart: 0,
      orderEnd: 0,
      buildingsStart: 0,
      buildingsEnd: 0,
    },
    steps: [],
    chronicle: "",
  });
  assert.equal(headline, "第 3 年 · 7月 瘟疫蔓延");
});

test("年度标题含自称时前置国号", () => {
  const headline = yearHeadline(
    {
      civId: "civ-001",
      year: 12,
      populationBefore: 100,
      populationAfter: 100,
      events: [{ month: 4, id: "a", title: "夜航风暴", category: "事故", level: "严重" }],
      namingNotes: [],
      dream: { tag: "x", text: "", brought: "" },
      extinction: null,
      summary: {
        births: 0,
        deaths: 0,
        foodStart: 0,
        foodEnd: 0,
        foodProduced: 0,
        foodConsumed: 0,
        goodsStart: 0,
        goodsEnd: 0,
        goodsCrafted: 0,
        healthStart: 0,
        healthEnd: 0,
        orderStart: 0,
        orderEnd: 0,
        buildingsStart: 0,
        buildingsEnd: 0,
      },
      steps: [],
      chronicle: "",
    },
    "再航国",
  );
  assert.equal(headline, "再航国第 12 年 · 4月 夜航风暴");
});

test("灭亡附注 tag 含序号、起止年与末代人口", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "nvc-adv-"));
  const founded = await genesis(root, "night");
  const doomed = settleYear({
    ...founded,
    phase: "active",
    year: 12,
    population: 0,
    sparseYears: 2,
  });
  assert.ok(doomed.report.extinction);
  const tag = buildExtinctionTag(doomed.state, doomed.report.extinction!);
  assert.match(tag.name, new RegExp(`^civ-001_1-${doomed.state.year}_`));
  assert.match(tag.message, /末代人口: 0/);
  assert.match(tag.message, /全名:/);
});

test("逐年推进会重写 README", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "nvc-adv-"));
  await advanceOneYear(root, "night");
  await advanceOneYear(root, "night");
  const readme = await readFile(path.join(root, "README.md"), "utf8");
  assert.match(readme, /请勿手改/);
  assert.match(readme, /持续自动更新/);
  const state = await readState(root);
  assert.ok(state && state.year >= 1);
});
