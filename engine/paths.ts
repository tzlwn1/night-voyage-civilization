import path from "node:path";

export const FIRST_CIV_SEQ = 1;

export function formatCivId(seq: number): string {
  return `civ-${String(seq).padStart(3, "0")}`;
}

export function parseCivSeq(civId: string): number {
  const match = /^civ-(\d{3})$/.exec(civId);
  if (!match) {
    throw new Error(`无效文明编号: ${civId}`);
  }
  return Number(match[1]);
}

export function stateFile(root: string): string {
  return path.join(root, "world", "state.json");
}

export function chronicleDir(root: string, civId: string): string {
  return path.join(root, "chronicle", civId);
}

export function chronicleFile(root: string, civId: string, year: number): string {
  const name = `${String(year).padStart(4, "0")}.md`;
  return path.join(chronicleDir(root, civId), name);
}

export function annalsFile(root: string, civId: string): string {
  return path.join(chronicleDir(root, civId), "annals.md");
}

export function revisionFile(root: string, civId: string, worldYear: number, successorId: string): string {
  const name = `${String(worldYear).padStart(4, "0")}-后世修订-${successorId}.md`;
  return path.join(chronicleDir(root, civId), "revisions", name);
}

export function heritageFile(root: string, civId: string, predecessorId: string): string {
  return path.join(chronicleDir(root, civId), "heritage", `from-${predecessorId}.md`);
}

export function indexFile(root: string): string {
  return path.join(root, "world", "index.md");
}

export function timelinesFile(root: string): string {
  return path.join(root, "world", "timelines.json");
}

export function readmeFile(root: string): string {
  return path.join(root, "README.md");
}
