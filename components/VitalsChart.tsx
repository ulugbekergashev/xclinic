/* ─────────────────────────────────────────────────────────────────────────────
   Harorat varag'i — grafik.

   MUAMMO. Ko'rsatkichlar `InpatientRound.vitalSigns` JSON matnida yotardi va
   ularni faqat obxod yozuvida, satr sifatida ko'rish mumkin edi. Statsionarda
   esa haroratning bir necha kunlik EGRI CHIZIG'I tashxisning bir qismi:
   "kechqurun ko'tarilib, ertalab tushadi" degan naqsh raqamlar ro'yxatidan
   ko'rinmaydi (GAP-ANALYSIS B51).

   Nima uchun o'z SVG si, kutubxona emas: offline dastur, grafik kutubxonasi
   ~100 KB qo'shadi, bu yerda esa kerak bo'lgan narsa — ikki chiziq va nuqtalar.
   ───────────────────────────────────────────────────────────────────────────── */

import React, { useMemo } from 'react';
import { formatDateShort } from '../utils/format';
import { Activity } from 'lucide-react';

interface Props {
    /** VitalSign yozuvlari: kind, value, measuredAt */
    vitals: any[];
}

const SERIES = [
    { kind: 'Temp', label: 'Harorat', color: '#DC2626', unit: '°C', min: 35, max: 41 },
    { kind: 'Pulse', label: 'Puls', color: '#2563EB', unit: 'urish/min', min: 40, max: 140 },
];

export const VitalsChart: React.FC<Props> = ({ vitals }) => {
    const data = useMemo(() => {
        const out: Record<string, { t: number; v: number; at: string }[]> = {};
        for (const s of SERIES) out[s.kind] = [];
        for (const v of vitals) {
            if (!out[v.kind]) continue;
            const t = new Date(v.measuredAt).getTime();
            if (!isFinite(t)) continue;
            out[v.kind].push({ t, v: Number(v.value), at: v.measuredAt });
        }
        for (const k of Object.keys(out)) out[k].sort((a, b) => a.t - b.t);
        return out;
    }, [vitals]);

    const bounds = useMemo(() => {
        const all = SERIES.flatMap(s => data[s.kind] || []);
        if (all.length === 0) return null;
        const from = Math.min(...all.map(p => p.t));
        const to = Math.max(...all.map(p => p.t));
        // Bitta o'lchov bo'lsa oraliq nol bo'ladi — nuqta o'rtada turadi
        return { from, to, span: Math.max(1, to - from) };
    }, [data]);

    const bp = useMemo(() => {
        const sys = vitals.filter(v => v.kind === 'BpSys').sort((a, b) => +new Date(a.measuredAt) - +new Date(b.measuredAt));
        const dia = vitals.filter(v => v.kind === 'BpDia').sort((a, b) => +new Date(a.measuredAt) - +new Date(b.measuredAt));
        return sys.map((s, i) => ({
            at: s.measuredAt, sys: s.value, dia: dia[i]?.value ?? null,
        })).slice(-6).reverse();
    }, [vitals]);

    if (!bounds) {
        return (
            <div className="text-center py-6 border border-dashed border-gray-300 dark:border-gray-600 rounded-lg">
                <Activity className="w-6 h-6 mx-auto text-gray-300 dark:text-gray-600 mb-1" />
                <p className="text-xs text-gray-400">
                    O'lchov yo'q. Obxodda harorat va pulsni kiritsangiz, grafik shu yerda chiziladi.
                </p>
            </div>
        );
    }

    // Grafik koordinatalari: 100x40 birlik, keyin viewBox cho'zadi
    const W = 100, H = 40, PAD = 2;
    const xOf = (t: number) => PAD + ((t - bounds.from) / bounds.span) * (W - PAD * 2);

    return (
        <div>
            {/* Tor ekranda gorizontal siljiydi — sahifa o'zi cho'zilmaydi */}
            <div className="overflow-x-auto">
                <div className="min-w-[420px]">
                    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-32" preserveAspectRatio="none">
                        {/* Normal harorat chizig'i — ko'z uchun tayanch */}
                        {(() => {
                            const s = SERIES[0];
                            const y = H - PAD - ((37 - s.min) / (s.max - s.min)) * (H - PAD * 2);
                            return <line x1={0} y1={y} x2={W} y2={y} stroke="#9CA3AF" strokeWidth="0.2" strokeDasharray="1 1" />;
                        })()}

                        {SERIES.map(s => {
                            const pts = data[s.kind] || [];
                            if (pts.length === 0) return null;
                            const yOf = (v: number) => {
                                const clamped = Math.max(s.min, Math.min(s.max, v));
                                return H - PAD - ((clamped - s.min) / (s.max - s.min)) * (H - PAD * 2);
                            };
                            const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${xOf(p.t).toFixed(2)},${yOf(p.v).toFixed(2)}`).join(' ');
                            return (
                                <g key={s.kind}>
                                    <path d={d} fill="none" stroke={s.color} strokeWidth="0.6" vectorEffect="non-scaling-stroke" />
                                    {pts.map((p, i) => (
                                        <circle key={i} cx={xOf(p.t)} cy={yOf(p.v)} r="0.7" fill={s.color} />
                                    ))}
                                </g>
                            );
                        })}
                    </svg>
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-4 mt-2">
                {SERIES.map(s => {
                    const pts = data[s.kind] || [];
                    if (pts.length === 0) return null;
                    const last = pts[pts.length - 1];
                    return (
                        <span key={s.kind} className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300">
                            <span className="w-3 h-0.5 rounded" style={{ backgroundColor: s.color }} />
                            {s.label}: <b className="tabular-nums">{last.v}</b> {s.unit}
                            <span className="text-gray-400">({pts.length} o'lchov)</span>
                        </span>
                    );
                })}
            </div>

            {bp.length > 0 && (
                <div className="mt-3">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
                        Qon bosimi
                    </p>
                    <div className="flex flex-wrap gap-2">
                        {bp.map((b, i) => (
                            <span key={i} className="px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-xs tabular-nums text-gray-700 dark:text-gray-200">
                                {b.sys}{b.dia != null ? `/${b.dia}` : ''}
                                <span className="text-gray-400 ml-1">
                                    {formatDateShort(b.at)}
                                </span>
                            </span>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};
