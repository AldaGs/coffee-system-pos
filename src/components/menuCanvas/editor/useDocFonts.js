import { useEffect, useState } from 'react';
import { syncDocFonts, docFontLoadSpecs } from '../../../utils/canvasDocument';

// Konva measures text when it draws, so a web font that arrives later leaves
// text mis-measured. Load the document's fonts, then bump the returned epoch;
// text nodes key on it to remount with the right metrics.
export function useDocFonts(doc) {
  const [fontEpoch, setFontEpoch] = useState(0);
  const fontsKey = JSON.stringify(doc.fonts || []);
  useEffect(() => {
    syncDocFonts(doc);
    const specs = docFontLoadSpecs(doc);
    if (typeof document === 'undefined' || !document.fonts || specs.length === 0) return;
    let active = true;
    Promise.all(specs.map((s) => document.fonts.load(s).catch(() => {})))
      .then(() => { if (active) setFontEpoch((e) => e + 1); });
    return () => { active = false; };
    // Reload only when the declared fonts change, not on every edit to the document.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fontsKey]);
  return fontEpoch;
}
