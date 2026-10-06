import { carryingCapacity } from "./carrying.ts";
import type { YearSummary } from "./report.ts";
import type { ExtinctionCauseId, WorldState } from "./state.ts";

export const POPULATION_THRESHOLD = 12;
/** 人口持续偏少、需累计至此才计入稀疏灭绝链 */
export const SPARSE_YEARS_LIMIT = 10;
export const SPARSE_YEARS_MATURE = 14;
/** 粮不足持续年数，与记忆断裂叠加才触发饥荒型灭亡 */
export const FAMINE_YEARS_LIMIT = 26;
export const FALLOUT_YEARS = 5;
export const VOID_YEARS = 8;

/** 创世后若干年内，人口未崩到极低则不因稀疏/秩序单独判灭 */
export const FOUNDING_GRACE_YEARS = 160;
export const FOUNDING_GRACE_MIN_POP = 100;

export interface ExtinctionVerdict {
  cause: ExtinctionCauseId;
  finalPopulation: number;
  archiveHealth: number;
}

export function updateStressCounters(
  state: WorldState,
  summary: YearSummary,
): Pick<WorldState, "famineYears" | "sparseYears"> {
  let famineYears = state.famineYears;
  let sparseYears = state.sparseYears;
  if (state.population > 0 && summary.foodEnd < state.population) {
    famineYears += 1;
  } else if (state.population > 0 && summary.foodEnd >= state.population * 2) {
    famineYears = Math.max(0, famineYears - 3);
  } else if (state.population > 0 && summary.foodEnd >= state.population * 1.5) {
    famineYears = Math.max(0, famineYears - 2);
  } else if (state.population > 0 && summary.foodEnd >= state.population) {
    famineYears = Math.max(0, famineYears - 1);
  } else {
    famineYears = 0;
  }
  const sparseLine = Math.max(POPULATION_THRESHOLD, Math.trunc(state.foundingPopulation * 0.08));
  if (state.population > 0 && state.population < sparseLine) {
    sparseYears += 1;
  } else if (state.population >= sparseLine * 2) {
    sparseYears = Math.max(0, sparseYears - 2);
  } else if (state.population >= sparseLine) {
    sparseYears = Math.max(0, sparseYears - 1);
  } else {
    sparseYears = 0;
  }
  return { famineYears, sparseYears };
}

/** 首文明秩序双崩：持续恶化 + 人口崩溃 + 记忆断裂同时成立。 */
function firstCivDisorderCollapse(state: WorldState, cap: number, population: number): boolean {
  if (state.year < 70) {
    return false;
  }
  const sustained =
    state.famineYears >= 11 &&
    state.sparseYears >= 8 &&
    state.order <= 4 &&
    state.health <= 4;
  const popCrash = population < Math.max(28, Math.trunc(cap * 0.042));
  const memoryGone = state.memoryContinuity < 9;
  return sustained && popCrash && memoryGone;
}

function inFoundingGrace(state: WorldState, population: number): boolean {
  if (state.year > FOUNDING_GRACE_YEARS) {
    return false;
  }
  if (state.foundingPopulation < FOUNDING_GRACE_MIN_POP) {
    return false;
  }
  const floor = Math.max(24, Math.trunc(state.foundingPopulation * 0.12));
  return population >= floor;
}

export function evaluateExtinction(state: WorldState): ExtinctionVerdict | null {
  if (state.phase !== "active") {
    return null;
  }
  const finalPopulation = state.population;
  const cap = carryingCapacity(state);
  const mature = state.year >= 200 && state.politicalStage === "regime";
  const sparseLimit = mature ? SPARSE_YEARS_MATURE : SPARSE_YEARS_LIMIT;
  const grace = inFoundingGrace(state, finalPopulation);
  const famineGrace =
    (state.year < 320 && state.foundingPopulation >= 100 && finalPopulation >= Math.trunc(cap * 0.08)) ||
    (state.year < 520 && finalPopulation >= Math.trunc(cap * 0.14));
  const successorWindow =
    state.civSeq > 1 &&
    state.year <= 260 &&
    finalPopulation >= Math.max(42, Math.trunc(cap * 0.075));

  let cause: ExtinctionCauseId | null = null;

  if (finalPopulation === 0) {
    cause = "depopulation";
  } else if (
    state.memoryContinuity < 5 &&
    state.sparseYears >= 12 &&
    finalPopulation < Math.max(POPULATION_THRESHOLD, Math.trunc(state.foundingPopulation * 0.04)) &&
    !(state.civSeq === 1 && state.year < 280 && finalPopulation >= Math.trunc(cap * 0.055))
  ) {
    cause = "depopulation";
  } else if (
    !grace &&
    !(state.civSeq === 1 && state.year < 240 && finalPopulation >= Math.max(36, Math.trunc(cap * 0.06))) &&
    state.sparseYears >= sparseLimit &&
    finalPopulation < POPULATION_THRESHOLD &&
    state.memoryContinuity < 22
  ) {
    cause = "depopulation";
  } else if (
    !grace &&
    !famineGrace &&
    !successorWindow &&
    state.famineYears >= FAMINE_YEARS_LIMIT &&
    state.memoryContinuity < 11 &&
    finalPopulation < Math.max(35, Math.trunc(cap * 0.04))
  ) {
    cause = "famine-collapse";
  } else if (
    !grace &&
    !successorWindow &&
    state.civSeq === 1 &&
    firstCivDisorderCollapse(state, cap, finalPopulation)
  ) {
    cause = "disorder-collapse";
  } else if (
    !grace &&
    !successorWindow &&
    state.civSeq !== 1 &&
    state.order <= 3 &&
    state.health <= 3 &&
    state.famineYears >= 8 &&
    state.memoryContinuity < 18 &&
    finalPopulation < Math.max(55, Math.trunc(cap * 0.08))
  ) {
    cause = "disorder-collapse";
  } else if (
    state.year > 900 &&
    finalPopulation < 28 &&
    state.memoryContinuity < 12 &&
    state.sparseYears >= 8 &&
    state.politicalStress > 70
  ) {
    cause = "depopulation";
  }

  if (!cause) {
    return null;
  }
  return {
    cause,
    finalPopulation,
    archiveHealth: computeArchiveHealth(state),
  };
}

export function computeArchiveHealth(state: WorldState): number {
  let score = 10;
  if (state.hasWriting) {
    score += 35;
  }
  score += Math.min(40, Math.trunc(state.year * 1.2));
  score += Math.min(12, state.dreamInstitutions.length * 2);
  if (state.naming.selfName) {
    score += 10;
  }
  score += Math.min(15, Math.trunc(state.memoryContinuity / 4));
  return Math.min(100, score);
}

export function causeLabel(cause: ExtinctionCauseId): string {
  switch (cause) {
    case "depopulation":
      return "人口衰竭";
    case "famine-collapse":
      return "长期饥荒崩溃";
    case "disorder-collapse":
      return "秩序与健康双崩";
    default:
      return cause;
  }
}

export function renderAnnals(state: WorldState, verdict: ExtinctionVerdict): string {
  const startYear = 1;
  const endYear = state.year;
  const selfName = state.naming.selfName ?? state.naming.settlementName ?? "未立号";
  return [
    "---",
    `tags: [${state.civId}, extinct, ${verdict.cause}]`,
    `civ: ${state.civId}`,
    `startYear: ${startYear}`,
    `endYear: ${endYear}`,
    `worldStartYear: ${state.civStartWorldYear}`,
    `worldEndYear: ${state.worldYear}`,
    `cause: ${verdict.cause}`,
    `finalPopulation: ${verdict.finalPopulation}`,
    `archiveHealth: ${verdict.archiveHealth}`,
    `selfName: ${selfName}`,
    "---",
    "",
    `# ${state.civId} 文明总录`,
    "",
    `通称: ${state.naming.commonName}`,
    `聚落: ${state.naming.settlementName ?? "无"}`,
    `自称: ${state.naming.selfName ?? "无"}`,
    `存续: 第 ${startYear} 年至第 ${endYear} 年（世界历 ${state.civStartWorldYear}—${state.worldYear}）`,
    `灭亡原因: ${causeLabel(verdict.cause)}`,
    `末代人口: ${verdict.finalPopulation}`,
    `档案健康度: ${verdict.archiveHealth}`,
    "",
    "## 制度遗存",
    ...state.dreamInstitutions.map(
      (item) => `- ${item.kind === "law" ? "法律" : item.kind === "festival" ? "节日" : "禁忌"}「${item.title}」`,
    ),
    state.dreamInstitutions.length === 0 ? "- 无" : "",
    "",
  ].join("\n");
}
