import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, Button } from '../components/Common';
import { api } from '../services/api';
import { toast } from '../services/toast';
import { formatFullName, formatMoney } from '../utils/format';
import { formatUzPhone } from '../shared/validation';
import { Department, Service, Doctor } from '../types';
import { StaffForm, StaffRow, ROLES, roleMeta, StaffRole } from '../components/StaffForm';
import { Payroll } from './Payroll';
import { StaffAttendanceReport } from '../components/StaffAttendanceReport';
import {
    Plus, Search, Users, Wallet, Activity, UserCheck, Percent,
} from 'lucide-react';

/* ─────────────────────────────────────────────────────────────────────────────
   XODIMLAR — ALOHIDA MODUL.

   Ilgari u Sozlamalar ichidagi vkladka edi, ulush va vedomost esa Moliyada.
   Ya'ni bitta savolga («bu odam qancha oladi va qancha ishladi?») javob
   izlayotgan odam ikkita bo'limni kezib chiqishi kerak edi.

   Endi bitta joy: ro'yxat, xodim kartasi, stavkalar va vedomost.

   RAQAMLAR SERVERDAN. Yuqoridagi to'rtta karta `/api/hr/summary` dan keladi.
   Ularni ekranda proplardan sanash mumkin edi, lekin prop ro'yxati har doim
   ham to'liq bo'lmaydi — MODUL-ISHLARI dagi qoida aynan shu haqda: propdan
   sanalgan son jimgina yolg'on ko'rsatadi.
   ───────────────────────────────────────────────────────────────────────────── */

interface Props {
    departments?: Department[];
    services?: Service[];
    doctors?: Doctor[];
    clinicId?: string;
    addToast?: (type: 'success' | 'error' | 'info', msg: string) => void;
    /** Ro'yxat o'zgargach App dagi keshni yangilash */
    onStaffChanged?: () => void;
}

type Tab = 'people' | 'payroll' | 'attendance';

/** Yuklama chizig'i — foiz bo'lmasa chiziq ham chizilmaydi. */
const LoadBar: React.FC<{ percent: number | null }> = ({ percent }) => {
    if (percent == null) return <span className="text-faint">—</span>;
    const color = percent >= 90 ? 'bg-red-500' : percent >= 60 ? 'bg-amber-500' : 'bg-emerald-500';
    return (
        <div className="flex items-center gap-2">
            <div className="w-24 h-1.5 rounded-full bg-elevated overflow-hidden">
                <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, percent)}%` }} />
            </div>
            <span className="text-xs text-muted tabular-nums">{percent}%</span>
        </div>
    );
};

const StatCard: React.FC<{
    title: string; value: React.ReactNode; hint?: React.ReactNode;
    icon: React.ElementType; tone?: 'default' | 'warn';
}> = ({ title, value, hint, icon: Icon, tone = 'default' }) => (
    <Card className="p-5">
        <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
                <p className="text-sm text-muted">{title}</p>
                <p className="text-3xl font-bold text-ink mt-1 tabular-nums">{value}</p>
                {hint && (
                    <p className={`text-xs mt-2 ${tone === 'warn'
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-muted'}`}>{hint}</p>
                )}
            </div>
            <Icon className="w-5 h-5 text-faint shrink-0" />
        </div>
    </Card>
);

export const Staff: React.FC<Props> = ({
    departments = [], services = [], doctors = [], clinicId, addToast, onStaffChanged,
}) => {
    const navigate = useNavigate();

    /* Vkladka MANZILDA turadi: xodim kartasidagi «Vedomost →» havolasi
       to'g'ridan-to'g'ri o'sha bo'limni ochsin, va sahifa yangilanganda
       odam boshiga qaytmasin. */
    const [searchParams, setSearchParams] = useSearchParams();
    const q = searchParams.get('tab');
    const tab: Tab = q === 'payroll' ? 'payroll' : q === 'attendance' ? 'attendance' : 'people';
    const setTab = (next: Tab) => {
        const p = new URLSearchParams(searchParams);
        if (next === 'people') p.delete('tab'); else p.set('tab', next);
        setSearchParams(p, { replace: true });
    };

    const [rows, setRows] = useState<StaffRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [summary, setSummary] = useState<any>(null);
    const [workload, setWorkload] = useState<Record<string, any>>({});
    const [search, setSearch] = useState('');
    const [roleFilter, setRoleFilter] = useState<StaffRole | 'all' | 'archive'>('all');

    const [creatingRole, setCreatingRole] = useState<StaffRole | null>(null);
    const [pickRole, setPickRole] = useState(false);

    const load = useCallback(async () => {
        try {
            setLoading(true);
            const [staff, sum, wl] = await Promise.all([
                api.staff.getAll(),
                api.hr.summary().catch(() => null),
                api.hr.workload().catch(() => null),
            ]);
            setRows(staff);
            setSummary(sum);
            const map: Record<string, any> = {};
            for (const r of (wl?.rows || [])) map[r.doctorId] = r;
            setWorkload(map);
        } catch (e: any) {
            toast.error(e?.data?.error || e?.message || "Xodimlar ro'yxati olinmadi");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return rows.filter(r => {
            /* «Arxiv» — ishdan ketganlar. Ular boshqa filtrlarda
               KO'RINMAYDI: ro'yxatning maqsadi «hozir kim ishlaydi». */
            const archived = r.status !== 'Active';
            if (roleFilter === 'archive') { if (!archived) return false; }
            else if (archived) return false;
            if (roleFilter !== 'all' && roleFilter !== 'archive' && r.role !== roleFilter) return false;
            if (!q) return true;
            return `${r.lastName} ${r.firstName} ${r.specialty || ''} ${r.username || ''} ${r.phone || ''}`
                .toLowerCase().includes(q);
        });
    }, [rows, roleFilter, search]);

    const counts = useMemo(() => {
        const map: Record<string, number> = { all: 0, archive: 0 };
        for (const r of rows) {
            if (r.status !== 'Active') { map.archive++; continue; }
            map.all++;
            map[r.role] = (map[r.role] || 0) + 1;
        }
        return map;
    }, [rows]);

    const depName = (id?: string | null) => departments.find(d => d.id === id)?.name;

    const afterChange = async () => {
        setCreatingRole(null);
        await load();
        onStaffChanged?.();
    };

    return (
        <div className="p-4 md:p-6 space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-ink">Xodimlar</h1>
                    <p className="text-sm text-muted mt-1">
                        Klinikada kim ishlaydi, qancha oladi va qancha yuklangan
                    </p>
                </div>
                {tab === 'people' && (
                    <div className="relative">
                        <Button onClick={() => setPickRole(v => !v)}>
                            <Plus className="w-4 h-4 mr-1" /> Yangi xodim
                        </Button>
                        {pickRole && (
                            <div className="absolute right-0 mt-2 w-56 bg-surface border border-line rounded-xl shadow-lg z-20 p-1">
                                {ROLES.map(r => (
                                    <button key={r.key} type="button"
                                        onClick={() => { setPickRole(false); setCreatingRole(r.key); }}
                                        className="w-full text-left px-3 py-2 rounded-lg hover:bg-elevated">
                                        <span className="block text-sm font-medium text-ink">{r.label}</span>
                                        <span className="block text-xs text-muted">{r.hint}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* ── Ikkita bo'lim: odamlar va ulush ────────────────────────────
                Vedomost MOLIYADAN KO'CHDI. U yerda u kassa va foyda bilan bir
                qatorda turardi, aslida esa xodim haqidagi savol: kimga qancha
                hisoblandi. */}
            <div className="flex items-center gap-1 bg-elevated p-1 rounded-xl w-fit">
                {([
                    ['people', 'Xodimlar'],
                    ['payroll', 'Ulush va vedomost'],
                    ['attendance', 'Davomat'],
                ] as const).map(([k, label]) => (
                    <button key={k} type="button" onClick={() => setTab(k)}
                        className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${tab === k
                            ? 'bg-surface text-primary-600 shadow-sm'
                            : 'text-muted hover:text-muted'}`}>
                        {label}
                    </button>
                ))}
            </div>

            {tab === 'payroll' ? (
                <Payroll doctors={doctors} clinicId={clinicId} addToast={addToast} />
            ) : tab === 'attendance' ? (
                <StaffAttendanceReport />
            ) : (
                <>
                    {/* ── To'rtta raqam ─────────────────────────────────── */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                        <StatCard
                            title="Jami xodim" icon={Users}
                            value={summary ? summary.total : '—'}
                            hint={summary
                                ? `${summary.byRole?.DOCTOR || 0} shifokor, ${summary.total - (summary.byRole?.DOCTOR || 0)} boshqa lavozim`
                                : undefined}
                        />
                        <StatCard
                            title="Bu hafta qabul qilmoqda" icon={UserCheck}
                            value={summary ? summary.working : '—'}
                            hint={summary
                                ? (summary.working === summary.doctors && summary.doctors > 0
                                    ? 'Barcha shifokorda qabul bor'
                                    : `${summary.doctors} shifokordan`)
                                : undefined}
                            tone={summary && summary.doctors > summary.working ? 'warn' : 'default'}
                        />
                        <StatCard
                            title="O'rtacha yuklama" icon={Activity}
                            value={summary?.avgLoad != null ? <>{summary.avgLoad}<span className="text-lg text-faint"> %</span></> : '—'}
                            hint={summary?.avgLoad != null
                                ? `ish grafigi belgilangan ${summary.loadKnownFor} shifokor bo'yicha`
                                : 'ish grafigi hech kimga belgilanmagan'}
                            tone={summary?.avgLoad == null ? 'warn' : 'default'}
                        />
                        <StatCard
                            title="Oylik fond" icon={Wallet}
                            value={summary ? formatMoney(summary.salaryFund) : '—'}
                            hint={summary?.noSalary
                                ? `${summary.noSalary} ta xodimning oyligi kiritilmagan`
                                : 'hamma xodimning oyligi kiritilgan'}
                            tone={summary?.noSalary ? 'warn' : 'default'}
                        />
                    </div>

                    {/* ── Filtr ─────────────────────────────────────────── */}
                    <div className="flex flex-wrap items-center gap-2">
                        <button type="button" onClick={() => setRoleFilter('all')}
                            className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${roleFilter === 'all'
                                ? 'bg-primary-600 text-white border-primary-600'
                                : 'bg-surface border-line text-muted hover:border-primary-400'}`}>
                            Barchasi <span className="opacity-70">{counts.all}</span>
                        </button>
                        {ROLES.map(r => (
                            <button key={r.key} type="button" onClick={() => setRoleFilter(r.key)}
                                className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${roleFilter === r.key
                                    ? 'bg-primary-600 text-white border-primary-600'
                                    : 'bg-surface border-line text-muted hover:border-primary-400'}`}>
                                {r.label} <span className="opacity-70">{counts[r.key] || 0}</span>
                            </button>
                        ))}
                        {counts.archive > 0 && (
                            <button type="button" onClick={() => setRoleFilter('archive')}
                                className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${roleFilter === 'archive'
                                    ? 'bg-elevated text-white border-line'
                                    : 'bg-surface border-line text-muted hover:border-line'}`}>
                                Arxiv <span className="opacity-70">{counts.archive}</span>
                            </button>
                        )}
                        <div className="relative ml-auto">
                            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
                            <input value={search} onChange={e => setSearch(e.target.value)}
                                placeholder="Ism, lavozim yoki telefon"
                                className="pl-9 pr-3 py-2 w-64 border border-line rounded-lg bg-surface text-sm focus:ring-2 focus:ring-primary-500 outline-none" />
                        </div>
                    </div>

                    {/* ── Jadval ────────────────────────────────────────── */}
                    <Card className="overflow-hidden">
                        {loading ? (
                            <div className="py-16 text-center text-faint">Yuklanmoqda…</div>
                        ) : filtered.length === 0 ? (
                            <div className="py-16 text-center text-muted">
                                {search || roleFilter !== 'all' ? 'Mos xodim topilmadi' : "Hali xodim qo'shilmagan"}
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="text-left text-xs text-muted border-b border-line">
                                            <th className="py-3 px-4 font-medium">Xodim</th>
                                            <th className="py-3 px-4 font-medium">Lavozim</th>
                                            <th className="py-3 px-4 font-medium">Rol</th>
                                            <th className="py-3 px-4 font-medium">Bo'lim</th>
                                            <th className="py-3 px-4 font-medium">Haftalik yuklama</th>
                                            <th className="py-3 px-4 font-medium text-right">Oylik</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filtered.map(row => {
                                            const meta = roleMeta(row.role);
                                            const wl = row.role === 'DOCTOR' ? workload[row.id] : null;
                                            return (
                                                <tr key={`${row.role}-${row.id}`}
                                                    onClick={() => navigate(`/staff/${row.role}/${row.id}`)}
                                                    className="border-b border-line-soft last:border-0 hover:bg-elevated cursor-pointer">
                                                    <td className="py-3 px-4">
                                                        <div className="flex items-center gap-3">
                                                            <div className="h-9 w-9 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                                                                style={{ backgroundColor: row.color || '#94A3B8' }}>
                                                                {(row.firstName || '?')[0]}{(row.lastName || '')[0]}
                                                            </div>
                                                            <div className="min-w-0">
                                                                <p className="font-medium text-ink truncate">
                                                                    {formatFullName(row)}
                                                                </p>
                                                                {row.phone && (
                                                                    <p className="text-xs text-faint truncate">{formatUzPhone(row.phone)}</p>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="py-3 px-4 text-muted">
                                                        {row.specialty || <span className="text-faint">—</span>}
                                                    </td>
                                                    <td className="py-3 px-4">
                                                        <span className={`px-2 py-1 rounded-md text-xs font-medium ${meta.badge}`}>
                                                            {meta.label}
                                                        </span>
                                                    </td>
                                                    <td className="py-3 px-4 text-muted">
                                                        {depName(row.departmentId) || <span className="text-faint">—</span>}
                                                    </td>
                                                    <td className="py-3 px-4">
                                                        {row.role === 'DOCTOR'
                                                            ? <LoadBar percent={wl?.percent ?? null} />
                                                            : <span className="text-faint">—</span>}
                                                    </td>
                                                    <td className="py-3 px-4 text-right tabular-nums text-ink">
                                                        {row.fixedSalary
                                                            ? formatMoney(row.fixedSalary)
                                                            : <span className="text-faint">—</span>}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </Card>

                    {/* Shifokorda yuklama ish grafigidan hisoblanadi — buni
                        aytib qo'yamiz, aks holda bo'sh ustun «xato» bo'lib
                        ko'rinadi. */}
                    {!loading && filtered.some(r => r.role === 'DOCTOR' && workload[r.id]?.percent == null) && (
                        <p className="text-xs text-muted flex items-center gap-1.5">
                            <Percent className="w-3.5 h-3.5" />
                            Yuklama ish grafigidan hisoblanadi: xodim kartasida hafta kunlari va ish
                            soatlari belgilangach ko'rinadi.
                        </p>
                    )}
                </>
            )}

            {creatingRole && (
                <StaffForm
                    mode="create" role={creatingRole}
                    departments={departments} services={services}
                    onClose={() => setCreatingRole(null)}
                    onSaved={afterChange}
                />
            )}
        </div>
    );
};

export default Staff;
