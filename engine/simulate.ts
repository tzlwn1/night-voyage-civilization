import {
  labelClimate,
  labelGeography,
  labelOrigin,
} from "./catalog.ts";
import { advanceOneYear } from "./advance.ts";
import { chronicleTitle } from "./naming.ts";
import type { YearReport } from "./report.ts";
import { readState, type WorldState } from "./state.ts";

export type { YearReport } from "./report.ts";
export { settleYear } from "./year.ts";

export interface SimulationRequest {
  root: string;
  years: number;
  seed: string;
}

export async function runSimulation(request: SimulationRequest): Promise<YearReport[]> {
  if (!Number.isInteger(request.years) || request.years < 1) {
    throw new Error("年数必须是正整数");
  }

  const reports: YearReport[] = [];
  for (let i = 0; i < request.years; i += 1) {
    const step = await advanceOneYear(request.root, request.seed);
    if (step.report) {
      reports.push(step.report);
    }
  }
  return reports;
}

export function formatReport(state: WorldState, report: YearReport): string {
  const titles = report.events.map((event) => event.title);
  const shown = titles.length <= 8 ? titles.join("、") : `${titles.slice(0, 8).join("、")}等`;
  return [
    `${chronicleTitle(state)} 第 ${report.year} 年`,
    `种子 ${state.seed}`,
    `地理 ${labelGeography(state.geography)}`,
    `气候 ${labelClimate(state.climate)}`,
    `来历 ${labelOrigin(state.origin)}`,
    `人口 ${report.populationBefore} → ${report.populationAfter}`,
    `入册事件 ${report.events.length} 件`,
    `事件: ${shown}`,
  ].join("\n");
}
