import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { todayISO } from '../utils/dateUtils';
import { useNavigate } from 'react-router-dom';
import {
    Stethoscope, RefreshCw, Clock, Volume2, CheckCircle,
    FlaskConical, AlertCircle, X, ArrowRight, BellRing, CalendarClock,
} from 'lucide-react';
import { Visit, Department, UserRole } from '../types';
import { api } from '../services/api';
import { SkeletonList } from '../components/Common';
import { useLanguage } from '../context/LanguageContext';
import { useLiveUpdates, useLiveHealthy, LiveEventType } from '../hooks/useLiveUpdates';

/* Modul darajasida: `useLiveUpdates` bog'liqlik sifatida ishlatadi, ya'ni
   har renderda yangi massiv bersak qayta-qayta obuna bo'lardi. */
const LIVE_EVENTS: LiveEventType[] = ['visit.created', 'visit.status', 'charge.paid'];

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

const today = () => todayISO();

/** Necha daqiqadan beri kutyapti */
const waitedMin = (v: Visit) => {
    const from = v.checkInTime ? new Date(v.checkInTime).getTime() : 0;
    if (!from) return null;
    return Math.max(0, Math.round((Date.now() - from) / 60000));
};

export const MyQueue: React.FC<Props> = ({ userRole, doctorId, departments, addToast }) => {
    const { t } = useLanguage();
    const navigate = useNavigate();
    const [visits, setVisits] = useState<Visit[]>([]);
    /* "Natija kutilmoqda" ro'yxati serverdan alohida olinadi.
       Sabab: bu ekran BUGUNGI sanani so'raydi, tahlil esa ertaga tayyor
       bo'lishi mumkin — o'sha qabul kechagi kunda qolib, shifokor ko'zidan
       butunlay g'oyib bo'lardi (GAP-ANALYSIS, B22). */
    const [pending, setPending] = useState<any[]>([]);
    const [deptFilter, setDeptFilter] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const reload = useCallback(async () => {
        try {
            // Shifokor faqat o'zinikini, admin/registrator hammasini ko'radi
            const params: any = { date: today() };
            if (userRole === UserRole.DOCTOR && doctorId) params.doctorId = doctorId;
            const [list, pend] = await Promise.all([
                api.visits.getAll(params),
                // Bu ro'yxat bo'sh qaytsa ham navbat ko'rinishi kerak
                api.clinical.pendingResults().catch(() => []),
            ]);
            setVisits(list);
            setPending(pend || []);
            setError('');
        } catch (e: any) { setError(e.message || 'Yuklab bo\'lmadi'); }
        finally { setLoading(false); }
    }, [userRole, doctorId]);

    useEffect(() => { reload(); }, [reload]);

    /* Real vaqtda: registrator qabul ochsa yoki kassir to'lov qabul qilsa,
       shifokorning ro'yxati DARHOL yangilanadi. Ilgari 30 soniyagacha
       kutardi. */
    const streamOk = useLiveHealthy();
    useLiveUpdates(LIVE_EVENTS, reload);

    // Navbat o'zgarib turadi — oqim uzilsa polling zaxira bo'lib qoladi
    useEffect(() => {
        /* Polling ZAXIRA sifatida qoladi: oqim ishlayotganda u ortiqcha,
           lekin oqim uzilsa yagona yangilanish yo'li bo'lib qoladi. */
        const t = setInterval(reload, streamOk ? 120000 : 30000);
        return () => clearInterval(t);
    }, [reload, streamOk]);

    const filtered = useMemo(
        () => deptFilter ? visits.filter(v => v.departmentId === deptFilter) : visits,
        [visits, deptFilter],
    );

    const groups = useMemo(() => ({
        active: filtered.filter(v => ['Waiting', 'Called', 'In Progress'].includes(v.status as string)),
        done: filtered.filter(v => v.status === 'Completed'),
    }), [filtered]);

    // Natijasi TAYYOR, lekin shifokor ochib ko'rmagan — eng oson yo'qoladigan ish
    const ready = useMemo(() => pending.filter(r => (r.unseenCount || 0) > 0), [pending]);
    const stillWaiting = useMemo(() => pending.filter(r => (r.unseenCount || 0) === 0), [pending]);

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
        /* To'g'ridan-to'g'ri kartaga. `/visit/:id` ham ishlaydi, lekin u
           avval qabulni so'rab, keyin yo'naltiradi — ortiqcha qadam. */
        navigate(`/patients/${v.patientId}?visit=${v.id}`);
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
                        <button onClick={() => call(v)} title={t('queue.call')}
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

    /** Natija kutayotgan qabul — bugungi navbat kartochkasidan boshqa shakl:
        bu yerda muhimi navbat raqami emas, natija tayyor bo'lgani va qancha
        vaqt o'tgani. */
    const PendingCard: React.FC<{ r: any; highlight?: boolean }> = ({ r, highlight }) => {
        const stale = r.date !== today();
        return (
            <div className={`rounded-xl border p-3 flex items-center gap-3 ${highlight
                ? 'bg-purple-50 dark:bg-purple-900/20 border-purple-300 dark:border-purple-800'
                : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'}`}>
                <span className={`w-11 h-11 rounded-lg grid place-items-center shrink-0 ${highlight
                    ? 'bg-purple-200 text-purple-800 dark:bg-purple-900/50 dark:text-purple-200'
                    : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-300'}`}>
                    <FlaskConical className="w-5 h-5" />
                </span>
                <div className="min-w-0 flex-1">
                    <p className="font-medium text-gray-900 dark:text-white truncate">{r.patientName || '—'}</p>
                    <div className="flex items-center gap-2 flex-wrap mt-0.5">
                        {highlight && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-200 text-purple-900 dark:bg-purple-900/50 dark:text-purple-200">
                                {r.unseenCount} NATIJA TAYYOR
                            </span>
                        )}
                        {r.stillPending > 0 && (
                            <span className="text-xs text-gray-400">{r.stillPending} ta hali kutilmoqda</span>
                        )}
                        <span className="text-xs text-gray-500 dark:text-gray-400 truncate">{r.department || '—'}</span>
                        {stale && (
                            <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                                <CalendarClock className="w-3 h-3" />
                                {r.date}
                            </span>
                        )}
                    </div>
                </div>
                <button onClick={() => navigate(`/patients/${r.patientId}?visit=${r.visitId}`)}
                    className={`shrink-0 px-3 py-1.5 text-xs font-medium rounded-lg flex items-center gap-1 text-white ${highlight
                        ? 'bg-purple-600 hover:bg-purple-700' : 'bg-primary-600 hover:bg-primary-700'}`}>
                    Ochish <ArrowRight className="w-3 h-3" />
                </button>
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
                        <option value="">{t('queue.allDepts')}</option>
                        {departments.filter(d => d.isActive && d.type === 'CLINICAL').map(d => (
                            <option key={d.id} value={d.id}>{d.name}</option>
                        ))}
                    </select>
                )}
                <button aria-label={t('common.refresh')} onClick={reload} className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200" title={t('common.refresh')}>
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
                <SkeletonList rows={4} />
            ) : (
                <div className="space-y-6">
                    {/* Navbatdan OLDIN turadi: tayyor natija hech kim so'ramasa
                        o'zi eslatmaydi, navbat esa o'zi ko'rinib turadi. */}
                    {ready.length > 0 && (
                        <section>
                            <h3 className="flex items-center gap-2 text-sm font-semibold text-purple-800 dark:text-purple-300 mb-2">
                                <BellRing className="w-4 h-4" />
                                Natija tayyor — ko'rilmadi <span className="font-normal opacity-70">({ready.length})</span>
                            </h3>
                            <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">
                                Oldingi kunlardagi qabullar ham shu yerda. Ochib ko'rilgach ro'yxatdan chiqadi.
                            </p>
                            <div className="space-y-2">{ready.map(r => <PendingCard key={r.visitId} r={r} highlight />)}</div>
                        </section>
                    )}

                    <section>
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
                            Navbatda <span className="text-gray-400 font-normal">({groups.active.length})</span>
                        </h3>
                        {groups.active.length === 0 ? (
                            <div className="text-center py-10 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
                                <CheckCircle className="w-10 h-10 mx-auto text-emerald-400 mb-2" />
                                <p className="text-sm text-gray-500 dark:text-gray-400">{t('queue.empty')}</p>
                            </div>
                        ) : (
                            <div className="space-y-2">{groups.active.map(v => <Card key={v.id} v={v} showCall />)}</div>
                        )}
                    </section>

                    {stillWaiting.length > 0 && (
                        <section>
                            <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white mb-2">
                                <FlaskConical className="w-4 h-4 text-purple-500" />
                                Natija kutilmoqda <span className="text-gray-400 font-normal">({stillWaiting.length})</span>
                            </h3>
                            <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">
                                Bemor tahlil yoki tekshiruvga ketgan. Qabul ochiq, lekin navbatni band qilmaydi.
                            </p>
                            <div className="space-y-2">{stillWaiting.map(r => <PendingCard key={r.visitId} r={r} />)}</div>
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
