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

import { useLanguage, fill } from '../context/LanguageContext';
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
    const { t } = useLanguage();
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
            toast.error(e?.data?.error || e?.message || t('doctorshares.ulush_hisobi_olinmadi'));
            setData(null);
        } finally {
            setLoading(false);
        }
    }, [period]);

    useEffect(() => { load(); }, [load]);

    const payOne = async (row: any) => {
        if (!await confirmAction({
            title: fill(t('doctorshares.x_x_uchun_x'), row.name, periodLabel(period), formatMoney(row.payable)),
            body: t('ui.pul_kassadan_xarajat_bolib'),
            confirmLabel: t('ui.tolash_2'),
        })) return;
        setBusy(row.id);
        try {
            await api.hr.pay('DOCTOR', row.id, { period, method: 'Cash' });
            addToast?.('success', fill(t('doctorshares.x_tolandi'), row.name));
            await load();
        } catch (e: any) {
            toast.error(e?.data?.error || e?.message || t('ui.tolab_bolmadi'));
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
            title: fill(t('doctorshares.x_ta_shifokorga_jami'), rows.length, formatMoney(data.totals.payable)),
            body: t('doctorshares.har_biri_alohida_xarajat'),
            confirmLabel: t('doctorshares.hammasiga_tolash'),
        })) return;

        setBusy('all');
        let done = 0;
        const failed: string[] = [];
        for (const r of rows) {
            try {
                await api.hr.pay('DOCTOR', r.id, { period, method: 'Cash' });
                done++;
            } catch (e: any) {
                failed.push(`${r.name}: ${e?.data?.error || e?.message || t('doctorshares.xato')}`);
            }
        }
        setBusy('');
        await load();
        if (failed.length) {
            toast.error(`${done} ta to'landi, ${failed.length} tasi yiqildi — ${failed[0]}`);
        } else {
            addToast?.('success', fill(t('doctorshares.x_ta_shifokorga_tolandi'), done));
        }
    };

    const rows = data?.rows || [];
    const stats = data?.stats;

    return (
        <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 className="text-lg font-bold text-ink">{t('ui.shifokor_ulushi')}</h2>
                    <p className="text-sm text-muted">
                        {t('doctorshares.ulush_kassaga_tushgan_puldan')}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={() => setPeriod(p => shiftPeriod(p, -1))} aria-label={t('finance.cash.prevMonth')}
                        className="p-2 rounded-lg border border-line text-muted hover:text-primary-600">
                        <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="px-3 text-sm font-bold text-ink tabular-nums min-w-[92px] text-center">
                        {periodLabel(period)}
                    </span>
                    <button onClick={() => setPeriod(p => shiftPeriod(p, 1))} aria-label={t('finance.cash.nextMonth')}
                        className="p-2 rounded-lg border border-line text-muted hover:text-primary-600">
                        <ChevronRight className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {data && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="rounded-xl border border-line p-4">
                        <p className="text-xs text-muted">{t('ui.hisoblangan')}</p>
                        <p className="text-2xl font-bold tabular-nums text-ink mt-1">
                            {formatMoney(data.totals.accrued)}
                        </p>
                    </div>
                    <div className="rounded-xl border border-line p-4">
                        <p className="text-xs text-muted">{t('ui.tolangan')}</p>
                        <p className="text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400 mt-1">
                            {formatMoney(data.totals.paid)}
                        </p>
                    </div>
                    <div className="rounded-xl border border-line p-4 flex items-center justify-between gap-3">
                        <div>
                            <p className="text-xs text-muted">{t('doctorshares.tolanadi')}</p>
                            <p className="text-2xl font-bold tabular-nums text-ink mt-1">
                                {formatMoney(data.totals.payable)}
                            </p>
                        </div>
                        {data.totals.payable > 0 && (
                            <Button size="sm" onClick={payAll} disabled={!!busy}>
                                {busy === 'all' ? <Loader2 className="w-4 h-4 animate-spin" /> : t('doctorshares.hammasiga')}
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
                    <div className="py-16 text-center text-muted">{t('doctorshares.shifokor_yoq')}</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left text-xs text-muted border-b border-line">
                                    <th className="py-3 px-4 font-medium">{t('common.doctor')}</th>
                                    <th className="py-3 px-4 font-medium text-right">{t('ui.hisoblangan')}</th>
                                    <th className="py-3 px-4 font-medium text-right">{t('doctorshares.vedomost_orqali')}</th>
                                    <th className="py-3 px-4 font-medium text-right">{t('doctorshares.tolanadi')}</th>
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
                                                <span className="block text-[11px] text-faint">{r.itemCount} {t('ui.qator')}</span>
                                            )}
                                        </td>
                                        <td className="py-3 px-4 text-right tabular-nums text-amber-600 dark:text-amber-400">
                                            {r.paidViaRuns ? formatMoney(r.paidViaRuns) : <span className="text-faint">—</span>}
                                        </td>
                                        <td className="py-3 px-4 text-right tabular-nums font-bold text-ink">
                                            {r.closed
                                                ? <span className="text-emerald-600 dark:text-emerald-400 font-normal text-xs">
                                                    {t('visit.paidShort')} {formatMoney(r.paid)}
                                                </span>
                                                : r.payable ? formatMoney(r.payable) : <span className="text-faint font-normal">—</span>}
                                        </td>
                                        <td className="py-3 px-4 text-right">
                                            {r.closed ? (
                                                <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                                                    <Check className="w-3.5 h-3.5" /> {t('ui.yopilgan')}
                                                </span>
                                            ) : r.payable > 0 ? (
                                                <Button size="sm" variant="secondary"
                                                    onClick={() => payOne(r)} disabled={!!busy}>
                                                    {busy === r.id
                                                        ? <Loader2 className="w-4 h-4 animate-spin" />
                                                        : <>{t('ui.tolash')} <ArrowRight className="w-3.5 h-3.5 ml-1" /></>}
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
                        {periodLabel(period)} {t('doctorshares.da_hisoblanadigan_ulush_yoq')}
                    </p>
                    <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
                        {stats.payments === 0
                            ? t('doctorshares.bu_oyda_kassaga_umuman')
                            : stats.skippedNoDoctor > 0
                                ? fill(t('doctorshares.x_ta_tolovdan_x'), stats.payments, stats.skippedNoDoctor, formatMoney(stats.skippedNoDoctorSum))
                                : t('doctorshares.tolovlar_bor_lekin_ular')}
                    </p>
                </div>
            )}

            <p className="text-xs text-muted">
                {t('doctorshares.tolov_xodim_kartasida_ham')}
            </p>

            {/* ── Eski vedomostlar: ARXIV ────────────────────────────────── */}
            <div className="rounded-xl border border-line overflow-hidden">
                <button type="button" onClick={() => setShowArchive(v => !v)}
                    className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-elevated">
                    <Archive className="w-4 h-4 text-faint" />
                    <span className="text-sm font-medium text-ink flex-1">{t('doctorshares.eski_vedomostlar')}</span>
                    <span className="text-xs text-faint">
                        {showArchive ? t('inventory.yopish') : t('doctorshares.ochish')}
                    </span>
                    <ChevronDown className={`w-4 h-4 text-faint transition-transform ${showArchive ? 'rotate-180' : ''}`} />
                </button>
                {showArchive && (
                    <div className="border-t border-line p-4">
                        <p className="text-xs text-muted mb-4">
                            {t('doctorshares.vedomost_davr_uchun_hujjat')}
                        </p>
                        <Payroll doctors={doctors} clinicId={clinicId} addToast={addToast} />
                    </div>
                )}
            </div>
        </div>
    );
};
