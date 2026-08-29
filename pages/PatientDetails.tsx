import React, { useState, useEffect, useMemo } from 'react';
import { formatMoney, formatNumber, formatDateLong, formatDate, formatDoctorName, formatFullName } from '../utils/format';
import { confirmAction } from '../services/confirm';
import { toast } from '../services/toast';
import { useParams } from 'react-router-dom';
import { ArrowLeft, Calendar, CreditCard, FileText, User, Activity, Phone, MapPin, Clock, Edit, Printer, Send, Package, UserPlus, UserCheck, Plus, FlaskConical } from 'lucide-react';
import { Button, Card, Badge, Modal, Input, Select } from '../components/Common';
import { EncounterForm, EncounterSummary } from '../components/EncounterForm';
import { PatientPhotos } from '../components/PatientPhotos';
import { VisitWorkflow, ProceduresSection } from '../components/ProceduresSection';
import { PatientHistoryPanel } from '../components/PatientHistoryPanel';
import { PatientDocuments } from '../components/PatientDocuments';
import { LabDynamics } from '../components/LabDynamics';
import { InstallmentsTab } from '../components/InstallmentsTab';
import { Patient, Appointment, Transaction, Doctor, Service, ICD10Code, PatientDiagnosis, Clinic, InventoryLog, InventoryItem, ServiceCategory, UserRole, Visit, Department, EncounterTemplate } from '../types';
import { api, getFileUrl, getStoredClinicId, getAuthToken } from '../services/api';
import { useLanguage } from '../context/LanguageContext';
import { formatDobDDMMYYYY, calcAge, todayISO } from '../utils/dateUtils';
import { calculateAppointmentTotal } from '../utils/financialCalculations';
import { INCOMING_PAYMENT_METHODS, getPaymentMethodLabel } from '../utils/paymentMethods';
import { maskPhone } from '../utils/accessControl';
import { printPatientCard } from '../utils/printPatientCard';

import { ReceiptModal } from '../components/ReceiptModal';

interface PatientDetailsProps {
   patientId: string | null;
   patients: Patient[];
   appointments: Appointment[];
   transactions: Transaction[];
   doctors: Doctor[];
   services: Service[];
   categories: ServiceCategory[];
   currentClinic?: Clinic;
   userRole?: UserRole;
   doctorId?: string; // Kirgan shifokor (DOCTOR roli) — shifokor tanlovlarida defolt
   showPatientPhone?: boolean; // Ruxsatlar: bemor telefon raqamini ko'rsatish
   onBack: () => void;
   onUpdatePatient: (id: string, data: Partial<Patient>) => void;
   onAddTransaction: (data: Omit<Transaction, 'id'>) => Promise<Transaction | void>;
   onUpdateTransaction: (id: string, data: Partial<Transaction>) => void;
   onAddAppointment: (appt: Omit<Appointment, 'id'>) => Promise<void>;
   onUpdateAppointment: (id: string, data: Partial<Appointment>) => Promise<void>;
}

export const PatientDetails: React.FC<PatientDetailsProps> = ({
   patientId: patientIdProp, 
   patients = [], 
   appointments = [], 
   transactions = [], 
   doctors = [], 
   services = [], 
   categories = [], 
   currentClinic, 
   userRole,
   doctorId: loggedDoctorId,
   showPatientPhone = true,
   onBack, onUpdatePatient, onAddTransaction, onUpdateTransaction, onAddAppointment, onUpdateAppointment
}) => {
   const { patientId: patientIdParam } = useParams<{ patientId: string }>();
   const patientId = patientIdProp || patientIdParam || null;
   const { t } = useLanguage();

   const [activeTab, setActiveTab] = useState<'overview' | 'chart' | 'labs' | 'appointments' | 'payments' | 'materials' | 'installments'>('overview');
   const [isEditModalOpen, setIsEditModalOpen] = useState(false);
   const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);


   const patient = patients.find(p => String(p.id).trim() === String(patientId).trim());

   // DOCTOR roli bilan kirilgan bo'lsa — shifokor tanlovlarida o'zi defolt tanlanadi
   const myDoctor = userRole === UserRole.DOCTOR && loggedDoctorId ? doctors.find(d => d.id === loggedDoctorId) : undefined;
   const defaultDoctorId = myDoctor?.id || '';

   // Edit Form State
   const [editFormData, setEditFormData] = useState<Partial<Patient>>({});
   // Payment Form State
   const [paymentData, setPaymentData] = useState({ amount: '', paidAmount: '', debtAmount: '', service: '', type: 'Cash', status: 'Paid', doctorId: defaultDoctorId, appointmentDate: '', discountPercent: '' });
   const [discountType, setDiscountType] = useState<'percent' | 'amount'>('percent'); // Chegirma turi: foiz yoki summa

   // Chegirmadan keyingi jami summa (asl narx ma'lum bo'lganda)
   const getDiscountedTotal = (): number => {
      const baseAmount = Number(paymentData.amount) || 0;
      if (baseAmount <= 0) return 0;
      const discountVal = Number(paymentData.discountPercent) || 0;
      return discountType === 'percent'
         ? Math.round(baseAmount * (1 - discountVal / 100))
         : Math.max(0, baseAmount - discountVal);
   };
   const [pendingProcedures, setPendingProcedures] = useState<any[]>([]);

   // Installment quick-open state (from appointment row)
   const [installmentQuickOpen, setInstallmentQuickOpen] = useState<{ service: string; amount: number; doctorId: string } | null>(null);

   // Medical History State
   const [historyText, setHistoryText] = useState('');

   useEffect(() => {
      if (patient) {
         setHistoryText(patient.medicalHistory || '');
      }
   }, [patient]);

   // Message Modal State
   const [isMessageModalOpen, setIsMessageModalOpen] = useState(false);
   const [messageText, setMessageText] = useState('');
   const [messageType, setMessageType] = useState('Custom'); // Custom, Tomorrow, Debt, Missed

   // New Appointment Modal State
   const [isApptModalOpen, setIsApptModalOpen] = useState(false);
   const [apptData, setApptData] = useState({
      doctorId: defaultDoctorId,
      date: todayISO(),
      time: '09:00',
      type: 'Konsultatsiya',
      categoryId: '',
      duration: 60,
      notes: ''
   });

   // Key to reset VisitWorkflow after successful payment
   const [visitKey, setVisitKey] = useState(0);
   const [processedBatches, setProcessedBatches] = useState<Set<string>>(new Set());

   // Diagnosis State
   const [diagnoses, setDiagnoses] = useState<PatientDiagnosis[]>([]);
   const [isDiagnosisModalOpen, setIsDiagnosisModalOpen] = useState(false);
   const [icd10Query, setIcd10Query] = useState('');
   const [icd10Results, setIcd10Results] = useState<ICD10Code[]>([]);
   const [selectedCode, setSelectedCode] = useState<ICD10Code | null>(null);
   const [diagnosisNote, setDiagnosisNote] = useState('');
   const [token, setToken] = useState('');

   // Tooth Data State
   // Qabul bayoni: bo'lim shabloni bo'yicha to'ldiriladigan maydonlar.
   // Ilgari bu yerda 32 ta tish holati turardi.
   const [visits, setVisits] = useState<Visit[]>([]);
   const [departments, setDepartments] = useState<Department[]>([]);
   const [templates, setTemplates] = useState<EncounterTemplate[]>([]);
   const [encounterDeptId, setEncounterDeptId] = useState<string | undefined>(undefined);
   const [encounterData, setEncounterData] = useState<Record<string, any>>({});
   const [encounterTemplateId, setEncounterTemplateId] = useState<string | undefined>(undefined);

   // Payment Edit State
   const [isPaymentEditModalOpen, setIsPaymentEditModalOpen] = useState(false);
   const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
   const [editPaymentAmount, setEditPaymentAmount] = useState('');
   const [editPaymentStatus, setEditPaymentStatus] = useState('Paid');
   const [editPaymentMethod, setEditPaymentMethod] = useState('Cash');

   // Material Usage State
   const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
   const [materialLogs, setMaterialLogs] = useState<InventoryLog[]>([]);
   const [isMaterialModalOpen, setIsMaterialModalOpen] = useState(false);
   const [materialData, setMaterialData] = useState({ itemId: '', quantity: '', note: '' });

   // Prevents double submission
   const [isPaymentSubmitting, setIsPaymentSubmitting] = useState(false);
   const isSubmittingRef = React.useRef(false);

   // Manual Payment Selection State
   const [manualPaymentCategoryId, setManualPaymentCategoryId] = useState<string>('');
   const [manualPaymentServiceId, setManualPaymentServiceId] = useState<number | null>(null);

   // Receipt Modal State
   const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
   const [receiptTransaction, setReceiptTransaction] = useState<Transaction | null>(null);

   /* ─── BEMORNING TO'LIQ TARIXI (FIX-PLAN 10.3 qoldig'i) ────────────────────
      `App.tsx` kirishda oxirgi 45 kunni yuklaydi — bu to'g'ri qaror, aks holda
      kirish 41 MB tortardi. Lekin bemor kartasi aynan ESKI tarix uchun
      ochiladi: 45 kundan narigi qabullar va to'lovlar propda UMUMAN yo'q edi.

      Butun jadvalni tortmaymiz — kesim serverda qisqartiriladi: `?patientId=`
      bilan faqat shu bemorning qatorlari keladi, sana chegarasisiz.

      SERVER RO'YXATI PROPNI ALMASHTIRMAYDI, BIRLASHTIRADI. Sabab: eski
      to'lovlarda `patientId` bo'sh bo'lishi mumkin va ular bemorga ISM
      bo'yicha bog'lanadi (quyida). Server bunday qatorlarni qaytarmaydi —
      almashtirsak, ular kartadan yo'qolardi. */
   const clinicIdForHistory = currentClinic?.id || getStoredClinicId();
   const [history, setHistory] = useState<{ appts: Appointment[]; tx: Transaction[] } | null>(null);

   useEffect(() => {
      if (!clinicIdForHistory || !patientId) { setHistory(null); return; }
      let alive = true;
      Promise.all([
         api.appointments.getAll(clinicIdForHistory, { patientId }),
         api.transactions.getAll(clinicIdForHistory, { patientId }),
      ]).then(([appts, tx]) => { if (alive) setHistory({ appts, tx }); })
        .catch(() => { if (alive) setHistory(null); });
      return () => { alive = false; };
   }, [clinicIdForHistory, patientId]);

   /** Ikki ro'yxatni `id` bo'yicha birlashtiradi — takror qator qolmaydi. */
   const mergeById = <T extends { id: string }>(a: T[], b: T[]): T[] => {
      const seen = new Map<string, T>();
      for (const row of [...a, ...b]) if (row?.id) seen.set(row.id, row);
      return [...seen.values()];
   };

   const effAppointments = useMemo(
      () => (history ? mergeById(appointments, history.appts) : appointments),
      [appointments, history]);
   const effTransactions = useMemo(
      () => (history ? mergeById(transactions, history.tx) : transactions),
      [transactions, history]);

   // Parse procedures from appointment notes
   const pastProcedures = React.useMemo(() => {
      const results: { id: string; serviceName: string; date: string; toothNumber?: number }[] = [];
      const regex = /- ([^\n(]+) \((?:Tish #(\d+)|Umumiy)\)/g;

      effAppointments.forEach(appt => {
         if (appt.patientId !== (patientId || patient?.id) || !appt.notes) return;
         regex.lastIndex = 0;
         let match;
         while ((match = regex.exec(appt.notes)) !== null) {
            results.push({
               id: `past-${appt.id}-${results.length}`,
               serviceName: match[1].trim(),
               date: appt.date,
               toothNumber: match[2] ? parseInt(match[2]) : undefined
            });
         }
      });
      return results;
   }, [effAppointments, patientId, patient?.id]);

   const allProceduresHistory = React.useMemo(() => {
      const today = todayISO();
      const current = pendingProcedures.map((p: any) => ({
         id: p.id,
         serviceName: p.serviceName,
         date: today,
         toothNumber: p.toothNumber
      }));
      return [...pastProcedures, ...current];
   }, [pastProcedures, pendingProcedures]);


   useEffect(() => {
      // Token xotiradan olinadi (S1.3) — diskda saqlanmaydi.
      const t = getAuthToken();
      if (t) {
         try {
            setToken(t);
         } catch (e) {
            console.error('Failed to read auth token');
         }
      }
   }, []);

   const handleImageUpload = async (type: 'avatar' | 'portrait', file: File) => {
      if (!patient) return;
      try {
         const res = type === 'avatar' 
            ? await api.patients.uploadAvatar(patient.id, file)
            : await api.patients.uploadPortrait(patient.id, file);
         
         if (res.success) {
            onUpdatePatient(patient.id, { [type === 'avatar' ? 'avatarUrl' : 'portraitUrl']: res.url });
            toast.error(t('common.save'));
         }
      } catch (error) {
         console.error(`Failed to upload ${type}:`, error);
         toast.error(t('patients.details.alerts.error'));
      }
   };

   const [isLoaded, setIsLoaded] = useState(false);

   // Persistence for pending procedures
   useEffect(() => {
      setIsLoaded(false);
      if (patientId) {
         const key = `pending_procedures_${patientId}`;
         const saved = localStorage.getItem(key);

         if (saved) {
            try {
               const parsed = JSON.parse(saved);
               setPendingProcedures(parsed);
            } catch (e) {
               console.error('Failed to parse saved procedures');
               setPendingProcedures([]);
            }
         } else {
            setPendingProcedures([]);
         }
         setIsLoaded(true);
      }
   }, [patientId]);

   useEffect(() => {
      if (patientId && isLoaded) {
         const key = `pending_procedures_${patientId}`;
         if (pendingProcedures.length > 0) {
            localStorage.setItem(key, JSON.stringify(pendingProcedures));
         } else {
            localStorage.removeItem(key);
         }
      }
   }, [patientId, pendingProcedures, isLoaded]);

   useEffect(() => {
      if (patientId) {
         api.diagnoses.getByPatient(patientId).then(setDiagnoses).catch(console.error);
         api.departments.getAll().then(setDepartments).catch(console.error);
         api.visits.getAll({ patientId }).then(vs => {
            setVisits(vs);
            // Oxirgi ochiq qabuldan bayonni tiklaymiz
            const open = vs.find(v => v.status !== 'Completed' && v.status !== 'Cancelled') || vs[0];
            if (open) {
               setEncounterDeptId(open.departmentId || undefined);
               setEncounterTemplateId(open.templateId || undefined);
               try { setEncounterData(open.examData ? JSON.parse(open.examData) : {}); } catch { setEncounterData({}); }
            }
         }).catch(console.error);
         /* `patient.id` uzatiladi — server bemorga mos kelmaydigan
            shablonlarni chiqarib tashlaydi (jins va yosh, B-09). */
         api.encounterTemplates.getAll(undefined, patient.id).then(setTemplates).catch(console.error);

         // Fetch inventory data
         if (currentClinic) {
            api.inventory.getAll(currentClinic.id).then(setInventoryItems).catch(console.error);
            api.inventory.getLogs(currentClinic.id, patientId).then(setMaterialLogs).catch(console.error);
         }
      }
   }, [patientId, currentClinic]);

   const [isAssignDoctorModalOpen, setIsAssignDoctorModalOpen] = useState(false);

   const handleAssignDoctor = (doctorId: string) => {
      const selectedDoctor = doctors.find(d => d.id === doctorId);
      if (selectedDoctor) {
         onUpdatePatient(patient.id, {
            doctorId: selectedDoctor.id,
            doctorName: `${formatDoctorName(selectedDoctor)}`
         });
         toast.error(t('patients.details.alerts.doctorAssigned'));
      }
      setIsAssignDoctorModalOpen(false);
   };

   // denta7 da bu yerda stomatologik MKB-10 kategoriyalari qattiq kodlangan edi
   // (karies, periodontit, jag' kasalliklari). Ko'p profilli klinikada tashxis
   // doirasi cheklanmaydi — qidiruv bazadagi to'liq MKB-10 bo'yicha ketadi.
   const handleSearchICD10 = async (query: string) => {
      setIcd10Query(query);
      if (query.trim().length < 2) {
         setIcd10Results([]);
         return;
      }
      try {
         setIcd10Results(await api.diagnoses.searchCodes(query.trim()));
      } catch (e) {
         console.error('MKB-10 qidiruv xatoligi', e);
         setIcd10Results([]);
      }
   };

   const formatDiagnosisNotes = (notes: string) => {
      if (!notes) return null;
      return notes.split('\n').map((line, index) => {
         const cleanLine = line.replace(/^#+\s*/, '');
         if (line.trim().startsWith('###')) {
            return <div key={index} className="font-bold mt-2 text-gray-900 dark:text-white print:text-black">{cleanLine}</div>;
         }
         return <div key={index} className="text-gray-700 dark:text-gray-300 print:text-black">{cleanLine}</div>;
      });
   };

   const handleAddDiagnosis = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!selectedCode || !patient) return;

      try {
         // Create diagnosis payload
         const diagnosisPayload = {
            patientId: patient.id,
            code: selectedCode.code,
            name: selectedCode.name, // Send name for backend to create if missing
            description: selectedCode.description, // Send description
            date: todayISO(),
            notes: diagnosisNote,
            status: 'Active' as 'Active' | 'Resolved' | 'Chronic',
            clinicId: patient.clinicId
         };

         // Call API to save diagnosis
         const newDiagnosis = await api.diagnoses.add(diagnosisPayload);

         // Add to diagnoses list
         setDiagnoses([newDiagnosis, ...diagnoses]);

         setIsDiagnosisModalOpen(false);
         setSelectedCode(null);
         setDiagnosisNote('');
         setIcd10Query('');
         setIcd10Results([]);
         toast.error(t('patients.details.alerts.diagnosisAdded'));
      } catch (e) {
         console.error('Failed to add diagnosis', e);
         toast.error(t('patients.details.alerts.error'));
      }
   };

   const handleDeleteDiagnosis = async (id: string) => {
      if (!await confirmAction({ title: t('patients.details.alerts.deleteDiagnosisConfirm') })) return;
      try {
         await api.diagnoses.delete(id);
         setDiagnoses(diagnoses.filter(d => d.id !== id));
      } catch (e) {
         toast.error(t('patients.details.alerts.error'));
      }
   };

   const handleSaveEncounter = async (data: Record<string, any>, templateId: string | undefined) => {
      if (!patientId) return;
      try {
         setEncounterData(data);
         setEncounterTemplateId(templateId);
         // Bayon ochiq qabulga yoziladi; qabul bo'lmasa yangisi ochiladi.
         const today = todayISO();
         const open = visits.find(v => v.status !== 'Completed' && v.status !== 'Cancelled');
         if (open) {
            await api.visits.update(open.id, {
               examData: JSON.stringify(data),
               templateId,
               departmentId: encounterDeptId,
            });
         } else {
            await api.visits.create({
               patientId,
               clinicId: patient?.clinicId,
               date: today,
               departmentId: encounterDeptId,
               templateId,
               examData: JSON.stringify(data),
            } as any);
         }
      } catch (e) {
         console.error('Bayonni saqlab bo\'lmadi', e);
         toast.error(t('patients.details.alerts.error'));
      }
   };

   const handleEditPaymentOpen = (transaction: Transaction) => {
      setEditingTransaction(transaction);
      setEditPaymentAmount(transaction.amount.toString());
      setIsPaymentEditModalOpen(true);
   };

   const handleEditPaymentSave = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!editingTransaction) return;

      const newAmount = Number(editPaymentAmount);
      const originalAmount = editingTransaction.amount;
      const isNowPaid = editPaymentStatus === 'Paid';

      // Repayment logic: if marking a pending debt as paid
      if (editingTransaction.status === 'Pending' && isNowPaid) {
         // Case 1: Partial Repayment
         if (newAmount < originalAmount) {
            // 1. Create a new Paid transaction for the partial amount
            await onAddTransaction({
               ...editingTransaction,
               id: undefined as any,
               amount: newAmount,
               status: 'Paid',
               type: editPaymentMethod as any,
               service: `${editingTransaction.service} (Qarzdorlik yopildi)`,
               date: todayISO()
            });

            // 2. Reduce the original Pending amount
            await onUpdateTransaction(editingTransaction.id, {
               amount: originalAmount - newAmount
            });
         }
         // Case 2: Full Repayment
         else {
            await onUpdateTransaction(editingTransaction.id, {
               status: 'Paid',
               amount: newAmount,
               type: editPaymentMethod as any,
               date: todayISO()
            });
         }
      } else {
         // Simple edit for other scenarios
         await onUpdateTransaction(editingTransaction.id, {
            amount: newAmount,
            status: editPaymentStatus as any,
            type: editPaymentMethod as any
         });
      }

      setIsPaymentEditModalOpen(false);
      setEditingTransaction(null);
      setEditPaymentAmount('');
   };

   const handleMaterialSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!materialData.itemId || !patientId || !currentClinic) return;

      try {
         /* Chiqim ENDI ombor bilan bir xil yo'ldan (0028): partiya FEFO
            bo'yicha tanlanadi va `StockMovement` yoziladi. Ilgari bu yer
            qoldiqni qayta yozadigan eski jurnalga tushardi — omborda ikkinchi,
            parallel hisob aynan shundan boshlanardi. */
         await api.stock.issue({
            itemId: materialData.itemId,
            quantity: Number(materialData.quantity),
            reason: 'Manual',
            patientId,
            note: materialData.note || `Bemor: ${patient?.firstName} ${patient?.lastName}`,
            // Ism yuborilmasa server tokendan oladi — «Doctor» degan qotib
            // qolgan matn o'rniga haqiqiy foydalanuvchi yoziladi
            userName: myDoctor?.name,
         });

         // Refresh logs and items
         const updatedLogs = await api.inventory.getLogs(currentClinic.id, patientId);
         setMaterialLogs(updatedLogs);
         const updatedItems = await api.inventory.getAll(currentClinic.id);
         setInventoryItems(updatedItems);

         setIsMaterialModalOpen(false);
         setMaterialData({ itemId: '', quantity: '', note: '' });
         toast.error(t('patients.details.alerts.materialUsed'));
      } catch (e) {
         console.error('Failed to use material', e);
         toast.error(t('patients.details.alerts.error'));
      }
   };


   if (!patient) {
      return <div className="p-8 text-center">{t('patients.details.notFound')} <Button onClick={onBack}>{t('common.cancel')}</Button></div>;
   }

   // Filter related data
   const patientAppointments = (effAppointments || []).filter(a => a && a.patientId === patient.id);
   const patientTransactions = (effTransactions || []).filter(t => {
      // Priority 1: Match by ID (new data)
      if (t.patientId) {
         return t.patientId === patient.id;
      }
      // Priority 2: Strict Name Match (legacy data)
      // Check both "LastName FirstName" and "FirstName LastName" formats
      const fullName = `${formatFullName(patient)}`;
      const fullNameReverse = `${formatFullName(patient)}`;
      return t.patientName === fullName || t.patientName === fullNameReverse;
   });

   const handleEditOpen = () => {
      setEditFormData(patient);
      setIsEditModalOpen(true);
   };

   const handleEditSave = (e: React.FormEvent) => {
      e.preventDefault();
      onUpdatePatient(patient.id, editFormData);
      setIsEditModalOpen(false);
   };

   const handlePaymentModalOpen = () => {
      // Check if current plan is individual
      const isIndividualPlan = currentClinic?.planId === 'individual';

      // Defolt shifokor: kirgan shifokor → bemorga biriktirilgan → individual planda birinchi → bo'sh
      const assignedDoctorId = patient?.doctorId && doctors.some(d => d.id === patient.doctorId) ? patient.doctorId : '';
      const autoDoctorId = defaultDoctorId || assignedDoctorId || (isIndividualPlan && doctors.length > 0 ? doctors[0].id : '');
      setPaymentData({ amount: '', paidAmount: '', debtAmount: '', service: '', type: 'Cash', status: 'Paid', doctorId: autoDoctorId, appointmentDate: '', discountPercent: '' });

      setDiscountType('percent');
      setManualPaymentCategoryId('');
      setManualPaymentServiceId(null);

      setIsPaymentModalOpen(true);
   };

   const handleManualServiceChange = (serviceId: number) => {
      setManualPaymentServiceId(serviceId);
      const service = services.find(s => s.id === serviceId);
      if (service) {
         setPaymentData({
            ...paymentData,
            service: service.name,
            amount: service.price.toString(),
            paidAmount: service.price.toString(),
            debtAmount: '0',
            discountPercent: ''
         });
      }
   };

   const handlePaymentSave = async (e: React.FormEvent) => {
      e.preventDefault();
      if (isSubmittingRef.current) return;
      isSubmittingRef.current = true;
      setIsPaymentSubmitting(true);

      // Calculate amounts early for validation
      const paidAmount = Number(paymentData.paidAmount.toString().replace(/,/g, '')) || 0;
      const debtAmount = Number(paymentData.debtAmount.toString().replace(/,/g, '')) || 0;
      const totalAmount = paidAmount + debtAmount;

      // Validate balance if using from-account payment
      if (paymentData.type === 'Balance' && paidAmount > (patient.balance || 0)) {
         toast.error(t('patients.details.alerts.insufficientBalance'));
         isSubmittingRef.current = false;
         setIsPaymentSubmitting(false);
         return;
      }

      // Check if current plan is individual
      const isIndividualPlan = currentClinic?.planId === 'individual';

      // Validate doctor selection - required for multi-doctor plans, optional for individual with no doctors
      if (!paymentData.doctorId) {
         if (!isIndividualPlan || (isIndividualPlan && doctors.length > 0)) {
            toast.error(t('patients.details.alerts.selectDoctorReq'));
            isSubmittingRef.current = false;
            setIsPaymentSubmitting(false);
            return;
         }
      }

      const doctor = doctors.find(d => d.id === paymentData.doctorId);
      // Calculate discount percent and amount based on discount type
      const rawDiscountVal = Number(paymentData.discountPercent) || 0;
      const discountPercent = discountType === 'percent'
         ? rawDiscountVal
         : (totalAmount > 0 ? Math.round((rawDiscountVal / totalAmount) * 100) : 0);
      const discountAmount = discountType === 'percent'
         ? Math.round(totalAmount * (rawDiscountVal / 100))
         : rawDiscountVal;

      try {
         let finalTransaction: Transaction | null | void = null;

         // Scenario 1: Full Payment (Debt == 0)
         if (debtAmount <= 0) {
            finalTransaction = await onAddTransaction({
               patientId: patient.id,
               patientName: `${formatFullName(patient)}`,
               date: paymentData.appointmentDate || todayISO(),
               amount: totalAmount,
               service: paymentData.service,
               type: paymentData.type as any,
               status: 'Paid',
               doctorId: paymentData.doctorId || '',
               doctorName: doctor ? `${formatDoctorName(doctor)}` : '',
               discountPercent,
               discountAmount: discountAmount
            });
         }
         // Scenario 2: No Payment (Paid == 0)
         else if (paidAmount <= 0) {
            finalTransaction = await onAddTransaction({
               patientId: patient.id,
               patientName: `${formatFullName(patient)}`,
               date: paymentData.appointmentDate || todayISO(),
               amount: totalAmount,
               service: paymentData.service,
               type: paymentData.type as any,
               status: 'Pending',
               doctorId: paymentData.doctorId || '',
               doctorName: doctor ? `${formatDoctorName(doctor)}` : '',
               discountPercent,
               discountAmount: discountAmount
            });
         }
         // Scenario 3: Partial Payment (Paid > 0 && Debt > 0)
         else {
            // 1. Paid Part
            finalTransaction = await onAddTransaction({
               patientId: patient.id,
               patientName: `${formatFullName(patient)}`,
               date: paymentData.appointmentDate || todayISO(),
               amount: paidAmount,
               service: `${paymentData.service} (Qisman to'lov)`,
               type: paymentData.type as any,
               status: 'Paid',
               doctorId: paymentData.doctorId || '',
               doctorName: doctor ? `${formatDoctorName(doctor)}` : '',
               discountPercent,
               discountAmount: Math.round(paidAmount * (discountPercent / 100)) || 0
            });

            // 2. Pending Part (Debt)
            await onAddTransaction({
               patientId: patient.id,
               patientName: `${formatFullName(patient)}`,
               date: paymentData.appointmentDate || todayISO(),
               amount: debtAmount,
               service: `${paymentData.service} (Qarz)`,
               type: paymentData.type as any,
               status: 'Pending',
               doctorId: paymentData.doctorId || '',
               doctorName: doctor ? `${formatDoctorName(doctor)}` : '',
               discountPercent,
               discountAmount: Math.round(debtAmount * (discountPercent / 100)) || 0
            });
         }

         // Verify if clinic has receipt enabled
         if (finalTransaction && currentClinic?.enableReceipts) {
            setReceiptTransaction(finalTransaction as Transaction);
            setIsReceiptModalOpen(true);
         }

         // Cleanup only on SUCCESS
         setIsPaymentModalOpen(false);
         setPaymentData({ amount: '', paidAmount: '', debtAmount: '', service: '', type: 'Cash', status: 'Paid', doctorId: defaultDoctorId, appointmentDate: '', discountPercent: '' });
         setVisitKey(prev => prev + 1);
      } catch (error: any) {
         console.error('Payment processing failed', error);
         toast.error(`${t('patients.details.alerts.paymentError')} ${error.message || t('common.error')}`);
      } finally {
         isSubmittingRef.current = false;
         setIsPaymentSubmitting(false);
      }
   };


   const handleSendMessage = async (e: React.FormEvent) => {
      e.preventDefault();
      try {
         await api.patients.sendMessage(patient.id, messageText);
         toast.error(t('patients.details.alerts.messageSent'));
         setIsMessageModalOpen(false);
         setMessageText('');
      } catch (error: any) {
         console.error('Error sending message:', error);
         if (error.message === 'Bot not configured' || error.error === 'Bot not configured') {
            setIsMessageModalOpen(false);
            toast.error(`⚠️ ${t('patients.details.alerts.botNotConfigured')}`);
         } else {
            toast.error(`${t('common.error')}: ${error.message || t('common.error')}`);
         }
      }
   };

   const handleApptSubmit = (e: React.FormEvent) => {
      e.preventDefault();

      if (!apptData.doctorId) {
         toast.error(t('patients.details.alerts.selectDoctorReq'));
         return;
      }

      const doctor = doctors.find(d => d.id === apptData.doctorId);
      if (!doctor) {
         toast.error(t('patients.details.alerts.doctorNotFound'));
         return;
      }

      // Doctor Conflict Validation
      const doctorConflict = appointments.some(appt =>
         appt.doctorId === doctor.id &&
         appt.date === apptData.date &&
         appt.time === apptData.time &&
         appt.status !== 'Cancelled'
      );

      if (doctorConflict) {
         toast.error(t('patients.details.alerts.doctorConflict'));
         return;
      }

      // Patient Conflict Validation
      // Bemor kesimi — to'liq tarixdan (o'sha kun boshqa kartada band bo'lishi mumkin)
      const patientConflict = effAppointments.some(appt =>
         appt.patientId === patient.id &&
         appt.date === apptData.date &&
         appt.time === apptData.time &&
         appt.status !== 'Cancelled'
      );

      if (patientConflict) {
         toast.error(t('patients.details.alerts.patientConflict'));
         return;
      }

      onAddAppointment({
         patientId: patient.id,
         patientName: `${formatFullName(patient)}`,
         doctorId: doctor.id,
         doctorName: `${formatDoctorName(doctor)}`,
         type: apptData.type,
         date: apptData.date,
         time: apptData.time,
         duration: Number(apptData.duration),
         status: 'Pending',
         notes: apptData.notes,
         clinicId: patient.clinicId,
         categoryId: apptData.categoryId || null // Add categoryId
      });
      setIsApptModalOpen(false);
      setApptData({ doctorId: defaultDoctorId, date: todayISO(), time: '09:00', type: 'Konsultatsiya', categoryId: '', duration: 60, notes: '' });
   };

   const openApptModal = () => {
      const assignedDoctorId = patient?.doctorId && doctors.some(d => d.id === patient.doctorId) ? patient.doctorId : '';
      setApptData(prev => ({
         ...prev,
         doctorId: defaultDoctorId || assignedDoctorId || (doctors.length > 0 ? doctors[0].id : ''),
         categoryId: categories.length > 0 ? categories[0].id : '', // Set default category
      }));
      setIsApptModalOpen(true);
   };

   const handleCompleteVisit = async (procedures: any[], total: number) => {
      // 1. Double-check if we are already processing or have processed this exact content recently
      const today = todayISO();

      // Generate a simple hash/signature for this batch of procedures
      const batchSignature = `${today}-${total}-${procedures.map(p => p.id).join(',')}`;

      if (processedBatches.has(batchSignature)) {
         console.log("Duplicate prevention: Batch already processed");
         return;
      }

      const existingAppt = effAppointments.find(a =>
         a.patientId === patient.id &&
         a.date === today &&
         a.status !== 'Cancelled'
      );

      // Shifokor ustuvorligi: qabulga biriktirilgan → kirgan shifokor → bemorga biriktirilgan → birinchi.
      // Aks holda admin yakunlaganda to'lov har doim ro'yxatdagi birinchi shifokorga yozilib qolardi.
      const apptDoctor = existingAppt ? doctors.find(d => d.id === existingAppt.doctorId) : undefined;
      const patientDoctor = patient.doctorId ? doctors.find(d => d.id === patient.doctorId) : undefined;
      const chosenDoctor = apptDoctor || myDoctor || patientDoctor;
      let finalDoctorId = chosenDoctor?.id || (doctors.length > 0 ? doctors[0].id : '');
      let finalDoctorName = chosenDoctor ? `Dr. ${chosenDoctor.lastName}` : (doctors.length > 0 ? `Dr. ${doctors[0].lastName}` : 'Doctor');

      /* DIQQAT. Bu matn shunchaki izoh emas — stomatologiya tarixining
         YAGONA saqlash joyi: tish kartasi (pastProcedures, yuqorida) aynan
         shu satrlarni regex bilan o'qiydi, kassa esa narxni shundan
         hisoblaydi (calculateAppointmentTotal).

         Shuning uchun "notes ga yozishni to'xtatish" (qaror В6) shu relizda
         BAJARILMADI: avval bajarilgan xizmatlar `VisitCharge` qatorlariga
         ko'chirilishi va to'lov oynasi o'sha qatorlarni yopadigan qilib
         ulanishi kerak. Matnni olib tashlash — tish kartasini yo'q qilish.
         Batafsil: BUILD-SPEC.md, Б4.1. */
      const proceduresText = procedures.map(p => `- ${p.serviceName} (${p.toothNumber ? `Tish #${p.toothNumber}` : 'Umumiy'}) [${formatMoney(p.price).replace(/,/g, ' ')} UZS]`).join('\n');

      try {
         // ENSURE DOCTOR EXISTS (especially for new clinics or individual plans)
         if (!finalDoctorId) {
            const isIndividualPlan = currentClinic?.planId === 'individual';
            if (isIndividualPlan) {
               try {
                  console.log("Auto-creating doctor for individual plan...");
                  const adminNameParts = currentClinic?.adminName?.split(' ') || ['Admin'];
                  const firstName = adminNameParts[0];
                  const lastName = adminNameParts.slice(1).join(' ') || 'Doctor';

                  const newDoctor = await api.doctors.create({
                     firstName,
                     lastName,
                     specialty: 'Stomatolog',
                     phone: currentClinic?.phone || '',
                     status: 'Active',
                     clinicId: currentClinic?.id || ''
                  });

                  finalDoctorId = newDoctor.id;
                  finalDoctorName = `Dr. ${newDoctor.lastName}`;
               } catch (err) {
                  /* Shifokor yaratish faqat klinika EGASIDA (reliz 4):
                     registrator bu yerda 403 oladi. */
                  console.error('Failed to auto-create doctor', err);
                  throw new Error("Shifokor profili yo'q. Uni klinika egasi Sozlamalar bo'limida qo'shadi.");
               }
            } else if (doctors.length > 0) {
               finalDoctorId = doctors[0].id;
               finalDoctorName = `Dr. ${doctors[0].lastName}`;
            } else {
               throw new Error("Tizimda shifokor topilmadi. Iltimos, 'Sozlamalar' bo'limida kamida bitta shifokor profilini yarating.");
            }
         }

         if (!existingAppt) {
            // Create NEW Appointment
            await onAddAppointment({
               patientId: patient.id,
               patientName: `${formatFullName(patient)}`,
               doctorId: finalDoctorId,
               doctorName: finalDoctorName,
               type: 'Davolash',
               date: today,
               time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
               duration: 60,
               status: 'Completed',
               notes: `Bajarilgan ishlar:\n` + proceduresText,
               clinicId: patient.clinicId
            });
            toast.error(t('patients.details.alerts.visitSaved'));
         } else {
            // Update EXISTING Appointment
            const currentNotes = existingAppt.notes || '';

            // Deduplication check: if notes already contain this text, skip appending
            if (currentNotes.includes(proceduresText)) {
               console.log("Duplicate prevention: Procedures already in notes");
               toast.success("Qabul tarixi yangilandi!");
               setPendingProcedures([]);
               setVisitKey(prev => prev + 1);
               return;
            }

            const newNotes = currentNotes ? currentNotes + '\n\n' + `Qo'shimcha (${new Date().toLocaleTimeString()}):\n` + proceduresText : `Bajarilgan ishlar:\n` + proceduresText;

            await onUpdateAppointment(existingAppt.id, {
               notes: newNotes,
               status: 'Completed'
            });
            toast.error(t('patients.details.alerts.visitUpdated'));
         }

         // 2. Cleanup only on SUCCESS
         setProcessedBatches(prev => {
            const newSet = new Set(prev);
            newSet.add(batchSignature);
            return newSet;
         });
         setPendingProcedures([]);
         setVisitKey(prev => prev + 1);

         // 3. Qabul yakunlangach — darhol to'lov oynasini oldindan to'ldirib ochamiz
         if (total > 0) {
            const breakdown = procedures.map(p => `${p.serviceName}|${p.price}`).join('||') + `||TOTAL|${total}`;
            setDiscountType('percent');
            setPaymentData({
               amount: total.toString(),
               paidAmount: total.toString(),
               debtAmount: '0',
               service: breakdown,
               type: 'Cash',
               status: 'Paid',
               doctorId: finalDoctorId,
               appointmentDate: today,
               discountPercent: ''
            });
            setIsPaymentModalOpen(true);
         }
      } catch (error: any) {
         console.error('Visit completion failed', error);
         // Error toast is already shown by App.tsx, but we can add more specific alert here if needed
         toast.error(`Xatolik: ${error.message || 'Tashrifni yakunlashda xato yuz berdi. Iltimos qaytadan urunib ko\'ring.'}`);
      }
   };


   return (
      <>
         <div className="space-y-6 animate-fade-in pb-10 print:hidden">
            {/* Top Nav */}
            <div className="flex items-center gap-4">
               <Button variant="ghost" onClick={onBack} className="!p-2">
                  <ArrowLeft className="w-5 h-5" />
               </Button>
               <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('patients.details.title')}</h1>
               <div className="ml-auto">
                  <Button
                     variant="secondary"
                     onClick={() => printPatientCard({
                        patient,
                        clinic: currentClinic,
                        doctor: doctors.find(d => d.id === patient.doctorId) || myDoctor || doctors[0],
                        encounter: { data: encounterData, template: templates.find(x => x.id === encounterTemplateId) },
                        diagnoses,
                        procedures: allProceduresHistory,
                     })}
                  >
                     <Printer className="w-4 h-4 mr-2" /> Karta (vipiska)
                  </Button>
               </div>
            </div>

            {/* Header Card */}
            <Card className="p-6">
               <div className="flex flex-col md:flex-row gap-6 items-start">
                  <div className="relative group flex-shrink-0">
                     <div className="w-24 h-24 rounded-full bg-primary-100 dark:bg-primary-900 border-2 border-white dark:border-gray-700 shadow-md overflow-hidden flex items-center justify-center text-3xl font-bold">
                        {patient.avatarUrl ? (
                           <img src={getFileUrl('patient-avatar', patient.avatarUrl ? patient.id : null)} alt={patient.firstName} className="w-full h-full object-cover" />
                        ) : (
                           <span className="text-primary-600 dark:text-primary-200">{patient.firstName[0]}{patient.lastName[0]}</span>
                        )}
                     </div>
                     <label className="absolute inset-0 flex items-center justify-center bg-black/40 text-white rounded-full opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity">
                        <Edit className="w-6 h-6" />
                        <input 
                           type="file" 
                           className="hidden" 
                           accept="image/*" 
                           onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) handleImageUpload('avatar', file);
                           }} 
                        />
                     </label>
                  </div>
                  <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-6 w-full">
                     <div className="space-y-1">
                        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{formatFullName(patient)}</h2>
                        <p className="text-gray-500 dark:text-gray-400 flex items-center gap-2">
                           <span className="capitalize">{patient.gender === 'Male' ? t('patients.modal.male') : t('patients.modal.female')}</span> • {calcAge(patient.dob) ?? 'N/A'} {t('patients.details.age')}{patient.dob && ` (${formatDobDDMMYYYY(patient.dob)})`}
                        </p>
                        <div className="pt-2 flex items-center gap-3">
                           <Badge status={patient.status} />
                           {patient.balance !== undefined && (
                              <div className={`px-3 py-1 rounded-full text-xs font-bold border ${
                                 patient.balance > 0 
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800'
                                    : patient.balance < 0
                                       ? 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800'
                                       : 'bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700'
                              }`}>
                                 {patient.balance > 0 
                                    ? `Avans: ${formatMoney(patient.balance)} UZS` 
                                    : patient.balance < 0 
                                       ? `Qarz: ${formatMoney(Math.abs(patient.balance))} UZS`
                                       : `Hisob: 0 UZS`}
                              </div>
                           )}
                        </div>
                     </div>

                     <div className="space-y-3 text-sm">
                        <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
                           <Phone className="w-4 h-4" /> {showPatientPhone ? patient.phone : maskPhone(patient.phone)}
                        </div>
                        {patient.secondaryPhone && (
                           <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
                              <Phone className="w-4 h-4 text-gray-400" /> {showPatientPhone ? patient.secondaryPhone : maskPhone(patient.secondaryPhone)} (Qo'shimcha)
                           </div>
                        )}
                        <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
                           <MapPin className="w-4 h-4" /> {patient.address || t('patients.details.noAddress')}
                        </div>
                        <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
                           <Clock className="w-4 h-4" /> {t('patients.details.lastVisit')} {patient.lastVisit}
                        </div>
                        {patient.doctorName && (
                           <div className="flex items-center gap-2 text-primary-600 dark:text-primary-400 font-medium">
                              <User className="w-4 h-4" /> {t('patients.details.doctor')} {patient.doctorName}
                           </div>
                        )}
                     </div>

                     <div className="flex xl:flex-col md:flex-row flex-col justify-end items-start xl:items-end gap-2 text-right">
                        <Button variant="secondary" size="sm" onClick={() => setIsAssignDoctorModalOpen(true)}>
                           <UserPlus className="w-4 h-4 mr-2" /> {patient.doctorId ? t('patients.details.changeDoctor') : t('patients.details.assignDoctor')}
                        </Button>
                        <Button variant="secondary" size="sm" onClick={() => {
                           setMessageType('Custom');
                           setMessageText('');
                           setIsMessageModalOpen(true);
                        }}>
                           <Send className="w-4 h-4 mr-2" /> {t('patients.details.sendMessage')}
                        </Button>
                        <Button variant="secondary" size="sm" onClick={handleEditOpen}>
                           <Edit className="w-4 h-4 mr-2" /> {t('patients.details.editProfile')}
                        </Button>
                     </div>
                  </div>
               </div>
            </Card>

            {/* Tabs */}
            <div className="border-b border-gray-200 dark:border-gray-700">
               <nav className="-mb-px flex space-x-8 overflow-x-auto">
                  {[
                     { id: 'overview', label: t('patients.details.tabs.overview'), icon: User },
                     { id: 'chart', label: t('patients.details.tabs.chart'), icon: Activity },
                     { id: 'photos', label: t('patients.details.tabs.photos'), icon: FileText },
                     /* Dinamika: bitta qiymat kam narsa aytadi, o'zgarish muhim */
                     { id: 'labs', label: 'Tahlil dinamikasi', icon: FlaskConical },
                     { id: 'appointments', label: t('patients.details.tabs.appointments'), icon: Calendar },
                     { id: 'payments', label: t('patients.details.tabs.payments'), icon: CreditCard },
                     { id: 'installments', label: "Bo'lib to'lash", icon: Clock },
                     { id: 'materials', label: t('patients.details.tabs.materials'), icon: Package },
                  ].map(tab => (
                     <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as any)}
                        className={`
                  group inline-flex items-center py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap transition-colors
                  ${activeTab === tab.id
                              ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                           }
                `}
                     >
                        <tab.icon className={`
                  -ml-0.5 mr-2 h-4 w-4
                  ${activeTab === tab.id ? 'text-primary-500' : 'text-gray-400 group-hover:text-gray-500'}
                `} />
                        {tab.label}
                     </button>
                  ))}
               </nav>
            </div>

            {/* Tab Content */}
            <div className="min-h-[400px]">

               {activeTab === 'overview' && (
                  <div className="space-y-6">
                  {/* Allergiya, surunkali kasalliklar va BOSHQA bo'limlardagi
                      qabullar. Shu ekranda ilgari faqat stomatologiya
                      ko'rinardi — bemor terapevtga ham borgani bilinmasdi. */}
                  <PatientHistoryPanel
                     patientId={patient.id}
                     canEdit={userRole === UserRole.CLINIC_ADMIN || userRole === UserRole.DOCTOR}
                     // Bu ekranda toast tizimi yo'q — xabar alert bilan
                     addToast={(_t, msg) => toast.error(msg)}
                  />

                  {/* Rozilik, shartnoma, ma'lumotlarga rozilik — qonun talabi
                      (25 va 26-moddalar, ЗРУ-547). Ilgari tizimda imzolanadigan
                      birorta qog'oz yo'q edi. */}
                  <PatientDocuments
                     patientId={patient.id}
                     canCreate={userRole !== UserRole.LAB_TECHNICIAN}
                     addToast={(_t, msg) => toast.error(msg)}
                  />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                     <VisitWorkflow
                        key={visitKey}
                        services={services}
                        categories={categories}
                        doctors={doctors}
                        initialProcedures={pendingProcedures}
                        onProceduresChange={setPendingProcedures}
                        onCompleteVisit={handleCompleteVisit}
                     />

                     <Card className="p-6 space-y-4">
                        <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                           <Activity className="w-5 h-5" /> {t('patients.details.medicalHistory.title')}
                        </h3>
                        <div className="bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-lg border border-yellow-100 dark:border-yellow-800">
                           <div className="flex justify-between items-center mb-2">
                              <p className="text-yellow-800 dark:text-yellow-200 font-medium">{t('patients.details.medicalHistory.subtitle')}</p>
                              <Button
                                 size="sm"
                                 variant="secondary"
                                 className="h-7 text-xs"
                                 onClick={() => {
                                    onUpdatePatient(patient.id, { medicalHistory: historyText });
                                    toast.error(t('common.save'));
                                 }}
                              >
                                 {t('common.save')}
                              </Button>
                           </div>
                           <textarea
                              className="w-full bg-transparent border-none p-0 text-sm text-yellow-900 dark:text-yellow-100 focus:ring-0 resize-none"
                              rows={4}
                              value={historyText}
                              onChange={(e) => setHistoryText(e.target.value)}
                              placeholder={t('patients.details.medicalHistory.placeholder')}
                           />
                        </div>


                        <div className="pt-4 border-t border-gray-100 dark:border-gray-700">
                           <p className="font-medium mb-3 text-gray-700 dark:text-gray-300">{t('patients.details.medicalHistory.quickSelect')}</p>
                           <div className="flex flex-wrap gap-2">
                              {[
                                 "SOG'LOM(SHIKOYATI YO'Q )",
                                 "HOMILADORLIK-Z 32.1",
                                 "TASDIQLANMAGAN HOMILADORLIK-Z 32.0",
                                 "GIPERTONIYA (DAVLENIYA)-I 11.0",
                                 "MIOKARD INFARKTI-I 21.9",
                                 "SURUNKALI YURAK ISHEMIK KASALLIGI -I 25.9",
                                 "OITS -B.20",
                                 "GEPATIT A-B.15",
                                 "GEPATIT B-B.16",
                                 "TUBERKULOZ(SIL)-A.15.0",
                                 "QANDLI DIABET(SHAKAR)-E 10.9",
                                 "QANDLI DIABET(SHAKAR)-E 11.9",
                                 "RAHIT-E 55.9",
                                 "SURUNKALI REVMATIZM-I 09.8"
                              ].map((disease) => (
                                 <button
                                    key={disease}
                                    onClick={() => {
                                       // Avoid duplicates if possible, or just append
                                       if (!historyText.includes(disease)) {
                                          const newHistory = historyText ? historyText + '\n' + disease : disease;
                                          setHistoryText(newHistory);
                                          onUpdatePatient(patient.id, {
                                             medicalHistory: newHistory
                                          });
                                       } else {
                                          toast.error(t('patients.details.medicalHistory.alreadyAdded'));
                                       }
                                    }}
                                    className="px-3 py-1.5 text-xs font-medium bg-primary-50 text-primary-700 hover:bg-primary-100 dark:bg-primary-900/30 dark:text-primary-300 dark:hover:bg-primary-900/50 rounded-full transition-colors border border-primary-100 dark:border-primary-800"
                                 >
                                    {disease}
                                 </button>
                              ))}
                           </div>
                        </div>
                     </Card>


                  </div>
                  </div>
               )}


               {/* Dental Chart Tab */}
               {activeTab === 'chart' && (
                  <div className="space-y-4">
                     <div className="flex justify-between items-center">
                        <h3 className="text-lg font-bold text-gray-900 dark:text-white">{t('patients.details.chart.title')}</h3>
                        <div className="flex gap-2">
                           <Button variant="secondary" size="sm" onClick={() => window.print()}><Printer className="w-4 h-4 mr-2" /> {t('patients.details.chart.print')}</Button>
                        </div>
                     </div>
                     <EncounterForm
                        departments={departments}
                        templates={templates}
                        patientGender={patient.gender === 'Male' || patient.gender === 'Female' ? patient.gender : null}
                        patientAge={calcAge(patient.dob)}
                        departmentId={encounterDeptId}
                        templateId={encounterTemplateId}
                        value={encounterData}
                        onDepartmentChange={setEncounterDeptId}
                        onSave={handleSaveEncounter}
                     />
                  </div>
               )}

               {/* Tahlil dinamikasi (reliz 6+) */}
               {activeTab === 'labs' && (
                  <LabDynamics patientId={patient.id} />
               )}

               {/* Photos Tab */}
               {activeTab === 'photos' && (
                  <PatientPhotos patientId={patient.id} clinicId={patient.clinicId} token={token} />
               )}

               {/* Appointments Tab */}
               {activeTab === 'appointments' && (
                  <div className="space-y-6">
                     {/* Upcoming Appointments Section */}
                     <Card className="p-6">
                        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">{t('patients.details.appointments.upcoming')}</h3>
                        <div className="space-y-3">
                           {patientAppointments
                              .filter(a => {
                                 const apptDateTime = new Date(`${a.date}T${a.time}`);
                                 const now = new Date();
                                 return apptDateTime >= now && a.status !== 'Cancelled' && a.status !== 'Completed';
                              })
                              .sort((a, b) => {
                                 const dateA = new Date(`${a.date}T${a.time}`);
                                 const dateB = new Date(`${b.date}T${b.time}`);
                                 return dateA.getTime() - dateB.getTime();
                              })
                              .map(app => (
                                 <div key={app.id} className="flex items-center justify-between p-4 bg-primary-50 dark:bg-primary-900/20 border border-primary-100 dark:border-primary-800 rounded-lg hover:shadow-md transition-all">
                                    <div className="flex items-center gap-4">
                                       <div className="w-12 h-12 rounded-full bg-primary-500 text-white flex items-center justify-center font-bold">
                                          {new Date(app.date).getDate()}
                                       </div>
                                       <div>
                                          <p className="font-bold text-gray-900 dark:text-white">
                                             {formatDateLong(new Date(app.date))}
                                          </p>
                                          <p className="text-sm text-gray-600 dark:text-gray-300">
                                             {app.time} • {app.type} • {app.doctorName}
                                          </p>
                                       </div>
                                    </div>
                                    <Badge status={app.status} />
                                 </div>
                              ))
                           }
                           {patientAppointments.filter(a => {
                              const apptDateTime = new Date(`${a.date}T${a.time}`);
                              const now = new Date();
                              return apptDateTime >= now && a.status !== 'Cancelled' && a.status !== 'Completed';
                           }).length === 0 && (
                                 <div className="text-center py-8 text-gray-500">
                                    Kutilayotgan qabullar yo'q
                                 </div>
                              )}
                        </div>
                     </Card>

                     {/* Appointments History */}
                     <Card className="overflow-hidden">
                        <div className="p-4 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
                           <h3 className="text-lg font-bold text-gray-900 dark:text-white">{t('patients.details.appointments.history')}</h3>
                           <Button size="sm" onClick={openApptModal}>{t('patients.details.appointments.new')}</Button>
                        </div>
                        <div className="overflow-x-auto">
                           <table className="w-full text-left text-sm">
                              <thead className="bg-gray-50 dark:bg-gray-800">
                                 <tr>
                                    <th className="p-4 font-medium text-gray-500">{t('patients.details.appointments.table.date')}</th>
                                    <th className="p-4 font-medium text-gray-500">{t('patients.details.appointments.table.procedure')}</th>
                                    <th className="p-4 font-medium text-gray-500 w-1/3">{t('patients.details.appointments.table.worksDone')}</th>
                                    <th className="p-4 font-medium text-gray-500">{t('patients.details.appointments.table.doctor')}</th>
                                    <th className="p-4 font-medium text-gray-500">{t('patients.details.appointments.table.status')}</th>
                                 </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                 {patientAppointments
                                    .sort((a, b) => new Date(b.date + ' ' + b.time).getTime() - new Date(a.date + ' ' + a.time).getTime())
                                    .map(app => (
                                       <tr key={app.id} className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors cursor-pointer" onClick={() => {
                                          // Optional: Add click handler if user wants to open details modal
                                          if (app.notes) toast.error(app.notes); // Temporary quick view or just rely on the column
                                       }}>
                                          <td className="p-4 text-gray-900 dark:text-white font-medium whitespace-nowrap">
                                             {formatDate(new Date(app.date))} <br />
                                             <span className="text-xs text-gray-500 font-normal">{app.time}</span>
                                          </td>
                                          <td className="p-4 text-gray-600 dark:text-gray-300">{app.type}</td>
                                          <td className="p-4 text-gray-600 dark:text-gray-300 min-w-[200px]">
                                             {app.notes ? (
                                                <div className="text-xs bg-gray-50 dark:bg-gray-900 p-2 rounded border border-gray-100 dark:border-gray-700 whitespace-pre-line">
                                                   {app.notes}
                                                </div>
                                             ) : (
                                                <span className="text-xs text-gray-400">-</span>
                                             )}
                                          </td>
                                          <td className="p-4 text-gray-600 dark:text-gray-300 whitespace-nowrap">{app.doctorName}</td>
                                          <td className="p-4"><Badge status={app.status} /></td>
                                       </tr>
                                    ))}
                              </tbody>
                           </table>
                        </div>
                        {patientAppointments.length === 0 && <div className="p-8 text-center text-gray-500">{t('patients.details.appointments.historyEmpty')}</div>}
                     </Card>
                  </div>
               )}

               {/* Payments Tab */}
               {activeTab === 'payments' && (
                  <div className="space-y-6">
                     {/* Pending Payments Section */}
                     <Card className="overflow-hidden border-yellow-200 dark:border-yellow-800">
                        <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border-b border-yellow-100 dark:border-yellow-800 flex justify-between items-center">
                           <div>
                              <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2"><FileText className="w-5 h-5 text-yellow-600" /> {t('patients.details.payments.pendingTitle')}</h3>
                              <p className="text-sm text-gray-500">{t('patients.details.payments.pendingDesc')}</p>
                           </div>
                        </div>
                        <div className="overflow-x-auto">
                           <table className="w-full text-left text-sm">
                              <thead className="bg-gray-50 dark:bg-gray-800">
                                 <tr>
                                    <th className="p-4 font-medium text-gray-500">{t('patients.details.appointments.table.date')}</th>
                                    <th className="p-4 font-medium text-gray-500">{t('patients.details.appointments.table.procedure')}</th>
                                    <th className="p-4 font-medium text-gray-500 w-1/3">{t('patients.details.appointments.table.worksDone')}</th>
                                    <th className="p-4 font-medium text-gray-500">{t('patients.details.appointments.table.status')}</th>
                                    <th className="p-4 font-medium text-gray-500">{t('common.actions')}</th>
                                 </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                 {patientAppointments.filter(app => {
                                    if (!app || !app.date) return false;
                                    const isPaid = (patientTransactions || []).some(t => t && t.date === app.date && (t.status === 'Paid' || t.status === 'paid'));
                                    return (app.status === 'Completed' || app.status === 'Checked-In') && !isPaid;
                                 }).map(app => {
                                    const doctor = (doctors || []).find(d => d && d.id === app.doctorId);
                                    return (
                                       <tr key={app.id} className="hover:bg-yellow-50/50 dark:hover:bg-yellow-900/10 transition-colors">
                                          <td className="p-4 text-gray-900 dark:text-white font-medium whitespace-nowrap">
                                             {app.date ? formatDate(new Date(app.date)) : 'N/A'} <br />
                                             <span className="text-xs text-gray-500 font-normal">{app.time}</span>
                                          </td>
                                          <td className="p-4 text-gray-600 dark:text-gray-300">{app.type}</td>
                                          <td className="p-4 text-gray-600 dark:text-gray-300 min-w-[200px]"><div className="text-xs bg-gray-50 dark:bg-gray-900 p-2 rounded border border-gray-100 dark:border-gray-700 whitespace-pre-line">{app.notes || '-'}</div></td>
                                          <td className="p-4"><Badge status="Pending" /></td>
                                          <td className="p-4 flex gap-2 flex-wrap">
                                             <Button size="sm" onClick={() => {
                                                const { total, breakdown } = calculateAppointmentTotal(app.notes || '', services);
                                                setDiscountType('percent');
                                                setPaymentData({
                                                   amount: total.toString(),
                                                   paidAmount: total.toString(),
                                                   debtAmount: '0',
                                                   service: breakdown || app.type,
                                                   type: 'Cash',
                                                   status: 'Paid',
                                                   doctorId: app.doctorId,
                                                   appointmentDate: app.date,
                                                   discountPercent: ''
                                                });
                                                setIsPaymentModalOpen(true);
                                             }}>To'lov</Button>
                                             <Button size="sm" variant="secondary" className="bg-purple-50 text-purple-700 border-purple-100 dark:bg-purple-900/20 dark:text-purple-300 dark:border-purple-800" onClick={() => {
                                                const { total, breakdown } = calculateAppointmentTotal(app.notes || '', services);
                                                setInstallmentQuickOpen({ service: breakdown || app.type, amount: total, doctorId: app.doctorId });
                                                setActiveTab('installments');
                                             }}>Bo'lib to'lash</Button>
                                             {(patient.balance || 0) > 0 && (
                                                <Button size="sm" variant="secondary" className="bg-primary-50 text-primary-700 border-primary-100" onClick={async () => {
                                                   const { total, breakdown } = calculateAppointmentTotal(app.notes || '', services);
                                                   if (await confirmAction({ title: `Ushbu qabul uchun ${formatMoney(total)} UZS miqdorini bemor avansidan yechishga ruxsatingiz bormi?` })) {
                                                      const doctor = doctors.find(d => d.id === app.doctorId);
                                                      await onAddTransaction({
                                                         patientId: patient.id,
                                                         patientName: `${formatFullName(patient)}`,
                                                         date: app.date,
                                                         amount: total,
                                                         service: breakdown || app.type,
                                                         type: 'Balance' as any,
                                                         status: 'Paid',
                                                         doctorId: app.doctorId,
                                                         doctorName: doctor ? `${formatDoctorName(doctor)}` : '',
                                                         clinicId: patient.clinicId
                                                      });
                                                      toast.success("To'lov avans hisobidan muvaffaqiyatli amalga oshirildi!");
                                                   }
                                                }}>Hisobdan</Button>
                                             )}
                                          </td>
                                       </tr>
                                    );
                                 })}
                              </tbody>
                           </table>
                        </div>
                        {patientAppointments.filter(app => { const isPaid = (patientTransactions || []).some(trans => trans && trans.date === app.date && trans.status === 'Paid'); return (app.status === 'Completed' || app.status === 'Checked-In') && !isPaid; }).length === 0 && <div className="p-8 text-center text-gray-500">{t('patients.details.payments.pendingEmpty')}</div>}
                     </Card>
                     {/* Transaction History Section */}
                     <Card className="overflow-hidden">
                        <div className="p-4 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
                           <div><h3 className="text-lg font-bold text-gray-900 dark:text-white">{t('patients.details.payments.historyTitle')}</h3><p className="text-sm text-gray-500">{t('patients.details.payments.historyDesc')}</p></div>
                           <div className="flex items-center gap-6">
                              <div className="text-right">
                                 <p className="text-sm text-gray-500">{t('patients.details.payments.totalPaid')}</p>
                                 <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
                                    {formatMoney((patientTransactions || [])
                                       .filter(transaction => transaction && transaction.status === 'Paid' && transaction.type !== 'Balance')
                                       .reduce((acc, transaction) => acc + (Number(transaction.amount) || 0), 0)
                                    )} UZS
                                 </p>
                              </div>
                              <div className="text-right">
                                 <p className="text-sm text-gray-500">{t('patients.details.balance')}</p>
                                 <p className="text-xl font-bold text-primary-600 dark:text-primary-400">
                                    {formatMoney((patient.balance || 0))} UZS
                                 </p>
                              </div>
                              <div className="flex gap-2">
                                 <Button 
                                    size="sm" 
                                    variant="secondary"
                                    className="bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-emerald-200"
                                    onClick={() => {
                                       setPaymentData({
                                          amount: '',
                                          paidAmount: '',
                                          debtAmount: '0',
                                          service: 'Avans',
                                          type: 'Cash',
                                          status: 'Paid',
                                          doctorId: doctors.length > 0 ? doctors[0].id : '',
                                          appointmentDate: todayISO(),
                                          discountPercent: ''
                                       });
                                       setIsPaymentModalOpen(true);
                                    }}
                                 >
                                    <Plus className="w-4 h-4 mr-2" /> {t('patients.details.modals.advanceTitle')}
                                 </Button>
                                 <Button size="sm" onClick={handlePaymentModalOpen}>{t('patients.details.payments.newPayment')}</Button>
                              </div>
                           </div>
                        </div>
                        <div className="overflow-x-auto">
                           <table className="w-full text-left text-sm">
                              <thead className="bg-gray-50 dark:bg-gray-800">
                                 <tr><th className="p-4 font-medium text-gray-500">{t('finance.table.date')}</th><th className="p-4 font-medium text-gray-500">{t('finance.table.service')}</th><th className="p-4 font-medium text-gray-500">{t('finance.table.method')}</th><th className="p-4 font-medium text-gray-500">{t('finance.table.amount')}</th><th className="p-4 font-medium text-gray-500">{t('finance.table.discount')}</th><th className="p-4 font-medium text-gray-500">{t('finance.table.status')}</th><th className="p-4 font-medium text-gray-500">{t('common.actions')}</th></tr>
                              </thead>
                              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                 {(patientTransactions || []).map(transaction => (
                                    <tr key={transaction.id} className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                                       <td className="p-4 text-gray-900 dark:text-white">{transaction.date || 'N/A'}</td>
                                       <td className="p-4 text-gray-600 dark:text-gray-300">{transaction.service}</td>
                                       <td className="p-4 text-gray-600 dark:text-gray-300">{transaction.type}</td>
                                       <td className="p-4 text-gray-900 dark:text-white font-medium">{formatMoney((Number(transaction.amount) || 0))} UZS</td>
                                       <td className="p-4">
                                          {transaction.discountPercent ? (
                                             <div className="flex flex-col">
                                                <span className="text-xs text-orange-600 dark:text-orange-400 font-bold">-{transaction.discountPercent}%</span>
                                                {transaction.discountAmount ? <span className="text-[10px] text-gray-500">({formatMoney((Number(transaction.discountAmount) || 0))} UZS)</span> : null}
                                             </div>
                                          ) : (
                                             <span className="text-gray-400">-</span>
                                          )}
                                       </td>
                                       <td className="p-4"><Badge status={transaction.status} /></td>
                                       <td className="p-4 flex gap-2">
                                          {userRole !== UserRole.DOCTOR && transaction.status === 'Pending' && (
                                             <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => {
                                                setEditingTransaction(transaction);
                                                setEditPaymentAmount(transaction.amount.toString());
                                                setEditPaymentStatus('Paid');
                                                setEditPaymentMethod('Cash');
                                                setIsPaymentEditModalOpen(true);
                                             }}>{t('patients.details.payments.payAction')}</Button>
                                          )}
                                          {userRole !== UserRole.DOCTOR && (
                                             <Button size="sm" variant="secondary" onClick={() => {
                                                setEditingTransaction(transaction);
                                                setEditPaymentAmount(transaction.amount.toString());
                                                setEditPaymentStatus(transaction.status);
                                                setEditPaymentMethod(transaction.type);
                                                setIsPaymentEditModalOpen(true);
                                             }}><Edit className="w-4 h-4" /></Button>
                                          )}
                                       </td>
                                    </tr>
                                 ))}
                              </tbody>
                           </table>
                        </div>
                        {patientTransactions.length === 0 && <div className="p-8 text-center text-gray-500">{t('patients.details.payments.historyEmpty')}</div>}
                     </Card>
                  </div>
               )}
               {activeTab === 'installments' && patient && currentClinic && (
                  <InstallmentsTab 
                     patientId={patient.id} 
                     clinicId={currentClinic.id} 
                     doctors={doctors}
                     services={services}
                     initialCreateData={installmentQuickOpen || undefined}
                     onInitialDataConsumed={() => setInstallmentQuickOpen(null)}
                  />
               )}
               
               {activeTab === 'materials' && (
                  <Card className="overflow-hidden">
                     <div className="p-4 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
                        <h3 className="font-bold text-gray-900 dark:text-white">{t('patients.details.materials.title')}</h3>
                        <Button size="sm" onClick={() => setIsMaterialModalOpen(true)}>{t('patients.details.materials.useBtn')}</Button>
                     </div>
                     <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                           <thead className="bg-gray-50 dark:bg-gray-800">
                              <tr>
                                 <th className="p-4 font-medium text-gray-500">{t('patients.details.materials.table.date')}</th>
                                 <th className="p-4 font-medium text-gray-500">{t('patients.details.materials.table.material')}</th>
                                 <th className="p-4 font-medium text-gray-500">{t('patients.details.materials.table.quantity')}</th>
                                 <th className="p-4 font-medium text-gray-500">{t('patients.details.materials.table.note')}</th>
                                 <th className="p-4 font-medium text-gray-500">{t('patients.details.materials.table.user')}</th>
                                 <th className="p-4 font-medium text-gray-500">{t('common.actions')}</th>
                              </tr>
                           </thead>
                           <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                              {materialLogs.map(log => (
                                 <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                                    <td className="p-4 text-gray-900 dark:text-white">{formatDate(new Date(log.date))}</td>
                                    <td className="p-4 text-gray-900 dark:text-white font-medium">
                                       {log.item?.name}
                                       <span className="text-xs text-gray-500 ml-1">({log.item?.unit})</span>
                                    </td>
                                    <td className={`p-4 font-medium ${log.reversed ? 'text-gray-400 line-through' : 'text-red-600'}`}>
                                       {Math.abs(log.change)}
                                    </td>
                                    <td className="p-4 text-gray-600 dark:text-gray-300">{log.note || '-'}</td>
                                    <td className="p-4 text-gray-600 dark:text-gray-300">{log.userName}</td>
                                    <td className="p-4">
                                       {/* Yozuv O'CHIRILMAYDI: bekor qilinganda teskari harakat
                                           yoziladi va ikkala qator ham jurnalda qoladi (0028). */}
                                       {log.reversed ? (
                                          <span className="text-xs text-gray-400">
                                             {t('patients.details.materials.reversed')}
                                          </span>
                                       ) : (
                                          <button
                                             onClick={async () => {
                                                if (!await confirmAction({ title: t('patients.details.materials.reverseConfirm') })) return;
                                                try {
                                                   await api.stock.reverse(log.id);
                                                   if (currentClinic) {
                                                      const [updatedLogs, updatedItems] = await Promise.all([
                                                         api.inventory.getLogs(currentClinic.id, patientId),
                                                         api.inventory.getAll(currentClinic.id),
                                                      ]);
                                                      setMaterialLogs(updatedLogs);
                                                      setInventoryItems(updatedItems);
                                                   }
                                                } catch (e: any) {
                                                   toast.error(e?.message || t('patients.details.alerts.error'));
                                                }
                                             }}
                                             className="px-2 py-1 text-xs text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                                             title={t('patients.details.materials.reverse')}
                                          >
                                             {t('patients.details.materials.reverse')}
                                          </button>
                                       )}
                                    </td>
                                 </tr>
                              ))}
                           </tbody>
                        </table>
                     </div>
                     {materialLogs.length === 0 && <div className="p-8 text-center text-gray-500">{t('patients.details.materials.empty')}</div>}
                  </Card>
               )}
            </div>

            {/* Edit Modal */}
            <Modal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} title={t('patients.details.modals.editProfile')}>
               <form onSubmit={handleEditSave} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                     <Input label={t('patients.modal.firstName')} value={editFormData.firstName || ''} onChange={e => setEditFormData({ ...editFormData, firstName: e.target.value })} />
                     <Input label={t('patients.modal.lastName')} value={editFormData.lastName || ''} onChange={e => setEditFormData({ ...editFormData, lastName: e.target.value })} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                     <Input label={t('patients.modal.phone')} value={editFormData.phone || ''} onChange={(e) => setEditFormData({ ...editFormData, phone: e.target.value })} required />
                     <Input label={t('patients.modal.secondaryPhone')} value={editFormData.secondaryPhone || ''} onChange={(e) => setEditFormData({ ...editFormData, secondaryPhone: e.target.value })} />
                  </div>
                  <Input label={t('patients.modal.address')} value={editFormData.address || ''} onChange={e => setEditFormData({ ...editFormData, address: e.target.value })} placeholder="Bemor manzilini kiriting..." />
                  <div className="flex justify-end gap-2 pt-4">
                     <Button type="button" variant="secondary" onClick={() => setIsEditModalOpen(false)}>{t('common.cancel')}</Button>
                     <Button type="submit">{t('common.save')}</Button>
                  </div>
               </form>
            </Modal>


            {/* Material Usage Modal */}
            <Modal isOpen={isMaterialModalOpen} onClose={() => setIsMaterialModalOpen(false)} title={t('patients.details.modals.useMaterialTitle')}>
               <form onSubmit={handleMaterialSubmit} className="space-y-4">
                  <Select
                     label={t('patients.details.materials.table.material')}
                     value={materialData.itemId}
                     onChange={e => setMaterialData({ ...materialData, itemId: e.target.value })}
                     options={[
                        { value: '', label: t('patients.details.modals.selectMaterial') },
                        ...inventoryItems.map(item => ({
                           value: item.id,
                           label: `${item.name} (${item.quantity} ${item.unit} ${t('patients.details.modals.available')})`
                        }))
                     ]}
                     required
                  />
                  <Input
                     label={t('patients.details.materials.table.quantity')}
                     type="number"
                     value={materialData.quantity}
                     onChange={e => setMaterialData({ ...materialData, quantity: e.target.value })}
                     placeholder="0"
                     required
                  />
                  <Input
                     label={t('patients.details.materials.table.note')}
                     value={materialData.note}
                     onChange={e => setMaterialData({ ...materialData, note: e.target.value })}
                     placeholder="Qo'shimcha izoh..."
                  />
                  <div className="flex justify-end gap-2 pt-4">
                     <Button type="button" variant="secondary" onClick={() => setIsMaterialModalOpen(false)}>Bekor qilish</Button>
                     <Button type="submit">Saqlash</Button>
                  </div>
               </form>
            </Modal>

            {/* Payment Modal */}
            <Modal isOpen={isPaymentModalOpen} onClose={() => setIsPaymentModalOpen(false)} title={paymentData.service === 'Avans' ? t('patients.details.modals.advanceTitle') : t('patients.details.modals.paymentTitle')}>
               <form onSubmit={handlePaymentSave} className="space-y-4">
                  {/* Only show doctor field for non-individual plans OR individual plans with doctors - AND NOT for Avans */}
                  {paymentData.service !== 'Avans' && !(currentClinic?.planId === 'individual' && doctors.length === 0) && (
                     <Select
                        label={t('finance.table.doctor')}
                        value={paymentData.doctorId}
                        onChange={e => setPaymentData({ ...paymentData, doctorId: e.target.value })}
                        options={[
                           { value: '', label: 'Shifokorni tanlang' },
                           ...doctors.map(d => ({ value: d.id, label: `${formatDoctorName(d)}` }))
                        ]}
                        required
                     />
                  )}
                  {paymentData.service !== 'Avans' && (
                     <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">📋 {t('patients.details.modals.doneServices')}</label>
                        <div className="border-2 border-primary-100 dark:border-primary-800 rounded-lg bg-gradient-to-br from-primary-50 to-indigo-50 dark:from-gray-800 dark:to-gray-900 p-4 space-y-0.5">
                           {paymentData.service && paymentData.service.includes('|') ? (
                              paymentData.service.split('||').filter(Boolean).map((item, idx) => {
                                 const parts = item.split('|');
                                 if (parts[0] === 'TOTAL') {
                                    return (
                                       <div key={idx} className="pt-3 mt-3 border-t-2 border-primary-300 dark:border-primary-700">
                                          <div className="flex justify-between items-center bg-primary-600 dark:bg-primary-700 text-white px-4 py-2.5 rounded-md font-bold text-base">
                                             <span className="flex items-center gap-2">💰 JAMI:</span>
                                             <span className="text-lg">{parts[1]} UZS</span>
                                          </div>
                                       </div>
                                    );
                                 }
                                 return (
                                    <div key={idx} className="flex justify-between items-center bg-white dark:bg-gray-800 px-3 py-2 rounded border border-primary-100 dark:border-gray-700">
                                       <span className="text-gray-700 dark:text-gray-200 font-medium">{parts[0]}</span>
                                       <span className="text-primary-600 dark:text-primary-400 font-semibold">{parts[1]} UZS</span>
                                    </div>
                                 );
                              })
                           ) : (
                              <div className="space-y-4">
                                 {categories && categories.length > 0 && (
                                    <Select
                                       label="Kategoriya"
                                       value={manualPaymentCategoryId}
                                       onChange={(e) => {
                                          setManualPaymentCategoryId(e.target.value);
                                          setManualPaymentServiceId(null);
                                          setPaymentData({ ...paymentData, service: '', paidAmount: '' });
                                       }}
                                    >
                                       <option value="">Barcha kategoriyalar</option>
                                       {categories.map(cat => (
                                          <option key={cat.id} value={cat.id}>{cat.name}</option>
                                       ))}
                                    </Select>
                                 )}

                                 <Select
                                    label="Xizmat"
                                    value={manualPaymentServiceId?.toString() || ''}
                                    onChange={(e) => handleManualServiceChange(parseInt(e.target.value))}
                                 >
                                    <option value="">Xizmatni tanlang...</option>
                                    {(services || [])
                                       .filter(s => {
                                          if (!manualPaymentCategoryId) return true;
                                          const serviceCatId = (s as any).categoryId?.toString();
                                          return serviceCatId === manualPaymentCategoryId.toString();
                                       })
                                       .map(service => (
                                          <option key={service.id} value={service.id}>
                                             {service.name} - {formatMoney(service.price)} UZS
                                          </option>
                                       ))}
                                 </Select>
                              </div>
                           )}
                        </div>
                     </div>
                  )}
                  {paymentData.service !== 'Avans' && (
                     <div className="space-y-2">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Chegirma</label>
                        <div className="flex gap-2">
                           {/* Discount type selector */}
                           <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden shrink-0">
                              <button
                                 type="button"
                                 className={`px-3 py-2 text-sm font-medium transition-colors ${
                                    discountType === 'percent'
                                       ? 'bg-primary-600 text-white'
                                       : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                                 }`}
                                 onClick={() => {
                                    setDiscountType('percent');
                                    setPaymentData({ ...paymentData, discountPercent: '' });
                                 }}
                              >Foiz (%)</button>
                              <button
                                 type="button"
                                 className={`px-3 py-2 text-sm font-medium transition-colors ${
                                    discountType === 'amount'
                                       ? 'bg-primary-600 text-white'
                                       : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                                 }`}
                                 onClick={() => {
                                    setDiscountType('amount');
                                    setPaymentData({ ...paymentData, discountPercent: '' });
                                 }}
                              >Summa</button>
                           </div>
                           {/* Discount input */}
                           <div className="flex-1">
                              <Input
                                 label=""
                                 type="number"
                                 min="0"
                                 max={discountType === 'percent' ? 100 : undefined}
                                 value={paymentData.discountPercent}
                                 onChange={e => {
                                    const val = Number(e.target.value);
                                    const baseTotal = Number(paymentData.amount) || 0;
                                    if (discountType === 'percent') {
                                       if (val < 0 || val > 100) return;
                                       const discountedTotal = baseTotal > 0 ? Math.round(baseTotal * (1 - val / 100)) : 0;
                                       setPaymentData({
                                          ...paymentData,
                                          discountPercent: e.target.value,
                                          paidAmount: baseTotal > 0 ? discountedTotal.toString() : paymentData.paidAmount,
                                          debtAmount: '0'
                                       });
                                    } else {
                                       // Fixed amount discount
                                       if (val < 0) return;
                                       const discountedTotal = baseTotal > 0 ? Math.max(0, baseTotal - val) : 0;
                                       // Store equivalent percent for data consistency
                                       const equivalentPercent = baseTotal > 0 ? Math.round((val / baseTotal) * 100) : 0;
                                       setPaymentData({
                                          ...paymentData,
                                          discountPercent: e.target.value, // store raw discount amount as string
                                          paidAmount: baseTotal > 0 ? discountedTotal.toString() : paymentData.paidAmount,
                                          debtAmount: '0'
                                       });
                                    }
                                 }}
                                 placeholder={discountType === 'percent' ? '0' : 'Summa kiriting'}
                              />
                           </div>
                        </div>
                        {/* Discount info box */}
                        {paymentData.discountPercent && Number(paymentData.discountPercent) > 0 && (
                           <div className="p-2.5 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg text-xs text-yellow-800 dark:text-yellow-200">
                              {discountType === 'percent' ? (
                                 <>Chegirma summasi: <strong>{formatMoney((Number(paymentData.amount) || 0) * (Number(paymentData.discountPercent) || 0) / 100)} UZS</strong> ({paymentData.discountPercent}%)</>
                              ) : (
                                 <>Chegirma: <strong>{formatNumber(Number(paymentData.discountPercent))} UZS</strong> &nbsp;(Umumiy {(Number(paymentData.amount)||0) > 0 ? Math.round((Number(paymentData.discountPercent)/(Number(paymentData.amount)||1))*100) : 0}%)</>
                              )}
                           </div>
                        )}
                     </div>
                  )}

                  {paymentData.service !== 'Avans' && (patient?.balance || 0) > 0 && (
                     <div className="mb-4">
                        <Button 
                           type="button" 
                           variant="secondary" 
                           className="w-full bg-primary-50 text-primary-700 hover:bg-primary-100 border-primary-200 dark:bg-primary-900/20 dark:text-primary-300 dark:border-primary-800 flex items-center justify-center gap-2"
                           onClick={() => {
                              const baseAmount = Number(paymentData.amount) || 0;
                              const discountVal = Number(paymentData.discountPercent) || 0;
                              let finalTotal = baseAmount;
                              
                              if (discountType === 'percent') {
                                 finalTotal = Math.round(baseAmount * (1 - discountVal / 100));
                              } else {
                                 finalTotal = Math.max(0, baseAmount - discountVal);
                              }

                              setPaymentData({ 
                                 ...paymentData, 
                                 type: 'Balance',
                                 paidAmount: finalTotal.toString(),
                                 debtAmount: '0'
                              });
                           }}
                        >
                           <CreditCard className="w-4 h-4" /> Bemor avansidan to'lash (Mavjud: {formatMoney(patient.balance)} UZS)
                        </Button>
                     </div>
                  )}

                  <div className={paymentData.service === 'Avans' ? "grid grid-cols-1" : "grid grid-cols-2 gap-4"}>
                     <Input
                        label="To'lanayotgan Summa"
                        type="number"
                        value={paymentData.paidAmount}
                        onChange={e => {
                           // Asl narx ma'lum bo'lsa: qarz = jami - to'lanayotgan (qarz to'lovga qo'shilib ketmasligi uchun)
                           const total = getDiscountedTotal();
                           const paid = Number(e.target.value) || 0;
                           setPaymentData({
                              ...paymentData,
                              paidAmount: e.target.value,
                              debtAmount: total > 0 ? String(Math.max(0, total - paid)) : paymentData.debtAmount,
                           });
                        }}
                        placeholder="0.00"
                        required
                     />
                     {paymentData.service !== 'Avans' && (
                        <Input
                           label="Qolgan Qarzdorlik"
                           type="number"
                           value={paymentData.debtAmount}
                           onChange={e => {
                              // Asl narx ma'lum bo'lsa: to'lanayotgan = jami - qarz (avtomatik ayriladi)
                              const total = getDiscountedTotal();
                              const debt = Number(e.target.value) || 0;
                              setPaymentData({
                                 ...paymentData,
                                 debtAmount: e.target.value,
                                 paidAmount: total > 0 ? String(Math.max(0, total - debt)) : paymentData.paidAmount,
                              });
                           }}
                           placeholder="0.00"
                        />
                     )}
                  </div>

                  {/* Total Calculator Display - Only for non-Avans */}
                  {paymentData.service !== 'Avans' && (
                     <div className="p-3 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg flex justify-between items-center">
                        <span className="text-gray-700 dark:text-gray-300 font-medium">Jami Summa:</span>
                        <span className="text-gray-900 dark:text-white font-bold text-lg">
                           {formatMoney(((Number(paymentData.paidAmount) || 0) + (Number(paymentData.debtAmount) || 0)))} UZS
                        </span>
                     </div>
                  )}

                  <div className="grid grid-cols-1 gap-4">
                     <Select
                        label="To'lov Usuli"
                        value={paymentData.type}
                        onChange={e => setPaymentData({ ...paymentData, type: e.target.value })}
                        options={paymentData.service === 'Avans'
                           // Avans — bu kassaga pul kiritish; sug'urta ham, hisobdan yechish ham bu yerda ma'nosiz
                           ? INCOMING_PAYMENT_METHODS
                              .filter(m => m !== 'Insurance')
                              .map(m => ({ value: m, label: getPaymentMethodLabel(m) }))
                           : [
                              ...INCOMING_PAYMENT_METHODS.map(m => ({ value: m, label: getPaymentMethodLabel(m) })),
                              { value: 'Balance', label: getPaymentMethodLabel('Balance'), disabled: (patient?.balance || 0) <= 0 }
                           ]
                        }
                     />
                  </div>
                  <div className="flex justify-end gap-2 pt-4">
                     <Button type="button" variant="secondary" onClick={() => setIsPaymentModalOpen(false)} disabled={isPaymentSubmitting}>Bekor qilish</Button>
                     <Button type="submit" disabled={isPaymentSubmitting}>
                        {isPaymentSubmitting ? 'Saqlanmoqda...' : 'Saqlash'}
                     </Button>
                  </div>
               </form>
            </Modal>

            {/* Payment Edit Modal */}
            <Modal isOpen={isPaymentEditModalOpen} onClose={() => setIsPaymentEditModalOpen(false)} title="To'lovni Tahrirlash">
               <form onSubmit={handleEditPaymentSave} className="space-y-4">
                  <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg mb-4">
                     <p className="text-sm text-gray-500">Xizmat:</p>
                     <p className="font-medium text-gray-900 dark:text-white">{editingTransaction?.service}</p>
                     <p className="text-sm text-gray-500 mt-2">Sana:</p>
                     <p className="font-medium text-gray-900 dark:text-white">{editingTransaction?.date}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                     <Input
                        label="Summa"
                        type="number"
                        value={editPaymentAmount}
                        onChange={e => setEditPaymentAmount(e.target.value)}
                        placeholder="0.00"
                        required
                     />
                     <Select
                        label="Status"
                        value={editPaymentStatus}
                        onChange={e => setEditPaymentStatus(e.target.value)}
                        options={[
                           { value: 'Paid', label: 'To\'landi' },
                           { value: 'Pending', label: 'Kutilmoqda' }
                        ]}
                     />
                  </div>
                  <Select
                     label="To'lov Usuli"
                     value={editPaymentMethod}
                     onChange={e => setEditPaymentMethod(e.target.value)}
                     options={INCOMING_PAYMENT_METHODS.map(m => ({ value: m, label: getPaymentMethodLabel(m) }))}
                  />
                  <div className="flex justify-end gap-2 pt-4">
                     <Button type="button" variant="secondary" onClick={() => setIsPaymentEditModalOpen(false)}>Bekor qilish</Button>
                     <Button type="submit">Saqlash</Button>
                  </div>
               </form>
            </Modal>

            {/* Message Modal */}
            <Modal isOpen={isMessageModalOpen} onClose={() => setIsMessageModalOpen(false)} title={t('patients.details.modals.messageTitle')}>
               <form onSubmit={handleSendMessage} className="space-y-4">
                  <Select
                     label={t('patients.details.modals.messageType')}
                     value={messageType}
                     onChange={(e) => {
                        const type = e.target.value;
                        setMessageType(type);

                        if (type === 'Custom') {
                           setMessageText('');
                        } else if (type === 'Tomorrow') {
                           // Find tomorrow's appointment
                           const tomorrow = new Date();
                           tomorrow.setDate(tomorrow.getDate() + 1);
                           const tomorrowStr = tomorrow.toISOString().split('T')[0];
                           const appt = patientAppointments.find(a => a.date === tomorrowStr);

                           if (appt) {
                              // Format date nicely
                              const dateObj = new Date(appt.date);
                              const dayNames = ['Yakshanba', 'Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba'];
                              const monthNames = ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'];
                              const dayName = dayNames[dateObj.getDay()];
                              const day = dateObj.getDate();
                              const month = monthNames[dateObj.getMonth()];

                              setMessageText(`🏥 Qabul eslatmasi\n\nHurmatli ${formatFullName(patient)}!\n\nSizni ertaga, ${day}-${month} (${dayName}) kuni soat ${appt.time} da ${appt.doctorName} qabuliga kutamiz.\n\n📍 Manzil: Klinikamiz\n⏰ Vaqt: ${appt.time}\n👨‍⚕️ Shifokor: ${appt.doctorName}\n\nIltimos, vaqtida kelishingizni so'raymiz.\n\nSavol bo'lsa, biz bilan bog'laning.`);
                           } else {
                              setMessageText(`🏥 Qabul eslatmasi\n\nHurmatli ${formatFullName(patient)}!\n\nSizni ertaga klinikamizga qabulga kutamiz.\n\nIltimos, aniq vaqtni aniqlash uchun biz bilan bog'laning.`);
                           }
                        } else if (type === 'Debt') {
                           const debt = patientTransactions.filter(t => t.status === 'Pending').reduce((acc, t) => acc + t.amount, 0);
                           if (debt > 0) {
                              setMessageText(`💳 To'lov eslatmasi\n\nHurmatli ${formatFullName(patient)}!\n\nSizning ${formatNumber(debt)} UZS miqdorida qarzdorligingiz mavjud.\n\nIltimos, to'lovni amalga oshiring.\n\n📞 To'lov bo'yicha savol bo'lsa, biz bilan bog'laning.`);
                           } else {
                              setMessageText(`✅ To'lovlar\n\nHurmatli ${formatFullName(patient)}!\n\nSizning qarzdorligingiz yo'q.\n\nRahmat!`);
                           }
                        } else if (type === 'Missed') {
                           setMessageText(`⚠️ Qoldirilgan qabul\n\nHurmatli ${formatFullName(patient)}!\n\nSiz bugungi qabulga kelmadingiz.\n\nIltimos, yangi vaqt belgilash uchun biz bilan bog'laning.\n\n📞 Telefon: [klinika telefoni]`);
                        }
                     }}
                     options={[
                        { value: 'Custom', label: t('patients.details.modals.msgCustom') },
                        { value: 'Tomorrow', label: t('patients.details.modals.msgTomorrow') },
                        { value: 'Debt', label: t('patients.details.modals.msgDebt') },
                        { value: 'Missed', label: t('patients.details.modals.msgMissed') }
                     ]}
                  />
                  <div>
                     <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('patients.details.modals.msgText')}</label>
                     <textarea
                        className="w-full border rounded-md p-3 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-white focus:ring-2 focus:ring-primary-500 focus:outline-none"
                        rows={4}
                        placeholder={t('patients.details.modals.msgPlaceholder')}
                        value={messageText}
                        onChange={(e) => setMessageText(e.target.value)}
                        required
                     />
                  </div>
                  <div className="flex justify-end gap-2 pt-4">
                     <Button type="button" variant="secondary" onClick={() => setIsMessageModalOpen(false)}>{t('common.cancel')}</Button>
                     <Button type="submit">{t('patients.details.modals.send')}</Button>
                  </div>
               </form>
            </Modal>

            {/* New Appointment Modal */}
            <Modal isOpen={isApptModalOpen} onClose={() => setIsApptModalOpen(false)} title={t('patients.details.modals.newAppt')}>
               <form onSubmit={handleApptSubmit} className="space-y-4">
                  <Select
                     label={t('patients.details.modals.doctor')}
                     options={doctors.map(d => ({ value: d.id, label: `${formatDoctorName(d)}` }))}
                     value={apptData.doctorId}
                     onChange={(e) => setApptData({ ...apptData, doctorId: e.target.value })}
                  />
                  <div className="grid grid-cols-2 gap-4">
                     <Input label={t('patients.details.modals.date')} type="date" value={apptData.date} onChange={e => setApptData({ ...apptData, date: e.target.value })} required />
                     <Input label={t('patients.details.modals.time')} type="time" value={apptData.time} onChange={e => setApptData({ ...apptData, time: e.target.value })} required />
                  </div>
                  {categories.length > 0 && (
                     <Select
                        label={t('patients.details.modals.serviceCategory')}
                        options={[
                           { value: '', label: t('patients.details.modals.serviceAllCategories') },
                           ...categories.map(c => ({ value: c.id, label: c.name }))
                        ]}
                        value={apptData.categoryId}
                        onChange={(e) => setApptData({ ...apptData, categoryId: e.target.value, type: '' })}
                     />
                  )}
                  <div className="grid grid-cols-2 gap-4">
                     <Select
                        label={t('patients.details.modals.procedureType')}
                        options={services
                           .filter(s => !apptData.categoryId || (s as any).categoryId === apptData.categoryId)
                           .map(s => ({ value: s.name, label: s.name }))}
                        value={apptData.type}
                        onChange={e => {
                           const service = services.find(s => s.name === e.target.value);
                           setApptData({
                              ...apptData,
                              type: e.target.value,
                              duration: service?.duration || apptData.duration
                           });
                        }}
                     />
                     <Input label={t('patients.details.modals.duration')} type="number" value={apptData.duration} onChange={e => setApptData({ ...apptData, duration: Number(e.target.value) })} required />
                  </div>
                  <div>
                     <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('patients.details.modals.notes')}</label>
                     <textarea
                        className="w-full border rounded-md p-3 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-white focus:ring-2 focus:ring-primary-500 focus:outline-none"
                        rows={3}
                        value={apptData.notes}
                        onChange={(e) => setApptData({ ...apptData, notes: e.target.value })}
                     />
                  </div>
                  <div className="flex justify-end gap-2 pt-4">
                     <Button type="button" variant="secondary" onClick={() => setIsApptModalOpen(false)}>{t('common.cancel')}</Button>
                     <Button type="submit">{t('patients.details.modals.book')}</Button>
                  </div>
               </form>
            </Modal>

            {/* Diagnosis Modal */}
            <Modal isOpen={isDiagnosisModalOpen} onClose={() => setIsDiagnosisModalOpen(false)} title={t('patients.details.modals.addDiagnosis')}>
               <form onSubmit={handleAddDiagnosis} className="space-y-4">
                  {!selectedCode ? (
                     <div className="space-y-4">
                        {icd10Query ? (
                           // Show codes within a selected category
                           <div>
                              <div className="flex items-center gap-2 mb-4">
                                 <Button variant="secondary" size="sm" onClick={() => { setIcd10Query(''); setIcd10Results([]); }}>
                                    <ArrowLeft className="w-4 h-4" /> {t('patients.details.modals.back')}
                                 </Button>
                                 <h4 className="font-bold text-gray-900 dark:text-white">{icd10Query}</h4>
                              </div>
                              <div className="space-y-2 max-h-60 overflow-y-auto">
                                 {icd10Results.map(code => (
                                    <div
                                       key={code.code}
                                       className="p-3 border rounded-lg hover:bg-primary-50 dark:hover:bg-primary-900/20 cursor-pointer transition-colors"
                                       onClick={() => setSelectedCode(code)}
                                    >
                                       <div className="font-bold text-primary-600 dark:text-primary-400">{code.code}</div>
                                       <div className="text-sm text-gray-700 dark:text-gray-300">{code.name}</div>
                                    </div>
                                 ))}
                              </div>
                           </div>
                        ) : (
                           // Show Categories
                           <div className="space-y-2">
                              <p className="text-sm text-gray-500 mb-2">{t('patients.details.modals.selectCategory')}:</p>
                              {[
                                 t('patients.details.modals.cat1'),
                                 t('patients.details.modals.cat2'),
                                 t('patients.details.modals.cat3'),
                                 t('patients.details.modals.cat4'),
                                 t('patients.details.modals.cat5')
                              ].map(category => (
                                 <div
                                    key={category}
                                    className="p-4 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer flex justify-between items-center group"
                                    onClick={() => handleSearchICD10(category)}
                                 >
                                    <span className="font-medium text-gray-900 dark:text-white">{category}</span>
                                    <ArrowLeft className="w-4 h-4 rotate-180 text-gray-400 group-hover:text-primary-500 transition-colors" />
                                 </div>
                              ))}
                           </div>
                        )}
                     </div>
                  ) : (
                     // Selected Code Confirmation
                     <div className="space-y-4">
                        <div className="flex items-center justify-between p-4 bg-primary-50 dark:bg-primary-900/20 rounded-lg border border-primary-100 dark:border-primary-800">
                           <div>
                              <p className="font-bold text-primary-800 dark:text-primary-200">{selectedCode.code}</p>
                              <p className="text-sm text-primary-700 dark:text-primary-300">{selectedCode.name}</p>
                           </div>
                           <Button variant="ghost" size="sm" onClick={() => setSelectedCode(null)}>{t('common.change')}</Button>
                        </div>

                        <div>
                           <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('patients.details.modals.notes')}</label>
                           <textarea
                              className="w-full border rounded-md p-3 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-white focus:ring-2 focus:ring-primary-500 focus:outline-none"
                              rows={3}
                              placeholder={t('patients.details.modals.notesPlaceholder')}
                              value={diagnosisNote}
                              onChange={(e) => setDiagnosisNote(e.target.value)}
                           />
                        </div>
                     </div>
                  )}

                  <div className="flex justify-end gap-2 pt-4 border-t dark:border-gray-700">
                     <Button type="button" variant="secondary" onClick={() => { setIsDiagnosisModalOpen(false); setSelectedCode(null); setIcd10Query(''); }}>{t('common.close')}</Button>
                     {selectedCode && <Button type="submit">{t('common.save')}</Button>}
                  </div>
               </form>
            </Modal>
         </div >

         {/* Print Template */}
         < div className="hidden print:block print:p-8 bg-white text-black" >
            <div className="text-center mb-8 border-b-2 border-gray-800 pb-4">
               <h1 className="text-3xl font-bold uppercase tracking-wider mb-2">DentalFlow Clinic</h1>
               <p className="text-sm text-gray-600">Tish davolash va diagnostika markazi</p>
            </div>

            <div className="grid grid-cols-2 gap-8 mb-8">
               <div>
                  <h2 className="text-xs font-bold uppercase text-gray-500 mb-1">Bemor</h2>
                  <p className="text-xl font-bold">{formatFullName(patient)}</p>
                  <p className="text-sm">{showPatientPhone ? patient.phone : maskPhone(patient.phone)}</p>
                  <p className="text-sm">{formatDobDDMMYYYY(patient.dob)} ({calcAge(patient.dob) ?? ''} yosh)</p>
               </div>
               <div className="text-right">
                  <h2 className="text-xs font-bold uppercase text-gray-500 mb-1">Sana</h2>
                  <p className="text-xl font-bold">{formatDate(new Date())}</p>
                  <p className="text-sm">{new Date().toLocaleTimeString('uz-UZ')}</p>
               </div>
            </div>

            {/* Diagnoses Section */}
            {
               diagnoses.length > 0 && (
                  <div className="mb-8">
                     <h3 className="text-lg font-bold border-b border-gray-400 mb-4 pb-1">Tashxislar</h3>
                     <div className="space-y-4">
                        {diagnoses.map(d => (
                           <div key={d.id} className="mb-4">
                              <div className="flex justify-between items-baseline mb-1">
                                 <span className="font-bold text-lg">{d.code} - {d.icd10?.name}</span>
                                 <span className="text-sm text-gray-600">{d.date}</span>
                              </div>
                              <div className="text-sm pl-4 border-l-2 border-gray-300">
                                 {formatDiagnosisNotes(d.notes)}
                              </div>
                           </div>
                        ))}
                     </div>
                  </div>
               )
            }

            {/* Qabul bayoni */}
            <div className="mb-8 break-inside-avoid">
               <h3 className="text-lg font-bold border-b border-gray-400 mb-4 pb-1">Qabul bayoni</h3>
               <EncounterSummary
                  template={templates.find(x => x.id === encounterTemplateId)}
                  value={JSON.stringify(encounterData)}
               />
            </div>

            <div className="mt-12 pt-8 border-t border-gray-300 flex justify-between">
               <div>
                  <p className="text-sm font-bold">Shifokor:</p>
                  <p className="mt-8 border-t border-black w-48 pt-1 text-xs text-center">(Imzo)</p>
               </div>
               <div className="text-right">
                  <p className="text-sm italic">XClinic orqali chop etildi</p>
               </div>
            </div>
         </div >

         {/* Assign Doctor Modal */}
         <Modal isOpen={isAssignDoctorModalOpen} onClose={() => setIsAssignDoctorModalOpen(false)} title={t('patients.details.modals.assignDoctorSelect')}>
            <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
               {doctors.length > 0 ? (
                  doctors.map(doc => (
                     <button
                        key={doc.id}
                        onClick={() => handleAssignDoctor(doc.id)}
                        className={`w-full flex items-center justify-between p-4 rounded-lg border transition-all text-left group
                              ${patient.doctorId === doc.id
                              ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                              : 'border-gray-200 dark:border-gray-700 hover:border-primary-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                           }`}
                     >
                        <div className="flex items-center gap-3">
                           <div className="w-10 h-10 rounded-full bg-primary-100 dark:bg-primary-900/50 flex items-center justify-center text-primary-600 dark:text-primary-400 font-bold">
                              {doc.firstName[0]}{doc.lastName[0]}
                           </div>
                           <div>
                              <p className="font-bold text-gray-900 dark:text-white">Dr. {formatFullName(doc)}</p>
                              <p className="text-xs text-gray-500">{doc.specialty}</p>
                           </div>
                        </div>
                        {patient.doctorId === doc.id && (
                           <div className="bg-primary-500 text-white p-1 rounded-full">
                              <UserCheck className="w-4 h-4" />
                           </div>
                        )}
                     </button>
                  ))
               ) : (
                  <div className="text-center py-8 text-gray-500">
                     {t('patients.details.alerts.doctorNotFound')}
                  </div>
               )}
            </div>
            <div className="flex justify-end pt-4 mt-2 border-t border-gray-100 dark:border-gray-700">
               <Button variant="secondary" onClick={() => setIsAssignDoctorModalOpen(false)}>{t('common.close')}</Button>
            </div>
         </Modal>
         
         <ReceiptModal
            isOpen={isReceiptModalOpen}
            onClose={() => setIsReceiptModalOpen(false)}
            transaction={receiptTransaction}
            clinic={currentClinic}
         />
      </>
   );
};
