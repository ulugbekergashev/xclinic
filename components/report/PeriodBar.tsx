import React from 'react';
import { Download } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { todayISO, getCurrentMonthRange } from '../../utils/dateUtils';
import { dayLabel, weekLabel } from '../../utils/calendarLabels';

/* DAVR QATORI — butun Hisobotning bitta davri (2026-11-26).
   Ilgari Davomatda o'z «30 kun / 90 kun / 1 yil» tanlovi bor edi va
   bu qator o'sha tabda yashirinardi: Umumiy «Olindi 4,4 mln», Davomat
   «Tushum 19,1 mln» — ikki xil davr, bir xil ekran. Endi davr bitta.

   Katta sana — ekranning ko'rinadigan sarlavhasi (Kalendardagi kabi);
   «Hisobot» so'zi menyuda bor, h1 esa faqat ekran o'quvchi uchun. */

const isoOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parse = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1); };

export const periodPresets = (t: (k: any) => string) => {
    const now = new Date();
    const today = todayISO();
    const weekStart = new Date(now); weekStart.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevEnd = new Date(now.getFullYear(), now.getMonth(), 0);
    return [
        { key: 'today', label: t('card.today'), from: today, to: today },
        { key: 'week', label: t('report.week'), from: isoOf(weekStart), to: today },
        { key: 'month', label: t('cashbook.month'), from: getCurrentMonthRange().startDate, to: today },
        { key: 'prev', label: t('report.prevMonth'), from: isoOf(prevStart), to: isoOf(prevEnd) },
    ];
};

/** «1 – 26-noyabr 2026» / «26-noyabr, chorshanba» */
export const periodTitle = (from: string, to: string, lang: 'uz' | 'ru'): string => {
    if (!from || !to) return '';
    const a = parse(from), b = parse(to);
    if (from === to) return dayLabel(a, lang);
    /* Yil almashsa qisqa yozuv noaniq bo'ladi («28-dekabr – 3-yanvar 2027») */
    if (a.getFullYear() !== b.getFullYear()) return `${from.split('-').reverse().join('.')} – ${to.split('-').reverse().join('.')}`;
    return `${weekLabel(a, b, lang)} ${b.getFullYear()}`;
};

interface Props {
    from: string;
    to: string;
    onChange: (from: string, to: string) => void;
    onExport: () => void;
    exporting: boolean;
    /** Raqamlar yuklanayotganda eksport eski davrni olmasin */
    exportDisabled?: boolean;
}

/* Yilni qo'lda terishda brauzer oraliq qiymat beradi («0002-11-01»):
   har biri serverga beshta og'ir so'rov bo'lardi. Faqat to'liq sana. */
const sane = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && v >= '2000-01-01' && v <= '2100-12-31';

export const PeriodBar: React.FC<Props> = ({ from, to, onChange, onExport, exporting, exportDisabled }) => {
    const { t, language } = useLanguage();
    const presets = periodPresets(t);
    /* Oyning 1-kunida «Bugun» ham, «Oy» ham bir xil davr — faqat birinchisi tanlangan */
    const activePreset = presets.findIndex(p => from === p.from && to === p.to);
    const dateCls = 'h-9 px-2 bg-transparent text-sm text-ink tabular-nums outline-none rounded-lg focus-visible:ring-2 focus-visible:ring-primary-500/30';

    return (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
            <p className="text-2xl font-semibold tracking-tight text-ink mr-auto" aria-live="polite">
                {periodTitle(from, to, language === 'ru' ? 'ru' : 'uz')}
            </p>

            <div role="group" aria-label={t('report.periodPresets')} className="flex items-center gap-0.5 p-1 rounded-xl bg-elevated/70">
                {presets.map((p, i) => {
                    const on = i === activePreset;
                    return (
                        <button key={p.key} type="button" aria-pressed={on} onClick={() => onChange(p.from, p.to)}
                            className={`h-8 px-3 rounded-lg text-sm transition-colors ${on ? 'bg-surface text-ink font-semibold shadow-sm' : 'text-muted hover:text-ink font-medium'}`}>
                            {p.label}
                        </button>
                    );
                })}
            </div>

            <div className="flex items-center h-10 px-1 rounded-xl border border-line bg-surface">
                <input type="date" value={from} max={to || undefined} aria-label={t('finance.report.from')}
                    onChange={e => sane(e.target.value) && onChange(e.target.value, to < e.target.value ? e.target.value : to)} className={dateCls} />
                <span className="text-faint px-0.5" aria-hidden="true">–</span>
                <input type="date" value={to} min={from || undefined} aria-label={t('finance.report.to')}
                    onChange={e => sane(e.target.value) && onChange(from > e.target.value ? e.target.value : from, e.target.value)} className={dateCls} />
            </div>

            <button type="button" onClick={onExport} disabled={exporting || exportDisabled} title={t('finance.report.exportHint')}
                className="h-10 px-3.5 inline-flex items-center gap-2 rounded-xl border border-line bg-surface text-sm font-medium text-ink hover:bg-elevated disabled:opacity-50 transition-colors">
                <Download className="w-4 h-4 text-muted" aria-hidden="true" />
                {exporting ? t('report.exporting') : 'Excel'}
                <span className="sr-only">— {t('finance.report.exportHint')}</span>
            </button>
        </div>
    );
};
