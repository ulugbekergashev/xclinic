import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Card, Button, Input } from '../components/Common';
import { api } from '../services/api';
import { toast } from '../services/toast';
import { confirmAction } from '../services/confirm';
import { formatFullName, formatMoney, formatDate } from '../utils/format';
import { formatUzPhone } from '../shared/validation';
import { Department, Service } from '../types';
import { DoctorRatesEditor } from '../components/DoctorRatesEditor';
import {
    StaffForm, StaffRow, StaffRole, roleMeta, saveStaff, removeStaff,
} from '../components/StaffForm';
import {
    ArrowLeft, Phone, Mail, Edit, Trash2, Layers, Wallet, CalendarDays,
    Percent, ChevronLeft, ChevronRight, Plus, X, Loader2, Check, AlertCircle,
} from 'lucide-react';

/* ─────────────────────────────────────────────────────────────────────────────
   XODIM KARTASI — BITTA ISH JOYI.

   Ilgari xodim modal oynada ochilardi va u yerga sig'adigan narsa cheklangan
   edi: ma'lumot, stavkalar, hisob-kitob. Oylik, bonus, davomat va ish
   grafigi hech qayerda yo'q edi.

   PUL BITTA JOYDAN CHIQADI — shu kartadan. Oy tanlanadi, hisob ko'rinadi,
   «To'lash» bosiladi.

   Ilgari shifokorning ulushi VEDOMOST orqali to'lanardi: davr tanlanadi,
   hujjat yaratiladi, tasdiqlanadi, keyin qatorma-qator to'lanadi — to'rt
   qadam, ularning uchtasi buxgalteriya marosimi. Endi hisob shu yerda.

   Vedomost bekor qilinmadi: u ARXIV bo'lib qoldi va u orqali allaqachon
   to'langan summa hisobda AYRILADI — bitta pul ikki marta berilmasin.
   ───────────────────────────────────────────────────────────────────────────── */

interface Props {
    departments?: Department[];
    services?: Service[];
    clinicId?: string;
    addToast?: (type: 'success' | 'error' | 'info', msg: string) => void;
    onStaffChanged?: () => void;
}

type Tab = 'general' | 'salary' | 'schedule' | 'rates';

const WEEK = [
    { n: 1, short: 'Du', full: 'Dushanba' },
    { n: 2, short: 'Se', full: 'Seshanba' },
    { n: 3, short: 'Ch', full: 'Chorshanba' },
    { n: 4, short: 'Pa', full: 'Payshanba' },
    { n: 5, short: 'Ju', full: 'Juma' },
    { n: 6, short: 'Sh', full: 'Shanba' },
    { n: 7, short: 'Ya', full: 'Yakshanba' },
];

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

/* Davomat holatlari — kun bosilganda shu tartibda aylanadi va oxirida
   yana «belgilanmagan» bo'ladi. */
const ATT_CYCLE = ['Present', 'Absent', 'Excused', 'Late', ''] as const;
const ATT_UI: Record<string, { label: string; cls: string }> = {
    Present: { label: 'Keldi', cls: 'bg-emerald-500 text-white border-emerald-500' },
    Absent: { label: 'Kelmadi', cls: 'bg-red-500 text-white border-red-500' },
    Excused: { label: 'Sababli', cls: 'bg-amber-500 text-white border-amber-500' },
    Late: { label: 'Kechikdi', cls: 'bg-sky-500 text-white border-sky-500' },
};

export const StaffCard: React.FC<Props> = ({
    departments = [], services = [], clinicId, addToast, onStaffChanged,
}) => {
    const { role, id } = useParams<{ role: string; id: string }>();
    const navigate = useNavigate();

    const [row, setRow] = useState<StaffRow | null>(null);
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState<Tab>('general');
    const [editing, setEditing] = useState(false);

    const [period, setPeriod] = useState(thisPeriod());
    const [month, setMonth] = useState<any>(null);
    const [monthLoading, setMonthLoading] = useState(false);

    const [attendance, setAttendance] = useState<any>(null);
    const [workDays, setWorkDays] = useState<number[]>([]);
    const [savingDays, setSavingDays] = useState(false);

    const [adjType, setAdjType] = useState<'Bonus' | 'Penalty'>('Bonus');
    const [adjReason, setAdjReason] = useState('');
    const [adjAmount, setAdjAmount] = useState('');
    const [busy, setBusy] = useState(false);

    const staffRole = (role || 'DOCTOR') as StaffRole;
    const meta = roleMeta(staffRole);

    const loadRow = useCallback(async () => {
        try {
            setLoading(true);
            const all = await api.staff.getAll();
            const found = all.find((r: any) => r.role === staffRole && r.id === id) || null;
            setRow(found);
            setWorkDays(String(found?.workDays || '').split(',').filter(Boolean).map(Number));
        } catch (e: any) {
            toast.error(e?.data?.error || e?.message || 'Xodim ma\'lumoti olinmadi');
        } finally {
            setLoading(false);
        }
    }, [staffRole, id]);

    useEffect(() => { loadRow(); }, [loadRow]);

    const loadMonth = useCallback(async () => {
        if (!id) return;
        setMonthLoading(true);
        try {
            const [m, att] = await Promise.all([
                api.hr.month(staffRole, id, period),
                api.hr.attendance(staffRole, id, period).catch(() => null),
            ]);
            setMonth(m);
            setAttendance(att);
        } catch (e: any) {
            toast.error(e?.data?.error || e?.message || 'Oylik hisobi olinmadi');
            setMonth(null);
        } finally {
            setMonthLoading(false);
        }
    }, [staffRole, id, period]);

    useEffect(() => { loadMonth(); }, [loadMonth]);

    /* ── Ish grafigi ── */
    const toggleDay = async (n: number) => {
        const next = workDays.includes(n) ? workDays.filter(d => d !== n) : [...workDays, n].sort((a, b) => a - b);
        setWorkDays(next);
        setSavingDays(true);
        try {
            await saveStaff(staffRole, id!, { workDays: next.join(',') });
            onStaffChanged?.();
        } catch (e: any) {
            setWorkDays(workDays);   // orqaga qaytaramiz
            toast.error(e?.data?.error || e?.message || "Ish grafigi saqlanmadi");
        } finally {
            setSavingDays(false);
        }
    };

    /* ── Davomat ── */
    const attMap = useMemo(() => {
        const map: Record<string, string> = {};
        for (const d of (attendance?.days || [])) map[d.date] = d.status;
        return map;
    }, [attendance]);

    const monthDays = useMemo(() => {
        const [y, m] = period.split('-').map(Number);
        const total = new Date(Date.UTC(y, m, 0)).getUTCDate();
        return Array.from({ length: total }, (_, i) => {
            const day = i + 1;
            const date = `${period}-${String(day).padStart(2, '0')}`;
            const dow = new Date(Date.UTC(y, m - 1, day)).getUTCDay();
            return { day, date, dow: dow === 0 ? 7 : dow };
        });
    }, [period]);

    const markDay = async (date: string) => {
        const current = attMap[date] || '';
        const next = ATT_CYCLE[(ATT_CYCLE.indexOf(current as any) + 1) % ATT_CYCLE.length];
        try {
            await api.hr.markAttendance(staffRole, id!, { date, status: next });
            await loadMonth();
        } catch (e: any) {
            toast.error(e?.data?.error || e?.message || 'Belgilab bo\'lmadi');
        }
    };

    /* ── Bonus va jarima ── */
    const addAdjustment = async () => {
        const amount = Number(adjAmount);
        if (!adjReason.trim()) { toast.error('Sabab kiritilmagan'); return; }
        if (!(amount > 0)) { toast.error("Summa noldan katta bo'lishi kerak"); return; }
        setBusy(true);
        try {
            await api.hr.addAdjustment(staffRole, id!, {
                period, type: adjType, reason: adjReason.trim(), amount,
            });
            setAdjReason(''); setAdjAmount('');
            await loadMonth();
        } catch (e: any) {
            toast.error(e?.data?.error || e?.message || "Qo'shib bo'lmadi");
        } finally {
            setBusy(false);
        }
    };

    const deleteAdjustment = async (adjId: string) => {
        try {
            await api.hr.deleteAdjustment(adjId);
            await loadMonth();
        } catch (e: any) {
            toast.error(e?.data?.error || e?.message || "O'chirib bo'lmadi");
        }
    };

    const paySalary = async () => {
        if (!month) return;
        const ok = await confirmAction({
            title: `${periodLabel(period)} uchun ${formatMoney(month.due)} to'lansinmi?`,
            body: 'Pul kassadan xarajat bo\'lib chiqadi. To\'langan oy keyin o\'zgartirilmaydi.',
            confirmLabel: "To'lash",
        });
        if (!ok) return;
        setBusy(true);
        try {
            await api.hr.pay(staffRole, id!, { period, method: 'Cash' });
            addToast?.('success', "Oylik to'landi");
            await loadMonth();
        } catch (e: any) {
            toast.error(e?.data?.error || e?.message || "To'lab bo'lmadi");
        } finally {
            setBusy(false);
        }
    };

    const archive = async () => {
        if (!row) return;
        if (!await confirmAction({
            title: `${formatFullName(row)} ro'yxatdan chiqarilsinmi?`,
            body: "Yozuvlar va tarix saqlanadi — xodim faqat ishlamaydigan bo'lib qoladi va tizimga kira olmaydi.",
            danger: true, confirmLabel: "Ro'yxatdan chiqarish",
        })) return;
        try {
            await removeStaff(staffRole, row.id);
            onStaffChanged?.();
            navigate('/staff');
        } catch (e: any) {
            toast.error(e?.data?.error || e?.message || "O'chirib bo'lmadi");
        }
    };

    if (loading) {
        return <div className="p-6 text-center text-faint">Yuklanmoqda…</div>;
    }
    if (!row) {
        return (
            <div className="p-6 space-y-4">
                <Link to="/staff" className="inline-flex items-center gap-2 text-sm text-muted hover:text-primary-600">
                    <ArrowLeft className="w-4 h-4" /> Xodimlar ro'yxati
                </Link>
                <Card className="p-10 text-center text-muted">Xodim topilmadi</Card>
            </div>
        );
    }

    const depName = departments.find(d => d.id === row.departmentId)?.name;
    const isDoctor = staffRole === 'DOCTOR';
    const paid = !!month?.payment;

    const TABS: [Tab, string, React.ElementType][] = [
        ['general', 'Umumiy', Layers],
        ['salary', "Maosh ma'lumoti", Wallet],
        ['schedule', 'Ish grafigi', CalendarDays],
        ...(isDoctor ? [['rates', 'Stavkalar', Percent] as [Tab, string, React.ElementType]] : []),
    ];

    return (
        <div className="p-4 md:p-6 space-y-5">
            <Link to="/staff" className="inline-flex items-center gap-2 text-sm text-muted hover:text-primary-600">
                <ArrowLeft className="w-4 h-4" /> Xodimlar ro'yxati
            </Link>

            {/* ── Sarlavha ─────────────────────────────────────────────── */}
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-4 min-w-0">
                    <div className="h-16 w-16 md:h-20 md:w-20 rounded-full flex items-center justify-center text-white text-xl md:text-2xl font-bold shrink-0"
                        style={{ backgroundColor: row.color || '#94A3B8' }}>
                        {(row.firstName || '?')[0]}{(row.lastName || '')[0]}
                    </div>
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            <h1 className="text-2xl md:text-3xl font-bold text-ink truncate">
                                {formatFullName(row)}
                            </h1>
                            <button onClick={() => setEditing(true)} title="Tahrirlash"
                                className="p-1.5 text-faint hover:text-primary-600 rounded-md">
                                <Edit className="w-4 h-4" />
                            </button>
                        </div>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <span className={`px-2 py-0.5 rounded-md text-xs font-medium ${meta.badge}`}>
                                {meta.label}
                            </span>
                            {row.specialty && <span className="text-sm text-muted">{row.specialty}</span>}
                            {row.status !== 'Active' && (
                                <span className="px-2 py-0.5 rounded-md text-xs font-medium bg-elevated text-muted">
                                    {row.status === 'Vacation' ? "Ta'tilda" : 'Ishlamayapti'}
                                </span>
                            )}
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {row.phone && (
                        <a href={`tel:${row.phone}`} title="Qo'ng'iroq"
                            className="p-2.5 rounded-xl border border-line text-muted hover:text-primary-600">
                            <Phone className="w-4 h-4" />
                        </a>
                    )}
                    {row.email && (
                        <a href={`mailto:${row.email}`} title="Pochta"
                            className="p-2.5 rounded-xl border border-line text-muted hover:text-primary-600">
                            <Mail className="w-4 h-4" />
                        </a>
                    )}
                    <button onClick={archive} title="Ro'yxatdan chiqarish"
                        className="p-2.5 rounded-xl border border-line text-faint hover:text-red-600">
                        <Trash2 className="w-4 h-4" />
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-5 items-start">
                {/* ── Chap ustun ───────────────────────────────────────── */}
                <Card className="p-5 space-y-5">
                    <div className="rounded-xl border border-line p-4">
                        <p className="text-xs text-muted">Asosiy oylik</p>
                        <p className="text-2xl font-bold text-ink tabular-nums mt-0.5">
                            {row.fixedSalary ? formatMoney(row.fixedSalary) : '—'}
                            {!!row.fixedSalary && <span className="text-sm font-normal text-faint"> so'm</span>}
                        </p>
                        {isDoctor && (
                            <p className="text-[11px] text-faint mt-2 leading-relaxed">
                                Shifokorga bundan tashqari xizmat ulushi hisoblanadi — «Maosh»
                                bo'limida oy bo'yicha ko'rinadi.
                            </p>
                        )}
                    </div>

                    <div className="space-y-3">
                        <p className="text-xs font-bold text-faint uppercase tracking-wider">Aloqa ma'lumotlari</p>
                        {([
                            ['Telefon', row.phone ? formatUzPhone(row.phone) : null],
                            ['Qo\'shimcha', row.secondaryPhone ? formatUzPhone(row.secondaryPhone) : null],
                            ['Email', row.email || null],
                            ['Bo\'lim', depName || null],
                            ['Kabinet', row.room || null],
                            ['Ish soati', row.startHour != null && row.endHour != null
                                ? `${row.startHour}:00–${row.endHour}:00` : null],
                            ['Ish kunlari', workDays.length
                                ? workDays.map(n => WEEK.find(w => w.n === n)?.short).join(', ') : null],
                            ['Login', row.username || null],
                        ] as const).map(([label, value]) => (
                            <div key={label} className="flex items-center justify-between gap-3 text-sm">
                                <span className="text-muted">{label}</span>
                                <span className={value ? 'text-ink text-right' : 'text-faint'}>
                                    {value || '—'}
                                </span>
                            </div>
                        ))}
                    </div>
                </Card>

                {/* ── O'ng ustun ───────────────────────────────────────── */}
                <div className="space-y-5">
                    <Card className="p-0 overflow-hidden">
                        <div className="flex items-center gap-1 border-b border-line px-2 overflow-x-auto">
                            {TABS.map(([k, label, Icon]) => (
                                <button key={k} type="button" onClick={() => setTab(k)}
                                    className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${tab === k
                                        ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                                        : 'border-transparent text-muted hover:text-muted'}`}>
                                    <Icon className="w-4 h-4" /> {label}
                                </button>
                            ))}
                        </div>

                        <div className="p-5">
                            {/* ═══ UMUMIY ═══════════════════════════════ */}
                            {tab === 'general' && (
                                <div className="space-y-5">
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                        <div className="rounded-xl border border-line p-4">
                                            <p className="text-xs text-muted">
                                                {periodLabel(period)} oyligi
                                            </p>
                                            <p className="text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400 mt-1">
                                                {month ? formatMoney(month.due) : '—'}
                                            </p>
                                            <p className="text-[11px] text-faint mt-1">
                                                {paid ? "to'langan" : "to'lanmagan"}
                                            </p>
                                        </div>
                                        <div className="rounded-xl border border-line p-4">
                                            <p className="text-xs text-muted">Davomat</p>
                                            <p className="text-2xl font-bold tabular-nums text-ink mt-1">
                                                {month?.attendance?.present ?? 0}<span className="text-sm font-normal text-faint"> kun</span>
                                            </p>
                                            <p className="text-[11px] text-faint mt-1">kelgan kunlar</p>
                                        </div>
                                        <div className="rounded-xl border border-line p-4">
                                            <p className="text-xs text-muted">Kelmagan</p>
                                            <p className="text-2xl font-bold tabular-nums text-ink mt-1">
                                                {(month?.attendance?.absent ?? 0)}<span className="text-sm font-normal text-faint"> kun</span>
                                            </p>
                                            <p className="text-[11px] text-faint mt-1">
                                                sababli {month?.attendance?.excused ?? 0} · kechikish {month?.attendance?.late ?? 0}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Shifokorning ulushi — vedomostdan, MA'LUMOT uchun */}
                                    {isDoctor && month?.share && (
                                        <div className="rounded-xl border border-line p-4">
                                            <div className="flex items-center justify-between gap-3 mb-3">
                                                <p className="text-sm font-bold text-ink">
                                                    {periodLabel(period)} — xizmat ulushi
                                                </p>
                                                <button type="button" onClick={() => setTab('salary')}
                                                    className="text-xs text-primary-600 hover:underline">
                                                    Maosh bo'limi →
                                                </button>
                                            </div>
                                            {month.share.accrued === 0 ? (
                                                <p className="text-sm text-faint">
                                                    Bu oyda hisoblangan ulush yo'q: kassaga tushgan
                                                    to'lovda shifokor ko'rsatilgan bo'lishi kerak.
                                                </p>
                                            ) : (
                                                <div className="grid grid-cols-2 gap-4">
                                                    <div>
                                                        <p className="text-[11px] text-faint uppercase tracking-wide">Hisoblangan</p>
                                                        <p className="text-xl font-bold tabular-nums text-ink">
                                                            {formatMoney(month.share.accrued)}
                                                        </p>
                                                    </div>
                                                    <div>
                                                        <p className="text-[11px] text-faint uppercase tracking-wide">
                                                            {paid ? "To'langan" : "To'lanadi"}
                                                        </p>
                                                        <p className="text-xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                                                            {formatMoney(paid ? month.payment.amount : month.due)}
                                                        </p>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* ═══ MAOSH ════════════════════════════════ */}
                            {tab === 'salary' && (
                                <div className="space-y-5">
                                    <div className="flex items-center justify-between gap-3">
                                        <p className="text-sm font-bold text-ink">Maosh hisobi</p>
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
                                    </div>

                                    {monthLoading ? (
                                        <p className="text-sm text-faint py-8 text-center">Yuklanmoqda…</p>
                                    ) : !month ? (
                                        <p className="text-sm text-faint py-8 text-center">Hisob olinmadi</p>
                                    ) : (
                                        <>
                                            <div className={`flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium ${paid
                                                ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300'
                                                : 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300'}`}>
                                                {paid ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                                                {periodLabel(period)} — {paid
                                                    ? `to'langan (${formatMoney(month.payment.amount)}${month.payment.paidAt ? `, ${formatDate(month.payment.paidAt)}` : ''})`
                                                    : "to'lanmagan"}
                                            </div>

                                            <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5 items-start">
                                                {/* Bonus va jarima */}
                                                <div className="space-y-3">
                                                    <div className="flex items-center gap-1 bg-elevated p-1 rounded-xl w-fit">
                                                        {([['Bonus', "Qo'shimcha bonus"], ['Penalty', 'Jarima']] as const).map(([k, label]) => (
                                                            <button key={k} type="button" onClick={() => setAdjType(k)}
                                                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${adjType === k
                                                                    ? 'bg-surface text-primary-600 shadow-sm'
                                                                    : 'text-muted hover:text-muted'}`}>
                                                                {label}
                                                            </button>
                                                        ))}
                                                    </div>

                                                    {paid ? (
                                                        <p className="text-xs text-faint">
                                                            To'langan oyga yangi yozuv qo'shilmaydi — hujjat o'zgarmasligi kerak.
                                                        </p>
                                                    ) : (
                                                        <div className="flex flex-wrap items-end gap-2">
                                                            <Input containerClassName="flex-1 min-w-[180px]"
                                                                placeholder="Sababni kiriting…"
                                                                value={adjReason} onChange={e => setAdjReason(e.target.value)} />
                                                            <Input containerClassName="w-40" type="number" placeholder="Summa"
                                                                value={adjAmount} onChange={e => setAdjAmount(e.target.value)} />
                                                            <Button onClick={addAdjustment} disabled={busy}
                                                                variant={adjType === 'Penalty' ? 'danger' : 'primary'}>
                                                                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                                                            </Button>
                                                        </div>
                                                    )}

                                                    <div className="space-y-2">
                                                        {month.adjustments.length === 0 ? (
                                                            <p className="text-sm text-faint py-4">
                                                                Bu oyda bonus ham, jarima ham yo'q.
                                                            </p>
                                                        ) : month.adjustments.map((a: any) => (
                                                            <div key={a.id}
                                                                className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg border border-line">
                                                                <div className="min-w-0">
                                                                    <p className="text-sm text-ink truncate">{a.reason}</p>
                                                                    <p className="text-[11px] text-faint">
                                                                        {a.type === 'Bonus' ? 'Bonus' : 'Jarima'}
                                                                        {a.createdByName ? ` · ${a.createdByName}` : ''}
                                                                    </p>
                                                                </div>
                                                                <div className="flex items-center gap-2 shrink-0">
                                                                    <span className={`text-sm font-bold tabular-nums ${a.type === 'Bonus'
                                                                        ? 'text-emerald-600 dark:text-emerald-400'
                                                                        : 'text-red-600 dark:text-red-400'}`}>
                                                                        {a.type === 'Bonus' ? '+' : '−'}{formatMoney(a.amount)}
                                                                    </span>
                                                                    {!paid && (
                                                                        <button onClick={() => deleteAdjustment(a.id)}
                                                                            className="p-1 text-faint hover:text-red-600 rounded">
                                                                            <X className="w-4 h-4" />
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>

                                                {/* Hisob */}
                                                <div className="rounded-xl border border-line p-4 space-y-3">
                                                    <p className="text-sm font-bold text-primary-600 dark:text-primary-400">
                                                        {periodLabel(period)} — Hisob
                                                    </p>
                                                    <div className="flex items-center justify-between text-sm">
                                                        <span className="text-muted">
                                                            {isDoctor ? 'Ulush va oylik' : 'Asosiy'}
                                                        </span>
                                                        <span className="tabular-nums text-ink">
                                                            {formatMoney(month.base)}
                                                        </span>
                                                    </div>
                                                    {/* Shifokorda «asosiy» — SHU OYNING ulushi: kassaga
                                                        tushgan pulning foizi, ustiga fix maosh (agar
                                                        bo'lsa). Hisoblangan va allaqachon to'langan
                                                        summa ALOHIDA ko'rsatiladi — «nega raqam
                                                        kichik?» degan savol javobsiz qolmasin. */}
                                                    {isDoctor && month.share && (
                                                        <div className="-mt-1 space-y-1">
                                                            <p className="text-[11px] text-faint">
                                                                Hisoblangan {formatMoney(month.share.accrued)}
                                                                {month.share.items?.length ? ` · ${month.share.items.length} xizmat` : ''}
                                                            </p>
                                                            {month.share.paidViaRuns > 0 && (
                                                                <p className="text-[11px] text-amber-600 dark:text-amber-400">
                                                                    Eski vedomost orqali to'langan −{formatMoney(month.share.paidViaRuns)}
                                                                </p>
                                                            )}
                                                        </div>
                                                    )}
                                                    <div className="flex items-center justify-between text-sm">
                                                        <span className="text-emerald-600 dark:text-emerald-400">
                                                            Bonus ({month.adjustments.filter((a: any) => a.type === 'Bonus').length})
                                                        </span>
                                                        <span className="tabular-nums text-emerald-600 dark:text-emerald-400">
                                                            +{formatMoney(month.bonus)}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center justify-between text-sm">
                                                        <span className="text-red-600 dark:text-red-400">
                                                            Jarima ({month.adjustments.filter((a: any) => a.type === 'Penalty').length})
                                                        </span>
                                                        <span className="tabular-nums text-red-600 dark:text-red-400">
                                                            −{formatMoney(month.penalty)}
                                                        </span>
                                                    </div>
                                                    <div className="border-t border-dashed border-line pt-3 flex items-end justify-between">
                                                        <span className="text-sm font-bold text-ink">
                                                            To'lanishi kerak
                                                        </span>
                                                        <span className="text-2xl font-black tabular-nums text-ink">
                                                            {formatMoney(month.due)}
                                                        </span>
                                                    </div>
                                                    {!paid && (
                                                        <Button className="w-full" onClick={paySalary}
                                                            disabled={busy || !(month.due > 0)}>
                                                            <Wallet className="w-4 h-4 mr-2" />
                                                            {isDoctor ? "Ulushni to'lash" : "Maosh to'lash"}
                                                        </Button>
                                                    )}
                                                </div>
                                            </div>
                                        </>
                                    )}
                                </div>
                            )}

                            {/* ═══ ISH GRAFIGI ══════════════════════════ */}
                            {tab === 'schedule' && (
                                <div className="space-y-6">
                                    <div>
                                        <div className="flex items-center justify-between gap-3 mb-3">
                                            <p className="text-sm font-bold text-ink">Haftalik ish kunlari</p>
                                            {savingDays && <Loader2 className="w-4 h-4 animate-spin text-faint" />}
                                        </div>
                                        <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
                                            {WEEK.map(d => {
                                                const on = workDays.includes(d.n);
                                                return (
                                                    <button key={d.n} type="button" onClick={() => toggleDay(d.n)}
                                                        /* Kun nomi to'liq ATAYLAB: tugma ichida ikki qisqartma
                                                           bor va ularsiz o'qish dasturi «Ch Cho» deb o'qiydi. */
                                                        aria-label={d.full} aria-pressed={on}
                                                        className={`py-3 rounded-xl border text-center transition-colors ${on
                                                            ? 'bg-primary-600 border-primary-600 text-white'
                                                            : 'border-line text-muted hover:border-primary-400'}`}>
                                                        <span className="block text-sm font-bold">{d.short}</span>
                                                        <span className="block text-[10px] opacity-70">{d.full.slice(0, 3)}</span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                        {workDays.length === 0 && (
                                            <p className="text-xs text-amber-600 dark:text-amber-400 mt-3">
                                                Ish grafigi belgilanmagan — haftalik yuklama hisoblanmaydi.
                                            </p>
                                        )}
                                    </div>

                                    <div>
                                        <div className="flex items-center justify-between gap-3 mb-3">
                                            <p className="text-sm font-bold text-ink">Davomat</p>
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
                                        </div>

                                        <div className="grid grid-cols-7 gap-1.5">
                                            {WEEK.map(d => (
                                                <div key={d.n} className="text-center text-[10px] text-faint uppercase pb-1">
                                                    {d.short}
                                                </div>
                                            ))}
                                            {/* Oyning birinchi kunigacha bo'sh kataklar */}
                                            {Array.from({ length: (monthDays[0]?.dow || 1) - 1 }).map((_, i) => (
                                                <div key={`pad-${i}`} />
                                            ))}
                                            {monthDays.map(d => {
                                                const st = attMap[d.date];
                                                const ui = st ? ATT_UI[st] : null;
                                                const scheduled = workDays.includes(d.dow);
                                                return (
                                                    <button key={d.date} type="button" onClick={() => markDay(d.date)}
                                                        title={ui ? ui.label : 'Belgilanmagan'}
                                                        className={`aspect-square rounded-lg border text-xs font-medium transition-colors ${ui
                                                            ? ui.cls
                                                            : scheduled
                                                                ? 'border-line text-muted hover:border-primary-400'
                                                                : 'border-line-soft text-faint hover:border-primary-400'}`}>
                                                        {d.day}
                                                    </button>
                                                );
                                            })}
                                        </div>

                                        <div className="flex flex-wrap items-center gap-3 mt-3">
                                            {Object.entries(ATT_UI).map(([k, v]) => (
                                                <span key={k} className="flex items-center gap-1.5 text-[11px] text-muted">
                                                    <span className={`w-3 h-3 rounded ${v.cls.split(' ')[0]}`} /> {v.label}
                                                </span>
                                            ))}
                                            <span className="text-[11px] text-faint ml-auto">
                                                Kunni bosing — holat aylanadi. Davomat oylikdan avtomatik ushlanmaydi.
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* ═══ STAVKALAR ════════════════════════════ */}
                            {tab === 'rates' && isDoctor && (
                                <DoctorRatesEditor
                                    doctorId={row.id}
                                    fallbackPercent={row.percentage ?? null}
                                    departments={departments}
                                    services={services}
                                    clinicId={clinicId}
                                    addToast={addToast}
                                />
                            )}
                        </div>
                    </Card>
                </div>
            </div>

            {editing && (
                <StaffForm
                    mode="edit" role={staffRole} row={row}
                    departments={departments} services={services}
                    onClose={() => setEditing(false)}
                    onSaved={async () => {
                        setEditing(false);
                        await loadRow();
                        await loadMonth();
                        onStaffChanged?.();
                    }}
                />
            )}
        </div>
    );
};

export default StaffCard;
