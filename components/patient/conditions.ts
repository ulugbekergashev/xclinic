import type { TranslationKey } from '../../i18n/translations';
import type { Label, Lang } from './anamnesisData';

/* ─────────────────────────────────────────────────────────────────────────────
   ANAMNEZDAGI TAYYOR KASALLIKLAR.

   `value` — bazaga yoziladigan satr (`Patient.medicalHistory`). Birinchi 15
   tasi ATAYLAB eski ko'rinishida qoldirilgan: klinikaning bazasida aynan shu
   satrlar turibdi, va yangi tugma eski yozuvni «belgilangan» deb tanishi
   kerak. Ekranda esa satr emas, oddiy nom chiqadi — «GIPERTONIYA
   (DAVLENIYA)-I 11.0» emas, «Gipertoniya».

   Keyingilari (2026-11-21) — «NOM (KOD)» ko'rinishida; MKB-10 qidiruvidan
   qo'shilgan kasallik ham shu ko'rinishda yoziladi (`codedLine`).

   `group` — kartadagi qaysi qatorda turadi: yuqumli kasalliklar va
   homiladorlik «Kasalliklari» qatorida emas, o'z qatorida.

   `aliases` — rus tilidagi interfeysda ilgari yozilgan variantlar: uchta
   tugma tarjimadan o'tardi va bazaga ruscha satr tushardi.
   ───────────────────────────────────────────────────────────────────────────── */

export type ConditionGroup = 'chronic' | 'infection' | 'pregnancy' | 'healthy';

export interface CommonCondition {
    value: string;
    /** MKB-10 kodi — tugmada ko'rinadi */
    code?: string;
    labelKey?: TranslationKey;
    label?: Label;
    group: ConditionGroup;
    aliases?: string[];
}

export const COMMON_CONDITIONS: CommonCondition[] = [
    { value: "SOG'LOM(SHIKOYATI YO'Q )", labelKey: 'anamnesis.c.healthy', group: 'healthy', aliases: ['ЗДОРОВ (ЖАЛОБ НЕТ)'] },
    { value: 'GIPERTONIYA (DAVLENIYA)-I 11.0', code: 'I11.0', labelKey: 'anamnesis.c.hypertension', group: 'chronic' },
    {
        value: 'SURUNKALI YURAK ISHEMIK KASALLIGI -I 25.9', code: 'I25.9', labelKey: 'anamnesis.c.ihd', group: 'chronic',
        aliases: ['ХРОНИЧЕСКАЯ ИШЕМИЧЕСКАЯ БОЛЕЗНЬ СЕРДЦА - I 25.9'],
    },
    { value: 'MIOKARD INFARKTI-I 21.9', code: 'I21.9', labelKey: 'anamnesis.c.infarction', group: 'chronic' },
    { value: 'YURAK RITMI BUZILISHI (I49.9)', code: 'I49.9', label: { uz: 'Aritmiya', ru: 'Аритмия' }, group: 'chronic' },
    { value: 'YURAK YETISHMOVCHILIGI (I50.9)', code: 'I50.9', label: { uz: 'Yurak yetishmovchiligi', ru: 'Сердечная недостаточность' }, group: 'chronic' },
    { value: "INSULT O'TKAZGAN (I69.4)", code: 'I69.4', label: { uz: "Insult o'tkazgan", ru: 'Перенесённый инсульт' }, group: 'chronic' },
    {
        value: 'SURUNKALI REVMATIZM-I 09.8', code: 'I09.8', labelKey: 'anamnesis.c.rheumatism', group: 'chronic',
        aliases: ['ХРОНИЧЕСКИЙ РЕВМАТИЗМ - I 09.8'],
    },
    { value: 'QANDLI DIABET(SHAKAR)-E 10.9', code: 'E10.9', labelKey: 'anamnesis.c.diabetes1', group: 'chronic' },
    { value: 'QANDLI DIABET(SHAKAR)-E 11.9', code: 'E11.9', labelKey: 'anamnesis.c.diabetes2', group: 'chronic' },
    { value: 'GIPOTIREOZ (E03.9)', code: 'E03.9', label: { uz: 'Gipotireoz', ru: 'Гипотиреоз' }, group: 'chronic' },
    { value: "BO'QOQ (E04.9)", code: 'E04.9', label: { uz: "Bo'qoq", ru: 'Зоб' }, group: 'chronic' },
    { value: 'SEMIZLIK (E66.9)', code: 'E66.9', label: { uz: 'Semizlik', ru: 'Ожирение' }, group: 'chronic' },
    { value: 'RAHIT-E 55.9', code: 'E55.9', labelKey: 'anamnesis.c.rickets', group: 'chronic' },
    { value: 'BRONXIAL ASTMA (J45.9)', code: 'J45.9', label: { uz: 'Bronxial astma', ru: 'Бронхиальная астма' }, group: 'chronic' },
    { value: 'SURUNKALI BRONXIT (J42)', code: 'J42', label: { uz: 'Surunkali bronxit', ru: 'Хронический бронхит' }, group: 'chronic' },
    { value: 'SURUNKALI GASTRIT (K29.5)', code: 'K29.5', label: { uz: 'Surunkali gastrit', ru: 'Хронический гастрит' }, group: 'chronic' },
    { value: 'OSHQOZON YARASI (K25.9)', code: 'K25.9', label: { uz: 'Oshqozon yarasi', ru: 'Язва желудка' }, group: 'chronic' },
    { value: 'SURUNKALI BUYRAK KASALLIGI (N18.9)', code: 'N18.9', label: { uz: 'Surunkali buyrak kasalligi', ru: 'Хроническая болезнь почек' }, group: 'chronic' },
    { value: 'EPILEPSIYA (G40.9)', code: 'G40.9', label: { uz: 'Epilepsiya', ru: 'Эпилепсия' }, group: 'chronic' },
    { value: 'QON IVISHI BUZILISHI (D68.9)', code: 'D68.9', label: { uz: 'Qon ivishi buzilishi', ru: 'Нарушение свёртываемости крови' }, group: 'chronic' },
    { value: 'KAMQONLIK (D50.9)', code: 'D50.9', label: { uz: 'Kamqonlik', ru: 'Анемия' }, group: 'chronic' },
    { value: 'ONKOLOGIK KASALLIK (C80.9)', code: 'C80.9', label: { uz: 'Onkologik kasallik', ru: 'Онкологическое заболевание' }, group: 'chronic' },
    // ── Yuqumli
    { value: 'GEPATIT A-B.15', code: 'B15', labelKey: 'anamnesis.c.hepatitisA', group: 'infection' },
    { value: 'GEPATIT B-B.16', code: 'B16', labelKey: 'anamnesis.c.hepatitisB', group: 'infection' },
    { value: 'GEPATIT C (B18.2)', code: 'B18.2', label: { uz: 'Gepatit C', ru: 'Гепатит C' }, group: 'infection' },
    { value: 'OITS -B.20', code: 'B20', labelKey: 'anamnesis.c.hiv', group: 'infection' },
    { value: 'TUBERKULOZ(SIL)-A.15.0', code: 'A15.0', labelKey: 'anamnesis.c.tuberculosis', group: 'infection' },
    // ── Homiladorlik — eski yozuvlar uchun; yangisi `anamnesis.pregnancy` da
    { value: 'HOMILADORLIK-Z 32.1', code: 'Z32.1', labelKey: 'anamnesis.c.pregnancy', group: 'pregnancy' },
    { value: 'TASDIQLANMAGAN HOMILADORLIK-Z 32.0', code: 'Z32.0', labelKey: 'anamnesis.c.pregnancyUnconfirmed', group: 'pregnancy' },
];

/** Bo'shliq va harf kattaligi farqi bitta kasallikni ikkiga ajratmasin */
const normalize = (text: string): string => text.toUpperCase().replace(/\s+/g, ' ').trim();

const BY_TEXT = new Map<string, CommonCondition>(
    COMMON_CONDITIONS.flatMap(c => [c.value, ...(c.aliases || [])].map(text => [normalize(text), c] as const)),
);

/** Satr tayyor ro'yxatdagi kasallikmi */
export const conditionOf = (line: string): CommonCondition | undefined => BY_TEXT.get(normalize(line));

/** Tayyor kasallikning nomi — tarjima kaliti yoki ichki yorlig'idan */
export const conditionLabel = (c: CommonCondition, lang: Lang, t: (key: TranslationKey) => string): string =>
    c.labelKey ? t(c.labelKey) : c.label ? c.label[lang] : c.value;

/** MKB-10 qidiruvidan qo'shilgan kasallik: «Bronxial astma (J45.9)» */
export const codedLine = (name: string, code: string): string => `${name.trim()} (${code.trim()})`;

const CODED = /^(.*\S)\s*\(([A-Z]\d{2}(?:\.\d{1,2})?)\)$/;

/** Satr → ko'rinadigan nom va kod. Tayyor ro'yxatdagisi chiroyli nomi bilan. */
export const lineView = (line: string, lang: Lang, t: (key: TranslationKey) => string): { name: string; code?: string } => {
    const known = conditionOf(line);
    if (known) return { name: conditionLabel(known, lang, t), code: known.code };
    const m = CODED.exec(line.trim());
    return m ? { name: m[1], code: m[2] } : { name: line };
};

/** Satr qaysi qatorga tegishli. Qo'lda yozilgani — oddiy kasallik. */
export const lineGroup = (line: string): ConditionGroup => conditionOf(line)?.group || 'chronic';

/** Matn → satrlar: bo'shlari va takrorlari tashlanadi */
export const historyLines = (text: string): string[] => {
    const seen = new Set<string>();
    return (text || '').split('\n').map(line => line.trim()).filter(line => {
        const key = normalize(line);
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
    });
};

export const withLine = (text: string, line: string): string => {
    const lines = historyLines(text);
    const key = normalize(line);
    return lines.some(existing => normalize(existing) === key) ? lines.join('\n') : [...lines, line.trim()].join('\n');
};

export const withoutLine = (text: string, line: string): string => {
    const key = normalize(line);
    return historyLines(text).filter(existing => normalize(existing) !== key).join('\n');
};

/** Kasallik tugmasini bosish: bor bo'lsa olinadi (taxalluslari bilan), yo'q bo'lsa qo'shiladi */
export const toggleCondition = (text: string, c: CommonCondition): string => {
    const lines = historyLines(text);
    return lines.some(line => conditionOf(line) === c)
        ? lines.filter(line => conditionOf(line) !== c).join('\n')
        : withLine(text, c.value);
};
