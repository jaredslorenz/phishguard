import type { Analysis } from "./analyzer";
import type { StatsDelta } from "./stats";

export interface FlaggedLink {
  /** Lets the popup ask the page to scroll to this link (SHOW_LINK). Stable for the life of the element. */
  id: number;
  href: string;
  text: string;
  analysis: Analysis;
}

export type ContentToBackground = { type: "RESULTS"; flagged: number } | { type: "STATS_DELTA"; delta: StatsDelta };
export type PopupToContent = { type: "GET_RESULTS" } | { type: "SHOW_LINK"; id: number };
/** shown is false when the link is gone or hidden (closed menu, inactive slide), so there's nothing to scroll to. */
export type ShowLinkResult = { type: "SHOWN"; shown: boolean };
/** pageUrl lets the popup show and trust the current site without the "tabs" permission. */
export type ContentToPopup = { type: "RESULTS"; total: number; flagged: FlaggedLink[]; pageUrl: string };
export type PopupToBackground = { type: "RESET_STATS" };
