import React, { useState } from 'react';
import { Shield, RefreshCw, AlertTriangle } from 'lucide-react';
import { Card, Button } from './Common';
import { api } from '../services/api';
import { toast } from '../services/toast';
import { UserRole, AccessControl, RoleAccess, Clinic } from '../types';
import { parseAccessControl } from '../utils/accessControl';
import { accessModulesFor } from '../utils/navigation';
import { SIMPLE_VIEW_HIDDEN_MODULES } from '../constants';
import { useLanguage } from '../context/LanguageContext';

/* ────────────────────────────────────────────────────────────────────────────
   RUXSATLAR — IKKI JOYDAN OCHILADI, BITTA JOYDA YOZILGAN.

   Bu panel Sozlamalar → Ruxsatlar da ham, Xodimlar → Ruxsatlar da ham
   ko'rinadi. Nima uchun ikkalasida: savol ikki tomondan keladi —
   «tizimni sozlayapman» va «bu xodim nimani ko'radi?». Xodimlar
   moduliga kirgan odam Sozlamalarga o'tib izlashi kerak emas.

   NUSXA EMAS, KOMPONENT. Bu faylning butun mavjudlik sababi shu: agar
   JSX ikkinchi joyga ko'chirilganda ikkalasi vaqt o'tib ajralib ketardi
   — bu loyihada allaqachon bir necha marta sodir bo'lgan (menyu ikki
   joyda, ruxsat modullari ro'yxati ikki joyda). Holat ham shu yerda:
   chaqiruvchi faqat klinikani va «yangilandi» signalini beradi.

   FAQAT EGA UCHUN. Guard chaqiruvchi tomonda turadi — komponentning
   o'zi rolni bilmaydi.
   ─────────────────────────────────────────────────────────────────────────── */

const ROLE_LABEL: Record<string, string> = {
   CLINIC_ADMIN: 'Klinika egasi', DOCTOR: 'Shifokor', RECEPTIONIST: 'Registrator',
   NURSE: 'Hamshira', LAB_TECHNICIAN: 'Laborant',
};
const ACTION_LABEL: Record<string, string> = {
   View: "Ko'rdi", Create: "Yaratdi", Update: "O'zgartirdi",
   Delete: "O'chirdi", Print: "Bosdi", Export: "Yukladi",
};
const ENTITY_LABEL: Record<string, string> = {
   Patient: 'Bemor kartasi', Visit: 'Qabul', PatientDocument: 'Hujjat',
   PatientPhoto: 'Surat', DiagnosticStudy: 'Tekshiruv', LabOrder: 'Tahlil',
};

type AccessRoleKey = 'doctor' | 'receptionist' | 'labTechnician' | 'nurse';

interface Props {
   currentClinic?: Clinic;
   /** Saqlangandan keyin App dagi klinika yozuvini qayta o'qish */
   onClinicUpdated?: () => void;
   /** «Saqlash» qatoridan keyin qo'yiladigan qo'shimcha blok.
       Sozlamalar shu yerga «Kassa smenalari» ni beradi — u ruxsat emas,
       lekin tarixan shu bo'limda turadi va Xodimlarga aloqasi yo'q. */
   children?: React.ReactNode;
}

export const AccessControlTab: React.FC<Props> = ({ currentClinic, onClinicUpdated, children }) => {
   const { t } = useLanguage();

   const [accessForm, setAccessForm] = useState<AccessControl>(() => parseAccessControl(currentClinic));
   const [accessSaving, setAccessSaving] = useState(false);
   const [accessSaved, setAccessSaved] = useState(false);

   const updateRoleAccess = (roleKey: AccessRoleKey, patch: Partial<RoleAccess>) => {
      setAccessForm(prev => ({ ...prev, [roleKey]: { ...prev[roleKey], ...patch } }));
   };

   const toggleModule = (roleKey: AccessRoleKey, moduleId: string) => {
      const hidden = accessForm[roleKey]?.hiddenModules || [];
      const next = hidden.includes(moduleId) ? hidden.filter(m => m !== moduleId) : [...hidden, moduleId];
      updateRoleAccess(roleKey, { hiddenModules: next });
   };

   // Tayyor presetlar: "Sodda" — faqat kundalik ish uchun kerak modullar, "Hammasi" — cheklovsiz
   const applyPreset = (roleKey: AccessRoleKey, roleId: string, preset: 'simple' | 'all') => {
      updateRoleAccess(roleKey, {
         hiddenModules: preset === 'simple' ? [...(SIMPLE_VIEW_HIDDEN_MODULES[roleId] || [])] : [],
      });
   };

   const isSimplePreset = (roleKey: AccessRoleKey, roleId: string) => {
      const hidden = [...(accessForm[roleKey]?.hiddenModules || [])].sort();
      const target = [...(SIMPLE_VIEW_HIDDEN_MODULES[roleId] || [])].sort();
      return hidden.length === target.length && hidden.every((m, i) => m === target[i]);
   };

   // Klinika ma'lumoti keyin yuklansa, formani sinxronlash
   React.useEffect(() => {
      setAccessForm(parseAccessControl(currentClinic));
   }, [currentClinic?.id, currentClinic?.accessControl]);

   const handleAccessSave = async () => {
      if (!currentClinic?.id) return;
      setAccessSaving(true);
      try {
         await api.clinics.updateAccessControl(currentClinic.id, accessForm);
         setAccessSaved(true);
         setTimeout(() => setAccessSaved(false), 2000);
         /* Ilgari bu yerda `window.location.reload()` turardi: butun ilova
            qaytadan yuklanardi, xotiradagi hamma ro'yxat yo'qolardi.
            Endi faqat klinika yozuvi qayta o'qiladi. */
         onClinicUpdated?.();
      } catch (error: any) {
         console.error('Failed to save access control:', error);
         toast.error(error?.message || 'Ruxsatlarni saqlashda xatolik. Backend yangilanganiga ishonch hosil qiling.');
      } finally {
         setAccessSaving(false);
      }
   };

   /* ─── Kirish jurnali (reliz 6) ─────────────────────────────────
      Ro'yxat 500 yozuv bilan cheklangan — jurnal tez o'sadigan jadval, va
      butun tarixni ekranga tortishning ma'nosi yo'q. */
   const [logData, setLogData] = useState<any>(null);
   const [logLoading, setLogLoading] = useState(false);
   const [logError, setLogError] = useState('');
   const [logFrom, setLogFrom] = useState(() => {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      return d.toISOString().slice(0, 10);
   });
   const [logTo, setLogTo] = useState(() => new Date().toISOString().slice(0, 10));
   const [logAction, setLogAction] = useState('');

   const loadAccessLog = React.useCallback(async () => {
      setLogLoading(true);
      setLogError('');
      try {
         setLogData(await api.compliance.accessLog({
            from: logFrom, to: logTo,
            action: logAction || undefined,
         }));
      } catch (e: any) {
         setLogError(e?.message || 'Jurnal yuklanmadi');
      } finally {
         setLogLoading(false);
      }
   }, [logFrom, logTo, logAction]);

   /* Jurnal panel OCHILGANDA yuklanadi. Ilgari bu \`activeTab\` ga
      bog'langan edi; komponent endi faqat ko'ringanda render bo'ladi,
      ya'ni shartning o'zi ortiqcha. */
   React.useEffect(() => {
      loadAccessLog();
   }, [loadAccessLog]);

   return (
      <div className="space-y-6">
                  <Card className="p-6">
                     <div className="flex items-start gap-3">
                        <div className="p-2.5 bg-primary-50 dark:bg-primary-900/30 rounded-xl">
                           <Shield className="w-5 h-5 text-primary-600 dark:text-primary-400" />
                        </div>
                        <div>
                           <h2 className="text-lg font-semibold text-ink">Ruxsatlarni boshqarish</h2>
                           <p className="text-sm text-muted mt-1">
                              Shifokor va resepshn qaysi bo'limlar va ma'lumotlarni ko'rishini belgilang.
                              Belgisi olib tashlangan modul menyuda ko'rinmaydi. Bosh sahifa (Dashboard) har doim ochiq qoladi.
                           </p>
                        </div>
                     </div>
                  </Card>

                  {([
                     { roleKey: 'receptionist' as const, roleId: UserRole.RECEPTIONIST, title: 'Registrator', desc: 'Qabulxona xodimlari uchun' },
                     { roleKey: 'doctor' as const, roleId: UserRole.DOCTOR, title: 'Shifokor', desc: 'Shifokorlar uchun' },
                     { roleKey: 'labTechnician' as const, roleId: UserRole.LAB_TECHNICIAN, title: 'Laborant', desc: 'Tahlil natijalarini kiritadi' },
                     { roleKey: 'nurse' as const, roleId: UserRole.NURSE, title: 'Hamshira', desc: 'Dori beradi, palatani olib boradi' },
                  ]).map(({ roleKey, roleId, title, desc }) => {
                     const roleAccess = accessForm[roleKey] || {};
                     const hidden = roleAccess.hiddenModules || [];
                     /* Modullar MENYUDAN olinadi — alohida ro'yxat yo'q.
                        Ilgari nusxa bor edi va u menyudan ajralib
                        ketgandi: mavjud bo'lmagan sahifalarni yashirishni
                        taklif qilardi. */
                     const modules = accessModulesFor(roleId);
                     return (
                        <Card key={roleKey} className="p-6">
                           <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
                              <div>
                                 <h3 className="text-base font-bold text-ink">{title}</h3>
                                 <p className="text-xs text-muted">{desc}</p>
                              </div>
                              <div className="flex items-center gap-1 bg-elevated p-1 rounded-xl">
                                 {([
                                    { key: 'simple' as const, label: 'Sodda', active: isSimplePreset(roleKey, roleId) },
                                    { key: 'all' as const, label: 'Hammasi', active: (accessForm[roleKey]?.hiddenModules || []).length === 0 },
                                 ]).map(p => (
                                    <button
                                       key={p.key}
                                       type="button"
                                       onClick={() => applyPreset(roleKey, roleId, p.key)}
                                       className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${p.active
                                          ? 'bg-surface text-primary-600 shadow-sm'
                                          : 'text-muted hover:text-muted'}`}
                                    >
                                       {p.label}
                                    </button>
                                 ))}
                              </div>
                           </div>

                           {roleKey === 'receptionist' && (
                              <p className="text-xs text-muted mb-3 -mt-2">
                                 <b>Sodda</b> — faqat kundalik ish uchun kerak bo'lgan bo'limlar qoladi
                                 (Bemorlar, Kalendar, Kassa, Navbat). Menyu qisqarsa, yangi xodim tezroq o'rganadi.
                              </p>
                           )}

                           <p className="text-xs font-bold text-faint uppercase tracking-wider mb-3">Ko'rinadigan modullar</p>
                           <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-6">
                              {modules.map(m => {
                                 const visible = !hidden.includes(m.id);
                                 return (
                                    <label key={m.id} className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border cursor-pointer transition-all text-sm font-medium ${visible
                                       ? 'border-primary-200 bg-primary-50/60 text-primary-700 dark:border-primary-800 dark:bg-primary-900/20 dark:text-primary-300'
                                       : 'border-line bg-elevated text-faint dark:bg-surface/50 line-through'}`}>
                                       <input
                                          type="checkbox"
                                          checked={visible}
                                          onChange={() => toggleModule(roleKey, m.id)}
                                          className="w-4 h-4 rounded text-primary-600 focus:ring-primary-500"
                                       />
                                       {t(m.labelKey as any)}
                                    </label>
                                 );
                              })}
                           </div>

                           <p className="text-xs font-bold text-faint uppercase tracking-wider mb-3">Maxfiy ma'lumotlar</p>
                           <div className="space-y-2">
                              <label className="flex items-start gap-3 p-3 rounded-xl border border-line cursor-pointer hover:border-primary-300 transition-colors">
                                 <input
                                    type="checkbox"
                                    checked={roleAccess.showFinance !== false}
                                    onChange={e => updateRoleAccess(roleKey, { showFinance: e.target.checked })}
                                    className="w-4 h-4 mt-0.5 rounded text-primary-600 focus:ring-primary-500"
                                 />
                                 <div>
                                    <p className="text-sm font-semibold text-ink">Moliyaviy ko'rsatkichlarni ko'rsatish</p>
                                    <p className="text-xs text-muted">Dashboarddagi tushum, o'rtacha chek, kutilayotgan to'lovlar va qarzdorlar ro'yxati</p>
                                 </div>
                              </label>
                              {roleKey === 'doctor' && (
                                 <label className="flex items-start gap-3 p-3 rounded-xl border border-line cursor-pointer hover:border-primary-300 transition-colors">
                                    <input
                                       type="checkbox"
                                       checked={roleAccess.showPatientPhone !== false}
                                       onChange={e => updateRoleAccess(roleKey, { showPatientPhone: e.target.checked })}
                                       className="w-4 h-4 mt-0.5 rounded text-primary-600 focus:ring-primary-500"
                                    />
                                    <div>
                                       <p className="text-sm font-semibold text-ink">Bemor telefon raqamlarini ko'rsatish</p>
                                       <p className="text-xs text-muted">O'chirilsa, shifokorga raqamlar yulduzcha bilan maskalanadi (masalan, +*** ** *** ** 67)</p>
                                    </div>
                                 </label>
                              )}
                           </div>
                        </Card>
                     );
                  })}


                  <div className="flex items-center gap-3">
                     <Button onClick={handleAccessSave} disabled={accessSaving}>
                        {accessSaving ? 'Saqlanmoqda...' : accessSaved ? 'Saqlandi ✓' : 'Saqlash'}
                     </Button>
                     {accessSaved && <span className="text-sm text-success-600 font-medium">Ruxsatlar yangilandi, sahifa yangilanmoqda...</span>}
                  </div>

         {children}
               <Card className="p-6">
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3 mb-5">
                     <div>
                        <h2 className="text-lg font-medium text-ink">Kirish jurnali</h2>
                        <p className="text-sm text-muted">
                           Bemor kartasini kim ochgani va o'zgartirgani.
                           {logData?.retentionMonths ? ` ${logData.retentionMonths} oy saqlanadi.` : ''}
                        </p>
                     </div>
                     <Button size="sm" variant="secondary" onClick={loadAccessLog} disabled={logLoading}>
                        <RefreshCw className={`w-4 h-4 mr-1.5 ${logLoading ? 'animate-spin' : ''}`} /> Yangilash
                     </Button>
                  </div>

                  <div className="flex flex-wrap items-end gap-3 mb-4">
                     <div>
                        <label className="block text-[11px] text-muted mb-1">Boshlanish</label>
                        <input type="date" value={logFrom} onChange={e => setLogFrom(e.target.value)}
                           className="px-3 py-2 border border-line rounded-lg bg-surface text-ink text-sm" />
                     </div>
                     <div>
                        <label className="block text-[11px] text-muted mb-1">Tugash</label>
                        <input type="date" value={logTo} onChange={e => setLogTo(e.target.value)}
                           className="px-3 py-2 border border-line rounded-lg bg-surface text-ink text-sm" />
                     </div>
                     <div>
                        <label className="block text-[11px] text-muted mb-1">Amal</label>
                        <select value={logAction} onChange={e => setLogAction(e.target.value)}
                           className="px-3 py-2 border border-line rounded-lg bg-surface text-ink text-sm">
                           <option value="">Barchasi</option>
                           <option value="View">Ko'rish</option>
                           <option value="Create">Yaratish</option>
                           <option value="Update">O'zgartirish</option>
                           <option value="Print">Bosish</option>
                        </select>
                     </div>
                  </div>

                  {logError && (
                     <div className="flex items-start gap-2 p-3 mb-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                        <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                        <p className="text-sm text-red-700 dark:text-red-300">{logError}</p>
                     </div>
                  )}

                  {logLoading && !logData ? (
                     <div className="space-y-2">
                        {[0, 1, 2].map(i => <div key={i} className="h-10 bg-elevated rounded animate-pulse" />)}
                     </div>
                  ) : !logData || logData.items.length === 0 ? (
                     <div className="text-center py-10">
                        <Shield className="w-8 h-8 text-faint mx-auto mb-2" />
                        <p className="text-sm text-muted">Bu davrda yozuv yo'q</p>
                     </div>
                  ) : (
                     <>
                        <div className="overflow-x-auto border border-line rounded-lg">
                           <table className="w-full min-w-[640px]">
                              <thead className="bg-canvas/40 border-b border-line">
                                 <tr>
                                    {['Vaqt', 'Kim', 'Roli', 'Amal', 'Nima', 'Bemor'].map(h => (
                                       <th key={h} className="px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-muted">
                                          {h}
                                       </th>
                                    ))}
                                 </tr>
                              </thead>
                              <tbody className="divide-y divide-line">
                                 {logData.items.map((l: any) => (
                                    <tr key={l.id}>
                                       <td className="px-3 py-2 text-xs text-muted whitespace-nowrap">
                                          {new Date(l.at).toLocaleString('uz-UZ')}
                                       </td>
                                       <td className="px-3 py-2 text-sm text-ink">{l.userName || '—'}</td>
                                       <td className="px-3 py-2 text-xs text-muted">{ROLE_LABEL[l.userRole] || l.userRole || '—'}</td>
                                       <td className="px-3 py-2">
                                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${l.action === 'View'
                                             ? 'bg-elevated text-muted'
                                             : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'}`}>
                                             {ACTION_LABEL[l.action] || l.action}
                                          </span>
                                       </td>
                                       <td className="px-3 py-2 text-xs text-muted">{ENTITY_LABEL[l.entityType] || l.entityType}</td>
                                       <td className="px-3 py-2 text-sm text-ink">{l.patientName || '—'}</td>
                                    </tr>
                                 ))}
                              </tbody>
                           </table>
                        </div>
                        <p className="text-[11px] text-faint mt-2">
                           {logData.total} yozuv
                           {logData.truncated ? ` — oxirgi ${logData.items.length} tasi ko'rsatilgan, davrni toraytiring` : ''}.
                           Jurnalga faqat server yozadi: tashqaridan yozib bo'lmaydi.
                        </p>
                     </>
                  )}
               </Card>
      </div>
   );
};
