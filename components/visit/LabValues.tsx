import React, { useCallback, useEffect, useState } from 'react';
import { LabOrderItem, LabResultRow } from '../../types';
import { api } from '../../services/api';
import { useLanguage } from '../../context/LanguageContext';
import { rangeMark } from '../../utils/labRange';

/* Bitta yo'llanmaning natijalari — ko'rsatkich, qiymat, me'yor yo'lagi.

   Qabul varag'ida ham (bugungi natija), tarix lentasida ham (eski natija)
   shu komponent turadi: natija ikki joyda ikki xil ko'rinmasin. Normalar
   bemorning jinsi va yoshiga moslab serverda tanlanadi
   (`GET /api/lab-orders/:id/results`). */

export type LabValuesStatus = 'loading' | 'ready' | 'failed';

const toneOf = (flag?: string | null) =>
    flag === 'High' ? 'text-red-600 dark:text-red-400'
        : flag === 'Low' ? 'text-blue-600 dark:text-blue-400'
            : 'text-ink';
const dotOf = (flag?: string | null) =>
    flag === 'High' ? 'bg-red-600' : flag === 'Low' ? 'bg-blue-600' : 'bg-emerald-600';
const arrowOf = (flag?: string | null) => (flag === 'High' ? ' ↑' : flag === 'Low' ? ' ↓' : '');

const refOf = (r: LabResultRow): string => {
    if (r.refText) return r.refText;
    const low = r.refLow ?? null;
    const high = r.refHigh ?? null;
    if (low !== null && high !== null) return `${low} – ${high}`;
    if (high !== null) return `< ${high}`;
    if (low !== null) return `> ${low}`;
    return '';
};

/* BAYROQ VA ME'YOR — IKKI BOSHQA PAYTDAN. Bayroq («baland», «past») natija
   KIRITILGANDA hisoblanib saqlanadi; me'yor oralig'i esa har o'qishda
   bemorning HOZIRGI yoshi va jinsi bo'yicha qayta tanlanadi. Bola o'sib
   boshqa yosh guruhiga o'tsa yoki laboratoriya me'yorni tahrirlasa, eski
   natijada ikkalasi bir-biriga zid chiqadi: qizil «baland» belgisi yashil
   yo'lak ichida turadi.

   Bunday qatorda yo'lak ham, me'yor ham CHIZILMAYDI — faqat qiymat va
   kiritilgan paytdagi bayroq: noto'g'ri rasmdan ko'ra rasmsiz yaxshi. */
const agreesWithRange = (r: LabResultRow): boolean => {
    if (r.valueNum === null || r.valueNum === undefined) return true;
    const low = r.refLow ?? null;
    const high = r.refHigh ?? null;
    const byRange = low !== null && r.valueNum < low ? 'Low' : high !== null && r.valueNum > high ? 'High' : 'Normal';
    return byRange === (r.flag || 'Normal');
};

interface Props {
    orderId: string;
    /** O'zgarsa natija qayta o'qiladi (masalan yo'llanma yakunlangan vaqt) */
    refreshKey?: string | null;
    /** Keng joyda ikki ustun */
    twoColumns?: boolean;
    /** Tor joyda (tarix lentasi) yo'lakcha chizilmaydi — ko'rsatkich nomi kesilmasin */
    compact?: boolean;
    /** Natija o'qildimi — «Ko'rdim» faqat ko'ringan natijaga bosiladi */
    onStatus?: (orderId: string, status: LabValuesStatus) => void;
}

export const LabValues: React.FC<Props> = ({ orderId, refreshKey, twoColumns = false, compact = false, onStatus }) => {
    const { t } = useLanguage();
    const [rows, setRows] = useState<LabResultRow[] | null>(null);
    const [failed, setFailed] = useState(false);
    const [attempt, setAttempt] = useState(0);

    const report = useCallback((status: LabValuesStatus) => onStatus?.(orderId, status), [onStatus, orderId]);

    // Boshqa yo'llanma — eski qatorlar bir lahza ham ko'rinmasin
    useEffect(() => { setRows(null); }, [orderId]);

    useEffect(() => {
        let alive = true;
        setFailed(false);
        report('loading');
        api.labResults.get(orderId)
            .then(order => {
                if (!alive) return;
                const items: LabOrderItem[] = order?.items || [];
                setRows(items.flatMap(i => (i.parameters || []).filter(p => p.value !== '' && p.value !== null && p.value !== undefined)));
                report('ready');
            })
            .catch(() => { if (alive) { setFailed(true); report('failed'); } });
        return () => { alive = false; };
    }, [orderId, refreshKey, attempt, report]);

    if (failed) {
        return (
            <p role="alert" className="text-xs text-red-600 dark:text-red-400">
                {t('ui.tarixni_yuklab_bolmadi')}{' '}
                <button type="button" onClick={() => setAttempt(n => n + 1)} className="font-bold underline">{t('ui.qayta_urinish')}</button>
            </p>
        );
    }
    if (rows === null) {
        return (
            <div role="status" aria-label={t('common.loading')} className="space-y-1.5 py-1">
                <div className="h-3 w-3/4 rounded bg-elevated animate-pulse" />
                <div className="h-3 w-1/2 rounded bg-elevated animate-pulse" />
            </div>
        );
    }
    if (rows.length === 0) return <p className="text-xs text-muted">{t('card.tl.noResults')}</p>;

    return (
        <ul className={`grid gap-x-7 ${twoColumns ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'}`}>
            {rows.map(r => {
                const consistent = agreesWithRange(r);
                const mark = consistent && !compact ? rangeMark(r.valueNum, r.refLow, r.refHigh) : null;
                return (
                    <li key={r.parameterId} className="flex items-center gap-2.5 min-h-[30px]">
                        <span className="flex-1 min-w-0 text-[12.5px] font-semibold text-ink truncate">{r.name}</span>
                        <span className={`text-[13px] font-bold tabular-nums whitespace-nowrap ${toneOf(r.flag)}`}>
                            {r.value}{r.unit ? ` ${r.unit}` : ''}{arrowOf(r.flag)}
                        </span>
                        {mark && (
                            <span aria-hidden="true" className="relative w-16 h-1.5 shrink-0 rounded-full bg-elevated">
                                <span className="absolute inset-y-0 rounded-full bg-emerald-600/35"
                                    style={{ left: `${mark.bandLeft}%`, right: `${100 - mark.bandRight}%` }} />
                                <span className={`absolute top-1/2 w-2.5 h-2.5 -mt-[5px] -ml-[5px] rounded-full border-2 border-surface ${dotOf(r.flag)}`}
                                    style={{ left: `${mark.pos}%` }} />
                            </span>
                        )}
                        {/* Tor ekranda me'yor matni yashirinadi — yo'lakcha o'sha narsani ko'rsatadi, nom esa kesilmasin */}
                        <span className="hidden sm:block w-[76px] shrink-0 text-[10.5px] font-semibold text-muted whitespace-nowrap truncate">
                            {consistent ? refOf(r) : ''}
                        </span>
                    </li>
                );
            })}
        </ul>
    );
};
