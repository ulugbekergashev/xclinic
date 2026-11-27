import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Layers, X } from 'lucide-react';
import { LabTest, Service, TreatmentTemplate, TreatmentTemplateItem, Visit } from '../../types';
import { api } from '../../services/api';
import { useLanguage, fill } from '../../context/LanguageContext';
import { confirmAction } from '../../services/confirm';
import { checkDrugAllergy, AllergyLike } from '../../shared/allergyMatch';
import { formatDate } from '../../utils/format';

/* ─────────────────────────────────────────────────────────────────────────────
   DAVOLASH TO'PLAMI — «O'RVI: shu dorilar, ko'rik va qon tahlili» bir
   bosishda (2026-11-26, olti maslahatchi: shifokor, soddalik tanqidchisi,
   xavfsizlik, ma'lumot, DentaCRM, kod xaritasi).

   • Tugma tashxis qatorining o'zida — faqat shu tashxisga to'plam bo'lsa.
     «Shablon» so'zi ATAYLAB yo'q: u ko'rik shabloni bilan chalkashardi.
   • Qo'shadi, almashtirmaydi: shu qabulda bor dori, xizmat, tahlil qayta
     qo'shilmaydi. Allergiyaga mos dori QO'SHILMAYDI (jim emas — panelda
     yoziladi). Oxirgi 7 kunda qilingan tahlil ham — «Baribir qo'shish» bilan.
   • Hammasi darhol serverga yoziladi (tahlil laboratoriyaga ketadi), shuning
     uchun «Bekor qilish» yaratilganlarni HAQIQATAN o'chiradi.
   • Yaratish — shu qabuldan, bitta havola bilan; nom asosiy tashxisdan.
   ───────────────────────────────────────────────────────────────────────────── */

const UNDO_MS = 15_000;
const RECENT_LAB_DAYS = 7;

/** Tashxis kodi to'plamga mosmi: «J06» to'plami J06.9 ga ham mos */
export const bundleFits = (tpl: TreatmentTemplate, code: string) =>
    tpl.icdCodes.some(c => code.startsWith(c) || c.startsWith(code));

interface Created { rxId?: string; procIds: string[]; labOrderIds: string[] }
interface Skipped { kind: 'allergy' | 'recent'; name: string; detail: string; labTestId?: string }
export interface BundleBarState { name: string; summary: string; created: Created; skipped: Skipped[] }

interface Deps {
    visit: Visit | null;
    patientName: string;
    doctorName: string | null;
    allergies: AllergyLike[];
    services: Service[];
    labTests: LabTest[];
    previousVisit?: Visit | null;
    /** Yozuvdan keyin varaqni yangilash */
    refresh: () => Promise<void>;
    toast: (kind: 'success' | 'error' | 'info', msg: string) => void;
}

export function useTreatmentBundles(d: Deps) {
    const { t } = useLanguage();
    const [bundles, setBundles] = useState<TreatmentTemplate[]>([]);
    const [bar, setBar] = useState<BundleBarState | null>(null);
    const [working, setWorkingState] = useState(false);
    /* Tez ikki marta bosilsa — ikkinchisi kutmaydi (holat hali yangilanmagan
       bo'ladi), shuning uchun belgi ref da ham */
    const busyRef = useRef(false);
    const setWorking = (v: boolean) => { busyRef.current = v; setWorkingState(v); };
    const timer = useRef<number | null>(null);

    const load = useCallback(() => { api.treatmentTemplates.getAll().then(setBundles).catch(() => { }); }, []);
    useEffect(() => { load(); }, [load]);
    useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);
    /* Boshqa qabul ochilsa — eski qabulning «bekor qilish» i ko'rinmasin */
    useEffect(() => { setBar(null); }, [d.visit?.id]);

    const showBar = (state: BundleBarState) => {
        setBar(state);
        if (timer.current) window.clearTimeout(timer.current);
        /* O'tkazib yuborilgan narsa bor bo'lsa — panel o'zi yopilmaydi */
        if (state.skipped.length === 0) timer.current = window.setTimeout(() => setBar(null), UNDO_MS);
    };

    /** Oxirgi 7 kunda qilingan tahlillar: testId → sana */
    const recentLabs = (): Map<string, string> => {
        const out = new Map<string, string>();
        const since = new Date(Date.now() - RECENT_LAB_DAYS * 864e5).toISOString().slice(0, 10);
        const prev = d.previousVisit;
        if (!prev || prev.id === d.visit?.id) return out;
        for (const o of prev.labOrders || []) {
            if (o.status === 'Cancelled') continue;
            const day = String(o.orderedAt || prev.date || '').slice(0, 10);
            if (day < since) continue;
            for (const it of o.items || []) out.set(it.testId, day);
        }
        return out;
    };

    const writeLabs = async (testIds: string[]) => (testIds.length
        ? api.labOrders.create({
            patientId: d.visit!.patientId, patientName: d.patientName, visitId: d.visit!.id,
            doctorName: d.doctorName || '', testIds,
        })
        : null);

    const apply = async (tpl: TreatmentTemplate) => {
        const v = d.visit;
        if (!v || busyRef.current) return;
        setWorking(true);
        const created: Created = { procIds: [], labOrderIds: [] };
        const skipped: Skipped[] = [];
        try {
            const haveDrugs = new Set((v.prescriptions || []).flatMap(rx => rx.items || []).map(i => String(i.name || '').trim().toLowerCase()));
            const haveSvc = new Set((v.procedures || []).map(p => Number(p.serviceId)).filter(Boolean));
            const haveLabs = new Set((v.labOrders || []).filter(o => o.status !== 'Cancelled').flatMap(o => (o.items || []).map(i => i.testId)));
            const recent = recentLabs();

            const drugs = tpl.items.filter((x): x is Extract<TreatmentTemplateItem, { kind: 'drug' }> => x.kind === 'drug')
                .filter(x => !haveDrugs.has(x.name.trim().toLowerCase()))
                .filter(x => {
                    const hit = checkDrugAllergy(x.name, d.allergies)[0];
                    if (hit) skipped.push({ kind: 'allergy', name: x.name, detail: hit.allergy });
                    return !hit;
                });
            const svcIds = tpl.items.filter((x): x is Extract<TreatmentTemplateItem, { kind: 'service' }> => x.kind === 'service')
                .map(x => x.serviceId)
                .filter(id => !haveSvc.has(id) && d.services.some(s => Number(s.id) === id));
            const labIds = tpl.items.filter((x): x is Extract<TreatmentTemplateItem, { kind: 'lab' }> => x.kind === 'lab')
                .map(x => x.labTestId)
                .filter(id => !haveLabs.has(id) && d.labTests.some(l => l.id === id && l.isActive))
                .filter(id => {
                    const day = recent.get(id);
                    if (day) skipped.push({ kind: 'recent', name: d.labTests.find(l => l.id === id)?.name || id, detail: formatDate(day), labTestId: id });
                    return !day;
                });

            if (drugs.length) {
                const rx = await api.prescriptions.create({
                    patientId: v.patientId, patientName: d.patientName, visitId: v.id, doctorName: d.doctorName,
                    items: drugs.map(x => ({
                        name: x.name, dosage: x.dosage || null, frequency: x.frequency || null,
                        durationDays: x.durationDays || null, mealTiming: x.mealTiming || null,
                        instructions: x.instructions || null,
                        ...(x.medicationId ? { medicationId: x.medicationId } : {}),
                    })),
                });
                created.rxId = rx.id;
            }
            for (const id of svcIds) {
                const p = await api.visits.addProcedure(v.id, { serviceId: id });
                if (p?.id) created.procIds.push(p.id);
            }
            const order = await writeLabs(labIds);
            if (order?.id) created.labOrderIds.push(order.id);

            api.treatmentTemplates.use(tpl.id).catch(() => { });
            const parts = [
                drugs.length ? fill(t('visit.bundle.drugs'), drugs.length) : '',
                svcIds.length ? fill(t('visit.bundle.services'), svcIds.length) : '',
                labIds.length ? fill(t('visit.bundle.labs'), labIds.length) : '',
            ].filter(Boolean);
            showBar({
                name: tpl.name,
                summary: parts.length ? fill(t('visit.bundle.added'), tpl.name, parts.join(', ')) : t('visit.bundle.nothing'),
                created, skipped,
            });
        } catch (e: any) {
            /* Yarim yozilgan bo'lsa ham — nima yozilganini bekor qilish mumkin bo'lsin */
            d.toast('error', e?.message || t('ui.xatolik'));
            if (created.rxId || created.procIds.length || created.labOrderIds.length) {
                showBar({ name: tpl.name, summary: tpl.name, created, skipped });
            }
        } finally {
            setWorking(false);
            await d.refresh();
        }
    };

    /* Har qadam alohida: bittasi o'tmasa (xizmat to'langan, tahlil olingan)
       qolganlari baribir olib tashlanadi; o'tmagani panelda qoladi va qayta
       bosish faqat o'shani qayta urinadi. */
    const undo = async () => {
        if (!bar || busyRef.current) return;
        setWorking(true);
        const left: Created = { rxId: bar.created.rxId, procIds: [...bar.created.procIds], labOrderIds: [...bar.created.labOrderIds] };
        const errors: string[] = [];
        const step = async (fn: () => Promise<any>, done: () => void) => {
            try { await fn(); done(); } catch (e: any) { errors.push(e?.message || t('ui.xatolik')); }
        };
        try {
            if (left.rxId) await step(() => api.prescriptions.delete(left.rxId!), () => { left.rxId = undefined; });
            for (const id of [...left.procIds]) await step(() => api.visits.removeProcedure(id), () => { left.procIds = left.procIds.filter(x => x !== id); });
            for (const id of [...left.labOrderIds]) await step(() => api.labOrders.delete(id), () => { left.labOrderIds = left.labOrderIds.filter(x => x !== id); });
            if (errors.length === 0) {
                setBar(null);
                d.toast('success', t('visit.bundle.undone'));
            } else {
                setBar(b => (b ? { ...b, created: left } : b));
                d.toast('error', errors.join('; '));
            }
        } finally {
            setWorking(false);
            await d.refresh();
        }
    };

    /** «Baribir qo'shish» — yaqinda qilingan tahlilni shifokor o'zi tanladi */
    const addSkippedLab = async (s: Skipped) => {
        if (!s.labTestId || busyRef.current) return;
        setWorking(true);
        try {
            const order = await writeLabs([s.labTestId]);
            /* «Bekor qilish» buni ham olib tashlaydi */
            setBar(b => (b ? {
                ...b,
                skipped: b.skipped.filter(x => x !== s),
                created: { ...b.created, labOrderIds: order?.id ? [...b.created.labOrderIds, order.id] : b.created.labOrderIds },
            } : b));
        } catch (e: any) {
            d.toast('error', e?.message || t('ui.xatolik'));
        } finally {
            setWorking(false);
            await d.refresh();
        }
    };

    /** Shu qabulning dori, xizmat va tahlillari — yangi to'plam */
    const canSaveFrom = (v: Visit | null) => !!v && (v.diagnoses || []).length > 0 && (
        (v.prescriptions || []).some(rx => (rx.items || []).length > 0)
        || (v.procedures || []).some(p => p.serviceId)
        || (v.labOrders || []).some(o => o.status !== 'Cancelled'));

    const saveFrom = async () => {
        const v = d.visit;
        if (!v || !canSaveFrom(v) || busyRef.current) return;
        const dx = (v.diagnoses || []);
        const main = dx.find(x => x.kind === 'Main') || dx[0];
        const items: TreatmentTemplateItem[] = [
            ...(v.prescriptions || []).flatMap(rx => rx.items || []).map(i => ({
                kind: 'drug' as const, name: String(i.name || ''), medicationId: i.medicationId || null,
                dosage: i.dosage || null, frequency: i.frequency || null, durationDays: i.durationDays || null,
                mealTiming: i.mealTiming || null, instructions: i.instructions || null,
            })).filter(i => i.name.trim()),
            ...Array.from(new Set((v.procedures || []).map(p => Number(p.serviceId)).filter(Boolean)))
                .map(serviceId => ({ kind: 'service' as const, serviceId })),
            ...Array.from(new Set((v.labOrders || []).filter(o => o.status !== 'Cancelled').flatMap(o => (o.items || []).map(i => i.testId))))
                .map(labTestId => ({ kind: 'lab' as const, labTestId })),
        ];
        /* Kod toifasi bilan (J06.9 → J06): shu guruhning boshqa kodiga ham chiqadi */
        const icdCodes = Array.from(new Set(dx.map(x => String(x.code).split('.')[0])));
        const name = (main?.icd10?.name || main?.code || '').slice(0, 80);
        setWorking(true);
        try {
            await api.treatmentTemplates.create({ name, icdCodes, items });
            d.toast('success', fill(t('visit.bundle.saved'), name));
            load();
        } catch (e: any) {
            d.toast('error', e?.message || t('ui.xatolik'));
        } finally { setWorking(false); }
    };

    const remove = async (tpl: TreatmentTemplate) => {
        if (!await confirmAction({ title: fill(t('visit.bundle.remove'), tpl.name), body: t('visit.bundle.removeBody'), confirmLabel: t('common.delete') })) return;
        try {
            await api.treatmentTemplates.delete(tpl.id);
            d.toast('success', t('visit.bundle.removed'));
            load();
        } catch (e: any) {
            d.toast('error', e?.message || t('ui.xatolik'));
        }
    };

    return { bundles, bar, working, apply, undo, addSkippedLab, saveFrom, canSaveFrom, remove, closeBar: () => setBar(null) };
}

/** Tashxis qatoridagi to'plam tugmalari (eng ko'p ishlatilgani birinchi, 3 tagacha) */
export const BundleButtons: React.FC<{
    bundles: TreatmentTemplate[]; code: string; busy: boolean;
    /** Klinikanikini faqat ega o'chiradi — boshqaga «×» ko'rinmaydi */
    canRemoveShared: boolean;
    onApply: (tpl: TreatmentTemplate) => void; onRemove: (tpl: TreatmentTemplate) => void;
}> = ({ bundles, code, busy, canRemoveShared, onApply, onRemove }) => {
    const { t } = useLanguage();
    const fit = bundles.filter(b => bundleFits(b, code)).slice(0, 3);
    if (!fit.length) return null;
    return (
        <span className="flex flex-wrap items-center gap-1.5">
            {fit.map(b => (
                <span key={b.id} className="inline-flex items-center rounded-lg border border-primary-200 dark:border-primary-800 bg-primary-50/50 dark:bg-primary-900/20">
                    <button type="button" disabled={busy} onClick={() => onApply(b)}
                        title={fill(t('visit.bundle.applyTitle'), b.name)}
                        className="inline-flex items-center gap-1.5 h-7 pl-2.5 pr-2 text-[12.5px] font-semibold text-primary-700 dark:text-primary-300 hover:bg-primary-50 dark:hover:bg-primary-900/30 rounded-l-lg disabled:opacity-50">
                        <Layers className="w-3.5 h-3.5" aria-hidden="true" />
                        {b.name}
                        {b.shared && <span className="font-normal text-muted">· {t('visit.bundle.shared')}</span>}
                    </button>
                    {(!b.shared || canRemoveShared) && (
                        <button type="button" onClick={() => onRemove(b)} aria-label={fill(t('visit.bundle.remove'), b.name)}
                            className="h-7 w-6 grid place-items-center text-faint hover:text-red-600 rounded-r-lg">
                            <X className="w-3 h-3" aria-hidden="true" />
                        </button>
                    )}
                </span>
            ))}
        </span>
    );
};

/** Qo'shilgandan keyingi panel: nima qo'shildi, nima qo'shilmadi, «Bekor qilish» */
export const BundleBar: React.FC<{
    bar: BundleBarState; busy: boolean; onUndo: () => void; onAddSkipped: (s: BundleBarState['skipped'][number]) => void; onClose: () => void;
}> = ({ bar, busy, onUndo, onAddSkipped, onClose }) => {
    const { t } = useLanguage();
    const anyCreated = !!(bar.created.rxId || bar.created.procIds.length || bar.created.labOrderIds.length);
    return (
        <div role="status" className="flex flex-col gap-1.5 px-3 py-2.5 rounded-xl bg-success-50 dark:bg-success-500/10 border border-success-500/30 text-[13px]">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-semibold text-success-700 dark:text-success-300">{bar.summary}</span>
                <span className="ml-auto flex items-center gap-3">
                    {anyCreated && (
                        <button type="button" disabled={busy} onClick={onUndo}
                            className="font-semibold text-success-700 dark:text-success-300 hover:underline disabled:opacity-50">
                            {t('visit.bundle.undo')}
                        </button>
                    )}
                    <button type="button" onClick={onClose} aria-label={t('common.close')} className="text-faint hover:text-ink">
                        <X className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                </span>
            </div>
            {bar.skipped.map((s, i) => (
                <div key={i} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-amber-800 dark:text-amber-200">
                    <span>{fill(t(s.kind === 'allergy' ? 'visit.bundle.skippedAllergy' : 'visit.bundle.skippedRecent'), s.name, s.detail)}</span>
                    {s.kind === 'recent' && (
                        <button type="button" disabled={busy} onClick={() => onAddSkipped(s)}
                            className="font-semibold underline disabled:opacity-50">{t('visit.bundle.addAnyway')}</button>
                    )}
                </div>
            ))}
        </div>
    );
};
