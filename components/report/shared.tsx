import React, { useEffect, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { formatNumber } from '../../utils/format';
import { tr, TranslationKey } from '../../context/LanguageContext';

/* ─────────────────────────────────────────────────────────────────────────────
   HISOBOT — umumiy bo'laklar (2026-11-26 dizayn, olti maslahatchi).

   Bitta uslub hamma tabda: KPI qatori (katakchalar orasida ingichka chiziq),
   kartochka sarlavhasi, jadval katakchalari, grafik ranglari. Ilgari har tab
   o'z plitkasini chizardi — to'rt xil ko'rinish bitta ekranda.
   ───────────────────────────────────────────────────────────────────────────── */

export const fmt = (n: number | null | undefined) => formatNumber(Math.round(Number(n) || 0));

/** Grafik o'qi uchun qisqa son: 1 250 000 → «1,3 mln», 450 000 → «450 ming» */
export const compactMoney = (n: number): string => {
    const a = Math.abs(n);
    if (a >= 1e9) return `${(n / 1e9).toFixed(1).replace('.0', '').replace('.', ',')} ${tr('report.bn')}`;
    if (a >= 1e6) return `${(n / 1e6).toFixed(1).replace('.0', '').replace('.', ',')} ${tr('report.mln')}`;
    if (a >= 1e3) return `${Math.round(n / 1e3)} ${tr('report.thousand')}`;
    return String(Math.round(n));
};

/** 2026-10-01 → 01.10.2026 */
export const fmtDay = (iso: string) => { const [y, m, d] = String(iso).split('-'); return d ? `${d}.${m}.${y}` : iso; };

/* SERVER NOMLARI. Hisobot manba turini («Xizmatlar», «Dorilar» …) va
   bo'limsiz qatorni («Bo'limsiz») o'zbekcha nom bilan qaytaradi. Ekranda
   ular tildagi yorliqqa almashadi; noma'lum nom o'zicha qoladi. */
const SOURCE_KEYS: Record<string, TranslationKey> = {
    Service: 'inpatient.xizmatlar',
    Lab: 'settings.laboratoriya',
    Study: 'settings.diagnostika_2',
    Medication: 'inpatient.dorilar',
    Bed: 'ui.statsionar',
    Other: 'inpatient.boshqa',
};
export const sourceLabel = (reason: string, fallback: string) => (SOURCE_KEYS[reason] ? tr(SOURCE_KEYS[reason]) : fallback);
export const deptName = (n: string) => (n === "Bo'limsiz" ? tr('visit.noDept') : n === 'Belgilanmagan' ? tr('report.noDoctor') : n);
export const isNoDept = (n: string) => n === "Bo'limsiz";

/* ─── Mavzu: grafiklar uchun ranglar ─────────────────────────────────────
   Recharts SVG atributiga hex kutadi — CSS o'zgaruvchisi u yerda
   ishonchli emas. Shuning uchun mavzu `html.dark` dan kuzatiladi. */
export function useIsDark(): boolean {
    const read = () => typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
    const [dark, setDark] = useState(read);
    useEffect(() => {
        const obs = new MutationObserver(() => setDark(read()));
        obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
        return () => obs.disconnect();
    }, []);
    return dark;
}

export const chartTheme = (dark: boolean) => ({
    primary: dark ? '#5AA2E6' : '#005EB8',
    primarySoft: dark ? '#2B4F73' : '#B8D4EE',
    success: dark ? '#3DBE74' : '#007F31',
    warning: dark ? '#F0A23A' : '#C96F00',
    muted: dark ? '#5D6B76' : '#AEB7BD',
    axis: dark ? '#8A98A3' : '#768692',
    grid: dark ? 'rgba(255,255,255,0.07)' : 'rgba(33,43,50,0.08)',
});

/** Grafik ustidagi izoh — o'zimizniki: Recharts nikisi to'q mavzuda o'qilmaydi */
export const ChartTip: React.FC<any> = ({ active, payload, label, formatter, labelFormatter }) => {
    if (!active || !payload || !payload.length) return null;
    return (
        <div className="rounded-xl border border-line bg-surface px-3 py-2 shadow-lg text-xs min-w-[150px]">
            <div className="font-semibold text-ink mb-1">{labelFormatter ? labelFormatter(label) : label}</div>
            {payload.map((x: any) => (
                <div key={x.dataKey} className="flex items-center gap-2 py-0.5">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: x.color || x.stroke || x.fill }} />
                    <span className="text-muted">{x.name}</span>
                    <span className="ml-auto pl-3 font-semibold text-ink tabular-nums">{formatter ? formatter(x.value) : fmt(x.value)}</span>
                </div>
            ))}
        </div>
    );
};

/* ─── O'zgarish belgisi ──────────────────────────────────────────────────
   Rang ma'noga qarab: xarajat o'sishi — yomon (qizil), garchi strelka
   tepaga qarasa ham. O'tgan davr nol bo'lsa foiz yo'q — «o'tgan davrda
   yo'q» (ilgari hamma kartochkada «+6 450 000 (yangi)» turardi). */
export type Delta = { abs: number; pct: number | null } | null | undefined;

export const DeltaChip: React.FC<{ delta: Delta; previous?: number; goodUp: boolean }> = ({ delta, previous, goodUp }) => {
    if (!delta) return null;
    if (delta.abs === 0) {
        return (
            <span className="inline-flex items-center gap-1 text-[12px] font-medium text-faint">
                <Minus className="w-3.5 h-3.5" aria-hidden="true" />{tr('report.noChange')}
            </span>
        );
    }
    if (!previous) {
        return <span className="text-[12px] font-medium text-faint">{tr('report.noPrev')}</span>;
    }
    const up = delta.abs > 0;
    const good = up === goodUp;
    const Icon = up ? ArrowUpRight : ArrowDownRight;
    const text = delta.pct != null ? `${Math.abs(delta.pct)}%` : fmt(Math.abs(delta.abs));
    return (
        <span className={`inline-flex items-center gap-0.5 h-6 px-1.5 rounded-md text-[12px] font-semibold tabular-nums ${good
            ? 'bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-300'
            : 'bg-danger-50 text-danger-700 dark:bg-danger-500/15 dark:text-danger-300'}`}>
            <Icon className="w-3.5 h-3.5" aria-hidden="true" />
            <span className="sr-only">{up ? tr('report.up') : tr('report.down')} </span>{text}
        </span>
    );
};

/* ─── KPI qatori ─────────────────────────────────────────────────────────
   Bitta kartochka, ichida 3–4 katak, orasida ingichka chiziq. Har katak:
   yorliq → katta raqam → o'zgarish → izoh. Rang faqat ma'no uchun. */
export interface KpiItem {
    key: string;
    label: string;
    value: number | string;
    unit?: string;
    tone?: 'ok' | 'bad' | 'warn';
    delta?: React.ReactNode;
    hint?: React.ReactNode;
}

export const KpiStrip: React.FC<{ items: KpiItem[]; footer?: React.ReactNode }> = ({ items, footer }) => (
    <div className="card overflow-hidden">
        <div className={`grid grid-cols-2 ${items.length >= 4 ? 'xl:grid-cols-4' : 'lg:grid-cols-3'} gap-px bg-line-soft`}>
            {items.map(it => (
                <div key={it.key} data-kpi={it.key} className="bg-surface px-5 py-4 min-w-0">
                    <div className="flex items-center gap-2 min-h-[20px]">
                        <p className="text-[13px] font-medium text-muted truncate">{it.label}</p>
                    </div>
                    <div className="mt-1.5 flex items-baseline gap-2 flex-wrap">
                        <p data-kpi-value className={`text-[26px] leading-8 font-semibold tracking-tight tabular-nums ${it.tone === 'ok'
                            ? 'text-success-700 dark:text-success-300'
                            : it.tone === 'bad' ? 'text-danger-600 dark:text-danger-300'
                                : it.tone === 'warn' ? 'text-warning-700 dark:text-warning-300'
                                    : 'text-ink'}`}>
                            {typeof it.value === 'number' ? fmt(it.value) : it.value}
                            {it.unit && <span className="ml-1 text-[13px] font-medium text-faint tracking-normal">{it.unit}</span>}
                        </p>
                        {it.delta}
                    </div>
                    {it.hint && <div className="mt-1 text-[12px] text-faint leading-snug">{it.hint}</div>}
                </div>
            ))}
        </div>
        {footer && <div className="px-5 py-2 border-t border-line-soft text-[12px] text-faint">{footer}</div>}
    </div>
);

/** Kartochka sarlavhasi: nom, ixtiyoriy izoh, o'ng tomonda amal */
export const CardHead: React.FC<{ title: React.ReactNode; hint?: React.ReactNode; right?: React.ReactNode; id?: string }> = ({ title, hint, right, id }) => (
    <div className="flex flex-wrap items-start gap-x-4 gap-y-1 px-5 pt-4 pb-3">
        <div className="min-w-0">
            <h3 id={id} className="text-[15px] font-semibold text-ink">{title}</h3>
            {hint && <p className="text-[12px] text-faint mt-0.5">{hint}</p>}
        </div>
        {right && <div className="ml-auto flex items-center gap-3">{right}</div>}
    </div>
);

/** Jadval sarlavhasi va katagi — hamma tabda bir xil */
export const Th: React.FC<{ children?: React.ReactNode; right?: boolean; className?: string }> = ({ children, right, className = '' }) => (
    <th scope="col" className={`px-4 h-10 text-[12px] font-medium text-muted whitespace-nowrap ${right ? 'text-right' : 'text-left'} ${className}`}>
        {children}
    </th>
);

export const Td: React.FC<{ children?: React.ReactNode; right?: boolean; strong?: boolean; tone?: 'ok' | 'bad' | 'warn' | 'muted'; className?: string }> =
    ({ children, right, strong, tone, className = '' }) => (
        <td className={`px-4 h-11 text-sm ${right ? 'text-right tabular-nums whitespace-nowrap' : ''} ${strong ? 'font-semibold' : ''} ${tone === 'ok'
            ? 'text-success-700 dark:text-success-300'
            : tone === 'bad' ? 'text-danger-600 dark:text-danger-300'
                : tone === 'warn' ? 'text-warning-700 dark:text-warning-300'
                    : tone === 'muted' ? 'text-faint'
                        : 'text-ink'} ${className}`}>
            {children}
        </td>
    );

/** Hisoblanmoqda / bo'sh holat — hamma tabda bir xil */
export const Calculating: React.FC = () => (
    <div role="status" aria-busy="true" className="card py-16 text-center text-sm text-faint">{tr('finance.report.calculating')}</div>
);

export const Empty: React.FC<{ icon: React.ElementType; text: string }> = ({ icon: Icon, text }) => (
    <div className="card py-16 text-center">
        <Icon className="w-9 h-9 mx-auto text-faint mb-2" aria-hidden="true" />
        <p className="text-sm text-muted">{text}</p>
    </div>
);

/** Ulush chizig'i: qator ichida qiymatning umumga nisbati */
export const ShareBar: React.FC<{ value: number; max: number; color?: string }> = ({ value, max, color }) => (
    <div className="h-1.5 rounded-full bg-elevated overflow-hidden" aria-hidden="true">
        <div className="h-full rounded-full bg-primary-500/80" style={{ width: `${max > 0 && value > 0 ? Math.max(2, Math.min(100, (value / max) * 100)) : 0}%`, ...(color ? { backgroundColor: color } : {}) }} />
    </div>
);
