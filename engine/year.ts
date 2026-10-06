import { climateFertility, geographyFertility } from "./catalog.ts";
import { renderSettledYear } from "./chronicle.ts";
import {
  applyConsequences,
  clampState,
  isCrisis,
  monthlyEventQuota,
  pickWeightedEvent,
  type EventTemplate,
} from "./events.ts";
import {
  aggregateDreamEffects,
  decayInstitutionsYearly,
  enforceDreamInstitutionCap,
  manifestationChronicleLine,
  settleYearDream,
} from "./dream.ts";
import {
  applyBuildingMaintenance,
  birthDeathModifiers,
  carryingCapacity,
} from "./carrying.ts";
import { evaluateExtinction, updateStressCounters } from "./extinction.ts";
import { beginFallout } from "./succession.ts";
import { applyNaming } from "./naming.ts";
import {
  advanceSettlementDepth,
  blockEventNaming,
  tryDynastyChange,
  tryPoliticalCrisis,
  tryRegimeFounding,
  trySettlementName,
  tryWritingProgress,
  updateMemoryAndStress,
} from "./maturity.ts";
import { createRng, type Rng } from "./rng.ts";
import type { RecordedEvent, YearReport, YearSummary } from "./report.ts";
import type { WorldState } from "./state.ts";

export const MONTH_STEPS = [
  "气候资源",
  "人口",
  "生产消耗",
  "建筑维护",
  "事件抽取",
  "梦结算",
  "命名检查",
  "灭亡检查",
] as const;

export const CHRONICLE_STEP = "写编年史";

interface YearLedger {
  births: number;
  deaths: number;
  foodProduced: number;
  foodConsumed: number;
  goodsCrafted: number;
}

export function settleYear(state: WorldState): { state: WorldState; report: YearReport } {
  if (state.phase !== "active") {
    throw new Error("只有活跃文明才能年度结算");
  }
  const rng = createRng(state.rngState);
  const populationBefore = state.population;
  const events: RecordedEvent[] = [];
  const namingNotes: string[] = [];
  const steps: string[] = [];
  const ledger: YearLedger = {
    births: 0,
    deaths: 0,
    foodProduced: 0,
    foodConsumed: 0,
    goodsCrafted: 0,
  };
  const summaryStart = snapshotEconomy(state);
  let current = state;
  const calendarYear = state.year + 1;

  for (let month = 1; month <= 12; month += 1) {
    const climate = climateResources(current, rng, ledger);
    current = climate.state;
    steps.push(MONTH_STEPS[0]);
    const population = settlePopulation(current, rng, ledger);
    current = population.state;
    steps.push(MONTH_STEPS[1]);
    const production = produceAndConsume(current, ledger);
    current = production.state;
    steps.push(MONTH_STEPS[2]);
    current = applyBuildingMaintenance(current, rng);
    steps.push(MONTH_STEPS[3]);
    current = drawEvents(current, rng, month, calendarYear, events, namingNotes);
    steps.push(MONTH_STEPS[4]);
    current = dreamPlaceholder(current);
    steps.push(MONTH_STEPS[5]);
    current = namingCheck(current);
    steps.push(MONTH_STEPS[6]);
    current = extinctionPlaceholder(current);
    steps.push(MONTH_STEPS[7]);
    assertSane(current, `第 ${month} 月`);
  }

  const year = calendarYear;
  const summaryEnd = snapshotEconomy(current);
  const summary: YearSummary = {
    births: ledger.births,
    deaths: ledger.deaths,
    foodStart: summaryStart.food,
    foodEnd: summaryEnd.food,
    foodProduced: ledger.foodProduced,
    foodConsumed: ledger.foodConsumed,
    goodsStart: summaryStart.goods,
    goodsEnd: summaryEnd.goods,
    goodsCrafted: ledger.goodsCrafted,
    healthStart: summaryStart.health,
    healthEnd: summaryEnd.health,
    orderStart: summaryStart.order,
    orderEnd: summaryEnd.order,
    buildingsStart: summaryStart.buildings,
    buildingsEnd: summaryEnd.buildings,
  };
  const dreamResult = settleYearDream(current, rng, year, events, summary, populationBefore);
  current = dreamResult.state;

  current = advanceSettlementDepth(current);
  current = tryWritingProgress(current, rng, year);
  const settlement = trySettlementName(current, rng, year);
  current = settlement.state;
  if (settlement.note) {
    namingNotes.push(settlement.note);
  }
  const founding = tryRegimeFounding(current, rng, year);
  current = founding.state;
  if (founding.note) {
    namingNotes.push(founding.note);
  }
  const dynasty = tryDynastyChange(current, rng, year);
  current = dynasty.state;
  if (dynasty.note) {
    namingNotes.push(dynasty.note);
  }
  current = decayInstitutionsYearly(current, rng);
  current = updateMemoryAndStress(current, {
    foodEnd: summary.foodEnd,
    population: current.population,
    orderEnd: summary.orderEnd,
    healthEnd: summary.healthEnd,
  });
  const crisis = tryPoliticalCrisis(current, rng, year);
  current = crisis.state;
  namingNotes.push(...crisis.notes);
  current = softenPopulationOvershoot(current, rng);
  current = enforceDreamInstitutionCap(current);

  let next: WorldState = {
    ...current,
    year,
    worldYear: state.worldYear + 1,
    ...updateStressCounters(current, summary),
    rngState: rng.getState(),
    lastSettlement: {
      year,
      populationBefore,
      populationAfter: current.population,
      eventIds: events.map((event) => event.id),
    },
  };
  const extinctionVerdict = evaluateExtinction(next);
  if (extinctionVerdict) {
    next = beginFallout(next, extinctionVerdict);
  }
  assertSane(next, `第 ${year} 年`);
  const reportBody = {
    civId: state.civId,
    year,
    populationBefore,
    populationAfter: next.population,
    events,
    namingNotes,
    dream: {
      tag: dreamResult.dream.tag,
      text: dreamResult.dream.text,
      brought: manifestationChronicleLine(dreamResult.dream),
    },
    extinction: extinctionVerdict,
    summary,
    steps: [...steps, CHRONICLE_STEP],
  };
  const report: YearReport = {
    ...reportBody,
    chronicle: renderSettledYear(next, reportBody),
  };
  return { state: next, report };
}

function snapshotEconomy(state: WorldState): Pick<WorldState, "food" | "goods" | "health" | "order" | "buildings"> {
  return {
    food: state.food,
    goods: state.goods,
    health: state.health,
    order: state.order,
    buildings: state.buildings,
  };
}

function climateResources(state: WorldState, rng: Rng, ledger: YearLedger): { state: WorldState } {
  const effects = aggregateDreamEffects(state);
  const fertility = 55 + climateFertility(state.climate) * 6 + geographyFertility(state.geography) * 4;
  const roll = rng.int(0, 30);
  const produced = Math.trunc((state.population * (fertility + roll) * effects.foodProductionPermille) / 100000);
  ledger.foodProduced += produced;
  return { state: clampState({ ...state, food: state.food + produced }) };
}

function settlePopulation(state: WorldState, rng: Rng, ledger: YearLedger): { state: WorldState } {
  const mods = birthDeathModifiers(state);
  let birthPer10k = Math.trunc((35 * mods.birthMulPermille) / 1000);
  let deathPer10k = Math.trunc((28 * mods.deathMulPermille) / 1000);
  if (state.population > 0 && state.food < state.population) {
    birthPer10k = Math.min(birthPer10k, 10);
    deathPer10k = Math.max(deathPer10k, 85);
  } else if (state.population > 0 && state.food > state.population * 2) {
    birthPer10k = Math.min(72, birthPer10k + 25);
    deathPer10k = Math.max(18, deathPer10k - 8);
  }
  if (state.health < 40) {
    deathPer10k += 40;
  }
  let births = Math.trunc((state.population * birthPer10k) / 10000);
  let deaths = Math.trunc((state.population * deathPer10k) / 10000);
  if (state.population > 0 && births === 0 && state.food >= state.population && rng.int(0, 9999) < birthPer10k) {
    births = 1;
  }
  if (state.population > 0 && deaths === 0 && rng.int(0, 9999) < deathPer10k) {
    deaths = 1;
  }
  ledger.births += births;
  ledger.deaths += deaths;
  return { state: clampState({ ...state, population: state.population + births - deaths }) };
}

function produceAndConsume(state: WorldState, ledger: YearLedger): { state: WorldState } {
  const effects = aggregateDreamEffects(state);
  const need = state.population;
  const eaten = Math.min(state.food, need);
  ledger.foodConsumed += eaten;
  let health = state.health;
  let order = state.order;
  if (need === 0 || eaten === need) {
    health += 1;
    order += 1;
  } else {
    health -= 2;
    order -= 2;
  }
  const crafted = state.population === 0 ? 0 : Math.max(1, Math.trunc(state.population / 50));
  ledger.goodsCrafted += crafted;
  health += effects.healthPerMonth;
  order += effects.orderPerMonth;
  return {
    state: clampState({
      ...state,
      food: state.food - eaten,
      goods: state.goods + crafted + effects.goodsPerMonth,
      health,
      order,
    }),
  };
}

function drawEvents(
  state: WorldState,
  rng: Rng,
  month: number,
  year: number,
  events: RecordedEvent[],
  namingNotes: string[],
): WorldState {
  if (state.extinct || state.population === 0) {
    return state;
  }
  let quota = monthlyEventQuota(state, rng);
  let chainBonus = 0;
  const seen = new Set<string>();
  let current = state;
  while (quota > 0) {
    const choice = pickWeightedEvent(current, rng, seen);
    if (!choice) {
      break;
    }
    quota -= 1;
    seen.add(choice.id);
    current = applyConsequences(current, choice);
    current = applyEventNaming(current, choice, year, rng, namingNotes);
    events.push({
      month,
      id: choice.id,
      title: choice.title,
      category: choice.category,
      level: choice.level,
    });
    if (choice.consequences.chain === true && isCrisis(current) && chainBonus < 2) {
      quota += 1;
      chainBonus += 1;
    }
  }
  return current;
}

function applyEventNaming(
  state: WorldState,
  event: EventTemplate,
  year: number,
  rng: Rng,
  namingNotes: string[],
): WorldState {
  const base = event.consequences.naming;
  if (blockEventNaming(base)) {
    return state;
  }
  if (!base) {
    return state;
  }
  const beforeSelf = state.naming.selfName;
  const beforeNicknames = state.naming.nicknames.length;
  const next = applyNaming(state, base, year, rng);
  if (next.naming.selfName !== beforeSelf && next.naming.selfName) {
    namingNotes.push(`第${year}年 ${base.kind}，自立号「${next.naming.selfName}」`);
  }
  if (next.naming.nicknames.length > beforeNicknames) {
    const nickname = next.naming.nicknames[next.naming.nicknames.length - 1];
    if (nickname) {
      namingNotes.push(`第${year}年 ${base.kind}，得外号「${nickname}」`);
    }
  }
  return next;
}

function softenPopulationOvershoot(state: WorldState, rng: Rng): WorldState {
  const cap = carryingCapacity(state);
  if (state.population <= cap * 1.12) {
    return state;
  }
  const excess = state.population - cap;
  const drop = Math.max(1, Math.trunc(excess * 0.35) + rng.int(0, Math.max(1, Math.trunc(excess * 0.15))));
  return clampState({ ...state, population: Math.max(0, state.population - drop) });
}

function dreamPlaceholder(state: WorldState): WorldState {
  return state;
}

function namingCheck(state: WorldState): WorldState {
  if (state.civId.length === 0 || state.naming.commonName.length === 0) {
    throw new Error("命名缺失");
  }
  return state;
}

function extinctionPlaceholder(state: WorldState): WorldState {
  return state;
}

function assertSane(state: WorldState, label: string): void {
  const fields = ["population", "food", "goods", "health", "order", "buildings"] as const;
  for (const field of fields) {
    const value = state[field];
    if (!Number.isInteger(value) || value < 0 || Number.isNaN(value)) {
      throw new Error(`${label} 的 ${field} 无效: ${value}`);
    }
  }
}
