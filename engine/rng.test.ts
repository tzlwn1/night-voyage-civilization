import assert from "node:assert/strict";
import { test } from "node:test";

import { createRng, rngStateFromSeed, xmur3 } from "./rng.ts";

test("同一字符串种子得到同一个初始状态", () => {
  assert.equal(rngStateFromSeed("night"), rngStateFromSeed("night"));
  assert.notEqual(rngStateFromSeed("night"), rngStateFromSeed("night-2"));
  assert.equal(rngStateFromSeed("night"), 226619245);
});

test("xmur3 对 night 的首个哈希固定", () => {
  assert.equal(xmur3("night")(), 226619245);
});

test("mulberry32 序列与常见实现一致", () => {
  const rng = createRng(226619245);
  assert.deepEqual(
    [rng.nextUint32(), rng.nextUint32(), rng.nextUint32(), rng.nextUint32()],
    [1522503668, 4051285419, 3213533483, 2117390237],
  );
});

test("同一状态的抽取序列一致，续上存档后不回头", () => {
  const first = createRng(rngStateFromSeed("night"));
  const seen = [first.int(0, 100), first.pick(["a", "b", "c"]), first.nextUint32()];
  const saved = first.getState();

  const replay = createRng(rngStateFromSeed("night"));
  assert.deepEqual(
    [replay.int(0, 100), replay.pick(["a", "b", "c"]), replay.nextUint32()],
    seen,
  );

  const resumed = createRng(saved);
  const more = first.nextUint32();
  assert.equal(resumed.nextUint32(), more);
  assert.notEqual(more, seen[2]);
});
