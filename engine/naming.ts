import { readFileSync } from "node:fs";

import { labelGeography, labelOrigin } from "./catalog.ts";
import type { Rng } from "./rng.ts";
import type { GeographyId, OriginId } from "./catalog.ts";
import type { NamingState, WorldState } from "./state.ts";

export type NamingKind = "建国" | "改朝" | "战争" | "贸易" | "改名" | "外号";

export interface NamingConsequence {
  kind: NamingKind;
  pool: string;
}

type NamePools = Record<string, string[]>;

let pools: NamePools | null = null;

function loadPools(): NamePools {
  if (pools) {
    return pools;
  }
  const url = new URL("../data/name-pools.json", import.meta.url);
  const parsed: unknown = JSON.parse(readFileSync(url, "utf8"));
  if (!parsed || typeof parsed !== "object") {
    throw new Error("名号池无效");
  }
  pools = parsed as NamePools;
  return pools;
}

export function initialNaming(geography: GeographyId, origin: OriginId): NamingState {
  const geo = labelGeography(geography);
  const originLabel = labelOrigin(origin);
  const commonName = `${geo}${originLabel.slice(0, 2)}众`;
  return {
    settlementName: null,
    selfName: null,
    commonName,
    nicknames: [],
    aliases: [],
  };
}

export function pickPoolName(rng: Rng, pool: string): string {
  const table = loadPools()[pool];
  if (!table || table.length === 0) {
    throw new Error(`未知名号池: ${pool}`);
  }
  return rng.pick(table);
}

export function applyNaming(
  state: WorldState,
  consequence: NamingConsequence,
  year: number,
  rng: Rng,
): WorldState {
  const name = pickPoolName(rng, consequence.pool);
  const aliases = [...state.naming.aliases, { year, kind: consequence.kind, name }];
  let selfName = state.naming.selfName;
  const nicknames = [...state.naming.nicknames];
  if (consequence.kind === "建国" || consequence.kind === "改朝" || consequence.kind === "改名") {
    selfName = name;
  } else if (consequence.kind === "贸易") {
    if (!nicknames.includes(name)) {
      nicknames.push(name);
    }
  } else if (consequence.kind === "战争" || consequence.kind === "外号") {
    if (!nicknames.includes(name)) {
      nicknames.push(name);
    }
  }
  return {
    ...state,
    naming: {
      ...state.naming,
      selfName,
      nicknames,
      aliases,
    },
  };
}

export function chronicleTitle(state: WorldState): string {
  if (state.politicalStage === "regime" && state.naming.selfName) {
    return state.naming.selfName;
  }
  if (state.naming.settlementName) {
    return state.naming.settlementName;
  }
  return state.naming.commonName;
}

/** Git 附注 tag 用的 ASCII 短名；纯中文时退回 civ-序号。 */
export function civilizationNameSlug(state: WorldState): string {
  const base = state.naming.selfName ?? state.naming.commonName;
  const ascii = base
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  if (ascii.length >= 2) {
    return ascii.slice(0, 48);
  }
  return `civ-${String(state.civSeq).padStart(3, "0")}`;
}

export function renderWorldIndex(state: WorldState): string {
  const nicknames = state.naming.nicknames.length > 0 ? state.naming.nicknames.join("、") : "无";
  const aliasLines =
    state.naming.aliases.length > 0
      ? state.naming.aliases.map((entry) => `- 第${entry.year}年 ${entry.kind} ${entry.name}`)
      : ["- 无"];
  const yearFile =
    state.year > 0 ? `${String(state.year).padStart(4, "0")}.md` : "0000.md";
  const latestLabel = state.year > 0 ? `第 ${state.year} 年` : "第 0 年（创世记）";
  return [
    `# ${state.civId} 名目与编年总目录`,
    "",
    "> 引擎维护的总目录：名号见下，逐年正文在 chronicle。",
    "",
    "## 名号",
    "",
    `通称: ${state.naming.commonName}`,
    `聚落: ${state.naming.settlementName ?? "无"}`,
    `自称: ${state.naming.selfName ?? "无"}`,
    `外号: ${nicknames}`,
    "别名链:",
    ...aliasLines,
    "",
    "## 编年入口",
    "",
    `- [仓库首页](../README.md)`,
    `- [${latestLabel}](../chronicle/${state.civId}/${yearFile})`,
    `- [编年目录](../chronicle/${state.civId}/)`,
    state.extinct || state.pendingSuccession
      ? `- [文明总录](../chronicle/${state.pendingSuccession?.civId ?? state.civId}/annals.md)`
      : "- 文明总录: （存续中，灭亡后生成 annals.md）",
    "",
    `种子: ${state.seed} · 世界历 ${state.worldYear}`,
    "",
  ].join("\n");
}
