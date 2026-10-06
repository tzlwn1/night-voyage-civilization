import { CLIMATES, GEOGRAPHIES, ORIGINS } from "./catalog.ts";
import { writeGenesisChronicle, writeWorldIndex, writeYearDraft } from "./chronicle.ts";
import { writeReadme } from "./readme.ts";
import { initialPoliticalFields } from "./maturity.ts";
import { initialNaming } from "./naming.ts";
import { createRng, rngStateFromSeed } from "./rng.ts";
import { FIRST_CIV_SEQ, formatCivId } from "./paths.ts";
import {
  readState,
  STATE_VERSION,
  writeState,
  initialMeta,
  initialStocks,
  type WorldState,
} from "./state.ts";

export function createGenesisState(seed: string): WorldState {
  const rng = createRng(rngStateFromSeed(seed));
  const geography = rng.pick(GEOGRAPHIES).id;
  const climate = rng.pick(CLIMATES).id;
  const origin = rng.pick(ORIGINS).id;
  const population = rng.int(36, 420);
  return {
    version: STATE_VERSION,
    civId: formatCivId(FIRST_CIV_SEQ),
    civSeq: FIRST_CIV_SEQ,
    seed,
    year: 0,
    worldYear: 0,
    civStartWorldYear: 1,
    ...initialMeta(),
    geography,
    climate,
    origin,
    population,
    foundingPopulation: population,
    ...initialStocks(population),
    naming: initialNaming(geography, origin),
    dreamInstitutions: [],
    ...initialPoliticalFields(),
    famineYears: 0,
    sparseYears: 0,
    rngState: rng.getState(),
    lastSettlement: null,
  };
}

/**
 * 无存档时创世。抽取顺序固定：地理、气候、来历、初始人口。
 * 写 world/state.json，并留下 chronicle/civ-001 第一年草稿。
 */
export async function genesis(root: string, seed: string): Promise<WorldState> {
  const existing = await readState(root);
  if (existing && existing.phase === "active") {
    throw new Error("已有存档，不能再次创世");
  }
  if (existing && existing.phase !== "active") {
    throw new Error("文明处于无史期或余波期，请继续模拟以完成继承");
  }

  const state = createGenesisState(seed);

  await writeState(root, state);
  await writeYearDraft(root, state);
  await writeWorldIndex(root, state);
  return state;
}

/**
 * 正式创世：第 0 年停步，写 0000.md 创世记，不生成第 1 年草稿。
 */
export async function genesisYearZero(root: string, seed: string): Promise<WorldState> {
  const existing = await readState(root);
  if (existing) {
    throw new Error("已有存档，请先清除 world/state.json 与 chronicle 后再创世");
  }

  const state = createGenesisState(seed);

  await writeState(root, state);
  await writeGenesisChronicle(root, state);
  await writeReadme(root);
  return state;
}
