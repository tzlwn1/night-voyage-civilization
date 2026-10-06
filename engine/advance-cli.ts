import path from "node:path";
import { pathToFileURL } from "node:url";

import { advanceYears } from "./advance.ts";

export function parseAdvanceArgs(argv: string[]): { years: number; seed: string; jsonLines: boolean } {
  let yearsText: string | undefined;
  let seed: string | undefined;
  let jsonLines = false;
  for (const arg of argv) {
    if (arg === "--json-lines") {
      jsonLines = true;
    } else if (arg.startsWith("--years=")) {
      yearsText = arg.slice("--years=".length);
    } else if (arg.startsWith("--seed=")) {
      seed = arg.slice("--seed=".length);
    } else {
      throw new Error(`未知参数: ${arg}\n${advanceUsage()}`);
    }
  }
  if (yearsText === undefined || seed === undefined) {
    throw new Error(advanceUsage());
  }
  if (!/^[1-9]\d*$/.test(yearsText)) {
    throw new Error(`年数必须是正整数: ${yearsText}`);
  }
  if (seed.length === 0) {
    throw new Error("种子不能为空");
  }
  return { years: Number(yearsText), seed, jsonLines };
}

function advanceUsage(): string {
  return "用法: npm run advance -- --years=<正整数> --seed=<种子> [--json-lines]";
}

async function main(): Promise<void> {
  try {
    const { years, seed, jsonLines } = parseAdvanceArgs(process.argv.slice(2));
    const root = process.cwd();
    const steps = await advanceYears(root, years, seed);
    if (jsonLines) {
      for (const step of steps) {
        process.stdout.write(
          `${JSON.stringify({
            headline: step.headline,
            tag: step.tag,
            civId: step.state.civId,
            year: step.state.year,
            phase: step.state.phase,
          })}\n`,
        );
      }
    } else {
      for (const step of steps) {
        process.stdout.write(`${step.headline}\n`);
      }
    }
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
