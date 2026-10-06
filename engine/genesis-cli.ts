import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { genesisYearZero } from "./genesis.ts";
import { labelClimate, labelGeography, labelOrigin } from "./catalog.ts";
import { timelinesFile } from "./paths.ts";

export function randomSeed(): string {
  return randomBytes(16).toString("hex");
}

export function parseGenesisArgs(argv: string[]): { seed: string | null } {
  let seed: string | null = null;
  for (const arg of argv) {
    if (arg.startsWith("--seed=")) {
      seed = arg.slice("--seed=".length);
    } else {
      throw new Error(`未知参数: ${arg}\n用法: npm run genesis [-- --seed=<种子>]`);
    }
  }
  if (seed !== null && seed.length === 0) {
    throw new Error("种子不能为空");
  }
  return { seed };
}

async function syncTimelineSeed(root: string, seed: string): Promise<void> {
  const file = timelinesFile(root);
  const raw = await readFile(file, "utf8");
  const config = JSON.parse(raw) as { timelines: Array<Record<string, unknown>> };
  if (!Array.isArray(config.timelines) || config.timelines.length === 0) {
    throw new Error("world/timelines.json 无效");
  }
  config.timelines[0].seed = seed;
  await writeFile(file, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

async function main(): Promise<void> {
  try {
    const { seed: seedArg } = parseGenesisArgs(process.argv.slice(2));
    const seed = seedArg ?? randomSeed();
    const root = process.cwd();
    const state = await genesisYearZero(root, seed);
    await syncTimelineSeed(root, seed);
    process.stdout.write(
      [
        "创世完成（第 0 年）",
        `种子: ${state.seed}`,
        `地理: ${labelGeography(state.geography)}`,
        `气候: ${labelClimate(state.climate)}`,
        `来历: ${labelOrigin(state.origin)}`,
        `人口: ${state.population}`,
      ].join("\n") + "\n",
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}

function isDirectRun(): boolean {
  const entry = process.argv[1];
  if (!entry) {
    return false;
  }
  return pathToFileURL(path.resolve(entry)).href === import.meta.url;
}

if (isDirectRun()) {
  await main();
}
