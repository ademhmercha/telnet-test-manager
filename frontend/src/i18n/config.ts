import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import enTranslation from './locales/en/translation.json';
import frTranslation from './locales/fr/translation.json';
import ptBRTranslation from './locales/pt-BR/translation.json';

const savedLang = localStorage.getItem('i18n_lang') || 'fr';

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: enTranslation },
      fr: { translation: frTranslation },
      'pt-BR': { translation: ptBRTranslation },
    },
    lng: savedLang,
    fallbackLng: 'fr',
    interpolation: {
      escapeValue: false,
    },
  });

// Persist language choice
i18n.on('languageChanged', (lng) => {
  localStorage.setItem('i18n_lang', lng);
});

export default i18n;
