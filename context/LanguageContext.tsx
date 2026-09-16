import React, { createContext, useContext, useState, useEffect } from 'react';
import { translations, Language, TranslationKey } from '../i18n/translations';
export type { Language, TranslationKey };

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: TranslationKey) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>('uz');

  useEffect(() => {
    const savedLang = localStorage.getItem('app_language') as Language;
    if (savedLang && (savedLang === 'uz' || savedLang === 'ru')) {
      setLanguageState(savedLang);
    }
  }, []);

  const setLanguage = (lang: Language) => {
    const changed = lang !== language;
    setLanguageState(lang);
    localStorage.setItem('app_language', lang);
    /* Modul darajasidagi jadvallar (to'lov usullari, rollar, holatlar)
       `tr()` bilan yuklanganda bir marta o'qiladi. Til almashganda ular
       eskicha qolmasin — sahifa qayta yuklanadi; HashRouter marshrutni
       saqlaydi. */
    if (changed) window.location.reload();
  };

  const t = (key: TranslationKey): string => {
    return translations[language][key] || key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

/* HOOK'SIZ TARJIMA — modul darajasidagi jadvallar uchun.

   `useLanguage()` faqat komponent ichida ishlaydi. Lekin to'lov usullari,
   rollar, tahlil holatlari kabi yorliqlar modul darajasidagi jadvallarda
   yashaydi va ular hook chaqira olmaydi. Ilgari shu sababdan ular
   o'zbekcha qotib qolgan edi: rus rejimida «Naqd», «Shifokor», «Tayyor».

   Til `localStorage` dan o'qiladi — `LanguageProvider` aynan shu kalitni
   yozadi, ya'ni manba bitta. Har chaqiruvda o'qiladi (kesh yo'q): til
   almashganda butun daraxt qayta chiziladi va yangi qiymat keladi.
   Jadvalda SATR emas, KALIT saqlansin va yorliq ishlatilgan joyda
   `tr(key)` bilan olinsin. */
export const tr = (key: TranslationKey): string => {
    let lang: Language = 'uz';
    try {
        const saved = localStorage.getItem('app_language');
        if (saved === 'ru' || saved === 'uz') lang = saved;
    } catch { /* localStorage yopiq — o'zbekcha */ }
    return (translations[lang] as Record<string, string>)[key] || translations.uz[key] || key;
};

/** `{0}`, `{1}` o'rnini to'ldiradi: fill(t('x.y'), n, name). RU da tartib boshqacha bo'lishi mumkin. */
export const fill = (s: string, ...args: Array<string | number | null | undefined>): string =>
    args.reduce<string>((acc, a, i) => acc.split(`{${i}}`).join(a == null ? '' : String(a)), s);

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};
