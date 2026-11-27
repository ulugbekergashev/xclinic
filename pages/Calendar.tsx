import React, { useState, useEffect, useMemo, useRef } from 'react';
import { doctorColor } from '../utils/chartColors';
import { toast } from '../services/toast';
import { formatDateToISO, dayKey } from '../utils/dateUtils';
import { Button } from '../components/Common';
import { ChevronDown, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { Appointment, Patient, Doctor, UserRole, Clinic, ServiceCategory, Service } from '../types';
import { PatientFormModal } from '../components/PatientFormModal';
import { AppointmentFormModal } from '../components/AppointmentFormModal';
import { SendMessageModal } from '../components/SendMessageModal';
import { AppointmentBlock } from '../components/calendar/AppointmentBlock';
import { AppointmentDetailsModal } from '../components/calendar/AppointmentDetailsModal';
import { DoctorChips } from '../components/calendar/DoctorChips';
import { BookingRequests } from '../components/calendar/BookingRequests';
import { api } from '../services/api';
import { markAppointmentArrived } from '../utils/arrival';
import { useNavigate } from 'react-router-dom';
import { permsFor } from '../utils/accessControl';
import { useLanguage, fill } from '../context/LanguageContext';
import { CalendarMonth } from '../components/CalendarMonth';
import { monthLabel, dayLabel, weekLabel } from '../utils/calendarLabels';
import { gridHours, isClosedAppt, layoutLanes, startMinutes } from '../utils/calendarLayout';

interface CalendarProps {
  appointments: Appointment[];
  patients: Patient[];
  doctors: Doctor[];
  /* `Service` — yagona haqiqat manbai (`types.ts`). */
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

type CalView = 'day' | 'week' | 'month';

/** Vaqt ustunining kengligi (px) — kun va hafta ko'rinishida bir xil */
const GUTTER_PX = 56;
/** Ustun sarlavhasi balandligi (px) — `h-14` */
const HEADER_PX = 56;
/** Bir soat balandligi chegaralari: ish kuni ekranga sig'adigan qilib
 *  hisoblanadi, lekin 30 daqiqalik blokda bir qator o'qiladigan darajadan
 *  kichraymaydi. */
const HOUR_MIN_PX = 48;
const HOUR_MAX_PX = 96;
/** Hafta ko'rinishida bir vaqtda chiziladigan eng ko'p yozuv (qolgani «+N») */
const WEEK_LANES = 1;
const VIEW_KEY = 'xclinic_cal_view';
const PHONE_QUERY = '(max-width: 767px)';

/** `YYYY-MM-DD` → MAHALLIY yarim tun. `new Date('2026-09-04')` UTC yarim
 *  tuni sifatida o'qiladi va kun solishtirishda siljib ketishi mumkin. */
const parseLocalDay = (key: string): Date => {
  const [y, m, d] = dayKey(key).split('-').map(Number);
  return y && m && d ? new Date(y, m - 1, d) : new Date(key);
};

/** Dushanbadan boshlanadigan hafta boshi (mahalliy) */
const startOfWeekLocal = (date: Date): Date => {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay();
  d.setDate(d.getDate() - day + (day === 0 ? -6 : 1));
  return d;
};

const initials = (doc: Doctor) =>
  `${(doc.lastName || '').charAt(0)}${(doc.firstName || '').charAt(0)}`.toUpperCase() || 'DR';

/* ISH VAQTIDAN TASHQARI — och chiziqlar. Yozib bo'ladi (ba'zan shifokor
   kechroq qoladi), lekin ko'z darhol ko'radi: bu soatda u ishlamaydi. */
const OFF_HOURS_BG =
  'repeating-linear-gradient(135deg, transparent 0 7px, color-mix(in srgb, var(--color-line) 55%, transparent) 7px 8px)';

/* BIRINCHI OCHILISHDA QAYSI KO'RINISH.
   Registrator va boshqalar — KUN: shifokorlar yonma-yon, «kim qachon bo'sh?»
   degan savolga shu javob beradi. Shifokor — HAFTA: o'z kuni «Bugun»da
   bor, kalendar unga oldindagi kunlarni ko'rsatadi. Foydalanuvchi
   tanlagan ko'rinish eslab qolinadi. Telefonda har doim kun. */
const initialView = (role: UserRole): CalView => {
  if (window.matchMedia(PHONE_QUERY).matches) return 'day';
  try {
    const saved = localStorage.getItem(VIEW_KEY);
    if (saved === 'day' || saved === 'week' || saved === 'month') return saved;
  } catch { /* xotira yopiq — sukut bo'yicha */ }
  return role === UserRole.DOCTOR ? 'week' : 'day';
};

export const Calendar: React.FC<CalendarProps> = ({
  appointments, patients, doctors, services, categories, onAddAppointment, onUpdateAppointment, onDeleteAppointment, onAddPatient, userRole, doctorId, currentClinic, onPatientClick
}) => {
  const { t, language } = useLanguage();
  const isDoctor = userRole === UserRole.DOCTOR && !!doctorId;

  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<CalView>(() => initialView(userRole));
  const chooseView = (v: CalView) => {
    setView(v);
    try { localStorage.setItem(VIEW_KEY, v); } catch { /* eslab qolinmaydi */ }
  };
  /* Telefonga torayganda — kun. Ilgari HAR QANDAY o'lcham o'zgarishida
     ko'rinish «Hafta»ga qaytarilardi va tanlangan «Kun» yo'qolardi. */
  useEffect(() => {
    const mq = window.matchMedia(PHONE_QUERY);
    const sync = () => { if (mq.matches) setView('day'); };
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  /* ─── OYNA TASHQARISI (FIX-PLAN 10.3) ────────────────────────────────────
     `App.tsx` kirishda oxirgi 45 kunni yuklaydi. Undan eskiroq davr
     tanlansa — serverdan olamiz, aks holda ekran «hech narsa bo'lmagan»
     deb yolg'on ko'rsatardi. Chegaralar MAHALLIY sana bo'yicha (oy va
     hafta birga: hafta ikki oyga tushishi mumkin). */
  const WINDOW_START = useMemo(
    () => formatDateToISO(new Date(Date.now() - 45 * 86400000)), []);
  const [rangeAppts, setRangeAppts] = useState<Appointment[] | null>(null);
  const rangeFrom = (() => {
    const monthStart = formatDateToISO(new Date(currentDate.getFullYear(), currentDate.getMonth(), 1));
    const weekStart = formatDateToISO(startOfWeekLocal(currentDate));
    return weekStart < monthStart ? weekStart : monthStart;
  })();
  const rangeTo = (() => {
    const monthEnd = formatDateToISO(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0));
    const ws = startOfWeekLocal(currentDate);
    const weekEnd = formatDateToISO(new Date(ws.getFullYear(), ws.getMonth(), ws.getDate() + 6));
    return weekEnd > monthEnd ? weekEnd : monthEnd;
  })();
  useEffect(() => {
    if (rangeFrom >= WINDOW_START || !currentClinic?.id) { setRangeAppts(null); return; }
    let alive = true;
    api.appointments.getAll(currentClinic.id, { from: rangeFrom, to: rangeTo })
      .then(a => { if (alive) setRangeAppts(a); })
      .catch(() => { if (alive) setRangeAppts(null); });
    return () => { alive = false; };
  }, [rangeFrom, rangeTo, currentClinic?.id, WINDOW_START]);

  const effectiveAppointments = rangeAppts ?? appointments;

  /* Shifokor filtri (S5.3). `null` — hammasi. */
  const [doctorFilter, setDoctorFilter] = useState<string | null>(null);

  /* USTUNDAGI SHIFOKORLAR. Shifokor o'zi kirganda — faqat o'zi: ilgari
     unga hamkasblarining bo'sh ustunlari ham chizilardi va ustiga
     bosilsa o'sha hamkasb nomiga yozuv ochilardi. */
  const allActive = doctors.filter(d => d.status === 'Active');
  const activeDoctors = isDoctor
    ? doctors.filter(d => d.id === doctorId)
    : allActive.filter(d => !doctorFilter || d.id === doctorFilter);

  /* Ish soatlari — ko'rinayotgan shifokorlarning eng keng oralig'i
     (bittasi bo'lsa — o'ziniki); hech kimda yo'q bo'lsa — klinikaniki. */
  const { workStart, workEnd } = useMemo(() => {
    const clinicStart = currentClinic?.startHour ?? 8;
    const clinicEnd = currentClinic?.endHour ?? 20;
    const starts = activeDoctors.map(d => d.startHour).filter((h): h is number => h != null);
    const ends = activeDoctors.map(d => d.endHour).filter((h): h is number => h != null);
    let from = starts.length ? Math.min(...starts) : clinicStart;
    let to = ends.length ? Math.max(...ends) : clinicEnd;
    if (!(from >= 0 && from <= 23)) from = clinicStart;
    if (!(to >= 1 && to <= 24) || to <= from) to = Math.max(from + 1, clinicEnd);
    return { workStart: from, workEnd: to };
  }, [activeDoctors.map(d => `${d.id}:${d.startHour}:${d.endHour}`).join('|'), currentClinic?.startHour, currentClinic?.endHour]);

  /* Ikki cheklov: SHIFOKOR faqat o'z yozuvlarini ko'radi (ruxsat);
     chip filtri — ko'rinishni toraytirish (qulaylik). */
  const filteredAppointments = (isDoctor
    ? effectiveAppointments.filter(a => a.doctorId === doctorId)
    : effectiveAppointments
  ).filter(a => !doctorFilter || a.doctorId === doctorFilter);

  const displayDays: Date[] = view === 'day'
    ? [new Date(currentDate)]
    : Array.from({ length: 7 }, (_, i) => {
      const s = startOfWeekLocal(currentDate);
      return new Date(s.getFullYear(), s.getMonth(), s.getDate() + i);
    });
  const displayKeys = displayDays.map(d => formatDateToISO(d));
  /* Ta'tildagi / o'chirilgan shifokorning shu kunga yozuvi bo'lsa — unga
     ham ustun: aks holda yozuv kunlik ko'rinishdan jimgina yo'qolardi
     (hafta va oyda esa ko'rinib turardi). */
  const extraDoctors = view === 'day' && !isDoctor
    ? doctors.filter(d => d.status !== 'Active' && (!doctorFilter || d.id === doctorFilter)
      && filteredAppointments.some(a => a.doctorId === d.id && dayKey(a.date) === displayKeys[0]))
    : [];
  const columnDoctors = [...activeDoctors, ...extraDoctors];
  const activeIds = new Set(columnDoctors.map(d => d.id));
  /* To'rda chiziladigan yozuvlar: ko'rinayotgan kunlar; kunlik
     ko'rinishda — ustuni bor shifokorlarniki. */
  const inView = filteredAppointments.filter(a =>
    displayKeys.includes(dayKey(a.date)) && (view !== 'day' || activeIds.has(a.doctorId)));

  /* To'r: ish soatlari + undan tashqaridagi yozuvlar (ilgari ular
     to'rdan chiqib, ko'rinmay qolardi). Oxirgi soat KIRMAYDI: 18:00 da
     tugaydigan kun 17:00–18:00 qatori bilan yopiladi. */
  const { gridStart, gridEnd } = gridHours(workStart, workEnd, inView);
  const HOURS = Array.from({ length: gridEnd - gridStart }, (_, i) => gridStart + i);

  /* SOAT BALANDLIGI — ekranga qarab. Ilgari 96px qotirilgan edi va
     1280×800 oynada kunning yarmi ham ko'rinmasdi; to'r esa 1200px ga
     qotirilib, kech soatlar kesilardi. */
  const scrollRef = useRef<HTMLDivElement>(null);
  const [viewportH, setViewportH] = useState(0);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setViewportH(el.clientHeight));
    ro.observe(el);
    setViewportH(el.clientHeight);
    return () => ro.disconnect();
  }, [view === 'month']);
  const fitted = viewportH ? Math.floor((viewportH - HEADER_PX) / HOURS.length / 2) * 2 : 64;
  const hourPx = Math.min(HOUR_MAX_PX, Math.max(HOUR_MIN_PX, fitted));
  const halfPx = hourPx / 2;
  const topFor = (minutes: number) => (minutes / 60 - gridStart) * hourPx;

  /* «HOZIR» — daqiqada bir yangilanadi */
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  const nowDate = new Date(nowTick);
  const nowMin = nowDate.getHours() * 60 + nowDate.getMinutes();
  const nowDayIndex = displayKeys.indexOf(formatDateToISO(nowDate));
  const showNow = view !== 'month' && nowDayIndex !== -1 && nowMin >= gridStart * 60 && nowMin < gridEnd * 60;
  const nowLabel = `${String(nowDate.getHours()).padStart(2, '0')}:${String(nowDate.getMinutes()).padStart(2, '0')}`;

  /* OCHILGANDA — kerakli joyga aylantiramiz: bugun bo'lsa hozirdan bir
     soat oldinga, aks holda birinchi yozuvga. */
  const firstStart = inView.reduce<number | null>((m, a) => {
    const s = startMinutes(a.time);
    return s == null ? m : m == null ? s : Math.min(m, s);
  }, null);
  const anchorMin = nowDayIndex !== -1 ? nowMin - 60 : firstStart != null ? firstStart - 30 : null;
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || view === 'month') return;
    el.scrollTop = anchorMin == null ? 0 : Math.max(0, topFor(anchorMin));
    // Faqat kun/ko'rinish/o'lcham o'zgarganda — har daqiqada emas
  }, [view, displayKeys[0], hourPx, gridStart, firstStart != null]);

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [editingApptId, setEditingApptId] = useState<string | null>(null);
  /* Xabar oynasi — YAGONA komponent (`SendMessageModal`). */
  const [isMessageModalOpen, setIsMessageModalOpen] = useState(false);
  const [messageAppt, setMessageAppt] = useState<Appointment | null>(null);
  /* Yozuv formasiga beriladigan boshlang'ich qiymatlar */
  const [formDefaults, setFormDefaults] = useState({ date: formatDateToISO(new Date()), time: '09:00', doctorId: '' });
  /* Yangi bemor — yagona forma (`PatientFormModal`). */
  const [isAddPatientModalOpen, setIsAddPatientModalOpen] = useState(false);

  const openAddModal = (initialDate?: string, initialTime?: string, initialDoctorId?: string) => {
    setEditingApptId(null);
    setFormDefaults({
      date: initialDate || formatDateToISO(new Date()),
      time: initialTime || '09:00',
      // berilgan → kirgan shifokor → birinchi shifokor
      doctorId: initialDoctorId || (isDoctor ? doctorId : '') || (doctors[0]?.id ?? ''),
    });
    setIsAddModalOpen(true);
  };

  const openEditModal = (appt: Appointment) => {
    setEditingApptId(appt.id);
    setFormDefaults({ date: appt.date, time: appt.time, doctorId: appt.doctorId || (doctors[0]?.id ?? '') });
    setIsAddModalOpen(true);
    setSelectedAppointment(null);
  };

  /* Oy bo'yicha siljish: oyning shu kuni yo'q bo'lsa (31 → 30) — oxirgi kuni */
  const shiftMonth = (delta: number) => {
    const last = new Date(currentDate.getFullYear(), currentDate.getMonth() + delta + 1, 0).getDate();
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + delta, Math.min(currentDate.getDate(), last)));
  };
  const shift = (dir: 1 | -1) => {
    if (view === 'month') { shiftMonth(dir); return; }
    const d = new Date(currentDate);
    d.setDate(d.getDate() + dir * (view === 'week' ? 7 : 1));
    setCurrentDate(d);
  };
  const openDay = (day: Date) => { setCurrentDate(day); setView('day'); };

  const weekdaysMonFirst = [
    t('calendar.days.mon'), t('calendar.days.tue'), t('calendar.days.wed'), t('calendar.days.thu'),
    t('calendar.days.fri'), t('calendar.days.sat'), t('calendar.days.sun'),
  ];
  const dayNames = [
    t('calendar.days.sun'), t('calendar.days.mon'), t('calendar.days.tue'),
    t('calendar.days.wed'), t('calendar.days.thu'), t('calendar.days.fri'), t('calendar.days.sat'),
  ];

  /* Chip va ustun sarlavhasidagi son — KO'RINAYOTGAN davr bo'yicha va
     filtrdan MUSTAQIL: filtr yoqilganda qolganlari nolga tushmasin. */
  const periodKeys = new Set(view === 'month'
    ? Array.from({ length: new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate() },
      (_, i) => formatDateToISO(new Date(currentDate.getFullYear(), currentDate.getMonth(), i + 1)))
    : displayKeys);
  const countByDoctor = new Map<string, number>();
  for (const a of effectiveAppointments) {
    if (isClosedAppt(a) || !periodKeys.has(dayKey(a.date))) continue;
    countByDoctor.set(a.doctorId, (countByDoctor.get(a.doctorId) || 0) + 1);
  }
  /* Kunning sig'imi — ko'rinayotgan shifokorlar ish vaqti yig'indisi (daqiqa) */
  const capacityMin = activeDoctors.reduce((sum, d) =>
    sum + Math.max(1, (d.endHour ?? currentClinic?.endHour ?? 20) - (d.startHour ?? currentClinic?.startHour ?? 8)) * 60, 0);

  /* Sana yozuvi bosilganda brauzerning sana tanlagichi ochiladi */
  const dateInputRef = useRef<HTMLInputElement>(null);
  const openDatePicker = () => {
    const el = dateInputRef.current;
    if (!el) return;
    try { el.showPicker(); } catch { el.focus(); }
  };
  const headerLabel = view === 'month' ? monthLabel(currentDate, language)
    : view === 'week' ? weekLabel(displayDays[0], displayDays[6], language)
      : dayLabel(displayDays[0], language);
  const todayKey = formatDateToISO(new Date());
  const showsToday = view === 'month'
    ? currentDate.getFullYear() === new Date().getFullYear() && currentDate.getMonth() === new Date().getMonth()
    : displayKeys.includes(todayKey);

  const [arriving, setArriving] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleArrived = async (appt: Appointment) => {
    setArriving(appt.id);
    try {
      const r = await markAppointmentArrived(appt, { doctors, services });
      if (r.appointmentNotClosed) toast.error(t('calendar.qabul_ochildi_holat_yangilanmadi'));
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
      toast.error(e?.message || t('ui.qabulni_ochib_bolmadi'));
    } finally {
      setArriving(null);
    }
  };

  const handleStatusUpdate = async (status: Appointment['status']) => {
    if (!selectedAppointment) return;
    try {
      await onUpdateAppointment(selectedAppointment.id, { status });
      setSelectedAppointment({ ...selectedAppointment, status });
    } catch {
      /* `App.tsx` toast ko'rsatadi; oynadagi holat eski qiymatda qoladi. */
    }
  };

  /* ESLATMA — SERVER shabloni bilan (`POST /appointments/:id/remind`):
     bitta shablon, jurnalda bog'lam, yozuvda «eslatma yuborilgan». */
  const [reminding, setReminding] = useState<string | null>(null);
  const handleRemind = async (appt: Appointment) => {
    setReminding(appt.id);
    try {
      await api.appointments.remind(appt.id);
      toast.success(t('calendar.eslatma_yuborildi'));
      setSelectedAppointment(prev => prev ? { ...prev, reminderSent: true } : prev);
    } catch (e: any) {
      toast.error(e?.data?.error || e?.message || t('calendar.eslatma_yuborilmadi'));
    } finally {
      setReminding(null);
    }
  };

  /* ─── TO'R GEOMETRIYASI ───────────────────────────────────────────────
     Ustunlar INLINE stil bilan: Tailwind `${...}` bilan yig'ilgan klass
     nomini manbadan topa olmaydi va CSS yaratmaydi. */
  const nCols = view === 'week' ? 7 : Math.max(1, columnDoctors.length);
  const gridCols: React.CSSProperties = {
    gridTemplateColumns: view === 'week'
      ? `${GUTTER_PX}px repeat(7, minmax(0, 1fr))`
      : `${GUTTER_PX}px repeat(${nCols}, minmax(200px, 1fr))`,
  };
  const colLeft = (col: number, frac = 0) => `calc(${GUTTER_PX}px + (100% - ${GUTTER_PX}px) * ${(col + frac) / nCols} + 2px)`;
  const colWidth = (frac: number) => `calc((100% - ${GUTTER_PX}px) * ${frac / nCols} - 4px)`;
  const bodyHeight = HOURS.length * hourPx;

  const renderHalfCells = (dateStr: string, docId?: string) => HOURS.map(hour => {
    const hh = String(hour).padStart(2, '0');
    const cell = 'cursor-pointer hover:bg-primary-500/[0.06] transition-colors';
    return (
      <React.Fragment key={hour}>
        <div style={{ height: halfPx }} className={`${cell} border-b border-dashed border-line-soft`} onClick={() => openAddModal(dateStr, `${hh}:00`, docId)} />
        <div style={{ height: halfPx }} className={`${cell} border-b border-line-soft`} onClick={() => openAddModal(dateStr, `${hh}:30`, docId)} />
      </React.Fragment>
    );
  });

  const offHours = (doc: Doctor) => {
    const s = Math.max(gridStart, doc.startHour ?? workStart);
    const e = Math.min(gridEnd, doc.endHour ?? workEnd);
    const bands: { top: number; height: number }[] = [];
    if (s > gridStart) bands.push({ top: 0, height: (s - gridStart) * hourPx });
    if (e < gridEnd) bands.push({ top: (e - gridStart) * hourPx, height: (gridEnd - e) * hourPx });
    return bands.map((b, i) => (
      <div key={i} aria-hidden="true" className="absolute inset-x-0 pointer-events-none" style={{ ...b, background: OFF_HOURS_BG }} />
    ));
  };

  const renderAppointments = () => {
    /* Kunlik ko'rinishda har shifokor — o'z ustuni; haftada bir kun
       ustunida hamma shifokor, shuning uchun bir yo'lak va «+N». */
    const { lanes, overflow } = layoutLanes(
      inView,
      a => view === 'day' ? `${dayKey(a.date)}-${a.doctorId}` : dayKey(a.date),
      view === 'week' ? WEEK_LANES : undefined,
    );

    const blocks = inView.map(app => {
      const s = startMinutes(app.time);
      if (s == null) return null;
      const col = view === 'week'
        ? displayKeys.indexOf(dayKey(app.date))
        : columnDoctors.findIndex(d => d.id === app.doctorId);
      if (col === -1) return null;
      const lane = lanes[app.id] ?? { col: 0, total: 1 };
      const lanesShown = view === 'week' ? Math.min(lane.total, WEEK_LANES) : lane.total;
      if (lane.col >= lanesShown) return null;
      const frac = 1 / lanesShown;
      const height = Math.max(halfPx * (app.duration || 30) / 30, 18) - 2;
      return (
        <AppointmentBlock
          key={app.id}
          appt={app}
          color={doctorColor(doctors.find(d => d.id === app.doctorId))}
          top={topFor(s) + 1}
          height={height}
          left={colLeft(col, lane.col * frac)}
          width={colWidth(frac)}
          onOpen={setSelectedAppointment}
        />
      );
    });

    /* «+N» — yashirilgan yozuvlar yo'qolmaydi, yig'iladi. Bosilsa o'sha
       kun kunlik ko'rinishda ochiladi: u yerda har shifokorning ustuni bor. */
    const chips = overflow.map(o => {
      const col = displayKeys.indexOf(dayKey(o.date));
      if (col === -1) return null;
      return (
        <button
          key={o.id}
          type="button"
          onClick={() => openDay(parseLocalDay(o.date))}
          title={fill(t('calendar.yana_x_ta_qabul'), o.count, o.names)}
          className="absolute z-[12] h-[18px] min-w-[26px] px-1 rounded-full bg-ink text-surface text-[10px] font-bold tabular-nums shadow-sm hover:opacity-90"
          style={{ top: topFor(o.startMin) + 4, left: `calc(${colLeft(col + 1)} - 34px)` }}
        >
          +{o.count}
        </button>
      );
    });

    /* «HOZIR» CHIZIG'I — bloklar OSTIDA (ustidan o'tsa yozuv o'chirilgandek
       ko'rinadi). Vaqt yorlig'i chap ustunda. */
    const nowLine = showNow ? (
      <div aria-hidden="true" className="absolute z-[5] pointer-events-none flex items-center"
        style={view === 'week'
          ? { top: topFor(nowMin), left: colLeft(nowDayIndex), width: colWidth(1) }
          : { top: topFor(nowMin), left: GUTTER_PX, right: 0 }}>
        <span className="-ml-1 w-2 h-2 rounded-full bg-red-500" />
        <span className="flex-1 border-t-2 border-red-500" />
      </div>
    ) : null;

    return <>{blocks}{chips}{nowLine}</>;
  };

  const liveInView = inView.filter(a => !isClosedAppt(a)).length;
  const headCell = 'h-14 border-r border-line-soft last:border-r-0';

  return (
    <div className="h-[calc(100vh-8.5rem)] min-h-[520px] flex flex-col gap-3 animate-fade-in">

      {/* ─── ASBOBLAR QATORI ─────────────────────────────────────────────
          Sahifa nomi chap menyuda belgilangan — bu yerda katta sarlavha
          o'rniga SANA turadi: kalendarda «qaysi kun?» savoli muhimroq. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <button type="button" onClick={() => setCurrentDate(new Date())}
          className={`h-9 px-3.5 rounded-xl border text-[13px] font-semibold transition-colors ${showsToday
            ? 'border-line bg-surface text-muted hover:text-ink hover:bg-elevated'
            : 'border-primary-500/40 bg-primary-500/10 text-primary-700 dark:text-primary-300 hover:bg-primary-500/15'}`}>
          {t('ui.bugun')}
        </button>
        <h1 className="sr-only">{t('calendar.title')}</h1>
        <div className="flex items-center gap-0.5 min-w-0">
          <button aria-label={t('calendar.oldingi')} onClick={() => shift(-1)}
            className="w-9 h-9 flex items-center justify-center rounded-xl text-muted hover:text-ink hover:bg-elevated transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button aria-label={t('calendar.keyingi')} onClick={() => shift(1)}
            className="w-9 h-9 flex items-center justify-center rounded-xl text-muted hover:text-ink hover:bg-elevated transition-colors">
            <ChevronRight className="w-5 h-5" />
          </button>
          {/* SANANI BOSIB ISTALGAN KUNGA O'TISH (alohida oy kalendari
              o'rniga — u haftani ekrandan siqib chiqarardi). */}
          <button type="button" onClick={openDatePicker} title={t('cal.pickDate')}
            className="relative ml-1 inline-flex items-center gap-1.5 h-9 px-2 rounded-xl text-xl font-semibold text-ink hover:bg-elevated transition-colors min-w-0">
            <span className="truncate">{headerLabel}</span>
            <ChevronDown className="w-4 h-4 text-faint shrink-0" />
            <input ref={dateInputRef} type="date" tabIndex={-1} aria-label={t('cal.pickDate')}
              value={formatDateToISO(currentDate)}
              onChange={e => { if (e.target.value) setCurrentDate(parseLocalDay(e.target.value)); }}
              className="absolute inset-0 opacity-0 pointer-events-none" />
          </button>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <div className="hidden md:flex items-center bg-elevated/70 rounded-xl p-1">
            {([['day', t('calendar.day')], ['week', t('calendar.week')], ['month', t('cal.month.tab')]] as const).map(([v, label]) => (
              <button key={v} type="button" onClick={() => chooseView(v)} aria-pressed={view === v}
                className={`h-7 px-3.5 rounded-lg text-[13px] transition-colors ${view === v ? 'bg-surface shadow-sm text-ink font-semibold' : 'text-muted hover:text-ink font-medium'}`}>
                {label}
              </button>
            ))}
          </div>
          {/* Argumentsiz: `onClick` ga to'g'ridan berilsa, React hodisani
              `initialDate` o'rniga uzatardi. */}
          <Button onClick={() => openAddModal()} className="h-10"><Plus className="w-4 h-4" /> {t('calendar.newAppointment')}</Button>
        </div>
      </div>

      {/* Shifokor filtri — chiplar; shifokorga kerak emas (u faqat
          o'zinikini ko'radi). */}
      {/* Saytdan/botdan kelgan so'rovlar — bo'lmasa blok chiqmaydi (0046) */}
      {!isDoctor && <BookingRequests appointments={effectiveAppointments} />}

      {!isDoctor && allActive.length > 0 && (
        <DoctorChips
          doctors={allActive}
          value={doctorFilter}
          counts={countByDoctor}
          label={t('cal.side.doctors')}
          allLabel={t('ui.hammasi')}
          onChange={setDoctorFilter}
        />
      )}

      <div className="flex-1 min-h-0 flex">
        {view === 'month' ? (
          <CalendarMonth
            month={currentDate}
            appointments={filteredAppointments}
            capacityMin={capacityMin}
            weekdays={weekdaysMonFirst}
            onOpenDay={openDay}
          />
        ) : (
          <div className="relative flex-1 min-w-0 bg-surface rounded-2xl border border-line overflow-hidden flex flex-col">
            <div ref={scrollRef} className="flex-1 overflow-auto">
              <div className={`relative w-full ${view === 'week' ? 'min-w-[860px]' : 'min-w-fit'}`}>

                {/* Ustun sarlavhalari */}
                <div style={gridCols} className="grid border-b border-line sticky top-0 z-30 bg-surface">
                  <div className={`${headCell} sticky left-0 z-40 bg-surface`} />
                  {view === 'week' ? displayDays.map((day, i) => {
                    const isToday = displayKeys[i] === todayKey;
                    return (
                      <button key={i} type="button" onClick={() => openDay(day)} title={t('cal.openDay')}
                        className={`${headCell} flex items-center justify-center gap-2 hover:bg-elevated transition-colors ${isToday ? 'bg-primary-500/[0.05]' : ''}`}>
                        <span className={`text-[13px] font-medium ${isToday ? 'text-primary-700 dark:text-primary-300' : 'text-muted'}`}>{dayNames[day.getDay()]}</span>
                        <span className={`inline-flex items-center justify-center min-w-7 h-7 px-1 rounded-full text-[14px] font-semibold tabular-nums ${isToday ? 'bg-primary-600 text-white' : 'text-ink'}`}>{day.getDate()}</span>
                      </button>
                    );
                  }) : columnDoctors.map(doc => {
                    const color = doctorColor(doc);
                    const n = countByDoctor.get(doc.id) || 0;
                    const hours = `${doc.startHour ?? workStart}:00–${doc.endHour ?? workEnd}:00`;
                    return (
                      <div key={doc.id} className={`${headCell} flex items-center gap-2.5 px-3 min-w-0`}>
                        <span aria-hidden="true" className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-white text-[11px] font-bold"
                          style={{ backgroundColor: color }}>{initials(doc)}</span>
                        <div className="min-w-0 flex-1 leading-tight">
                          <p className="text-[13px] font-semibold text-ink truncate">Dr. {doc.lastName}</p>
                          <p className="text-[11px] text-faint truncate">{doc.specialty ? `${doc.specialty} · ` : ''}{hours}</p>
                        </div>
                        {n > 0 && (
                          <span className="shrink-0 h-5 min-w-5 px-1.5 rounded-full text-[11px] font-semibold text-ink tabular-nums flex items-center justify-center"
                            style={{ background: `color-mix(in srgb, ${color} 16%, var(--color-surface))` }}>{n}</span>
                        )}
                      </div>
                    );
                  })}
                  {view === 'day' && columnDoctors.length === 0 && <div className={headCell} />}
                </div>

                {/* To'r */}
                <div style={{ ...gridCols, height: bodyHeight }} className="grid relative">
                  {/* Vaqt ustuni: yorliq soat chizig'ining USTIDA */}
                  <div className="relative border-r border-line bg-surface sticky left-0 z-20">
                    {HOURS.map((hour, i) => (
                      <div key={hour} style={{ height: hourPx }} className="relative">
                        <span className={`absolute right-2 text-[11px] text-faint tabular-nums ${i === 0 ? 'top-1' : '-top-2'}`}>{hour}:00</span>
                      </div>
                    ))}
                    {showNow && (
                      <span aria-hidden="true" className="absolute left-1 right-1 -translate-y-1/2 z-10 rounded-full bg-red-500 text-white text-[10px] font-bold tabular-nums text-center leading-4"
                        style={{ top: topFor(nowMin) }}>{nowLabel}</span>
                    )}
                  </div>

                  {view === 'week' ? displayDays.map((day, i) => (
                    <div key={i} className={`relative border-r border-line-soft last:border-r-0 ${displayKeys[i] === todayKey ? 'bg-primary-500/[0.03]' : ''}`}>
                      {renderHalfCells(displayKeys[i])}
                    </div>
                  )) : columnDoctors.length > 0 ? columnDoctors.map(doc => (
                    <div key={doc.id} className="relative border-r border-line-soft last:border-r-0">
                      {renderHalfCells(displayKeys[0], doc.id)}
                      {offHours(doc)}
                    </div>
                  )) : (
                    <div className="relative">{renderHalfCells(displayKeys[0])}</div>
                  )}

                  {renderAppointments()}
                </div>
              </div>
            </div>

            {/* Bo'sh kun — yalang'och to'r o'rniga bitta jimgina ishora */}
            {liveInView === 0 && (
              <div className="absolute inset-x-0 top-1/2 flex justify-center pointer-events-none z-30">
                <span className="px-3 py-1.5 rounded-full bg-surface/90 border border-line text-[12px] text-muted shadow-sm">
                  {t('cal.emptyHint')}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Yozuv formasi — YAGONA (`AppointmentFormModal`) */}
      <AppointmentFormModal
        isOpen={isAddModalOpen}
        onClose={() => { setIsAddModalOpen(false); setEditingApptId(null); }}
        appointment={editingApptId ? effectiveAppointments.find(a => a.id === editingApptId) || null : null}
        patients={patients}
        doctors={doctors}
        services={services}
        categories={categories}
        defaultDate={formDefaults.date}
        defaultTime={formDefaults.time}
        defaultDoctorId={formDefaults.doctorId}
        onAddPatientClick={() => setIsAddPatientModalOpen(true)}
        onCreate={onAddAppointment}
        onUpdate={onUpdateAppointment}
      />

      {selectedAppointment && (
        <AppointmentDetailsModal
          appt={selectedAppointment}
          arriving={arriving === selectedAppointment.id}
          reminding={reminding === selectedAppointment.id}
          canDelete={permsFor(userRole, currentClinic).can('calendar', 'appts', 'delete')}
          onClose={() => setSelectedAppointment(null)}
          onOpenPatient={onPatientClick}
          onEdit={openEditModal}
          onArrived={handleArrived}
          onRemind={handleRemind}
          onMessage={a => { setMessageAppt(a); setIsMessageModalOpen(true); }}
          onStatus={handleStatusUpdate}
          onDelete={onDeleteAppointment}
        />
      )}

      {/* Xabar — yagona oyna; yozuv sanasi/vaqti shablondagi {sana}/{vaqt} ga tushadi */}
      <SendMessageModal
        isOpen={isMessageModalOpen}
        onClose={() => { setIsMessageModalOpen(false); setMessageAppt(null); }}
        patient={patients.find(p => p.id === messageAppt?.patientId) || null}
        clinic={currentClinic}
        appointment={messageAppt
          ? { date: messageAppt.date, time: messageAppt.time, doctorName: messageAppt.doctorName }
          : null}
      />

      {/* Yangi bemor — yaratilgach yozuv formasida O'ZI tanlanadi */}
      <PatientFormModal
        isOpen={isAddPatientModalOpen}
        onClose={() => setIsAddPatientModalOpen(false)}
        onCreate={onAddPatient}
        doctors={doctors}
        userRole={userRole}
        doctorId={doctorId}
        compact
        onSaved={() => setIsAddPatientModalOpen(false)}
      />
    </div>
  );
};
