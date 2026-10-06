import { readFile, writeFile } from "node:fs/promises";

import { writeWorldIndex } from "./chronicle.ts";
import { labelClimate, labelGeography, labelOrigin } from "./catalog.ts";
import { causeLabel } from "./extinction.ts";
import { chronicleFile, readmeFile } from "./paths.ts";
import { readState, type WorldState } from "./state.ts";

const AUTO_BANNER =
  "> **以下「当前文明」「最新大事」「编年史快捷入口」由引擎自动更新，请勿手改。** 叙事与背景见 [docs/ABOUT.md](docs/ABOUT.md)；运行与维护说明见本文末尾。";

function publicPreamble(): string[] {
  return [
    "# 夜航文明",
    "",
    "一个无人干预的口袋文明：白天过日子，夜里做梦，梦醒就给世界添一条规矩。",
    "",
    "本仓库持续自动更新：世界在规则与随机中逐年生长，编年史与提交历史一同变厚。",
    "",
    "## 怎么读编年史",
    "",
    "| 入口 | 说明 |",
    "| --- | --- |",
    "| [world/index.md](world/index.md) | 通称、自称、外号、别名链与链接 |",
    "| [chronicle/](chronicle/) | 逐年正文，`0000.md` 为创世记，其后每年一篇 |",
    "| `annals.md` | 文明灭亡时的总录 |",
    "| `revisions/` | 后继文明对前朝记忆的修订对照 |",
    "| 仓库 **Tags** | 灭亡时的附注 tag，封存起止年与末代概况 |",
    "",
    "---",
    "",
    AUTO_BANNER,
    "",
    "",
  ];
}

function maintenanceFooter(): string[] {
  return [
    "",
    "---",
    "",
    "## 维护与运行",
    "",
    "### 既定规则",
    "",
    "- **无人干预**：无玩家操作，无外部剧情投喂。",
    "- **无 AI 叙事**：事件与编年来自引擎与数据表。",
    "- **自动推进**：对活跃时间线按日程推进世界年，**一年一提交**（提交信息为当年头条）。",
    "- **灭亡与继承**：文明可亡；旧编年史不改写，仅增「后世修订」。",
    "",
    "### 仓库结构",
    "",
    "```text",
    "engine/     模拟、编年史、README 生成",
    "data/       事件、名号池、梦境片段",
    "world/      state.json、index.md、timelines.json",
    "chronicle/  各文明逐年 Markdown",
    "scripts/    CI 推进脚本",
    "docs/       人写说明（不被引擎覆盖）",
    "```",
    "",
    "### 本地运行",
    "",
    "```bash",
    "npm ci",
    "npm run genesis                    # 第 0 年创世（随机种子）",
    "npm run simulate -- --years=<N> --seed=<存档种子>",
    "npm run advance -- --years=1 --seed=<存档种子>",
    "npm test",
    "```",
    "",
    "种子须与 `world/state.json` 一致；时间线配置见 `world/timelines.json`。",
    "",
  ];
}

export async function writeReadme(root: string): Promise<void> {
  const state = await readState(root);
  if (state) {
    await writeWorldIndex(root, state);
  }
  const auto = state ? await renderAutoSection(root, state) : renderEmptyAutoSection();
  await writeFile(
    readmeFile(root),
    `${publicPreamble().join("\n")}${auto}${maintenanceFooter().join("\n")}\n`,
  );
}

function renderEmptyAutoSection(): string {
  return [
    "## 当前文明",
    "",
    "尚无存档。等待自动推进，或在本地按文末说明创世。",
    "",
    "## 最新大事",
    "",
    "—",
    "",
    "## 编年史快捷入口",
    "",
    "- 创世后将生成 [world/index.md](world/index.md) 与 `chronicle/civ-001/`。",
    "",
  ].join("\n");
}

async function renderAutoSection(root: string, state: WorldState): Promise<string> {
  const phaseLabel = phaseText(state);
  const latest = await latestChronicleLink(root, state);
  const entries = chronicleLinks(state);
  return [
    "## 当前文明",
    "",
    `| 项目 | 值 |`,
    `| --- | --- |`,
    `| 文明 | ${state.civId} |`,
    `| 阶段 | ${phaseLabel} |`,
    `| 文明历 | 第 ${state.year} 年 |`,
    `| 世界历 | ${state.worldYear} |`,
    `| 通称 | ${state.naming.commonName} |`,
    `| 自称 | ${state.naming.selfName ?? "无"} |`,
    `| 人口 | ${state.population} |`,
    `| 地理 | ${labelGeography(state.geography)} |`,
    `| 气候 | ${labelClimate(state.climate)} |`,
    `| 来历 | ${labelOrigin(state.origin)} |`,
    "",
    "## 最新大事",
    "",
    latest,
    "",
    "## 编年史快捷入口",
    "",
    ...entries,
    "",
  ].join("\n");
}

function phaseText(state: WorldState): string {
  switch (state.phase) {
    case "active":
      return "存续";
    case "fallout":
      return `余波（余 ${state.falloutRemaining} 年）`;
    case "void":
      return `无史（余 ${state.voidRemaining} 年）`;
    default:
      return state.phase;
  }
}

async function latestChronicleLink(root: string, state: WorldState): Promise<string> {
  if (state.phase === "fallout" && state.pendingSuccession) {
    return `前朝 ${state.pendingSuccession.civId} 已亡（${causeLabel(state.pendingSuccession.cause)}），余波整理档案与废墟。`;
  }
  if (state.phase === "void") {
    return "无史之年：旧名与旧事沉入迷雾，仅余营火与风声。";
  }
  const year = state.year;
  const rel = `chronicle/${state.civId}/${String(year).padStart(4, "0")}.md`;
  try {
    const text = await readFile(chronicleFile(root, state.civId, year), "utf8");
    const match = /^# (.+)$/m.exec(text);
    if (match) {
      return `[${match[1]}](${rel})`;
    }
  } catch {
    // fall through
  }
  if (year === 0) {
    return `[创世记](${rel})`;
  }
  return `第 ${year} 年编年（[打开](${rel})）`;
}

function chronicleLinks(state: WorldState): string[] {
  const lines = ["- [名目总目录](world/index.md)"];
  if (state.phase === "active") {
    const yearFile = `${String(state.year).padStart(4, "0")}.md`;
    const label = state.year > 0 ? "最新编年" : "创世记";
    lines.push(`- [${label}](chronicle/${state.civId}/${yearFile})`);
  }
  const annalsCiv =
    state.pendingSuccession?.civId ??
    (state.extinct && state.phase !== "active" ? state.civId : null);
  if (annalsCiv) {
    lines.push(`- [文明总录](chronicle/${annalsCiv}/annals.md)`);
  }
  lines.push(`- [编年目录](chronicle/${state.civId}/)`);
  return lines;
}
