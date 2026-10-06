import { writeSettledYear, writeWorldIndex } from "./chronicle.ts";
import { genesis } from "./genesis.ts";
import { interregnumHeadline, yearHeadline } from "./headline.ts";
import { writeReadme } from "./readme.ts";
import type { YearReport } from "./report.ts";
import { createRng } from "./rng.ts";
import { advanceInterregnum, applySuccessionArtifacts, writeAnnals } from "./succession.ts";
import { buildExtinctionTag, type ExtinctionTag } from "./tags.ts";
import { readState, writeState, type WorldState } from "./state.ts";
import { settleYear } from "./year.ts";

export interface AdvanceStepResult {
  headline: string;
  tag: ExtinctionTag | null;
  report: YearReport | null;
  state: WorldState;
}

export async function advanceOneYear(root: string, seed: string): Promise<AdvanceStepResult> {
  let state = await readState(root);
  if (!state) {
    state = await genesis(root, seed);
  }
  if (state.seed !== seed) {
    throw new Error(`存档种子是 ${state.seed}，与 --seed=${seed} 不一致`);
  }

  if (state.phase === "fallout" || state.phase === "void") {
    const beforeCiv = state.civId;
    const rng = createRng(state.rngState);
    state = advanceInterregnum(state, rng);
    const roseFromRuins = state.civId !== beforeCiv;
    if (state.predecessorSnapshot) {
      state = await applySuccessionArtifacts(root, state);
    } else {
      await writeState(root, state);
    }
    const headline = interregnumHeadline(
      state.phase,
      state.falloutRemaining,
      state.voidRemaining,
      roseFromRuins,
    );
    await writeReadme(root);
    return { headline, tag: null, report: null, state };
  }

  const settled = settleYear(state);
  state = settled.state;
  await writeSettledYear(root, settled.report);
  let tag: ExtinctionTag | null = null;
  if (settled.report.extinction) {
    await writeAnnals(root, state, settled.report.extinction);
    tag = buildExtinctionTag(state, settled.report.extinction);
  } else {
    await writeWorldIndex(root, state);
  }
  await writeState(root, state);
  await writeReadme(root);
  return {
    headline: yearHeadline(settled.report, state.naming.selfName),
    tag,
    report: settled.report,
    state,
  };
}

export async function advanceYears(
  root: string,
  years: number,
  seed: string,
): Promise<AdvanceStepResult[]> {
  if (!Number.isInteger(years) || years < 1) {
    throw new Error("年数必须是正整数");
  }
  const results: AdvanceStepResult[] = [];
  for (let i = 0; i < years; i += 1) {
    results.push(await advanceOneYear(root, seed));
  }
  return results;
}
