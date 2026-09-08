import React, { useState, useEffect, useCallback } from 'react';
import { formatDate } from '../utils/format';
import { TrendingUp, TrendingDown, Minus, FlaskConical, AlertTriangle } from 'lucide-react';
import { api } from '../services/api';

/* ─────────────────────────────────────────────────────────────────────────────
   TAHLIL DINAMIKASI.

   MUAMMO. Bitta gemoglobin qiymati kam narsa aytadi. Ma'nosi O'ZGARISHDA:
   130 → 118 → 98 — bu qon yo'qotish. Hozir natijalar faqat o'z buyurtmasi
   ichida ko'rinadi, ya'ni shifokor uch buyurtmani ketma-ket ochib, raqamlarni
   yodda solishtirishi kerak (GAP-ANALYSIS, 2-sahna, 5-band).

   NIMA UCHUN JADVAL, KATTA GRAFIK EMAS. Shifokorga bir qarashda kerak
   bo'lgan narsa: qiymat, norma va YO'NALISH. Har ko'rsatkich uchun katta
   grafik chizish ekranni to'ldiradi va o'qishni qiyinlashtiradi. Grafik
   faqat tanlangan ko'rsatkich uchun ochiladi.
   ───────────────────────────────────────────────────────────────────────────── */

interface Props {
    patientId: string;
}

const fmtDate = (v?: string | null) => {
    if (!v) return '—';
    try { return formatDate(v); }
    catch { return String(v).slice(0, 10); }
};

/** Norma matni — "120–150" yoki bir tomonli */
const refText = (low?: number | null, high?: number | null) => {
    if (low != null && high != null) return `${low}–${high}`;
    if (high != null) return `< ${high}`;
    if (low != null) return `> ${low}`;
    return '—';
};

export const LabDynamics: React.FC<Props> = ({ patientId }) => {
    const [series, setSeries] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [open, setOpen] = useState('');

    const load = useCallback(async () => {
        if (!patientId) return;
        try {
            setSeries(await api.clinical.labDynamics(patientId));
            setError('');
        } catch (e: any) {
            setError(e?.message || 'Dinamika yuklanmadi');
        } finally { setLoading(false); }
    }, [patientId]);

    useEffect(() => { load(); }, [load]);

    if (loading) {
        return (
            <div className="bg-surface rounded-xl border border-line p-4">
                <div className="h-4 w-40 bg-elevated rounded animate-pulse" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
                <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
                <p className="text-sm text-red-700 dark:text-red-300 flex-1">{error}</p>
                <button onClick={load} className="text-sm font-medium text-red-700 dark:text-red-300 hover:underline">
                    Qayta
                </button>
            </div>
        );
    }

    if (series.length === 0) {
        return (
            <div className="bg-surface rounded-xl border border-line p-6 text-center">
                <FlaskConical className="w-8 h-8 mx-auto text-faint mb-2" />
                <p className="text-sm text-muted">Raqamli tahlil natijasi yo'q</p>
                <p className="text-[11px] text-faint mt-1">
                    Dinamika faqat raqamli ko'rsatkichlardan quriladi: matnli natijalar
                    ("salbiy", "topilmadi") bu yerga tushmaydi.
                </p>
            </div>
        );
    }

    return (
        <div className="bg-surface rounded-xl border border-line overflow-hidden">
            <div className="px-4 py-3 border-b border-line-soft flex items-center gap-2">
                <FlaskConical className="w-4 h-4 text-faint" />
                <h3 className="text-sm font-bold text-ink">Tahlil dinamikasi</h3>
                <span className="text-xs text-faint">({series.length} ko'rsatkich)</span>
            </div>

            <div className="divide-y divide-line">
                {series.map(s => {
                    const bad = s.lastFlag && s.lastFlag !== 'Normal';
                    const isOpen = open === s.parameterId;
                    return (
                        <div key={s.parameterId}>
                            <button
                                onClick={() => setOpen(isOpen ? '' : s.parameterId)}
                                disabled={s.count < 2}
                                className="w-full px-4 py-2.5 flex flex-wrap items-center gap-3 text-left hover:bg-elevated disabled:hover:bg-transparent transition-colors">
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm text-ink truncate">
                                        {s.name}
                                        {s.unit ? <span className="text-faint font-normal"> · {s.unit}</span> : null}
                                    </p>
                                    <p className="text-[11px] text-faint">
                                        norma {refText(s.refLow, s.refHigh)}
                                        {' · '}{s.count} o'lchov
                                        {s.count < 2 ? ' (taqqoslash uchun yetarli emas)' : ''}
                                        {' · '}{fmtDate(s.lastAt)}
                                    </p>
                                </div>

                                {/* Yo'nalish: oxirgi ikki o'lchov orasidagi farq */}
                                {s.delta != null && s.delta !== 0 && (
                                    <span className={`flex items-center gap-0.5 text-xs tabular-nums ${s.delta > 0 ? 'text-red-500' : 'text-blue-500'}`}>
                                        {s.delta > 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                                        {s.delta > 0 ? '+' : ''}{s.delta}
                                    </span>
                                )}
                                {s.delta === 0 && <Minus className="w-3.5 h-3.5 text-faint" />}

                                <span className={`text-sm font-bold tabular-nums shrink-0 ${bad
                                    ? s.lastFlag === 'High' ? 'text-red-600 dark:text-red-400' : 'text-blue-600 dark:text-blue-400'
                                    : 'text-ink'}`}>
                                    {s.last}
                                    {s.lastFlag === 'High' ? ' ↑' : s.lastFlag === 'Low' ? ' ↓' : ''}
                                </span>
                            </button>

                            {/* Grafik faqat ochilganda: ekranni raqamlar to'ldirmasin */}
                            {isOpen && s.points.length > 1 && (
                                <div className="px-4 pb-3">
                                    <Sparkline points={s.points} refLow={s.refLow} refHigh={s.refHigh} />
                                    <div className="flex flex-wrap gap-2 mt-2">
                                        {s.points.slice(-8).map((p: any, i: number) => (
                                            <span key={i}
                                                className={`px-1.5 py-0.5 rounded text-[10px] tabular-nums ${p.flag && p.flag !== 'Normal'
                                                    ? 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300'
                                                    : 'bg-elevated text-muted'}`}>
                                                {p.value} <span className="opacity-60">{fmtDate(p.at)}</span>
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

/** Kichik grafik: norma yo'lagi va qiymat chizig'i */
const Sparkline: React.FC<{ points: any[]; refLow?: number | null; refHigh?: number | null }> = ({ points, refLow, refHigh }) => {
    const vals = points.map(p => p.value);
    /* Miqyosga norma chegaralari ham kiradi: aks holda hamma qiymat
       norma ichida bo'lsa chiziq yo'lakdan tashqarida ko'rinardi. */
    const all = [...vals, ...(refLow != null ? [refLow] : []), ...(refHigh != null ? [refHigh] : [])];
    const min = Math.min(...all);
    const max = Math.max(...all);
    const span = max - min || 1;
    const W = 100, H = 30, PAD = 2;

    const x = (i: number) => PAD + (i / Math.max(1, points.length - 1)) * (W - PAD * 2);
    const y = (v: number) => H - PAD - ((v - min) / span) * (H - PAD * 2);

    const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(2)},${y(p.value).toFixed(2)}`).join(' ');

    return (
        <div className="overflow-x-auto">
            <div className="min-w-[280px]">
                <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-20" preserveAspectRatio="none">
                    {/* Norma yo'lagi */}
                    {refLow != null && refHigh != null && (
                        <rect x={0} y={y(refHigh)} width={W} height={Math.max(0.5, y(refLow) - y(refHigh))}
                            fill="currentColor" className="text-emerald-500" opacity="0.12" />
                    )}
                    <path d={d} fill="none" stroke="#2563EB" strokeWidth="0.7" vectorEffect="non-scaling-stroke" />
                    {points.map((p, i) => (
                        <circle key={i} cx={x(i)} cy={y(p.value)} r="0.9"
                            fill={p.flag && p.flag !== 'Normal' ? '#DC2626' : '#2563EB'} />
                    ))}
                </svg>
            </div>
        </div>
    );
};
