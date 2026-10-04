import React, { useMemo } from 'react';
import { ArrowRight, Check, Edit2, Loader2, Plus, Sparkles } from 'lucide-react';
import { Card } from './Common';
import { Admission, Bed, Ward } from '../types';
import { useLanguage, fill } from '../context/LanguageContext';
import { initialsOf } from '../utils/flow';
import { formatDateToISO } from '../utils/dateUtils';

/* ─────────────────────────────────────────────────────────────────────────────
   STATSIONAR: BO'LIM XARITASI → HAMSHIRA POSTI.

   Sahifada ikkita alohida vkladka bor edi: «Palatalar» (koykalar to'ri) va
   «Dori varag'i» (bemor bo'yicha tayinlovlar ro'yxati). Hamshiraning ishi esa
   bitta: palataga qarab «kimda nima vaqti keldi» ni ko'rish va bajarib
   belgilash. Buning uchun u ikki vkladka orasida yurardi, vaqti kelgan
   muolaja esa koyka kartasida umuman ko'rinmasdi.

   Endi ikkalasi bitta panelda — «Bugun» xaritasidagi statsionar zonasining
   o'zi, faqat to'liq:

     · chapda — palatalar: har biri xona, ichida koykalar. Band koykada
       bemor, necha kun yotgani va belgilar: muolaja vaqti keldi, bugun
       obxod yozilmagan, bugun yotdi. Bosilsa — o'sha yotish ochiladi.
       Bo'sh koyka — yotqizish; tozalanayotgani — «Tayyor».
     · o'ngda — post: bugungi muolajalar SOAT bo'yicha (bemor bo'yicha
       emas): vaqti kelgani tepada, keyin navbatdagilar. «Berildi» — shu
       yerda.

   Tayinlov, obxod va chiqarish — yotish oynasida (koyka bosiladi); bu panel
   joylashtirish va muolajani bajarish uchun.
   ───────────────────────────────────────────────────────────────────────────── */

export interface MedOrderRow {
    id: string; name: string; dosage?: string | null; route?: string | null; frequency?: string | null;
    marks?: { status: string; givenAt: string }[];
    slots?: string[]; due?: number; nextAt?: string | null;
}
export interface MedScheduleRow {
    admissionId: string; patientName: string; ward?: string | null; bed?: string | null;
    orders: MedOrderRow[];
}

interface Props {
    wards: Ward[];
    admissions: Admission[];
    schedule: { date: string; rows: MedScheduleRow[] } | null;
    canManage: boolean;
    canGiveMeds: boolean;
    saving?: boolean;
    /** «Berildi» bosilgan tayinlov — tugmasi kutish holatida */
    busyOrder?: string;
    /** Palata ostidagi izoh: turi, qavati, kunlik narxi */
    wardNote?: (w: Ward) => string;
    /** Post sarlavhasidagi qo'shimcha boshqaruvlar (bo'lim filtri, «Dori tayinlash») */
    postActions?: React.ReactNode;
    onOpenAdmission: (a: Admission) => void;
    onAdmit: (bed: Bed, ward: Ward) => void;
    onBedReady: (bedId: string) => void;
    onToggleBlock: (bed: Bed) => void;
    onEditWard: (w: Ward) => void;
    onAddBed: (wardId: string) => void;
    onGive: (order: MedOrderRow) => void;
}

const FLOOR_PINK: React.CSSProperties = { backgroundImage: 'radial-gradient(rgba(181,55,122,0.11) 1px, transparent 1.4px)', backgroundSize: '16px 16px' };
const FLOOR_COOL: React.CSSProperties = { backgroundImage: 'radial-gradient(rgba(0,94,184,0.11) 1px, transparent 1.4px)', backgroundSize: '16px 16px' };
const TAB = 'absolute -top-2.5 left-5 inline-flex items-center gap-1.5 h-[18px] px-2 rounded-md bg-surface text-[10.5px] font-extrabold uppercase tracking-wider whitespace-nowrap';

const isToday = (iso?: string | null) => !!iso && new Date(iso).toDateString() === new Date().toDateString();
/* Obxod sanasi — matn («2026-10-04»), vaqt emas: «Bugun» ekranidagi
   «Statsionardagi bemorlarim» ham aynan shunday solishtiradi. */
const seenToday = (a: Admission) => (a.rounds || []).some(r => String(r.date).slice(0, 10) === formatDateToISO(new Date()));
const daysIn = (from: string) => Math.max(1, Math.ceil((Date.now() - +new Date(from)) / 86_400_000));
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });

export const WardMap: React.FC<Props> = ({
    wards, admissions, schedule, canManage, canGiveMeds, saving, busyOrder, postActions, wardNote,
    onOpenAdmission, onAdmit, onBedReady, onToggleBlock, onEditWard, onAddBed, onGive,
}) => {
    const { t } = useLanguage();

    const admById = useMemo(() => new Map(admissions.map(a => [a.id, a])), [admissions]);
    /* Yotish bo'yicha vaqti kelgan TAYINLOVLAR soni — koykadagi belgi shundan.
       Doza emas, tayinlov: «Bugun» dagi zona ham shunday sanaydi. */
    const dueByAdmission = useMemo(() => {
        const m = new Map<string, number>();
        for (const r of schedule?.rows || []) m.set(r.admissionId, r.orders.filter(o => (o.due || 0) > 0).length);
        return m;
    }, [schedule]);

    /* POST — muolajalar SOAT bo'yicha, bemor bo'yicha emas.

       Tayinlov boshiga BITTA satr: vaqti kelgan bo'lsa — o'sha, bo'lmasa —
       navbatdagi soat. «Har 2 soatda» — kuniga o'n ikki vaqt; har biri
       alohida satr bo'lsa, bitta dori postni to'ldirib qo'yardi. Bugungi
       dozalari tugagan tayinlov ro'yxatdan chiqadi. To'liq jadval — yotish
       oynasidagi dori varag'ida.

       «Vaqti keldi»ni SERVER aytadi (`due`, qoida `shared/medSchedule.ts`
       da): joriy vaqt belgilanmagan. Ekran uni qayta hisoblamaydi — faqat
       qaysi soat ekanini topadi: navbatdagi vaqtdan (`nextAt`) bitta oldingisi.
       Bitta «Berildi» joriy vaqtni yopadi va satr navbatdagi soatga o'tadi. */
    const post = useMemo(() => {
        type Task = { key: string; time: string; state: 'due' | 'next' | 'prn'; first: boolean; order: MedOrderRow; row: MedScheduleRow };
        const tasks: Task[] = [];
        let done = 0;
        for (const row of schedule?.rows || []) {
            for (const o of row.orders) {
                done += (o.marks || []).length;
                const slots = o.slots || [];
                if (slots.length === 0) {
                    // Zaruratga qarab beriladigan yoki soati tushunilmagan tayinlov
                    tasks.push({ key: `${o.id}:prn`, time: '', state: 'prn', first: true, order: o, row });
                    continue;
                }
                const late = (o.due || 0) > 0;
                if (late) {
                    const at = o.nextAt ? slots.indexOf(o.nextAt) - 1 : slots.length - 1;
                    tasks.push({ key: `${o.id}:due`, time: slots[Math.max(0, at)], state: 'due', first: true, order: o, row });
                }
                else if (o.nextAt) tasks.push({ key: `${o.id}:next`, time: o.nextAt, state: 'next', first: true, order: o, row });
            }
        }
        const rank = { due: 0, next: 1, prn: 2 } as const;
        tasks.sort((a, b) => rank[a.state] - rank[b.state] || a.time.localeCompare(b.time) || a.row.patientName.localeCompare(b.row.patientName));
        return { tasks, done, due: tasks.filter(x => x.state === 'due').length };
    }, [schedule]);

    const beds = wards.flatMap(w => w.beds || []);
    const occupied = beds.filter(b => b.status === 'Occupied').length;
    const free = beds.filter(b => b.status === 'Free').length;
    const cleaning = beds.filter(b => b.status === 'Cleaning').length;
    const notSeen = admissions.filter(a => !seenToday(a)).length;

    const legendItem = (dot: string, text: string) => (
        <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className={`w-2.5 h-2.5 rounded-full ${dot}`} />{text}</span>
    );

    const bedTile = (b: Bed, w: Ward) => {
        const occ = b.admissions?.[0];
        const adm = occ ? admById.get(occ.id) : undefined;
        if (occ) {
            const due = dueByAdmission.get(occ.id) || 0;
            const seen = !!adm && seenToday(adm);
            const fresh = isToday(occ.admittedAt);
            const flag = due > 0 ? { text: fill(t('wardmap.medsDue'), due), tone: 'text-red-600 dark:text-red-400' }
                : adm && !seen ? { text: t('today.notSeenToday'), tone: 'text-amber-700 dark:text-amber-400' }
                    : fresh ? { text: t('zones.inp.bedNew'), tone: 'text-emerald-700 dark:text-emerald-400' }
                        : null;
            return (
                <button key={b.id} type="button" onClick={() => adm && onOpenAdmission(adm)}
                    aria-label={`${w.name} · ${b.label} — ${occ.patientName}`}
                    className="w-full flex items-center gap-2.5 pl-2 pr-2.5 py-2 rounded-2xl border-[1.5px] border-line bg-surface hover:border-pink-300 dark:hover:border-pink-700 text-left transition-colors">
                    <span className={`shrink-0 w-9 h-9 rounded-full border-[2.5px] ${due > 0 ? 'border-red-400' : 'border-pink-400'} bg-surface text-ink text-[11px] font-extrabold inline-flex items-center justify-center`}>
                        {initialsOf(occ.patientName)}
                    </span>
                    <span className="min-w-0 flex-1 flex flex-col leading-snug">
                        <span className="text-[13px] font-extrabold text-ink truncate">{occ.patientName}</span>
                        <span className="text-[11px] text-muted truncate">
                            {b.label} · {fill(t('today.dayN'), daysIn(occ.admittedAt))}{adm?.doctorName ? ` · ${adm.doctorName}` : ''}
                        </span>
                        {flag && <span className={`text-[11px] font-extrabold truncate ${flag.tone}`}>{flag.text}</span>}
                    </span>
                </button>
            );
        }
        if (b.status === 'Cleaning') {
            return (
                <div key={b.id} className="flex items-center gap-2 pl-3 pr-2 py-2 rounded-2xl border-[1.5px] border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30">
                    <span className="min-w-0 flex-1 text-[12px] font-bold text-amber-800 dark:text-amber-300 truncate">{b.label} · {t('zones.inp.bedCleaning')}</span>
                    <button type="button" onClick={() => onBedReady(b.id)} disabled={saving}
                        className="shrink-0 inline-flex items-center gap-1 h-8 px-2.5 rounded-lg bg-surface border border-amber-300 dark:border-amber-800 text-[11px] font-extrabold text-amber-800 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/40 disabled:opacity-50">
                        <Sparkles className="w-3 h-3" /> {t('inpatient.koyka_tayyor')}
                    </button>
                </div>
            );
        }
        const blocked = b.status === 'Blocked';
        return (
            <div key={b.id} className={`flex items-center gap-2 pl-3 pr-2 py-2 rounded-2xl border-[1.5px] border-dashed ${blocked ? 'border-line bg-elevated/60' : 'border-pink-300/80 dark:border-pink-800/70'}`}>
                {canManage && !blocked ? (
                    <button type="button" onClick={() => onAdmit(b, w)}
                        aria-label={`${w.name} · ${b.label}: ${t('inp.admit')}`}
                        className="min-w-0 flex-1 text-left text-[12px] font-bold text-muted hover:text-primary-600 dark:hover:text-primary-400 truncate">
                        {b.label} · {t('zones.inp.bedFree')} <span className="font-extrabold">+ {t('inp.admit')}</span>
                    </button>
                ) : (
                    <span className="min-w-0 flex-1 text-[12px] font-bold text-faint truncate">{b.label} · {blocked ? t('zones.inp.bedBlocked') : t('zones.inp.bedFree')}</span>
                )}
                {canManage && (
                    <button type="button" onClick={() => onToggleBlock(b)} disabled={saving}
                        className="shrink-0 h-8 px-2 rounded-lg text-[11px] font-bold text-faint hover:text-ink disabled:opacity-50">
                        {blocked ? t('inp.unblockBed') : t('inp.blockBed')}
                    </button>
                )}
            </div>
        );
    };

    return (
        <Card className="p-5 sm:p-6">
            <section aria-labelledby="ward-map-title">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 id="ward-map-title" className="text-lg font-black text-ink">{t('wardmap.title')}</h2>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-semibold text-muted">
                        {legendItem('bg-pink-400', fill(t('wardmap.legendOccupied'), occupied))}
                        <span>{fill(t('zones.inp.free'), free)}</span>
                        {cleaning > 0 && <span className="text-amber-700 dark:text-amber-400">{fill(t('zones.inp.cleaning'), cleaning)}</span>}
                        {post.due > 0 && <span className="text-red-600 dark:text-red-400">{legendItem('bg-red-500', fill(t('zones.inp.medsDue'), post.due))}</span>}
                        {notSeen > 0 && legendItem('bg-amber-500', fill(t('zones.inp.notSeen'), notSeen))}
                    </div>
                </div>

                <div className="mt-7 grid grid-cols-1 gap-y-7 xl:grid-cols-[minmax(0,1fr)_2.75rem_minmax(0,25rem)]">
                    {/* ── Palatalar ── */}
                    <div className="min-w-0 grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-7 content-start">
                        {wards.map(w => {
                            const list = w.beds || [];
                            const busy = list.filter(b => b.status === 'Occupied').length;
                            return (
                                <div key={w.id} className="relative rounded-[22px] border-[1.5px] border-pink-200 dark:border-pink-900/50 bg-pink-50/50 dark:bg-pink-950/15 px-3 pt-[18px] pb-3"
                                    style={FLOOR_PINK}>
                                    <span className={`${TAB} max-w-[calc(100%-6.5rem)] text-pink-700 dark:text-pink-300`}>
                                        <span className="truncate">{w.name}</span>
                                        <span className="text-muted tabular-nums">{busy}/{list.length}</span>
                                    </span>
                                    {canManage && (
                                        <span className="absolute -top-3 right-4 inline-flex items-center gap-0.5 px-1 rounded-md bg-surface">
                                            <button type="button" onClick={() => onEditWard(w)} title={t('inp.editWard')} aria-label={`${w.name}: ${t('inp.editWard')}`}
                                                className="w-6 h-6 inline-flex items-center justify-center rounded text-faint hover:text-primary-600 dark:hover:text-primary-400">
                                                <Edit2 className="w-3.5 h-3.5" />
                                            </button>
                                            <button type="button" onClick={() => onAddBed(w.id)} disabled={saving} title={t('inp.addBed')} aria-label={`${w.name}: ${t('inp.addBed')}`}
                                                className="w-6 h-6 inline-flex items-center justify-center rounded text-faint hover:text-primary-600 dark:hover:text-primary-400 disabled:opacity-50">
                                                <Plus className="w-3.5 h-3.5" />
                                            </button>
                                        </span>
                                    )}
                                    {list.length === 0
                                        ? <p className="px-2 py-3 text-xs font-semibold text-muted">{t('wardmap.noBeds')}</p>
                                        : <div className="flex flex-col gap-2">{list.map(b => bedTile(b, w))}</div>}
                                    {wardNote && <p className="mt-2 px-1 text-[10.5px] font-semibold text-faint truncate">{wardNote(w)}</p>}
                                </div>
                            );
                        })}
                    </div>

                    <div aria-hidden="true" className="hidden xl:flex relative items-center justify-center">
                        <span className="absolute left-1/2 -translate-x-1/2 top-6 bottom-6 border-l-2 border-dashed border-line" />
                        <span className="relative w-6 h-6 rounded-full bg-surface border-[1.5px] border-line text-faint inline-flex items-center justify-center">
                            <ArrowRight className="w-3 h-3" />
                        </span>
                    </div>

                    {/* ── Hamshira posti ── */}
                    <div id="nurse-post" className="relative scroll-mt-24 self-start w-full xl:sticky xl:top-24 min-w-0 rounded-[22px] border-[1.5px] border-primary-200 dark:border-primary-800/60 bg-primary-50/60 dark:bg-primary-900/15 px-3 pt-[18px] pb-3 flex flex-col gap-2"
                        style={FLOOR_COOL}>
                        <span className={`${TAB} text-muted`}>
                            <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-emerald-500" />{t('wardmap.post')}
                        </span>
                        {postActions && <div className="flex flex-wrap items-center gap-2 px-1 pb-1">{postActions}</div>}

                        {!schedule ? (
                            <div className="space-y-2">{[0, 1, 2].map(i => <div key={i} className="h-14 rounded-2xl bg-elevated animate-pulse" />)}</div>
                        ) : post.tasks.length === 0 ? (
                            <p className="px-2 py-5 text-sm font-semibold text-muted flex items-center gap-2">
                                <Check className="w-4 h-4 text-emerald-500" />{post.done > 0 ? t('wardmap.allDone') : t('inp.noMedsToday')}
                            </p>
                        ) : (
                            <ul className="flex flex-col gap-2">
                                {post.tasks.map(x => {
                                    const o = x.order;
                                    const where = [x.row.ward, x.row.bed].filter(Boolean).join(' / ');
                                    const state = x.state === 'due' ? t('inp.medDueNow') : x.state === 'prn' ? t('wardmap.prn') : '';
                                    return (
                                        <li key={x.key} className={`flex items-center gap-2.5 pl-2.5 pr-2 py-2 rounded-2xl border-[1.5px] bg-surface ${x.state === 'due' ? 'border-red-300 dark:border-red-800' : 'border-line'}`}>
                                            <span className={`shrink-0 w-11 text-center text-[13px] font-black tabular-nums ${x.state === 'due' ? 'text-red-600 dark:text-red-400' : 'text-muted'}`}>
                                                {x.time || '—'}
                                            </span>
                                            <span className="min-w-0 flex-1 flex flex-col leading-snug">
                                                <span className="text-[13px] font-extrabold text-ink truncate">
                                                    {o.name}{o.dosage ? <span className="font-semibold text-muted"> · {o.dosage}</span> : null}
                                                </span>
                                                <span className="text-[11px] text-muted truncate">
                                                    {x.row.patientName}{where ? ` · ${where}` : ''}{o.route ? ` · ${o.route}` : ''}
                                                </span>
                                                {state && (
                                                    <span className={`text-[11px] font-extrabold truncate ${x.state === 'due' ? 'text-red-600 dark:text-red-400' : 'text-muted'}`}>
                                                        {state}{x.state === 'prn' && o.frequency ? ` · ${o.frequency}` : ''}
                                                        {x.state === 'prn' && (o.marks || []).length > 0 ? ` · ${(o.marks || []).map(m => hhmm(m.givenAt)).join(', ')}` : ''}
                                                    </span>
                                                )}
                                            </span>
                                            {canGiveMeds && x.first && (
                                                <button type="button" onClick={() => onGive(o)} disabled={busyOrder === o.id}
                                                    aria-label={`${x.row.patientName} — ${o.name}: ${t('wardmap.given')}`}
                                                    className={`shrink-0 inline-flex items-center gap-1 h-9 px-2.5 rounded-xl text-xs font-extrabold transition-colors disabled:opacity-50 ${x.state === 'due'
                                                        ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                                                        : 'border border-line text-muted hover:text-ink hover:bg-elevated'}`}>
                                                    {busyOrder === o.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" strokeWidth={3} />}
                                                    {t('wardmap.given')}
                                                </button>
                                            )}
                                        </li>
                                    );
                                })}
                            </ul>
                        )}

                        <p className="pt-2.5 mt-1 border-t border-dashed border-primary-200 dark:border-primary-800/60 px-1 text-[11.5px] font-bold text-muted">
                            {fill(t('wardmap.doneToday'), post.done)}
                        </p>
                    </div>
                </div>
            </section>
        </Card>
    );
};

export default WardMap;
