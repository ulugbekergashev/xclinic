import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Button } from './Common';
import { api } from '../services/api';
import { toast } from '../services/toast';
import { confirmAction } from '../services/confirm';
import { formatMoney } from '../utils/format';
import {
    ChevronLeft, ChevronRight, Loader2, Check, ArrowRight, Archive, ChevronDown,
} from 'lucide-react';
import { Payroll } from '../pages/Payroll';
import { Doctor } from '../types';

/* ─────────────────────────────────────────────────────────────────────────────
   ULUSH — OY BO'YICHA JADVAL.

   NIMA O'ZGARDI. Ilgari bu yerda VEDOMOST turardi: davr tanlanadi, hujjat
   yaratiladi, tasdiqlanadi, keyin qatorma-qator to'lanadi. To'rt qadam, va
   ularning uchtasi buxgalteriya marosimi — «kimga qancha tegadi» degan
   oddiy savolga javob olish uchun hujjat yaratish kerak edi.

   Endi: oy tanlanadi, jadval chiqadi, to'lash bir bosish. To'lovning o'zi
   xodim kartasida bo'ladi — pul har doim bitta joydan chiqadi va u yerda
   bonus bilan jarima ham hisobga olinadi.

   VEDOMOST BEKOR QILINMADI. U ishlab turgan klinikalarda qoldi va u orqali
   pul to'langan bo'lishi mumkin. Shuning uchun:

     · pastdagi «Eski vedomostlar» — arxiv, yopiq holda turadi;
     · jadvalda «vedomost orqali to'langan» ALOHIDA ustun bo'lib ko'rinadi,
       jimgina ayrilmaydi.

   DAVR — OY. Ilgari u «oy boshidan bugungacha» edi va raqam yarim oylik
   chiqardi: 9-sentabrda ochilgan ekran 01.09–09.09 ni ko'rsatardi va
   «nega bunchalik kam?» degan savol tug'ilardi.
   ───────────────────────────────────────────────────────────────────────────── */

const MONTHS = ['Yan', 'Fev', 'Mar', 'Apr', 'May', 'Iyn', 'Iyl', 'Avg', 'Sen', 'Okt', 'Noy', 'Dek'];

const periodLabel = (p: string) => {
    const [y, m] = p.split('-').map(Number);
    return `${MONTHS[(m || 1) - 1]} ${y}`;
};

const shiftPeriod = (p: string, delta: number) => {
    const [y, m] = p.split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 1 + delta, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

const thisPeriod = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

interface Props {
    doctors?: Doctor[];
    clinicId?: string;
    addToast?: (type: 'success' | 'error' | 'info', msg: string) => void;
}

export const DoctorShares: React.FC<Props> = ({ doctors = [], clinicId, addToast }) => {
    const navigate = useNavigate();
    const [period, setPeriod] = useState(thisPeriod());
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState('');
    const [showArchive, setShowArchive] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            setData(await api.hr.shares(period));
        } catch (e: any) {
            toast.error(e?.data?.error || e?.message || 'Ulush hisobi olinmadi');
            setData(null);
        } finally {
            setLoading(false);
        }
    }, [period]);

    useEffect(() => { load(); }, [load]);

    const payOne = async (row: any) => {
        if (!await confirmAction({
            title: `${row.name} — ${periodLabel(period)} uchun ${formatMoney(row.payable)} to'lansinmi?`,
            body: "Pul kassadan xarajat bo'lib chiqadi. To'langan oy keyin o'zgartirilmaydi.",
            confirmLabel: "To'lash",
        })) return;
        setBusy(row.id);
        try {
            await api.hr.pay('DOCTOR', row.id, { period, method: 'Cash' });
            addToast?.('success', `${row.name} — to'landi`);
            await load();
        } catch (e: any) {
            toast.error(e?.data?.error || e?.message || "To'lab bo'lmadi");
        } finally {
            setBusy('');
        }
    };

    /* Hammasiga to'lash — KETMA-KET. Bitta so'rovda yuborilsa, o'rtada
       xato chiqqanda qaysi biri to'langani noaniq qolardi. Har biri
       o'zining xarajat yozuvi bilan chiqadi. */
    const payAll = async () => {
        const rows = (data?.rows || []).filter((r: any) => r.payable > 0);
        if (!rows.length) return;
        if (!await confirmAction({
            title: `${rows.length} ta shifokorga jami ${formatMoney(data.totals.payable)} to'lansinmi?`,
            body: 'Har biri alohida xarajat bo\'lib yoziladi. Bonus va jarima xodim kartasida hisobga olinadi.',
            confirmLabel: "Hammasiga to'lash",
        })) return;

        setBusy('all');
        let done = 0;
        const failed: string[] = [];
        for (const r of rows) {
            try {
                await api.hr.pay('DOCTOR', r.id, { period, method: 'Cash' });
                done++;
            } catch (e: any) {
                failed.push(`${r.name}: ${e?.data?.error || e?.message || 'xato'}`);
            }
        }
        setBusy('');
        await load();
        if (failed.length) {
            toast.error(`${done} ta to'landi, ${failed.length} tasi yiqildi — ${failed[0]}`);
        } else {
            addToast?.('success', `${done} ta shifokorga to'landi`);
        }
    };

    const rows = data?.rows || [];
    const stats = data?.stats;

    return (
        <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 className="text-lg font-bold text-ink">Shifokor ulushi</h2>
                    <p className="text-sm text-muted">
                        Ulush kassaga TUSHGAN puldan hisoblanadi — qarzga yozilgan ish kirmaydi
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={() => setPeriod(p => shiftPeriod(p, -1))} aria-label="Oldingi oy"
                        className="p-2 rounded-lg border border-line text-muted hover:text-primary-600">
                        <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="px-3 text-sm font-bold text-ink tabular-nums min-w-[92px] text-center">
                        {periodLabel(period)}
                    </span>
                    <button onClick={() => setPeriod(p => shiftPeriod(p, 1))} aria-label="Keyingi oy"
                        className="p-2 rounded-lg border border-line text-muted hover:text-primary-600">
                        <ChevronRight className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {data && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="rounded-xl border border-line p-4">
                        <p className="text-xs text-muted">Hisoblangan</p>
                        <p className="text-2xl font-bold tabular-nums text-ink mt-1">
                            {formatMoney(data.totals.accrued)}
                        </p>
                    </div>
                    <div className="rounded-xl border border-line p-4">
                        <p className="text-xs text-muted">To'langan</p>
                        <p className="text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400 mt-1">
                            {formatMoney(data.totals.paid)}
                        </p>
                    </div>
                    <div className="rounded-xl border border-line p-4 flex items-center justify-between gap-3">
                        <div>
                            <p className="text-xs text-muted">To'lanadi</p>
                            <p className="text-2xl font-bold tabular-nums text-ink mt-1">
                                {formatMoney(data.totals.payable)}
                            </p>
                        </div>
                        {data.totals.payable > 0 && (
                            <Button size="sm" onClick={payAll} disabled={!!busy}>
                                {busy === 'all' ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Hammasiga'}
                            </Button>
                        )}
                    </div>
                </div>
            )}

            <Card className="overflow-hidden">
                {loading ? (
                    <div className="py-16 text-center text-faint">
                        <Loader2 className="w-5 h-5 animate-spin inline" />
                    </div>
                ) : rows.length === 0 ? (
                    <div className="py-16 text-center text-muted">Shifokor yo'q</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left text-xs text-muted border-b border-line">
                                    <th className="py-3 px-4 font-medium">Shifokor</th>
                                    <th className="py-3 px-4 font-medium text-right">Hisoblangan</th>
                                    <th className="py-3 px-4 font-medium text-right">Vedomost orqali</th>
                                    <th className="py-3 px-4 font-medium text-right">To'lanadi</th>
                                    <th className="py-3 px-4 font-medium w-40"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((r: any) => (
                                    <tr key={r.id} className="border-b border-line last:border-0">
                                        <td className="py-3 px-4">
                                            <button onClick={() => navigate(`/staff/DOCTOR/${r.id}`)}
                                                className="text-left hover:text-primary-600">
                                                <span className="block font-medium text-ink">{r.name}</span>
                                                {r.specialty && (
                                                    <span className="block text-xs text-faint">{r.specialty}</span>
                                                )}
                                            </button>
                                        </td>
                                        <td className="py-3 px-4 text-right tabular-nums text-ink">
                                            {r.accrued ? formatMoney(r.accrued) : <span className="text-faint">—</span>}
                                            {r.itemCount > 0 && (
                                                <span className="block text-[11px] text-faint">{r.itemCount} qator</span>
                                            )}
                                        </td>
                                        <td className="py-3 px-4 text-right tabular-nums text-amber-600 dark:text-amber-400">
                                            {r.paidViaRuns ? formatMoney(r.paidViaRuns) : <span className="text-faint">—</span>}
                                        </td>
                                        <td className="py-3 px-4 text-right tabular-nums font-bold text-ink">
                                            {r.closed
                                                ? <span className="text-emerald-600 dark:text-emerald-400 font-normal text-xs">
                                                    to'langan {formatMoney(r.paid)}
                                                </span>
                                                : r.payable ? formatMoney(r.payable) : <span className="text-faint font-normal">—</span>}
                                        </td>
                                        <td className="py-3 px-4 text-right">
                                            {r.closed ? (
                                                <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                                                    <Check className="w-3.5 h-3.5" /> yopilgan
                                                </span>
                                            ) : r.payable > 0 ? (
                                                <Button size="sm" variant="secondary"
                                                    onClick={() => payOne(r)} disabled={!!busy}>
                                                    {busy === r.id
                                                        ? <Loader2 className="w-4 h-4 animate-spin" />
                                                        : <>To'lash <ArrowRight className="w-3.5 h-3.5 ml-1" /></>}
                                                </Button>
                                            ) : null}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Card>

            {/* Nega bo'sh — SABAB bilan. Ilgari ekran «ulush yo'q» deb turardi
                va foydalanuvchi sababini o'zi topishi kerak edi: davrda
                to'lov bo'lmaganmi, yoki to'lov bor-u shifokori
                ko'rsatilmaganmi. Ikkinchisi — tuzatilishi kerak bo'lgan xato. */}
            {!loading && stats && data.totals.accrued === 0 && (
                <div className="rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/60 dark:bg-amber-900/10 p-4 text-sm">
                    <p className="font-medium text-amber-800 dark:text-amber-300">
                        {periodLabel(period)} da hisoblanadigan ulush yo'q
                    </p>
                    <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
                        {stats.payments === 0
                            ? 'Bu oyda kassaga umuman to\'lov tushmagan.'
                            : stats.skippedNoDoctor > 0
                                ? `${stats.payments} ta to'lovdan ${stats.skippedNoDoctor} tasida shifokor ko'rsatilmagan (${formatMoney(stats.skippedNoDoctorSum)}). Bu pul hech kimga tegishli emas — hisob qatorida shifokor tanlanishi kerak.`
                                : 'To\'lovlar bor, lekin ular ulushga kirmaydi (bekor qilingan yoki foizi nol).'}
                    </p>
                </div>
            )}

            <p className="text-xs text-muted">
                To'lov xodim kartasida ham bor — u yerda bonus va jarima bilan birga hisoblanadi.
                Bu yerdagi tugma o'sha amalni bajaradi.
            </p>

            {/* ── Eski vedomostlar: ARXIV ────────────────────────────────── */}
            <div className="rounded-xl border border-line overflow-hidden">
                <button type="button" onClick={() => setShowArchive(v => !v)}
                    className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-elevated">
                    <Archive className="w-4 h-4 text-faint" />
                    <span className="text-sm font-medium text-ink flex-1">Eski vedomostlar</span>
                    <span className="text-xs text-faint">
                        {showArchive ? 'yopish' : 'ochish'}
                    </span>
                    <ChevronDown className={`w-4 h-4 text-faint transition-transform ${showArchive ? 'rotate-180' : ''}`} />
                </button>
                {showArchive && (
                    <div className="border-t border-line p-4">
                        <p className="text-xs text-muted mb-4">
                            Vedomost — davr uchun hujjat. U ish oqimidan chiqdi, lekin ilgari
                            tuzilganlari saqlanadi va ular orqali to'langan pul yuqoridagi
                            jadvalda «Vedomost orqali» ustunida ko'rinadi.
                        </p>
                        <Payroll doctors={doctors} clinicId={clinicId} addToast={addToast} />
                    </div>
                )}
            </div>
        </div>
    );
};
