
import i18next from 'i18next';
import en from '../../locales/en.json' with { type: 'json' };
import ja from '../../locales/ja.json' with { type: 'json' };

await i18next.init({
  lng: 'en', // default language
  fallbackLng: 'en',
  resources: {
    en: {
      translation: en,
    },
    ja: {
      translation: ja,
    },
  },
});

export default i18next;
