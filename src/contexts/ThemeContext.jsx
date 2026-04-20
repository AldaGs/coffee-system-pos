import { createContext, useEffect, useContext } from 'react';

const ThemeContext = createContext();

export const useTheme = () => useContext(ThemeContext);

export const ThemeProvider = ({ children }) => {

  // Global function to update theme that ANY component can call
  const updateTheme = (posSettings) => {
    if (!posSettings) return;

    // 1. Update Tab Title
    const registerName = posSettings.name || "Main Register";
    document.title = `${registerName} | TinyPOS`;

    // 2. Update Favicon/Boot Logo
    const favicon = document.querySelector("link[rel~='icon']");
    if (favicon) {
      favicon.href = posSettings.appBootLogo || '/icon-192.png';
    }

    // 3. Inject Brand Color
    if (posSettings.brandColor) {
       document.documentElement.style.setProperty('--brand-color', posSettings.brandColor);
    }

    // 4. Toggle Dark Mode
    if (posSettings.isDarkMode) {
      document.body.classList.add('dark-mode');
    } else {
      document.body.classList.remove('dark-mode');
    }
  };

  // On initial app boot, grab the logo from local storage instantly
  useEffect(() => {
    const bootLogo = localStorage.getItem('tinypos_boot_logo');
    if (bootLogo) {
      let link = document.querySelector("link[rel~='icon']");
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
      }
      link.href = bootLogo;
    }
  }, []);

  return (
    <ThemeContext.Provider value={{ updateTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};