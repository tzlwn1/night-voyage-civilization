import { carryingCapacity } from "./carrying.ts";
import { institutionCap } from "./dream.ts";
import type { ExtinctionCauseId } from "./state.ts";
import { createGenesisState } from "./genesis.ts";
import { parseCivSeq } from "./paths.ts";
import { advanceInterregnum, judgeHeritage } from "./succession.ts";
import { createRng } from "./rng.ts";
import { settleYear } from "./year.ts";
import type { PoliticalStage, WorldState } from "./state.ts";

const SEEDS = [
  "night",
  "night001",
  "stone",
  "river-7",
  "coral-mist",
  "ember-tide",
  "lost-harbor",
  "wind-salt",
  "deep-lantern",
  "ash-dawn",
  "quiet-fleet",
  ...Array.from({ length: 39 }, (_, i) => `cal-${String(i + 1).padStart(2, "0")}`),
];

type GenBucket = "首文明" | "第二代" | "第三代及以后";

interface CivRun {
  seed: string;
  civId: string;
  civSeq: number;
  bucket: GenBucket;
  endYear: number;
  extinct: boolean;
  extinctionCause: ExtinctionCauseId | null;
  firstWriting: number | null;
  firstRegime: number | null;
  firstDynasty: number | null;
  dynastySpans: number[];
  maxPopOverCap: number;
  eventsByStage: Record<PoliticalStage, number[]>;
  instMaxByStage: Record<PoliticalStage, number>;
  capBreaches: number;
}

let yearlyActiveInst: number[] = [];
let yearlyActiveByStage: Record<PoliticalStage, number[]> = {
  camp: [],
  settled: [],
  regime: [],
};

function bucketOf(civSeq: number): GenBucket {
  if (civSeq <= 1) {
    return "首文明";
  }
  if (civSeq === 2) {
    return "第二代";
  }
  return "第三代及以后";
}

function median(values: number[]): number {
  if (values.length === 0) {
    return NaN;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function pct(values: number[], p: number): number {
  if (values.length === 0) {
    return NaN;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

function simulateSeed(seed: string, years: number): CivRun[] {
  const runs: CivRun[] = [];
  let state = createGenesisState(seed);
  let current = freshRun(seed, state);
  let lastCivId = state.civId;

  for (let step = 0; step < years; step += 1) {
    if (state.phase !== "active") {
      const rng = createRng(state.rngState);
      const before = state.civId;
      state = advanceInterregnum(state, rng);
      if (state.predecessorSnapshot) {
        const judged = judgeHeritage(state.predecessorSnapshot, state.origin, rng);
        state = {
          ...state,
          dreamInstitutions: judged.carriedInstitutions,
          predecessorSnapshot: null,
          rngState: rng.getState(),
        };
      }
      if (state.phase === "active" && state.civId !== before && state.civId !== lastCivId) {
        current = freshRun(seed, state);
        lastCivId = state.civId;
      }
      continue;
    }

    const stage = state.politicalStage;
    const phaseBefore = state.phase;
    const settled = settleYear(state);
    state = settled.state;
    const year = settled.report.year;
    if (phaseBefore === "active" && state.phase === "fallout") {
      current.extinct = true;
      current.endYear = year;
      current.extinctionCause = settled.report.extinction?.cause ?? null;
      runs.push(current);
    }

    current.eventsByStage[stage].push(settled.report.events.length);
    const instN = state.dreamInstitutions.length;
    const cap = institutionCap(state);
    current.instMaxByStage[stage] = Math.max(current.instMaxByStage[stage], instN);
    if (instN > cap) {
      current.capBreaches += 1;
    }
    yearlyActiveInst.push(instN);
    yearlyActiveByStage[stage].push(instN);

    const carry = carryingCapacity(state);
    if (carry > 0) {
      current.maxPopOverCap = Math.max(current.maxPopOverCap, state.population / carry);
    }

    if (!current.firstWriting && state.hasWriting) {
      current.firstWriting = year;
    }
    if (!current.firstRegime && state.politicalStage === "regime" && state.naming.selfName) {
      current.firstRegime = year;
    }
    for (const alias of state.naming.aliases) {
      if (alias.kind === "改朝" && (current.firstRegime === null || alias.year > current.firstRegime)) {
        if (current.firstDynasty === null || alias.year < current.firstDynasty) {
          current.firstDynasty = alias.year;
        }
      }
    }
    const dynastyAliases = state.naming.aliases.filter((a) => a.kind === "改朝");
    if (dynastyAliases.length >= 2) {
      const last = dynastyAliases[dynastyAliases.length - 1];
      const prev = dynastyAliases[dynastyAliases.length - 2];
      if (last.year === year) {
        current.dynastySpans.push(last.year - prev.year);
      }
    }
    current.endYear = year;
  }
  if (state.phase === "active") {
    runs.push(current);
  }
  return runs;
}

function freshRun(seed: string, state: WorldState): CivRun {
  const civSeq = parseCivSeq(state.civId);
  return {
    seed,
    civId: state.civId,
    civSeq,
    bucket: bucketOf(civSeq),
    endYear: state.year,
    extinct: false,
    extinctionCause: null,
    firstWriting: null,
    firstRegime: null,
    firstDynasty: null,
    dynastySpans: [],
    maxPopOverCap: state.population / Math.max(1, carryingCapacity(state)),
    eventsByStage: { camp: [], settled: [], regime: [] },
    instMaxByStage: { camp: 0, settled: 0, regime: 0 },
    capBreaches: 0,
  };
}

function meanEvents(bucket: number[]): number {
  if (bucket.length === 0) {
    return NaN;
  }
  return bucket.reduce((a, b) => a + b, 0) / bucket.length;
}

function reportGenGroup(label: GenBucket, runs: CivRun[]): string[] {
  const extinct = runs.filter((r) => r.extinct);
  const active = runs.filter((r) => !r.extinct);
  const lifespans = extinct.map((r) => r.endYear);
  const early = extinct.filter((r) => r.endYear >= 26 && r.endYear <= 100).length;
  const earlyPct = extinct.length > 0 ? ((early / extinct.length) * 100).toFixed(1) : "—";
  const unstable = extinct.length < 30 ? "（已灭样本 <30，分位数不稳定）" : "";

  const causes: Record<ExtinctionCauseId, number> = {
    depopulation: 0,
    "famine-collapse": 0,
    "disorder-collapse": 0,
  };
  for (const r of extinct) {
    const c = r.extinctionCause ?? "depopulation";
    causes[c] += 1;
  }

  return [
    `#### ${label}`,
    `- 段数 ${runs.length}（已灭 ${extinct.length}，仍存续 ${active.length}）`,
    `- 已灭寿命 P25/P50/P75：${fmt(pct(lifespans, 25))} / ${fmt(median(lifespans))} / ${fmt(pct(lifespans, 75))}${unstable}`,
    `- 已灭中 26–100 年早亡：${early} 段（占已灭 ${earlyPct}%）`,
    `- 灭亡原因：人口衰竭 ${causes.depopulation} | 饥荒 ${causes["famine-collapse"]} | 秩序双崩 ${causes["disorder-collapse"]}`,
    `- 仍存续当前年龄：${active.map((r) => `${r.civId}:${r.endYear}`).join(", ") || "无"}`,
    "",
  ];
}

function main(): void {
  yearlyActiveInst = [];
  yearlyActiveByStage = { camp: [], settled: [], regime: [] };
  const allRuns: CivRun[] = [];
  for (const seed of SEEDS) {
    allRuns.push(...simulateSeed(seed, 5000));
  }

  const byBucket = (b: GenBucket) => allRuns.filter((r) => r.bucket === b);
  const total = allRuns.length;
  const dynastySpans = allRuns.flatMap((r) => r.dynastySpans);
  const breaches = allRuns.reduce((a, r) => a + r.capBreaches, 0);

  const milestone = (label: string, pick: (r: CivRun) => number | null) => {
    const vals = allRuns.map(pick);
    const hit = vals.filter((y): y is number => y !== null);
    const n = hit.length;
    const share = ((n / total) * 100).toFixed(1);
    return `- **${label}**：n=${n}（${share}%）| 达成者中位 ${fmt(median(hit))}`;
  };

  const campE = allRuns.flatMap((r) => r.eventsByStage.camp);
  const settledE = allRuns.flatMap((r) => r.eventsByStage.settled);
  const regimeE = allRuns.flatMap((r) => r.eventsByStage.regime);

  const first = byBucket("首文明");
  const firstExtinct = first.filter((r) => r.extinct);
  const firstCauseByBand: Record<string, Record<ExtinctionCauseId, number>> = {
    "0–25": { depopulation: 0, "famine-collapse": 0, "disorder-collapse": 0 },
    "26–100": { depopulation: 0, "famine-collapse": 0, "disorder-collapse": 0 },
    "100+": { depopulation: 0, "famine-collapse": 0, "disorder-collapse": 0 },
  };
  for (const r of firstExtinct) {
    const c = r.extinctionCause ?? "depopulation";
    const key = r.endYear <= 25 ? "0–25" : r.endYear <= 100 ? "26–100" : "100+";
    firstCauseByBand[key][c] += 1;
  }
  const firstN = first.length;
  const at500 = first.filter((r) => r.endYear >= 500).length;
  const at1000 = first.filter((r) => r.endYear >= 1000).length;
  const at5000 = first.filter((r) => r.endYear >= 5000).length;

  const lines = [
    "## 50 种子 × 5000 年 · 分代验收",
    "",
    "### 首文明重点",
    `- 段数 ${firstN} | 已灭 ${firstExtinct.length} | 仍存续 ${first.filter((r) => !r.extinct).length}`,
    `- 已灭 P25/P50/P75：${fmt(pct(firstExtinct.map((r) => r.endYear), 25))} / ${fmt(median(firstExtinct.map((r) => r.endYear)))} / ${fmt(pct(firstExtinct.map((r) => r.endYear), 75))}${firstExtinct.length < 30 ? "（已灭<30，分位仅趋势）" : ""}`,
    `- 26–100 占已灭：${firstExtinct.filter((r) => r.endYear >= 26 && r.endYear <= 100).length} / ${firstExtinct.length || 1}（${firstExtinct.length ? ((firstExtinct.filter((r) => r.endYear >= 26 && r.endYear <= 100).length / firstExtinct.length) * 100).toFixed(1) : "—"}%）`,
    `- 活过 500/1000/顶满5000：${at500}（${((at500 / firstN) * 100).toFixed(1)}%）/ ${at1000}（${((at1000 / firstN) * 100).toFixed(1)}%）/ ${at5000}（${((at5000 / firstN) * 100).toFixed(1)}%）`,
    "- 首文明灭亡原因 × 年龄带：",
    `  - 0–25：衰竭 ${firstCauseByBand["0–25"].depopulation} 饥荒 ${firstCauseByBand["0–25"]["famine-collapse"]} 秩序 ${firstCauseByBand["0–25"]["disorder-collapse"]}`,
    `  - 26–100：衰竭 ${firstCauseByBand["26–100"].depopulation} 饥荒 ${firstCauseByBand["26–100"]["famine-collapse"]} 秩序 ${firstCauseByBand["26–100"]["disorder-collapse"]}`,
    `  - 100+：衰竭 ${firstCauseByBand["100+"].depopulation} 饥荒 ${firstCauseByBand["100+"]["famine-collapse"]} 秩序 ${firstCauseByBand["100+"]["disorder-collapse"]}`,
    "",
    "### 按文明段序号",
    ...reportGenGroup("首文明", first),
    ...reportGenGroup("第二代", byBucket("第二代")),
    ...reportGenGroup("第三代及以后", byBucket("第三代及以后")),
    "### 全局里程碑",
    milestone("文字", (r) => r.firstWriting),
    milestone("建国", (r) => r.firstRegime),
    milestone("改朝", (r) => r.firstDynasty),
    "",
    "### 朝代间隔",
    `P25/P50/P75 ${fmt(pct(dynastySpans, 25))} / ${fmt(median(dynastySpans))} / ${fmt(pct(dynastySpans, 75))} | max ${dynastySpans.length ? Math.max(...dynastySpans) : "—"} | n=${dynastySpans.length}`,
    "",
    "### 制度 / 人口 / 事件",
    `- 超限年数：**${breaches}**`,
    `- 阶段峰值中位（营地/聚落/政权）：${fmt(median(allRuns.map((r) => r.instMaxByStage.camp)))} / ${fmt(median(allRuns.map((r) => r.instMaxByStage.settled)))} / ${fmt(median(allRuns.map((r) => r.instMaxByStage.regime)))}`,
    `- 阶段逐年活跃中位：${fmt(median(yearlyActiveByStage.camp))} / ${fmt(median(yearlyActiveByStage.settled))} / ${fmt(median(yearlyActiveByStage.regime))}`,
    `- 人口/承载峰值比中位：${fmt(median(allRuns.map((r) => r.maxPopOverCap)))}`,
    `- 年入册事件：营地 ${fmt(meanEvents(campE))} | 聚落 ${fmt(meanEvents(settledE))} | 政权 ${fmt(meanEvents(regimeE))}`,
    "",
  ];
  console.log(lines.join("\n"));
}

function fmt(n: number): string {
  if (Number.isNaN(n)) {
    return "—";
  }
  return (Math.round(n * 10) / 10).toString();
}

main();
