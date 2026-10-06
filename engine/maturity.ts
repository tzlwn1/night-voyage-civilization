import type { OriginId } from "./catalog.ts";
import { pickPoolName, type NamingConsequence } from "./naming.ts";
import type { Rng } from "./rng.ts";
import type { PoliticalStage, WorldState } from "./state.ts";
import { carryingCapacity, populationPressure } from "./carrying.ts";

export function initialPoliticalFields(): Pick<
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
  return {
    politicalStage: "camp",
    settlementDepth: 0,
    regimeSinceYear: null,
    lastDynastyYear: 0,
    dynastyCooldownUntil: 0,
    writingProgress: 0,
    memoryContinuity: 62,
    politicalStress: 0,
  };
}

export function advanceSettlementDepth(state: WorldState): WorldState {
  if (state.population < 24) {
    return state;
  }
  return { ...state, settlementDepth: state.settlementDepth + 1 };
}

export function updateMemoryAndStress(state: WorldState, summary: {
  foodEnd: number;
  population: number;
  orderEnd: number;
  healthEnd: number;
}): WorldState {
  let memory = state.memoryContinuity;
  let stress = state.politicalStress;
  const fed = summary.population > 0 && summary.foodEnd >= summary.population;
  const plenty = summary.population > 0 && summary.foodEnd >= summary.population * 2;
  if (state.hasWriting) {
    memory += plenty ? 3 : fed ? 2 : 0;
  } else if (fed) {
    memory += 1;
  } else if (!fed && summary.population > 0) {
    memory -= 2;
  }
  if (state.politicalStage === "regime" && fed) {
    memory += 1;
  }
  if (!fed && summary.population > 0) {
    stress += 3;
  } else if (plenty) {
    stress = Math.max(0, stress - 2);
  } else if (fed) {
    stress = Math.max(0, stress - 1);
  }
  if (summary.orderEnd < 30 || summary.healthEnd < 30) {
    stress += 2;
  } else if (summary.orderEnd >= 50 && summary.healthEnd >= 50) {
    stress = Math.max(0, stress - 1);
  }
  const pressure = populationPressure(state);
  if (pressure > 0.92) {
    stress += 1;
  }
  if (state.year > 600) {
    stress += 1;
  }
  return {
    ...state,
    memoryContinuity: Math.min(100, Math.max(0, memory)),
    politicalStress: Math.min(100, Math.max(0, stress)),
  };
}

export function originWritingBias(origin: OriginId): number {
  switch (origin) {
    case "forgotten-colony":
      return 1.35;
    case "pilgrim-convoy":
      return 1.1;
    case "starfall-refugees":
      return 1.05;
    case "exiled-clan":
      return 1.0;
    case "shipwreck-fleet":
      return 0.92;
    default:
      return 1.0;
  }
}

export function tryWritingProgress(state: WorldState, rng: Rng, _year: number): WorldState {
  if (state.hasWriting) {
    return state;
  }
  if (state.settlementDepth < 35 && !state.naming.settlementName) {
    return { ...state, writingProgress: state.writingProgress + Math.trunc(state.population / 120) };
  }
  const depthFactor = Math.min(1, state.settlementDepth / 90);
  const popFactor = Math.min(1, state.population / 280);
  const orgFactor = (state.order + state.health) / 200;
  const gain =
    Math.trunc(state.population / 90) +
    Math.min(state.buildings, 24) * 2 +
    Math.trunc(state.goods / 14) +
    (state.politicalStage === "regime" ? 6 : 0);
  const progress = state.writingProgress + gain;
  const bias = originWritingBias(state.origin);
  const readiness = depthFactor * popFactor * orgFactor * bias;
  const odds = Math.min(18, Math.trunc((progress / 58000) * 12 * readiness));
  if (rng.int(1, 1000) <= odds) {
    return { ...state, hasWriting: true, writingProgress: progress };
  }
  return { ...state, writingProgress: progress };
}

export function trySettlementName(state: WorldState, rng: Rng, year: number): {
  state: WorldState;
  note: string | null;
} {
  if (state.naming.settlementName) {
    return { state, note: null };
  }
  if (state.settlementDepth < 8) {
    return { state, note: null };
  }
  const chance = Math.min(35, 4 + Math.trunc(state.settlementDepth / 12));
  if (rng.int(1, 100) > chance) {
    return { state, note: null };
  }
  const name = pickPoolName(rng, "settlement");
  const next: WorldState = {
    ...state,
    politicalStage: "settled",
    naming: {
      ...state.naming,
      settlementName: name,
      aliases: [...state.naming.aliases, { year, kind: "外号", name }],
    },
  };
  return { state: next, note: `第${year}年 聚落得名「${name}」` };
}

function regimeFoundChance(state: WorldState): number {
  if (state.politicalStage === "regime") {
    return 0;
  }
  if (!state.naming.settlementName || state.settlementDepth < 98) {
    return 0;
  }
  const depth = state.settlementDepth - 88;
  const pop = Math.min(state.population, carryingCapacity(state));
  const org = (state.order + state.health) / 200;
  const writingMul = state.hasWriting ? 1.22 : 0.52;
  const base = (depth / 480) * (pop / 560) * org * writingMul;
  return Math.min(9, Math.max(0, Math.trunc(base * 100)));
}

export function tryRegimeFounding(state: WorldState, rng: Rng, year: number): {
  state: WorldState;
  note: string | null;
} {
  const chance = regimeFoundChance(state);
  if (chance === 0 || rng.int(1, 100) > chance) {
    return { state, note: null };
  }
  const name = pickPoolName(rng, "founding");
  const next: WorldState = {
    ...state,
    politicalStage: "regime",
    regimeSinceYear: year,
    lastDynastyYear: year,
    dynastyCooldownUntil: year + 90 + rng.int(0, 40),
    naming: {
      ...state.naming,
      selfName: name,
      aliases: [...state.naming.aliases, { year, kind: "建国", name }],
    },
  };
  return { state: next, note: `第${year}年 建国，立号「${name}」` };
}

export function tryDynastyChange(state: WorldState, rng: Rng, year: number): {
  state: WorldState;
  note: string | null;
} {
  if (state.politicalStage !== "regime" || !state.naming.selfName) {
    return { state, note: null };
  }
  if (year < state.dynastyCooldownUntil) {
    return { state, note: null };
  }
  const sinceRegime = state.regimeSinceYear ? year - state.regimeSinceYear : year;
  if (sinceRegime < 120) {
    return { state, note: null };
  }
  let chance = Math.min(8, Math.trunc((sinceRegime - 100) / 32));
  chance += Math.trunc(state.politicalStress / 22);
  if (state.famineYears >= 5) {
    chance += 4;
  }
  if (rng.int(1, 100) > chance) {
    return { state, note: null };
  }
  const name = pickPoolName(rng, "dynasty");
  const next: WorldState = {
    ...state,
    lastDynastyYear: year,
    dynastyCooldownUntil: nextDynastyCooldown(rng, year),
    politicalStress: Math.max(0, state.politicalStress - 18),
    famineYears: Math.max(0, state.famineYears - 6),
    naming: {
      ...state.naming,
      selfName: name,
      aliases: [...state.naming.aliases, { year, kind: "改朝", name }],
    },
  };
  return { state: next, note: `第${year}年 改朝，号「${name}」` };
}

export function tryPoliticalCrisis(
  state: WorldState,
  rng: Rng,
  year: number,
): { state: WorldState; notes: string[]; avoidedExtinction: boolean } {
  const notes: string[] = [];
  let current = state;
  const famineCrisis = current.famineYears >= 5;
  const stressCrisis = current.politicalStress >= 48;
  const orderCrisis = current.order <= 18 && current.health <= 22;
  const crisis = famineCrisis || stressCrisis || orderCrisis;
  if (!crisis) {
    return { state: current, notes, avoidedExtinction: false };
  }

  if (current.politicalStage === "regime") {
    const dynastyRoll = famineCrisis ? 82 : 48;
    if (rng.int(1, 100) <= dynastyRoll) {
      const dyn = tryDynastyChange(current, rng, year);
      if (dyn.note) {
        current = dyn.state;
        notes.push(dyn.note);
        return { state: current, notes, avoidedExtinction: true };
      }
    }
    if (rng.int(1, 100) <= 52) {
      current = {
        ...current,
        order: Math.min(100, current.order + 10),
        health: Math.min(100, current.health + 6),
        politicalStress: Math.max(0, current.politicalStress - 14),
        famineYears: Math.max(0, current.famineYears - 5),
        memoryContinuity: Math.min(100, current.memoryContinuity + 5),
      };
      notes.push(`第${year}年 内乱后暂安，未亡国`);
      return { state: current, notes, avoidedExtinction: true };
    }
    return { state: current, notes, avoidedExtinction: false };
  }

  const severeOrder = current.order <= 12 && current.health <= 16;

  if (
    current.civSeq === 1 &&
    current.politicalStage === "camp" &&
    (famineCrisis || orderCrisis || severeOrder) &&
    rng.int(1, 100) <= 68
  ) {
    current = firstCivCampTurmoil(current, rng);
    notes.push(`第${year}年 营地内乱后分裂再合，未亡国`);
    return { state: current, notes, avoidedExtinction: true };
  }

  if (
    current.civSeq > 1 &&
    current.politicalStage === "camp" &&
    (famineCrisis || orderCrisis) &&
    rng.int(1, 100) <= 58
  ) {
    current = {
      ...current,
      order: Math.min(100, current.order + 7),
      health: Math.min(100, current.health + 5),
      politicalStress: Math.max(0, current.politicalStress - 10),
      famineYears: Math.max(0, current.famineYears - 2),
      memoryContinuity: Math.min(100, current.memoryContinuity + 3),
    };
    notes.push(`第${year}年 废墟聚落分裂再合，未亡国`);
    return { state: current, notes, avoidedExtinction: true };
  }

  if (current.politicalStage === "settled" && (famineCrisis || orderCrisis)) {
    const roll = current.civSeq === 1 ? 62 : 45;
    if (rng.int(1, 100) <= roll) {
      if (current.civSeq === 1) {
        current = firstCivSettledTurmoil(current, rng);
        notes.push(`第${year}年 聚落内乱后分裂再合，未亡国`);
      } else {
        current = {
          ...current,
          order: Math.min(100, current.order + 6),
          health: Math.min(100, current.health + 4),
          politicalStress: Math.max(0, current.politicalStress - 8),
          famineYears: Math.max(0, current.famineYears - 1),
          memoryContinuity: Math.min(100, current.memoryContinuity + 2),
        };
        notes.push(`第${year}年 聚落分裂再合，未亡国`);
      }
      return { state: current, notes, avoidedExtinction: true };
    }
  }

  return { state: current, notes, avoidedExtinction: false };
}

export function isRegimeStage(stage: PoliticalStage): boolean {
  return stage === "regime";
}

function firstCivCampTurmoil(state: WorldState, rng: Rng): WorldState {
  const popLoss = Math.max(0, Math.trunc(state.population * (0.004 + rng.int(0, 8) / 1000)));
  return {
    ...state,
    population: Math.max(0, state.population - popLoss),
    goods: Math.max(0, state.goods - rng.int(3, 14)),
    food: Math.max(0, state.food - rng.int(0, Math.max(1, Math.trunc(state.population / 2)))),
    order: Math.min(100, state.order + 11),
    health: Math.min(100, state.health + 7),
    politicalStress: Math.max(0, state.politicalStress - 14),
    famineYears: Math.max(0, state.famineYears - 4),
    sparseYears: Math.max(0, state.sparseYears - 2),
    memoryContinuity: Math.min(100, state.memoryContinuity + 5),
  };
}

function firstCivSettledTurmoil(state: WorldState, rng: Rng): WorldState {
  const popLoss = Math.max(0, Math.trunc(state.population * (0.006 + rng.int(0, 12) / 1000)));
  const regress = rng.int(1, 100) <= 22;
  return {
    ...state,
    politicalStage: regress ? "camp" : state.politicalStage,
    population: Math.max(0, state.population - popLoss),
    goods: Math.max(0, state.goods - rng.int(4, 16)),
    food: Math.max(0, state.food - rng.int(0, Math.max(2, Math.trunc(state.population / 2)))),
    order: Math.min(100, state.order + 9),
    health: Math.min(100, state.health + 6),
    politicalStress: Math.max(0, state.politicalStress - 12),
    famineYears: Math.max(0, state.famineYears - 3),
    sparseYears: Math.max(0, state.sparseYears - 2),
    memoryContinuity: Math.min(100, state.memoryContinuity + 4),
  };
}

function nextDynastyCooldown(rng: Rng, year: number): number {
  if (rng.int(1, 100) <= 32) {
    return year + 32 + rng.int(0, 48);
  }
  return year + 125 + rng.int(0, 230);
}

export function blockEventNaming(consequence: NamingConsequence | undefined): boolean {
  if (!consequence) {
    return false;
  }
  return consequence.kind === "建国" || consequence.kind === "改朝" || consequence.kind === "改名";
}
