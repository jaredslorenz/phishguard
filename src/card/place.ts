export interface AnchorRect {
  top: number;
  bottom: number;
  left: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Placement {
  top: number;
  left: number;
  side: "below" | "above";
}

const GAP = 8;
const MARGIN = 8;

/**
 * Where to put the card (viewport coordinates): below the link, left-aligned, flipped above when it
 * doesn't fit below, and clamped inside the viewport with a margin on every side.
 */
export function placeCard(anchor: AnchorRect, card: Size, viewport: Size): Placement {
  const below = anchor.bottom + GAP;
  const above = anchor.top - GAP - card.height;
  const fitsBelow = below + card.height <= viewport.height - MARGIN;
  const fitsAbove = above >= MARGIN;

  let side: Placement["side"] = "below";
  if (!fitsBelow && (fitsAbove || anchor.top > viewport.height - anchor.bottom)) side = "above";

  const maxTop = viewport.height - MARGIN - card.height;
  const top = Math.max(MARGIN, Math.min(side === "below" ? below : above, maxTop));

  const maxLeft = viewport.width - MARGIN - card.width;
  const left = Math.max(MARGIN, Math.min(anchor.left, maxLeft));

  return { top, left, side };
}
