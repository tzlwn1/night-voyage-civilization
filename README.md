# 夜航文明

一个无人干预的口袋文明：白天过日子，夜里做梦，梦醒就给世界添一条规矩。

本仓库持续自动更新：世界在规则与随机中逐年生长，编年史与提交历史一同变厚。

## 怎么读编年史

| 入口 | 说明 |
| --- | --- |
| [world/index.md](world/index.md) | 通称、自称、外号、别名链与链接 |
| [chronicle/](chronicle/) | 逐年正文，`0000.md` 为创世记，其后每年一篇 |
| `annals.md` | 文明灭亡时的总录 |
| `revisions/` | 后继文明对前朝记忆的修订对照 |
| 仓库 **Tags** | 灭亡时的附注 tag，封存起止年与末代概况 |

---

> **以下「当前文明」「最新大事」「编年史快捷入口」由引擎自动更新，请勿手改。** 叙事与背景见 [docs/ABOUT.md](docs/ABOUT.md)；运行与维护说明见本文末尾。

## 当前文明

| 项目 | 值 |
| --- | --- |
| 文明 | civ-001 |
| 阶段 | 存续 |
| 文明历 | 第 7 年 |
| 世界历 | 7 |
| 通称 | 海岸平原失联众 |
| 自称 | 无 |
| 人口 | 413 |
| 地理 | 海岸平原 |
| 气候 | 干旱 |
| 来历 | 失联殖民地 |

## 最新大事

[海岸平原失联众 · 口传纪事（第 7 年）](chronicle/civ-001/0007.md)

## 编年史快捷入口

- [名目总目录](world/index.md)
- [最新编年](chronicle/civ-001/0007.md)
- [编年目录](chronicle/civ-001/)

---

## 维护与运行

### 既定规则

- **无人干预**：无玩家操作，无外部剧情投喂。
- **无 AI 叙事**：事件与编年来自引擎与数据表。
- **自动推进**：对活跃时间线按日程推进世界年，**一年一提交**（提交信息为当年头条）。
- **灭亡与继承**：文明可亡；旧编年史不改写，仅增「后世修订」。

### 仓库结构

```text
engine/     模拟、编年史、README 生成
data/       事件、名号池、梦境片段
world/      state.json、index.md、timelines.json
chronicle/  各文明逐年 Markdown
scripts/    CI 推进脚本
docs/       人写说明（不被引擎覆盖）
```

### 本地运行

```bash
npm ci
npm run genesis                    # 第 0 年创世（随机种子）
npm run simulate -- --years=<N> --seed=<存档种子>
npm run advance -- --years=1 --seed=<存档种子>
npm test
```

种子须与 `world/state.json` 一致；时间线配置见 `world/timelines.json`。

