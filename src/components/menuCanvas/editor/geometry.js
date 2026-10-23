export function sortedNodes(page) {
  return [...(page?.nodes || [])].sort((a, b) => (a.z || 0) - (b.z || 0));
}

export function nextZ(page) {
  const max = (page?.nodes || []).reduce((m, n) => Math.max(m, n.z || 0), -1);
  return max + 1;
}

// Axis-aligned rectangle overlap (used for marquee hit-testing).
export function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

