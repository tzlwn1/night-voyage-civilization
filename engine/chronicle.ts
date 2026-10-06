import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { labelClimate, labelGeography, labelOrigin } from "./catalog.ts";
import { causeLabel } from "./extinction.ts";
import { chronicleTitle, renderWorldIndex } from "./naming.ts";
import { chronicleFile, indexFile } from "./paths.ts";
import type { RecordedEvent, YearReport } from "./report.ts";
import type { WorldState } from "./state.ts";

export async function writeGenesisChronicle(root: string, state: WorldState): Promise<void> {
  const title = chronicleTitle(state);
  const text = [
    `# ${title} · 创世记（第 0 年）`,
    "",
    "状态: 已立世",
    "",
    `种子: ${state.seed}`,
    `通称: ${state.naming.commonName}`,
    `自称: ${state.naming.selfName ?? "无"}`,
    `地理: ${labelGeography(state.geography)}`,
    `气候: ${labelClimate(state.climate)}`,
    `来历: ${labelOrigin(state.origin)}`,
    `初始人口: ${state.foundingPopulation}`,
    "",
    "史官注: 世界历将自第 1 年起逐年结算；本篇仅记创世，不含年度大事。",
    "",
  ].join("\n");
  await writeText(chronicleFile(root, state.civId, 0), text);
  await writeText(indexFile(root), renderIndexFromState(state));
}

export async function writeYearDraft(root: string, state: WorldState): Promise<void> {
  const title = chronicleTitle(state);
  const text = [
    `# ${title} 第 1 年`,
    "",
    "状态: 草稿",
    "",
    `种子: ${state.seed}`,
    `通称: ${state.naming.commonName}`,
    `自称: ${state.naming.selfName ?? "无"}`,
    `地理: ${labelGeography(state.geography)}`,
    `气候: ${labelClimate(state.climate)}`,
    `来历: ${labelOrigin(state.origin)}`,
    `初始人口: ${state.foundingPopulation}`,
    "",
  ].join("\n");
  await writeText(chronicleFile(root, state.civId, 1), text);
  await writeText(indexFile(root), renderIndexFromState(state));
}

export function renderSettledYear(
  state: WorldState,
  report: Omit<YearReport, "chronicle">,
): string {
  if (!state.hasWriting) {
    return renderOralSettledYear(state, report);
  }
  const title = chronicleTitle(state);
  const lines = [
    `# ${title} 第 ${report.year} 年`,
    "",
    "状态: 已结算",
    "",
    `种子: ${state.seed}`,
    `通称: ${state.naming.commonName}`,
    `自称: ${state.naming.selfName ?? "无"}`,
    `地理: ${labelGeography(state.geography)}`,
    `气候: ${labelClimate(state.climate)}`,
    `来历: ${labelOrigin(state.origin)}`,
    "",
    "## 年度汇总",
    `- 人口 ${report.populationBefore} → ${report.populationAfter}`,
    `- 出生 ${report.summary.births}，死亡 ${report.summary.deaths}`,
    `- 存粮 ${report.summary.foodStart} → ${report.summary.foodEnd}`,
    `- 收成 ${report.summary.foodProduced}，耗粮 ${report.summary.foodConsumed}`,
    `- 物资 ${report.summary.goodsStart} → ${report.summary.goodsEnd}（新增 ${report.summary.goodsCrafted}）`,
    `- 健康 ${report.summary.healthStart} → ${report.summary.healthEnd}`,
    `- 秩序 ${report.summary.orderStart} → ${report.summary.orderEnd}`,
    `- 建筑 ${report.summary.buildingsStart} → ${report.summary.buildingsEnd}`,
    `- 入册事件 ${report.events.length} 件`,
    "",
    "## 记事",
    ...renderEventNotes(report.events),
    "",
  ];
  if (report.namingNotes.length > 0) {
    lines.push("## 名号", ...report.namingNotes.map((line) => `- ${line}`), "");
  }
  if (report.extinction) {
    lines.push(
      "## 灭亡",
      `- 原因: ${causeLabel(report.extinction.cause)}`,
      `- 末代人口: ${report.extinction.finalPopulation}`,
      `- 档案健康度: ${report.extinction.archiveHealth}`,
      "",
    );
  }
  lines.push(
    "## 梦境",
    report.dream.text,
    `- ${report.dream.brought}`,
    "",
  );
  return lines.join("\n");
}

export async function writeSettledYear(root: string, report: YearReport): Promise<void> {
  await writeText(chronicleFile(root, report.civId, report.year), report.chronicle);
}

export async function writeWorldIndex(root: string, state: WorldState): Promise<void> {
  await writeText(indexFile(root), renderIndexFromState(state));
}

function renderOralSettledYear(state: WorldState, report: Omit<YearReport, "chronicle">): string {
  const title = chronicleTitle(state);
  const highlights = report.events
    .filter((event) => event.level === "灾变" || event.level === "严重")
    .slice(0, 4)
    .map((event) => `${event.month}月${event.title}`);
  if (highlights.length < 3) {
    for (const event of report.events) {
      if (highlights.length >= 5) {
        break;
      }
      const line = `${event.month}月${event.title}`;
      if (!highlights.includes(line)) {
        highlights.push(line);
      }
    }
  }
  const lines = [
    `# ${title} · 口传纪事（第 ${report.year} 年）`,
    "",
    `人口 ${report.populationBefore} → ${report.populationAfter}；存粮 ${report.summary.foodEnd}。`,
    highlights.length > 0 ? `口传: ${highlights.join("、")}。` : "口传: 本年平淡，无大事可述。",
  ];
  if (report.namingNotes.length > 0) {
    lines.push(report.namingNotes.join("；"));
  }
  const dreamLine = report.dream.text.split("\n").find((line) => line.trim().length > 0);
  if (dreamLine) {
    lines.push(`夜梦: ${dreamLine.trim()}`);
  }
  lines.push("");
  return lines.join("\n");
}

function renderIndexFromState(state: WorldState): string {
  return renderWorldIndex(state);
}

function renderEventNotes(events: RecordedEvent[]): string[] {
  if (events.length === 0) {
    return ["- 本年无入册大事。"];
  }
  return events.map((event) => {
    if (event.level === "灾变" || event.level === "严重") {
      return [
        `- ${event.month}月 ${event.title}。`,
        `  ${majorEventBody(event)}`,
      ].join("\n");
    }
    return `- ${event.month}月 ${event.title}。`;
  });
}

function majorEventBody(event: RecordedEvent): string {
  switch (event.category) {
    case "瘟疫":
      return "疫病蔓延，街巷空寂，医棚与火塘日夜不息。";
    case "争吵":
      return "争执从粮账蔓延到火塘，长老数次召集仍难平息。";
    case "缺粮":
      return "饥意压过礼法，存粮见底，众人只得重分口粮。";
    case "事故":
      return "意外接连发生，营地忙于善后，数月不得安宁。";
    case "建成":
      return "新筑落成，众人聚议，以为此后可依此重整秩序。";
    default:
      return "此事震动营地，数月后方渐回常态。";
  }
}

async function writeText(file: string, text: string): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, text, "utf8");
}
