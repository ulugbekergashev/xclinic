import React, { useState, useEffect, useCallback } from 'react';
import { Plus, X, Check, Loader2 } from 'lucide-react';
import { api } from '../services/api';
import { Department, Service } from '../types';

/* ─────────────────────────────────────────────────────────────────────────────
   SHIFOKOR STAVKALARI.

   Ilgari bu jadval Moliya → Ulush → «Stavkalar» vkladkasida turardi va u
   yerda birinchi ish shifokorni RO'YXATDAN TANLASH edi. Ya'ni odam
   xodimni sozlash uchun uning kartasidan chiqib, boshqa bo'limga borib,
   o'sha odamni qaytadan qidirishi kerak bo'lardi.

   Endi u xodim kartasining ichida: kim ochilgan bo'lsa, stavka o'shaniki.

   Qoida o'zgarmadi — stavka ANIQROQDAN umumiyga qarab tanlanadi:
   xizmat → bo'lim → umumiy stavka → kartadagi foiz (`backend/payroll.ts`,
   `pickRate`). Jadval bo'sh bo'lsa hisob avvalgidek ishlaydi.
   ───────────────────────────────────────────────────────────────────────────── */

const inputCls = 'h-10 rounded-lg border border-line bg-transparent px-3 text-sm focus:ring-2 focus:ring-primary-500 outline-none';

interface Props {
    doctorId: string;
    /** Kartadagi umumiy foiz — oxirgi zaxira qiymat sifatida ko'rsatiladi */
    fallbackPercent?: number | null;
    departments?: Department[];
    services?: Service[];
    clinicId?: string;
    addToast?: (type: 'success' | 'error' | 'info', msg: string) => void;
}

type Row = { serviceId: string; departmentId: string; percent: string; role: string };

export const DoctorRatesEditor: React.FC<Props> = ({
    doctorId, fallbackPercent, departments = [], services: servicesProp, clinicId, addToast,
}) => {
    const [rows, setRows] = useState<Row[]>([]);
    const [services, setServices] = useState<Service[]>(servicesProp || []);
    const [loading, setLoading] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const load = useCallback(async (id: string) => {
        if (!id) { setRows([]); return; }
        setLoading(true); setError('');
        try {
            const list = await api.payroll.rates(id);
            setRows(list.map((r: any) => ({
                serviceId: r.serviceId != null ? String(r.serviceId) : '',
                departmentId: r.departmentId || '',
                percent: String(r.percent),
                role: r.role || 'Doctor',
            })));
        } catch (e: any) {
            setError(e?.message || 'Stavkalar yuklanmadi');
        } finally { setLoading(false); }
    }, []);

    useEffect(() => { load(doctorId); }, [doctorId, load]);

    /* Prayslist — faqat kerak bo'lganda. Karta ochilishi og'irlashmasin. */
    useEffect(() => {
        if (services.length > 0 || !clinicId) return;
        api.services.getAll(clinicId).then(setServices).catch(() => setServices([]));
    }, [services.length, clinicId]);

    const save = async () => {
        setBusy(true); setError('');
        try {
            await api.payroll.saveRates(doctorId, rows.map(r => ({
                serviceId: r.serviceId ? Number(r.serviceId) : null,
                departmentId: r.departmentId || null,
                percent: Number(r.percent) || 0,
                role: r.role,
            })));
            addToast?.('success', 'Stavkalar saqlandi');
            await load(doctorId);
        } catch (e: any) {
            setError(e?.message || 'Saqlanmadi');
        } finally { setBusy(false); }
    };

    return (
        <div className="space-y-3">
            <div className="p-3 rounded-lg bg-canvas/40 border border-line">
                <p className="text-xs text-muted">
                    Stavka ANIQROQDAN umumiyga qarab tanlanadi: xizmat → bo'lim →
                    umumiy stavka → kartadagi foiz
                    {fallbackPercent != null ? ` (${fallbackPercent}%)` : ''}.
                    Ya'ni bu jadval bo'sh bo'lsa, hisob avvalgidek ishlaydi.
                </p>
            </div>

            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

            {loading ? (
                <p className="text-sm text-faint py-6 text-center">Yuklanmoqda…</p>
            ) : rows.length === 0 ? (
                <p className="text-sm text-faint py-6 text-center">
                    Stavka yo'q — kartadagi umumiy foiz ishlatiladi
                </p>
            ) : (
                <div className="space-y-2">
                    {rows.map((r, i) => (
                        <div key={i} className="flex flex-wrap items-center gap-2">
                            <select value={r.serviceId}
                                onChange={e => setRows(rs => rs.map((x, j) => j === i ? { ...x, serviceId: e.target.value } : x))}
                                className={inputCls + ' flex-1 min-w-[180px]'}>
                                <option value="">Barcha xizmatlar</option>
                                {services.map(sv => (
                                    <option key={sv.id} value={String(sv.id)}>{sv.name}</option>
                                ))}
                            </select>

                            <select value={r.departmentId}
                                onChange={e => setRows(rs => rs.map((x, j) => j === i ? { ...x, departmentId: e.target.value } : x))}
                                className={inputCls + ' min-w-[150px]'}>
                                <option value="">Barcha bo'limlar</option>
                                {departments.filter(d => d.isActive).map(d => (
                                    <option key={d.id} value={d.id}>{d.name}</option>
                                ))}
                            </select>

                            <select value={r.role}
                                onChange={e => setRows(rs => rs.map((x, j) => j === i ? { ...x, role: e.target.value } : x))}
                                className={inputCls + ' min-w-[120px]'}>
                                <option value="Doctor">Shifokor</option>
                                <option value="Assistant">Assistent</option>
                            </select>

                            <div className="relative w-24">
                                <input type="number" value={r.percent} placeholder="0"
                                    onChange={e => setRows(rs => rs.map((x, j) => j === i ? { ...x, percent: e.target.value } : x))}
                                    className={inputCls + ' w-full text-right pr-7'} />
                                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-faint">%</span>
                            </div>

                            <button type="button" onClick={() => setRows(rs => rs.filter((_, j) => j !== i))}
                                className="p-2 text-faint hover:text-red-600">
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            <div className="flex items-center gap-2 pt-1">
                <button type="button"
                    onClick={() => setRows(rs => [...rs, { serviceId: '', departmentId: '', percent: '', role: 'Doctor' }])}
                    className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium border border-line rounded-lg hover:bg-elevated">
                    <Plus className="w-4 h-4" /> Qator qo'shish
                </button>
                <button type="button" onClick={save} disabled={busy}
                    className="ml-auto flex items-center gap-1.5 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50">
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    Stavkalarni saqlash
                </button>
            </div>
        </div>
    );
};
