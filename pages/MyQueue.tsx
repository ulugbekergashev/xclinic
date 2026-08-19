import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Stethoscope, RefreshCw, Clock, Volume2, CheckCircle,
    FlaskConical, AlertCircle, X, ArrowRight,
} from 'lucide-react';
import { Visit, Department, UserRole } from '../types';
import { api } from '../services/api';

/* ─────────────────────────────────────────────────────────────────────────────
   Shifokorning bugungi navbati.

   Ilgari shifokor registratura ro'yxatidan o'tardi — bu noto'g'ri edi, chunki
   u begona bemorlarni ham ko'rardi. Endi u faqat O'ZIGA (yoki o'z bo'limiga)
   biriktirilgan qabullarni ko'radi.

   "Natija kutilmoqda" alohida guruh: bemor laboratoriyaga ketgan, qabul ochiq
   turibdi lekin navbatni band qilmaydi.
   ───────────────────────────────────────────────────────────────────────────── */

const STATUS_UI: Record<string, { label: string; cls: string }> = {
    Waiting: { label: 'Navbatda', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
    Called: { label: 'Chaqirildi', cls: 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400' },
    'In Progress': { label: 'Qabulda', cls: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400' },
    AwaitingResults: { label: 'Natija kutilmoqda', cls: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' },
    Completed: { label: 'Yakunlandi', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
};

interface Props {
    userRole: UserRole;
    doctorId?: string;
    departments: Department[];
    addToast: (type: 'success' | 'error' | 'info', msg: string) => void;
}

const today = () => new Date().toISOString().split('T')[0];

/** Necha daqiqadan beri kutyapti */
const waitedMin = (v: Visit) => {
    const from = v.checkInTime ? new Date(v.checkInTime).getTime() : 0;
    if (!from) return null;
    return Math.max(0, Math.round((Date.now() - from) / 60000));
};

export const MyQueue: React.FC<Props> = ({ userRole, doctorId, departments, addToast }) => {
    const navigate = useNavigate();
    const [visits, setVisits] = useState<Visit[]>([]);
    const [deptFilter, setDeptFilter] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const reload = useCallback(async () => {
        try {
            // Shifokor faqat o'zinikini, admin/registrator hammasini ko'radi
            const params: any = { date: today() };
            if (userRole === UserRole.DOCTOR && doctorId) params.doctorId = doctorId;
            setVisits(await api.visits.getAll(params));
            setError('');
        } catch (e: any) { setError(e.message || 'Yuklab bo\'lmadi'); }
        finally { setLoading(false); }
    }, [userRole, doctorId]);

    useEffect(() => { reload(); }, [reload]);

    // Navbat o'zgarib turadi — har yarim daqiqada yangilanadi
    useEffect(() => {
        const t = setInterval(reload, 30000);
        return () => clearInterval(t);
    }, [reload]);

    const filtered = useMemo(
        () => deptFilter ? visits.filter(v => v.departmentId === deptFilter) : visits,
        [visits, deptFilter],
    );

    const groups = useMemo(() => ({
        active: filtered.filter(v => ['Waiting', 'Called', 'In Progress'].includes(v.status as string)),
        awaiting: filtered.filter(v => v.status === 'AwaitingResults'),
        done: filtered.filter(v => v.status === 'Completed'),
    }), [filtered]);

    const call = async (v: Visit) => {
        try {
            await api.visits.call(v.id);
            addToast('success', `Navbat №${v.queueNumber} chaqirildi`);
            reload();
        } catch (e: any) { addToast('error', e.message || 'Chaqirib bo\'lmadi'); }
    };

    const open = async (v: Visit) => {
        // Chaqirilgan bemor ochilganda qabul boshlangan hisoblanadi
        if (v.status === 'Waiting' || v.status === 'Called') {
            try { await api.visits.update(v.id, { status: 'In Progress' }); } catch { /* ochilaversin */ }
        }
        navigate(`/visit/${v.id}`);
    };

    const inputCls = 'px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500';

    const Card: React.FC<{ v: Visit; showCall?: boolean }> = ({ v, showCall }) => {
        const st = STATUS_UI[v.status as string] || STATUS_UI.Waiting;
        const wait = waitedMin(v);
        return (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-3 flex items-center gap-3">
                <span className="w-11 h-11 rounded-lg bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300 grid place-items-center font-bold shrink-0">
                    {v.queueNumber ?? '—'}
                </span>
                <div className="min-w-0 flex-1">
                    <p className="font-medium text-gray-900 dark:text-white truncate">
                        {v.patient?.lastName} {v.patient?.firstName}
                    </p>
                    <div className="flex items-center gap-2 flex-wrap mt-0.5">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${st.cls}`}>{st.label}</span>
                        <span className="text-xs text-gray-500 dark:text-gray-400 truncate">
                            {v.department?.name || '—'}
                        </span>
                        {v.status === 'Waiting' && wait != null && wait > 0 && (
                            <span className="text-xs text-gray-400 flex items-center gap-1">
                                <Clock className="w-3 h-3" />{wait} daq
                            </span>
                        )}
                    </div>
                    {v.complaints && (
                        <p className="text-xs text-gray-400 dark:text-gray-500 truncate mt-0.5">{v.complaints}</p>
                    )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    {showCall && v.status === 'Waiting' && (
                        <button onClick={() => call(v)} title="Chaqirish"
                            className="p-2 text-gray-400 hover:text-primary-600 rounded-lg border border-gray-200 dark:border-gray-700">
                            <Volume2 className="w-4 h-4" />
                        </button>
                    )}
                    <button onClick={() => open(v)}
                        className="px-3 py-1.5 text-xs font-medium bg-primary-600 text-white rounded-lg hover:bg-primary-700 flex items-center gap-1">
                        Ochish <ArrowRight className="w-3 h-3" />
                    </button>
                </div>
            </div>
        );
    };

    return (
        <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 mr-auto">
                    <Stethoscope className="w-6 h-6 text-primary-600 dark:text-primary-400" />
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                        {userRole === UserRole.DOCTOR ? 'Mening navbatim' : 'Bugungi qabullar'}
                    </h2>
                </div>
                {userRole !== UserRole.DOCTOR && (
                    <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)} className={inputCls}>
                        <option value="">Barcha bo'limlar</option>
                        {departments.filter(d => d.isActive && d.type === 'CLINICAL').map(d => (
                            <option key={d.id} value={d.id}>{d.name}</option>
                        ))}
                    </select>
                )}
                <button onClick={reload} className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200" title="Yangilash">
                    <RefreshCw className="w-5 h-5" />
                </button>
            </div>

            {error && (
                <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                    <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                    <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
                    <button onClick={() => setError('')} className="ml-auto text-red-400 hover:text-red-600"><X className="w-4 h-4" /></button>
                </div>
            )}

            {loading ? (
                <p className="text-sm text-gray-400 py-10 text-center">Yuklanmoqda...</p>
            ) : (
                <div className="space-y-6">
                    <section>
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
                            Navbatda <span className="text-gray-400 font-normal">({groups.active.length})</span>
                        </h3>
                        {groups.active.length === 0 ? (
                            <div className="text-center py-10 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
                                <CheckCircle className="w-10 h-10 mx-auto text-emerald-400 mb-2" />
                                <p className="text-sm text-gray-500 dark:text-gray-400">Navbat bo'sh</p>
                            </div>
                        ) : (
                            <div className="space-y-2">{groups.active.map(v => <Card key={v.id} v={v} showCall />)}</div>
                        )}
                    </section>

                    {groups.awaiting.length > 0 && (
                        <section>
                            <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white mb-2">
                                <FlaskConical className="w-4 h-4 text-purple-500" />
                                Natija kutilmoqda <span className="text-gray-400 font-normal">({groups.awaiting.length})</span>
                            </h3>
                            <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">
                                Bemor tahlil yoki tekshiruvga ketgan. Qabul ochiq, lekin navbatni band qilmaydi.
                            </p>
                            <div className="space-y-2">{groups.awaiting.map(v => <Card key={v.id} v={v} />)}</div>
                        </section>
                    )}

                    {groups.done.length > 0 && (
                        <section>
                            <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-2">
                                Yakunlangan ({groups.done.length})
                            </h3>
                            <div className="space-y-2 opacity-70">{groups.done.slice(0, 10).map(v => <Card key={v.id} v={v} />)}</div>
                        </section>
                    )}
                </div>
            )}
        </div>
    );
};
