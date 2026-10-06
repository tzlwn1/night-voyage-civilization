import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import { chronicleFile, indexFile } from "./paths.ts";
import { runSimulation } from "./simulate.ts";
import { readState } from "./state.ts";

async function collectFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  const walk = async (dir: string): Promise<void> => {
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => null);
    if (!entries) {
      files.push(dir);
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else {
        files.push(full);
      }
    }
  };
  await walk(path.join(root, "world"));
  await walk(path.join(root, "chronicle"));
  return files.sort();
}

test("同种子重跑 200 年，产出文件逐字节一致", async () => {
  const left = await mkdtemp(path.join(tmpdir(), "nvc-chron-"));
  const right = await mkdtemp(path.join(tmpdir(), "nvc-chron-"));
  await runSimulation({ root: left, years: 200, seed: "night" });
  await runSimulation({ root: right, years: 200, seed: "night" });
  const leftFiles = await collectFiles(left);
  const rightFiles = await collectFiles(right);
  assert.deepEqual(leftFiles.map((file) => file.slice(left.length)), rightFiles.map((file) => file.slice(right.length)));
  for (let i = 0; i < leftFiles.length; i += 1) {
    const a = await readFile(leftFiles[i]);
    const b = await readFile(rightFiles[i]);
    assert.deepEqual(a, b, leftFiles[i]);
  }
});

test("编年史标题使用当年自称，索引保留通称与别名链", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "nvc-chron-"));
  await runSimulation({ root, years: 80, seed: "night" });
  const state = await readState(root);
  assert.ok(state);
  const index = await readFile(indexFile(root), "utf8");
  assert.match(index, /通称:/);
  assert.match(index, /自称:/);
  assert.match(index, /别名链:/);
  const chronicle = await readFile(chronicleFile(root, state.civId, state.year), "utf8");
  assert.doesNotMatch(chronicle, /后世/);
  assert.match(chronicle, new RegExp(`^# .+ (第 ${state.year} 年|口传纪事（第 ${state.year} 年）)`, "m"));
});
