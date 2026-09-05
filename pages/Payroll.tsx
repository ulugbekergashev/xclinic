import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { formatDate, formatFullName, formatNumber } from '../utils/format';
import {
    Percent, Plus, X, AlertCircle, Check, Loader2, Trash2,
    FileText, Wallet, CheckCircle, ChevronDown, ChevronUp, RefreshCw,
} from 'lucide-react';
import { Doctor, Department, Service } from '../types';
import { api } from '../services/api';
import { todayISO, formatDateToISO, formatDay } from '../utils/dateUtils';

/* ─────────────────────────────────────────────────────────────────────────────
   Shifokor ulushi: STAVKALAR va VEDOMOST.

   MUAMMO. Hozir ulush ikki joyda yashaydi va ikkalasi ham noto'g'ri:

   1. `Doctor.percentage` — bitta foiz hamma narsaga. Haqiqatda
      konsultatsiyadan 30%, operatsiyadan 15%, UZI dan 0% (apparat
      klinikaning) (GAP-ANALYSIS B85).

   2. To'lov — qo'lda yozilgan xarajat. Hisob-kitob Excel da qilinadi va
      xato o'sha yerda qoladi; "shu oy kimga qancha tegdi" degan hujjat
      yo'q (B87).

   ASOSIY QOIDA, ekranda ham ko'rinib turishi kerak: ulush TO'LANGAN puldan
   hisoblanadi. Qarzga yozilgan ish uchun shifokorga pul berib bo'lmaydi —
   u pul klinikaga hali kirmagan.
   ───────────────────────────────────────────────────────────────────────────── */

interface Props {
    doctors?: Doctor[];
    departments?: Department[];
    /** Xizmat ro'yxatini yuklash uchun kerak */
    clinicId?: string;
    addToast?: (type: 'success' | 'error' | 'info', msg: string) => void;
}

/* Raqam formati BITTA joydan — `utils/format.ts`. Ilgari bu yerda
   `Intl.NumberFormat('uz-UZ')` turardi: Chrome da `uz` lokali to'liq
   emas va u vergul qo'yadi («160,000»), Moliya bo'limi esa bo'shliq
   qo'yardi («160 000») — bitta ilovada ikki xil ko'rinish. */
const fmt = (n: number) => formatNumber(n);
/* Oy boshi — MAHALLIY sana bo'yicha.
   Ilgari bu yerda `toISOString()` turardi. U UTC beradi, Toshkent esa
   UTC+5: 1-sentabr mahalliy yarim tuni UTC da 31-avgust 19:00 bo'ladi va
   `.split('T')[0]` BIR KUN ORQAGA siljigan sanani qaytarardi. Ekranda
   davr «31.08» dan boshlanib turardi va vedomost o'tgan oyning oxirgi
   kunini ham qamrab olardi. */
const monthStart = () => {
    const d = new Date();
    return formatDateToISO(new Date(d.getFullYear(), d.getMonth(), 1));
};
const fmtDate = (v?: string | null) => v ? formatDate(v) : '—';

const RUN_UI: Record<string, { label: string; cls: string }> = {
    Draft: { label: 'Qoralama', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' },
    Approved: { label: 'Tasdiqlangan', cls: 'bg-primary-100 text-primary-800 dark:bg-primary-900/40 dark:text-primary-300' },
    Paid: { label: "To'langan", cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300' },
};

export const Payroll: React.FC<Props> = ({ doctors = [], departments = [], clinicId = '', addToast }) => {
    const [tab, setTab] = useState<'runs' | 'rates'>('runs');
    /* Xizmatlar ro'yxati SHU EKRANDA yuklanadi. Ota-komponentdagi `services`
       propida `id` yo'q (u faqat nom/narx/davomiylik), stavka esa aynan
       xizmat id siga bog'lanadi. */
    const [services, setServices] = useState<Service[]>([]);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    const inputCls = 'px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500';

    /* ═══ VEDOMOST ═══════════════════════════════════════════════════════════ */

    const [from, setFrom] = useState(monthStart());
    const [to, setTo] = useState(todayISO());
    const [preview, setPreview] = useState<any>(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [runs, setRuns] = useState<any[]>([]);
    const [openRun, setOpenRun] = useState<any>(null);
    const [expandLine, setExpandLine] = useState('');

    const loadRuns = useCallback(async () => {
        try { setRuns(await api.payroll.runs()); }
        catch (e: any) { setError(e?.message || "Vedomostlar yuklanmadi"); }
    }, []);

    /* Oldindan ko'rish ATAYLAB alohida: vedomost yaratish — hujjat yaratish,
       va uni "shunchaki qarab qo'yish" uchun ishlatib bo'lmaydi. */
    const loadPreview = useCallback(async () => {
        setPreviewLoading(true); setError('');
        try { setPreview(await api.payroll.preview(from, to)); }
        catch (e: any) { setError(e?.message || 'Hisoblab bo\'lmadi'); setPreview(null); }
        finally { setPreviewLoading(false); }
    }, [from, to]);

    useEffect(() => { loadRuns(); }, [loadRuns]);
    useEffect(() => { if (tab === 'runs') loadPreview(); }, [tab, loadPreview]);

    const createRun = async () => {
        setBusy(true); setError('');
        try {
            const run = await api.payroll.createRun(from, to);
            await loadRuns();
            setOpenRun(await api.payroll.run(run.id));
            addToast?.('success', 'Vedomost yaratildi');
        } catch (e: any) {
            setError(e?.message || 'Yaratilmadi');
        } finally { setBusy(false); }
    };

    const openRunDetail = async (id: string) => {
        setError('');
        try { setOpenRun(await api.payroll.run(id)); }
        catch (e: any) { setError(e?.message || "Vedomost ochilmadi"); }
    };

    const approve = async () => {
        if (!openRun) return;
        setBusy(true); setError('');
        try {
            await api.payroll.approve(openRun.id);
            await loadRuns();
            setOpenRun(await api.payroll.run(openRun.id));
            addToast?.('success', 'Tasdiqlandi');
        } catch (e: any) {
            setError(e?.message || 'Tasdiqlanmadi');
        } finally { setBusy(false); }
    };

    const removeRun = async (id: string) => {
        setBusy(true); setError('');
        try {
            await api.payroll.deleteRun(id);
            await loadRuns();
            if (openRun?.id === id) setOpenRun(null);
        } catch (e: any) {
            setError(e?.message || "O'chirilmadi");
        } finally { setBusy(false); }
    };

    const payLine = async (lineId: string) => {
        setBusy(true); setError('');
        try {
            const res = await api.payroll.payLine(lineId);
            await loadRuns();
            if (openRun) setOpenRun(await api.payroll.run(openRun.id));
            addToast?.('success', `${fmt(res.line.paid)} so'm xarajat sifatida yozildi`);
        } catch (e: any) {
            setError(e?.message || "To'lanmadi");
        } finally { setBusy(false); }
    };

    /* ═══ STAVKALAR ══════════════════════════════════════════════════════════ */

    const [rateDoctor, setRateDoctor] = useState('');
    const [rateRows, setRateRows] = useState<{ serviceId: string; departmentId: string; percent: string; role: string }[]>([]);
    const [ratesLoading, setRatesLoading] = useState(false);

    const activeDoctors = useMemo(
        () => doctors.filter(d => d.status !== 'Deleted'),
        [doctors],
    );

    const loadRates = useCallback(async (doctorId: string) => {
        if (!doctorId) { setRateRows([]); return; }
        setRatesLoading(true); setError('');
        try {
            const list = await api.payroll.rates(doctorId);
            setRateRows(list.map((r: any) => ({
                serviceId: r.serviceId != null ? String(r.serviceId) : '',
                departmentId: r.departmentId || '',
                percent: String(r.percent),
                role: r.role || 'Doctor',
            })));
        } catch (e: any) {
            setError(e?.message || 'Stavkalar yuklanmadi');
        } finally { setRatesLoading(false); }
    }, []);

    useEffect(() => { if (tab === 'rates' && rateDoctor) loadRates(rateDoctor); }, [tab, rateDoctor, loadRates]);

    useEffect(() => {
        if (tab !== 'rates' || services.length > 0 || !clinicId) return;
        api.services.getAll(clinicId).then(setServices).catch(() => setServices([]));
    }, [tab, services.length, clinicId]);

    const saveRates = async () => {
        if (!rateDoctor) return;
        setBusy(true); setError('');
        try {
            await api.payroll.saveRates(rateDoctor, rateRows.map(r => ({
                serviceId: r.serviceId ? Number(r.serviceId) : null,
                departmentId: r.departmentId || null,
                percent: Number(r.percent) || 0,
                role: r.role,
            })));
            addToast?.('success', 'Stavkalar saqlandi');
            await loadRates(rateDoctor);
        } catch (e: any) {
            setError(e?.message || 'Saqlanmadi');
        } finally { setBusy(false); }
    };

    const doctorFallback = activeDoctors.find(d => d.id === rateDoctor)?.percentage;

    return (
        <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 mr-auto">
                    <Percent className="w-6 h-6 text-primary-600 dark:text-primary-400" />
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">Shifokor ulushi</h2>
                </div>
            </div>

            <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700">
                {([['runs', 'Vedomost'], ['rates', 'Stavkalar']] as const).map(([k, label]) => (
                    <button key={k} onClick={() => setTab(k)}
                        className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === k
                            ? 'border-primary-600 text-primary-600 dark:text-primary-400'
                            : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'}`}>
                        {label}
                    </button>
                ))}
            </div>

            {error && (
                <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                    <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                    <p className="text-sm text-red-700 dark:text-red-300 flex-1">{error}</p>
                    <button onClick={() => setError('')} className="text-red-400 hover:text-red-600"><X className="w-4 h-4" /></button>
                </div>
            )}

            {/* ═══ VEDOMOST ═══════════════════════════════════════════════════ */}
            {tab === 'runs' && (
                <div className="space-y-5">
                    {/* Davr va hisob */}
                    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                        <div className="flex flex-wrap items-end gap-3">
                            <div>
                                <label className="block text-[11px] text-gray-500 dark:text-gray-400 mb-1">Davr boshi</label>
                                <input type="date" value={from} onChange={e => setFrom(e.target.value)} className={inputCls} />
                            </div>
                            <div>
                                <label className="block text-[11px] text-gray-500 dark:text-gray-400 mb-1">Davr oxiri</label>
                                <input type="date" value={to} onChange={e => setTo(e.target.value)} className={inputCls} />
                            </div>
                            <button aria-label="Qayta hisoblash" onClick={loadPreview} disabled={previewLoading}
                                className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200" title="Qayta hisoblash">
                                <RefreshCw className={`w-5 h-5 ${previewLoading ? 'animate-spin' : ''}`} />
                            </button>
                            <button onClick={createRun} disabled={busy || !preview || (preview.lines || []).length === 0}
                                className="ml-auto flex items-center gap-1.5 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50">
                                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                                Vedomost yaratish
                            </button>
                        </div>

                        {previewLoading ? (
                            <p className="text-sm text-gray-400 py-8 text-center">Hisoblanmoqda...</p>
                        ) : !preview ? null : (preview.lines || []).length === 0 ? (
                            /* NEGA BO'SH — aniq sabab bilan.

                               Ilgari bu yerda bitta umumiy gap turardi: «ulush
                               faqat to'langan xizmatlardan hisoblanadi va
                               qatorda shifokor ko'rsatilgan bo'lishi kerak».
                               U qoidani tushuntiradi, lekin SABABNI aytmaydi —
                               holbuki sabablar butunlay har xil va har birining
                               yechimi boshqa:

                                 · davrda umuman to'lov bo'lmagan — sanani
                                   o'zgartirish kerak;
                                 · to'lov bor, lekin shifokorsiz — bu XATO,
                                   pul hech kimga tegishli emas;
                                 · hammasi bekor qilingan qatorlar.

                               Endi server sanab beradi va ekran o'shani
                               ko'rsatadi. */
                            <div className="text-center py-8 mt-3 border-t border-gray-100 dark:border-gray-700">
                                <p className="text-sm text-gray-500 dark:text-gray-400">
                                    Bu davrda hisoblanadigan ulush yo'q
                                </p>

                                {(preview.stats?.payments ?? 0) === 0 ? (
                                    <p className="text-xs text-gray-400 mt-1">
                                        {formatDay(from)} — {formatDay(to)} oralig'ida bironta to'lov bo'lmagan.
                                        {preview.lastPaymentAt && (
                                            <> Oxirgi to'lov: <b className="text-gray-500 dark:text-gray-300">{formatDay(preview.lastPaymentAt)}</b>.</>
                                        )}
                                    </p>
                                ) : (
                                    <div className="text-xs text-gray-400 mt-1 space-y-1">
                                        <p>Davrda {preview.stats.payments} ta to'lov bor, lekin ulushga hech biri kirmadi.</p>
                                        {preview.stats.skippedNoDoctor > 0 && (
                                            <p className="text-amber-600 dark:text-amber-400">
                                                {preview.stats.skippedNoDoctor} ta to'lovda shifokor ko'rsatilmagan
                                                ({fmt(preview.stats.skippedNoDoctorSum)} so'm) — bu pul hech kimga biriktirilmagan.
                                            </p>
                                        )}
                                        {preview.stats.skippedCancelled > 0 && (
                                            <p>{preview.stats.skippedCancelled} ta qator bekor qilingan.</p>
                                        )}
                                    </div>
                                )}

                                {/* Oxirgi to'lov bo'lgan oyga bir bosishda o'tish —
                                    aks holda sanalarni qo'lda paypaslash kerak. */}
                                {preview.lastPaymentAt && (
                                    <button
                                        onClick={() => {
                                            const d = new Date(preview.lastPaymentAt);
                                            setFrom(formatDateToISO(new Date(d.getFullYear(), d.getMonth(), 1)));
                                            setTo(formatDateToISO(new Date(d.getFullYear(), d.getMonth() + 1, 0)));
                                        }}
                                        className="mt-3 text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline">
                                        Oxirgi to'lov bo'lgan oyni ko'rsatish
                                    </button>
                                )}
                            </div>
                        ) : (
                            <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
                                <div className="flex items-baseline gap-2 mb-3">
                                    <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                        Oldindan hisob
                                    </p>
                                    <span className="ml-auto text-lg font-black tabular-nums text-gray-900 dark:text-white">
                                        {fmt(preview.total)} <span className="text-xs font-normal text-gray-400">UZS</span>
                                    </span>
                                </div>
                                <div className="space-y-1.5">
                                    {preview.lines.map((l: any) => (
                                        <div key={l.doctorId} className="flex flex-wrap items-center gap-2 text-sm">
                                            <span className="text-gray-900 dark:text-white">{l.staffName}</span>
                                            <span className="text-xs text-gray-400">
                                                to'langan {fmt(l.paidBase)}
                                                {l.refunded > 0 ? ` · qaytarilgan ${fmt(l.refunded)}` : ''}
                                                {' · '}{l.items.length} qator
                                            </span>
                                            <span className="ml-auto font-semibold tabular-nums text-gray-900 dark:text-white">
                                                {fmt(l.accrued)}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                                <p className="text-[11px] text-gray-400 mt-3">
                                    Ulush pul KIRGAN paytga qarab hisoblanadi: boshqa oyda to'langan
                                    qarz shu oyga tushadi, qaytarish esa ulushni kamaytiradi.
                                </p>
                            </div>
                        )}
                    </div>

                    {/* Vedomostlar ro'yxati */}
                    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                        <h3 className="px-4 py-3 text-sm font-bold text-gray-900 dark:text-white border-b border-gray-100 dark:border-gray-700">
                            Vedomostlar
                        </h3>
                        {runs.length === 0 ? (
                            <p className="px-4 py-10 text-sm text-gray-400 text-center">Hali vedomost yaratilmagan</p>
                        ) : (
                            <div className="divide-y divide-gray-100 dark:divide-gray-700">
                                {runs.map(r => {
                                    const accrued = (r.lines || []).reduce((s: number, l: any) => s + (l.accrued || 0), 0);
                                    const paid = (r.lines || []).reduce((s: number, l: any) => s + (l.paid || 0), 0);
                                    const ui = RUN_UI[r.status] || RUN_UI.Draft;
                                    return (
                                        <div key={r.id} className="px-4 py-3 flex flex-wrap items-center gap-2">
                                            <div className="min-w-0">
                                                <p className="text-sm font-medium text-gray-900 dark:text-white">
                                                    {fmtDate(r.periodFrom)} — {fmtDate(r.periodTo)}
                                                </p>
                                                <p className="text-[11px] text-gray-400">
                                                    {(r.lines || []).length} qator
                                                    {r.createdByName ? ` · ${r.createdByName}` : ''}
                                                    {r.approvedByName ? ` · tasdiqladi: ${r.approvedByName}` : ''}
                                                </p>
                                            </div>
                                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${ui.cls}`}>{ui.label}</span>
                                            <span className="ml-auto text-sm tabular-nums text-gray-900 dark:text-white">
                                                {fmt(accrued)}
                                                {paid > 0 && <span className="text-emerald-600 dark:text-emerald-400"> · to'landi {fmt(paid)}</span>}
                                            </span>
                                            <button onClick={() => openRunDetail(r.id)}
                                                className="px-3 py-1.5 text-xs font-medium bg-primary-600 text-white rounded-lg hover:bg-primary-700">
                                                Ochish
                                            </button>
                                            {r.status === 'Draft' && (
                                                <button onClick={() => removeRun(r.id)} disabled={busy}
                                                    title="Qoralamani o'chirish"
                                                    className="p-1.5 text-gray-400 hover:text-red-600">
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ═══ STAVKALAR ══════════════════════════════════════════════════ */}
            {tab === 'rates' && (
                <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-4">
                    <div className="flex flex-wrap items-end gap-3">
                        <div className="min-w-[220px]">
                            <label className="block text-[11px] text-gray-500 dark:text-gray-400 mb-1">Shifokor</label>
                            <select value={rateDoctor} onChange={e => setRateDoctor(e.target.value)} className={inputCls + ' w-full'}>
                                <option value="">Tanlang</option>
                                {activeDoctors.map(d => (
                                    <option key={d.id} value={d.id}>{formatFullName(d)}</option>
                                ))}
                            </select>
                        </div>
                        {rateDoctor && (
                            <button onClick={() => setRateRows(rows => [...rows, { serviceId: '', departmentId: '', percent: '', role: 'Doctor' }])}
                                className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700">
                                <Plus className="w-4 h-4" /> Qator qo'shish
                            </button>
                        )}
                        {rateDoctor && (
                            <button onClick={saveRates} disabled={busy}
                                className="ml-auto flex items-center gap-1.5 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50">
                                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                                Saqlash
                            </button>
                        )}
                    </div>

                    {!rateDoctor ? (
                        <p className="text-sm text-gray-400 py-8 text-center">
                            Stavkalarni ko'rish uchun shifokorni tanlang
                        </p>
                    ) : ratesLoading ? (
                        <p className="text-sm text-gray-400 py-8 text-center">Yuklanmoqda...</p>
                    ) : (
                        <>
                            <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-900/40 border border-gray-200 dark:border-gray-700">
                                <p className="text-xs text-gray-600 dark:text-gray-300">
                                    Stavka ANIQROQDAN umumiyga qarab tanlanadi: xizmat → bo'lim →
                                    umumiy stavka → shifokor kartasidagi foiz
                                    {doctorFallback != null ? ` (${doctorFallback}%)` : ''}.
                                    Ya'ni bu jadval bo'sh bo'lsa, hisob avvalgidek ishlaydi.
                                </p>
                            </div>

                            {rateRows.length === 0 ? (
                                <p className="text-sm text-gray-400 py-6 text-center">
                                    Stavka yo'q — kartadagi umumiy foiz ishlatiladi
                                </p>
                            ) : (
                                <div className="space-y-2">
                                    {rateRows.map((r, i) => (
                                        <div key={i} className="flex flex-wrap items-center gap-2">
                                            <select value={r.serviceId}
                                                onChange={e => setRateRows(rows => rows.map((x, j) => j === i ? { ...x, serviceId: e.target.value } : x))}
                                                className={inputCls + ' flex-1 min-w-[180px]'}>
                                                <option value="">Barcha xizmatlar</option>
                                                {services.map(sv => (
                                                    <option key={sv.id} value={String(sv.id)}>{sv.name}</option>
                                                ))}
                                            </select>

                                            <select value={r.departmentId}
                                                onChange={e => setRateRows(rows => rows.map((x, j) => j === i ? { ...x, departmentId: e.target.value } : x))}
                                                className={inputCls + ' min-w-[150px]'}>
                                                <option value="">Barcha bo'limlar</option>
                                                {departments.filter(d => d.isActive).map(d => (
                                                    <option key={d.id} value={d.id}>{d.name}</option>
                                                ))}
                                            </select>

                                            <select value={r.role}
                                                onChange={e => setRateRows(rows => rows.map((x, j) => j === i ? { ...x, role: e.target.value } : x))}
                                                className={inputCls + ' min-w-[120px]'}>
                                                <option value="Doctor">Shifokor</option>
                                                <option value="Assistant">Assistent</option>
                                            </select>

                                            <div className="relative w-24">
                                                <input type="number" value={r.percent} placeholder="0"
                                                    onChange={e => setRateRows(rows => rows.map((x, j) => j === i ? { ...x, percent: e.target.value } : x))}
                                                    className={inputCls + ' w-full text-right pr-7'} />
                                                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-gray-400">%</span>
                                            </div>

                                            <button onClick={() => setRateRows(rows => rows.filter((_, j) => j !== i))}
                                                className="p-2 text-gray-400 hover:text-red-600">
                                                <X className="w-4 h-4" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}

            {/* ── Vedomost kartasi ─────────────────────────────────────────── */}
            {openRun && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setOpenRun(null)}>
                    <div className="bg-white dark:bg-gray-800 rounded-xl w-full max-w-3xl max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
                        <div className="p-5 border-b border-gray-200 dark:border-gray-700 flex flex-wrap items-center gap-3">
                            <div className="min-w-0">
                                <h3 className="font-semibold text-gray-900 dark:text-white">
                                    {fmtDate(openRun.periodFrom)} — {fmtDate(openRun.periodTo)}
                                </h3>
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                    {(RUN_UI[openRun.status] || RUN_UI.Draft).label}
                                    {openRun.approvedAt ? ` · ${new Date(openRun.approvedAt).toLocaleString('uz-UZ')}` : ''}
                                </p>
                            </div>
                            <div className="ml-auto flex items-center gap-2">
                                {openRun.status === 'Draft' && (
                                    <button onClick={approve} disabled={busy}
                                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50">
                                        <CheckCircle className="w-3.5 h-3.5" /> Tasdiqlash
                                    </button>
                                )}
                                <button onClick={() => setOpenRun(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
                            </div>
                        </div>

                        <div className="p-5 overflow-y-auto space-y-2">
                            {openRun.status === 'Draft' && (
                                <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg mb-3">
                                    <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                                    <p className="text-xs text-amber-800 dark:text-amber-200">
                                        Qoralama: raqamlarni tekshirib, tasdiqlang. Tasdiqlangandan keyin
                                        vedomost QAYTA HISOBLANMAYDI — o'tgan davr bugungi stavka bilan
                                        o'zgarib ketmasligi kerak.
                                    </p>
                                </div>
                            )}

                            {(openRun.lines || []).map((l: any) => (
                                <div key={l.id} className="border border-gray-200 dark:border-gray-700 rounded-lg">
                                    <div className="p-3 flex flex-wrap items-center gap-2">
                                        <div className="min-w-0">
                                            <p className="text-sm font-medium text-gray-900 dark:text-white">{l.staffName}</p>
                                            {l.detail?.paidBase != null && (
                                                <p className="text-[11px] text-gray-400">
                                                    baza: to'langan {fmt(l.detail.paidBase)} · {(l.detail.items || []).length} qator
                                                </p>
                                            )}
                                        </div>

                                        <span className="ml-auto text-sm font-semibold tabular-nums text-gray-900 dark:text-white">
                                            {fmt(l.accrued)}
                                        </span>

                                        {l.paid > 0 ? (
                                            <span className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                                                <Check className="w-3 h-3" /> to'landi {fmt(l.paid)}
                                            </span>
                                        ) : openRun.status !== 'Draft' ? (
                                            <button onClick={() => payLine(l.id)} disabled={busy || l.accrued <= 0}
                                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50">
                                                <Wallet className="w-3 h-3" /> To'lash
                                            </button>
                                        ) : null}

                                        {(l.detail?.items || []).length > 0 && (
                                            <button onClick={() => setExpandLine(expandLine === l.id ? '' : l.id)}
                                                className="p-1.5 text-gray-400 hover:text-gray-600">
                                                {expandLine === l.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                            </button>
                                        )}
                                    </div>

                                    {/* Hisob QANDAY chiqqani: "nega bunday" savoliga javob */}
                                    {expandLine === l.id && (
                                        <div className="border-t border-gray-200 dark:border-gray-700 max-h-64 overflow-y-auto">
                                            <table className="w-full">
                                                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                                                    {(l.detail.items || []).map((it: any, i: number) => (
                                                        <tr key={i} className="text-xs">
                                                            <td className="px-3 py-1.5 text-gray-700 dark:text-gray-300">{it.name}</td>
                                                            <td className="px-3 py-1.5 text-right tabular-nums text-gray-500 dark:text-gray-400">
                                                                {fmt(it.paid)}
                                                            </td>
                                                            <td className="px-3 py-1.5 text-right text-gray-400 whitespace-nowrap">
                                                                {it.percent}% ({it.basis})
                                                            </td>
                                                            <td className="px-3 py-1.5 text-right tabular-nums font-semibold text-gray-900 dark:text-white">
                                                                {fmt(it.share)}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            ))}

                            {(openRun.lines || []).length === 0 && (
                                <p className="text-sm text-gray-400 py-8 text-center">Qator yo'q</p>
                            )}
                        </div>

                        <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex items-center gap-3">
                            <span className="text-sm text-gray-500 dark:text-gray-400">Jami hisoblangan</span>
                            <span className="ml-auto text-lg font-black tabular-nums text-gray-900 dark:text-white">
                                {fmt((openRun.lines || []).reduce((s: number, l: any) => s + (l.accrued || 0), 0))} UZS
                            </span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
