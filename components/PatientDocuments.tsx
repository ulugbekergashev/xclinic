import React, { useState, useEffect, useCallback } from 'react';
import { formatDate } from '../utils/format';
import {
    FileSignature, Printer, Check, AlertTriangle, Loader2, Plus, Clock,
} from 'lucide-react';
import { api } from '../services/api';
import { printPatientDocument } from '../utils/printForms';

import { useLanguage, tr } from '../context/LanguageContext';
/* ─────────────────────────────────────────────────────────────────────────────
   Bemor imzolaydigan hujjatlar.

   MUAMMO. Tizimda birorta imzolanadigan qog'oz yo'q edi. Uchtasi qonun
   talabi:
     - xabardor rozilik — 25-modda 4-qismi (aralashuvdan OLDIN);
     - pullik xizmat shartnomasi — 26-modda;
     - ma'lumotlarni qayta ishlashga rozilik — ЗРУ-547.

   ISH TARTIBI ATAYLAB IKKI QADAM: hujjat yaratiladi va bosiladi, bemor
   o'qib imzolaydi, keyin tizimda "imzolangan" deb belgilanadi. Bir tugmada
   "yaratdim va imzoladim" qilish — bemor o'qimagan qog'ozni imzolangan deb
   yozish degani.
   ───────────────────────────────────────────────────────────────────────────── */

interface Props {
    patientId: string;
    visitId?: string | null;
    /** Yaratish huquqi: registrator, shifokor, admin */
    canCreate?: boolean;
    addToast?: (type: 'success' | 'error' | 'info', msg: string) => void;
}

const KINDS: { key: 'Consent' | 'Contract' | 'DataConsent'; label: string; hint: string }[] = [
    { key: 'Consent', label: tr('patientdocuments.xabardor_rozilik'), hint: tr('patientdocuments.aralashuvdan_oldin_25_modda') },
    { key: 'Contract', label: tr('patientdocuments.shartnoma'), hint: tr('patientdocuments.pullik_xizmat_26_modda') },
    { key: 'DataConsent', label: tr('patientdocuments.malumotlarga_rozilik'), hint: 'ЗРУ-547' },
];

const KIND_LABEL: Record<string, string> = {
    Consent: tr('patientdocuments.xabardor_rozilik'),
    Contract: tr('patientdocuments.shartnoma'),
    DataConsent: tr('patientdocuments.malumotlarga_rozilik'),
    Discharge: "Ma'lumotnoma",
    Other: tr('ui.hujjat'),
};

const fmtDate = (v?: string | null) => v ? formatDate(v) : '—';

export const PatientDocuments: React.FC<Props> = ({ patientId, visitId, canCreate, addToast }) => {
    const { t } = useLanguage();
    const [docs, setDocs] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState('');

    const load = useCallback(async () => {
        if (!patientId) return;
        try {
            setDocs(await api.compliance.documents({ patientId }));
            setError('');
        } catch (e: any) {
            setError(e?.message || t('patientdocuments.hujjatlar_yuklanmadi'));
        } finally { setLoading(false); }
    }, [patientId]);

    useEffect(() => { load(); }, [load]);

    /** Yaratish va DARHOL bosish: qog'oz bo'lmasa imzo ham bo'lmaydi */
    const create = async (kind: 'Consent' | 'Contract' | 'DataConsent') => {
        setBusy(kind);
        try {
            const created = await api.compliance.createDocument({ patientId, visitId, kind });
            const full = await api.compliance.document(created.id);
            const opened = printPatientDocument(full, full.clinic);
            await load();
            addToast?.(opened ? 'success' : 'info',
                opened ? `${KIND_LABEL[kind]} № ${created.number}` : t('patientdocuments.hujjat_yaratildi_lekin_bosma'));
        } catch (e: any) {
            setError(e?.message || 'Yaratilmadi');
        } finally { setBusy(''); }
    };

    const reprint = async (id: string) => {
        setBusy(id);
        try {
            const full = await api.compliance.document(id);
            printPatientDocument(full, full.clinic);
        } catch (e: any) {
            setError(e?.message || 'Ochilmadi');
        } finally { setBusy(''); }
    };

    const sign = async (id: string) => {
        setBusy(id);
        try {
            await api.compliance.sign(id, { patientSigned: true });
            await load();
            addToast?.('success', t('patientdocuments.imzolangan_deb_belgilandi'));
        } catch (e: any) {
            setError(e?.message || 'Belgilanmadi');
        } finally { setBusy(''); }
    };

    return (
        <div className="bg-surface rounded-xl border border-line overflow-hidden">
            <div className="px-4 py-3 border-b border-line-soft flex items-center gap-2">
                <FileSignature className="w-4 h-4 text-faint" />
                <h3 className="text-sm font-bold text-ink">{t('card.secDocuments')}</h3>
                <span className="text-xs text-faint">({docs.length})</span>
            </div>

            {canCreate && (
                <div className="px-4 py-3 border-b border-line-soft">
                    <div className="flex flex-wrap gap-2">
                        {KINDS.map(k => (
                            <button key={k.key} onClick={() => create(k.key)} disabled={!!busy}
                                title={k.hint}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-line text-muted hover:border-primary-400 disabled:opacity-50">
                                {busy === k.key ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                                {k.label}
                            </button>
                        ))}
                    </div>
                    <p className="text-[11px] text-faint mt-2">
                        {t('patientdocuments.hujjat_yaratilib_darhol_bosishga')}
                    </p>
                </div>
            )}

            {error && (
                <div className="mx-4 my-3 flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                    <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                    <p className="text-sm text-red-700 dark:text-red-300 flex-1">{error}</p>
                    <button onClick={load} className="text-sm font-medium text-red-700 dark:text-red-300 hover:underline">
                        {t('ui.qayta')}
                    </button>
                </div>
            )}

            {loading ? (
                <div className="p-4 space-y-2">
                    {[0, 1].map(i => <div key={i} className="h-12 bg-elevated rounded animate-pulse" />)}
                </div>
            ) : docs.length === 0 ? (
                <div className="px-4 py-8 text-center">
                    <p className="text-sm text-muted">{t('patientdocuments.hujjat_yoq')}</p>
                    <p className="text-[11px] text-faint mt-1">
                        {t('patientdocuments.rozilik_va_shartnoma_qonun')}
                    </p>
                </div>
            ) : (
                <div className="divide-y divide-line">
                    {docs.map(d => (
                        <div key={d.id} className="px-4 py-3 flex flex-wrap items-center gap-2">
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium text-ink truncate">
                                    {KIND_LABEL[d.kind] || d.kind}
                                    {d.number ? <span className="text-faint font-normal"> № {d.number}</span> : null}
                                </p>
                                <p className="text-[11px] text-faint">
                                    {fmtDate(d.createdAt)}
                                    {d.createdByName ? ` · ${d.createdByName}` : ''}
                                </p>
                            </div>

                            {d.signedAt ? (
                                <span className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                                    <Check className="w-3 h-3" /> imzolangan {fmtDate(d.signedAt)}
                                </span>
                            ) : (
                                <span className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                                    <Clock className="w-3 h-3" /> imzolanmagan
                                </span>
                            )}

                            <button onClick={() => reprint(d.id)} disabled={busy === d.id}
                                title={t('patientdocuments.qayta_bosish')}
                                className="p-1.5 rounded-lg text-faint hover:text-primary-600 hover:bg-elevated">
                                <Printer className="w-4 h-4" />
                            </button>

                            {!d.signedAt && canCreate && (
                                <button onClick={() => sign(d.id)} disabled={busy === d.id}
                                    className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50">
                                    Imzolandi
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
