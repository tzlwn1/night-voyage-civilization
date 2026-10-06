import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { CLIMATES, GEOGRAPHIES, ORIGINS, type OriginId } from "./catalog.ts";
import { writeGenesisChronicle, writeWorldIndex } from "./chronicle.ts";
import { enforceDreamInstitutionCap, weakenInstitution } from "./dream.ts";
import { initialPoliticalFields } from "./maturity.ts";
import { FALLOUT_YEARS, VOID_YEARS, causeLabel, renderAnnals, type ExtinctionVerdict } from "./extinction.ts";
import { initialNaming } from "./naming.ts";
import { annalsFile, formatCivId, heritageFile, parseCivSeq, revisionFile } from "./paths.ts";
import { createRng, type Rng } from "./rng.ts";
import type {
  CivilizationSnapshot,
  DreamInstitution,
  HeritageOutcome,
  WorldState,
} from "./state.ts";
import { STATE_VERSION, initialMeta, initialStocks, writeState } from "./state.ts";

export function beginFallout(state: WorldState, verdict: ExtinctionVerdict): WorldState {
  const snapshot: CivilizationSnapshot = {
    civId: state.civId,
    startYear: 1,
    endYear: state.year,
    worldStartYear: state.civStartWorldYear,
    worldEndYear: state.worldYear,
    cause: verdict.cause,
    finalPopulation: verdict.finalPopulation,
    archiveHealth: verdict.archiveHealth,
    naming: state.naming,
    dreamInstitutions: state.dreamInstitutions,
    hasWriting: state.hasWriting,
  };
  return {
    ...state,
    extinct: true,
    phase: "fallout",
    falloutRemaining: FALLOUT_YEARS,
    voidRemaining: VOID_YEARS,
    pendingSuccession: snapshot,
  };
}

export function advanceInterregnum(state: WorldState, rng: Rng): WorldState {
  if (state.phase === "fallout") {
    const falloutRemaining = state.falloutRemaining - 1;
    if (falloutRemaining > 0) {
      return { ...state, falloutRemaining, worldYear: state.worldYear + 1, rngState: rng.getState() };
    }
    return {
      ...state,
      phase: "void",
      falloutRemaining: 0,
      worldYear: state.worldYear + 1,
      rngState: rng.getState(),
    };
  }
  if (state.phase === "void") {
    const voidRemaining = state.voidRemaining - 1;
    if (voidRemaining > 0) {
      return { ...state, voidRemaining, worldYear: state.worldYear + 1, rngState: rng.getState() };
    }
    return riseFromRuins(state, rng);
  }
  return state;
}

export async function writeAnnals(root: string, state: WorldState, verdict: ExtinctionVerdict): Promise<void> {
  const file = annalsFile(root, state.civId);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, renderAnnals(state, verdict), "utf8");
}

export async function applySuccessionArtifacts(root: string, state: WorldState): Promise<WorldState> {
  const snapshot = state.predecessorSnapshot;
  if (!snapshot) {
    return state;
  }
  const rng = createRng(state.rngState);
  const judged = judgeHeritage(snapshot, state.origin, rng);
  await writeSuccessionArtifacts(root, snapshot, state, judged.outcomes, rng);
  const next: WorldState = enforceDreamInstitutionCap({
    ...state,
    dreamInstitutions: judged.carriedInstitutions,
    predecessorSnapshot: null,
    rngState: rng.getState(),
  });
  await writeState(root, next);
  await writeGenesisChronicle(root, next);
  return next;
}

export function judgeHeritage(
  snapshot: CivilizationSnapshot,
  successorOrigin: OriginId,
  rng: Rng,
): { outcomes: HeritageOutcome[]; carriedInstitutions: DreamInstitution[] } {
  const outcomes: HeritageOutcome[] = [];
  const carried: DreamInstitution[] = [];
  const originBias = originRetentionBias(successorOrigin);
  const causePenalty =
    snapshot.cause === "famine-collapse" ? 12 : snapshot.cause === "disorder-collapse" ? 18 : 8;
  const baseRetain = Math.max(5, snapshot.archiveHealth + originBias - causePenalty);

  for (const institution of snapshot.dreamInstitutions) {
    const roll = rng.int(0, 99);
    const outcome = pickOutcome(roll, baseRetain);
    outcomes.push({
      category: institution.kind === "law" ? "法律" : institution.kind === "festival" ? "节日" : "禁忌",
      name: institution.title,
      outcome,
      note: outcomeNote(outcome, institution.title),
    });
    if (outcome === "保留") {
      carried.push(institution);
    } else if (outcome === "篡改") {
      carried.push(weakenInstitution(institution, rng));
    }
  }

  outcomes.push({
    category: "地名",
    name: snapshot.naming.commonName,
    outcome: pickOutcome(rng.int(0, 99), baseRetain - 5),
    note: "通称在口传中变形。",
  });
  if (snapshot.naming.selfName) {
    outcomes.push({
      category: "名号",
      name: snapshot.naming.selfName,
      outcome: pickOutcome(rng.int(0, 99), baseRetain),
      note: "自称或被神化，或被贬称。",
    });
  }
  outcomes.push({
    category: "编年史",
    name: `${snapshot.civId} 逐年记录`,
    outcome: pickOutcome(rng.int(0, 99), baseRetain + (snapshot.hasWriting ? 10 : -15)),
    note: snapshot.hasWriting ? "有文字者较易留存纸面。" : "无文字者更易只剩口传。",
  });

  return { outcomes, carriedInstitutions: carried };
}

function riseFromRuins(state: WorldState, rng: Rng): WorldState {
  const pending = state.pendingSuccession;
  if (!pending) {
    throw new Error("缺少灭亡快照，无法继承");
  }
  const civSeq = parseCivSeq(pending.civId) + 1;
  const civId = formatCivId(civSeq);
  const geography = rng.pick(GEOGRAPHIES).id;
  const climate = rng.pick(CLIMATES).id;
  const origin = rng.pick(ORIGINS).id;
  const archive = pending.archiveHealth;
  const popFloor = Math.max(56, Math.trunc(archive * 2.1));
  const popCeil = Math.min(380, Math.max(popFloor + 24, Math.trunc(archive * 3.4)));
  const population = Math.max(popFloor, Math.min(popCeil, rng.int(popFloor, popCeil)));
  const stocks = initialStocks(population);
  const food = stocks.food + Math.trunc(archive * 5.5 + population * 2.2);
  const political = initialPoliticalFields();
  const worldYear = state.worldYear + 1;
  return {
    version: STATE_VERSION,
    civId,
    civSeq,
    seed: state.seed,
    year: 0,
    worldYear,
    civStartWorldYear: worldYear,
    ...initialMeta(),
    geography,
    climate,
    origin,
    population,
    foundingPopulation: population,
    food,
    goods: stocks.goods + Math.trunc(archive / 5),
    health: Math.min(100, stocks.health + Math.trunc(archive / 14)),
    order: Math.min(100, stocks.order + Math.trunc(archive / 10)),
    buildings: stocks.buildings,
    hasWriting: stocks.hasWriting,
    naming: initialNaming(geography, origin),
    dreamInstitutions: [],
    ...political,
    memoryContinuity: Math.min(100, 50 + Math.trunc(archive / 2.8)),
    famineYears: 0,
    sparseYears: 0,
    extinct: false,
    pendingSuccession: null,
    predecessorSnapshot: pending,
    rngState: rng.getState(),
    lastSettlement: null,
  };
}

async function writeSuccessionArtifacts(
  root: string,
  predecessor: CivilizationSnapshot,
  successor: WorldState,
  outcomes: HeritageOutcome[],
  rng: Rng,
): Promise<void> {
  const revision = [
    `# 后世修订`,
    "",
    `修订者: ${successor.civId}`,
    `世界历: ${successor.worldYear}`,
    `前朝: ${predecessor.civId}（${causeLabel(predecessor.cause)}）`,
    "",
    "本文件为后世叙述，不改动当年原始编年史。",
    "",
    ...outcomes.map((item) => `- ${item.category}「${item.name}」：${item.outcome}。${item.note}`),
    "",
    `修订者记: ${rng.pick([
      "前朝之事，半信半疑，姑录于此。",
      "旧卷在潮里发霉，只好凭口传补上几笔。",
      "废墟上拾得残简，与口传互证后写下此稿。",
    ])}`,
    "",
  ].join("\n");
  const revisionPath = revisionFile(root, predecessor.civId, successor.worldYear, successor.civId);
  await mkdir(path.dirname(revisionPath), { recursive: true });
  await writeFile(revisionPath, revision, "utf8");

  const heritage = [
    `# 继承记：${predecessor.civId} → ${successor.civId}`,
    "",
    `继承者来历: ${successor.origin}`,
    `前朝灭亡: ${causeLabel(predecessor.cause)}`,
    `档案健康度: ${predecessor.archiveHealth}`,
    "",
    "## 遗产判定",
    ...outcomes.map((item) => `- ${item.category}「${item.name}」→ ${item.outcome}（${item.note}）`),
    "",
  ].join("\n");
  const heritagePath = heritageFile(root, successor.civId, predecessor.civId);
  await mkdir(path.dirname(heritagePath), { recursive: true });
  await writeFile(heritagePath, heritage, "utf8");
}

function originRetentionBias(origin: OriginId): number {
  switch (origin) {
    case "forgotten-colony":
      return 15;
    case "pilgrim-convoy":
      return 8;
    case "exiled-clan":
      return 5;
    case "starfall-refugees":
      return 0;
    case "shipwreck-fleet":
      return -5;
    default:
      return 0;
  }
}

function pickOutcome(roll: number, retainScore: number): HeritageOutcome["outcome"] {
  if (roll < retainScore - 20) {
    return "保留";
  }
  if (roll < retainScore) {
    return "神话化";
  }
  if (roll < retainScore + 25) {
    return "篡改";
  }
  return "失传";
}

function outcomeNote(outcome: HeritageOutcome["outcome"], name: string): string {
  switch (outcome) {
    case "保留":
      return `后世仍沿用「${name}」之名与做法。`;
    case "神话化":
      return `「${name}」被附会神异，原意模糊。`;
    case "篡改":
      return `「${name}」被改写以合新朝口径。`;
    case "失传":
      return `「${name}」仅余碎片，难再考。`;
  }
}
