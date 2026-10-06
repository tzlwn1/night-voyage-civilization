import { climateFertility, geographyFertility } from "./catalog.ts";
import type { DreamInstitution, WorldState } from "./state.ts";
import { aggregateDreamEffectsBounded } from "./dream.ts";

/** 口袋文明人口承载力（软上限，可短暂突破）。 */
export function carryingCapacity(state: WorldState): number {
  const geo = geographyFertility(state.geography);
  const cli = climateFertility(state.climate);
  const base = 180 + geo * 55 + cli * 45;
  const climateGeoMul =
    state.geography === "rift-valley" || state.climate === "polar-fringe"
      ? 0.72
      : state.geography === "coastal-plain" && state.climate === "tropical"
        ? 1.18
        : 1;
  const buildingBonus = Math.min(state.buildings, 48) * 6;
  const instBonus = Math.min(state.dreamInstitutions.length, 12) * 4;
  return Math.max(120, Math.trunc((base + buildingBonus + instBonus) * climateGeoMul));
}

export function populationPressure(state: WorldState): number {
  const cap = carryingCapacity(state);
  if (cap <= 0) {
    return 0;
  }
  return state.population / cap;
}

export function birthDeathModifiers(state: WorldState): { birthMulPermille: number; deathMulPermille: number } {
  const pressure = populationPressure(state);
  let birth = 1000;
  let death = 1000;
  if (pressure > 0.55) {
    const excess = pressure - 0.55;
    birth = Math.max(120, Math.trunc(1000 - excess * 1600));
    death = Math.trunc(1000 + excess * 2200);
  }
  if (pressure > 1.05) {
    death = Math.trunc(death + (pressure - 1.05) * 5000);
    birth = Math.max(80, Math.trunc(birth * 0.6));
  }
  const effects = aggregateDreamEffectsBounded(state);
  birth = Math.max(50, birth + effects.birthPer10k * 8);
  death = Math.max(200, death + effects.deathPer10k * 8);
  return { birthMulPermille: birth, deathMulPermille: death };
}

/** 每月建筑维护：物资不足则随机损毁。 */
export function applyBuildingMaintenance(state: WorldState, rng: import("./rng.ts").Rng): WorldState {
  if (state.buildings <= 0) {
    return state;
  }
  const upkeep = Math.max(1, Math.trunc(state.buildings / 6));
  if (state.goods >= upkeep) {
    return { ...state, goods: state.goods - upkeep };
  }
  const loss = state.goods > 0 ? 1 : rng.int(1, Math.min(3, state.buildings));
  return {
    ...state,
    goods: 0,
    buildings: Math.max(0, state.buildings - loss),
  };
}

export function buildEventWeightScale(state: WorldState): number {
  const b = state.buildings;
  return 1000 / (1000 + b * 22);
}
