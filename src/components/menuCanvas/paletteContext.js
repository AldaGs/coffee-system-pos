// Shared swatch palette for the canvas editor's color pickers. The editor
// provides the per-document palette (doc.palette) + mutators; ColorPicker
// consumes it to render reusable swatches. Default is empty so ColorPicker
// stays unchanged anywhere a provider isn't mounted.
import { createContext } from 'react';

export const PaletteContext = createContext({
  palette: [],
  addSwatch: () => {},
  removeSwatch: () => {}
});
