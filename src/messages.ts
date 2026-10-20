import type { Analysis } from "./analyzer";

export interface FlaggedLink {
  href: string;
  text: string;
  analysis: Analysis;
}

export type ContentToBackground = { type: "RESULTS"; flagged: number };
export type PopupToContent = { type: "GET_RESULTS" };
export type ContentToPopup = { type: "RESULTS"; total: number; flagged: FlaggedLink[] };
