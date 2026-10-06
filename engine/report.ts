import type { ExtinctionVerdict } from "./extinction.ts";

export interface RecordedEvent {
  month: number;
  id: string;
  title: string;
  category: string;
  level: string;
}

export interface YearSummary {
  births: number;
  deaths: number;
  foodStart: number;
  foodEnd: number;
  foodProduced: number;
  foodConsumed: number;
  goodsStart: number;
  goodsEnd: number;
  goodsCrafted: number;
  healthStart: number;
  healthEnd: number;
  orderStart: number;
  orderEnd: number;
  buildingsStart: number;
  buildingsEnd: number;
}

export interface YearDreamReport {
  tag: string;
  text: string;
  brought: string;
}

export interface YearReport {
  civId: string;
  year: number;
  populationBefore: number;
  populationAfter: number;
  events: RecordedEvent[];
  namingNotes: string[];
  dream: YearDreamReport;
  extinction: ExtinctionVerdict | null;
  summary: YearSummary;
  steps: string[];
  chronicle: string;
}
