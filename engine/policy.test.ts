import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

test("模拟代码不使用 Math.random", async () => {
  const root = path.resolve("engine");
  const files = await sourceFiles(root);
  assert.ok(files.length > 0);
  const pattern = /Math\s*\.\s*random\b|Math\s*\[\s*["']random["']\s*\]/;
  for (const file of files) {
    const text = await readFile(file, "utf8");
    assert.equal(pattern.test(text), false, file);
  }
});

async function sourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await sourceFiles(full)));
    } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
      files.push(full);
    }
  }
  return files;
}
