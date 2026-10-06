import { causeLabel, type ExtinctionVerdict } from "./extinction.ts";
import { civilizationNameSlug } from "./naming.ts";
import type { WorldState } from "./state.ts";

export interface ExtinctionTag {
  name: string;
  message: string;
}

export function buildExtinctionTag(state: WorldState, verdict: ExtinctionVerdict): ExtinctionTag {
  const seq = String(state.civSeq).padStart(3, "0");
  const startYear = 1;
  const endYear = state.year;
  const slug = civilizationNameSlug(state);
  const fullName =
    state.naming.selfName !== null
      ? `${state.naming.selfName}（${state.naming.commonName}）`
      : state.naming.commonName;
  return {
    name: `civ-${seq}_${startYear}-${endYear}_${slug}`,
    message: [
      `全名: ${fullName}`,
      `存续: 第 ${startYear} 年至第 ${endYear} 年`,
      `死因: ${causeLabel(verdict.cause)}`,
      `末代人口: ${verdict.finalPopulation}`,
    ].join("\n"),
  };
}
