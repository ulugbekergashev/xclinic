import type { TranslationKey } from '../../i18n/translations';
import { FAMILY, Lang, SURGERIES, catalogLabel, isThinner, parseAnamnesis } from './anamnesisData';
import { historyLines, lineGroup, lineView } from './conditions';

/* Tibbiy tarix — QATORMA-QATOR MATN: chop etiladigan bemor kartasining
   «Anamnez» bandi uchun. Kartadagi blok bilan bir xil manbadan va bir xil
   tartibda; faqat so'ralgan bo'limlar tushadi. */

interface Input {
    historyText: string;
    anamnesisRaw?: string | null;
    /** `null` — allergiya yuklanmagan: qog'ozda «so'ralmagan» bilan adashmasin */
    allergies: { substance: string; severity?: string | null }[] | null;
    chronic: { code: string; name: string }[];
    female: boolean;
    lang: Lang;
    t: (key: TranslationKey) => string;
}

export const anamnesisLines = ({ historyText, anamnesisRaw, allergies, chronic, female, lang, t }: Input): string[] => {
    const d = parseAnamnesis(anamnesisRaw);
    const lines = historyLines(historyText);
    const view = (line: string) => {
        const v = lineView(line, lang, t);
        return v.code ? `${v.code} ${v.name}` : v.name;
    };
    const out: string[] = [];
    const add = (label: TranslationKey, values: string[], none?: boolean, noneKey?: TranslationKey) => {
        if (values.length) out.push(`${t(label)}: ${values.join('; ')}`);
        else if (none && noneKey) out.push(`${t(label)}: ${t(noneKey)}`);
    };

    if (allergies === null) out.push(`${t('anamnesis.s.allergies')}: ${t('ui.tarixni_yuklab_bolmadi')}`);
    else add('anamnesis.s.allergies',
        allergies.map(a => a.severity === 'Severe' ? `${a.substance} (${t('patienthistorypanel.ogir').toLowerCase()})` : a.substance),
        d.none?.allergies, 'anamnesis.none.allergies');
    const chronicCodes = new Set(chronic.map(c => c.code));
    add('anamnesis.conditions', [
        ...chronic.map(c => `${c.code} ${c.name}`),
        ...lines.filter(l => ['chronic', 'healthy'].includes(lineGroup(l)))
            .filter(l => { const c = lineView(l, lang, t).code; return !c || !chronicCodes.has(c); })
            .map(view),
    ]);
    add('anamnesis.s.meds', (d.meds || []).map(m => isThinner(m) ? `${m} (${t('anamnesis.thinner')})` : m),
        d.none?.meds, 'anamnesis.none.meds');
    add('anamnesis.s.surgeries', (d.surgeries || []).map(s => [catalogLabel(SURGERIES, s.name, lang), s.year].filter(Boolean).join(', ')),
        d.none?.surgeries, 'anamnesis.none.surgeries');
    add('anamnesis.s.family', (d.family || []).map(f => catalogLabel(FAMILY, f, lang)), d.none?.family, 'anamnesis.none.family');
    add('anamnesis.s.habits', [
        ...(d.smoking ? [t(`anamnesis.smoke.${d.smoking}`)] : []),
        ...(d.alcohol ? [t(`anamnesis.alcohol.${d.alcohol}`)] : []),
    ]);
    if (d.blood) {
        out.push(`${t('anamnesis.s.blood')}: ${d.blood === 'unknown' ? t('anamnesis.blood.unknown') : `${d.blood}${d.rh ? ` Rh${d.rh === '+' ? '+' : '−'}` : ''}`}`);
    }
    if (female) {
        add('anamnesis.s.pregnancy', [
            ...(d.pregnancy ? [t(`anamnesis.preg.${d.pregnancy}`)] : []),
            ...lines.filter(l => lineGroup(l) === 'pregnancy').map(view),
        ]);
    }
    add('anamnesis.s.infections', lines.filter(l => lineGroup(l) === 'infection').map(view),
        d.none?.infections, 'anamnesis.none.infections');
    return out;
};
