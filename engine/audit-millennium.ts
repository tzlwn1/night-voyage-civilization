import { carryingCapacity } from "./carrying.ts";
import { institutionCap } from "./dream.ts";
import type { ExtinctionCauseId } from "./state.ts";
import { createGenesisState } from "./genesis.ts";
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
];

interface CivRun {
  seed: string;
  civId: string;
  endYear: number;
  extinct: boolean;
  extinctionCause: ExtinctionCauseId | null;
  firstSettlement: number | null;
  firstWriting: number | null;
  firstRegime: number | null;
  firstDynasty: number | null;
  dynastySpans: number[];
  maxPop: number;
  maxPopOverCap: number;
  eventsByStage: Record<PoliticalStage, number[]>;
  instMaxByStage: Record<PoliticalStage, number>;
  capBreaches: number;
}

const yearlyActiveInst: number[] = [];
const yearlyActiveByStage: Record<PoliticalStage, number[]> = {
  camp: [],
  settled: [],
  regime: [],
};

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

    const n = settled.report.events.length;
    current.eventsByStage[stage].push(n);
    const instN = state.dreamInstitutions.length;
    const cap = institutionCap(state);
    current.instMaxByStage[stage] = Math.max(current.instMaxByStage[stage], instN);
    if (instN > cap) {
      current.capBreaches += 1;
    }
    yearlyActiveInst.push(instN);
    yearlyActiveByStage[stage].push(instN);

    const pop = state.population;
    current.maxPop = Math.max(current.maxPop, pop);
    const carry = carryingCapacity(state);
    if (carry > 0) {
      current.maxPopOverCap = Math.max(current.maxPopOverCap, pop / carry);
    }

    if (!current.firstSettlement && state.naming.settlementName) {
      current.firstSettlement = year;
    }
    if (!current.firstWriting && state.hasWriting) {
      current.firstWriting = year;
    }
    if (!current.firstRegime && state.politicalStage === "regime" && state.naming.selfName) {
      current.firstRegime = year;
    }
    for (const alias of state.naming.aliases) {
      if (alias.kind === "改朝") {
        if (current.firstDynasty === null || alias.year < current.firstDynasty) {
          if (current.firstRegime === null || alias.year > current.firstRegime) {
            current.firstDynasty = alias.year;
          }
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
  return {
    seed,
    civId: state.civId,
    endYear: state.year,
    extinct: false,
    extinctionCause: null,
    firstSettlement: null,
    firstWriting: null,
    firstRegime: null,
    firstDynasty: null,
    dynastySpans: [],
    maxPop: state.population,
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

function milestoneBlock(
  title: string,
  values: (number | null)[],
  totalSegments: number,
): string[] {
  const hit = values.filter((y): y is number => y !== null);
  const n = hit.length;
  const share = totalSegments > 0 ? ((n / totalSegments) * 100).toFixed(1) : "—";
  return [
    `#### ${title}`,
    `- 达成 n=${n}，占全部文明段 ${share}%`,
    `- 达成者中位 ${fmt(median(hit))}（P25 ${fmt(pct(hit, 25))} / P75 ${fmt(pct(hit, 75))}）`,
  ];
}

function instHistogram(values: number[]): string {
  const buckets = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (const v of values) {
    const idx = v >= 8 ? 8 : v;
    buckets[idx] += 1;
  }
  const total = values.length;
  return [0, 1, 2, 3, 4, 5, 6, 7, "8+"].map((label, i) => {
    const c = buckets[i];
    const p = total > 0 ? ((c / total) * 100).toFixed(1) : "0";
    return `${label}条:${c}(${p}%)`;
  }).join(" | ");
}

function main(): void {
  const allRuns: CivRun[] = [];
  for (const seed of SEEDS) {
    allRuns.push(...simulateSeed(seed, 5000));
  }
  const total = allRuns.length;
  const extinctRuns = allRuns.filter((r) => r.extinct);
  const activeRuns = allRuns.filter((r) => !r.extinct);
  const extinctLifespans = extinctRuns.map((r) => r.endYear);
  const earlyExtinct = extinctRuns.filter((r) => r.endYear >= 26 && r.endYear <= 100).length;
  const earlyShare = extinctRuns.length > 0 ? ((earlyExtinct / extinctRuns.length) * 100).toFixed(1) : "—";

  const share = (n: number) => `${((n / total) * 100).toFixed(1)}%`;
  const dynastySpans = allRuns.flatMap((r) => r.dynastySpans);

  const causeDetail: Record<string, Record<ExtinctionCauseId, number>> = {
    "0–25": { depopulation: 0, "famine-collapse": 0, "disorder-collapse": 0 },
    "26–100": { depopulation: 0, "famine-collapse": 0, "disorder-collapse": 0 },
    "100+": { depopulation: 0, "famine-collapse": 0, "disorder-collapse": 0 },
  };
  for (const r of extinctRuns) {
    const c = r.extinctionCause ?? "depopulation";
    const key = r.endYear <= 25 ? "0–25" : r.endYear <= 100 ? "26–100" : "100+";
    causeDetail[key][c] += 1;
  }

  const campEvents = allRuns.flatMap((r) => r.eventsByStage.camp);
  const settledEvents = allRuns.flatMap((r) => r.eventsByStage.settled);
  const regimeEvents = allRuns.flatMap((r) => r.eventsByStage.regime);
  const breaches = allRuns.reduce((a, r) => a + r.capBreaches, 0);

  const lines = [
    "## 千年史校准第三轮验收（11 种子 × 5000 年）",
    "",
    "### 1. 文明段寿命",
    `- 已灭亡 ${extinctRuns.length} 段 | 仍存续 ${activeRuns.length} 段 | 总 ${total} 段`,
    `- **已灭** P25/P50/P75：${fmt(pct(extinctLifespans, 25))} / ${fmt(median(extinctLifespans))} / ${fmt(pct(extinctLifespans, 75))}`,
    `- 已灭中 **26–100 年** ${earlyExtinct} 段（占已灭 **${earlyShare}%**）`,
    `- 仍存续当前年龄（非完整寿命）：${activeRuns.map((r) => `${r.civId}:${r.endYear}`).join(", ") || "无"}`,
    `- 活过 100/500/1000 年：${allRuns.filter((r) => r.endYear >= 100).length} (${share(allRuns.filter((r) => r.endYear >= 100).length)}) / ${allRuns.filter((r) => r.endYear >= 500).length} (${share(allRuns.filter((r) => r.endYear >= 500).length)}) / ${allRuns.filter((r) => r.endYear >= 1000).length} (${share(allRuns.filter((r) => r.endYear >= 1000).length)})`,
    "",
    "### 2. 灭亡原因 × 年龄带（仅已灭段）",
    "| 带 | 人口衰竭 | 饥荒 | 秩序双崩 |",
    "|---|---:|---:|---:|",
    `| 0–25 | ${causeDetail["0–25"].depopulation} | ${causeDetail["0–25"]["famine-collapse"]} | ${causeDetail["0–25"]["disorder-collapse"]} |`,
    `| 26–100 | ${causeDetail["26–100"].depopulation} | ${causeDetail["26–100"]["famine-collapse"]} | ${causeDetail["26–100"]["disorder-collapse"]} |`,
    `| 100+ | ${causeDetail["100+"].depopulation} | ${causeDetail["100+"]["famine-collapse"]} | ${causeDetail["100+"]["disorder-collapse"]} |`,
    "",
    "### 3. 里程碑（分开口径）",
    ...milestoneBlock("文字", allRuns.map((r) => r.firstWriting), total),
    "",
    ...milestoneBlock("建国", allRuns.map((r) => r.firstRegime), total),
    "",
    ...milestoneBlock("改朝", allRuns.map((r) => r.firstDynasty), total),
    "",
    "### 4. 朝代间隔（年）",
    `- P25/P50/P75：${fmt(pct(dynastySpans, 25))} / ${fmt(median(dynastySpans))} / ${fmt(pct(dynastySpans, 75))}`,
    `- 最大：${dynastySpans.length > 0 ? Math.max(...dynastySpans) : "—"} | n=${dynastySpans.length}`,
    "",
    "### 5. 制度",
    `- **超限年数：${breaches}**（须为 0）`,
    `- 各阶段**峰值**中位：营地 ${fmt(median(allRuns.map((r) => r.instMaxByStage.camp)))} | 聚落 ${fmt(median(allRuns.map((r) => r.instMaxByStage.settled)))} | 政权 ${fmt(median(allRuns.map((r) => r.instMaxByStage.regime)))}`,
    `- 各阶段**逐年活跃**中位：营地 ${fmt(median(yearlyActiveByStage.camp))} | 聚落 ${fmt(median(yearlyActiveByStage.settled))} | 政权 ${fmt(median(yearlyActiveByStage.regime))}`,
    `- 全局逐年活跃中位：${fmt(median(yearlyActiveInst))}`,
    `- 逐年活跃分布：${instHistogram(yearlyActiveInst)}`,
    "",
    "### 6. 人口 / 事件（防回退）",
    `- 人口/承载峰值比中位：${fmt(median(allRuns.map((r) => r.maxPopOverCap)))}`,
    `- 年入册事件：营地 ${fmt(meanEvents(campEvents))} | 聚落 ${fmt(meanEvents(settledEvents))} | 政权 ${fmt(meanEvents(regimeEvents))}`,
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
