import React, { useState, useEffect, useMemo } from 'react';
import { formatMoney, formatDate, formatFullName } from '../utils/format';
import { confirmAction } from '../services/confirm';
import { toast } from '../services/toast';
import { todayISO } from '../utils/dateUtils';
import { Plus, Check, Calendar, CreditCard, X, Clock, AlertCircle } from 'lucide-react';
import { Button, Card, Modal, Input, Select, Badge } from './Common';
import { api } from '../services/api';
import { InstallmentPlan, Doctor, InstallmentItem, VisitCharge } from '../types';
import { INCOMING_PAYMENT_METHODS, getPaymentMethodLabel } from '../utils/paymentMethods';

/* ─────────────────────────────────────────────────────────────────────────────
   BO'LIB TO'LASH — MAVJUD QARZNI BO'LADI.

   Reja endi bemorning TO'LANMAGAN HISOB QATORLARI ustiga quriladi. U pulni
   o'zi yozmaydi: har oylik to'lov kassadagi oddiy to'lov bilan bir xil
   yo'ldan o'tadi, ya'ni chek ham, `ChargePayment` ham, shifokor ulushi ham
   joyida bo'ladi.

   ILGARI QANDAY EDI. Bu yerda xizmat nomi QO'LDA yozilardi va summa ham
   qo'lda kiritilardi — hisob qatorlari bilan hech qanday aloqasi yo'q edi.
   Natijada bemorda bir vaqtning o'zida to'lanmagan qator ham, o'sha xizmat
   uchun reja ham turardi. Har to'lov chek yozardi, lekin `ChargePayment`
   yozmasdi: shifokor bu puldan ulush olmasdi va buni hech kim sezmasdi.
   ───────────────────────────────────────────────────────────────────────────── */

interface InstallmentsTabProps {
   patientId: string;
   clinicId: string;
   doctors: Doctor[];
   /** Kassir ismi — chekka yoziladi */
   currentUserName?: string;
}

type PlanRow = InstallmentPlan & {
   /** Serverdan: rejaga bog'langan qatorlarning haqiqiy qarzi */
   due?: number;
   collected?: number;
   charges?: { id: string; name: string; total: number; paidAmount: number; status: string }[];
};

const MONTH_OPTIONS = ['2', '3', '4', '6', '9', '12'];

export const InstallmentsTab: React.FC<InstallmentsTabProps> = ({
   patientId, clinicId, doctors, currentUserName,
}) => {
   const [plans, setPlans] = useState<PlanRow[]>([]);
   const [loading, setLoading] = useState(true);

   /* Reja tuzish. Summa maydoni ATAYLAB yo'q — qarz qatorlardan keladi. */
   const [isCreateOpen, setIsCreateOpen] = useState(false);
   const [freeCharges, setFreeCharges] = useState<VisitCharge[]>([]);
   const [picked, setPicked] = useState<Set<string>>(new Set());
   const [months, setMonths] = useState('3');
   const [startDate, setStartDate] = useState(todayISO());
   const [creating, setCreating] = useState(false);

   const [payItem, setPayItem] = useState<InstallmentItem | null>(null);
   const [payMethod, setPayMethod] = useState('Cash');
   const [paying, setPaying] = useState(false);

   const load = async () => {
      try {
         setLoading(true);
         setPlans(await api.installments.getAll(clinicId, patientId));
      } catch (err) {
         console.error('Rejalarni o\'qib bo\'lmadi:', err);
      } finally {
         setLoading(false);
      }
   };

   useEffect(() => { load(); }, [patientId, clinicId]);

   /* Rejaga kiritish mumkin bo'lgan qatorlar: to'lanmagan va hali boshqa
      rejada emas. Ikkinchi shart muhim — bitta qarz ikki jadval bo'yicha
      to'lanib qolmasin (server ham buni rad etadi). */
   const openCreate = async () => {
      setPicked(new Set());
      setMonths('3');
      setStartDate(todayISO());
      setIsCreateOpen(true);
      try {
         const rows = await api.charges.getAll({ patientId, status: 'Unpaid' });
         setFreeCharges(rows.filter(c => !(c as any).installmentPlanId));
      } catch {
         setFreeCharges([]);
      }
   };

   const pickedTotal = useMemo(() => freeCharges
      .filter(c => picked.has(c.id))
      .reduce((s, c) => s + Math.max(0, c.total - (c.paidAmount || 0)), 0), [freeCharges, picked]);

   const toggle = (id: string) => setPicked(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
   });

   const handleCreate = async () => {
      if (picked.size === 0) { toast.error('Kamida bitta qator tanlang'); return; }
      setCreating(true);
      try {
         await api.installments.create({
            patientId, clinicId,
            chargeIds: Array.from(picked),
            months: Number(months),
            startDate,
         });
         setIsCreateOpen(false);
         await load();
      } catch (e: any) {
         toast.error(e?.data?.error || e?.message || 'Rejani yaratib bo\'lmadi');
      } finally {
         setCreating(false);
      }
   };

   const handlePay = async () => {
      if (!payItem) return;
      setPaying(true);
      try {
         await api.installments.pay(payItem.id, payMethod, currentUserName);
         setPayItem(null);
         await load();
      } catch (e: any) {
         toast.error(e?.data?.error || e?.message || 'To\'lov o\'tmadi');
         // Qarz kassada to'langan bo'lsa server rejani yopadi — ro'yxatni yangilaymiz
         if (e?.data?.code === 'ALREADY_PAID') await load();
      } finally {
         setPaying(false);
      }
   };

   const handleDelete = async (plan: PlanRow) => {
      const hasPaid = plan.items?.some(i => i.status === 'Paid');
      if (hasPaid) {
         toast.error('Bu rejada to\'langan oylar bor — o\'chirib bo\'lmaydi.');
         return;
      }
      if (!await confirmAction({
         title: 'Reja o\'chirilsinmi?',
         body: 'Qarz qatorlari QOLADI — ular faqat jadvaldan uziladi.',
         danger: true, confirmLabel: 'O\'chirish',
      })) return;
      try {
         await api.installments.delete(plan.id);
         await load();
      } catch (e: any) {
         toast.error(e?.data?.error || 'O\'chirib bo\'lmadi');
      }
   };

   if (loading) return <div className="p-8 text-center text-muted">Yuklanmoqda...</div>;

   return (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
         <div className="flex justify-between items-center gap-3">
            <div>
               <h3 className="text-lg font-medium text-ink">Bo'lib to'lash</h3>
               <p className="text-xs text-muted">
                  Mavjud qarzni oylarga bo'ladi. Yangi qarz yaratmaydi.
               </p>
            </div>
            <Button onClick={openCreate}>
               <Plus className="w-4 h-4 mr-2" /> Yangi reja
            </Button>
         </div>

         {plans.length === 0 ? (
            <Card className="p-8 text-center flex flex-col items-center">
               <div className="w-16 h-16 bg-primary-50 dark:bg-primary-900/20 text-primary-500 rounded-full flex items-center justify-center mb-4">
                  <CreditCard className="w-8 h-8" />
               </div>
               <h4 className="text-lg font-medium text-ink mb-2">Reja yo'q</h4>
               <p className="text-muted mb-6">
                  Bemorning to'lanmagan xizmatlarini oylarga bo'lish uchun reja tuzing.
               </p>
               <Button onClick={openCreate}>Reja tuzish</Button>
            </Card>
         ) : (
            <div className="space-y-4">
               {plans.map(plan => {
                  /* Qoldiq QATORLARDAN olinadi, rejaning `totalPaid` idan
                     emas: bemor kassada to'g'ridan-to'g'ri to'lagan bo'lishi
                     mumkin va u holda ikki raqam farq qiladi. */
                  const due = plan.due ?? Math.max(0, plan.totalAmount - plan.totalPaid);
                  const collected = plan.collected ?? plan.totalPaid;
                  return (
                  <Card key={plan.id} className="p-6">
                     <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 pb-4 border-b border-line-soft">
                        <div className="min-w-0">
                           <div className="flex items-center gap-3 mb-1">
                              <h4 className="text-lg font-semibold text-ink truncate">{plan.service}</h4>
                              <Badge status={plan.status === 'Active' ? 'pending' : 'completed'} />
                           </div>
                           <p className="text-sm text-muted">
                              Shifokor: {plan.doctor ? formatFullName(plan.doctor) : 'Klinika'}
                           </p>
                        </div>
                        <div className="mt-4 md:mt-0 flex gap-6 text-sm shrink-0">
                           <div>
                              <p className="text-muted mb-1">Umumiy</p>
                              <p className="font-medium text-ink">{formatMoney(plan.totalAmount)}</p>
                           </div>
                           <div>
                              <p className="text-muted mb-1">To'landi</p>
                              <p className="font-medium text-green-600 dark:text-green-400">{formatMoney(collected)}</p>
                           </div>
                           <div>
                              <p className="text-muted mb-1">Qoldiq</p>
                              <p className="font-medium text-red-600 dark:text-red-400">{formatMoney(due)}</p>
                           </div>
                           {!plan.items?.some(i => i.status === 'Paid') && (
                              <button onClick={() => handleDelete(plan)} title="Rejani o'chirish"
                                 className="text-red-500 p-2 hover:bg-red-50 rounded-full dark:hover:bg-red-900/20 transition-colors self-start">
                                 <X className="w-4 h-4" />
                              </button>
                           )}
                        </div>
                     </div>

                     {/* Reja qaysi qatorlar ustiga qurilgani ko'rinib tursin */}
                     {!!plan.charges?.length && (
                        <p className="text-[11px] text-faint mb-4 truncate">
                           Qatorlar: {plan.charges.map(c => c.name).join(' · ')}
                        </p>
                     )}

                     <div className="space-y-3">
                        <h5 className="font-medium text-sm text-muted mb-3">To'lov grafigi</h5>
                        {plan.items?.map((item, idx) => {
                           const expected = new Date(item.expectedDate);
                           const overdue = item.status === 'Pending' && expected < new Date();
                           return (
                              <div key={item.id} className={`flex items-center justify-between p-4 rounded-xl border ${item.status === 'Paid'
                                 ? 'bg-green-50/50 border-green-100 dark:bg-green-900/10 dark:border-green-900/30'
                                 : overdue
                                    ? 'bg-red-50/50 border-red-100 dark:bg-red-900/10 dark:border-red-900/30'
                                    : 'bg-elevated border-line-soft dark:bg-surface/50'}`}>
                                 <div className="flex items-center gap-4">
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${item.status === 'Paid'
                                       ? 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400'
                                       : overdue
                                          ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
                                          : 'bg-primary-100 text-primary-600 dark:bg-primary-900/30 dark:text-primary-400'}`}>
                                       {item.status === 'Paid' ? <Check className="w-5 h-5" /> : <Clock className="w-5 h-5" />}
                                    </div>
                                    <div>
                                       <p className="font-medium text-ink">{idx + 1}-oylik to'lov</p>
                                       <p className="text-sm text-muted flex items-center gap-1">
                                          <Calendar className="w-3 h-3" />
                                          {formatDate(expected)}
                                          {item.status === 'Paid' && item.paidDate && ` (To'landi: ${formatDate(new Date(item.paidDate))})`}
                                       </p>
                                    </div>
                                 </div>

                                 <div className="flex items-center gap-4">
                                    <p className="font-bold text-ink">{formatMoney(item.amount)}</p>
                                    {item.status === 'Pending' && due > 0 && (
                                       <Button size="sm" onClick={() => { setPayItem(item); setPayMethod('Cash'); }}>
                                          To'lash
                                       </Button>
                                    )}
                                 </div>
                              </div>
                           );
                        })}
                     </div>
                  </Card>
                  );
               })}
            </div>
         )}

         {/* ── Reja tuzish ─────────────────────────────────────────────── */}
         <Modal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} title="Bo'lib to'lash rejasi">
            <div className="space-y-4">
               {freeCharges.length === 0 ? (
                  <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                     <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                     <p className="text-sm text-amber-900 dark:text-amber-200">
                        Bemorda bo'lib to'lashga yaroqli to'lanmagan xizmat yo'q. Avval
                        shifokor xizmat buyurishi kerak — reja o'sha qatorlar ustiga quriladi.
                     </p>
                  </div>
               ) : (
                  <>
                     <div>
                        <label className="block text-sm font-medium text-muted mb-2">
                           Qaysi xizmatlar bo'lib to'lanadi
                        </label>
                        <div className="border border-line rounded-xl divide-y divide-line max-h-56 overflow-y-auto">
                           {freeCharges.map(c => {
                              const left = Math.max(0, c.total - (c.paidAmount || 0));
                              return (
                                 <label key={c.id} className="flex items-center gap-3 p-3 cursor-pointer hover:bg-elevated">
                                    <input type="checkbox" checked={picked.has(c.id)} onChange={() => toggle(c.id)}
                                       className="w-4 h-4 rounded border-line text-primary-600 focus:ring-primary-500" />
                                    <span className="flex-1 min-w-0">
                                       <span className="block text-sm text-ink truncate">{c.name}</span>
                                       {c.doctorName && <span className="block text-[11px] text-faint">{c.doctorName}</span>}
                                    </span>
                                    <span className="text-sm font-semibold tabular-nums text-ink">
                                       {formatMoney(left)}
                                    </span>
                                 </label>
                              );
                           })}
                        </div>
                     </div>

                     <div className="grid grid-cols-2 gap-4">
                        <Input label="Boshlanish sanasi" type="date" value={startDate}
                           onChange={(e: any) => setStartDate(e.target.value)} />
                        <div>
                           <label className="block text-sm font-medium text-muted mb-1">Necha oy?</label>
                           <Select value={months} onChange={(e) => setMonths(e.target.value)}
                              options={MONTH_OPTIONS.map(m => ({ value: m, label: `${m} oy` }))} />
                        </div>
                     </div>

                     <div className="bg-primary-50 dark:bg-primary-900/20 p-4 rounded-xl flex justify-between items-center">
                        <div>
                           <p className="text-sm text-primary-800 dark:text-primary-300">Oylik to'lov</p>
                           <p className="text-lg font-bold text-primary-900 dark:text-primary-100">
                              {pickedTotal > 0 ? formatMoney(Math.round(pickedTotal / Number(months))) : '0'}
                           </p>
                        </div>
                        <div className="text-right">
                           <p className="text-sm text-primary-800 dark:text-primary-300">Jami qarz</p>
                           <p className="text-lg font-bold text-primary-900 dark:text-primary-100">{formatMoney(pickedTotal)}</p>
                        </div>
                     </div>
                  </>
               )}

               <div className="pt-2 flex justify-end gap-3">
                  <Button variant="secondary" onClick={() => setIsCreateOpen(false)}>Bekor qilish</Button>
                  <Button onClick={handleCreate} disabled={creating || picked.size === 0}>
                     {creating ? 'Saqlanmoqda...' : 'Saqlash'}
                  </Button>
               </div>
            </div>
         </Modal>

         {/* ── Oylik to'lov ────────────────────────────────────────────── */}
         <Modal isOpen={!!payItem} onClose={() => setPayItem(null)} title="Oylik to'lovni qabul qilish">
            <div className="space-y-4">
               {payItem && (
                  <div className="bg-elevated p-4 rounded-xl text-center">
                     <p className="text-sm text-muted mb-1">To'lanayotgan summa</p>
                     <p className="text-2xl font-bold text-ink">{formatMoney(payItem.amount)} UZS</p>
                  </div>
               )}

               <div>
                  <label className="block text-sm font-medium text-muted mb-2">To'lov usuli</label>
                  <div className="flex flex-wrap gap-2">
                     {INCOMING_PAYMENT_METHODS.map(m => (
                        <button key={m} type="button" onClick={() => setPayMethod(m)}
                           className={`px-3 py-1.5 rounded-xl text-sm font-medium border transition-colors ${payMethod === m
                              ? 'bg-primary-600 text-white border-primary-600'
                              : 'bg-surface border-line text-muted hover:border-primary-400'}`}>
                           {getPaymentMethodLabel(m)}
                        </button>
                     ))}
                  </div>
                  <p className="text-[11px] text-faint mt-2">
                     Pul rejaning hisob qatorlariga tushadi — kassadagi oddiy to'lov bilan bir xil.
                  </p>
               </div>

               <div className="pt-2 flex justify-end gap-3">
                  <Button variant="secondary" onClick={() => setPayItem(null)}>Bekor qilish</Button>
                  <Button onClick={handlePay} disabled={paying}>
                     {paying ? 'O\'tkazilmoqda...' : 'To\'lovni tasdiqlash'}
                  </Button>
               </div>
            </div>
         </Modal>
      </div>
   );
};
