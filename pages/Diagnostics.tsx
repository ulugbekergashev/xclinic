import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { formatDate, formatFullName, formatNumber } from '../utils/format';
import { confirmAction } from '../services/confirm';
import {
    Activity, Plus, Search, X, Trash2, AlertCircle, CheckCircle,
    Clock, Printer, Image as ImageIcon, Upload,
} from 'lucide-react';
import { DiagnosticStudy, Modality, MODALITY_LABELS, Patient, Department, Service, Clinic } from '../types';
import { api, getFileUrl, authFetch, isDemoMode } from '../services/api';
import { useLanguage, tr, fill } from '../context/LanguageContext';
import { EmptyState } from '../components/Common';
import { printStudyConclusion } from '../utils/printForms';

/* ─────────────────────────────────────────────────────────────────────────────
   Diagnostika — UZI, EKG, rentgen va boshqalar.

   Laboratoriyadan farqi: natija raqam emas, balki tavsif + xulosa + rasm.
   Fayllar bemor fotolari bilan bir xil mexanizmdan foydalanadi — mahalliy
   uploads/ papkasi, ya'ni internet kerak emas va backup'ga birga tushadi.
   ───────────────────────────────────────────────────────────────────────────── */

const STATUS_UI: Record<string, { label: string; cls: string; Icon: React.ElementType }> = {
    Ordered: { label: "Yo'llandi", cls: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400', Icon: Clock },
    InProgress: { label: 'Bajarilmoqda', cls: 'bg-primary-100 text-primary-700 border-primary-200 dark:bg-primary-900/30 dark:text-primary-400', Icon: Activity },
    Completed: { label: tr('ui.tayyor'), cls: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400', Icon: CheckCircle },
    Cancelled: { label: tr('ui.bekor_qilindi'), cls: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400', Icon: X },
};

const MODALITIES: Modality[] = ['UZI', 'EKG', 'RENTGEN', 'ENDOSKOPIYA', 'MRT', 'KT'];

interface Props {
    clinicId: string;
    patients?: Patient[];
    departments?: Department[];
    services?: Service[];
    doctors?: any[];
    currentUserName?: string;
    /** Bosma blank shapkasi uchun */
    currentClinic?: Clinic | null;
}

/* Raqam formati BITTA joydan — `utils/format.ts`. Ilgari bu yerda
   `Intl.NumberFormat('uz-UZ')` turardi: Chrome da `uz` lokali to'liq
   emas va u vergul qo'yadi («160,000»), Moliya bo'limi esa bo'shliq
   qo'yardi («160 000») — bitta ilovada ikki xil ko'rinish. */
const fmt = (n: number) => formatNumber(n);
const fmtDate = (iso?: string | null) => iso ? formatDate(iso) : '—';

export const Diagnostics: React.FC<Props> = ({
    clinicId, patients = [], departments = [], services = [], doctors = [], currentUserName,
    currentClinic,
}) => {
    const { t } = useLanguage();
    const [studies, setStudies] = useState<DiagnosticStudy[]>([]);
    const [search, setSearch] = useState('');
    const [filterStatus, setFilterStatus] = useState('all');
    const [showNew, setShowNew] = useState(false);
    const [editing, setEditing] = useState<DiagnosticStudy | null>(null);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [uploading, setUploading] = useState(false);

    const [form, setForm] = useState({
        patientId: '', patientName: '', modality: 'UZI' as Modality,
        name: '', price: '', departmentId: '',
    });
    const [draft, setDraft] = useState({ findings: '', conclusion: '' });

    const reload = useCallback(async () => {
        try { setStudies(await api.studies.getAll()); }
        catch (e: any) { setError(e.message || t('ui.yuklab_bolmadi')); }
    }, []);

    useEffect(() => { reload(); }, [reload]);

    const diagDept = useMemo(() => departments.find(d => d.type === 'DIAGNOSTIC'), [departments]);
    // Faqat Diagnostika bo'limiga tegishli xizmatlar. Bo'lim topilmasa BO'SH —
    // ilgari bu yerda "hammasi" ko'rsatilardi va ro'yxatga begona xizmatlar
    // (masalan stomatologik) tushib qolardi.
    const diagServices = useMemo(
        () => diagDept ? services.filter(s => s.departmentId === diagDept.id) : [],
        [services, diagDept],
    );

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return studies.filter(s =>
            (filterStatus === 'all' || s.status === filterStatus) &&
            (!q || s.patientName?.toLowerCase().includes(q) || s.name?.toLowerCase().includes(q))
        );
    }, [studies, search, filterStatus]);

    const create = async () => {
        if (!form.patientId || !form.name.trim()) {
            setError(t('diagnostics.bemor_va_tekshiruv_nomi'));
            return;
        }
        setSaving(true); setError('');
        try {
            await api.studies.create({
                patientId: form.patientId,
                patientName: form.patientName,
                modality: form.modality,
                name: form.name.trim(),
                price: Number(form.price) || 0,
                departmentId: form.departmentId || diagDept?.id || null,
                orderedByName: currentUserName || null,
            });
            await reload();
            setShowNew(false);
            setForm({ patientId: '', patientName: '', modality: 'UZI', name: '', price: '', departmentId: '' });
        } catch (e: any) { setError(e.message || 'Yaratilmadi'); }
        finally { setSaving(false); }
    };

    const openStudy = (s: DiagnosticStudy) => {
        setEditing(s);
        setDraft({ findings: s.findings || '', conclusion: s.conclusion || '' });
        setError('');
    };

    const saveStudy = async (markCompleted: boolean) => {
        if (!editing) return;
        setSaving(true); setError('');
        try {
            await api.studies.update(editing.id, {
                findings: draft.findings,
                conclusion: draft.conclusion,
                ...(markCompleted ? { status: 'Completed', performedByName: currentUserName || null } : {}),
            });
            await reload();
            if (markCompleted) setEditing(null);
        } catch (e: any) {
            /* 402 — to'lanmagan. Bu xato EMAS, ish tartibi: xulosa
               to'lovdan keyin beriladi. Shuning uchun alohida, aniq
               matn bilan ko'rsatiladi. */
            if (e?.status === 402) {
                const due = e?.data?.due ?? e?.due;
                setError(fill(t('diagnostics.tekshiruv_tolanmaganx_bemorni_kassaga'), due ? fill(t('diagnostics.x_som_qarz'), fmt(due)) : ''));
            } else {
                setError(e.message || t('ui.saqlanmadi'));
            }
        }
        finally { setSaving(false); }
    };

    /* Ilgari bu tugma `window.print()` chaqirardi — dastur oynasi bosilardi.
       Xulosa esa rasmiy hujjat: klinika shapkasi, litsenziya, imzo joyi.
       Ekranda hozir kiritilayotgan matn ham qog'ozga tushishi kerak, shuning
       uchun `draft` dan olinadi, bazadagi eski qiymatdan emas. */
    const printConclusion = () => {
        if (!editing) return;
        const patient = patients.find(p => p.id === editing.patientId);
        const opened = printStudyConclusion(
            {
                ...editing,
                findings: draft.findings ?? editing.findings,
                conclusion: draft.conclusion ?? editing.conclusion,
                modalityLabel: MODALITY_LABELS[editing.modality],
                patient,
            },
            currentClinic || undefined,
        );
        if (!opened) setError(t('diagnostics.bosma_oyna_bloklandi'));
    };

    // Rasm yuklash — bemor fotolari bilan bir xil endpoint mexanizmi
    const uploadFile = async (file: File) => {
        if (!editing) return;
        setUploading(true); setError('');
        /* Demoda fayl serverga bormaydi — server yo'q. Foydalanuvchiga
           nima bo'lganini aytamiz, jimgina yiqilmaymiz. */
        if (isDemoMode()) {
            setError(t('diagnostics.namoyish_nusxasida_fayl_yuklab'));
            setUploading(false);
            return;
        }
        try {
            const fd = new FormData();
            fd.append('photo', file);
            /* Token RENDER paytidagi propdan emas, so'rov paytida olinadi
               (`authFetch`) — uzoq ochiq turgan sahifada u eskirib qolardi. */
            const res = await authFetch(`/studies/${editing.id}/files`, {
                method: 'POST',
                body: fd,
            });
            if (!res.ok) throw new Error(t('diagnostics.faylYuklanmadi'));
            await reload();
            const fresh = (await api.studies.getAll()).find(x => x.id === editing.id);
            if (fresh) setEditing(fresh);
        } catch (e: any) { setError(e.message || t('diagnostics.faylYuklanmadi')); }
        finally { setUploading(false); }
    };

    const remove = async (id: string) => {
        if (!await confirmAction({ title: t('diagnostics.tekshiruv_ochiriladi_davom_etasizmi'), danger: true, confirmLabel: t('ui.ochirish_2') })) return;
        try { await api.studies.delete(id); await reload(); }
        catch (e: any) { setError(e.message || t('ui.ochirilmadi')); }
    };

    const inputCls = 'w-full px-3 py-2 border border-line rounded-lg bg-surface text-ink text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500';

    return (
        <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 mr-auto">
                    <Activity className="w-6 h-6 text-primary-600 dark:text-primary-400" />
                    <h2 className="text-xl font-bold text-ink">{t('diag.title')}</h2>
                    <span className="text-sm text-muted">{filtered.length} {t('diagnostics.ta_tekshiruv')}</span>
                </div>
                <button onClick={() => setShowNew(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700">
                    <Plus className="w-4 h-4" /> {t('diagnostics.yangi_tekshiruv')}
                </button>
            </div>

            {error && (
                <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                    <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                    <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
                    <button onClick={() => setError('')} className="ml-auto text-red-400 hover:text-red-600"><X className="w-4 h-4" /></button>
                </div>
            )}

            <div className="flex flex-wrap gap-3">
                <div className="relative flex-1 min-w-[220px]">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
                    <input value={search} onChange={e => setSearch(e.target.value)}
                        placeholder={t('diag.searchPh')} className={`${inputCls} pl-9`} />
                </div>
                <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className={`${inputCls} max-w-[200px]`}>
                    <option value="all">{t('diag.allStatuses')}</option>
                    {Object.entries(STATUS_UI).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
            </div>

            {filtered.length === 0 ? (
                <EmptyState
                    icon={<Activity className="w-12 h-12" />}
                    title={t('diag.noStudies')}
                    hint={t('diag.noStudiesHint')}
                />
            ) : (
                <div className="grid gap-3">
                    {filtered.map(s => {
                        const st = STATUS_UI[s.status] || STATUS_UI.Ordered;
                        return (
                            <div key={s.id} className="bg-surface rounded-xl border border-line p-4">
                                <div className="flex flex-wrap items-start gap-3">
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <h3 className="font-semibold text-ink truncate">{s.patientName}</h3>
                                            <span className="px-2 py-0.5 rounded text-xs font-medium bg-elevated text-muted">
                                                {MODALITY_LABELS[s.modality] || s.modality}
                                            </span>
                                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${st.cls}`}>
                                                <st.Icon className="w-3 h-3" /> {st.label}
                                            </span>
                                            {/* TO'LANDIMI — laboratoriya ro'yxatidagi bilan
                                                bir xil yorliq. Diagnostda bu savolga javob
                                                yo'q edi: xulosani yozib bergandan keyingina
                                                qator to'lanmagan ekani ma'lum bo'lardi. */}
                                            {s.paid === true && (
                                                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                                                    {t('ui.tolangan')}
                                                </span>
                                            )}
                                            {s.paid === false && (
                                                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                                                    {t('ui.tolanmagan')}{s.due ? ` · ${fmt(s.due)}` : ''}
                                                </span>
                                            )}
                                            {!!s.files?.length && (
                                                <span className="inline-flex items-center gap-1 text-xs text-faint">
                                                    <ImageIcon className="w-3 h-3" /> {s.files.length}
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-sm text-muted mt-1">{s.name}</p>
                                        {s.conclusion && (
                                            <p className="text-xs text-muted mt-1 line-clamp-2">
                                                <span className="font-medium">{t('diag.conclusionLabel')}</span> {s.conclusion}
                                            </p>
                                        )}
                                        <p className="text-xs text-faint mt-1">{fmtDate(s.orderedAt)}</p>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <p className="font-semibold text-ink tabular-nums">{fmt(s.price || 0)} {t('ui.som')}</p>
                                        <div className="flex gap-2 mt-2">
                                            <button onClick={() => openStudy(s)}
                                                className="px-3 py-1.5 text-xs font-medium bg-primary-600 text-white rounded-lg hover:bg-primary-700">
                                                {t('diagnostics.xulosa')}
                                            </button>
                                            <button onClick={() => remove(s.id)}
                                                className="p-1.5 text-faint hover:text-red-500 rounded-lg" title={t('ui.ochirish')}>
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Yangi tekshiruv */}
            {showNew && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowNew(false)}>
                    <div className="bg-surface rounded-xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
                        <div className="p-5 border-b border-line flex items-center justify-between">
                            <h3 className="font-semibold text-ink">{t('diag.newStudy')}</h3>
                            <button onClick={() => setShowNew(false)} className="text-faint hover:text-muted"><X className="w-5 h-5" /></button>
                        </div>
                        <div className="p-5 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-muted mb-1.5">{t('common.patient2')}</label>
                                <select value={form.patientId} className={inputCls}
                                    onChange={e => {
                                        const p = patients.find(x => x.id === e.target.value);
                                        setForm(f => ({ ...f, patientId: e.target.value, patientName: p ? `${formatFullName(p)}` : '' }));
                                    }}>
                                    <option value="">{t('common.choose')}</option>
                                    {patients.map(p => <option key={p.id} value={p.id}>{formatFullName(p)}</option>)}
                                </select>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-muted mb-1.5">{t('diag.type')}</label>
                                    <select value={form.modality} onChange={e => setForm(f => ({ ...f, modality: e.target.value as Modality }))} className={inputCls}>
                                        {MODALITIES.map(m => <option key={m} value={m}>{MODALITY_LABELS[m]}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-muted mb-1.5">{t('diag.price')}</label>
                                    <input type="number" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} className={inputCls} placeholder="0" />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-muted mb-1.5">{t('diag.studyName')}</label>
                                {diagServices.length > 0 && (
                                    <select className={`${inputCls} mb-2`}
                                        onChange={e => {
                                            const svc = diagServices.find(x => String(x.id) === e.target.value);
                                            if (svc) setForm(f => ({ ...f, name: svc.name, price: String(svc.price) }));
                                        }}>
                                        <option value="">{t('diag.fromServices')}</option>
                                        {diagServices.map(sv => <option key={sv.id} value={sv.id}>{sv.name} — {fmt(sv.price)}</option>)}
                                    </select>
                                )}
                                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                                    className={inputCls} placeholder={t('diag.namePh')} />
                            </div>
                        </div>
                        <div className="p-5 border-t border-line flex justify-end gap-3">
                            <button onClick={() => setShowNew(false)} className="px-4 py-2 text-sm font-medium text-muted hover:bg-elevated rounded-lg">{t('common.cancel2')}</button>
                            <button onClick={create} disabled={saving} className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50">
                                {saving ? t('ui.saqlanmoqda_2') : t('ui.yaratish')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Xulosa */}
            {editing && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setEditing(null)}>
                    <div className="bg-surface rounded-xl w-full max-w-3xl max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
                        <div className="p-5 border-b border-line flex items-center gap-3">
                            <div className="min-w-0">
                                <h3 className="font-semibold text-ink truncate">{editing.patientName}</h3>
                                <p className="text-xs text-muted">
                                    {MODALITY_LABELS[editing.modality]} · {editing.name}
                                </p>
                            </div>
                            <div className="ml-auto flex items-center gap-2">
                                <button aria-label={t('diag.printConclusion')} onClick={printConclusion} className="p-2 text-faint hover:text-muted" title={t('diag.printConclusion')}>
                                    <Printer className="w-5 h-5" />
                                </button>
                                <button onClick={() => setEditing(null)} className="text-faint hover:text-muted"><X className="w-5 h-5" /></button>
                            </div>
                        </div>

                        <div className="p-5 overflow-y-auto space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-muted mb-1.5">Tavsif (tafsilot)</label>
                                <textarea rows={6} value={draft.findings} onChange={e => setDraft(d => ({ ...d, findings: e.target.value }))}
                                    className={inputCls} placeholder={t('diag.findingsPh')} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-muted mb-1.5">{t('diag.conclusion')}</label>
                                <textarea rows={3} value={draft.conclusion} onChange={e => setDraft(d => ({ ...d, conclusion: e.target.value }))}
                                    className={inputCls} placeholder={t('diag.conclusionPh')} />
                            </div>

                            {/* Rasmlar */}
                            <div>
                                <div className="flex items-center gap-3 mb-2">
                                    <label className="text-sm font-medium text-muted">{t('diag.images')}</label>
                                    <label className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-line rounded-lg cursor-pointer hover:bg-elevated">
                                        <Upload className="w-3.5 h-3.5" />
                                        {uploading ? t('ui.yuklanmoqda_2') : t('diagnostics.rasm_qoshish')}
                                        <input type="file" accept="image/*" className="hidden" disabled={uploading}
                                            onChange={e => { const f = e.target.files?.[0]; if (f) uploadFile(f); e.target.value = ''; }} />
                                    </label>
                                </div>
                                {editing.files?.length ? (
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                        {editing.files.map(f => (
                                            <a key={f.id} href={getFileUrl('study-file', f.id)} target="_blank" rel="noopener noreferrer"
                                                className="block aspect-square rounded-lg overflow-hidden border border-line">
                                                <img src={getFileUrl('study-file', f.id)} alt={f.caption || ''} className="w-full h-full object-cover" />
                                            </a>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-xs text-faint">{t('diag.noImages')}</p>
                                )}
                            </div>
                        </div>

                        <div className="p-5 border-t border-line flex justify-end gap-3">
                            <button onClick={() => saveStudy(false)} disabled={saving}
                                className="px-4 py-2 text-sm font-medium border border-line rounded-lg hover:bg-elevated disabled:opacity-50">
                                {t('common.save')}
                            </button>
                            <button onClick={() => saveStudy(true)} disabled={saving}
                                className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50">
                                {t('diagnostics.tayyor_deb_belgilash')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
