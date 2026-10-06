export const GEOGRAPHIES = [
  { id: "archipelago", label: "群岛" },
  { id: "river-basin", label: "河湾" },
  { id: "highland", label: "高地" },
  { id: "coastal-plain", label: "海岸平原" },
  { id: "rift-valley", label: "裂谷" },
] as const;

export const CLIMATES = [
  { id: "monsoon", label: "季风" },
  { id: "arid", label: "干旱" },
  { id: "temperate", label: "温带" },
  { id: "polar-fringe", label: "极缘" },
  { id: "tropical", label: "热带" },
] as const;

export const ORIGINS = [
  { id: "shipwreck-fleet", label: "沉船船队" },
  { id: "exiled-clan", label: "流放氏族" },
  { id: "starfall-refugees", label: "坠星难民" },
  { id: "pilgrim-convoy", label: "朝圣船队" },
  { id: "forgotten-colony", label: "失联殖民地" },
] as const;

export type GeographyId = (typeof GEOGRAPHIES)[number]["id"];
export type ClimateId = (typeof CLIMATES)[number]["id"];
export type OriginId = (typeof ORIGINS)[number]["id"];

const CLIMATE_FERTILITY: Record<ClimateId, number> = {
  monsoon: 8,
  temperate: 6,
  tropical: 7,
  arid: 2,
  "polar-fringe": 1,
};

const GEOGRAPHY_FERTILITY: Record<GeographyId, number> = {
  "river-basin": 5,
  archipelago: 4,
  "coastal-plain": 4,
  "rift-valley": 3,
  highland: 2,
};

export function labelOf<T extends { id: string; label: string }>(
  table: readonly T[],
  id: string,
): string {
  const found = table.find((item) => item.id === id);
  if (!found) {
    throw new Error(`未知条目: ${id}`);
  }
  return found.label;
}

export function labelGeography(id: GeographyId): string {
  return labelOf(GEOGRAPHIES, id);
}

export function labelClimate(id: ClimateId): string {
  return labelOf(CLIMATES, id);
}

export function labelOrigin(id: OriginId): string {
  return labelOf(ORIGINS, id);
}

export function climateFertility(id: ClimateId): number {
  return CLIMATE_FERTILITY[id];
}

export function geographyFertility(id: GeographyId): number {
  return GEOGRAPHY_FERTILITY[id];
}
