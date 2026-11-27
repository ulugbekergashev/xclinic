import React, { useMemo, useState } from 'react';
import { ChevronDown, Printer } from 'lucide-react';
import {
    Clinic, Department, DiagnosticStudy, EncounterTemplate, LabOrder, MODALITY_LABELS, Patient, Visit,
} from '../../types';
import { useLanguage, fill } from '../../context/LanguageContext';
import type { TranslationKey } from '../../i18n/translations';
import { formatDate, formatDateMedium, formatTime } from '../../utils/format';
import { todayISO } from '../../utils/dateUtils';
import { printPrescription } from '../../utils/printForms';
import { SendDocButton } from '../SendDocButton';
import {
    buildTimeline, dayOf, filterTimeline, TimelineEntry, TimelineFilter, TimelineStay,
} from '../../utils/patientTimeline';
import { EncounterSummary } from '../EncounterForm';
import { VISIT_STATUS_KEY } from '../VisitPanel';
import { LabValues } from '../visit/LabValues';

/* ─────────────────────────────────────────────────────────────────────────────
   TARIX — BITTA LENTA.

   Qabul, tahlil, tekshiruv va statsionar bitta vaqt o'qida. Yozuv bosilganda
   SHU YERDA ochiladi — ilgari bo'lim sahifaning eng pastida, qabul paneli
   ostida ochilardi va foydalanuvchi «hech narsa bo'lmadi» deb o'ylardi.

   Qoida (nima lentaga tushadi, qaysi tartibda) — `utils/patientTimeline.ts`.
   ───────────────────────────────────────────────────────────────────────────── */

interface Props {
    patient: Patient;
    clinic?: Clinic;
    visits: Visit[];
    admissions: TimelineStay[];
    /** Qabulga bog'lanmagan tahlil va tekshiruvlar (laboratoriyaning o'zida yozilgan) */
    looseLabs?: LabOrder[];
    looseStudies?: DiagnosticStudy[];
    departments: Department[];
    templates: EncounterTemplate[];
    onOpenVisit: (visitId: string) => void;
}

const FILTERS: [TimelineFilter, TranslationKey][] = [
    ['all', 'card.filter.all'],
    ['visit', 'card.filter.visit'],
    ['lab', 'card.filter.lab'],
    ['study', 'card.filter.study'],
];

const DOT: Record<TimelineEntry['kind'], string> = {
    visit: 'bg-primary-600 ring-primary-600',
    lab: 'bg-teal-600 ring-teal-600',
    study: 'bg-gray-500 ring-gray-500',
    stay: 'bg-pink-600 ring-pink-600',
};

/** Birinchi ochilishda shuncha yozuv — o'n yillik tarix sahifani cho'zib yubormasin */
const PAGE = 12;
const DAY_MS = 86_400_000;

const isOpenVisit = (v: Visit) => v.status !== 'Completed' && v.status !== 'Cancelled';

const detailBox = 'mt-2 flex flex-col gap-2 rounded-xl border border-line bg-canvas p-3 text-[13px] text-ink';
const smallBtn = 'self-start inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg border border-primary-200 dark:border-primary-800 bg-surface text-primary-700 dark:text-primary-300 text-xs font-bold hover:border-primary-400 disabled:opacity-60 disabled:hover:border-primary-200';

export const PatientTimeline: React.FC<Props> = ({
    patient, clinic, visits, admissions, looseLabs, looseStudies, departments, templates, onOpenVisit,
}) => {
    const { t, language } = useLanguage();
    const [filter, setFilter] = useState<TimelineFilter>('all');
    const [openId, setOpenId] = useState<string | null>(null);
    const [showAll, setShowAll] = useState(false);

    const entries = useMemo(
        () => buildTimeline({ visits, admissions, looseLabs, looseStudies }),
        [visits, admissions, looseLabs, looseStudies],
    );
    const shown = filterTimeline(entries, filter);
    const page = showAll ? shown : shown.slice(0, PAGE);
    const today = todayISO();

    const deptName = (v: Visit) => v.department?.name || departments.find(d => d.id === v.departmentId)?.name || t('visit.noDept');

    const dayLabel = (at: string): string =>
        dayOf(at) === today ? t('card.today') : formatDateMedium(at, language);

    const headOf = (e: TimelineEntry): { title: string; sub: string } => {
        switch (e.kind) {
            case 'visit': {
                const v = e.visit;
                const codes = (v.diagnoses || []).map(d => d.code).join(' · ');
                return {
                    title: `${deptName(v)}${v.doctorName ? ` · ${v.doctorName}` : ''}`,
                    sub: [codes, v.complaints].filter(Boolean).join(' — ') || t(VISIT_STATUS_KEY[v.status] || 'visit.status.Waiting'),
                };
            }
            case 'lab':
                return {
                    title: (e.order.items || []).map(i => i.testName).join(', ') || t('visit.tabLab'),
                    sub: e.order.status === 'Completed' ? t('visit.resultReady') : t('visit.pending'),
                };
            case 'study':
                return {
                    title: `${MODALITY_LABELS[e.study.modality] || e.study.modality} — ${e.study.name}`,
                    sub: e.study.conclusion || (e.study.status === 'Completed' ? t('visit.resultReady') : t('visit.pending')),
                };
            case 'stay': {
                const { admittedAt, dischargedAt, diagnosis } = e.stay;
                const days = dischargedAt
                    ? Math.max(1, Math.round((new Date(dischargedAt).getTime() - new Date(admittedAt).getTime()) / DAY_MS))
                    : 0;
                return { title: dischargedAt ? fill(t('card.tl.stay'), days) : t('card.tl.stayNow'), sub: diagnosis || '' };
            }
        }
    };

    const details = (e: TimelineEntry): React.ReactNode => {
        switch (e.kind) {
            case 'visit': {
                const v = e.visit;
                const prescriptions = v.prescriptions || [];
                return (
                    <div className={detailBox}>
                        {v.complaints && <p><span className="text-muted">{t('visit.complaint')}</span> {v.complaints}</p>}
                        {(v.diagnoses || []).length > 0 && (
                            <ul className="flex flex-col gap-0.5">
                                {(v.diagnoses || []).map((d, i) => (
                                    <li key={d.id}>
                                        <b className="font-bold text-primary-700 dark:text-primary-300">{d.code}</b> {d.icd10?.name}
                                        {/* Tashxis turi (migratsiya 0040); eski yozuvda — birinchisi asosiy */}
                                        <span className="text-muted"> · {t(`visit.dxKind.${d.kind || (i === 0 ? 'Main' : 'Concomitant')}` as any)}</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                        <EncounterSummary template={templates.find(x => x.id === v.templateId)} value={v.examData} />
                        {v.objectiveText && <p className="whitespace-pre-wrap"><span className="text-muted">{t('visit.examLabel')}:</span> {v.objectiveText}</p>}
                        {v.treatmentPlan && <p className="whitespace-pre-wrap"><span className="text-muted">{t('visit.conclusionLabel')}:</span> {v.treatmentPlan}</p>}
                        {prescriptions.map(rx => (
                            <p key={rx.id} className="flex items-start gap-2">
                                <span className="min-w-0 flex-1">
                                    <span className="text-muted">{t('visit.prescription')}:</span>{' '}
                                    {(rx.items || []).map(i => [i.name, i.dosage].filter(Boolean).join(' ')).join(', ')}
                                </span>
                                <button type="button" onClick={() => printPrescription({ ...rx, patient }, clinic)}
                                    aria-label={t('common.print')} title={t('common.print')}
                                    className="shrink-0 w-6 h-6 grid place-items-center rounded-md text-faint hover:text-primary-600 hover:bg-surface">
                                    <Printer className="w-3.5 h-3.5" />
                                </button>
                                <SendDocButton kind="rx" id={rx.id} patientId={patient.id} />
                            </p>
                        ))}
                        {(v.procedures || []).length > 0 && (
                            <p><span className="text-muted">{t('visit.tabServices')}:</span> {(v.procedures || []).map(p => p.procedureName).join(', ')}</p>
                        )}
                        {/* Har doim bosiladi: tarix endi alohida tabda, tugma
                            «Qabul» tabiga olib o'tadi — shu qabul u yerda
                            allaqachon ochiq bo'lsa ham. */}
                        <button type="button" onClick={() => onOpenVisit(v.id)} className={smallBtn}>
                            {t('card.tl.openInSheet')}
                        </button>
                    </div>
                );
            }
            case 'lab':
                return (
                    <div className={detailBox}>
                        {e.order.status === 'Completed'
                            ? <LabValues orderId={e.order.id} refreshKey={e.order.completedAt} compact />
                            : <p className="text-muted">{t('card.tl.noResults')}</p>}
                    </div>
                );
            case 'study':
                return (
                    <div className={detailBox}>
                        {e.study.findings && <p>{e.study.findings}</p>}
                        {e.study.conclusion && <p><b className="font-bold">{e.study.conclusion}</b></p>}
                        {!e.study.findings && !e.study.conclusion && <p className="text-muted">{t('card.tl.noResults')}</p>}
                        {e.study.performedByName && <p className="text-xs text-muted">{e.study.performedByName}</p>}
                    </div>
                );
            case 'stay':
                return (
                    <div className={detailBox}>
                        <p>
                            {formatDate(e.stay.admittedAt)}
                            {e.stay.dischargedAt ? ` – ${formatDate(e.stay.dischargedAt)}` : ` ${t('patienthistorypanel.hozir_yotibdi')}`}
                        </p>
                        {e.stay.diagnosis && <p>{e.stay.diagnosis}</p>}
                    </div>
                );
        }
    };

    return (
        <div className="flex flex-col gap-3">
            <div role="group" aria-label={t('card.historyTitle')} className="flex flex-wrap gap-1.5">
                {FILTERS.map(([key, label]) => {
                    const on = filter === key;
                    return (
                        <button key={key} type="button" aria-pressed={on}
                            onClick={() => { setFilter(key); setShowAll(false); }}
                            className={`h-7 px-2.5 rounded-lg text-xs font-bold transition-colors ${on
                                ? 'bg-primary-600 text-white'
                                : 'bg-elevated text-muted hover:text-ink'}`}>
                            {t(label)}
                        </button>
                    );
                })}
            </div>

            {shown.length === 0 ? (
                <p className="py-4 text-sm text-faint">
                    {entries.length === 0 ? t('patienthistorypanel.yozuv_yoq_birinchi_murojaat') : t('card.tl.empty')}
                </p>
            ) : (
                <ol aria-label={t('card.historyTitle')} className="relative flex flex-col gap-3">
                    <span aria-hidden="true" className="absolute left-[5px] top-2 bottom-2 border-l-2 border-dashed border-line" />
                    {page.map((e, index) => {
                        const open = openId === e.id;
                        const head = headOf(e);
                        const live = e.kind === 'visit' && isOpenVisit(e.visit);
                        const cancelled = e.kind === 'visit' && e.visit.status === 'Cancelled';
                        /* Sana kuniga BIR MARTA: bir tashrifning qabuli, tahlili va
                           tekshiruvi ketma-ket turadi — har birida sanani takrorlash
                           lentani ikki baravar uzaytirardi. */
                        const newDay = index === 0 || dayOf(page[index - 1].at) !== dayOf(e.at);
                        const time = e.at.length > 10 ? formatTime(e.at) : '';
                        return (
                            <li key={e.id} className={`relative pl-6 ${newDay && index > 0 ? 'mt-1.5' : ''}`}>
                                <span aria-hidden="true"
                                    className={`absolute left-0 w-3 h-3 rounded-full border-2 border-surface ring-[1.5px] ${newDay ? 'top-[21px]' : 'top-[3px]'} ${cancelled ? 'bg-gray-300 ring-gray-300' : DOT[e.kind]}`} />
                                {newDay && (
                                    <p className="mb-0.5 text-xs font-medium text-muted tabular-nums">{dayLabel(e.at)}</p>
                                )}
                                <button type="button" aria-expanded={open} onClick={() => setOpenId(open ? null : e.id)}
                                    className="group w-full flex items-start gap-2 text-left leading-snug">
                                    <span className="min-w-0 flex-1 flex flex-col">
                                        <span className={`text-sm font-semibold group-hover:text-primary-700 dark:group-hover:text-primary-300 ${cancelled ? 'text-muted line-through' : 'text-ink'}`}>
                                            {head.title}
                                            {live && (
                                                <span className="ml-1.5 px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 text-[11px] font-medium align-middle">
                                                    {t('card.openVisitBadge')}
                                                </span>
                                            )}
                                        </span>
                                        <span className={`text-xs text-muted ${open ? '' : 'truncate'}`}>
                                            {[time, cancelled ? t('visit.status.Cancelled') : head.sub].filter(Boolean).join(' · ')}
                                        </span>
                                    </span>
                                    <ChevronDown aria-hidden="true"
                                        className={`shrink-0 mt-1 w-3.5 h-3.5 text-faint transition-transform ${open ? 'rotate-180' : ''}`} />
                                </button>
                                {open && details(e)}
                            </li>
                        );
                    })}
                </ol>
            )}

            {shown.length > page.length && (
                <button type="button" onClick={() => setShowAll(true)}
                    className="self-start text-xs font-bold text-primary-700 dark:text-primary-300 hover:underline">
                    {fill(t('card.tl.more'), shown.length - page.length)}
                </button>
            )}
        </div>
    );
};
