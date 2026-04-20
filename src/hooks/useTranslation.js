import { useMenuStore } from '../store/useMenuStore';
import { translations } from '../utils/translations';

export const useTranslation = () => {
  const { getPosSettings } = useMenuStore();
  
  // Grab the language from settings, default to English if not set yet
  const lang = getPosSettings()?.language || 'en';

  // The 't' function takes a key (e.g., "admin.analytics") and returns the correct string
  const t = (key) => {
    return translations[lang]?.[key] || translations['en']?.[key] || key;
  };

  return { t, lang };
};