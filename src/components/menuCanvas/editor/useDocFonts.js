import { useEffect, useEffectEvent, useState } from 'react';
import { syncDocFonts, docFontLoadSpecs } from '../../../utils/canvasDocument';

// Konva measures text when it draws, so a web font that arrives later leaves
// text mis-measured. Load the document's fonts, then bump the returned epoch;
// text nodes key on it to remount with the right metrics.
export function useDocFonts(doc) {
  const [fontEpoch, setFontEpoch] = useState(0);
  const fontsKey = JSON.stringify(doc.fonts || []);
  // Reads the latest doc, but only reloads when the declared fonts change, not on every edit.
  const loadFonts = useEffectEvent(() => {
    syncDocFonts(doc);
    const specs = docFontLoadSpecs(doc);
    if (typeof document === 'undefined' || !document.fonts || specs.length === 0) return null;
    return Promise.all(specs.map((s) => document.fonts.load(s).catch(() => {})));
  });
  useEffect(() => {
    let active = true;
    loadFonts()?.then(() => { if (active) setFontEpoch((e) => e + 1); });
    return () => { active = false; };
  }, [fontsKey]);
  return fontEpoch;
}
