import { createContext } from 'react';

// Admin provides (sectionId) => void that jumps to that Help article. Outside
// Admin (e.g. Register's HelpModal) there is no provider, so InfoTip shows no
// "Learn more" link.
export const HelpLinkContext = createContext(null);
