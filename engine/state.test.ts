import assert from "node:assert/strict";
import { test } from "node:test";

import { parseState } from "./state.ts";

test("拒绝损坏的存档", () => {
  assert.throws(() => parseState("{"), /不是合法 JSON/);
  assert.throws(() => parseState("[]"), /根节点必须是对象/);
  assert.throws(() => parseState('{"version":99}'), /不支持的版本/);
});

test("第一版存档补上资源与文字字段", () => {
  const state = parseState(
    JSON.stringify({
      version: 1,
      civId: "civ-001",
      seed: "night",
      year: 2,
      geography: "coastal-plain",
      climate: "tropical",
      origin: "pilgrim-convoy",
      population: 397,
      foundingPopulation: 383,
      rngState: 1362408191,
      lastSettlement: {
        year: 2,
        eventId: "omen",
        populationBefore: 397,
        populationAfter: 397,
      },
    }),
  );
  assert.equal(state.version, 6);
  assert.equal(state.hasWriting, false);
  assert.equal(state.food, 794);
  assert.equal(state.naming.selfName, null);
  assert.match(state.naming.commonName, /海岸平原/);
  assert.deepEqual(state.lastSettlement?.eventIds, ["omen"]);
});
