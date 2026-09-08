import React, { useState, useEffect, useMemo } from 'react';
import { formatDoctorName, formatFullName, formatNumber } from '../utils/format';
import {
    ComposedChart, Area, Line, BarChart, Bar, XAxis, YAxis,
    CartesianGrid, Tooltip, ResponsiveContainer, Cell, Legend,
} from 'recharts';
import { doctorColor } from '../utils/chartColors';
import { confirmAction } from '../services/confirm';
import { toast } from '../services/toast';
import { todayISO } from '../utils/dateUtils';
import { Card, Button, Modal, Input, Select, Badge, SearchableSelect } from '../components/Common';
import {
  ChevronLeft, ChevronRight, Plus, Clock, User, FileText,
  XCircle, CheckCircle, Send, Bell, Edit2, Loader2,
  Search
} from 'lucide-react';
import { Appointment, Patient, Doctor, UserRole, Clinic, ServiceCategory, Service } from '../types';
import { PatientFormModal } from '../components/PatientFormModal';
import { AppointmentFormModal } from '../components/AppointmentFormModal';
import { api } from '../services/api';
import { markAppointmentArrived } from '../utils/arrival';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext';

interface CalendarProps {
  appointments: Appointment[];
  patients: Patient[];
  doctors: Doctor[];
  /* `Service` — yagona haqiqat manbai (`types.ts`). Bu yerda uning
  QISQARTIRILGAN nusxasi yozilgan edi va u haqiqatdan farq qilardi:
  `duration` u yerda ixtiyoriy, bu yerda majburiy. Nusxa turlar
  ajralib ketishiga olib keladi. */
  services: Service[];
  categories: ServiceCategory[];
  onAddAppointment: (appt: Omit<Appointment, 'id' | 'clinicId'>) => Promise<void>;
  onUpdateAppointment: (id: string, data: Partial<Appointment>) => Promise<void>;
  onDeleteAppointment: (id: string) => void;
  onAddPatient: (patient: Omit<Patient, 'id' | 'clinicId'>) => Promise<Patient | undefined>;
  userRole: UserRole;
  doctorId: string;
  currentClinic?: Clinic;
  onPatientClick?: (id: string) => void;
}




export const Calendar: React.FC<CalendarProps> = ({
  appointments, patients, doctors, services, categories, onAddAppointment, onUpdateAppointment, onDeleteAppointment, onAddPatient, userRole, doctorId, currentClinic, onPatientClick
}) => {
  const { t } = useLanguage();

  // State
  const [currentDate, setCurrentDate] = useState(new Date());
  /* ─── OYNA TASHQARISI (FIX-PLAN 10.3) ────────────────────────────────────
     `App.tsx` kirishda oxirgi 45 kunni yuklaydi. Bu ekranda esa undan
     eskiroq davr tanlanishi mumkin — o'shanda propdagi ro'yxatda o'sha davr
     UMUMAN yo'q va ekran "hech narsa bo'lmagan" deb ko'rsatardi.
     Jimgina yolg'on — eng yomon xato turi. Shuning uchun serverdan olamiz. */
  const WINDOW_START = useMemo(
    () => new Date(Date.now() - 45 * 86400000).toISOString().split('T')[0], []);

  const [rangeAppts, setRangeAppts] = useState<Appointment[] | null>(null);
  useEffect(() => {
    // Ko'rinayotgan oyning chegaralari
    const y = currentDate.getFullYear(), m = currentDate.getMonth();
    const from = new Date(y, m, 1).toISOString().split('T')[0];
    const to = new Date(y, m + 1, 0).toISOString().split('T')[0];
    if (from >= WINDOW_START || !currentClinic?.id) { setRangeAppts(null); return; }
    let alive = true;
    api.appointments.getAll(currentClinic.id, { from, to })
      .then(a => { if (alive) setRangeAppts(a); })
      .catch(() => { if (alive) setRangeAppts(null); });
    return () => { alive = false; };
  }, [currentDate, currentClinic?.id, WINDOW_START]);

  const effectiveAppointments = rangeAppts ?? appointments;

  /* Shifokor filtri (S5.3). `null` — hammasi.
     E'lon shu yerda, chunki quyidagi `filteredAppointments` unga tayanadi. */
  const [doctorFilter, setDoctorFilter] = useState<string | null>(null);

  /* ─── SETKA SHIFOKOR SOATLARI BO'YICHA ────────────────────────────────

     Ilgari u FAQAT klinikaning umumiy soatidan qurilardi (8:00–20:00),
     holbuki har shifokorning o'z ish vaqti bor. Natijada ertalab 7 da
     boshlaydigan shifokorning birinchi qabuli setkadan tashqarida
     qolardi: yozuv bazada bor, kalendarda ko'rinmaydi — va buni
     tekshirishning yo'li yo'q edi.

     Bitta shifokor tanlangan bo'lsa uning soatlari; aks holda hamma faol
     shifokorning eng keng oralig'i. Hech kimda soat ko'rsatilmagan bo'lsa
     klinikanikiga qaytamiz. */
  const { startHour, endHour } = useMemo(() => {
    const pool = doctors.filter(d =>
      d.status === 'Active' && (!doctorFilter || d.id === doctorFilter));
    const starts = pool.map(d => d.startHour).filter((h): h is number => h != null);
    const ends = pool.map(d => d.endHour).filter((h): h is number => h != null);

    const clinicStart = currentClinic?.startHour ?? 8;
    const clinicEnd = currentClinic?.endHour ?? 20;
    let from = starts.length ? Math.min(...starts) : clinicStart;
    let to = ends.length ? Math.max(...ends) : clinicEnd;

    // Buzuq qiymatdan himoya: setka teskari yoki bo'sh bo'lib qolmasin
    if (!(from >= 0 && from <= 23)) from = clinicStart;
    if (!(to >= 0 && to <= 23) || to <= from) to = Math.max(from + 1, clinicEnd);
    return { startHour: from, endHour: to };
  }, [doctors, doctorFilter, currentClinic?.startHour, currentClinic?.endHour]);

  const HOURS = Array.from({ length: Math.max(1, endHour - startHour + 1) }, (_, i) => i + startHour);

  /* Ikki xil cheklov, ikkalasi ham qo'llanadi:
       • SHIFOKOR o'zi kirganda faqat o'z qabullarini ko'radi (ruxsat);
       • legenda filtri — ko'rinishni toraytirish (qulaylik). */
  const filteredAppointments = (userRole === UserRole.DOCTOR && doctorId
    ? effectiveAppointments.filter(a => a.doctorId === doctorId)
    : effectiveAppointments
  ).filter(a => !doctorFilter || a.doctorId === doctorFilter);

  const [view, setView] = useState<'day' | 'week'>('week');

  /* HISOBOT. Kalendar «kim qachon yozilgan» ni ko'rsatadi, lekin
     «qaysi kunlarda mijoz ko'p keladi» degan savolga javob bermaydi —
     buning uchun tarixni yig'ish kerak. Shuning uchun hisobot aynan shu
     yerda, kalendarning uchinchi ko'rinishi sifatida turadi: savol shu
     ekranda tug'iladi, javobi ham shu yerda bo'lgani ma'qul. */
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [editingApptId, setEditingApptId] = useState<string | null>(null);

  // Message Modal State
  const [isMessageModalOpen, setIsMessageModalOpen] = useState(false);
  const [messageText, setMessageText] = useState('');
  const [messageType, setMessageType] = useState('Custom');
  const [messagePatientId, setMessagePatientId] = useState<string | null>(null);

  // Add Form State
  const [formData, setFormData] = useState({
    patientId: '',
    doctorId: '',
    type: '',
    categoryId: '',
    date: todayISO(),
    time: '09:00',
    duration: 60,
    notes: ''
  });

  /* Yangi bemor — yagona forma (`PatientFormModal`). Bu yerda o'zining
     nusxasi bor edi: tekshiruvsiz, JSHSHIRsiz va takror bemor haqidagi
     savolsiz. */
  const [isAddPatientModalOpen, setIsAddPatientModalOpen] = useState(false);

  // Handle Resize for Responsive View
  React.useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 768) {
        setView('day');
      } else {
        setView('week');
      }
    };

    // Initial check
    handleResize();

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Open Add Modal with default values selected if available
  const openAddModal = (initialDate?: string, initialTime?: string, initialDoctorId?: string) => {
    setEditingApptId(null);
    /* `individual` tarifi merosi olib tashlandi: o'zgaruvchi hisoblanardi,
       lekin hech qayerda ishlatilmasdi. XClinic bitta klinikaga
       o'rnatiladi — tarif tushunchasi yo'q. */
    setFormData({
      patientId: patients.length > 0 ? patients[0].id : '',
      // Defolt shifokor: berilgan → kirgan shifokor (DOCTOR roli) → birinchi shifokor
      doctorId: initialDoctorId || (userRole === UserRole.DOCTOR && doctorId ? doctorId : '') || (doctors.length > 0 ? doctors[0].id : ''),
      type: '',
      categoryId: '',
      date: initialDate || todayISO(),
      time: initialTime || '09:00',
      duration: 60,
      notes: ''
    });
    setIsAddModalOpen(true);
  };

  const openEditModal = (appt: Appointment) => {
    setEditingApptId(appt.id);
    setFormData({
      patientId: appt.patientId,
      doctorId: appt.doctorId || (doctors.length > 0 ? doctors[0].id : ''),
      type: appt.type,
      categoryId: '',
      date: appt.date,
      time: appt.time,
      duration: appt.duration,
      notes: appt.notes || ''
    });
    setIsAddModalOpen(true);
    setSelectedAppointment(null);
  };

  // Helper: Get start of current week (Monday)
  const getStartOfWeek = (date: Date) => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
    const monday = new Date(d.setDate(diff));
    return monday;
  };

  // Helper: Get days to display
  const getDisplayDays = (date: Date, currentView: 'day' | 'week') => {
    if (currentView === 'day') {
      return [new Date(date)];
    }

    const days = [];
    const start = getStartOfWeek(new Date(date));
    for (let i = 0; i < 7; i++) {
      const day = new Date(start);
      day.setDate(start.getDate() + i);
      days.push(day);
    }
    return days;
  };

  const displayDays = getDisplayDays(currentDate, view);


  /* Kunlik ko'rinishda ustunlar ham filtrga bo'ysunadi — aks holda
     filtr yoqilganda bo'sh ustunlar qatori qolib ketardi. */
  const activeDoctors = doctors
    .filter(d => d.status === 'Active')
    .filter(d => !doctorFilter || d.id === doctorFilter);
  /* HAFTA + HAMMA SHIFOKOR = O'QIB BO'LMAYDIGAN EKRAN.

     Hafta ko'rinishida bir kunning USTUNI ~140px. Bir vaqtda 6 ta
     shifokorda qabul bo'lsa, oltalasi shu 140px ni bo'lishadi — har
     biriga 23px tushadi va bemor ismi «Tosh...» ga aylanadi. Ya'ni
     ekran to'la, lekin undan hech narsa o'qib bo'lmaydi.

     Sabab pastdagi `getGroupKey`: hafta ko'rinishida u faqat SANA
     bo'yicha guruhlaydi, shifokorni hisobga olmaydi — shuning uchun
     turli shifokorlarning bir vaqtdagi qabullari bir-biriga raqib
     bo'lib qoladi. Kunlik ko'rinishda esa shifokor alohida ustun.

     Yechim: siqilgan holatda ism yozishga URINMAYMIZ. Blok rangli
     chiziqqa aylanadi (kun qanchalik band ekani baribir ko'rinadi),
     ism esa sichqoncha ustiga kelganda chiqadi. Ismlarni ro'yxat
     bo'lib o'qish uchun shifokor tanlanadi — o'shanda ustun bo'linmaydi. */

  /* USTUNLAR — KLASS EMAS, INLINE STIL.

     Ilgari bu yerda shunday yozilgan edi:
         `grid-cols-[60px_repeat(${activeDoctors.length},minmax(200px,1fr))]`

     Tailwind klasslarni MANBA MATNIDAN qidirib topadi va shu topilganlari
     uchun CSS yozadi. `${...}` bilan yig'ilgan nom manbada hech qachon
     to'liq holda uchramaydi — ya'ni bu klass uchun CSS umuman
     yaratilmagan. Natijada kunlik ko'rinishda grid'ning ustunlari
     e'lon qilinmay qolgan va shifokorlar yonma-yon emas, bir-birining
     ostiga tik qatorga tushib qolgan; vaqt ustuni ham joyidan chiqqan.

     Inline stil Tailwind'ga bog'liq emas — u to'g'ridan-to'g'ri
     brauzerga boradi va har qanday shifokorlar soni bilan ishlaydi. */
  const gridCols: React.CSSProperties = view === 'week'
    ? { gridTemplateColumns: 'repeat(8, minmax(0, 1fr))' }
    : activeDoctors.length > 0
      ? { gridTemplateColumns: `60px repeat(${activeDoctors.length}, minmax(200px, 1fr))` }
      : { gridTemplateColumns: '60px 1fr' };

  // Handlers
  const handlePrev = () => {
    const newDate = new Date(currentDate);
    if (view === 'week') {
      newDate.setDate(newDate.getDate() - 7);
    } else {
      newDate.setDate(newDate.getDate() - 1);
    }
    setCurrentDate(newDate);
  };

  const handleNext = () => {
    const newDate = new Date(currentDate);
    if (view === 'week') {
      newDate.setDate(newDate.getDate() + 7);
    } else {
      newDate.setDate(newDate.getDate() + 1);
    }
    setCurrentDate(newDate);
  };

  const [arriving, setArriving] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleArrived = async (appt: Appointment) => {
    setArriving(appt.id);
    try {
      const r = await markAppointmentArrived(appt, { doctors, services });
      if (r.appointmentNotClosed) {
        toast.error("Qabul ochildi, lekin kalendardagi yozuv holati yangilanmadi");
      }
      setSelectedAppointment(null);
      /* Darhol bemor kartasiga — qabul o'sha yerda olib boriladi. */
      navigate(`/patients/${appt.patientId}?visit=${r.visit.id}`);
    } catch (e: any) {
      const f = e?.failure;
      if (f?.code === 'EXISTS') {
        setSelectedAppointment(null);
        navigate(`/patients/${appt.patientId}?visit=${f.visitId}`);
        return;
      }
      toast.error(e?.message || "Qabulni ochib bo'lmadi");
    } finally {
      setArriving(null);
    }
  };

  const handleStatusUpdate = async (status: Appointment['status']) => {
    if (selectedAppointment) {
      try {
        await onUpdateAppointment(selectedAppointment.id, { status });
        setSelectedAppointment({ ...selectedAppointment, status }); // Optimistic update for modal
      } catch (error) {
        /* `App.tsx` toast ko'rsatadi va xatoni qayta uloqtiradi. Bu yerda
           MODALDAGI holatni orqaga qaytarish kerak: yuqoridagi optimistik
           yangilanish qolib ketsa, oyna «bajarildi» deb ko'rsatadi, baza
           esa eski holatda turadi. */
        setSelectedAppointment(prev => prev ? { ...prev } : prev);
      }
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messagePatientId) return;

    try {
      await api.patients.sendMessage(messagePatientId, messageText);
      toast.success('Xabar muvaffaqiyatli yuborildi!');
      setIsMessageModalOpen(false);
      setMessageText('');
    } catch (error: any) {
      console.error('Error sending message:', error);
      if (error.message === 'Bot not configured' || error.error === 'Bot not configured') {
        toast.error('⚠️ Bot sozlanmagan. Iltimos, Sozlamalar bo\'limida bot tokenini kiriting.');
      } else if (error.message === 'Patient telegram not linked' || error.error === 'Patient telegram not linked') {
        toast.error('⚠️ Bemor Telegram botga ulanmagan. Iltimos, bemorga bot havolasini yuboring.');
      } else {
        toast.error(`Xatolik: ${error.message || 'Xabar yuborishda xatolik yuz berdi.'}`);
      }
    }
  };

  /* ESLATMA — SERVER shabloni bilan.

     Ilgari eslatma matni SHU YERDA, brauzerda yig'ilardi va oddiy
     «xabar yuborish» yo'lidan ketardi. Ikki oqibati bor edi:
     jurnalda xabar qaysi YOZUVGA tegishli ekani qolmasdi (`refId`,
     `type: 'Reminder'` yo'q edi), va matn serverdagi shablondan
     ajralib ketgan edi — avtomatik eslatma boshqacha yozardi.

     Endi `POST /appointments/:id/remind`: bitta shablon, jurnalda
     bog'lam, va yozuvda «eslatma yuborilgan» bayrog'i. */
  const [reminding, setReminding] = useState<string | null>(null);

  const handleRemind = async (appt: Appointment) => {
    setReminding(appt.id);
    try {
      await api.appointments.remind(appt.id);
      toast.success('Eslatma yuborildi');
      setSelectedAppointment(prev => prev ? { ...prev, reminderSent: true } : prev);
    } catch (e: any) {
      toast.error(e?.data?.error || e?.message || 'Eslatma yuborilmadi');
    } finally {
      setReminding(null);
    }
  };

  /* Erkin matnli xabar — alohida yo'l. Shablon endi bu yerda
     tayyorlanmaydi. */
  const openMessageModal = (appt: Appointment) => {
    setMessagePatientId(appt.patientId);
    setMessageType('Custom');
    setMessageText('');
    setIsMessageModalOpen(true);
  };

  // UI Data
  const dayNames = [
    t('calendar.days.sun'), t('calendar.days.mon'), t('calendar.days.tue'), 
    t('calendar.days.wed'), t('calendar.days.thu'), t('calendar.days.fri'), 
    t('calendar.days.sat')
  ];

  return (
    <div className="space-y-6 h-[calc(100vh-8rem)] flex flex-col animate-fade-in">

      {/* Controls */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-4 w-full sm:w-auto">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('calendar.title')}</h1>
          <div className="flex items-center bg-white dark:bg-gray-800 rounded-md shadow-sm border border-gray-200 dark:border-gray-700 flex-1 sm:flex-none justify-between sm:justify-start">
            <button aria-label="Oldingi" onClick={handlePrev} className="p-2 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300"><ChevronLeft className="w-4 h-4" /></button>
            <span className="px-4 text-sm font-medium min-w-[140px] text-center">
              {view === 'week'
                ? `${displayDays[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${displayDays[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                : displayDays[0].toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
              }
            </span>
            <button aria-label="Keyingi" onClick={handleNext} className="p-2 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300"><ChevronRight className="w-4 h-4" /></button>
          </div>
          {/* View Toggle for Desktop/Tablet */}
          <div className="hidden md:flex bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
            <button
              onClick={() => setView('day')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${view === 'day' ? 'bg-white dark:bg-gray-600 shadow text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'}`}
            >
              {t('calendar.day')}
            </button>
            <button
              onClick={() => setView('week')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${view === 'week' ? 'bg-white dark:bg-gray-600 shadow text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'}`}
            >
              {t('calendar.week')}
            </button>
          </div>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          {/* `openAddModal(initialDate?, initialTime?, initialDoctorId?)` —
              to'g'ridan-to'g'ri `onClick` ga berilsa, React unga SICHQONCHA
              HODISASINI birinchi argument qilib uzatadi va u `initialDate`
              bo'lib tushadi. Argumentsiz chaqiramiz. */}
          <Button onClick={() => openAddModal()} className="flex-1 sm:flex-none"><Plus className="w-4 h-4 mr-2" /> {t('calendar.newAppointment')}</Button>
        </div>
      </div>

      {/* SHIFOKOR RANGI VA FILTRI (S5.3, audit B-18).

          Audit: «Legendadagi 6 nuqta ham bir xil ko'k, qabul bloklari
          ham. Legenda bosilmaydi, shifokor bo'yicha filtr yo'q».

          Rang endi barqaror (`doctorColor` — `Doctor.color` bazada NULL
          bo'lsa ID dan hisoblanadi), legenda esa FILTR: bosilganda shu
          shifokorning qabullari qoladi, ikkinchi bosish bekor qiladi. */}
      <div className="flex flex-wrap items-center gap-2 px-1 py-1">
        {doctors.filter(d => d.status === 'Active').map(doc => {
          const on = doctorFilter === doc.id;
          return (
            <button
              key={doc.id}
              type="button"
              onClick={() => setDoctorFilter(on ? null : doc.id)}
              aria-pressed={on}
              title={on ? 'Filtrni bekor qilish' : `Faqat Dr. ${doc.lastName}`}
              className={`flex items-center gap-2 px-2.5 py-1 rounded-full border text-xs font-medium transition-colors
                ${on
                  ? 'border-gray-900 dark:border-white bg-gray-900 dark:bg-white text-white dark:text-gray-900'
                  : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'}`}
            >
              <span className="w-3 h-3 rounded-full shadow-sm shrink-0"
                    style={{ backgroundColor: doctorColor(doc) }} />
              Dr. {doc.lastName}
            </button>
          );
        })}
        {doctorFilter && (
          <button type="button" onClick={() => setDoctorFilter(null)}
            className="text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline px-1">
            Hammasi
          </button>
        )}
      </div>

      {/* DAVOMAT HISOBOTI BU YERDAN KO'CHDI — Moliya → Hisobot →
          «Davomat». Kalendar ish ekrani: unda yoziladi, ko'chiriladi va
          «keldi» belgilanadi. Uch oylik grafik esa egaga oyda bir marta
          kerak, lekin u kalendar bilan bitta tugmalar qatorida turgani
          uchun kalendar har ochilganda og'ir so'rov ham ketardi. */}
      {(
      /* Calendar Grid */
      <div className="flex-1 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col relative">
        <div className="flex-1 overflow-auto">
          <div className={`h-full relative ${view === 'week' ? 'min-w-[1000px]' : activeDoctors.length > 2 ? 'min-w-fit' : 'w-full'}`}>
            {/* Header Row */}
            <div style={gridCols} className="grid border-b border-gray-200 dark:border-gray-700 sticky top-0 z-30 bg-white dark:bg-gray-800">
              <div className="p-4 border-r border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 sticky left-0 z-40"></div>
              {view === 'week' ? (
                displayDays.map((day, i) => {
                  const isToday = day.toDateString() === new Date().toDateString();
                  return (
                    <div key={i} className={`p-4 text-center border-r border-gray-100 dark:border-gray-700 last:border-0 ${isToday ? 'bg-primary-50/50 dark:bg-primary-900/10' : ''}`}>
                      <p className={`text-sm font-semibold ${isToday ? 'text-primary-600' : 'text-gray-900 dark:text-white'}`}>{dayNames[day.getDay()]}</p>
                      <p className={`text-xs ${isToday ? 'text-primary-500' : 'text-gray-500 dark:text-gray-400'}`}>{day.getDate()}</p>
                    </div>
                  );
                })
              ) : (
                activeDoctors.length > 0 ? (
                  activeDoctors.map((doc, i) => (
                    <div key={doc.id} className="p-3 text-center border-r border-gray-100 dark:border-gray-700 last:border-0">
                      <div className="flex items-center justify-center gap-2">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: doctorColor(doc) }} />
                        <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">Dr. {doc.lastName}</p>
                      </div>
                      <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate">{doc.specialty}</p>
                    </div>
                  ))
                ) : (
                  <div className="p-4 text-center border-r border-gray-100 dark:border-gray-700">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">{dayNames[displayDays[0].getDay()]}</p>
                    <p className="text-xs text-gray-500">{displayDays[0].getDate()}</p>
                  </div>
                )
              )}
            </div>

            {/* Body */}
            <div style={gridCols} className="grid h-[1200px] relative">
              {/* Time Column */}
              <div className="border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 sticky left-0 z-20">
                {HOURS.map(hour => (
                  <React.Fragment key={hour}>
                    <div className="h-12 border-b border-gray-100 dark:border-gray-700/50 text-xs text-gray-400 p-2 text-right">{hour}:00</div>
                    <div className="h-12 border-b border-gray-100 dark:border-gray-700/50"></div>
                  </React.Fragment>
                ))}
              </div>

              {/* Days/Doctors Columns */}
              {view === 'week' ? (
                displayDays.map((day, i) => {
                  const dateStr = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
                  return (
                    <div key={i} className="border-r border-gray-100 dark:border-gray-700 last:border-0 relative">
                      {HOURS.map(hour => {
                        const formattedHour = hour.toString().padStart(2, '0');
                        return (
                          <React.Fragment key={hour}>
                            <div
                              className="h-12 border-b border-gray-50 dark:border-gray-800/50 cursor-pointer hover:bg-primary-50/30 dark:hover:bg-primary-900/10 transition-colors"
                              onClick={() => openAddModal(dateStr, `${formattedHour}:00`)}
                            ></div>
                            <div
                              className="h-12 border-b border-gray-50 dark:border-gray-800/50 cursor-pointer hover:bg-primary-50/30 dark:hover:bg-primary-900/10 transition-colors"
                              onClick={() => openAddModal(dateStr, `${formattedHour}:30`)}
                            ></div>
                          </React.Fragment>
                        );
                      })}
                    </div>
                  );
                })
              ) : (
                activeDoctors.length > 0 ? (
                  activeDoctors.map((doc, i) => {
                    const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`;
                    return (
                      <div key={doc.id} className="border-r border-gray-100 dark:border-gray-700 last:border-0 relative">
                        {HOURS.map(hour => {
                          const formattedHour = hour.toString().padStart(2, '0');
                          return (
                            <React.Fragment key={hour}>
                              <div
                                className="h-12 border-b border-gray-50 dark:border-gray-800/50 cursor-pointer hover:bg-primary-50/30 dark:hover:bg-primary-900/10 transition-colors"
                                onClick={() => openAddModal(dateStr, `${formattedHour}:00`, doc.id)}
                              ></div>
                              <div
                                className="h-12 border-b border-gray-50 dark:border-gray-800/50 cursor-pointer hover:bg-primary-50/30 dark:hover:bg-primary-900/10 transition-colors"
                                onClick={() => openAddModal(dateStr, `${formattedHour}:30`, doc.id)}
                              ></div>
                            </React.Fragment>
                          );
                        })}
                      </div>
                    );
                  })
                ) : (
                  <div className="border-r border-gray-100 dark:border-gray-700 last:border-0 relative">
                    {HOURS.map(hour => {
                      const formattedHour = hour.toString().padStart(2, '0');
                      const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`;
                      return (
                        <React.Fragment key={hour}>
                          <div className="h-12 border-b border-gray-50 dark:border-gray-800/50 cursor-pointer" onClick={() => openAddModal(dateStr, `${formattedHour}:00`)}></div>
                          <div className="h-12 border-b border-gray-50 dark:border-gray-800/50 cursor-pointer" onClick={() => openAddModal(dateStr, `${formattedHour}:30`)}></div>
                        </React.Fragment>
                      );
                    })}
                  </div>
                )
              )}

              {/* Appointments Overlay */}
              {/* Appointments Overlay */}
              {(() => {
                // Calculate layout data for overlapping appointments
                const layoutData: Record<string, { col: number; total: number }> = {};

                /* Hafta ko'rinishida bir vaqtda ko'rsatiladigan eng ko'p
                   qabul — BITTA.

                   Avval ikkita edi. Ekranga qarab tekshirilganda ma'lum
                   bo'ldiki, 140px lik ustunni ikkiga bo'lib, yana «+N»
                   yorlig'iga ham joy ajratilsa, har blokka ~50px qoladi
                   va ism yana «T.. Bog…» bo'lib kesiladi. Ya'ni ikkita
                   o'qib bo'lmaydigan ism paydo bo'ladi.

                   Bitta blokka ~104px tegadi va ism to'liq o'qiladi.
                   Bitta o'qiladigan ism ikkita o'qilmaydiganidan afzal:
                   hafta ko'rinishining vazifasi — mo'ljal olish, to'liq
                   ro'yxat kunlik ko'rinishda. */
                const WEEK_LANES = 1;
                const overflow: { id: string; date: string; time: string; minutes: number; count: number; names: string }[] = [];

                // Group by day (+ doctor if in day view) to handle overlaps independently
                const getGroupKey = (app: Appointment) => view === 'day' ? `${app.date}-${app.doctorId}` : app.date;
                const dayGroups: Record<string, Appointment[]> = {};
                filteredAppointments.forEach(app => {
                  const key = getGroupKey(app);
                  if (!dayGroups[key]) dayGroups[key] = [];
                  dayGroups[key].push(app);
                });

                Object.values(dayGroups).forEach(dayAppts => {
                  const sorted = [...dayAppts].sort((a, b) => a.time.localeCompare(b.time));
                  const groups: Appointment[][] = [];

                  sorted.forEach(app => {
                    let placed = false;
                    for (const group of groups) {
                      const overlaps = group.some(other => {
                        const startA = new Date(`${app.date}T${app.time}`).getTime();
                        const endA = startA + app.duration * 60000;
                        const startB = new Date(`${other.date}T${other.time}`).getTime();
                        const endB = startB + other.duration * 60000;
                        return Math.max(startA, startB) < Math.min(endA, endB);
                      });
                      if (overlaps) { group.push(app); placed = true; break; }
                    }
                    if (!placed) groups.push([app]);
                  });

                  groups.forEach(group => {
                    const columns: string[][] = [];
                    group.forEach(app => {
                      let colIndex = 0;
                      while (true) {
                        if (!columns[colIndex]) { columns[colIndex] = [app.id]; break; }
                        const overlapsInCol = columns[colIndex].some(otherId => {
                          const other = group.find(o => o.id === otherId)!;
                          const startA = new Date(`${app.date}T${app.time}`).getTime();
                          const endA = startA + app.duration * 60000;
                          const startB = new Date(`${other.date}T${other.time}`).getTime();
                          const endB = startB + other.duration * 60000;
                          return Math.max(startA, startB) < Math.min(endA, endB);
                        });
                        if (!overlapsInCol) { columns[colIndex].push(app.id); break; }
                        colIndex++;
                      }
                    });
                    group.forEach(app => {
                      layoutData[app.id] = { col: columns.findIndex(c => c.includes(app.id)), total: columns.length };
                    });

                    /* HAMMASINI CHIZMAYMIZ.

                       Hafta ustuni ~140px. Bir vaqtga 6 ta qabul to'g'ri
                       kelsa, oltalasini sig'dirishga urinish ikkala
                       ma'noda ham ishlamaydi: ism yozilsa «Tosh…» bo'lib
                       kesiladi, rangli to'rtburchakka aylantirilsa esa
                       ekran o'qib bo'lmaydigan yamoqqa aylanadi.

                       Shuning uchun ikkitasi ODDIY ko'rinishda qoladi
                       (ism o'qiladi), qolganlari bitta «+N ta» yorlig'iga
                       yig'iladi. Yorliq bosilsa o'sha kun kunlik
                       ko'rinishda ochiladi — u yerda har shifokorning
                       o'z ustuni bor va joy yetadi.

                       Kunlik ko'rinishda cheklov yo'q: u yerda ustunlar
                       shifokorlarga bo'lingan, siqilish yuzaga kelmaydi. */
                    if (view === 'week' && columns.length > WEEK_LANES) {
                      const hidden = group.filter(a => layoutData[a.id].col >= WEEK_LANES);
                      if (hidden.length) {
                        const ms = (a: Appointment) => new Date(`${a.date}T${a.time}`).getTime();
                        const s0 = Math.min(...hidden.map(ms));
                        const e0 = Math.max(...hidden.map(a => ms(a) + a.duration * 60000));
                        const d0 = new Date(s0);
                        overflow.push({
                          id: 'ov-' + group[0].id,
                          date: hidden[0].date,
                          time: `${String(d0.getHours()).padStart(2, '0')}:${String(d0.getMinutes()).padStart(2, '0')}`,
                          minutes: Math.max(30, (e0 - s0) / 60000),
                          count: hidden.length,
                          names: hidden.map(a => `${a.time} · ${a.patientName}`).join('\n'),
                        });
                      }
                    }
                  });
                });

                const blocks = filteredAppointments.map(app => {
                  const appDate = new Date(app.date);
                  const dayIndex = displayDays.findIndex(d => d.toDateString() === appDate.toDateString());
                  if (dayIndex === -1 && view === 'week') return null;
                  if (view === 'day' && app.date !== currentDate.toISOString().split('T')[0]) return null;

                  const [h, m] = app.time.split(':').map(Number);
                  if (isNaN(h)) return null;

                  const topOffset = ((h - startHour) * 96) + (m >= 30 ? 48 : 0) + (m % 30 / 30 * 48);
                  const height = (app.duration / 30) * 48;

                  const { col = 0, total = 1 } = layoutData[app.id] || {};

                  /* Chegaradan tashqaridagilar chizilmaydi — ular «+N ta»
                     yorlig'ida hisobga olingan. */
                  const over = view === 'week' && total > WEEK_LANES;
                  if (over && col >= WEEK_LANES) return null;

                  /* Yorliq uchun o'ng chetdan joy ajratamiz, qolgani
                     ko'rinadigan ikkitasiga teng bo'linadi. */
                  const span = over ? 74 : 100;
                  const lanes = over ? WEEK_LANES : total;
                  const colWidth = span / lanes;
                  const colOffset = col * colWidth;

                  let left = '';
                  let width = '';

                  if (view === 'week') {
                    left = `calc(${(dayIndex + 1) * (100 / 8)}% + 2px + ${(colOffset / 100) * (100 / 8)}%)`;
                    width = `calc(${(colWidth / 100) * (100 / 8)}% - 4px)`;
                  } else {
                    const docIndex = activeDoctors.findIndex(d => d.id === app.doctorId);
                    if (docIndex === -1 && activeDoctors.length > 0) return null; // Shouldn't happen with filtered appointments

                    const numDocs = Math.max(1, activeDoctors.length);
                    const docColumnWidth = `(100% - 60px) / ${numDocs}`;
                    
                    left = `calc(60px + (${docIndex === -1 ? 0 : docIndex} * (${docColumnWidth})) + ${(colOffset / 100)} * (${docColumnWidth}) + 2px)`;
                    width = `calc(${(colWidth / 100)} * (${docColumnWidth}) - 4px)`;
                  }

                  const doctor = doctors.find(d => d.id === app.doctorId);
                  const blockColor = doctorColor(doctor);

                  /* SIQILGANMI? `total` — shu vaqtda nechta qabul yonma-yon
                     turgani. Hafta ustuni ~140px, ya'ni uchtadan boshlab
                     har biriga 45px dan kam joy qoladi va ism kesiladi.

                     Shart `total` ga tayanadi, ekran kengligiga emas:
                     kun bo'sh bo'lsa (bir-ikkita qabul) ism hafta
                     ko'rinishida ham to'liq ko'rinaveradi. */


                  /* Shaffoflikni faqat HEX ga qo'shsa bo'ladi. Shifokor
                     rangi bazadan keladi (`Doctor.color`) va Sozlamalardan
                     `rgb(...)` yoki nom ko'rinishida kiritilishi mumkin —
                     unga `20` qo'shilsa CSS butunlay yaroqsiz bo'lib,
                     blok yana fonsiz qolardi. */
                  const withAlpha = (c: string, a: string) =>
                      /^#[0-9a-fA-F]{6}$/.test(c) ? c + a : c;
                  const tip = `${app.time} · ${app.patientName} · ${app.type}${app.doctorName ? ' · Dr. ' + app.doctorName : ''}`;

                  const statusColors = {
                    'Confirmed': 'border-current',
                    'Checked-In': 'border-current',
                    'Completed': 'border-current opacity-80',
                    'Pending': 'border-current border-dashed',
                    'Cancelled': 'border-red-500 bg-red-50 text-red-700 opacity-50',
                    'No-Show': 'border-gray-400 bg-gray-100 text-gray-500 opacity-50'
                  }[app.status] || 'border-current';

                  const isSpecialStatus = app.status === 'Cancelled' || app.status === 'No-Show';

                  return (
                    <div
                      key={app.id}
                      onClick={() => setSelectedAppointment(app)}
                      title={tip}
                      className={`absolute m-1 p-2 rounded-md border-l-4 text-xs shadow-sm cursor-pointer transition-all z-10 hover:brightness-95 ${isSpecialStatus ? statusColors : ''}`}
                      style={!isSpecialStatus ? {
                        top: `${topOffset}px`,
                        left: left,
                        width: width,
                        height: `${height - 4}px`,
                        /* `doctorColor` — FUNKSIYA, rang emas. Bu yerda u
                           to'g'ridan-to'g'ri qo'yilgan edi: shablonga
                           qo'yilganda funksiyaning kodi satrga aylanardi
                           («(doc)=>{...}15»), CSS uni tashlab yuborardi va
                           bloklar fonsiz qolardi. Natijada oltala
                           shifokorning qabuli bir xil ko'k ko'rinardi —
                           audit legenda haqida aytgan gap aslida
                           BLOKLARGA ham tegishli edi.

                           `blockColor` — 826-qatorda hisoblangan haqiqiy
                           rang; `20` — shaffoflik (hex alpha). */
                        backgroundColor: withAlpha(blockColor, '20'),
                        borderLeftColor: blockColor,
                        color: blockColor,
                      } : {
                        top: `${topOffset}px`,
                        left: left,
                        width: width,
                        height: `${height - 4}px`,
                      }}
                    >
                      <div className="font-bold truncate pr-4 flex items-center justify-between">
                        <span className="truncate">{app.patientName}</span>
                        {app.status === 'Completed' && <CheckCircle className="w-3 h-3 flex-shrink-0" />}
                      </div>
                      {app.reminderSent && (
                        <div className="absolute top-1 right-1">
                          <Bell className="w-3 h-3 text-primary-600 dark:text-primary-400 fill-current" />
                        </div>
                      )}
                      <div className="truncate opacity-75">{app.type}</div>
                      {height > 40 && (
                        <div className="flex items-center mt-1 gap-1 text-[10px]">
                          <div className="w-4 h-4 rounded-full bg-white/30 flex items-center justify-center text-[9px]">{app.doctorName[0]}</div>
                          {app.time}
                        </div>
                      )}
                    </div>
                  );
                });

                /* «+N ta» YORLIG'I. Ko'rsatilmagan qabullar shu yerda
                   hisobga olinadi — ular yo'qolmaydi, yig'iladi.
                   Bosilsa o'sha kun kunlik ko'rinishda ochiladi. */
                const chips = overflow.map(o => {
                  const dayIndex = displayDays.findIndex(d => d.toDateString() === new Date(o.date).toDateString());
                  if (dayIndex === -1) return null;
                  const [h, m] = o.time.split(':').map(Number);
                  if (isNaN(h)) return null;
                  const topOffset = ((h - startHour) * 96) + (m / 60) * 96;
                  const height = Math.max(26, (o.minutes / 30) * 48);

                  return (
                    <div
                      key={o.id}
                      onClick={() => { setCurrentDate(new Date(o.date)); setView('day'); }}
                      title={`Yana ${o.count} ta qabul:\n${o.names}\n\nKunlik ko'rinishda ochish uchun bosing`}
                      className="absolute m-1 rounded-md border border-dashed border-gray-400 dark:border-gray-500 bg-gray-100/80 dark:bg-gray-700/60 text-[10px] font-semibold text-gray-600 dark:text-gray-300 flex items-center justify-center cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors z-10"
                      style={{
                        top: `${topOffset}px`,
                        left: `calc(${(dayIndex + 1) * (100 / 8)}% + 2px + ${(74 / 100) * (100 / 8)}%)`,
                        width: `calc(${(26 / 100) * (100 / 8)}% - 4px)`,
                        height: `${height - 4}px`,
                      }}
                    >
                      +{o.count}
                    </div>
                  );
                });

                return <>{blocks}{chips}</>;
              })()}

            </div>
          </div>
        </div>
      </div>
      )}

      {/* Yozuv formasi — YAGONA (`AppointmentFormModal`). Bemor
          kartasidagi nusxa ham shu komponentga o'tdi: u yerda o'zining
          to'qnashuv tekshiruvi bor edi va u brauzerga yuklangan
          ro'yxatga qarab ishlardi. */}
      <AppointmentFormModal
        isOpen={isAddModalOpen}
        onClose={() => { setIsAddModalOpen(false); setEditingApptId(null); }}
        appointment={editingApptId ? appointments.find(a => a.id === editingApptId) || null : null}
        patients={patients}
        doctors={doctors}
        services={services}
        categories={categories}
        defaultDate={formData.date}
        defaultTime={formData.time}
        defaultDoctorId={formData.doctorId}
        onAddPatientClick={() => setIsAddPatientModalOpen(true)}
        onCreate={onAddAppointment}
        onUpdate={onUpdateAppointment}
      />

      {/* Appointment Details Modal */}
      {selectedAppointment && (
        <Modal isOpen={!!selectedAppointment} onClose={() => setSelectedAppointment(null)} title={t('calendar.appointmentDetails')}>
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2
                  className={`text-xl font-bold text-gray-900 dark:text-white ${onPatientClick ? 'cursor-pointer hover:text-primary-600 transition-colors hover:underline title-transition' : ''}`}
                  onClick={() => {
                    if (onPatientClick) {
                      onPatientClick(selectedAppointment.patientId);
                      setSelectedAppointment(null);
                    }
                  }}
                  title={onPatientClick ? "Bemor profiliga o'tish" : ""}
                >
                  {selectedAppointment.patientName}
                </h2>
                <p className="text-gray-500 text-sm">{selectedAppointment.type}</p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => openEditModal(selectedAppointment)}
                  className="p-1.5 text-gray-500 hover:text-primary-600 hover:bg-primary-50 dark:text-gray-400 dark:hover:bg-gray-800 rounded-md transition-colors"
                  title="Qabulni tahrirlash"
                >
                  <Edit2 className="w-5 h-5" />
                </button>
                <Badge status={selectedAppointment.status} />
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-3 text-gray-700 dark:text-gray-300">
                <Clock className="w-5 h-5 text-gray-400" />
                <span>{selectedAppointment.date}, {selectedAppointment.time} ({selectedAppointment.duration} daq)</span>
              </div>
              <div className="flex items-center gap-3 text-gray-700 dark:text-gray-300">
                <User className="w-5 h-5 text-gray-400" />
                <span>{selectedAppointment.doctorName}</span>
              </div>
              {selectedAppointment.notes && (
                <div className="flex items-start gap-3 text-gray-700 dark:text-gray-300">
                  <FileText className="w-5 h-5 text-gray-400 mt-0.5" />
                  <p className="text-sm bg-gray-50 dark:bg-gray-800 p-3 rounded-md border border-gray-100 dark:border-gray-700 w-full">
                    {selectedAppointment.notes}
                  </p>
                </div>
              )}
            </div>

            <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
              {/* Action Buttons */}
              <div className="flex flex-wrap gap-2 justify-end">
                {/* Initial States: Pending, Confirmed or Checked-In (Legacy support) */}
                {(selectedAppointment.status === 'Pending' || selectedAppointment.status === 'Confirmed' || selectedAppointment.status === 'Checked-In') && (
                  <div className="flex flex-wrap gap-2 w-full">
                    {/* Eslatma — server shabloni bilan, bir bosishda. */}
                    <Button
                      variant="secondary"
                      className={`${selectedAppointment.reminderSent ? 'bg-green-100 text-green-700 border-green-200' : ''} flex-1`}
                      disabled={reminding === selectedAppointment.id}
                      onClick={() => handleRemind(selectedAppointment)}
                    >
                      {reminding === selectedAppointment.id
                        ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        : <Bell className="w-4 h-4 mr-2" />}
                      {selectedAppointment.reminderSent ? 'Eslatma yuborilgan' : 'Eslatma'}
                    </Button>

                    <Button
                      variant="secondary"
                      className="flex-1"
                      onClick={() => openMessageModal(selectedAppointment)}
                    >
                      <Send className="w-4 h-4 mr-2" />
                      {t('calendar.sendMessage')}
                    </Button>

                    <button
                      onClick={() => handleStatusUpdate('No-Show')}
                      className="inline-flex items-center justify-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 dark:bg-gray-800 dark:text-gray-200 dark:border-gray-600 dark:hover:bg-gray-700 flex-1"
                    >
                      <XCircle className="w-4 h-4 mr-2 text-red-500" />
                      {t('calendar.noShow')}
                    </button>

                    {/* BEKOR QILISH. Ilgari bunday tugma UMUMAN yo'q edi:
                        bemor oldindan qo'ng'iroq qilib bekor qilsa,
                        registratorda ikki yo'l bor edi — «Kelmadi» deb
                        belgilash (bu yolg'on) yoki yozuvni butunlay
                        o'chirish (bu tarixni yo'q qiladi).

                        Endi holat `Cancelled` bo'lib qoladi: kim, qachon
                        va nima bo'lgani ko'rinib turadi. */}
                    <button
                      onClick={async () => {
                        if (await confirmAction({
                          title: 'Yozuv bekor qilinsinmi?',
                          body: "Yozuv tarixda qoladi — o'chirilmaydi.",
                          confirmLabel: 'Bekor qilish',
                        })) handleStatusUpdate('Cancelled');
                      }}
                      className="inline-flex items-center justify-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 dark:bg-gray-800 dark:text-gray-200 dark:border-gray-600 dark:hover:bg-gray-700 flex-1"
                    >
                      <XCircle className="w-4 h-4 mr-2 text-gray-400" />
                      Bekor qilish
                    </button>

                    {/* «KELDI» — ilgari bu yerda «Yakunlash» turardi va u
                        yozuv holatini o'zgartirib qo'yardi, LEKIN hech qanday
                        qabul yaratmasdi: bemor «qabul qilingan» ko'rinardi,
                        tizimda esa na tashxis, na xizmat, na pul qatori
                        bo'lardi. Ko'prik faqat Registraturada bor edi. */}
                    <button
                      onClick={() => handleArrived(selectedAppointment)}
                      disabled={arriving === selectedAppointment.id}
                      className="inline-flex items-center justify-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 flex-1"
                    >
                      {arriving === selectedAppointment.id
                        ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        : <CheckCircle className="w-4 h-4 mr-2" />}
                      {t('calendar.arrived')}
                    </button>
                  </div>
                )}

                {/* Read Only States */}
                {(selectedAppointment.status === 'Completed' || selectedAppointment.status === 'Cancelled' || selectedAppointment.status === 'No-Show') && (
                  <div className="flex gap-2">
                    <Button variant="secondary" onClick={() => setSelectedAppointment(null)}>{t('common.close')}</Button>
                    <Button
                      variant="ghost"
                      className="text-red-500 hover:text-red-700"
                      onClick={async () => {
                        if (await confirmAction({ title: 'Haqiqatan ham bu qabulni butunlay o\'chirmoqchimisiz?', danger: true, confirmLabel: "O'chirish" })) {
                          try {
                            await onDeleteAppointment(selectedAppointment.id);
                            setSelectedAppointment(null);
                          } catch {
                            /* Xato xabarini `App.tsx` toast ko'rsatadi.
                               Oyna ATAYLAB ochiq qoladi: o'chirish
                               bajarilmagan bo'lsa, uni yopish
                               «bajarildi» degan taassurot beradi. */
                          }
                        }
                      }}
                    >
                      {t('common.delete')}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </Modal>
      )}
      {/* Message Modal */}
      <Modal isOpen={isMessageModalOpen} onClose={() => setIsMessageModalOpen(false)} title={t('calendar.sendMessage')}>
        <form onSubmit={handleSendMessage} className="space-y-4">
          {/* «Xabar turi» tanlovi OLIB TASHLANDI: uning uchta varianti
              faqat matnni oldindan to'ldirardi va hech qayerda
              saqlanmasdi. Eslatma endi alohida tugmada, server
              shabloni bilan. Bu yer — erkin matn uchun. */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('calendar.messageText')}</label>
            <textarea
              className="w-full border rounded-md p-3 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-white focus:ring-2 focus:ring-primary-500 focus:outline-none"
              rows={4}
              placeholder={t('calendar.messageText')}
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              required
            />
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="secondary" onClick={() => setIsMessageModalOpen(false)}>{t('common.cancel')}</Button>
            <Button type="submit">{t('common.send')}</Button>
          </div>
        </form>
      </Modal>

      {/* Add Patient Modal */}
      {/* Yangi bemor — yagona forma. Yaratilgach yozuv formasida
          O'ZI TANLANADI: ilgari foydalanuvchi ro'yxatdan qaytadan
          qidirishi kerak edi (eski kodda buni tan olgan izoh ham bor
          edi: «for now, the user can select from the dropdown»). */}
      <PatientFormModal
        isOpen={isAddPatientModalOpen}
        onClose={() => setIsAddPatientModalOpen(false)}
        onCreate={onAddPatient}
        doctors={doctors}
        userRole={userRole}
        doctorId={doctorId}
        compact
        onSaved={(p) => {
          setIsAddPatientModalOpen(false);
          setFormData(prev => ({ ...prev, patientId: p.id }));
        }}
      />


    </div>
  );
};
