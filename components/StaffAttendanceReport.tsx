import React, { useState, useEffect, useCallback } from 'react';
import { Card, Button } from './Common';
import { api } from '../services/api';
import { toast } from '../services/toast';
import { formatUzPhone } from '../shared/validation';
import { ChevronLeft, ChevronRight, Download, Loader2 } from 'lucide-react';

/* ─────────────────────────────────────────────────────────────────────────────
   DAVOMAT — HAMMA XODIM BO'YICHA.

   Xodim kartasidagi davomat BITTA odam haqida. «Bu oy kim qancha ishladi?»
   degan savolga javob berish uchun esa har kartani ochib chiqish kerak
   bo'lardi.

   FOIZ BELGILANGAN KUNLARDAN hisoblanadi, kalendar kunlaridan emas: maxraj
   — shu xodim uchun aslida belgilangan kunlar soni. Aks holda oyning
   o'rtasida ishga olingan odam 50% ko'rsatardi va bu raqam hech narsani
   anglatmasdi. Belgilanmagan xodimda foiz o'rniga «—» turadi.

   Kechikkan kun KELGAN deb sanaladi — odam ishga chiqqan. U alohida
   ustunda ko'rinadi, lekin foizdan chiqarilmaydi.
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

const ROLE_LABEL: Record<string, string> = {
    DOCTOR: 'Shifokor', RECEPTIONIST: 'Registrator',
    LAB_TECHNICIAN: 'Laborant', NURSE: 'Hamshira',
};

const Stat: React.FC<{ title: string; value: React.ReactNode; hint?: string }> = ({ title, value, hint }) => (
    <div className="rounded-xl border border-line p-4">
        <p className="text-xs text-muted">{title}</p>
        <p className="text-2xl font-bold text-ink tabular-nums mt-1">{value}</p>
        {hint && <p className="text-[11px] text-faint mt-1">{hint}</p>}
    </div>
);

export const StaffAttendanceReport: React.FC = () => {
    const [period, setPeriod] = useState(thisPeriod());
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            setData(await api.hr.attendanceSummary(period));
        } catch (e: any) {
            toast.error(e?.data?.error || e?.message || 'Davomat olinmadi');
            setData(null);
        } finally {
            setLoading(false);
        }
    }, [period]);

    useEffect(() => { load(); }, [load]);

    /* CSV — nuqta-vergul bilan: Excel o'zbek/rus lokalida aynan shuni
       ustun ajratgichi deb qabul qiladi. Vergul bilan yozilsa butun
       qator bitta katakka tushadi. */
    const exportCsv = () => {
        const rows = data?.rows || [];
        if (!rows.length) return;
        const head = ['Ism familiya', 'Lavozim', 'Rol', 'Belgilangan kun', 'Keldi', 'Kechikdi', 'Kelmadi', 'Sababli', 'Davomat %', 'Telefon'];
        const esc = (v: any) => {
            const s = String(v ?? '');
            return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        };
        const lines = [head.join(';')];
        for (const r of rows) {
            lines.push([
                r.name, r.position, ROLE_LABEL[r.role] || r.role,
                r.markedDays, r.present, r.late, r.absent, r.excused,
                r.percent == null ? '' : r.percent, r.phone || '',
            ].map(esc).join(';'));
        }
        /* BOM — Excel faylni UTF-8 deb tanishi uchun. Usiz o'zbekcha
           harflar «Ð°Ð±Ð²» bo'lib ochiladi. */
        const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `davomat-${period}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const rows = data?.rows || [];

    return (
        <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 className="text-lg font-bold text-ink">Xodimlar davomati</h2>
                    <p className="text-sm text-muted">
                        Kun xodim kartasidagi «Ish grafigi» bo'limidan belgilanadi
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1">
                        <button onClick={() => setPeriod(p => shiftPeriod(p, -1))}
                            className="p-2 rounded-lg border border-line text-muted hover:text-primary-600">
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                        <span className="px-3 text-sm font-bold text-ink tabular-nums min-w-[92px] text-center">
                            {periodLabel(period)}
                        </span>
                        <button onClick={() => setPeriod(p => shiftPeriod(p, 1))}
                            className="p-2 rounded-lg border border-line text-muted hover:text-primary-600">
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>
                    <Button variant="secondary" onClick={exportCsv} disabled={!rows.length}>
                        <Download className="w-4 h-4 mr-1" /> CSV
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
                <Stat title="Jami xodim" value={data ? data.staffTotal : '—'} />
                <Stat title="O'rtacha davomat"
                    value={data?.avgPercent != null ? `${data.avgPercent}%` : '—'}
                    hint={data ? `${data.trackedStaff} ta xodim bo'yicha` : undefined} />
                <Stat title="Eng yaxshi davomat"
                    value={data?.best ? data.best.name.split(' ')[0] : '—'}
                    hint={data?.best ? `${data.best.percent}%` : 'belgilangan kun yo\'q'} />
                <Stat title="Belgilangan kunlar" value={data ? data.markedDays : '—'} />
            </div>

            <Card className="overflow-hidden">
                {loading ? (
                    <div className="py-16 text-center text-faint">
                        <Loader2 className="w-5 h-5 animate-spin inline" />
                    </div>
                ) : rows.length === 0 ? (
                    <div className="py-16 text-center text-muted">Xodim yo'q</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left text-xs text-muted border-b border-line">
                                    <th className="py-3 px-4 font-medium">Ism familiya</th>
                                    <th className="py-3 px-4 font-medium">Lavozim</th>
                                    <th className="py-3 px-4 font-medium text-right">Belgilangan kun</th>
                                    <th className="py-3 px-4 font-medium text-right">Keldi</th>
                                    <th className="py-3 px-4 font-medium text-right">Kechikdi</th>
                                    <th className="py-3 px-4 font-medium text-right">Kelmadi</th>
                                    <th className="py-3 px-4 font-medium text-right">Davomat %</th>
                                    <th className="py-3 px-4 font-medium">Telefon</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((r: any) => (
                                    <tr key={`${r.role}-${r.id}`}
                                        className="border-b border-line-soft last:border-0">
                                        <td className="py-3 px-4 text-ink">
                                            {r.name}
                                            {r.status !== 'Active' && (
                                                <span className="ml-2 text-[10px] text-faint">arxiv</span>
                                            )}
                                        </td>
                                        <td className="py-3 px-4 text-muted">{r.position}</td>
                                        <td className="py-3 px-4 text-right tabular-nums text-muted">
                                            {r.markedDays || <span className="text-faint">0</span>}
                                        </td>
                                        <td className="py-3 px-4 text-right tabular-nums text-emerald-600 dark:text-emerald-400">
                                            {r.present}
                                        </td>
                                        <td className="py-3 px-4 text-right tabular-nums text-sky-600 dark:text-sky-400">
                                            {r.late}
                                        </td>
                                        <td className="py-3 px-4 text-right tabular-nums text-red-600 dark:text-red-400">
                                            {r.absent}
                                        </td>
                                        <td className="py-3 px-4 text-right tabular-nums font-bold">
                                            {r.percent == null
                                                ? <span className="text-faint font-normal">—</span>
                                                : <span className={r.percent >= 90
                                                    ? 'text-emerald-600 dark:text-emerald-400'
                                                    : r.percent >= 70
                                                        ? 'text-amber-600 dark:text-amber-400'
                                                        : 'text-red-600 dark:text-red-400'}>{r.percent}%</span>}
                                        </td>
                                        <td className="py-3 px-4 text-muted">
                                            {r.phone ? formatUzPhone(r.phone) : '—'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Card>

            <p className="text-xs text-muted">
                Foiz belgilangan kunlardan hisoblanadi, kalendar kunlaridan emas. Kechikkan kun
                kelgan deb sanaladi. Davomat oylikdan avtomatik ushlanmaydi — ushlash xodim
                kartasida jarima bo'lib yoziladi.
            </p>
        </div>
    );
};
