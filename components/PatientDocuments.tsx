import React, { useState, useEffect, useCallback } from 'react';
import {
    FileSignature, Printer, Check, AlertTriangle, Loader2, Plus, Clock,
} from 'lucide-react';
import { api } from '../services/api';
import { printPatientDocument } from '../utils/printForms';

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
    { key: 'Consent', label: 'Xabardor rozilik', hint: 'Aralashuvdan oldin — 25-modda' },
    { key: 'Contract', label: 'Shartnoma', hint: 'Pullik xizmat — 26-modda' },
    { key: 'DataConsent', label: "Ma'lumotlarga rozilik", hint: 'ЗРУ-547' },
];

const KIND_LABEL: Record<string, string> = {
    Consent: 'Xabardor rozilik',
    Contract: 'Shartnoma',
    DataConsent: "Ma'lumotlarga rozilik",
    Discharge: "Ma'lumotnoma",
    Other: 'Hujjat',
};

const fmtDate = (v?: string | null) => v ? new Date(v).toLocaleDateString('uz-UZ') : '—';

export const PatientDocuments: React.FC<Props> = ({ patientId, visitId, canCreate, addToast }) => {
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
            setError(e?.message || 'Hujjatlar yuklanmadi');
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
                opened ? `${KIND_LABEL[kind]} № ${created.number}` : `Hujjat yaratildi, lekin bosma oyna bloklandi`);
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
            addToast?.('success', 'Imzolangan deb belgilandi');
        } catch (e: any) {
            setError(e?.message || 'Belgilanmadi');
        } finally { setBusy(''); }
    };

    return (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2">
                <FileSignature className="w-4 h-4 text-gray-400" />
                <h3 className="text-sm font-bold text-gray-900 dark:text-white">Hujjatlar</h3>
                <span className="text-xs text-gray-400">({docs.length})</span>
            </div>

            {canCreate && (
                <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                    <div className="flex flex-wrap gap-2">
                        {KINDS.map(k => (
                            <button key={k.key} onClick={() => create(k.key)} disabled={!!busy}
                                title={k.hint}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-primary-400 disabled:opacity-50">
                                {busy === k.key ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                                {k.label}
                            </button>
                        ))}
                    </div>
                    <p className="text-[11px] text-gray-400 mt-2">
                        Hujjat yaratilib darhol bosishga beriladi. Bemor o'qib imzolagach,
                        ro'yxatda "Imzolandi" deb belgilang.
                    </p>
                </div>
            )}

            {error && (
                <div className="mx-4 my-3 flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                    <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                    <p className="text-sm text-red-700 dark:text-red-300 flex-1">{error}</p>
                    <button onClick={load} className="text-sm font-medium text-red-700 dark:text-red-300 hover:underline">
                        Qayta
                    </button>
                </div>
            )}

            {loading ? (
                <div className="p-4 space-y-2">
                    {[0, 1].map(i => <div key={i} className="h-12 bg-gray-100 dark:bg-gray-700/40 rounded animate-pulse" />)}
                </div>
            ) : docs.length === 0 ? (
                <div className="px-4 py-8 text-center">
                    <p className="text-sm text-gray-500 dark:text-gray-400">Hujjat yo'q</p>
                    <p className="text-[11px] text-gray-400 mt-1">
                        Rozilik va shartnoma — qonun talabi, ular bemor kartasida bo'lishi kerak.
                    </p>
                </div>
            ) : (
                <div className="divide-y divide-gray-100 dark:divide-gray-700">
                    {docs.map(d => (
                        <div key={d.id} className="px-4 py-3 flex flex-wrap items-center gap-2">
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                    {KIND_LABEL[d.kind] || d.kind}
                                    {d.number ? <span className="text-gray-400 font-normal"> № {d.number}</span> : null}
                                </p>
                                <p className="text-[11px] text-gray-400">
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
                                title="Qayta bosish"
                                className="p-1.5 rounded-lg text-gray-400 hover:text-primary-600 hover:bg-gray-100 dark:hover:bg-gray-700">
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
