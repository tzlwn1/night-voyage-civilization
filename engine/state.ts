import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  CLIMATES,
  GEOGRAPHIES,
  ORIGINS,
  type ClimateId,
  type GeographyId,
  type OriginId,
} from "./catalog.ts";
import { initialNaming, type NamingKind } from "./naming.ts";
import { FIRST_CIV_SEQ, formatCivId, stateFile } from "./paths.ts";

export const STATE_VERSION = 6 as const;

export type PoliticalStage = "camp" | "settled" | "regime";

export type WorldPhase = "active" | "fallout" | "void";
export type ExtinctionCauseId = "depopulation" | "famine-collapse" | "disorder-collapse";
export type HeritageOutcomeKind = "保留" | "神话化" | "篡改" | "失传";

export type DreamTag = "缺粮" | "争吵" | "低落" | "建成" | "人口增长";
export type DreamInstitutionKind = "law" | "festival" | "taboo";

export interface DreamEffects {
  foodProductionPermille: number;
  birthPer10k: number;
  deathPer10k: number;
  orderPerMonth: number;
  healthPerMonth: number;
  goodsPerMonth: number;
  buildEventWeightAdd: number;
  shortageWeightPermille: number;
  harvestWeightPermille: number;
  quarrelWeightPermille: number;
  accidentWeightPermille: number;
  immigrationWeightPermille: number;
}

export interface DreamInstitution {
  id: string;
  kind: DreamInstitutionKind;
  tag: DreamTag;
  title: string;
  enactedYear: number;
  effects: DreamEffects;
}

export interface AliasEntry {
  year: number;
  kind: NamingKind;
  name: string;
}

export interface NamingState {
  settlementName: string | null;
  selfName: string | null;
  commonName: string;
  nicknames: string[];
  aliases: AliasEntry[];
}

export interface Settlement {
  year: number;
  populationBefore: number;
  populationAfter: number;
  eventIds: string[];
}

export interface HeritageOutcome {
  category: string;
  name: string;
  outcome: HeritageOutcomeKind;
  note: string;
}

export interface CivilizationSnapshot {
  civId: string;
  startYear: number;
  endYear: number;
  worldStartYear: number;
  worldEndYear: number;
  cause: ExtinctionCauseId;
  finalPopulation: number;
  archiveHealth: number;
  naming: NamingState;
  dreamInstitutions: DreamInstitution[];
  hasWriting: boolean;
}

export interface WorldState {
  version: typeof STATE_VERSION;
  civId: string;
  civSeq: number;
  seed: string;
  year: number;
  worldYear: number;
  civStartWorldYear: number;
  phase: WorldPhase;
  falloutRemaining: number;
  voidRemaining: number;
  geography: GeographyId;
  climate: ClimateId;
  origin: OriginId;
  population: number;
  foundingPopulation: number;
  food: number;
  goods: number;
  health: number;
  order: number;
  buildings: number;
  hasWriting: boolean;
  extinct: boolean;
  famineYears: number;
  sparseYears: number;
  naming: NamingState;
  dreamInstitutions: DreamInstitution[];
  politicalStage: PoliticalStage;
  settlementDepth: number;
  regimeSinceYear: number | null;
  lastDynastyYear: number;
  dynastyCooldownUntil: number;
  writingProgress: number;
  memoryContinuity: number;
  politicalStress: number;
  pendingSuccession: CivilizationSnapshot | null;
  predecessorSnapshot: CivilizationSnapshot | null;
  rngState: number;
  lastSettlement: Settlement | null;
}

export function initialStocks(population: number): Pick<
  WorldState,
  "food" | "goods" | "health" | "order" | "buildings" | "hasWriting" | "extinct"
> {
  return {
    food: population * 2,
    goods: 12,
    health: 80,
    order: 75,
    buildings: 0,
    hasWriting: false,
    extinct: false,
  };
}

export function initialMeta(): Pick<
  WorldState,
  | "phase"
  | "falloutRemaining"
  | "voidRemaining"
  | "famineYears"
  | "sparseYears"
  | "pendingSuccession"
  | "predecessorSnapshot"
> {
  return {
    phase: "active",
    falloutRemaining: 0,
    voidRemaining: 0,
    famineYears: 0,
    sparseYears: 0,
    pendingSuccession: null,
    predecessorSnapshot: null,
  };
}

export async function readState(root: string): Promise<WorldState | null> {
  try {
    const raw = await readFile(stateFile(root), "utf8");
    return parseState(raw);
  } catch (error) {
    if (isEnoent(error)) {
      return null;
    }
    throw error;
  }
}

export function parseState(raw: string): WorldState {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("存档损坏: world/state.json 不是合法 JSON");
  }
  if (!isRecord(value)) {
    throw new Error("存档损坏: 根节点必须是对象");
  }
  const version = value.version;
  if (version !== 1 && version !== 2 && version !== 3 && version !== 4 && version !== 5 && version !== STATE_VERSION) {
    throw new Error(`存档损坏: 不支持的版本 ${String(version)}`);
  }
  const civId =
    typeof value.civId === "string" && /^civ-\d{3}$/.test(value.civId)
      ? value.civId
      : formatCivId(FIRST_CIV_SEQ);
  if (typeof value.seed !== "string" || value.seed.length === 0) {
    throw new Error("存档损坏: 种子缺失");
  }
  if (!isWhole(value.year) || !isWhole(value.population) || !isWhole(value.foundingPopulation)) {
    throw new Error("存档损坏: 年份或人口不是非负整数");
  }
  if (!isUint32(value.rngState)) {
    throw new Error("存档损坏: 随机数状态无效");
  }
  if (!isId(GEOGRAPHIES, value.geography)) {
    throw new Error("存档损坏: 地理无效");
  }
  if (!isId(CLIMATES, value.climate)) {
    throw new Error("存档损坏: 气候无效");
  }
  if (!isId(ORIGINS, value.origin)) {
    throw new Error("存档损坏: 来历无效");
  }
  const stocks = version === 1 ? initialStocks(value.population) : readStocks(value);
  const naming =
    version >= 3 ? readNaming(value.naming) : initialNaming(value.geography, value.origin);
  const dreamInstitutions = version >= 4 ? readDreamInstitutions(value.dreamInstitutions) : [];
  const meta = version >= 5 ? (version === STATE_VERSION ? readMeta(value) : migrateMeta(value, version)) : migrateMeta(value, version);
  const year = value.year;
  const worldYear = version >= 5 && isWhole(value.worldYear) ? value.worldYear : year;
  const civSeq = version >= 5 && isWhole(value.civSeq) ? value.civSeq : Number(civId.slice(4));
  const progress =
    version === STATE_VERSION ? readProgress(value) : migrateProgress(value, naming, stocks.hasWriting, year);
  return {
    version: STATE_VERSION,
    civId,
    civSeq,
    seed: value.seed,
    year,
    worldYear,
    civStartWorldYear: version >= 5 && isWhole(value.civStartWorldYear) ? value.civStartWorldYear : 1,
    ...meta,
    geography: value.geography,
    climate: value.climate,
    origin: value.origin,
    population: value.population,
    foundingPopulation: value.foundingPopulation,
    ...stocks,
    naming,
    dreamInstitutions,
    ...progress,
    rngState: value.rngState,
    lastSettlement: parseSettlement(value.lastSettlement),
  };
}

export async function writeState(root: string, state: WorldState): Promise<void> {
  const file = stateFile(root);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

function migrateMeta(
  value: Record<string, unknown>,
  version: number,
): ReturnType<typeof initialMeta> {
  const meta = initialMeta();
  if (version >= 4 && value.extinct === true && value.population === 0) {
    meta.phase = "fallout";
    meta.falloutRemaining = 5;
    meta.voidRemaining = 8;
  }
  return meta;
}

function readMeta(value: Record<string, unknown>): ReturnType<typeof initialMeta> {
  const phase = value.phase;
  if (phase !== "active" && phase !== "fallout" && phase !== "void") {
    throw new Error("存档损坏: 阶段无效");
  }
  return {
    phase,
    falloutRemaining: requiredWhole(value.falloutRemaining, "falloutRemaining"),
    voidRemaining: requiredWhole(value.voidRemaining, "voidRemaining"),
    famineYears: requiredWhole(value.famineYears, "famineYears"),
    sparseYears: requiredWhole(value.sparseYears, "sparseYears"),
    pendingSuccession: readSnapshot(value.pendingSuccession),
    predecessorSnapshot: readSnapshot(value.predecessorSnapshot),
  };
}

function readSnapshot(value: unknown): CivilizationSnapshot | null {
  if (value === null) {
    return null;
  }
  if (!isRecord(value)) {
    throw new Error("存档损坏: 灭亡快照无效");
  }
  const cause = value.cause;
  if (cause !== "depopulation" && cause !== "famine-collapse" && cause !== "disorder-collapse") {
    throw new Error("存档损坏: 灭亡原因无效");
  }
  return {
    civId: requiredString(value.civId, "civId"),
    startYear: requiredWhole(value.startYear, "startYear"),
    endYear: requiredWhole(value.endYear, "endYear"),
    worldStartYear: requiredWhole(value.worldStartYear, "worldStartYear"),
    worldEndYear: requiredWhole(value.worldEndYear, "worldEndYear"),
    cause,
    finalPopulation: requiredWhole(value.finalPopulation, "finalPopulation"),
    archiveHealth: requiredPercent(value.archiveHealth, "archiveHealth"),
    naming: readNaming(value.naming),
    dreamInstitutions: readDreamInstitutions(value.dreamInstitutions),
    hasWriting: requiredBoolean(value.hasWriting, "hasWriting"),
  };
}

function readDreamInstitutions(value: unknown): DreamInstitution[] {
  if (!Array.isArray(value)) {
    throw new Error("存档损坏: 梦境制度无效");
  }
  return value.map((item, index) => {
    if (!isRecord(item)) {
      throw new Error(`存档损坏: 梦境制度 ${index} 无效`);
    }
    const kind = item.kind;
    if (kind !== "law" && kind !== "festival" && kind !== "taboo") {
      throw new Error(`存档损坏: 梦境制度 ${index} 类型无效`);
    }
    return {
      id: requiredString(item.id, `梦境制度 ${index}.id`),
      kind,
      tag: requiredString(item.tag, `梦境制度 ${index}.tag`) as DreamTag,
      title: requiredString(item.title, `梦境制度 ${index}.title`),
      enactedYear: requiredWhole(item.enactedYear, `梦境制度 ${index}.enactedYear`),
      effects: readDreamEffects(item.effects, index),
    };
  });
}

function readDreamEffects(value: unknown, index: number): DreamEffects {
  if (!isRecord(value)) {
    throw new Error(`存档损坏: 梦境制度 ${index} 效果无效`);
  }
  const readPermille = (key: string, fallback = 1000) =>
    value[key] === undefined ? fallback : requiredWhole(value[key], key);
  const readSigned = (key: string) => (value[key] === undefined ? 0 : requiredInt(value[key], key));
  return {
    foodProductionPermille: readPermille("foodProductionPermille"),
    birthPer10k: readSigned("birthPer10k"),
    deathPer10k: readSigned("deathPer10k"),
    orderPerMonth: readSigned("orderPerMonth"),
    healthPerMonth: readSigned("healthPerMonth"),
    goodsPerMonth: readSigned("goodsPerMonth"),
    buildEventWeightAdd: readSigned("buildEventWeightAdd"),
    shortageWeightPermille: readPermille("shortageWeightPermille"),
    harvestWeightPermille: readPermille("harvestWeightPermille"),
    quarrelWeightPermille: readPermille("quarrelWeightPermille"),
    accidentWeightPermille: readPermille("accidentWeightPermille"),
    immigrationWeightPermille: readPermille("immigrationWeightPermille"),
  };
}

function readNaming(value: unknown): NamingState {
  if (!isRecord(value)) {
    throw new Error("存档损坏: 名目无效");
  }
  const selfName = value.selfName === null ? null : requiredString(value.selfName, "自称");
  const commonName = requiredString(value.commonName, "通称");
  if (!Array.isArray(value.nicknames) || value.nicknames.some((item) => typeof item !== "string")) {
    throw new Error("存档损坏: 外号无效");
  }
  if (!Array.isArray(value.aliases)) {
    throw new Error("存档损坏: 别名链无效");
  }
  const aliases = value.aliases.map((item) => {
    if (!isRecord(item) || !isWhole(item.year) || typeof item.kind !== "string" || typeof item.name !== "string") {
      throw new Error("存档损坏: 别名链无效");
    }
    return { year: item.year, kind: item.kind as NamingKind, name: item.name };
  });
  const settlementName =
    value.settlementName === null || value.settlementName === undefined
      ? null
      : requiredString(value.settlementName, "聚落名");
  return {
    settlementName,
    selfName,
    commonName,
    nicknames: value.nicknames,
    aliases,
  };
}

function readProgress(value: Record<string, unknown>): Pick<
  WorldState,
  | "politicalStage"
  | "settlementDepth"
  | "regimeSinceYear"
  | "lastDynastyYear"
  | "dynastyCooldownUntil"
  | "writingProgress"
  | "memoryContinuity"
  | "politicalStress"
> {
  const stage = value.politicalStage;
  if (stage !== "camp" && stage !== "settled" && stage !== "regime") {
    throw new Error("存档损坏: 政治阶段无效");
  }
  return {
    politicalStage: stage,
    settlementDepth: requiredWhole(value.settlementDepth, "settlementDepth"),
    regimeSinceYear: value.regimeSinceYear === null ? null : requiredWhole(value.regimeSinceYear, "regimeSinceYear"),
    lastDynastyYear: requiredWhole(value.lastDynastyYear, "lastDynastyYear"),
    dynastyCooldownUntil: requiredWhole(value.dynastyCooldownUntil, "dynastyCooldownUntil"),
    writingProgress: requiredWhole(value.writingProgress, "writingProgress"),
    memoryContinuity: requiredPercent(value.memoryContinuity, "memoryContinuity"),
    politicalStress: requiredPercent(value.politicalStress, "politicalStress"),
  };
}

function migrateProgress(
  value: Record<string, unknown>,
  naming: NamingState,
  hasWriting: boolean,
  year: number,
): ReturnType<typeof readProgress> {
  const stage: PoliticalStage = naming.selfName ? "regime" : naming.settlementName ? "settled" : "camp";
  return {
    politicalStage: stage,
    settlementDepth: Math.min(year, 40),
    regimeSinceYear: naming.selfName ? 1 : null,
    lastDynastyYear: naming.selfName ? 1 : 0,
    dynastyCooldownUntil: 0,
    writingProgress: hasWriting ? 6000 : 0,
    memoryContinuity: hasWriting ? 60 : 45,
    politicalStress: 0,
  };
}

function readStocks(value: Record<string, unknown>): ReturnType<typeof initialStocks> {
  return {
    food: requiredWhole(value.food, "存粮"),
    goods: requiredWhole(value.goods, "物资"),
    health: requiredPercent(value.health, "健康"),
    order: requiredPercent(value.order, "秩序"),
    buildings: requiredWhole(value.buildings, "建筑"),
    hasWriting: requiredBoolean(value.hasWriting, "文字"),
    extinct: requiredBoolean(value.extinct, "灭亡"),
  };
}

function parseSettlement(value: unknown): Settlement | null {
  if (value === null) {
    return null;
  }
  if (!isRecord(value)) {
    throw new Error("存档损坏: lastSettlement 无效");
  }
  if (!isWhole(value.year) || !isWhole(value.populationBefore) || !isWhole(value.populationAfter)) {
    throw new Error("存档损坏: 结算记录的年份或人口无效");
  }
  let eventIds: string[] = [];
  if (Array.isArray(value.eventIds)) {
    if (value.eventIds.some((item) => typeof item !== "string")) {
      throw new Error("存档损坏: 结算事件无效");
    }
    eventIds = value.eventIds;
  } else if (typeof value.eventId === "string") {
    eventIds = [value.eventId];
  } else if (value.eventId !== undefined || value.eventIds !== undefined) {
    throw new Error("存档损坏: 结算事件无效");
  }
  return {
    year: value.year,
    populationBefore: value.populationBefore,
    populationAfter: value.populationAfter,
    eventIds,
  };
}

function isId<T extends { id: string }>(table: readonly T[], value: unknown): value is T["id"] {
  return typeof value === "string" && table.some((item) => item.id === value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isWhole(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isUint32(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
}

function requiredWhole(value: unknown, name: string): number {
  if (!isWhole(value)) {
    throw new Error(`存档损坏: ${name}无效`);
  }
  return value;
}

function requiredPercent(value: unknown, name: string): number {
  if (!isWhole(value) || value > 100) {
    throw new Error(`存档损坏: ${name}无效`);
  }
  return value;
}

function requiredBoolean(value: unknown, name: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`存档损坏: ${name}无效`);
  }
  return value;
}

function requiredInt(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(`存档损坏: ${name}无效`);
  }
  return value;
}

function requiredString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`存档损坏: ${name}无效`);
  }
  return value;
}

function isEnoent(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
