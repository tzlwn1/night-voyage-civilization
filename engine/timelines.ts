import { readFileSync } from "node:fs";

import { timelinesFile } from "./paths.ts";

export interface TimelineEntry {
  id: string;
  branch: string;
  seed: string;
  active: boolean;
  notes?: string;
}

export interface TimelinesConfig {
  timelines: TimelineEntry[];
}

export function loadTimelines(root: string): TimelineEntry[] {
  const raw = readFileSync(timelinesFile(root), "utf8");
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as TimelinesConfig).timelines)) {
    throw new Error("world/timelines.json 无效");
  }
  const config = parsed as TimelinesConfig;
  return config.timelines.map((entry, index) => {
    if (!entry || typeof entry !== "object") {
      throw new Error(`时间线 ${index} 无效`);
    }
    const id = requiredString(entry.id, `时间线 ${index}.id`);
    const branch = requiredString(entry.branch, `时间线 ${index}.branch`);
    const seed = requiredString(entry.seed, `时间线 ${index}.seed`);
    if (typeof entry.active !== "boolean") {
      throw new Error(`时间线 ${index}.active 必须是布尔值`);
    }
    const notes =
      entry.notes === undefined
        ? undefined
        : typeof entry.notes === "string"
          ? entry.notes
          : (() => {
              throw new Error(`时间线 ${index}.notes 必须是字符串`);
            })();
    return { id, branch, seed, active: entry.active, notes };
  });
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} 无效`);
  }
  return value;
}
