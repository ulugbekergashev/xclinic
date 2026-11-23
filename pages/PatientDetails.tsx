import React, { useState, useEffect, useMemo, useRef } from 'react';
import { formatMoney, formatDate, formatDoctorName, formatFullName } from '../utils/format';
import { getPaymentMethodLabel } from '../utils/paymentMethods';
import { confirmAction } from '../services/confirm';
import { toast } from '../services/toast';
import { useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CreditCard, Printer, UserCheck, Plus, Pill, Trash2, Search, ChevronRight, FlaskConical, Scan } from 'lucide-react';
import { Button, Card, Badge, Modal, Input, Select } from '../components/Common';
import { EncounterSummary } from '../components/EncounterForm';
import { PatientPhotos } from '../components/PatientPhotos';
import { ProfileCard } from '../components/patient/ProfileCard';
import { PatientTimeline } from '../components/patient/PatientTimeline';
import { Anamnesis, ClinicalSummary } from '../components/patient/Anamnesis';
import type { AnamnesisData } from '../components/patient/anamnesisData';
import { anamnesisLines } from '../components/patient/anamnesisText';
import type { TimelineStay } from '../utils/patientTimeline';
import { PatientDocuments } from '../components/PatientDocuments';
import { LabDynamics } from '../components/LabDynamics';
import { InstallmentsTab } from '../components/InstallmentsTab';
import { VisitPanel, VisitSheetState, AddKind } from '../components/VisitPanel';
import { ChargePaymentModal } from '../components/ChargePaymentModal';
import { ServicePaymentModal } from '../components/ServicePaymentModal';
import { PatientFormModal } from '../components/PatientFormModal';
import { AppointmentFormModal } from '../components/AppointmentFormModal';
import { SendMessageModal } from '../components/SendMessageModal';
import { printPrescription } from '../utils/printForms';
import { Patient, Appointment, Transaction, Doctor, Service, ICD10Code, PatientDiagnosis, Clinic, ServiceCategory, UserRole, Visit, Department, EncounterTemplate, Prescription, VisitCharge, LabOrder, DiagnosticStudy } from '../types';
import { api, getStoredClinicId, getAuthToken } from '../services/api';
import { useResourceSync } from '../hooks/useDataSync';
import { useLanguage, fill } from '../context/LanguageContext';
import { formatDobDDMMYYYY, calcAge, todayISO } from '../utils/dateUtils';
import type { TranslationKey } from '../i18n/translations';
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
   /** Kirgan odamning ismi — to'lov chekida «Kassir». Ilgari kartadan olingan
    *  pulda kassir bo'sh (yoki shifokor ismi) yozilardi. */
   currentUserName?: string;
   showPatientPhone?: boolean; // Ruxsatlar: bemor telefon raqamini ko'rsatish
   onBack: () => void;
   onUpdatePatient: (id: string, data: Partial<Patient>, opts?: { silent?: boolean }) => void | Promise<void>;
   onAddAppointment: (appt: Omit<Appointment, 'id' | 'clinicId'>) => Promise<void>;
   onUpdateAppointment: (id: string, data: Partial<Appointment>) => Promise<void>;
   /** Ro'yxatda yo'q bemor serverdan olindi — App uni o'z ro'yxatiga qo'shadi */
   onPatientLoaded?: (p: Patient) => void;
}

/* KARTA TABLARI — sarlavha ostida bitta qator, oddiy so'zlar bilan.

   2026-11-20 gacha bu yerda «Daftarlar» degan o'nta kichik tugma bor edi:
   ular chap ustunning eng pastida turardi va har biri OYNA ochardi. Klinika
   egasi: «daftarlar degani nima? nega oyna chiqadi? bular tepada tab
   bo'lishi kerak edi». To'g'ri — oyna ortida karta ko'rinmay qolardi,
   «Daftarlar» so'zi esa hech narsani anglatmasdi.

   Endi: «Qabul» (bugungi varaq) · «Tarix» · qolgan ro'yxatlar. Bosilgan
   tab shu joyning o'zida ochiladi. Ikki juftlik birlashtirildi, chunki
   ular bitta savolga javob beradi:
     · «Bo'lib to'lash» → «To'lovlar» ichida (ikkalasi ham pul);
     · «Rasmlar» → «Rasm va hujjatlar» ichida (ikkalasi ham fayl). */
/* 2026-11-22: «Yozuvlar» va «Materiallar» olib tashlandi. Yozuvlar —
   kalendardagi yozilishlar: o'tganlari «Tarix» ni takrorlardi, keyingisi
   endi chap kartochkada. Materiallar uch bemorda ham bo'sh edi — material
   xizmat bilan omborda o'zi yechiladi, jurnali Omborda. */
type HistorySection =
   | 'diagnoses' | 'labs' | 'prescriptions'
   | 'payments' | 'documents';

/* `visit` — birinchi tab, ekranda «Bemor»: anamnez va qabul varag'i birga
   (2026-11-20). «Anamnez» ilgari to'qqizinchi tab edi; klinika egasi uni
   birinchi va asosiy qilishni so'radi — shifokor bemorni ochganda avval
   allergiya va kasalliklarini ko'radi, yonida esa darhol yozadi. */
/* Tab ichidagi bo'lim — hamma tabda BIR XIL (2026-11-21). Ilgari har bo'lim
   o'zicha edi: sariq quti, kulrang sarlavha, «To'lovlar Tarixi» kabi har so'zi
   bosh harfli sarlavhalar va uchta ko'k tugma. */
const secCls = 'min-w-0 bg-surface border border-line rounded-2xl overflow-hidden';
const secHead = 'flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-line';
const secTitle = 'text-[15px] font-semibold text-ink';
const secEmpty = 'px-5 py-8 text-center text-sm text-muted';
const secBtn = 'inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-primary-200 dark:border-primary-800 text-sm font-semibold text-primary-700 dark:text-primary-300 hover:bg-primary-50 dark:hover:bg-primary-900/30';

type CardTab = 'visit' | 'history' | HistorySection;

const TABS: [CardTab, TranslationKey][] = [
   ['visit', 'card.tabVisit'],
   ['history', 'card.historyTitle'],
   ['diagnoses', 'card.secDiagnoses'],
   ['labs', 'card.tabLabs'],
   ['prescriptions', 'card.secPrescriptions'],
   ['payments', 'card.secPayments'],
   ['documents', 'card.tabFiles'],
];

/** Statsionar yozuvi yo'q bemor uchun — har renderda yangi massiv tug'ilmasin */
const EMPTY_ADMISSIONS: TimelineStay[] = [];

/** Shu manzillarga yozilsa bemor kartasidagi ro'yxatlar eskiradi */
const CARD_RESOURCES = [
    'visits', 'visit-procedures', 'lab-orders', 'studies', 'prescriptions',
    'diagnoses', 'payments', 'charges', 'transactions', 'appointments', 'installments',
] as const;

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
   currentUserName,
   showPatientPhone = true,
   onBack, onUpdatePatient, onAddAppointment, onUpdateAppointment,
   onPatientLoaded,
}) => {
   const { patientId: patientIdParam } = useParams<{ patientId: string }>();
   const patientId = patientIdProp || patientIdParam || null;
   /* `?visit=` — «Mening navbatim» dan yoki eski `/visit/:id` havolasidan
      kelgan aniq qabul. Bo'lmasa bugungi ochiq qabul o'zi tanlanadi. */
   const [searchParams] = useSearchParams();
   const requestedVisitId = searchParams.get('visit');
   const { t, language } = useLanguage();

   /* Ochiq tab. Karta har doim «Bemor» dan ochiladi: shifokor yozish uchun,
      registrator qabul ochish uchun keladi. */
   const [tab, setTab] = useState<CardTab>('visit');
   const openSec: HistorySection | null = tab === 'visit' || tab === 'history' ? null : tab;
   /* Allergiya, surunkali kasalliklar, statsionar yotishlar — bitta so'rov
      (`/patients/:id/summary`). Sarlavha ham, lenta ham shundan o'qiydi. */
   const [summary, setSummary] = useState<ClinicalSummary | null>(null);
   /* Xulosa yuklanmadi. `summary` shunda ham QOLADI (oldingi nusxa): uni
      `null` ga tushirsak allergiya nishoni yo'qolib, o'rniga «ma'lumot
      yo'q» chiqardi — shifokor buni «allergiyasi yo'q» deb o'qiydi. */
   const [summaryFailed, setSummaryFailed] = useState(false);
   /* Tarixdagi eski bayonlar uchun shablonlar — FILTRSIZ. Pastdagi
      `templates` bemorning hozirgi yoshi va jinsiga moslab keladi; bola
      o'sib shablon chegarasidan chiqsa, eski ko'rigi «to'ldirilmagan»
      bo'lib ko'rinardi. */
   const [historyTemplates, setHistoryTemplates] = useState<EncounterTemplate[]>([]);
   /* Qabulga bog'lanmagan tahlil va tekshiruvlar (laboratoriya yoki
      diagnostikaning o'zida yozilgan) — xulosadagi oxirgilari. Lenta ularni
      qabul ichida kelganlari bilan birlashtiradi. */
   const looseLabs = useMemo(() => (summary?.recentLabs || []).map(o => ({
      id: o.id, status: 'Completed', completedAt: o.completedAt || undefined, orderedAt: o.completedAt || '',
      items: (o.tests || []).map((testName, i) => ({ id: `${o.id}-${i}`, orderId: o.id, testId: '', testName, price: 0, status: 'Completed' })),
   } as LabOrder)), [summary]);
   const looseStudies = useMemo(() => (summary?.recentStudies || []).map(s => ({
      ...s, status: 'Completed', orderedAt: s.performedAt || '',
   } as DiagnosticStudy)), [summary]);
   const patientIdRef = React.useRef(patientId);
   patientIdRef.current = patientId;
   /* Varaqdagi qabul va uning hisobi — varaq o'zi beradi (`onState`):
      sarlavhadagi marshrut ikkinchi marta so'ramaydi. */
   const [sheet, setSheet] = useState<VisitSheetState | null>(null);

   /* Tashxis qidiruvi — kartadan qo'shish uchun. Qabul panelidagi bilan
      bir xil manba (`api.diagnoses.searchCodes`). */
   const [dxQuery, setDxQuery] = useState('');
   const [dxResults, setDxResults] = useState<ICD10Code[]>([]);
   const [dxChronic, setDxChronic] = useState(false);
   React.useEffect(() => {
      const q = dxQuery.trim();
      if (q.length < 2) { setDxResults([]); return; }
      let alive = true;
      const timer = setTimeout(() => {
         api.diagnoses.searchCodes(q)
            .then(r => { if (alive) setDxResults(r); })
            .catch(() => { if (alive) setDxResults([]); });
      }, 250);
      return () => { alive = false; clearTimeout(timer); };
   }, [dxQuery]);
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


   /* BEMOR — AVVAL RO'YXATDAN, BO'LMASA SERVERDAN.

      App kirishda faqat oxirgi 500 bemorni yuklaydi (`INITIAL_PATIENTS`).
      Ilgari karta faqat shu ro'yxatga qarardi: eski bemorning kartasi
      (qidiruvdan, navbatdan yoki havoladan ochilganda) «Bemor topilmadi»
      bilan chiqardi, holbuki bemor bazada bor. Endi ro'yxatda bo'lmasa
      `getById` so'raladi va «topilmadi» FAQAT server 404 desa chiqadi. */
   const listPatient = patients.find(p => String(p.id).trim() === String(patientId).trim());
   const [fetchedPatient, setFetchedPatient] = useState<Patient | null>(null);
   /* Holat QAYSI id uchun ekani ham saqlanadi: bir bemordan boshqasiga
      o'tganda eski «topilmadi» bir lahza ham ko'rinmasin. */
   const [lookup, setLookup] = useState<{ id: string | null; state: 'done' | 'notFound' | 'error' }>({ id: null, state: 'done' });
   const [lookupAttempt, setLookupAttempt] = useState(0);
   const hasListPatient = !!listPatient;
   useEffect(() => {
      if (hasListPatient || !patientId) return;
      let alive = true;
      setLookup({ id: null, state: 'done' });
      api.patients.getById(patientId)
         .then(p => {
            if (!alive) return;
            if (!p?.id) { setLookup({ id: patientId, state: 'notFound' }); return; }
            setFetchedPatient(p);
            setLookup({ id: patientId, state: 'done' });
            onPatientLoaded?.(p);
         })
         .catch((e: any) => {
            if (!alive) return;
            setLookup({ id: patientId, state: e?.status === 404 || e === 'Patient not found' ? 'notFound' : 'error' });
         });
      return () => { alive = false; };
      // eslint-disable-next-line react-hooks/exhaustive-deps
   }, [patientId, hasListPatient, lookupAttempt]);
   /* Shu id uchun javob hali kelmagan bo'lsa — yuklanmoqda */
   const patientLookup: 'loading' | 'done' | 'notFound' | 'error' =
      lookup.id === patientId ? lookup.state : 'loading';
   const patient = listPatient
      || (fetchedPatient && String(fetchedPatient.id) === String(patientId) ? fetchedPatient : undefined);

   // DOCTOR roli bilan kirilgan bo'lsa — shifokor tanlovlarida o'zi defolt tanlanadi
   /* Tibbiy tarixni (allergiya ham) shifokor, ega va registrator to'ldiradi —
      klinika egasi, 2026-11-21. Hamshira emas: server bemor yozuvini unga
      ochmaydi (`PUT /api/patients/:id`), tugma ko'rinib saqlamasa yomonroq. */
   const canEditAnamnesis = userRole === UserRole.CLINIC_ADMIN || userRole === UserRole.DOCTOR
      || userRole === UserRole.RECEPTIONIST;
   /* «yangilandi … · …» — allergiya o'zgarsa yangi belgi `summary` bilan
      keladi, kasallik va qolgani o'zgarsa — bemor yozuvi bilan. Qaysi biri
      keyinroq bo'lsa, o'sha. */
   const summaryStamp = (() => {
      const sp = (summary as { patient?: { anamnesisUpdatedAt?: string | null; anamnesisUpdatedBy?: string | null } } | null)?.patient;
      if (!sp?.anamnesisUpdatedAt) return null;
      const mine = patient?.anamnesisUpdatedAt ? new Date(patient.anamnesisUpdatedAt).getTime() : 0;
      return new Date(sp.anamnesisUpdatedAt).getTime() >= mine
         ? { at: sp.anamnesisUpdatedAt, by: sp.anamnesisUpdatedBy ?? null }
         : null;
   })();
   const myDoctor = userRole === UserRole.DOCTOR && loggedDoctorId ? doctors.find(d => d.id === loggedDoctorId) : undefined;
   const defaultDoctorId = myDoctor?.id || '';

   // Edit Form State
   // Payment Form State

   // Chegirmadan keyingi jami summa (asl narx ma'lum bo'lganda)

   // Installment quick-open state (from appointment row)

   // Medical History State
   const [historyText, setHistoryText] = useState('');

   /* ANAMNEZ O'ZI SAQLANADI — «Saqlash» tugmasi yo'q.

      Tugmalar tez bosiladi (gipertoniya, diabet, gepatit — uch bosish bir
      soniyada), shuning uchun:
        · so'rovlar NAVBAT bilan ketadi (`historyQueue`): har biri butun
          matnni yuboradi va oxirgisi oxirida yoziladi;
        · saqlash ketayotganda serverdan qaytgan bemor ekrandagi matnni
          BOSIB YUBORMAYDI — aks holda birinchi javob ikkinchi bosishni
          o'chirib, uchinchi so'rov usiz ketardi;
        · hammasi tugagach ekran bazada HAQIQATAN turgan matnni ko'rsatadi
          (`confirmedHistory`): saqlanmagan kasallik «bor» bo'lib qolmaydi.
      Xato xabarini `onUpdatePatient` o'zi chiqaradi. */
   /* Tibbiy tarixning qolgan bo'limlari (`Patient.anamnesis`, JSON) ham xuddi
      shu navbat bilan saqlanadi: kasallik va dori bir soniyada ketma-ket
      bosilsa ham biri ikkinchisini bosib yubormaydi. */
   const [anamnesisRaw, setAnamnesisRaw] = useState('');
   const historyQueue = useRef<Promise<void>>(Promise.resolve());
   const pendingHistory = useRef(0);
   const confirmedHistory = useRef('');
   const confirmedAnamnesis = useRef('');
   const historyOwner = useRef<string | null>(null);

   useEffect(() => {
      if (!patient) return;
      const switched = historyOwner.current !== patient.id;
      if (!switched && pendingHistory.current > 0) return;
      historyOwner.current = patient.id;
      confirmedHistory.current = patient.medicalHistory || '';
      confirmedAnamnesis.current = patient.anamnesis || '';
      setHistoryText(patient.medicalHistory || '');
      setAnamnesisRaw(patient.anamnesis || '');
   }, [patient]);

   const queueHistorySave = (patch: { medicalHistory?: string; anamnesis?: string }) => {
      if (!patient) return;
      const id = patient.id;
      pendingHistory.current += 1;
      historyQueue.current = historyQueue.current
         .then(() => onUpdatePatient(id, patch, { silent: true }))
         .then(() => {
            if (historyOwner.current !== id) return;
            if (patch.medicalHistory !== undefined) confirmedHistory.current = patch.medicalHistory;
            if (patch.anamnesis !== undefined) confirmedAnamnesis.current = patch.anamnesis;
         })
         .catch(() => { /* xabar chiqdi; ekran pastda tasdiqlangan holatga qaytadi */ })
         .finally(() => {
            pendingHistory.current -= 1;
            if (pendingHistory.current === 0 && historyOwner.current === id) {
               setHistoryText(confirmedHistory.current);
               setAnamnesisRaw(confirmedAnamnesis.current);
            }
         });
   };

   const changeHistory = (text: string) => {
      setHistoryText(text);
      queueHistorySave({ medicalHistory: text });
   };

   const changeAnamnesis = (data: AnamnesisData) => {
      const raw = JSON.stringify(data);
      setAnamnesisRaw(raw);
      queueHistorySave({ anamnesis: raw });
   };

   // Message Modal State
   const [isMessageModalOpen, setIsMessageModalOpen] = useState(false);
   /* Xabar oynasi — YAGONA komponent (`SendMessageModal`). Bu yerda o'z
      nusxasi va KODGA YOZILGAN matnlari bor edi. Ular orasida «qarz
      eslatmasi» ham bor edi va u qarzni `Transaction.status === 'Pending'`
      dan sanardi — qarzning eski, UCHINCHI ta'rifi. Bunday chek endi
      umuman yaratilmaydi (1-bosqich), ya'ni summa har doim nol chiqardi
      va haqiqiy qarzi bor bemor «qarzdorligingiz yo'q» degan SMS
      olardi. */

   /* Keyingi tashrif — YAGONA forma (`AppointmentFormModal`). Bu yerda
      o'zining nusxasi va O'ZINING to'qnashuv tekshiruvi bor edi; u
      brauzerga yuklangan ro'yxatga qarab ishlardi va boshlanish vaqtini
      AYNAN solishtirardi, ya'ni 08:30 dagi bir soatlik qabul ustiga
      09:00 ni yozib bo'laverardi. Tekshiruv endi faqat serverda. */
   const [isApptModalOpen, setIsApptModalOpen] = useState(false);


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

   /* Tablardagi «+» — bugungi qabulning «+ Qo'shish» oynasini ochadi */
   const [addRequest, setAddRequest] = useState<{ kind: AddKind; n: number } | null>(null);
   /* «Tashxislar» tabidagi qidiruv «+ Tashxis qo'yish» bosilgandagina ochiladi */
   const [dxOpen, setDxOpen] = useState(false);

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
   /** Oshsa — tarix qayta so'raladi (`useResourceSync`, pastda) */
   const [historyTick, setHistoryTick] = useState(0);

   useEffect(() => {
      if (!clinicIdForHistory || !patientId) { setHistory(null); return; }
      let alive = true;
      Promise.all([
         api.appointments.getAll(clinicIdForHistory, { patientId }),
         /* To'lovlar hamshira va laborantga yopiq (server 403). Ular uchun
            to'lov tarixi bo'sh qoladi, qabullar tarixi esa yo'qolmasin. */
         api.transactions.getAll(clinicIdForHistory, { patientId })
            .catch((e: any) => { if (e?.status === 403) return [] as Transaction[]; throw e; }),
      ]).then(([appts, tx]) => { if (alive) setHistory({ appts, tx }); })
        .catch(() => { if (alive) setHistory(null); });
      return () => { alive = false; };
   }, [clinicIdForHistory, patientId, historyTick]);

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
      /* JAVOB KELGUNCHA BOSHQA BEMOR OCHILGAN BO'LISHI MUMKIN (yuqoridagi
         qidiruv sahifani almashtirmaydi, faqat manzilni). Kechikkan javob
         yangi bemor ostida eski bemorning allergiyasi yoki tashxisini
         ko'rsatib qo'ymasligi kerak — shuning uchun har javob o'z bemorini
         tekshiradi. */
      const mine = <T,>(apply: (value: T) => void) => (value: T) => {
         if (patientIdRef.current === patientId) apply(value);
      };
      api.diagnoses.getByPatient(patientId).then(mine(setDiagnoses)).catch(console.error);
      api.clinical.summary(patientId)
         .then(mine((s: ClinicalSummary) => { setSummary(s); setSummaryFailed(false); }))
         .catch(mine(() => setSummaryFailed(true)));
      api.prescriptions.getAll(patientId).then(mine(setPrescriptions)).catch(mine(() => setPrescriptions([])));
      api.charges.getAll({ patientId, status: 'Unpaid' })
         .then(mine((cs: VisitCharge[]) => setUnpaidCharges(cs || []))).catch(mine(() => setUnpaidCharges([])));
      api.visits.getAll({ patientId }).then(mine((vs: Visit[]) => {
         setVisits(vs);
         /* Panelga BUGUNGI ochiq qabul tushadi. Kechagi tugallanmagan
            qabul o'z-o'zidan ochilmasligi kerak: shifokor bugungi ish
            bilan shug'ullanadi, eskisini tarixdan ataylab ochadi. */
         setPanelVisitId(prev => {
            if (keepVisitId !== undefined) return keepVisitId;
            if (prev && vs.some(v => v.id === prev)) return prev;
            const today = todayISO();
            const open = vs.filter(v => v.date === today && v.status !== 'Completed' && v.status !== 'Cancelled');
            /* Shifokorga O'ZINING qabuli ochiladi (yoki shifokori
               belgilanmagani). Bemorning bugun boshqa shifokorda ochiq
               qabuli bo'lsa, u o'z-o'zidan ochilmaydi: varaq o'zi saqlanadi
               va bitta harf begona qabulga yozilib, uni «Qabulda» holatiga
               o'tkazib qo'yardi. Kerak bo'lsa — tarix lentasidan, ataylab. */
            const pick = userRole === UserRole.DOCTOR && loggedDoctorId
               ? open.find(v => !v.doctorId || v.doctorId === loggedDoctorId)
               : open[0];
            return pick ? pick.id : null;
         });
      })).catch(console.error);
   }, [patientId, userRole, loggedDoctorId]);

   /* Karta ochiq turganda bemorga tegishli biror narsa o'zgarsa (boshqa
      kompyuterda ham) — chap ustun va tarix o'zi yangilanadi. Registrator
      shu bemorga qabul ochsa, panelga o'sha qabul o'zi tushadi. */
   useResourceSync(CARD_RESOURCES, () => { reloadClinical(); setHistoryTick(x => x + 1); }, !!patientId);

   const cardClinicId = currentClinic?.id;

   useEffect(() => {
      if (patientId) {
         setPanelVisitId(requestedVisitId || null);
         /* Yangi bemorning ma'lumoti kelguncha eskisiniki ko'rinib turmasin */
         setSummary(null); setSummaryFailed(false);
         setVisits([]); setDiagnoses([]); setPrescriptions([]); setUnpaidCharges([]); setSheet(null);
         api.encounterTemplates.getAll().then(setHistoryTemplates).catch(() => setHistoryTemplates([]));
         api.departments.getAll().then(setDepartments).catch(console.error);
         reloadClinical();
         /* `patient.id` uzatiladi — server bemorga mos kelmaydigan
            shablonlarni chiqarib tashlaydi (jins va yosh, B-09). */
         api.encounterTemplates.getAll(undefined, patientId).then(setTemplates).catch(console.error);
      }
      /* Klinika yozuvining O'ZIGA emas, faqat `id` siga bog'liq. Yozuv
         o'zgarsa (ega sozlamani saqladi) butun karta qaytadan ochilardi:
         panel `null` ga tushib qayta yuklanar va shifokor yozayotgan
         ko'rik matni yo'qolardi. */
   }, [patientId, cardClinicId, reloadClinical, requestedVisitId]);

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
            return <div key={index} className="font-bold mt-2 text-ink print:text-black">{cleanLine}</div>;
         }
         return <div key={index} className="text-muted print:text-black">{cleanLine}</div>;
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

   /* KARTADAN TASHXIS QO'SHISH.

      Ochiq qabul bo'lsa unga bog'lanadi (`panelVisitId`) — shunda
      «bu tashrifda qanday tashxis qo'yildi» degan savolga javob saqlanadi
      va qabulni yakunlashdagi «tashxis qo'yilganmi?» tekshiruvi ishlaydi.
      Qabul bo'lmasa tashxis bemorning o'ziga yoziladi: surunkali
      kasallikni bemor kelmagan kunda ham kiritish kerak bo'ladi. */
   /* Varaqda yopilgan (yoki tarixdan ochilgan eski) qabul turgan bo'lishi
      mumkin — tashxis unga orqadan bog'lanmasligi kerak. */
   const openSheetVisitId = sheet?.visit && sheet.visit.status !== 'Completed' && sheet.visit.status !== 'Cancelled'
      ? sheet.visit.id : null;
   const addDiagnosisFromCard = async (code: ICD10Code) => {
      if (!patient) return;
      try {
         await api.diagnoses.add({
            patientId: patient.id, code: code.code,
            date: todayISO(), notes: '', status: 'Active',
            clinicId: patient.clinicId,
            ...(openSheetVisitId ? { visitId: openSheetVisitId } : {}),
            isChronic: dxChronic,
         } as any);
         setDxQuery(''); setDxResults([]); setDxChronic(false);
         await reloadClinical();
         toast.success(t('visit.diagnosisAdded'));
      } catch (e: any) {
         toast.error(e?.message || t('patients.details.alerts.error'));
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




   if (!patient) {
      /* Serverdan kutilmoqda — «topilmadi» deb erta aytmaymiz */
      if (patientId && patientLookup === 'loading') {
         return (
            <div className="flex items-center justify-center py-24" role="status" aria-live="polite">
               <div className="w-8 h-8 rounded-full border-2 border-line border-t-primary-600 animate-spin" />
               <span className="ml-3 text-sm text-muted">{t('common.loading')}</span>
            </div>
         );
      }
      if (patientLookup === 'error') {
         return (
            <div className="p-8 text-center space-y-3">
               <p className="text-ink">{t('patients.details.loadFailed')}</p>
               <div className="flex justify-center gap-2">
                  <Button onClick={() => setLookupAttempt(n => n + 1)}>{t('common.retry')}</Button>
                  <Button variant="secondary" onClick={onBack}>{t('common.cancel')}</Button>
               </div>
            </div>
         );
      }
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


   const openApptModal = () => setIsApptModalOpen(true);
   /* Tarixdan qabul ochildi — varaq «Qabul» tabida, shunga o'tamiz. */
   const openInSheet = (visitId: string) => {
      setPanelVisitId(visitId);
      setTab('visit');
   };
   const notify = (type: 'success' | 'error' | 'info', msg: string) =>
      (type === 'error' ? toast.error(msg) : toast.success(msg));

   /* Bir kasallik har qabulda qayta qo'yiladi — ro'yxatda u BIR qator:
      oxirgi sanasi, kim qo'ygani va necha marta. Ilgari bitta tashxis uch
      qator bo'lib turardi va qaysi shifokor qo'ygani yo'q edi. */
   const visitById = new Map(visits.map(v => [v.id, v] as const));
   const dxRows = (() => {
      const byCode = new Map<string, { last: PatientDiagnosis; ids: string[]; chronic: boolean }>();
      [...diagnoses].sort((a, b) => String(b.date).localeCompare(String(a.date))).forEach(d => {
         const row = byCode.get(d.code);
         if (row) { row.ids.push(d.id); row.chronic = row.chronic || !!d.isChronic; }
         else byCode.set(d.code, { last: d, ids: [d.id], chronic: !!d.isChronic });
      });
      return [...byCode.values()];
   })();
   /* Tashxisni faqat shifokor va ega qo'yadi/o'chiradi (server boshqaga 403).
      Ilgari registrator o'chirish tugmasini ko'rardi, bossa xato chiqardi. */
   const canDiagnose = userRole === UserRole.DOCTOR || userRole === UserRole.CLINIC_ADMIN;
   /* Retsept ham shunday; tahlil va tekshiruvni registrator ham yuboradi. */
   const canPrescribe = canDiagnose;
   const canOrder = canDiagnose || userRole === UserRole.RECEPTIONIST;

   /* Buyurilgan tahlil va tekshiruvlar — hamma qabullardan, yangisi tepada */
   const orders = [
      ...visits.flatMap(v => (v.labOrders || []).filter(o => o.status !== 'Cancelled').map(o => ({
         id: `lab-${o.id}`, visitId: v.id, kind: 'lab' as const, date: o.orderedAt || v.date,
         name: (o.items || []).map(i => i.testName).filter(Boolean).join(', ') || t('visit.tabLab'),
         done: o.status === 'Completed', doctor: v.doctorName || '',
      }))),
      ...visits.flatMap(v => (v.studies || []).filter(s => s.status !== 'Cancelled').map(s => ({
         id: `st-${s.id}`, visitId: v.id, kind: 'study' as const, date: s.orderedAt || v.date,
         name: s.name, done: s.status === 'Completed', doctor: v.doctorName || '',
      }))),
   ].sort((a, b) => String(b.date).localeCompare(String(a.date)));

   const sectionCount = (id: CardTab): number =>
      id === 'diagnoses' ? dxRows.length
         : id === 'prescriptions' ? prescriptions.length
            : id === 'labs' ? orders.length
               : id === 'payments' ? patientTransactions.length
                  : 0;

   /* Tabdagi «+» — bugungi ochiq qabulning «+ Qo'shish» oynasi o'sha
      bo'limda ochiladi. Qabul yo'q bo'lsa — «Umumiy» tabiga, qabul ochish
      formasiga (yangi oyna yoki ikkinchi forma yo'q). */
   const requestAdd = (kind: AddKind) => {
      setTab('visit');
      if (!openSheetVisitId) { toast.info(t('card.openVisitFirst')); return; }
      setAddRequest(r => ({ kind, n: (r?.n || 0) + 1 }));
   };

   /* Eng yaqin kelajakdagi yozuv — varaqdagi «Keyingi tashrif» qatori */
   const nowMs = Date.now();
   const nextAppointment = patientAppointments
      .filter(a => a.status !== 'Cancelled' && a.status !== 'Completed' && new Date(`${a.date}T${a.time}`).getTime() >= nowMs)
      .sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`))[0] || null;

   /* Tarixdan eski qabul ochilgan — bugungisiga qaytish: avval ochig'i,
      bo'lmasa bugun yakunlangani, u ham bo'lmasa «qabul ochish» formasi. */
   const showToday = () => {
      const today = todayISO();
      const todays = visits.filter(v => v.date === today && v.status !== 'Cancelled');
      const current = todays.find(v => v.status !== 'Completed') || todays[0];
      setPanelVisitId(current ? current.id : null);
   };

   /* Oxirgi tashrif — bekor qilinmagan eng so'nggi qabul; qabullar hali
      yuklanmagan bo'lsa bemor yozuvidagi sana. */
   const lastVisitDate = visits
      .filter(v => v.status !== 'Cancelled')
      .map(v => v.date)
      .sort()
      .pop() || patient.lastVisit || null;
   /* Bosma karta qaysi qabuldan: varaqdagisi, bo'lmasa eng oxirgisi */
   /* Varaqdagi nusxa yangiroq: hozirgina yozilgan shikoyat ro'yxatga hali yetmagan bo'lishi mumkin */
   const cardVisit = (sheet?.visit && sheet.visit.id === panelVisitId ? sheet.visit : panelVisit) || [...visits]
      .filter(v => v.status !== 'Cancelled')
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))[0] || null;
   const cardEncounter = (() => {
      try { return cardVisit?.examData ? JSON.parse(cardVisit.examData) : {}; } catch { return {}; }
   })();
   const cardTreatment = cardVisit ? [
      ...(cardVisit.procedures || []).map(p => ({ serviceName: p.procedureName })),
      ...(cardVisit.prescriptions || []).flatMap(rx => (rx.items || []).map(i => ({
         serviceName: [i.name, i.dosage, i.frequency, i.durationDays ? `${i.durationDays} ${t('visit.days')}` : '']
            .filter(Boolean).join(' '),
      }))),
      ...(cardVisit.labOrders || []).filter(o => o.status !== 'Cancelled')
         .flatMap(o => (o.items || []).map(i => ({ serviceName: i.testName }))),
      ...(cardVisit.studies || []).filter(s => s.status !== 'Cancelled').map(s => ({ serviceName: s.name })),
   ].filter(p => p.serviceName) : [];
   const admittedNow = (summary?.admissions || []).some(a => !a.dischargedAt && a.status !== 'Discharged' && a.status !== 'Cancelled');

   return (
      <>
         {/* ── BEMOR KARTASI — DentaCRM namunasida (2026-11-20) ────────────
             Tepada «Bemorlar › Ism» yo'li. Ostida ikki ustun: chapda bemor
             kartochkasi (hamma tabda bir joyda), o'ngda tablar va ish. */}
         <div className="flex flex-col gap-4 animate-fade-in pb-10 print:hidden">
            <nav aria-label={t('card.breadcrumb')} className="flex items-center gap-2 text-sm">
               <button type="button" onClick={onBack} aria-label={t('common.back')}
                  className="inline-flex items-center gap-1.5 font-semibold text-muted hover:text-ink">
                  <ArrowLeft className="w-4 h-4" aria-hidden="true" /> {t('nav.patients')}
               </button>
               <ChevronRight className="w-4 h-4 text-faint" aria-hidden="true" />
               <span className="min-w-0 truncate font-semibold text-ink">{patient.lastName} {patient.firstName}</span>
            </nav>

            <div className="grid grid-cols-1 xl:grid-cols-[320px_minmax(0,1fr)] gap-5 items-start">
            {/* Chap ustun: bemor kartochkasi va uning ostida allergiya va
                kasalliklar — ikkalasi ham «kim», hamma tabda bir joyda. */}
            <div className="min-w-0 flex flex-col gap-4">
            <ProfileCard
               patient={patient}
               showPhone={showPatientPhone}
               visitCount={visits.filter(v => v.status !== 'Cancelled').length}
               due={unpaidTotal}
               lastVisit={lastVisitDate}
               allergiesUnknown={summaryFailed && !summary}
               admitted={admittedNow}
               nextAppointment={nextAppointment}
               onOpenPayments={() => setTab('payments')}
               onTakePayment={userRole === UserRole.DOCTOR ? undefined : () => setIsChargeModalOpen(true)}
               onAddPayment={userRole === UserRole.DOCTOR ? undefined : () => setIsAdvanceOpen(true)}
               onSchedule={openApptModal}
               onEdit={() => setIsEditModalOpen(true)}
               onMessage={() => setIsMessageModalOpen(true)}
               onAssignDoctor={() => setIsAssignDoctorModalOpen(true)}
               onPrintCard={() => printPatientCard({
                  patient,
                  clinic: currentClinic,
                  /* Hammasi BITTA qabuldan (2026-11-22): varaqdagisi, bo'lmasa
                     oxirgisi. Ilgari shikoyat bo'sh, «Tayinlangan davolash»
                     eski yozuv izohlaridan regex bilan qidirilardi (doim bo'sh),
                     sana bugungi, shifokor esa ro'yxatdagi birinchisi edi. */
                  doctor: doctors.find(d => d.id === cardVisit?.doctorId)
                     || (cardVisit ? undefined : doctors.find(d => d.id === patient.doctorId)),
                  doctorName: cardVisit?.doctorName || undefined,
                  visitDate: cardVisit?.date,
                  complaints: cardVisit?.complaints || undefined,
                  conclusion: cardVisit?.treatmentPlan || undefined,
                  departmentName: departments.find(d => d.id === cardVisit?.departmentId)?.name,
                  encounter: {
                     data: cardEncounter,
                     template: templates.find(x => x.id === cardVisit?.templateId)
                        || historyTemplates.find(x => x.id === cardVisit?.templateId),
                  },
                  diagnoses: cardVisit?.diagnoses?.length ? cardVisit.diagnoses : diagnoses,
                  procedures: cardTreatment,
                  anamnesis: anamnesisLines({
                     historyText, anamnesisRaw,
                     allergies: summary ? summary.allergies || [] : null, chronic: summary?.chronic || [],
                     female: patient.gender === 'Female', lang: language as 'uz' | 'ru', t,
                  }),
               })}
               onUploadPhoto={file => handleImageUpload('avatar', file)}
            />
            </div>

            <div className="min-w-0 flex flex-col gap-4">
            {/* ── TABLAR — o'ng ustunning tepasida. Belgisiz: 9 ta tab belgi bilan
                1366 kenglikdagi ekranga sig'masdi va qator suriladigan bo'lib qolardi. */}
            <div role="tablist" aria-label={t('card.tabs')}
               className="flex gap-1 overflow-x-auto overflow-y-hidden [scrollbar-width:none] border-b border-line">
               {TABS.map(([id, key]) => {
                  const count = sectionCount(id);
                  const on = tab === id;
                  return (
                     <button key={id} type="button" role="tab" id={`card-tab-${id}`}
                        aria-selected={on} aria-controls="card-tabpanel"
                        onClick={() => setTab(id)}
                        className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-3 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${on
                           ? 'border-primary-600 text-primary-700 dark:text-primary-300'
                           : 'border-transparent text-muted hover:text-ink'}`}>
                        {t(key)}
                        {count > 0 && <span className="tabular-nums text-xs text-faint">{count}</span>}
                     </button>
                  );
               })}
            </div>

            {/* ── Umumiy — «Bugungi qabul» qutisi ───────────────────────────
                Varaq boshqa tabga o'tganda ham O'RNATILGAN qoladi (faqat
                yashiriladi): aks holda yozib turilgan, hali saqlanmagan matn
                yo'qolardi. */}
            <div id={tab === 'visit' ? 'card-tabpanel' : undefined} role={tab === 'visit' ? 'tabpanel' : undefined}
               aria-labelledby={tab === 'visit' ? 'card-tab-visit' : undefined}
               className={tab === 'visit' ? 'min-w-0' : 'hidden'}>
               <VisitPanel
                  patient={patient}
                  visitId={panelVisitId}
                  departments={departments}
                  services={services}
                  doctors={doctors}
                  currentUserName={myDoctor ? formatDoctorName(myDoctor) : undefined}
                  userRole={userRole}
                  loggedDoctorId={loggedDoctorId}
                  addToast={notify}
                  onVisitChanged={(id) => reloadClinical(id === undefined ? undefined : id)}
                  onState={setSheet}
                  onShowToday={showToday}
                  onSchedule={openApptModal}
                  clinic={currentClinic}
                  addRequest={addRequest}
                  /* «Tibbiy tarix» blokining boshi (DentaCRM namunasida, 2026-11-21):
                     allergiya va kasalliklar chap kartochkadan shu yerga ko'chdi —
                     chapda faqat «kim» qoldi. */
                  history={(
                     <Anamnesis
                        key={patient.id}
                        patientId={patient.id}
                        gender={patient.gender}
                        summary={summary}
                        failed={summaryFailed}
                        historyText={historyText}
                        anamnesisRaw={anamnesisRaw}
                        updatedAt={summaryStamp?.at ?? patient.anamnesisUpdatedAt}
                        updatedBy={summaryStamp?.at ? summaryStamp.by : patient.anamnesisUpdatedBy}
                        /* Registrator ham to'ldiradi (klinika egasi, 2026-11-21) */
                        canEditAllergies={canEditAnamnesis}
                        canEditHistory={canEditAnamnesis}
                        addToast={notify}
                        onChanged={() => reloadClinical()}
                        onHistoryChange={changeHistory}
                        onAnamnesisChange={changeAnamnesis}
                     />
                  )}
               />
            </div>

            {/* ── Tarix ─────────────────────────────────────────────────────
                Bitta lenta: qabullar, tahlillar, tekshiruvlar, yotishlar.
                Qabul bosilsa «Bemor» tabida ochiladi. Allergiya va kasalliklar
                bu yerda emas — ular «Bemor» tabidagi anamnezda. */}
            {tab === 'history' && (
               <section id="card-tabpanel" role="tabpanel" aria-labelledby="hist-title"
                  className="min-w-0 bg-surface border border-line rounded-[20px] p-4 sm:p-5 flex flex-col gap-3.5">
                  <h2 id="hist-title" className="sr-only">{t('card.historyTitle')}</h2>
                  <PatientTimeline
                     patient={patient}
                     clinic={currentClinic}
                     visits={visits}
                     admissions={summary?.admissions || EMPTY_ADMISSIONS}
                     looseLabs={looseLabs}
                     looseStudies={looseStudies}
                     departments={departments}
                     templates={historyTemplates}
                     onOpenVisit={openInSheet}
                  />
               </section>
            )}

            {/* ── Qolgan tablar — shu yerning o'zida ──────────────────────── */}
            {openSec && (
            <div id="card-tabpanel" role="tabpanel" aria-labelledby={`card-tab-${openSec}`} className="min-w-0 space-y-6">

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

               {/* ── Tashxislar ─────────────────────────────────────────────── */}
               {openSec === 'diagnoses' && (
                  <Card className="p-0 overflow-hidden">
                     {/* TASHXIS QO'SHISH — KARTADAN HAM.

                         Ilgari bu bo'limda faqat O'CHIRISH tugmasi bor edi:
                         tashxisni qo'shish uchun ochiq qabul kerak edi.
                         Ya'ni bemor kelmagan kunda kartaga surunkali
                         kasallikni yozib qo'yish imkoni yo'q edi, va bo'sh
                         ro'yxatda «Tashxis qo'yilmagan» degan yozuvdan
                         boshqa hech narsa yo'q edi — nima qilish kerakligi
                         ko'rinmasdi.

                         Server `visitId` ni IXTIYORIY qabul qiladi
                         (`server.ts`, `POST /api/diagnoses`), shuning uchun
                         qabulsiz ham yoziladi. Ochiq qabul bo'lsa — unga
                         bog'lanadi, aks holda bemorning o'ziga. */}
                     {/* «+ Tashxis qo'yish» (2026-11-22). Ilgari tepada nomsiz
                         kulrang qidiruv maydoni turardi — uni tugma deb hech kim
                         tanimasdi. Endi tugma, bosilsa ostida qidiruv ochiladi. */}
                     <div className={secHead}>
                        <h3 className={secTitle}>{t('card.secDiagnoses')}</h3>
                        {canDiagnose && (
                           <button type="button" onClick={() => setDxOpen(o => !o)} aria-expanded={dxOpen} className={secBtn}>
                              <Plus className="w-4 h-4" aria-hidden="true" /> {t('card.addDiagnosis')}
                           </button>
                        )}
                     </div>
                     {canDiagnose && dxOpen && (
                        <div className="p-4 border-b border-line-soft">
                           <div className="relative">
                              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-faint" />
                              <input
                                 autoFocus
                                 aria-label={t('card.dxSearch')}
                                 value={dxQuery}
                                 onChange={e => setDxQuery(e.target.value)}
                                 placeholder={t('card.dxSearch')}
                                 className="w-full h-11 pl-10 pr-3 rounded-xl border border-line bg-elevated text-sm text-ink placeholder:text-faint outline-none focus:border-primary-500/50"
                              />
                           </div>
                           {dxResults.length > 0 && (
                              <div className="mt-2 border border-line rounded-xl divide-y divide-line max-h-56 overflow-y-auto">
                                 {dxResults.slice(0, 12).map(c => (
                                    <button key={c.code} onClick={() => addDiagnosisFromCard(c)}
                                       className="w-full text-left p-2.5 text-sm hover:bg-elevated">
                                       <b className="text-ink">{c.code}</b>
                                       <span className="text-muted"> — {c.name}</span>
                                    </button>
                                 ))}
                              </div>
                           )}
                           <label className="mt-2 flex items-center gap-2 text-xs text-muted cursor-pointer">
                              <input type="checkbox" checked={dxChronic} onChange={e => setDxChronic(e.target.checked)}
                                 className="w-4 h-4 rounded" />
                              {t('visit.chronic')}
                           </label>
                        </div>
                     )}
                     {dxRows.length === 0 ? (
                        <p className={secEmpty}>{t('card.noDiagnoses')}</p>
                     ) : (
                        <ul className="divide-y divide-line">
                           {dxRows.map(({ last: d, ids, chronic }) => {
                              const by = d.visitId ? visitById.get(d.visitId)?.doctorName : '';
                              return (
                                 <li key={d.code} className="flex flex-wrap items-center gap-3 px-5 py-3">
                                    <span className="min-w-0 flex-1">
                                       <span className="block text-sm text-ink">
                                          <b>{d.code}</b>{d.icd10?.name ? ` — ${d.icd10.name}` : ''}
                                       </span>
                                       <span className="block text-xs text-muted">
                                          {[formatDate(d.date), by, ids.length > 1 ? fill(t('card.dxTimes'), ids.length) : '']
                                             .filter(Boolean).join(' · ')}
                                       </span>
                                       {d.notes && <span className="block text-xs text-muted">{formatDiagnosisNotes(d.notes)}</span>}
                                    </span>
                                    {chronic && (
                                       <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                                          {t('visit.chronic')}
                                       </span>
                                    )}
                                    {/* Takrorlangan tashxisda oxirgi qo'yilgani o'chadi */}
                                    {canDiagnose && (
                                       <button type="button" onClick={() => handleDeleteDiagnosis(d.id)} aria-label={`${t('common.delete')}: ${d.code}`}
                                          className="p-1 text-faint hover:text-red-500">
                                          <Trash2 className="w-4 h-4" />
                                       </button>
                                    )}
                                 </li>
                              );
                           })}
                        </ul>
                     )}
                  </Card>
               )}

               {/* ── Retseptlar ──────────────────────────────────────────────
                   Retsept yozilardi, lekin uni ko'rish va chop etish
                   IMKONI YO'Q edi: bemor qo'lida hech narsasiz chiqib ketardi. */}
               {openSec === 'prescriptions' && (
                  <Card className="p-0 overflow-hidden">
                     <div className={secHead}>
                        <h3 className={secTitle}>{t('card.secPrescriptions')}</h3>
                        {canPrescribe && (
                           <button type="button" onClick={() => requestAdd('rx')} className={secBtn}>
                              <Plus className="w-4 h-4" aria-hidden="true" /> {t('card.addRx')}
                           </button>
                        )}
                     </div>
                     {prescriptions.length === 0 ? (
                        <p className={secEmpty}>{t('card.noPrescriptions')}</p>
                     ) : (
                        <div className="divide-y divide-line">
                           {prescriptions.map(rx => (
                              <div key={rx.id} className="flex flex-wrap items-center gap-3 p-4">
                                 <Pill className="w-4 h-4 text-faint shrink-0" />
                                 <span className="min-w-0 flex-1">
                                    <span className="block text-sm text-ink">
                                       {(rx.items || []).map(i => i.name).filter(Boolean).join(', ') || t('visit.prescription')}
                                    </span>
                                    <span className="block text-xs text-muted">
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

               {/* ── Tahlillar (2026-11-22) ──────────────────────────────────
                   Ilgari bu yerda faqat «Tahlil dinamikasi» bor edi: buyurilgan,
                   kutilayotgan tahlil ham, EKG/UZI ham ko'rinmasdi, yuborish
                   tugmasi esa yo'q edi. Endi tepada ro'yxat va tugmalar, ostida
                   dinamika. Qator bosilsa o'sha qabul ochiladi (natija o'sha yerda). */}
               {openSec === 'labs' && (
                  <section aria-labelledby="orders-title" className={secCls}>
                     <div className={secHead}>
                        <h3 id="orders-title" className={secTitle}>{t('card.ordersTitle')}</h3>
                        {canOrder && (
                           <div className="flex flex-wrap gap-2">
                              <button type="button" onClick={() => requestAdd('lab')} className={secBtn}>
                                 <Plus className="w-4 h-4" aria-hidden="true" /> {t('card.addLab')}
                              </button>
                              <button type="button" onClick={() => requestAdd('study')} className={secBtn}>
                                 <Plus className="w-4 h-4" aria-hidden="true" /> {t('card.addStudy')}
                              </button>
                           </div>
                        )}
                     </div>
                     {orders.length === 0 ? (
                        <p className={secEmpty}>{t('card.noOrders')}</p>
                     ) : (
                        <ul className="divide-y divide-line">
                           {orders.map(o => (
                              <li key={o.id}>
                                 <button type="button" onClick={() => openInSheet(o.visitId)}
                                    className="w-full flex items-center gap-3 px-5 py-3 text-left text-sm hover:bg-elevated">
                                    {o.kind === 'lab'
                                       ? <FlaskConical className="w-4 h-4 shrink-0 text-faint" aria-hidden="true" />
                                       : <Scan className="w-4 h-4 shrink-0 text-faint" aria-hidden="true" />}
                                    <span className="min-w-0 flex-1">
                                       <span className="block font-medium text-ink">{o.name}</span>
                                       <span className="block text-xs text-muted">
                                          {[o.date ? formatDate(new Date(o.date)) : '', o.doctor].filter(Boolean).join(' · ')}
                                       </span>
                                    </span>
                                    <span className={`shrink-0 px-2 py-0.5 rounded-md text-xs font-medium ${o.done
                                       ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300'
                                       : 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'}`}>
                                       {o.done ? t('card.orderReady') : t('card.orderPending')}
                                    </span>
                                 </button>
                              </li>
                           ))}
                        </ul>
                     )}
                  </section>
               )}
               {openSec === 'labs' && (
                  <LabDynamics patientId={patient.id} />
               )}

               {/* Photos Tab */}
               {openSec === 'documents' && (
                  <PatientPhotos patientId={patient.id} clinicId={patient.clinicId} token={token} />
               )}

               {/* ── To'lovlar (2026-11-21) ──────────────────────────────────
                   To'lanmagan qatorlar — kassa bilan BITTA manba (VisitCharge):
                   ilgari ro'yxat kalendar yozuvlaridan yasalardi va kartadagi
                   qarz kassadagidan farq qilardi. Ko'rinish tozalandi: sariq
                   quti, bosh harfli sarlavhalar va xom sana
                   («2026-11-21T07:34:54.752Z») yo'q; to'lov usuli o'zbekcha. */}
               {openSec === 'payments' && (
                  <div className="flex flex-col gap-4">
                     {unpaidCharges.length > 0 && (
                        <section aria-labelledby="pay-unpaid" className={secCls}>
                           <div className={secHead}>
                              <div className="min-w-0">
                                 <h3 id="pay-unpaid" className={secTitle}>{t('patients.details.payments.pendingTitle')}</h3>
                                 <p className="text-[13px] text-muted">
                                    {t('visit.due')}: <b className="font-semibold tabular-nums text-red-600 dark:text-red-400">{formatMoney(unpaidTotal)} UZS</b>
                                 </p>
                              </div>
                              {userRole !== UserRole.DOCTOR && (
                                 <button type="button" onClick={() => setIsChargeModalOpen(true)} className={secBtn}>
                                    <CreditCard className="w-4 h-4" aria-hidden="true" /> {t('card.takePayment')}
                                 </button>
                              )}
                           </div>
                           <ul className="divide-y divide-line">
                              {unpaidCharges.map(c => {
                                 const paid = c.paidAmount || 0;
                                 return (
                                    <li key={c.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                                       <span className="min-w-0 flex-1">
                                          <span className="block font-medium text-ink">
                                             {c.name}{c.quantity > 1 && <span className="font-normal text-muted"> ×{c.quantity}</span>}
                                          </span>
                                          <span className="block text-xs text-muted">
                                             {[c.createdAt ? formatDate(new Date(c.createdAt)) : '', c.doctorName].filter(Boolean).join(' · ')}
                                          </span>
                                       </span>
                                       <span className="text-right tabular-nums">
                                          <span className="block font-semibold text-red-600 dark:text-red-400">{formatMoney(c.total - paid)}</span>
                                          {paid > 0 && <span className="block text-xs text-muted">{t('visit.paid')}: {formatMoney(paid)}</span>}
                                       </span>
                                    </li>
                                 );
                              })}
                           </ul>
                        </section>
                     )}

                     <section aria-labelledby="pay-history" className={secCls}>
                        <div className={secHead}>
                           <div className="min-w-0">
                              <h3 id="pay-history" className={secTitle}>{t('patients.details.payments.historyTitle')}</h3>
                              <p className="text-[13px] text-muted">
                                 {t('patients.details.payments.totalPaid')}:{' '}
                                 <b className="font-semibold tabular-nums text-ink">
                                    {formatMoney((patientTransactions || [])
                                       .filter(tx => tx && tx.status === 'Paid' && tx.type !== 'Balance')
                                       .reduce((acc, tx) => acc + (Number(tx.amount) || 0), 0))} UZS
                                 </b>
                                 {(patient.balance || 0) > 0 && (
                                    <> · {t('patients.details.balance')} <b className="font-semibold tabular-nums text-ink">{formatMoney(patient.balance || 0)} UZS</b></>
                                 )}
                              </p>
                           </div>
                           {/* Yangi xizmat qo'shib to'lash. Mavjud qarz — yuqoridagi
                               «To'lov qabul qilish»: nomlari farq qilishi shart. */}
                           {userRole !== UserRole.DOCTOR && (
                              <button type="button" onClick={() => setIsAdvanceOpen(true)} className={secBtn}>
                                 <Plus className="w-4 h-4" aria-hidden="true" /> {t('card.payForService')}
                              </button>
                           )}
                        </div>
                        {patientTransactions.length === 0 ? (
                           <p className={secEmpty}>{t('patients.details.payments.historyEmpty')}</p>
                        ) : (
                           <ul className="divide-y divide-line">
                              {patientTransactions.map(tx => {
                                 const when = tx.date ? new Date(tx.date) : null;
                                 return (
                                    <li key={tx.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                                       <span className="min-w-0 flex-1">
                                          <span className="block font-medium text-ink">{tx.service || '—'}</span>
                                          <span className="block text-xs text-muted">
                                             {[
                                                when && !Number.isNaN(when.getTime()) ? formatDate(when) : '',
                                                getPaymentMethodLabel(tx.type),
                                                tx.discountPercent ? `${t('finance.table.discount')} −${tx.discountPercent}%` : '',
                                                tx.receivedByName || '',
                                             ].filter(Boolean).join(' · ')}
                                          </span>
                                       </span>
                                       <span className="tabular-nums font-semibold text-ink whitespace-nowrap">{formatMoney(Number(tx.amount) || 0)} UZS</span>
                                       {tx.status !== 'Paid' && <Badge status={tx.status} />}
                                       {/* Chek TAHRIRLANMAYDI, faqat chop etiladi: xato chek
                                           kassada qaytarish bilan yopiladi va iz qoldiradi. */}
                                       <button type="button" title={t('common.print')} aria-label={t('common.print')}
                                          onClick={() => { setReceiptTransaction(tx); setIsReceiptModalOpen(true); }}
                                          className="w-8 h-8 grid place-items-center rounded-lg text-faint hover:text-primary-600 hover:bg-elevated">
                                          <Printer className="w-4 h-4" />
                                       </button>
                                    </li>
                                 );
                              })}
                           </ul>
                        )}
                     </section>
                  </div>
               )}
               {/* Bo'lib to'lash — pul bilan bir joyda */}
               {openSec === 'payments' && patient && currentClinic && (
                  <InstallmentsTab
                     patientId={patient.id}
                     clinicId={currentClinic.id}
                     doctors={doctors}
                     currentUserName={myDoctor ? formatDoctorName(myDoctor) : undefined}
                  />
               )}
            </div>
            )}
            </div>
            </div>

            {/* ── TO'LOV OYNASI ─────────────────────────────────────────────
                Kassadagi bilan AYNAN BIR XIL oyna (`ChargePaymentModal`):
                qatorlarni belgilash, qisman to'lov, usullarga bo'lish,
                chegirma va qaytarish. Ilgari kartada o'zining alohida
                oynasi bor edi va u `Transaction` ga to'g'ridan-to'g'ri
                yozardi — ya'ni hisob qatori to'lanmagan bo'lib qolaverardi. */}
            <ServicePaymentModal
               isOpen={isAdvanceOpen}
               onClose={() => setIsAdvanceOpen(false)}
               patient={patient}
               services={services}
               receivedByName={currentUserName || (myDoctor ? formatDoctorName(myDoctor) : undefined)}
               clinic={currentClinic}
               addToast={(type, msg) => type === 'error' ? toast.error(msg) : toast.success(msg)}
               onDone={() => reloadClinical()}
               onPayDebt={() => { setIsAdvanceOpen(false); setIsChargeModalOpen(true); }}
            />

            <ChargePaymentModal
               isOpen={isChargeModalOpen}
               onClose={() => setIsChargeModalOpen(false)}
               patientName={formatFullName(patient)}
               charges={unpaidCharges}
               patientId={patient.id}
               receivedByName={currentUserName || (myDoctor ? formatDoctorName(myDoctor) : undefined)}
               role={userRole}
               clinic={currentClinic}
               addToast={(type, msg) => type === 'error' ? toast.error(msg) : toast.success(msg)}
               /* Oyna o'zi yopilmaydi — to'lovdan keyin chek shu yerda */
               onDone={() => reloadClinical()}
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

            {/* Xabar — yagona oyna: shablonlar bazadan, qarz serverdan. */}
            <SendMessageModal
               isOpen={isMessageModalOpen}
               onClose={() => setIsMessageModalOpen(false)}
               patient={patient}
               clinic={currentClinic}
            />

            {/* New Appointment Modal */}
            <AppointmentFormModal
               isOpen={isApptModalOpen}
               onClose={() => setIsApptModalOpen(false)}
               patient={patient}
               doctors={doctors}
               services={services}
               categories={categories}
               defaultDoctorId={defaultDoctorId || patient?.doctorId || undefined}
               onCreate={onAddAppointment}
            />

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
                                 <h4 className="font-bold text-ink">{icd10Query}</h4>
                              </div>
                              <div className="space-y-2 max-h-60 overflow-y-auto">
                                 {icd10Results.map(code => (
                                    <div
                                       key={code.code}
                                       className="p-3 border rounded-lg hover:bg-primary-50 dark:hover:bg-primary-900/20 cursor-pointer transition-colors"
                                       onClick={() => setSelectedCode(code)}
                                    >
                                       <div className="font-bold text-primary-600 dark:text-primary-400">{code.code}</div>
                                       <div className="text-sm text-muted">{code.name}</div>
                                    </div>
                                 ))}
                              </div>
                           </div>
                        ) : (
                           // Show Categories
                           <div className="space-y-2">
                              <p className="text-sm text-muted mb-2">{t('patients.details.modals.selectCategory')}:</p>
                              {[
                                 t('patients.details.modals.cat1'),
                                 t('patients.details.modals.cat2'),
                                 t('patients.details.modals.cat3'),
                                 t('patients.details.modals.cat4'),
                                 t('patients.details.modals.cat5')
                              ].map(category => (
                                 <div
                                    key={category}
                                    className="p-4 border rounded-lg hover:bg-elevated cursor-pointer flex justify-between items-center group"
                                    onClick={() => handleSearchICD10(category)}
                                 >
                                    <span className="font-medium text-ink">{category}</span>
                                    <ArrowLeft className="w-4 h-4 rotate-180 text-faint group-hover:text-primary-500 transition-colors" />
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
                           <label className="block text-sm font-medium text-muted mb-1">{t('patients.details.modals.notes')}</label>
                           <textarea
                              className="w-full border rounded-md p-3 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none"
                              rows={3}
                              placeholder={t('patients.details.modals.notesPlaceholder')}
                              value={diagnosisNote}
                              onChange={(e) => setDiagnosisNote(e.target.value)}
                           />
                        </div>
                     </div>
                  )}

                  <div className="flex justify-end gap-2 pt-4 border-t">
                     <Button type="button" variant="secondary" onClick={() => { setIsDiagnosisModalOpen(false); setSelectedCode(null); setIcd10Query(''); }}>{t('common.close')}</Button>
                     {selectedCode && <Button type="submit">{t('common.save')}</Button>}
                  </div>
               </form>
            </Modal>
         </div >

         {/* Print Template */}
         < div className="hidden print:block print:p-8 bg-surface text-black" >
            <div className="text-center mb-8 border-b-2 border-line pb-4">
               <h1 className="text-3xl font-bold uppercase tracking-wider mb-2">{currentClinic?.name || 'XClinic'}</h1>
               <p className="text-sm text-muted">{t('patientdetails.tish_davolash_va_diagnostika')}</p>
            </div>

            <div className="grid grid-cols-2 gap-8 mb-8">
               <div>
                  <h2 className="text-xs font-bold uppercase text-muted mb-1">{t('common.patient')}</h2>
                  <p className="text-xl font-bold">{formatFullName(patient)}</p>
                  <p className="text-sm">{showPatientPhone ? patient.phone : maskPhone(patient.phone)}</p>
                  <p className="text-sm">{formatDobDDMMYYYY(patient.dob)} ({calcAge(patient.dob) ?? ''} {t('patients.details.age')})</p>
               </div>
               <div className="text-right">
                  <h2 className="text-xs font-bold uppercase text-muted mb-1">{t('ui.sana')}</h2>
                  <p className="text-xl font-bold">{formatDate(new Date())}</p>
                  <p className="text-sm">{new Date().toLocaleTimeString('uz-UZ')}</p>
               </div>
            </div>

            {/* Diagnoses Section */}
            {
               diagnoses.length > 0 && (
                  <div className="mb-8">
                     <h3 className="text-lg font-bold border-b border-line mb-4 pb-1">{t('card.secDiagnoses')}</h3>
                     <div className="space-y-4">
                        {diagnoses.map(d => (
                           <div key={d.id} className="mb-4">
                              <div className="flex justify-between items-baseline mb-1">
                                 <span className="font-bold text-lg">{d.code} - {d.icd10?.name}</span>
                                 <span className="text-sm text-muted">{d.date}</span>
                              </div>
                              <div className="text-sm pl-4 border-l-2 border-line">
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
               <h3 className="text-lg font-bold border-b border-line mb-4 pb-1">{t('ui.qabul_bayoni')}</h3>
               <EncounterSummary
                  template={panelTemplate}
                  value={JSON.stringify(panelEncounterData)}
               />
            </div>

            <div className="mt-12 pt-8 border-t border-line flex justify-between">
               <div>
                  <p className="text-sm font-bold">{t('ui.shifokor')}</p>
                  <p className="mt-8 border-t border-black w-48 pt-1 text-xs text-center">{t('patients.details.print.signature')}</p>
               </div>
               <div className="text-right">
                  <p className="text-sm italic">{t('patientdetails.xclinic_orqali_chop_etildi')}</p>
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
                              : 'border-line hover:border-primary-300 hover:bg-elevated'
                           }`}
                     >
                        <div className="flex items-center gap-3">
                           <div className="w-10 h-10 rounded-full bg-primary-100 dark:bg-primary-900/50 flex items-center justify-center text-primary-600 dark:text-primary-400 font-bold">
                              {doc.firstName[0]}{doc.lastName[0]}
                           </div>
                           <div>
                              <p className="font-bold text-ink">Dr. {formatFullName(doc)}</p>
                              <p className="text-xs text-muted">{doc.specialty}</p>
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
                  <div className="text-center py-8 text-muted">
                     {t('patients.details.alerts.doctorNotFound')}
                  </div>
               )}
            </div>
            <div className="flex justify-end pt-4 mt-2 border-t border-line-soft">
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
