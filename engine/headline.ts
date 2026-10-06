import { causeLabel } from "./extinction.ts";
import type { YearReport } from "./report.ts";
import type { WorldPhase } from "./state.ts";

export function yearHeadline(report: YearReport, selfName: string | null = null): string {
  if (report.extinction) {
    return `灭亡：${causeLabel(report.extinction.cause)}`;
  }
  const yearLabel = selfName ? `${selfName}第 ${report.year} 年` : `第 ${report.year} 年`;
  const major = report.events.find((event) => event.level === "灾变" || event.level === "严重");
  const picked = major ?? report.events[0];
  if (picked) {
    return `${yearLabel} · ${picked.month}月 ${picked.title}`;
  }
  return `${yearLabel} · 无大事入册`;
}

export function interregnumHeadline(
  phase: WorldPhase,
  falloutRemaining: number,
  voidRemaining: number,
  roseFromRuins: boolean,
): string {
  if (roseFromRuins) {
    return "废墟中兴起新众";
  }
  if (phase === "fallout") {
    return `余波：尚余 ${falloutRemaining} 年`;
  }
  if (phase === "void") {
    return `无史：尚余 ${voidRemaining} 年`;
  }
  return "间期推进";
}
