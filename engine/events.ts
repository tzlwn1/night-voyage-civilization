import { readFileSync } from "node:fs";

import { buildEventWeightScale } from "./carrying.ts";
import { adjustEventWeightByDream } from "./dream.ts";
import type { NamingConsequence } from "./naming.ts";
import type { Rng } from "./rng.ts";
import type { WorldState } from "./state.ts";

export const EVENT_CATEGORIES = ["丰收", "缺粮", "瘟疫", "争吵", "建成", "迁入", "庆典", "事故"] as const;

export type EventCategory = (typeof EVENT_CATEGORIES)[number];

const FLAG_KEYS = [
  "foodShortage",
  "foodPlenty",
  "hasWriting",
  "noWriting",
  "lowHealth",
  "lowOrder",
  "crisis",
] as const;

const NUMERIC_KEYS = ["goods", "buildings", "population", "health", "order", "food"] as const;

type FlagKey = (typeof FLAG_KEYS)[number];
type NumericKey = (typeof NUMERIC_KEYS)[number];

export interface EventConsequences {
  population?: number;
  populationPermille?: number;
  food?: number;
  foodPermilleOfPopulation?: number;
  goods?: number;
  health?: number;
  order?: number;
  buildings?: number;
  setWriting?: boolean;
  chain?: boolean;
  naming?: NamingConsequence;
}

export interface EventTemplate {
  id: string;
  title: string;
  category: EventCategory;
  level: string;
  tags: string[];
  preconditions: Precondition[];
  baseWeight: number;
  weightModifiers: WeightModifier[];
  consequences: EventConsequences;
}

type Precondition =
  | { key: FlagKey; equals: boolean }
  | { key: NumericKey; gte: number };

interface WeightModifier {
  when: FlagKey;
  multiply?: number;
  add?: number;
  set?: number;
}

let cached: EventTemplate[] | null = null;

export function loadEventTemplates(): EventTemplate[] {
  if (cached) {
    return cached;
  }
  const url = new URL("../data/event-templates.json", import.meta.url);
  const parsed: unknown = JSON.parse(readFileSync(url, "utf8"));
  if (!Array.isArray(parsed)) {
    throw new Error("事件池必须是数组");
  }
  const events = parsed.map((item, index) => parseTemplate(item, index));
  const ids = new Set<string>();
  for (const event of events) {
    if (ids.has(event.id)) {
      throw new Error(`事件 id 重复: ${event.id}`);
    }
    ids.add(event.id);
  }
  if (events.length !== 40) {
    throw new Error(`事件池应有 40 条，实际 ${events.length}`);
  }
  for (const category of EVENT_CATEGORIES) {
    const count = events.filter((event) => event.category === category).length;
    if (count !== 5) {
      throw new Error(`类别 ${category} 应有 5 条，实际 ${count}`);
    }
  }
  cached = events;
  return events;
}

export function eventWeight(event: EventTemplate, state: WorldState): number {
  if (!preconditionsMet(event, state)) {
    return 0;
  }
  let weight = event.baseWeight;
  for (const modifier of event.weightModifiers) {
    if (!flagValue(modifier.when, state)) {
      continue;
    }
    if (modifier.set !== undefined) {
      weight = modifier.set;
    }
    if (modifier.multiply !== undefined) {
      weight = Math.trunc(weight * modifier.multiply);
    }
    if (modifier.add !== undefined) {
      weight += modifier.add;
    }
  }
  if (event.tags.includes("scribe") && !state.hasWriting) {
    weight = 0;
  }
  weight = adjustEventWeightByDream(state, event.category, weight);
  if (event.category === "建成") {
    weight = Math.max(1, Math.trunc(weight * buildEventWeightScale(state)));
  }
  if (!Number.isInteger(weight) || weight < 0) {
    throw new Error(`事件 ${event.id} 的权重无效: ${weight}`);
  }
  return weight;
}

export function pickWeightedEvent(
  state: WorldState,
  rng: Rng,
  excluded: ReadonlySet<string>,
): EventTemplate | null {
  const pool = loadEventTemplates()
    .map((event) => ({ event, weight: eventWeight(event, state) }))
    .filter((item) => item.weight > 0 && !excluded.has(item.event.id));
  const total = pool.reduce((sum, item) => sum + item.weight, 0);
  if (total <= 0) {
    return null;
  }
  let roll = rng.int(0, total - 1);
  for (const item of pool) {
    if (roll < item.weight) {
      return item.event;
    }
    roll -= item.weight;
  }
  return null;
}

export function applyConsequences(state: WorldState, event: EventTemplate): WorldState {
  const effect = event.consequences;
  let population = state.population;
  let food = state.food;
  let goods = state.goods;
  let health = state.health;
  let order = state.order;
  let buildings = state.buildings;
  let hasWriting = state.hasWriting;
  if (effect.population !== undefined) {
    population += effect.population;
  }
  if (effect.populationPermille !== undefined) {
    population += Math.trunc((population * effect.populationPermille) / 1000);
  }
  if (effect.food !== undefined) {
    food += effect.food;
  }
  if (effect.foodPermilleOfPopulation !== undefined) {
    food += Math.trunc((state.population * effect.foodPermilleOfPopulation) / 1000);
  }
  if (effect.goods !== undefined) {
    goods += effect.goods;
  }
  if (effect.health !== undefined) {
    health += effect.health;
  }
  if (effect.order !== undefined) {
    order += effect.order;
  }
  if (effect.buildings !== undefined) {
    buildings += effect.buildings;
  }
  if (effect.setWriting === true) {
    hasWriting = state.hasWriting;
  }
  return clampState({
    ...state,
    population,
    food,
    goods,
    health,
    order,
    buildings,
    hasWriting,
  });
}

export function isFoodShortage(state: WorldState): boolean {
  return state.population > 0 && state.food < state.population;
}

export function isCrisis(state: WorldState): boolean {
  return flagValue("crisis", state);
}

export function monthlyEventQuota(state: WorldState, rng: Rng): number {
  const pop = state.population;
  if (pop === 0) {
    return 0;
  }
  const regimeMature = state.politicalStage === "regime" && state.hasWriting && pop >= 200;
  const early = state.politicalStage === "camp" || pop < 90 || state.settlementDepth < 10;
  if (early) {
    let q = rng.int(1, 100) <= 28 ? 1 : 0;
    if (isCrisis(state) && rng.int(1, 100) <= 22) {
      q += 1;
    }
    return q;
  }
  if (!regimeMature) {
    let q = rng.int(1, 100) <= 50 ? 1 : 0;
    if (rng.int(1, 100) <= 18) {
      q += 1;
    }
    if (isCrisis(state) && rng.int(1, 100) <= 30) {
      q += 1;
    }
    return Math.min(3, q);
  }
  let q = 1 + (rng.int(1, 100) <= 50 ? 1 : 0) + (rng.int(1, 100) <= 28 ? 1 : 0);
  if (isCrisis(state)) {
    q += rng.int(0, 2);
  }
  return Math.min(5, q);
}

export function clampState(state: WorldState): WorldState {
  const population = Math.max(0, state.population);
  const foodCap = Math.max(population, 1) * 48;
  return {
    ...state,
    population,
    food: Math.min(foodCap, Math.max(0, state.food)),
    goods: Math.max(0, state.goods),
    buildings: Math.max(0, state.buildings),
    health: Math.min(100, Math.max(0, state.health)),
    order: Math.min(100, Math.max(0, state.order)),
  };
}

function preconditionsMet(event: EventTemplate, state: WorldState): boolean {
  return event.preconditions.every((condition) => {
    if ("equals" in condition) {
      return flagValue(condition.key, state) === condition.equals;
    }
    return numericValue(condition.key, state) >= condition.gte;
  });
}

function flagValue(key: FlagKey, state: WorldState): boolean {
  switch (key) {
    case "foodShortage":
      return isFoodShortage(state);
    case "foodPlenty":
      return state.population > 0 && state.food > state.population * 2;
    case "hasWriting":
      return state.hasWriting;
    case "noWriting":
      return !state.hasWriting;
    case "lowHealth":
      return state.health < 40;
    case "lowOrder":
      return state.order < 40;
    case "crisis":
      return isFoodShortage(state) || state.health < 40 || state.order < 40;
    default:
      return false;
  }
}

function numericValue(key: NumericKey, state: WorldState): number {
  return state[key];
}

function parseTemplate(value: unknown, index: number): EventTemplate {
  if (!isRecord(value)) {
    throw new Error(`事件 ${index} 不是对象`);
  }
  const id = requiredString(value.id, "id");
  const title = requiredString(value.title, `${id}.title`);
  const category = requiredString(value.category, `${id}.category`);
  if (!EVENT_CATEGORIES.includes(category as EventCategory)) {
    throw new Error(`事件 ${id} 的类别无效: ${category}`);
  }
  const level = requiredString(value.level, `${id}.level`);
  const tags = stringArray(value.tags, `${id}.tags`);
  const preconditions = parsePreconditions(value.preconditions, id);
  const baseWeight = requiredInt(value.baseWeight, `${id}.baseWeight`);
  if (baseWeight <= 0) {
    throw new Error(`事件 ${id} 的基础权重必须为正`);
  }
  const weightModifiers = parseModifiers(value.weightModifiers, id);
  const consequences = parseConsequences(value.consequences, id);
  return {
    id,
    title,
    category: category as EventCategory,
    level,
    tags,
    preconditions,
    baseWeight,
    weightModifiers,
    consequences,
  };
}

function parsePreconditions(value: unknown, id: string): Precondition[] {
  if (!Array.isArray(value)) {
    throw new Error(`事件 ${id} 缺少前置条件`);
  }
  return value.map((item) => {
    if (!isRecord(item) || typeof item.key !== "string") {
      throw new Error(`事件 ${id} 的前置条件无效`);
    }
    if (isFlagKey(item.key)) {
      if (typeof item.equals !== "boolean") {
        throw new Error(`事件 ${id} 的前置条件 ${item.key} 需要 equals`);
      }
      return { key: item.key, equals: item.equals };
    }
    if (isNumericKey(item.key)) {
      return { key: item.key, gte: requiredInt(item.gte, `${id}.${item.key}`) };
    }
    throw new Error(`事件 ${id} 的前置条件键无效: ${item.key}`);
  });
}

function parseModifiers(value: unknown, id: string): WeightModifier[] {
  if (!Array.isArray(value)) {
    throw new Error(`事件 ${id} 缺少权重修正`);
  }
  return value.map((item) => {
    if (!isRecord(item) || typeof item.when !== "string" || !isFlagKey(item.when)) {
      throw new Error(`事件 ${id} 的权重修正无效`);
    }
    const present = ["multiply", "add", "set"].filter((key) => item[key] !== undefined);
    if (present.length !== 1) {
      throw new Error(`事件 ${id} 的权重修正必须只有一种运算`);
    }
    const modifier: WeightModifier = { when: item.when };
    if (item.multiply !== undefined) {
      modifier.multiply = requiredInt(item.multiply, `${id}.multiply`);
    }
    if (item.add !== undefined) {
      modifier.add = requiredInt(item.add, `${id}.add`);
    }
    if (item.set !== undefined) {
      modifier.set = requiredInt(item.set, `${id}.set`);
    }
    return modifier;
  });
}

function parseConsequences(value: unknown, id: string): EventConsequences {
  if (!isRecord(value)) {
    throw new Error(`事件 ${id} 缺少后果`);
  }
  const consequences: EventConsequences = {};
  const numericKeys = [
    "population",
    "populationPermille",
    "food",
    "foodPermilleOfPopulation",
    "goods",
    "health",
    "order",
    "buildings",
  ] as const;
  for (const key of numericKeys) {
    if (value[key] !== undefined) {
      consequences[key] = requiredInt(value[key], `${id}.${key}`);
    }
  }
  if (value.setWriting !== undefined) {
    if (value.setWriting !== true) {
      throw new Error(`事件 ${id} 的 setWriting 只能为 true`);
    }
    consequences.setWriting = true;
  }
  if (value.chain !== undefined) {
    if (typeof value.chain !== "boolean") {
      throw new Error(`事件 ${id} 的 chain 必须是布尔值`);
    }
    consequences.chain = value.chain;
  }
  if (value.naming !== undefined) {
    if (!isRecord(value.naming) || typeof value.naming.kind !== "string" || typeof value.naming.pool !== "string") {
      throw new Error(`事件 ${id} 的 naming 无效`);
    }
    consequences.naming = {
      kind: value.naming.kind as NamingConsequence["kind"],
      pool: value.naming.pool,
    };
  }
  return consequences;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${field} 必须是非空字符串`);
  }
  return value;
}

function requiredInt(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(`${field} 必须是整数`);
  }
  return value;
}

function stringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`${field} 必须是字符串数组`);
  }
  return value;
}

function isFlagKey(value: string): value is FlagKey {
  return (FLAG_KEYS as readonly string[]).includes(value);
}

function isNumericKey(value: string): value is NumericKey {
  return (NUMERIC_KEYS as readonly string[]).includes(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
