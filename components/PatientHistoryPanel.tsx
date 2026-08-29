import React, { useState, useEffect, useCallback } from 'react';
import { formatDate } from '../utils/format';
import {
    AlertTriangle, Activity, FlaskConical, Scan, Pill, BedDouble,
    ChevronDown, ChevronUp, Wallet, Plus, X,
} from 'lucide-react';
import { api } from '../services/api';

/* ─────────────────────────────────────────────────────────────────────────────
   "Avval nima bo'lgan" paneli.

   MUAMMO. Shifokorning ish stolida bemor haqida faqat ism, yosh, jins va
   shikoyat bor edi. Bir oy oldin xirurg ko'rgan bemor terapevtga kelganda
   terapevt hech narsa ko'rmasdi: na allergiyani, na oldingi tashxislarni.
   GAP-ANALYSIS dagi 2-sahnaning aynan shu joyi ishlamasdi.

   TARTIB ATAYLAB SHUNDAY: allergiya birinchi va qizil rangda. Bu qulaylik
   emas — dori tayinlanadigan ekranda allergiya ko'rinmasligi xavf.

   Panel yopilgan holatda ochiladi, LEKIN allergiya bo'lsa — majburan ochiq:
   yopiq panel ostidagi ogohlantirishning ma'nosi yo'q.
   ───────────────────────────────────────────────────────────────────────────── */

interface Props {
    patientId: string;
    /** Allergiya qo'shish faqat shifokor va adminga */
    canEdit?: boolean;
    addToast?: (type: 'success' | 'error' | 'info', msg: string) => void;
}

const fmt = (n: number) => new Intl.NumberFormat('uz-UZ').format(Math.round(n || 0));
const fmtDate = (v?: string | null) => {
    if (!v) return '—';
    try { return formatDate(v); } catch { return String(v).slice(0, 10); }
};

const SEVERITY_UI: Record<string, string> = {
    Severe: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
    Mild: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
    Unknown: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
};
const SEVERITY_LABEL: Record<string, string> = {
    Severe: "Og'ir", Mild: 'Yengil', Unknown: "Noma'lum",
};

export const PatientHistoryPanel: React.FC<Props> = ({ patientId, canEdit, addToast }) => {
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [open, setOpen] = useState(false);
    const [addingAllergy, setAddingAllergy] = useState(false);
    const [allergyForm, setAllergyForm] = useState({ substance: '', reaction: '', severity: 'Unknown' });
    const [saving, setSaving] = useState(false);

    const load = useCallback(async () => {
        if (!patientId) return;
        try {
            const d = await api.clinical.summary(patientId);
            setData(d);
            // Allergiya bo'lsa panel majburan ochiladi
            if ((d.allergies || []).length > 0) setOpen(true);
            setError('');
        } catch (e: any) {
            setError(e?.message || 'Tarixni yuklab bo\'lmadi');
        } finally { setLoading(false); }
    }, [patientId]);

    useEffect(() => { load(); }, [load]);

    const submitAllergy = async () => {
        if (!allergyForm.substance.trim()) return;
        setSaving(true);
        try {
            await api.clinical.addAllergy(patientId, {
                substance: allergyForm.substance.trim(),
                reaction: allergyForm.reaction.trim() || undefined,
                severity: allergyForm.severity,
            });
            setAllergyForm({ substance: '', reaction: '', severity: 'Unknown' });
            setAddingAllergy(false);
            await load();
            addToast?.('success', 'Allergiya qo\'shildi');
        } catch (e: any) {
            addToast?.('error', e?.message || 'Saqlanmadi');
        } finally { setSaving(false); }
    };

    const removeAllergy = async (id: string) => {
        try {
            await api.clinical.removeAllergy(patientId, id);
            await load();
        } catch (e: any) {
            addToast?.('error', e?.message || 'O\'chirilmadi');
        }
    };

    if (loading) {
        return (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                <div className="h-4 w-40 bg-gray-100 dark:bg-gray-700 rounded animate-pulse mb-2" />
                <div className="h-3 w-64 bg-gray-100 dark:bg-gray-700 rounded animate-pulse" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
                <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
                <p className="text-sm text-red-700 dark:text-red-300 flex-1">{error}</p>
                <button onClick={load} className="text-sm font-medium text-red-700 dark:text-red-300 hover:underline">
                    Qayta urinish
                </button>
            </div>
        );
    }

    if (!data) return null;

    const allergies = data.allergies || [];
    const hasAnything = allergies.length > 0 || (data.chronic || []).length > 0
        || (data.recentVisits || []).length > 0 || (data.abnormalResults || []).length > 0;

    return (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            {/* Sarlavha — bosilganda yopiladi/ochiladi */}
            <button onClick={() => setOpen(!open)}
                className="w-full flex items-center gap-3 p-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors">
                <Activity className="w-4 h-4 text-gray-400 shrink-0" />
                <span className="text-sm font-semibold text-gray-900 dark:text-white">Avval nima bo'lgan</span>

                {/* Yopiq holatda ham eng muhimi ko'rinadi */}
                {allergies.length > 0 && (
                    <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300">
                        ALLERGIYA: {allergies.map((a: any) => a.substance).join(', ')}
                    </span>
                )}
                {data.due > 0 && (
                    <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                        qarz {fmt(data.due)}
                    </span>
                )}
                {!hasAnything && (
                    <span className="text-xs text-gray-400">yozuv yo'q — birinchi murojaat</span>
                )}
                <span className="ml-auto text-gray-400">
                    {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </span>
            </button>

            {open && (
                <div className="border-t border-gray-200 dark:border-gray-700 p-4 space-y-4">

                    {/* ── Allergiya — birinchi va qizil ───────────────────── */}
                    <section>
                        <div className="flex items-center gap-2 mb-2">
                            <AlertTriangle className="w-4 h-4 text-red-500" />
                            <h4 className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                Allergiya
                            </h4>
                            {canEdit && !addingAllergy && (
                                <button onClick={() => setAddingAllergy(true)}
                                    className="ml-auto text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline flex items-center gap-1">
                                    <Plus className="w-3 h-3" /> qo'shish
                                </button>
                            )}
                        </div>

                        {allergies.length === 0 ? (
                            <p className="text-sm text-gray-400">Ma'lumot yo'q</p>
                        ) : (
                            <div className="space-y-1.5">
                                {allergies.map((a: any) => (
                                    <div key={a.id}
                                        className="flex items-center gap-2 p-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                                        <span className="text-sm font-semibold text-red-900 dark:text-red-200">{a.substance}</span>
                                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${SEVERITY_UI[a.severity] || SEVERITY_UI.Unknown}`}>
                                            {SEVERITY_LABEL[a.severity] || a.severity}
                                        </span>
                                        {a.reaction && (
                                            <span className="text-xs text-red-800 dark:text-red-300 truncate">{a.reaction}</span>
                                        )}
                                        {canEdit && (
                                            <button onClick={() => removeAllergy(a.id)}
                                                title="Faolsizlantirish (yozuv saqlanadi)"
                                                className="ml-auto p-1 text-red-400 hover:text-red-600 shrink-0">
                                                <X className="w-3.5 h-3.5" />
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}

                        {addingAllergy && (
                            <div className="mt-2 p-3 border border-gray-200 dark:border-gray-700 rounded-lg space-y-2">
                                <input value={allergyForm.substance} autoFocus
                                    onChange={(e) => setAllergyForm(f => ({ ...f, substance: e.target.value }))}
                                    placeholder="Dori yoki modda (masalan: Penitsillin)"
                                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white" />
                                <input value={allergyForm.reaction}
                                    onChange={(e) => setAllergyForm(f => ({ ...f, reaction: e.target.value }))}
                                    placeholder="Qanday namoyon bo'ldi (ixtiyoriy)"
                                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white" />
                                <div className="flex items-center gap-2">
                                    <select value={allergyForm.severity}
                                        onChange={(e) => setAllergyForm(f => ({ ...f, severity: e.target.value }))}
                                        className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white">
                                        <option value="Unknown">Noma'lum</option>
                                        <option value="Mild">Yengil</option>
                                        <option value="Severe">Og'ir</option>
                                    </select>
                                    <button onClick={submitAllergy} disabled={saving || !allergyForm.substance.trim()}
                                        className="ml-auto px-3 py-2 text-sm font-medium bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50">
                                        Saqlash
                                    </button>
                                    <button onClick={() => setAddingAllergy(false)}
                                        className="px-3 py-2 text-sm text-gray-600 dark:text-gray-300">
                                        Bekor
                                    </button>
                                </div>
                            </div>
                        )}
                    </section>

                    {/* ── Surunkali kasalliklar ──────────────────────────── */}
                    {(data.chronic || []).length > 0 && (
                        <section>
                            <h4 className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
                                Surunkali kasalliklar
                            </h4>
                            <div className="flex flex-wrap gap-1.5">
                                {data.chronic.map((c: any) => (
                                    <span key={c.id}
                                        className="px-2 py-1 rounded-lg text-xs bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200">
                                        <b>{c.code}</b> {c.name}
                                    </span>
                                ))}
                            </div>
                        </section>
                    )}

                    {/* ── Norma chegarasidan chiqqan natijalar ───────────── */}
                    {(data.abnormalResults || []).length > 0 && (
                        <section>
                            <h4 className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
                                Normadan chetda
                            </h4>
                            <div className="space-y-1">
                                {data.abnormalResults.map((r: any, i: number) => (
                                    <div key={i} className="flex items-center gap-2 text-sm">
                                        <span className="text-gray-700 dark:text-gray-300 flex-1 min-w-0 truncate">{r.name}</span>
                                        <span className={`font-bold tabular-nums ${r.flag === 'High' ? 'text-red-600 dark:text-red-400' : 'text-blue-600 dark:text-blue-400'}`}>
                                            {r.value} {r.unit || ''} {r.flag === 'High' ? '↑' : '↓'}
                                        </span>
                                        {(r.refLow != null || r.refHigh != null) && (
                                            <span className="text-xs text-gray-400 shrink-0">
                                                norma {r.refLow ?? ''}–{r.refHigh ?? ''}
                                            </span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}

                    {/* ── Oldingi qabullar, BOSHQA bo'limlar ham ─────────── */}
                    {(data.recentVisits || []).length > 0 && (
                        <section>
                            <h4 className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
                                Oldingi qabullar
                            </h4>
                            <div className="space-y-1.5">
                                {data.recentVisits.map((v: any) => (
                                    <div key={v.id} className="flex items-start gap-2 text-sm">
                                        <span className="w-2 h-2 rounded-full mt-1.5 shrink-0"
                                            style={{ backgroundColor: v.color || '#9CA3AF' }} />
                                        <span className="text-xs text-gray-400 shrink-0 w-20">{fmtDate(v.date)}</span>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-gray-900 dark:text-white truncate">
                                                {v.department || 'Bo\'limsiz'}
                                                {v.doctorName ? ` · ${v.doctorName}` : ''}
                                            </p>
                                            {v.diagnosis && (
                                                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{v.diagnosis}</p>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}

                    {/* ── Tahlil va tekshiruvlar ─────────────────────────── */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {(data.recentLabs || []).length > 0 && (
                            <section>
                                <h4 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
                                    <FlaskConical className="w-3.5 h-3.5" /> Tahlillar
                                </h4>
                                <div className="space-y-1">
                                    {data.recentLabs.map((o: any) => (
                                        <p key={o.id} className="text-xs text-gray-600 dark:text-gray-300 truncate">
                                            {fmtDate(o.completedAt)} — {(o.tests || []).join(', ')}
                                        </p>
                                    ))}
                                </div>
                            </section>
                        )}

                        {(data.recentStudies || []).length > 0 && (
                            <section>
                                <h4 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
                                    <Scan className="w-3.5 h-3.5" /> Tekshiruvlar
                                </h4>
                                <div className="space-y-1">
                                    {data.recentStudies.map((st: any) => (
                                        <p key={st.id} className="text-xs text-gray-600 dark:text-gray-300 truncate">
                                            {fmtDate(st.performedAt)} — {st.name}
                                            {st.conclusion ? `: ${st.conclusion}` : ''}
                                        </p>
                                    ))}
                                </div>
                            </section>
                        )}

                        {(data.activeMedications || []).length > 0 && (
                            <section>
                                <h4 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
                                    <Pill className="w-3.5 h-3.5" /> Hozir qabul qilayotgan
                                </h4>
                                <div className="space-y-1">
                                    {data.activeMedications.map((m: any, i: number) => (
                                        <p key={i} className="text-xs text-gray-600 dark:text-gray-300 truncate">
                                            {m.name}{m.dosage ? ` · ${m.dosage}` : ''}{m.frequency ? ` · ${m.frequency}` : ''}
                                        </p>
                                    ))}
                                </div>
                            </section>
                        )}

                        {(data.admissions || []).length > 0 && (
                            <section>
                                <h4 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
                                    <BedDouble className="w-3.5 h-3.5" /> Statsionar
                                </h4>
                                <div className="space-y-1">
                                    {data.admissions.map((a: any) => (
                                        <p key={a.id} className="text-xs text-gray-600 dark:text-gray-300 truncate">
                                            {fmtDate(a.admittedAt)}
                                            {a.dischargedAt ? ` – ${fmtDate(a.dischargedAt)}` : ' — hozir yotibdi'}
                                            {a.diagnosis ? `: ${a.diagnosis}` : ''}
                                        </p>
                                    ))}
                                </div>
                            </section>
                        )}
                    </div>

                    {data.due > 0 && (
                        <div className="flex items-center gap-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                            <Wallet className="w-4 h-4 text-amber-500" />
                            <span className="text-sm text-gray-700 dark:text-gray-300">
                                To'lanmagan qarz: <b className="tabular-nums">{fmt(data.due)}</b> so'm
                            </span>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
