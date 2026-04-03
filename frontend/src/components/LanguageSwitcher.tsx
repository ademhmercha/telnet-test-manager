import React from 'react';
import { useTranslation } from 'react-i18next';

const LANGS = [
  { code: 'fr',    label: 'FR', title: 'Français' },
  { code: 'en',    label: 'EN', title: 'English'  },
  { code: 'pt-BR', label: 'PT', title: 'Português (BR)' },
];

const LanguageSwitcher: React.FC = () => {
  // @ts-ignore
  const { i18n } = useTranslation();
  const current = i18n.language;

  return (
    <div className="lang-switcher">
      {LANGS.map(lang => (
        <button
          key={lang.code}
          className={`lang-btn ${current === lang.code ? 'lang-btn-active' : ''}`}
          onClick={() => i18n.changeLanguage(lang.code)}
          title={lang.title}
        >
          {lang.label}
        </button>
      ))}
    </div>
  );
};

export default LanguageSwitcher;
