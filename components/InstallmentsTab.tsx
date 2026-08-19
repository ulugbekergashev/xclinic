import React, { useState, useEffect } from 'react';
import { Plus, Check, Calendar, CreditCard, X, Clock } from 'lucide-react';
import { Button, Card, Modal, Input, Select, Badge } from './Common';
import { api } from '../services/api';
import { InstallmentPlan, Doctor, Service, InstallmentItem } from '../types';
import { INCOMING_PAYMENT_METHODS, getPaymentMethodLabel } from '../utils/paymentMethods';
import { useLanguage } from '../context/LanguageContext';

interface InstallmentsTabProps {
   patientId: string;
   clinicId: string;
   doctors: Doctor[];
   services: Service[];
   initialCreateData?: { service: string; amount: number; doctorId: string };
   onInitialDataConsumed?: () => void;
}

export const InstallmentsTab: React.FC<InstallmentsTabProps> = ({ patientId, clinicId, doctors, services, initialCreateData, onInitialDataConsumed }) => {
   const { t } = useLanguage();
   const [plans, setPlans] = useState<InstallmentPlan[]>([]);
   const [loading, setLoading] = useState(true);
   
   // Create Modal
   const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
   const [createForm, setCreateForm] = useState({
      doctorId: '',
      service: '',
      totalAmount: '',
      initialPayment: '',
      months: '3',
      startDate: new Date().toISOString().split('T')[0]
   });

   // Pay Modal
   const [isPayModalOpen, setIsPayModalOpen] = useState(false);
   const [paymentItem, setPaymentItem] = useState<InstallmentItem | null>(null);
   const [paymentMethod, setPaymentMethod] = useState('Cash');

   const loadPlans = async () => {
      try {
         setLoading(true);
         const data = await api.installments.getAll(clinicId, patientId);
         setPlans(data);
      } catch (err) {
         console.error('Failed to load installments:', err);
      } finally {
         setLoading(false);
      }
   };

   useEffect(() => {
      loadPlans();
   }, [patientId, clinicId]);

   // Auto-open create modal when initialCreateData is provided
   useEffect(() => {
      if (initialCreateData) {
         setCreateForm(prev => ({
            ...prev,
            service: initialCreateData.service,
            totalAmount: initialCreateData.amount.toString(),
            doctorId: initialCreateData.doctorId || '',
            initialPayment: ''
         }));
         setIsCreateModalOpen(true);
         onInitialDataConsumed?.();
      }
   }, [initialCreateData]);

   const handleCreate = async () => {
      try {
         const amount = parseFloat(createForm.totalAmount);
         const initial = parseFloat(createForm.initialPayment || '0');
         const months = parseInt(createForm.months);
         if (isNaN(amount) || amount <= 0 || isNaN(months) || months <= 0) {
            alert('Iltimos ma\'lumotlarni to\'g\'ri kiriting');
            return;
         }

         const remainingAmount = amount - initial;
         const monthlyAmount = remainingAmount / months;
         const items = [];
         
         const start = new Date(createForm.startDate);
         
         for (let i = 0; i < months; i++) {
            const expected = new Date(start);
            expected.setMonth(start.getMonth() + i + 1);
            items.push({
               expectedDate: expected.toISOString().split('T')[0],
               amount: monthlyAmount,
               status: 'Pending'
            });
         }

         await api.installments.create({
            patientId,
            clinicId,
            doctorId: createForm.doctorId || undefined,
            service: createForm.service,
            totalAmount: amount,
            totalPaid: initial, // Assume initial is paid directly into clinic, or wait, we just set totalPaid right now
            startDate: createForm.startDate,
            endDate: items[items.length - 1].expectedDate,
            status: 'Active',
            items
         });
         
         setIsCreateModalOpen(false);
         loadPlans();
         
         // If initial payment > 0, we can create a regular transaction for it via the Transaction API separately,
         // but since it's just a demo level integration right now, we trust the user.
      } catch (e: any) {
         alert(e?.message || 'Xatolik yuz berdi');
      }
   };

   const handlePay = async () => {
      if (!paymentItem) return;
      try {
         await api.installments.pay(paymentItem.id, new Date().toISOString(), paymentMethod);
         setIsPayModalOpen(false);
         loadPlans();
      } catch (e: any) {
         alert(e?.message || 'Xatolik yuz berdi');
      }
   };

   const handleDelete = async (planId: string) => {
      if (window.confirm('Haqiqatdan ham bu rejani o\'chirmoqchimisiz?')) {
         try {
            await api.installments.delete(planId);
            loadPlans();
         } catch (e) {
            alert('Xatolik yuz berdi');
         }
      }
   };

   if (loading) return <div className="p-8 text-center text-gray-500">Yuklanmoqda...</div>;

   return (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
         <div className="flex justify-between items-center">
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">Bo'lib to'lash (Rassrochka)</h3>
            <Button onClick={() => setIsCreateModalOpen(true)}>
               <Plus className="w-4 h-4 mr-2" /> Yangi shartnoma
            </Button>
         </div>

         {plans.length === 0 ? (
            <Card className="p-8 text-center flex flex-col items-center">
               <div className="w-16 h-16 bg-primary-50 dark:bg-primary-900/20 text-primary-500 rounded-full flex items-center justify-center mb-4">
                  <CreditCard className="w-8 h-8" />
               </div>
               <h4 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">Bo'lib to'lash rejalari yo'q</h4>
               <p className="text-gray-500 dark:text-gray-400 mb-6">Bu bemor uchun hali hech qanday muddatli to'lov shartnomasi tuzilmagan.</p>
               <Button onClick={() => setIsCreateModalOpen(true)}>Shartnoma qo'shish</Button>
            </Card>
         ) : (
            <div className="space-y-4">
               {plans.map(plan => (
                  <Card key={plan.id} className="p-6">
                     <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 pb-4 border-b border-gray-100 dark:border-gray-800">
                        <div>
                           <div className="flex items-center gap-3 mb-1">
                              <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{plan.service}</h4>
                              <Badge status={plan.status === 'Active' ? 'pending' : 'completed'} />
                           </div>
                           <p className="text-sm text-gray-500 dark:text-gray-400">
                              Shifokor: {plan.doctor ? `${plan.doctor.lastName} ${plan.doctor.firstName}` : 'Klinika'}
                           </p>
                        </div>
                        <div className="mt-4 md:mt-0 flex gap-6 text-sm">
                           <div>
                              <p className="text-gray-500 dark:text-gray-400 mb-1">Umumiy summa</p>
                              <p className="font-medium text-gray-900 dark:text-gray-100">{plan.totalAmount.toLocaleString()} UZS</p>
                           </div>
                           <div>
                              <p className="text-gray-500 dark:text-gray-400 mb-1">To'landi</p>
                              <p className="font-medium text-green-600 dark:text-green-400">{plan.totalPaid.toLocaleString()} UZS</p>
                           </div>
                           <div>
                              <p className="text-gray-500 dark:text-gray-400 mb-1">Qoldiq</p>
                              <p className="font-medium text-red-600 dark:text-red-400">{(plan.totalAmount - plan.totalPaid).toLocaleString()} UZS</p>
                           </div>
                           <button onClick={() => handleDelete(plan.id)} className="text-red-500 p-2 hover:bg-red-50 rounded-full dark:hover:bg-red-900/20 transition-colors self-start">
                              <X className="w-4 h-4" />
                           </button>
                        </div>
                     </div>

                     <div className="space-y-3">
                        <h5 className="font-medium text-sm text-gray-700 dark:text-gray-300 mb-3">To'lov grafigi</h5>
                        {plan.items?.map((item, idx) => {
                           const expectedDate = new Date(item.expectedDate);
                           const isOverdue = item.status === 'Pending' && expectedDate < new Date();
                           return (
                              <div key={item.id} className={`flex items-center justify-between p-4 rounded-xl border ${
                                 item.status === 'Paid' ? 'bg-green-50/50 border-green-100 dark:bg-green-900/10 dark:border-green-900/30' : 
                                 isOverdue ? 'bg-red-50/50 border-red-100 dark:bg-red-900/10 dark:border-red-900/30' : 
                                 'bg-gray-50 border-gray-100 dark:bg-gray-800/50 dark:border-gray-800'
                              }`}>
                                 <div className="flex items-center gap-4">
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                                       item.status === 'Paid' ? 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400' :
                                       isOverdue ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400' :
                                       'bg-primary-100 text-primary-600 dark:bg-primary-900/30 dark:text-primary-400'
                                    }`}>
                                       {item.status === 'Paid' ? <Check className="w-5 h-5" /> : <Clock className="w-5 h-5" />}
                                    </div>
                                    <div>
                                       <p className="font-medium text-gray-900 dark:text-gray-100">{idx + 1}-oylik to'lov</p>
                                       <p className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1">
                                          <Calendar className="w-3 h-3" />
                                          {expectedDate.toLocaleDateString('uz-UZ')}
                                          {item.status === 'Paid' && item.paidDate && ` (To'landi: ${new Date(item.paidDate).toLocaleDateString('uz-UZ')})`}
                                       </p>
                                    </div>
                                 </div>
                                 
                                 <div className="flex items-center gap-4">
                                    <p className="font-bold text-gray-900 dark:text-gray-100">{item.amount.toLocaleString()} UZS</p>
                                    {item.status === 'Pending' && (
                                       <Button size="sm" onClick={() => {
                                          setPaymentItem(item);
                                          setIsPayModalOpen(true);
                                       }}>
                                          To'lash
                                       </Button>
                                    )}
                                 </div>
                              </div>
                           );
                        })}
                     </div>
                  </Card>
               ))}
            </div>
         )}
         
         {/* Create Modal */}
         <Modal
            isOpen={isCreateModalOpen}
            onClose={() => setIsCreateModalOpen(false)}
            title="Yangi bo'lib to'lash rejasi"
         >
            <div className="space-y-4">
               <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Shifokor</label>
                  <Select
                     value={createForm.doctorId}
                     onChange={(e) => setCreateForm(prev => ({ ...prev, doctorId: e.target.value }))}
                     options={[
                        { value: '', label: 'Klinika' },
                        ...doctors.map(d => ({ value: d.id, label: `${d.lastName} ${d.firstName}` }))
                     ]}
                  />
               </div>
               <Input
                  label="Xizmat nomi (masalan, Breket)"
                  value={createForm.service}
                  onChange={(e) => setCreateForm(prev => ({ ...prev, service: e.target.value }))}
                  required
               />
               <Input
                  label="Umumiy summa"
                  type="number"
                  value={createForm.totalAmount}
                  onChange={(e) => setCreateForm(prev => ({ ...prev, totalAmount: e.target.value }))}
                  required
               />
               <Input
                  label="Boshlang'ich to'lov"
                  type="number"
                  value={createForm.initialPayment}
                  onChange={(e) => setCreateForm(prev => ({ ...prev, initialPayment: e.target.value }))}
               />
               <div className="grid grid-cols-2 gap-4">
                  <Input
                     label="Boshlanish sanasi"
                     type="date"
                     value={createForm.startDate}
                     onChange={(e) => setCreateForm(prev => ({ ...prev, startDate: e.target.value }))}
                     required
                  />
                  <div>
                     <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Necha oy?</label>
                     <Select
                        value={createForm.months}
                        onChange={(e) => setCreateForm(prev => ({ ...prev, months: e.target.value }))}
                        options={[
                           { value: '2', label: '2 oy' },
                           { value: '3', label: '3 oy' },
                           { value: '6', label: '6 oy' },
                           { value: '9', label: '9 oy' },
                           { value: '12', label: '12 oy' },
                        ]}
                     />
                  </div>
               </div>
               
               <div className="pt-2">
                  <div className="bg-primary-50 dark:bg-primary-900/20 p-4 rounded-xl">
                     <p className="text-sm text-primary-800 dark:text-primary-300 mb-1">Oylik to'lov summasi:</p>
                     <p className="text-lg font-bold text-primary-900 dark:text-primary-100">
                        {createForm.totalAmount && createForm.months ? 
                           Math.round((parseFloat(createForm.totalAmount) - parseFloat(createForm.initialPayment || '0')) / parseInt(createForm.months)).toLocaleString() + ' UZS' 
                           : '0 UZS'}
                     </p>
                  </div>
               </div>

               <div className="pt-4 flex justify-end gap-3">
                  <Button variant="secondary" onClick={() => setIsCreateModalOpen(false)}>Bekor qilish</Button>
                  <Button onClick={handleCreate}>Saqlash</Button>
               </div>
            </div>
         </Modal>

         {/* Pay Modal */}
         <Modal
            isOpen={isPayModalOpen}
            onClose={() => setIsPayModalOpen(false)}
            title="Qism to'lovni tasdiqlash"
         >
            <div className="space-y-4">
               {paymentItem && (
                  <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-xl text-center">
                     <p className="text-sm text-gray-500 mb-1">To'lanayotgan summa:</p>
                     <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{paymentItem.amount.toLocaleString()} UZS</p>
                  </div>
               )}
               
               <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">To'lov usuli</label>
                  <Select
                     value={paymentMethod}
                     onChange={(e) => setPaymentMethod(e.target.value)}
                     options={INCOMING_PAYMENT_METHODS.map(m => ({ value: m, label: getPaymentMethodLabel(m) }))}
                  />
               </div>

               <div className="pt-4 flex justify-end gap-3">
                  <Button variant="secondary" onClick={() => setIsPayModalOpen(false)}>Bekor qilish</Button>
                  <Button onClick={handlePay}>To'lash</Button>
               </div>
            </div>
         </Modal>
      </div>
   );
};
