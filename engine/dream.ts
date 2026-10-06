import { readFileSync } from "node:fs";

import type { EventCategory } from "./events.ts";
import type { Rng } from "./rng.ts";
import type { RecordedEvent, YearSummary } from "./report.ts";
import type {
  DreamEffects,
  DreamInstitution,
  DreamInstitutionKind,
  DreamTag,
  WorldState,
} from "./state.ts";

export interface YearDream {
  tag: DreamTag;
  sourceEventTitle: string;
  text: string;
  manifestation: DreamInstitution | null;
}

interface TagFragments {
  dayTransform: string[];
  symbol: string[];
  reaction: string[];
  wake: string[];
  manifests: Record<DreamInstitutionKind, ManifestTemplate>;
  kindWeights: Record<DreamInstitutionKind, number>;
}

interface ManifestTemplate {
  title: string;
  foodProductionPermille?: number;
  birthPer10k?: number;
  deathPer10k?: number;
  orderPerMonth?: number;
  healthPerMonth?: number;
  goodsPerMonth?: number;
  buildEventWeightAdd?: number;
  shortageWeightPermille?: number;
  harvestWeightPermille?: number;
  quarrelWeightPermille?: number;
  accidentWeightPermille?: number;
  immigrationWeightPermille?: number;
}

interface DreamData {
  manifestChance: number;
  openings: string[];
  tags: Record<DreamTag, TagFragments>;
  categoryToTag: Partial<Record<EventCategory, DreamTag>>;
}

const DREAM_TAGS: DreamTag[] = ["缺粮", "争吵", "低落", "建成", "人口增长"];
const LEVEL_SCORE: Record<string, number> = { 灾变: 4, 严重: 3, 寻常: 2, 轻微: 1 };

let cached: DreamData | null = null;

export function emptyDreamEffects(): DreamEffects {
  return {
    foodProductionPermille: 1000,
    birthPer10k: 0,
    deathPer10k: 0,
    orderPerMonth: 0,
    healthPerMonth: 0,
    goodsPerMonth: 0,
    buildEventWeightAdd: 0,
    shortageWeightPermille: 1000,
    harvestWeightPermille: 1000,
    quarrelWeightPermille: 1000,
    accidentWeightPermille: 1000,
    immigrationWeightPermille: 1000,
  };
}

function clampPermille(value: number, low = 700, high = 1300): number {
  return Math.min(high, Math.max(low, value));
}

export function aggregateDreamEffectsBounded(state: WorldState): DreamEffects {
  const total = emptyDreamEffects();
  for (const institution of state.dreamInstitutions) {
    mergeEffectsBounded(total, institution.effects);
  }
  return total;
}

export function aggregateDreamEffects(state: WorldState): DreamEffects {
  return aggregateDreamEffectsBounded(state);
}

export function institutionCap(state: WorldState): number {
  const archive = state.hasWriting ? 2 : 0;
  const stage = state.politicalStage === "regime" ? 2 : state.politicalStage === "settled" ? 1 : 0;
  return 3 + stage + archive + Math.min(4, Math.trunc(state.memoryContinuity / 25));
}

/** 年末上限可能因文字/阶段变化而升高，强制截断到当前上限。 */
export function enforceDreamInstitutionCap(state: WorldState): WorldState {
  const cap = institutionCap(state);
  if (state.dreamInstitutions.length <= cap) {
    return state;
  }
  return { ...state, dreamInstitutions: state.dreamInstitutions.slice(-cap) };
}

export function decayInstitutionsYearly(state: WorldState, rng: Rng): WorldState {
  if (state.dreamInstitutions.length === 0) {
    return state;
  }
  const kept: DreamInstitution[] = [];
  for (const item of state.dreamInstitutions) {
    const age = state.year - item.enactedYear;
    let dropChance = 2 + Math.trunc(age / 40);
    if (!state.hasWriting) {
      dropChance += 3;
    }
    if (rng.int(1, 100) > dropChance) {
      kept.push(item);
    }
  }
  if (kept.length === state.dreamInstitutions.length) {
    return state;
  }
  return enforceDreamInstitutionCap({ ...state, dreamInstitutions: kept });
}

export function weakenInstitution(inst: DreamInstitution, rng: Rng): DreamInstitution {
  const effects = { ...inst.effects };
  effects.foodProductionPermille = clampPermille(effects.foodProductionPermille - rng.int(20, 80));
  effects.orderPerMonth = Math.trunc(effects.orderPerMonth * 0.7);
  effects.healthPerMonth = Math.trunc(effects.healthPerMonth * 0.7);
  return {
    ...inst,
    title: `${inst.title}（讹）`,
    effects,
  };
}

export function settleYearDream(
  state: WorldState,
  rng: Rng,
  year: number,
  events: RecordedEvent[],
  summary: YearSummary,
  populationBefore: number,
): { state: WorldState; dream: YearDream } {
  const data = loadDreamData();
  const populationAfter = state.population;
  const tag = pickDreamTag(data, events, summary, populationBefore, populationAfter);
  const source = pickSourceEvent(data, events, tag, populationBefore, populationAfter);
  const fragments = data.tags[tag];
  const opening = rng.pick(data.openings);
  const day = interpolate(rng.pick(fragments.dayTransform), source.title);
  const symbol = rng.pick(fragments.symbol);
  const reaction = rng.pick(fragments.reaction);
  const wake = rng.pick(fragments.wake);
  const text = [opening, day, symbol, reaction, wake].join("\n");

  let manifestation: DreamInstitution | null = null;
  let next = state;
  const cap = institutionCap(state);
  const generationalBonus = year % 28 < 3 ? 2 : 0;
  const manifestOdds = Math.min(6, 2 + generationalBonus + (state.hasWriting ? 1 : 0));
  if (state.dreamInstitutions.length < cap && rng.int(1, 100) <= manifestOdds) {
    const kind = pickKind(rng, fragments.kindWeights);
    const template = fragments.manifests[kind];
    manifestation = {
      id: `${year}-${tag}-${kind}`,
      kind,
      tag,
      title: template.title,
      enactedYear: year,
      effects: templateToEffects(template),
    };
    const list = [...state.dreamInstitutions, manifestation];
    while (list.length > cap) {
      list.shift();
    }
    next = enforceDreamInstitutionCap({ ...state, dreamInstitutions: list });
  }

  return {
    state: enforceDreamInstitutionCap(next),
    dream: { tag, sourceEventTitle: source.title, text, manifestation },
  };
}

export function adjustEventWeightByDream(
  state: WorldState,
  category: EventCategory,
  weight: number,
): number {
  const effects = aggregateDreamEffects(state);
  let scaled = weight;
  if (category === "缺粮") {
    scaled = scaleWeight(scaled, effects.shortageWeightPermille);
  }
  if (category === "丰收") {
    scaled = scaleWeight(scaled, effects.harvestWeightPermille);
  }
  if (category === "争吵") {
    scaled = scaleWeight(scaled, effects.quarrelWeightPermille);
  }
  if (category === "事故") {
    scaled = scaleWeight(scaled, effects.accidentWeightPermille);
  }
  if (category === "迁入") {
    scaled = scaleWeight(scaled, effects.immigrationWeightPermille);
  }
  if (category === "建成") {
    scaled += effects.buildEventWeightAdd;
  }
  return Math.max(0, scaled);
}

export function manifestationChronicleLine(dream: YearDream): string {
  if (!dream.manifestation) {
    return "昨夜之梦未落地为新法律、新节日或新禁忌。";
  }
  const kindLabel =
    dream.manifestation.kind === "law"
      ? "新法律"
      : dream.manifestation.kind === "festival"
        ? "新节日"
        : "新禁忌";
  return `昨夜之梦带来了：${kindLabel}「${dream.manifestation.title}」（自第${dream.manifestation.enactedYear}年起生效）。`;
}

function pickDreamTag(
  data: DreamData,
  events: RecordedEvent[],
  summary: YearSummary,
  populationBefore: number,
  populationAfter: number,
): DreamTag {
  const scores = new Map<DreamTag, number>();
  for (const tag of DREAM_TAGS) {
    scores.set(tag, 0);
  }
  for (const event of events) {
    const mapped = data.categoryToTag[event.category as EventCategory];
    if (!mapped) {
      continue;
    }
    scores.set(mapped, (scores.get(mapped) ?? 0) + (LEVEL_SCORE[event.level] ?? 1));
  }
  if (summary.foodEnd < summary.foodStart || summary.foodConsumed > summary.foodProduced) {
    scores.set("缺粮", (scores.get("缺粮") ?? 0) + 3);
  }
  if (summary.orderEnd + 5 < summary.orderStart || summary.healthEnd + 5 < summary.healthStart) {
    scores.set("低落", (scores.get("低落") ?? 0) + 4);
  }
  if (populationAfter > populationBefore) {
    scores.set("人口增长", (scores.get("人口增长") ?? 0) + 2);
  }
  let best: DreamTag = "低落";
  let bestScore = -1;
  for (const tag of DREAM_TAGS) {
    const score = scores.get(tag) ?? 0;
    if (score > bestScore) {
      best = tag;
      bestScore = score;
    }
  }
  return bestScore > 0 ? best : "低落";
}

function pickSourceEvent(
  data: DreamData,
  events: RecordedEvent[],
  tag: DreamTag,
  populationBefore: number,
  populationAfter: number,
): RecordedEvent {
  const related = events.filter((event) => data.categoryToTag[event.category as EventCategory] === tag);
  if (related.length > 0) {
    return related.reduce((best, event) =>
      (LEVEL_SCORE[event.level] ?? 1) > (LEVEL_SCORE[best.level] ?? 1) ? event : best,
    );
  }
  if (tag === "低落") {
    return {
      month: 12,
      id: "dream-low",
      title: "士气低落",
      category: "庆典",
      level: "寻常",
    };
  }
  if (tag === "人口增长") {
    return {
      month: 12,
      id: "dream-growth",
      title: "添口",
      category: "迁入",
      level: "轻微",
    };
  }
  return (
    events[0] ?? {
      month: 12,
      id: "dream-fallback",
      title: populationAfter >= populationBefore ? "平静一年" : "艰难一年",
      category: "庆典",
      level: "轻微",
    }
  );
}

function pickKind(rng: Rng, weights: Record<DreamInstitutionKind, number>): DreamInstitutionKind {
  const kinds: DreamInstitutionKind[] = ["law", "festival", "taboo"];
  const total = kinds.reduce((sum, kind) => sum + weights[kind], 0);
  let roll = rng.int(0, total - 1);
  for (const kind of kinds) {
    if (roll < weights[kind]) {
      return kind;
    }
    roll -= weights[kind];
  }
  return "law";
}

function templateToEffects(template: ManifestTemplate): DreamEffects {
  const effects = emptyDreamEffects();
  if (template.foodProductionPermille !== undefined) {
    effects.foodProductionPermille = template.foodProductionPermille;
  }
  if (template.birthPer10k !== undefined) {
    effects.birthPer10k = template.birthPer10k;
  }
  if (template.deathPer10k !== undefined) {
    effects.deathPer10k = template.deathPer10k;
  }
  if (template.orderPerMonth !== undefined) {
    effects.orderPerMonth = template.orderPerMonth;
  }
  if (template.healthPerMonth !== undefined) {
    effects.healthPerMonth = template.healthPerMonth;
  }
  if (template.goodsPerMonth !== undefined) {
    effects.goodsPerMonth = template.goodsPerMonth;
  }
  if (template.buildEventWeightAdd !== undefined) {
    effects.buildEventWeightAdd = template.buildEventWeightAdd;
  }
  if (template.shortageWeightPermille !== undefined) {
    effects.shortageWeightPermille = template.shortageWeightPermille;
  }
  if (template.harvestWeightPermille !== undefined) {
    effects.harvestWeightPermille = template.harvestWeightPermille;
  }
  if (template.quarrelWeightPermille !== undefined) {
    effects.quarrelWeightPermille = template.quarrelWeightPermille;
  }
  if (template.accidentWeightPermille !== undefined) {
    effects.accidentWeightPermille = template.accidentWeightPermille;
  }
  if (template.immigrationWeightPermille !== undefined) {
    effects.immigrationWeightPermille = template.immigrationWeightPermille;
  }
  return effects;
}

function mergeEffectsBounded(total: DreamEffects, add: DreamEffects): void {
  total.foodProductionPermille = clampPermille(
    total.foodProductionPermille + Math.trunc((add.foodProductionPermille - 1000) / 3),
  );
  total.birthPer10k += add.birthPer10k;
  total.deathPer10k += add.deathPer10k;
  total.orderPerMonth += add.orderPerMonth;
  total.healthPerMonth += add.healthPerMonth;
  total.goodsPerMonth += add.goodsPerMonth;
  total.buildEventWeightAdd += add.buildEventWeightAdd;
  total.shortageWeightPermille = clampPermille(
    total.shortageWeightPermille + Math.trunc((add.shortageWeightPermille - 1000) / 4),
  );
  total.harvestWeightPermille = clampPermille(
    total.harvestWeightPermille + Math.trunc((add.harvestWeightPermille - 1000) / 4),
  );
  total.quarrelWeightPermille = clampPermille(
    total.quarrelWeightPermille + Math.trunc((add.quarrelWeightPermille - 1000) / 4),
  );
  total.accidentWeightPermille = clampPermille(
    total.accidentWeightPermille + Math.trunc((add.accidentWeightPermille - 1000) / 4),
  );
  total.immigrationWeightPermille = clampPermille(
    total.immigrationWeightPermille + Math.trunc((add.immigrationWeightPermille - 1000) / 4),
  );
}

function scaleWeight(weight: number, permille: number): number {
  return Math.trunc((weight * permille) / 1000);
}

function interpolate(template: string, eventTitle: string): string {
  return template.replaceAll("{event}", eventTitle);
}

function loadDreamData(): DreamData {
  if (cached) {
    return cached;
  }
  const url = new URL("../data/dream-fragments.json", import.meta.url);
  cached = JSON.parse(readFileSync(url, "utf8")) as DreamData;
  return cached;
}
