import React, { useState, useEffect, useMemo } from 'react';
import { formatMoney, formatNumber, formatDateLong, formatDate, formatDoctorName, formatFullName } from '../utils/format';
import { confirmAction } from '../services/confirm';
import { toast } from '../services/toast';
import { useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Calendar, CreditCard, FileText, User, Activity, Phone, MapPin, Clock, Edit, Printer, Send, Package, UserPlus, UserCheck, Plus, FlaskConical, Stethoscope, Pill, ClipboardList, Image, ChevronRight, Trash2 } from 'lucide-react';
import { Button, Card, Badge, Modal, Input, Select } from '../components/Common';
import { EncounterSummary } from '../components/EncounterForm';
import { PatientPhotos } from '../components/PatientPhotos';
import { PatientHistoryPanel } from '../components/PatientHistoryPanel';
import { PatientDocuments } from '../components/PatientDocuments';
import { LabDynamics } from '../components/LabDynamics';
import { InstallmentsTab } from '../components/InstallmentsTab';
import { VisitPanel, VISIT_STATUS_KEY } from '../components/VisitPanel';
import { ChargePaymentModal } from '../components/ChargePaymentModal';
import { AdvanceModal } from '../components/AdvanceModal';
import { PatientFormModal } from '../components/PatientFormModal';
import { printPrescription } from '../utils/printForms';
import { Patient, Appointment, Transaction, Doctor, Service, ICD10Code, PatientDiagnosis, Clinic, InventoryLog, InventoryItem, ServiceCategory, UserRole, Visit, Department, EncounterTemplate, Prescription, VisitCharge } from '../types';
import { api, getFileUrl, getStoredClinicId, getAuthToken } from '../services/api';
import { useLanguage } from '../context/LanguageContext';
import { formatDobDDMMYYYY, calcAge, todayISO } from '../utils/dateUtils';
import { INCOMING_PAYMENT_METHODS, getPaymentMethodLabel } from '../utils/paymentMethods';
import { maskPhone } from '../utils/accessControl';
import { printPatientCard } from '../utils/printPatientCard';

import { ReceiptModal } from '../components/ReceiptModal';

interface PatientDetailsProps {
   /* IXTIYORIY: komponent uni URL dan ham oladi
      (`patientIdProp || patientIdParam`). Marshrut orqali ochilganda
      prop umuman uzatilmaydi. */
   patientId?: string | null;
   /* IXTIYORIY, chunki pastda standart qiymat berilgan (`patients = []`).

      Ilgari ular TALAB QILINADIGAN deb e'lon qilingan edi, ya'ni
      standart qiymat hech qachon ishlamaydigan o'lik kod edi.
      `strictNullChecks` yoqilganda TypeScript shu ziddiyatni ko'radi
      va turni `never` ga siqadi — natijada `p.id` ga murojaat
      «Property 'id' does not exist on type 'never'» beradi. Shu bitta
      nomuvofiqlik faqat mana shu faylda 147 ta xato keltirardi.

      To'g'ri yechim standart qiymatni olib tashlash emas: komponent
      ro'yxatsiz ham ishlashi kerak (ma'lumot hali yuklanmagan bo'lishi
      mumkin). Shuning uchun e'lon haqiqatga moslashtiriladi. */
   patients?: Patient[];
   appointments?: Appointment[];
   transactions?: Transaction[];
   doctors?: Doctor[];
   services?: Service[];
   categories?: ServiceCategory[];
   currentClinic?: Clinic;
   userRole?: UserRole;
   doctorId?: string; // Kirgan shifokor (DOCTOR roli) — shifokor tanlovlarida defolt
   showPatientPhone?: boolean; // Ruxsatlar: bemor telefon raqamini ko'rsatish
   onBack: () => void;
   onUpdatePatient: (id: string, data: Partial<Patient>) => void;
   onAddAppointment: (appt: Omit<Appointment, 'id' | 'clinicId'>) => Promise<void>;
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
   onBack, onUpdatePatient, onAddAppointment, onUpdateAppointment
}) => {
   const { patientId: patientIdParam } = useParams<{ patientId: string }>();
   const patientId = patientIdProp || patientIdParam || null;
   /* `?visit=` — «Mening navbatim» dan yoki eski `/visit/:id` havolasidan
      kelgan aniq qabul. Bo'lmasa bugungi ochiq qabul o'zi tanlanadi. */
   const [searchParams] = useSearchParams();
   const requestedVisitId = searchParams.get('visit');
   const { t } = useLanguage();

   /* TARIX BO'LIMLARI. Ilgari bu vkladkalar edi va ular butun ekranni
      egallardi: shifokor tarixni ochsa joriy qabulni ko'rmasdi, qabulni
      ochsa tarixni. Endi qabul o'ng ustunda DOIM turadi, tarix bo'limi esa
      pastda, to'liq kenglikda ochiladi. `null` — hech biri ochilmagan. */
   type HistorySection =
      | 'visits' | 'diagnoses' | 'labs' | 'photos' | 'prescriptions'
      | 'appointments' | 'payments' | 'materials' | 'installments'
      | 'documents' | 'anamnesis';
   const [openSec, setOpenSec] = useState<HistorySection | null>(null);
   /* Panelga tushadigan qabul. Standart — bugungi ochiq qabul; tarixdagi
      eski qabulni bosib ko'rish ham mumkin. */
   const [panelVisitId, setPanelVisitId] = useState<string | null>(null);
   const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
   /* To'lanmagan hisob qatorlari — kassa bilan BITTA manba (`VisitCharge`).
      Ilgari karta buni kalendar yozuvlaridan taxmin qilardi. */
   const [unpaidCharges, setUnpaidCharges] = useState<VisitCharge[]>([]);
   const [isChargeModalOpen, setIsChargeModalOpen] = useState(false);
   /* Avans — alohida, kichik oyna. Xizmat uchun to'lov EMAS. */
   const [isAdvanceOpen, setIsAdvanceOpen] = useState(false);
   const [isEditModalOpen, setIsEditModalOpen] = useState(false);


   const patient = patients.find(p => String(p.id).trim() === String(patientId).trim());

   // DOCTOR roli bilan kirilgan bo'lsa — shifokor tanlovlarida o'zi defolt tanlanadi
   const myDoctor = userRole === UserRole.DOCTOR && loggedDoctorId ? doctors.find(d => d.id === loggedDoctorId) : undefined;
   const defaultDoctorId = myDoctor?.id || '';

   // Edit Form State
   // Payment Form State

   // Chegirmadan keyingi jami summa (asl narx ma'lum bo'lganda)

   // Installment quick-open state (from appointment row)

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

   // Payment Edit State

   // Material Usage State
   const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
   const [materialLogs, setMaterialLogs] = useState<InventoryLog[]>([]);
   const [isMaterialModalOpen, setIsMaterialModalOpen] = useState(false);
   const [materialData, setMaterialData] = useState({ itemId: '', quantity: '', note: '' });

   // Prevents double submission

   // Manual Payment Selection State

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

   /* BOSMA KARTA UCHUN BAYON. Ilgari bu alohida holatda («chart» vkladkasi)
      turardi va u ochiq qabulga bog'lanmagan edi: saqlaganda jimgina YANGI
      qabul yaratilardi — shifokorsiz va navbat raqamisiz. Endi bayon
      panelga tushgan qabuldan o'qiladi, ya'ni bitta manba. */
   const unpaidTotal = React.useMemo(
      () => unpaidCharges.reduce((sum, c) => sum + (c.total - (c.paidAmount || 0)), 0),
      [unpaidCharges]);

   const panelVisit = React.useMemo(
      () => visits.find(v => v.id === panelVisitId) || null, [visits, panelVisitId]);
   const panelEncounterData = React.useMemo(() => {
      try { return panelVisit?.examData ? JSON.parse(panelVisit.examData) : {}; }
      catch { return {}; }
   }, [panelVisit]);
   const panelTemplate = React.useMemo(
      () => templates.find(x => x.id === panelVisit?.templateId), [templates, panelVisit]);


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
            if (!patient) return;
         onUpdatePatient(patient.id, { [type === 'avatar' ? 'avatarUrl' : 'portraitUrl']: res.url });
            toast.error(t('common.save'));
         }
      } catch (error) {
         console.error(`Failed to upload ${type}:`, error);
         toast.error(t('patients.details.alerts.error'));
      }
   };


   /* Klinik ma'lumotni qayta o'qish. `VisitPanel` har o'zgarishdan keyin
      shuni chaqiradi: tashxis qo'shilsa chap ustundagi ro'yxat ham,
      qabullar ro'yxati ham darhol yangilanishi kerak. */
   const reloadClinical = React.useCallback((keepVisitId?: string | null) => {
      if (!patientId) return;
      api.diagnoses.getByPatient(patientId).then(setDiagnoses).catch(console.error);
      api.prescriptions.getAll(patientId).then(setPrescriptions).catch(() => setPrescriptions([]));
      api.charges.getAll({ patientId, status: 'Unpaid' })
         .then(cs => setUnpaidCharges(cs || [])).catch(() => setUnpaidCharges([]));
      api.visits.getAll({ patientId }).then(vs => {
         setVisits(vs);
         /* Panelga BUGUNGI ochiq qabul tushadi. Kechagi tugallanmagan
            qabul o'z-o'zidan ochilmasligi kerak: shifokor bugungi ish
            bilan shug'ullanadi, eskisini tarixdan ataylab ochadi. */
         setPanelVisitId(prev => {
            if (keepVisitId !== undefined) return keepVisitId;
            if (prev && vs.some(v => v.id === prev)) return prev;
            const today = todayISO();
            const open = vs.find(v => v.date === today && v.status !== 'Completed' && v.status !== 'Cancelled');
            return open ? open.id : null;
         });
      }).catch(console.error);
   }, [patientId]);

   useEffect(() => {
      if (patientId) {
         setPanelVisitId(requestedVisitId || null);
         api.departments.getAll().then(setDepartments).catch(console.error);
         reloadClinical();
         /* `patient.id` uzatiladi — server bemorga mos kelmaydigan
            shablonlarni chiqarib tashlaydi (jins va yosh, B-09). */
         api.encounterTemplates.getAll(undefined, patient?.id).then(setTemplates).catch(console.error);

         // Fetch inventory data
         if (currentClinic) {
            api.inventory.getAll(currentClinic.id).then(setInventoryItems).catch(console.error);
            api.inventory.getLogs(currentClinic?.id ?? undefined, patientId).then(setMaterialLogs).catch(console.error);
         }
      }
   }, [patientId, currentClinic, reloadClinical, requestedVisitId]);

   const [isAssignDoctorModalOpen, setIsAssignDoctorModalOpen] = useState(false);

   const handleAssignDoctor = (doctorId: string) => {
      const selectedDoctor = doctors.find(d => d.id === doctorId);
      if (selectedDoctor && patient) {
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
            userName: myDoctor ? `${myDoctor.firstName} ${myDoctor.lastName}`.trim() : undefined,
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

   const handleEditOpen = () => setIsEditModalOpen(true);





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
         notes: apptData.notes
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
                        encounter: { data: panelEncounterData, template: panelTemplate },
                        diagnoses,
                        procedures: pastProcedures,
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
                           {/* AVANS va QARZ — ikki BOSHQA narsa.

                               Ilgari bitta chipda edi: musbat balans «avans»,
                               manfiy «qarz». Lekin `Patient.balance` MANFIY
                               BO'LMAYDI — u faqat avans (`backend/snapshot.ts`
                               dagi izoh ham shuni aytadi), ya'ni «Qarz»
                               shoxobchasi hech qachon ishlamagan.

                               Haqiqiy qarz — to'lanmagan hisob qatorlari
                               yig'indisi, u shu yerda alohida ko'rsatiladi. */}
                           {(patient.balance || 0) > 0 && (
                              <div className="px-3 py-1 rounded-full text-xs font-bold border bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800">
                                 {t('advance.title')}: {formatMoney(patient.balance || 0)} UZS
                              </div>
                           )}
                           {unpaidTotal > 0 && (
                              <button type="button" onClick={() => setOpenSec('payments')}
                                 className="px-3 py-1 rounded-full text-xs font-bold border bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-900/50">
                                 {t('visit.due')}: {formatMoney(unpaidTotal)} UZS
                              </button>
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

            {/* ── ISH MAYDONI ───────────────────────────────────────────────
                Chapda «avval nima bo'lgan», o'ngda «hozir nima qilinmoqda».
                Ilgari bu ikkisi bitta ekranga sig'masdi: tarix vkladkalarda
                edi, joriy qabul esa butunlay boshqa sahifada (`/visit/:id`)
                va kartadan unga havola YO'Q edi. */}
            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,340px)_minmax(0,1fr)] gap-6 items-start">

               {/* ── CHAP: tarix ────────────────────────────────────────── */}
               <div className="space-y-4">
                  {/* Allergiya, surunkali kasalliklar va BOSHQA bo'limlardagi
                      qabullar — dori yoki tahlil buyurishdan OLDIN ko'rinadi. */}
                  <PatientHistoryPanel
                     patientId={patient.id}
                     canEdit={userRole === UserRole.CLINIC_ADMIN || userRole === UserRole.DOCTOR}
                     addToast={(_t, msg) => toast.error(msg)}
                  />

                  {/* Tashxislar — qisqacha. To'liq ro'yxat pastdagi bo'limda. */}
                  <Card className="p-4">
                     <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white mb-3">
                        <ClipboardList className="w-4 h-4 text-gray-400" /> {t('card.secDiagnoses')}
                     </h3>
                     {diagnoses.length === 0 ? (
                        <p className="text-sm text-gray-400 dark:text-gray-500">{t('card.noDiagnoses')}</p>
                     ) : (
                        <div className="flex flex-wrap gap-1.5">
                           {diagnoses.slice(0, 6).map(d => (
                              <span key={d.id} className="px-2 py-0.5 rounded-lg bg-gray-100 dark:bg-gray-700 text-xs text-gray-800 dark:text-gray-200">
                                 <b>{d.code}</b>{d.isChronic ? ' ·' : ''}
                                 {d.isChronic && <span className="text-amber-600 dark:text-amber-400"> {t('visit.chronic')}</span>}
                              </span>
                           ))}
                           {diagnoses.length > 6 && (
                              <button onClick={() => setOpenSec('diagnoses')} className="px-2 py-0.5 text-xs text-primary-600 dark:text-primary-400 hover:underline">
                                 +{diagnoses.length - 6}
                              </button>
                           )}
                        </div>
                     )}
                  </Card>

                  {/* Bo'limlar ro'yxati — bosilganda pastda to'liq kenglikda ochiladi */}
                  <Card className="p-2">
                     <p className="px-2 pt-1 pb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">{t('card.historyTitle')}</p>
                     <nav className="flex flex-col">
                        {([
                           ['visits', Stethoscope, t('card.secVisits'), visits.length],
                           ['diagnoses', ClipboardList, t('card.secDiagnoses'), diagnoses.length],
                           ['labs', FlaskConical, t('card.secLabs'), null],
                           ['prescriptions', Pill, t('card.secPrescriptions'), prescriptions.length],
                           ['photos', Image, t('card.secPhotos'), null],
                           ['appointments', Calendar, t('card.secAppointments'), patientAppointments.length],
                           ['payments', CreditCard, t('card.secPayments'), patientTransactions.length],
                           ['installments', Clock, t('card.secInstallments'), null],
                           ['materials', Package, t('card.secMaterials'), materialLogs.length],
                           ['documents', FileText, t('card.secDocuments'), null],
                           ['anamnesis', Activity, t('card.secAnamnesis'), null],
                        ] as [HistorySection, React.ElementType, string, number | null][]).map(([id, Icon, label, count]) => (
                           <button key={id} onClick={() => setOpenSec(openSec === id ? null : id)}
                              className={`flex items-center gap-2.5 px-2 py-2 rounded-lg text-sm text-left transition-colors ${openSec === id
                                 ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 font-medium'
                                 : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50'}`}>
                              <Icon className={`w-4 h-4 shrink-0 ${openSec === id ? 'text-primary-500' : 'text-gray-400'}`} />
                              <span className="flex-1 min-w-0 truncate">{label}</span>
                              {count !== null && count > 0 && (
                                 <span className="text-xs tabular-nums text-gray-400">{count}</span>
                              )}
                              <ChevronRight className={`w-3.5 h-3.5 shrink-0 transition-transform ${openSec === id ? 'rotate-90 text-primary-500' : 'text-gray-300'}`} />
                           </button>
                        ))}
                     </nav>
                  </Card>
               </div>

               {/* ── O'NG: joriy qabul ──────────────────────────────────── */}
               {/* Tashxis, tahlil, UZI, retsept, xizmat va yakunlash — hammasi
                   shu panelda. Bemor kartadan chiqmaydi. */}
               <VisitPanel
                  patient={patient}
                  visitId={panelVisitId}
                  departments={departments}
                  services={services}
                  doctors={doctors}
                  currentUserName={myDoctor ? formatDoctorName(myDoctor) : undefined}
                  userRole={userRole}
                  loggedDoctorId={loggedDoctorId}
                  addToast={(type, msg) => type === 'error' ? toast.error(msg) : toast.success(msg)}
                  onVisitChanged={(id) => reloadClinical(id === undefined ? undefined : id)}
               />
            </div>

            {/* ── Ochilgan tarix bo'limi — to'liq kenglikda ────────────────── */}
            {openSec && (
               <div className="space-y-6">

               {openSec === 'documents' && (
                  <div className="space-y-6">
                  {/* Rozilik, shartnoma, ma'lumotlarga rozilik — qonun talabi
                      (25 va 26-moddalar, ЗРУ-547). Ilgari tizimda imzolanadigan
                      birorta qog'oz yo'q edi. */}
                  <PatientDocuments
                     patientId={patient.id}
                     canCreate={userRole !== UserRole.LAB_TECHNICIAN}
                     addToast={(_t, msg) => toast.error(msg)}
                  />
                  </div>
               )}

               {/* ── Anamnez ─────────────────────────────────────────────── */}
               {openSec === 'anamnesis' && (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
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
               )}

               {/* ── Qabullar tarixi ─────────────────────────────────────────
                   Har qator — bosiladigan: o'ng ustundagi panel o'sha qabulni
                   ko'rsatadi. Ilgari kartadan qabulga o'tish yo'li YO'Q edi. */}
               {openSec === 'visits' && (
                  <Card className="p-0 overflow-hidden">
                     {visits.length === 0 ? (
                        <p className="p-8 text-center text-gray-500">{t('card.noVisits')}</p>
                     ) : (
                        <div className="divide-y divide-gray-200 dark:divide-gray-700">
                           {visits.map(v => {
                              const isOpenVisit = v.status !== 'Completed' && v.status !== 'Cancelled';
                              return (
                                 <button key={v.id} onClick={() => { setPanelVisitId(v.id); setOpenSec(null); }}
                                    className={`w-full flex flex-wrap items-center gap-3 p-4 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors ${panelVisitId === v.id ? 'bg-primary-50 dark:bg-primary-900/20' : ''}`}>
                                    <span className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-700 grid place-items-center text-sm font-bold text-gray-600 dark:text-gray-300 shrink-0">
                                       {v.queueNumber ?? '—'}
                                    </span>
                                    <span className="min-w-0 flex-1">
                                       <span className="block text-sm font-medium text-gray-900 dark:text-white truncate">
                                          {v.department?.name || departments.find(d => d.id === v.departmentId)?.name || t('visit.noDept')}
                                          {v.doctorName ? ` · ${v.doctorName}` : ''}
                                       </span>
                                       <span className="block text-xs text-gray-500 dark:text-gray-400 truncate">
                                          {formatDate(v.date)}{v.complaints ? ` · ${v.complaints}` : ''}
                                       </span>
                                    </span>
                                    {isOpenVisit && (
                                       <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                                          {t('card.openVisitBadge')}
                                       </span>
                                    )}
                                    <span className="text-xs text-gray-500 dark:text-gray-400">{t(VISIT_STATUS_KEY[v.status] || 'visit.status.Waiting')}</span>
                                    <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
                                 </button>
                              );
                           })}
                        </div>
                     )}
                  </Card>
               )}

               {/* ── Tashxislar ─────────────────────────────────────────────── */}
               {openSec === 'diagnoses' && (
                  <Card className="p-0 overflow-hidden">
                     {diagnoses.length === 0 ? (
                        <p className="p-8 text-center text-gray-500">{t('card.noDiagnoses')}</p>
                     ) : (
                        <div className="divide-y divide-gray-200 dark:divide-gray-700">
                           {diagnoses.map(d => (
                              <div key={d.id} className="flex flex-wrap items-center gap-3 p-4">
                                 <span className="min-w-0 flex-1">
                                    <span className="block text-sm text-gray-900 dark:text-white">
                                       <b>{d.code}</b>{d.icd10?.name ? ` — ${d.icd10.name}` : ''}
                                    </span>
                                    {d.notes && <span className="block text-xs text-gray-500 dark:text-gray-400">{formatDiagnosisNotes(d.notes)}</span>}
                                 </span>
                                 {d.isChronic && (
                                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                                       {t('visit.chronic')}
                                    </span>
                                 )}
                                 <span className="text-xs text-gray-500 dark:text-gray-400">{formatDate(d.date)}</span>
                                 {userRole !== UserRole.LAB_TECHNICIAN && (
                                    <button onClick={() => handleDeleteDiagnosis(d.id)} aria-label={t('common.delete')}
                                       className="p-1 text-gray-300 hover:text-red-500">
                                       <Trash2 className="w-4 h-4" />
                                    </button>
                                 )}
                              </div>
                           ))}
                        </div>
                     )}
                  </Card>
               )}

               {/* ── Retseptlar ──────────────────────────────────────────────
                   Retsept yozilardi, lekin uni ko'rish va chop etish
                   IMKONI YO'Q edi: bemor qo'lida hech narsasiz chiqib ketardi. */}
               {openSec === 'prescriptions' && (
                  <Card className="p-0 overflow-hidden">
                     {prescriptions.length === 0 ? (
                        <p className="p-8 text-center text-gray-500">{t('card.noPrescriptions')}</p>
                     ) : (
                        <div className="divide-y divide-gray-200 dark:divide-gray-700">
                           {prescriptions.map(rx => (
                              <div key={rx.id} className="flex flex-wrap items-center gap-3 p-4">
                                 <Pill className="w-4 h-4 text-gray-400 shrink-0" />
                                 <span className="min-w-0 flex-1">
                                    <span className="block text-sm text-gray-900 dark:text-white">
                                       {(rx.items || []).map(i => i.name).filter(Boolean).join(', ') || t('visit.prescription')}
                                    </span>
                                    <span className="block text-xs text-gray-500 dark:text-gray-400">
                                       {formatDate(rx.date)}{rx.doctorName ? ` · ${rx.doctorName}` : ''}
                                    </span>
                                 </span>
                                 <Button variant="secondary" size="sm"
                                    onClick={() => printPrescription({ ...rx, patient }, currentClinic)}>
                                    <Printer className="w-4 h-4 mr-2" /> {t('common.print')}
                                 </Button>
                              </div>
                           ))}
                        </div>
                     )}
                  </Card>
               )}

               {/* Tahlil dinamikasi (reliz 6+) */}
               {openSec === 'labs' && (
                  <LabDynamics patientId={patient.id} />
               )}

               {/* Photos Tab */}
               {openSec === 'photos' && (
                  <PatientPhotos patientId={patient.id} clinicId={patient.clinicId} token={token} />
               )}

               {/* Appointments Tab */}
               {openSec === 'appointments' && (
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
               {openSec === 'payments' && (
                  <div className="space-y-6">
                     {/* ── TO'LANMAGAN QATORLAR ──────────────────────────────
                         Ilgari bu ro'yxat KALENDAR YOZUVLARIDAN yasalardi:
                         «yakunlangan yozuv bor, o'sha SANADA to'lov yo'q =
                         qarz». Uch xato birdan: summa yozuv izohidan regexp
                         bilan ajratilardi, boshqa kuni to'langan qarz
                         «to'lanmagan» bo'lib turaverardi, va kassadagi
                         haqiqiy hisob qatorlari (`VisitCharge`) bu yerda
                         umuman ko'rinmasdi — shifokor kartada bir qarzni,
                         kassir esa boshqasini ko'rardi.

                         Endi manba bitta: kassa nimani ko'rsa, karta ham
                         shuni ko'radi. */}
                     <Card className="overflow-hidden border-yellow-200 dark:border-yellow-800">
                        <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border-b border-yellow-100 dark:border-yellow-800 flex flex-wrap justify-between items-center gap-3">
                           <div>
                              <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                 <FileText className="w-5 h-5 text-yellow-600" /> {t('patients.details.payments.pendingTitle')}
                              </h3>
                              <p className="text-sm text-gray-500">{t('card.unpaidDesc')}</p>
                           </div>
                           {unpaidCharges.length > 0 && (
                              <div className="flex flex-wrap items-center gap-3">
                                 <span className="text-sm text-gray-600 dark:text-gray-300">
                                    {t('visit.due')}: <b className="tabular-nums text-red-600 dark:text-red-400">
                                       {formatMoney(unpaidTotal)} UZS
                                    </b>
                                 </span>
                                 <Button size="sm" onClick={() => setIsChargeModalOpen(true)}>
                                    <CreditCard className="w-4 h-4 mr-2" /> {t('card.takePayment')}
                                 </Button>
                                 <Button size="sm" variant="secondary"
                                    className="bg-purple-50 text-purple-700 border-purple-100 dark:bg-purple-900/20 dark:text-purple-300 dark:border-purple-800"
                                    /* Bo'limni ochamiz, xolos. Ilgari bu yerdan
                                       rejaga TAYYOR summa uzatilardi — ya'ni qarz
                                       matn va son sifatida ko'chirilardi. Endi reja
                                       qatorlarning O'ZINI tanlaydi. */
                                    onClick={() => setOpenSec('installments')}>
                                    {t('card.secInstallments')}
                                 </Button>
                              </div>
                           )}
                        </div>
                        <div className="overflow-x-auto">
                           <table className="w-full text-left text-sm">
                              <thead className="bg-gray-50 dark:bg-gray-800">
                                 <tr>
                                    <th className="p-4 font-medium text-gray-500">{t('patients.details.appointments.table.date')}</th>
                                    <th className="p-4 font-medium text-gray-500">{t('patients.details.appointments.table.procedure')}</th>
                                    <th className="p-4 font-medium text-gray-500">{t('common.doctor')}</th>
                                    <th className="p-4 font-medium text-gray-500 text-right">{t('common.total')}</th>
                                    <th className="p-4 font-medium text-gray-500 text-right">{t('visit.paid')}</th>
                                    <th className="p-4 font-medium text-gray-500 text-right">{t('visit.due')}</th>
                                 </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                 {unpaidCharges.map(c => (
                                    <tr key={c.id} className="hover:bg-yellow-50/50 dark:hover:bg-yellow-900/10 transition-colors">
                                       <td className="p-4 text-gray-900 dark:text-white whitespace-nowrap">
                                          {c.createdAt ? formatDate(new Date(c.createdAt)) : '—'}
                                       </td>
                                       <td className="p-4 text-gray-600 dark:text-gray-300">
                                          {c.name}
                                          {c.quantity > 1 && <span className="text-xs text-gray-400"> ×{c.quantity}</span>}
                                       </td>
                                       <td className="p-4 text-gray-600 dark:text-gray-300">{c.doctorName || '—'}</td>
                                       <td className="p-4 text-right tabular-nums text-gray-900 dark:text-white">{formatMoney(c.total)}</td>
                                       <td className="p-4 text-right tabular-nums text-emerald-600 dark:text-emerald-400">{formatMoney(c.paidAmount || 0)}</td>
                                       <td className="p-4 text-right tabular-nums font-medium text-red-600 dark:text-red-400">
                                          {formatMoney(c.total - (c.paidAmount || 0))}
                                       </td>
                                    </tr>
                                 ))}
                              </tbody>
                           </table>
                        </div>
                        {unpaidCharges.length === 0 && (
                           <div className="p-8 text-center text-gray-500">{t('patients.details.payments.pendingEmpty')}</div>
                        )}
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
                              {/* Faqat AVANS. «Yangi to'lov» tugmasi olib
                                  tashlandi: xizmat uchun to'lov yuqoridagi
                                  «To'lov qabul qilish» orqali, hisob qatorlari
                                  bilan ketadi — shundagina shifokor ulushi
                                  hisoblanadi. */}
                              {userRole !== UserRole.DOCTOR && (
                                 <Button size="sm" variant="secondary"
                                    className="bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-emerald-200"
                                    onClick={() => setIsAdvanceOpen(true)}>
                                    <Plus className="w-4 h-4 mr-2" /> {t('advance.title')}
                                 </Button>
                              )}
                           </div>
                        </div>
                        <div className="overflow-x-auto">
                           <table className="w-full text-left text-sm">
                              <thead className="bg-gray-50 dark:bg-gray-800">
                                 <tr><th className="p-4 font-medium text-gray-500">{t('finance.table.date')}</th><th className="p-4 font-medium text-gray-500">{t('finance.table.service')}</th><th className="p-4 font-medium text-gray-500">{t('finance.table.method')}</th><th className="p-4 font-medium text-gray-500">{t('finance.table.amount')}</th><th className="p-4 font-medium text-gray-500">{t('finance.table.discount')}</th><th className="p-4 font-medium text-gray-500">{t('finance.table.status')}</th><th className="p-4 font-medium text-gray-500">{t('patients.details.payments.receivedBy')}</th></tr>
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
                                       {/* Chek TAHRIRLANMAYDI, lekin CHOP
                                           ETILADI. Ilgari bu yerda summani va
                                           usulni o'zgartirish tugmasi turardi —
                                           kassadagi hujjatni keyin qayta yozish
                                           klassik teshik. Xato chek kassada
                                           qaytarish bilan yopiladi, u esa iz
                                           qoldiradi. */}
                                       <td className="p-4">
                                          <div className="flex items-center gap-2">
                                             <span className="text-xs text-gray-400">{transaction.receivedByName || '—'}</span>
                                             <button type="button" title={t('common.print')} aria-label={t('common.print')}
                                                onClick={() => { setReceiptTransaction(transaction); setIsReceiptModalOpen(true); }}
                                                className="p-1 text-gray-300 hover:text-primary-600 rounded">
                                                <Printer className="w-4 h-4" />
                                             </button>
                                          </div>
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
               {openSec === 'installments' && patient && currentClinic && (
                  <InstallmentsTab
                     patientId={patient.id}
                     clinicId={currentClinic.id}
                     doctors={doctors}
                     currentUserName={myDoctor ? formatDoctorName(myDoctor) : undefined}
                  />
               )}
               
               {openSec === 'materials' && (
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
                                                         api.inventory.getLogs(currentClinic.id, patientId ?? undefined),
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
            )}

            {/* ── TO'LOV OYNASI ─────────────────────────────────────────────
                Kassadagi bilan AYNAN BIR XIL oyna (`ChargePaymentModal`):
                qatorlarni belgilash, qisman to'lov, usullarga bo'lish,
                chegirma va qaytarish. Ilgari kartada o'zining alohida
                oynasi bor edi va u `Transaction` ga to'g'ridan-to'g'ri
                yozardi — ya'ni hisob qatori to'lanmagan bo'lib qolaverardi. */}
            <AdvanceModal
               isOpen={isAdvanceOpen}
               onClose={() => setIsAdvanceOpen(false)}
               patient={patient}
               receivedByName={myDoctor ? formatDoctorName(myDoctor) : undefined}
               addToast={(type, msg) => type === 'error' ? toast.error(msg) : toast.success(msg)}
               onDone={() => reloadClinical()}
            />

            <ChargePaymentModal
               isOpen={isChargeModalOpen}
               onClose={() => setIsChargeModalOpen(false)}
               patientName={formatFullName(patient)}
               charges={unpaidCharges}
               patientId={patient.id}
               receivedByName={myDoctor ? formatDoctorName(myDoctor) : undefined}
               role={userRole}
               addToast={(type, msg) => type === 'error' ? toast.error(msg) : toast.success(msg)}
               onDone={() => { setIsChargeModalOpen(false); reloadClinical(); }}
            />

            {/* Edit Modal */}
            {/* Bemor ma'lumotlari — YAGONA forma (`PatientFormModal`).

                Bu yerda o'zining oynasi turardi va unda ATIGI 5 maydon bor
                edi: ism, familiya, ikki telefon va manzil. Ya'ni tug'ilgan
                sanani ham, JINSNI ham kartadan o'zgartirib bo'lmasdi —
                holbuki tahlil normalari aynan shu ikkisidan tanlanadi va
                xato kiritilgan jins butun laboratoriya natijasini
                «normadan chetda» deb ko'rsatib turardi.

                JSHSHIR va karta raqami ham shu yerda. */}
            <PatientFormModal
               isOpen={isEditModalOpen}
               onClose={() => setIsEditModalOpen(false)}
               patient={patient}
               onUpdate={onUpdatePatient}
               doctors={doctors}
               onSaved={() => setIsEditModalOpen(false)}
            />


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
            {/* TO'LOV OYNALARI OLIB TASHLANDI.

                Bu yerda o'zining to'lov oynasi va chekni tahrirlash oynasi
                bor edi. Ikkalasi `POST /api/transactions` ga to'g'ridan-
                to'g'ri yozardi — hisob qatorisiz va `ChargePayment` siz.
                Oqibati: shifokor ulushi (`backend/payroll.ts`) va
                «Shifokorlar» hisoboti FAQAT `ChargePayment` ni o'qiydi,
                ya'ni shu oynadan olingan pul bo'yicha ulush NOL bo'lardi.
                Jimgina.

                Qisman to'lovda oyna ikkita chek yozardi, ikkinchisi
                `status: 'Pending'` bilan — qarzning UCHINCHI ta'rifi
                (qolgan ikkitasi: to'lanmagan qatorlar va yozuv izohidagi
                matn).

                Endi xizmat uchun to'lov faqat `ChargePaymentModal` orqali
                (yuqoridagi «To'lov qabul qilish»), avans esa
                `AdvanceModal` orqali ketadi. */}

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
                                 {formatDiagnosisNotes(d.notes || '')}
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
                  template={panelTemplate}
                  value={JSON.stringify(panelEncounterData)}
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
