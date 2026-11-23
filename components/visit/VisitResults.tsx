import React, { useCallback, useState } from 'react';
import { Check } from 'lucide-react';
import { MODALITY_LABELS, Visit } from '../../types';
import { useLanguage, fill } from '../../context/LanguageContext';
import { formatTime } from '../../utils/format';
import { LabValues, LabValuesStatus } from './LabValues';

/* ── SHU QABULNING NATIJALARI ────────────────────────────────────────────────
   «Tahlil va tekshiruv» blokida, o'sha buyurtmalarning ustida (2026-11-20 gacha
   varaqning eng tepasida edi va pastdagi «Natija tayyor» qatori bilan
   ikki joyda turardi). Ilgari natija varaqda yo'q edi —
   «Natija tayyor» degan yozuv bor edi, qiymatning o'zi esa Laboratoriya
   bo'limida.

   «Ko'rdim» — tugma, avtomatik emas: kim va qachon tanishgani jurnalda
   qolishi kerak. U YAKUNLANGAN qabulda ham ishlaydi: natija ko'pincha
   bemor ketgandan keyin keladi («baribir yakunlash») va uni ko'rmasdan
   qoldirib bo'lmaydi. Ko'rilmagan natija hammaga shunday deb ko'rinadi. */

const FLOOR: React.CSSProperties = {
    backgroundImage: 'radial-gradient(rgba(0,127,59,0.1) 1px, transparent 1.4px)',
    backgroundSize: '16px 16px',
};

interface Props {
    visit: Visit;
    busy: boolean;
    /** Natijani «ko'rdim» deb belgilay oladimi — shifokor va ega */
    canMark: boolean;
    onMarkSeen: (kind: 'lab' | 'study', id: string) => void;
}

const SeenMark: React.FC<{
    seen: boolean; canMark: boolean; busy: boolean;
    /** Natijaning o'zi ekranda — ko'rinmagan narsani «ko'rdim» deb bo'lmaydi */
    shown: boolean;
    onMark: () => void;
}> = ({ seen, canMark, busy, shown, onMark }) => {
    const { t } = useLanguage();
    if (seen) {
        return (
            <span className="shrink-0 inline-flex items-center gap-1 text-[10.5px] font-bold text-emerald-700 dark:text-emerald-400">
                <Check className="w-3 h-3" aria-hidden="true" />{t('visit.resultSeen')}
            </span>
        );
    }
    if (!canMark) {
        return <span className="shrink-0 text-[10.5px] font-bold text-amber-700 dark:text-amber-400">{t('visit.resultUnseen')}</span>;
    }
    return (
        <button type="button" onClick={onMark} disabled={busy || !shown}
            className="shrink-0 h-6 px-2 rounded-md bg-surface border border-emerald-300 dark:border-emerald-800 text-[11px] font-bold text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 disabled:opacity-50">
            {t('visit.sawIt')}
        </button>
    );
};

export const VisitResults: React.FC<Props> = ({ visit, busy, canMark, onMarkSeen }) => {
    const { t } = useLanguage();
    const [loaded, setLoaded] = useState<Record<string, LabValuesStatus>>({});
    const onStatus = useCallback(
        (orderId: string, status: LabValuesStatus) => setLoaded(m => (m[orderId] === status ? m : { ...m, [orderId]: status })),
        [],
    );

    const labs = (visit.labOrders || []).filter(o => o.status === 'Completed');
    const studies = (visit.studies || []).filter(s => s.status === 'Completed');
    if (labs.length === 0 && studies.length === 0) return null;

    const latest = [...labs.map(o => o.completedAt), ...studies.map(s => s.performedAt)]
        .filter((x): x is string => !!x).sort().pop();
    const title = latest ? fill(t('visit.resultsTabAt'), formatTime(latest)) : t('visit.resultsTab');

    return (
        <section aria-label={t('visit.resultsTab')} style={FLOOR}
            className="rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/60 dark:bg-emerald-950/20 px-3.5 py-3 flex flex-col gap-2.5">
            <span className="text-[13px] font-semibold text-emerald-800 dark:text-emerald-300">
                {title}
            </span>

            {labs.map(o => (
                <div key={o.id} className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 text-xs font-medium text-muted truncate">
                            {(o.items || []).map(i => i.testName).join(' · ') || t('visit.tabLab')}
                        </span>
                        <SeenMark seen={!!o.seenByDoctorAt} canMark={canMark} busy={busy}
                            shown={loaded[o.id] === 'ready'} onMark={() => onMarkSeen('lab', o.id)} />
                    </div>
                    {/* Bitta ustun: blok endi varaqning yarmida, ikki ustunga joy yo'q */}
                    <LabValues orderId={o.id} refreshKey={o.completedAt} onStatus={onStatus} />
                </div>
            ))}

            {studies.map(s => (
                <div key={s.id} className="flex items-start gap-2">
                    <p className="min-w-0 flex-1 text-[12.5px] text-ink">
                        <b className="font-semibold">{MODALITY_LABELS[s.modality] || s.modality} — {s.name}.</b>{' '}
                        <span className="text-muted">{s.conclusion || s.findings || t('visit.resultReady')}</span>
                    </p>
                    <SeenMark seen={!!s.seenByDoctorAt} canMark={canMark} busy={busy} shown onMark={() => onMarkSeen('study', s.id)} />
                </div>
            ))}
        </section>
    );
};
