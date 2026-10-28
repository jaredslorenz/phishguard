import type { Analysis } from "./analyzer";
import type { StatsDelta } from "./stats";

export interface FlaggedLink {
  href: string;
  text: string;
  analysis: Analysis;
}

export type ContentToBackground = { type: "RESULTS"; flagged: number } | { type: "STATS_DELTA"; delta: StatsDelta };
export type PopupToContent = { type: "GET_RESULTS" };
/** pageUrl lets the popup show and trust the current site without the "tabs" permission. */
export type ContentToPopup = { type: "RESULTS"; total: number; flagged: FlaggedLink[]; pageUrl: string };
export type PopupToBackground = { type: "RESET_STATS" };
