import path from "node:path";
import { pathToFileURL } from "node:url";

import { formatReport, runSimulation } from "./simulate.ts";
import { readState } from "./state.ts";

export function parseArgs(argv: string[]): { years: number; seed: string } {
  let yearsText: string | undefined;
  let seed: string | undefined;
  for (const arg of argv) {
    if (arg.startsWith("--years=")) {
      yearsText = arg.slice("--years=".length);
    } else if (arg.startsWith("--seed=")) {
      seed = arg.slice("--seed=".length);
    } else {
      throw new Error(`未知参数: ${arg}\n${usage()}`);
    }
  }
  if (yearsText === undefined || seed === undefined) {
    throw new Error(usage());
  }
  if (!/^[1-9]\d*$/.test(yearsText)) {
    throw new Error(`年数必须是正整数: ${yearsText}`);
  }
  if (seed.length === 0) {
    throw new Error("种子不能为空");
  }
  return { years: Number(yearsText), seed };
}

function usage(): string {
  return "用法: npm run simulate -- --years=<正整数> --seed=<种子>";
}

async function main(): Promise<void> {
  try {
    const { years, seed } = parseArgs(process.argv.slice(2));
    const root = process.cwd();
    const reports = await runSimulation({ root, years, seed });
    const state = await readState(root);
    if (!state) {
      throw new Error("结算后找不到存档");
    }
    process.stdout.write(`${reports.map((report) => formatReport(state, report)).join("\n\n")}\n`);
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
