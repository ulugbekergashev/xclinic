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



/* ─────────────────────────────────────────────────────────────────────
   DAVOMAT HISOBOTI.

   «Qaysi kunlarda mijoz yaxshi kelyapti?» — klinika egasining jadval
   tuzishdagi asosiy savoli. Kam keladigan kunga ko'p shifokor qo'yish
   ham, gavjum kunga kam qo'yish ham zarar.

   Hisobot kalendarning ichida turadi (uchinchi ko'rinish), chunki savol
   aynan shu ekranga qarab tug'iladi.
   Grafiklar `recharts` da — loyihada allaqachon shu ishlatiladi
   (Boshqaruv paneli, Shifokorlar tahlili, Moliya hisoboti), ya'ni
   yangi kutubxona qo'shilmadi va uslub bir xil bo'lib qoldi.
   ───────────────────────────────────────────────────────────────── */
const StatTile: React.FC<{ label: string; value: string; hint?: string; tone?: 'ok' | 'warn' | 'plain' }> =
  ({ label, value, hint, tone = 'plain' }) => (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
      <div className="text-xs text-gray-500 dark:text-gray-400">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${
        tone === 'ok' ? 'text-emerald-600 dark:text-emerald-400'
        : tone === 'warn' ? 'text-amber-600 dark:text-amber-400'
        : 'text-gray-900 dark:text-white'}`}>{value}</div>
      {hint && <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{hint}</div>}
    </div>
  );

/* Grafiklar `recharts` da — loyihada allaqachon shu ishlatiladi
   (Boshqaruv paneli, Shifokorlar tahlili, Moliya hisoboti). Yangi
   kutubxona qo'shish kerak emas va uslub bir xil bo'lib qoladi. */
const AXIS = '#9ca3af';
const GRID = '#374151';

/* Grafik ustidagi izoh oynasi. Recharts ning o'zinikisi oq fonli va
   to'q mavzuda o'qilmaydi, shuning uchun o'zimizniki. */
const ChartTip: React.FC<any> = ({ active, payload, label, suffix }) => {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 shadow-lg text-xs">
      <div className="font-semibold text-gray-900 dark:text-white mb-1">{label}</div>
      {payload.map((x: any) => (
        <div key={x.dataKey} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: x.color || x.fill }} />
          <span className="text-gray-500 dark:text-gray-400">{x.name}:</span>
          <span className="font-medium text-gray-900 dark:text-white tabular-nums">
            {formatNumber(x.value)}{suffix || ''}
          </span>
        </div>
      ))}
    </div>
  );
};

const AttendanceReport: React.FC<{
  data: any; busy: boolean; days: number; onDays: (d: number) => void; error: string | null;
}> = ({ data, busy, days, onDays, error }) => {
  if (busy && !data) {
    return <div className="flex-1 grid place-items-center text-gray-400 py-20">Hisobot yig'ilmoqda…</div>;
  }
  if (!data) {
    /* Sabab KO'RSATILADI. Ilgari bu yerda quruq «yuklab bo'lmadi»
       turardi va nima bo'lganini bilishning iloji yo'q edi — server
       eskimi, tarmoqmi, ruxsatmi, hech narsa aytilmasdi. */
    return (
      <div className="flex-1 grid place-items-center py-20 px-4">
        <div className="text-center max-w-md">
          <div className="text-gray-500 dark:text-gray-400 mb-2">Hisobotni yuklab bo'lmadi.</div>
          {error && (
            <div className="text-xs font-mono text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2 mb-2">
              {error}
            </div>
          )}
          <div className="text-xs text-gray-400">
            Agar «404» yozilgan bo'lsa — server eski versiyada ishlayapti, uni qayta ishga tushirish kerak.
          </div>
        </div>
      </div>
    );
  }

  const t = data.totals || {};
  const wd = data.byWeekday || [];
  const docs = data.byDoctor || [];

  /* Kunlik qator. Sana «24.08» ko'rinishida — grafik o'qi ostida
     to'liq sana sig'maydi. */
  const daily = (data.byDay || []).map((d: any) => ({
    ...d,
    label: d.date.slice(8, 10) + '.' + d.date.slice(5, 7),
    revenueK: Math.round((d.revenue || 0) / 1000),
  }));

  const hours = (data.byHour || []).filter((h: any) => h.booked > 0)
    .map((h: any) => ({ ...h, label: h.hour + ':00', kelmagan: Math.max(0, h.booked - h.arrived) }));

  const wdChart = wd.map((w: any) => ({ ...w, short: w.name.slice(0, 3) }));
  const maxWd = Math.max(1, ...wd.map((w: any) => w.avgVisits || 0));

  return (
    <div className="flex-1 overflow-auto space-y-4 pb-4">

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-gray-500 dark:text-gray-400">Davr:</span>
        {[30, 90, 365].map(d => (
          <button key={d} type="button" onClick={() => onDays(d)}
            className={`px-3 py-1 text-xs font-medium rounded-full border transition-colors ${
              days === d
                ? 'border-primary-600 bg-primary-600 text-white'
                : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
            {d === 365 ? '1 yil' : `${d} kun`}
          </button>
        ))}
        <span className="text-xs text-gray-400 ml-1">
          {data.range?.from} — {data.range?.to} · {data.range?.days} kunda yozuv bor
        </span>
        {busy && <span className="text-xs text-gray-400">yangilanmoqda…</span>}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <StatTile label="Yozilgan" value={formatNumber(t.booked)} hint="kalendardagi yozuvlar" />
        <StatTile label="Kelgan" value={formatNumber(t.arrived)} tone="ok" hint={`${t.arrivalRate}%`} />
        <StatTile label="Kelmagan" value={formatNumber(t.noShow)} tone={t.noShowRate > 15 ? 'warn' : 'plain'}
                  hint={`${t.noShowRate}% — ogohlantirmasdan`} />
        <StatTile label="Bekor qilingan" value={formatNumber(t.cancelled)} hint="oldindan aytgan" />
        <StatTile label="Tushum" value={formatNumber(t.revenue)} hint="so'm, shu davrda" />
      </div>

      {data.best && data.worst && data.best.name !== data.worst.name && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
          <div className="text-sm text-gray-600 dark:text-gray-300">
            Eng gavjum kun — <b className="text-emerald-600 dark:text-emerald-400">{data.best.name}</b>,
            kuniga o'rtacha <b>{data.best.avgVisits}</b> ta qabul.
            Eng bo'shi — <b className="text-amber-600 dark:text-amber-400">{data.worst.name}</b>,
            <b> {data.worst.avgVisits}</b> ta.
            {data.worst.avgVisits > 0 && (
              <> Farqi <b>{Math.round((data.best.avgVisits / data.worst.avgVisits) * 10) / 10} barobar</b>.</>
            )}
          </div>
          <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            Shifokorlar jadvalini shu nisbatga qarab tuzish mumkin.
          </div>
        </div>
      )}

      {/* ── Kunlik dinamika ─────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
        <h3 className="font-semibold text-gray-900 dark:text-white">Kunma-kun</h3>
        <p className="text-xs text-gray-400 mb-3">
          Ustunlar — yozilgan va kelgan; chiziq — tushum (ming so'm, o'ng o'q)
        </p>
        {daily.length === 0 ? (
          <div className="text-sm text-gray-400 py-10 text-center">Bu davrda yozuv yo'q</div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={daily} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} opacity={0.15} vertical={false} />
              <XAxis dataKey="label" stroke={AXIS} fontSize={10} tickLine={false} interval="preserveStartEnd" minTickGap={18} />
              <YAxis yAxisId="l" stroke={AXIS} fontSize={10} tickLine={false} axisLine={false} width={32} />
              <YAxis yAxisId="r" orientation="right" stroke="#059669" fontSize={10} tickLine={false} axisLine={false} width={44} />
              <Tooltip content={<ChartTip />} cursor={{ fill: GRID, opacity: 0.1 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar yAxisId="l" dataKey="booked" name="Yozilgan" fill="#93B4F5" radius={[3, 3, 0, 0]} />
              <Bar yAxisId="l" dataKey="arrived" name="Kelgan" fill="#2563EB" radius={[3, 3, 0, 0]} />
              <Line yAxisId="r" type="monotone" dataKey="revenueK" name="Tushum (ming)" stroke="#059669" strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* ── Hafta kunlari ────────────────────────────────────── */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
          <h3 className="font-semibold text-gray-900 dark:text-white">Hafta kunlari</h3>
          <p className="text-xs text-gray-400 mb-3">Kuniga o'rtacha nechta qabul</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={wdChart} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} opacity={0.15} vertical={false} />
              <XAxis dataKey="short" stroke={AXIS} fontSize={11} tickLine={false} />
              <YAxis stroke={AXIS} fontSize={10} tickLine={false} axisLine={false} width={28} />
              <Tooltip content={<ChartTip />} cursor={{ fill: GRID, opacity: 0.1 }} />
              <Bar dataKey="avgVisits" name="Kuniga o'rtacha" radius={[4, 4, 0, 0]}>
                {wdChart.map((w: any) => (
                  <Cell key={w.weekday}
                        fill={w.avgVisits >= maxWd * 0.85 ? '#059669'
                            : w.avgVisits <= maxWd * 0.45 ? '#D97706' : '#2563EB'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <p className="text-xs text-gray-400 mt-1">
            Yashil — eng gavjum, sariq — eng bo'sh kunlar.
          </p>
        </div>

        {/* ── Soatlar ──────────────────────────────────────────── */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
          <h3 className="font-semibold text-gray-900 dark:text-white">Kun davomida</h3>
          <p className="text-xs text-gray-400 mb-3">Qaysi soatda gavjum</p>
          {hours.length === 0 ? (
            <div className="text-sm text-gray-400 py-16 text-center">Ma'lumot yo'q</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={hours} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} opacity={0.15} vertical={false} />
                <XAxis dataKey="label" stroke={AXIS} fontSize={10} tickLine={false} />
                <YAxis stroke={AXIS} fontSize={10} tickLine={false} axisLine={false} width={28} />
                <Tooltip content={<ChartTip />} cursor={{ fill: GRID, opacity: 0.1 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="arrived" name="Kelgan" stackId="h" fill="#2563EB" radius={[0, 0, 0, 0]} />
                <Bar dataKey="kelmagan" name="Kelmagan" stackId="h" fill="#94A3B8" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ── Shifokorlar ────────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
        <h3 className="font-semibold text-gray-900 dark:text-white">Shifokorlar bo'yicha</h3>
        <p className="text-xs text-gray-400 mb-3">Yozuvlar soni va nechtasi kelgani</p>
        {docs.length === 0 ? (
          <div className="text-sm text-gray-400 py-10 text-center">Ma'lumot yo'q</div>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(160, docs.length * 38)}>
            <BarChart data={docs} layout="vertical" margin={{ top: 5, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} opacity={0.15} horizontal={false} />
              <XAxis type="number" stroke={AXIS} fontSize={10} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="doctorName" stroke={AXIS} fontSize={11}
                     tickLine={false} axisLine={false} width={130} />
              <Tooltip content={<ChartTip />} cursor={{ fill: GRID, opacity: 0.1 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="arrived" name="Kelgan" stackId="d" fill="#2563EB" />
              <Bar dataKey="noShow" name="Kelmagan" stackId="d" fill="#D97706" radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ── Raqamli jadval ─────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
        <h3 className="font-semibold text-gray-900 dark:text-white mb-3">Hafta kunlari — raqamlar</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead>
              <tr className="text-xs text-gray-500 dark:text-gray-400">
                <th className="text-left font-normal pb-2">Kun</th>
                <th className="text-right font-normal pb-2">Kuniga o'rtacha</th>
                <th className="text-right font-normal pb-2">Yozilgan</th>
                <th className="text-right font-normal pb-2">Kelgan</th>
                <th className="text-right font-normal pb-2">Kelmagan</th>
                <th className="text-right font-normal pb-2">Kuniga tushum</th>
              </tr>
            </thead>
            <tbody>
              {wd.map((w: any) => (
                <tr key={w.weekday} className="border-t border-gray-100 dark:border-gray-700">
                  <td className="py-2 font-medium text-gray-900 dark:text-white whitespace-nowrap">
                    {w.name}<span className="text-xs text-gray-400 font-normal ml-1">{w.days} kun</span>
                  </td>
                  <td className="py-2 text-right tabular-nums font-semibold">{w.avgVisits}</td>
                  <td className="py-2 text-right tabular-nums">{formatNumber(w.booked)}</td>
                  <td className="py-2 text-right tabular-nums text-emerald-600 dark:text-emerald-400">{formatNumber(w.arrived)}</td>
                  <td className="py-2 text-right tabular-nums text-amber-600 dark:text-amber-400">{formatNumber(w.noShow)}</td>
                  <td className="py-2 text-right tabular-nums">{formatNumber(w.avgRevenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
};

export const Calendar: React.FC<CalendarProps> = ({
  appointments, patients, doctors, services, categories, onAddAppointment, onUpdateAppointment, onDeleteAppointment, onAddPatient, userRole, doctorId, currentClinic, onPatientClick
}) => {
  const { t } = useLanguage();
  const startHour = currentClinic?.startHour ?? 8;
  const endHour = currentClinic?.endHour ?? 20;
  const HOURS = Array.from({ length: Math.max(1, endHour - startHour + 1) }, (_, i) => i + startHour);

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

  /* Ikki xil cheklov, ikkalasi ham qo'llanadi:
       • SHIFOKOR o'zi kirganda faqat o'z qabullarini ko'radi (ruxsat);
       • legenda filtri — ko'rinishni toraytirish (qulaylik). */
  const filteredAppointments = (userRole === UserRole.DOCTOR && doctorId
    ? effectiveAppointments.filter(a => a.doctorId === doctorId)
    : effectiveAppointments
  ).filter(a => !doctorFilter || a.doctorId === doctorFilter);

  const [view, setView] = useState<'day' | 'week' | 'report'>('week');

  /* HISOBOT. Kalendar «kim qachon yozilgan» ni ko'rsatadi, lekin
     «qaysi kunlarda mijoz ko'p keladi» degan savolga javob bermaydi —
     buning uchun tarixni yig'ish kerak. Shuning uchun hisobot aynan shu
     yerda, kalendarning uchinchi ko'rinishi sifatida turadi: savol shu
     ekranda tug'iladi, javobi ham shu yerda bo'lgani ma'qul. */
  const [report, setReport] = useState<any>(null);
  const [reportBusy, setReportBusy] = useState(false);
  const [reportDays, setReportDays] = useState(90);
  const [reportError, setReportError] = useState<string | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [editingApptId, setEditingApptId] = useState<string | null>(null);
  const [remindedAppts, setRemindedAppts] = useState<Set<string>>(new Set());

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

  // Patient Creation State
  const [isAddPatientModalOpen, setIsAddPatientModalOpen] = useState(false);
  const [isSubmittingPatient, setIsSubmittingPatient] = useState(false);
  const [patientFormData, setPatientFormData] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    dob: '',
    gender: 'Male',
    medicalHistory: '',
    address: '',
    secondaryPhone: ''
  });

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
    // Check if clinic is on individual plan
    const isIndividualPlan = currentClinic?.planId === 'individual';

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

  const displayDays = getDisplayDays(currentDate, view === 'report' ? 'week' : view);

  /* Hisobot faqat OCHILGANDA so'raladi — kalendarni har ochganda
     og'ir so'rov yubormaslik uchun. Davr o'zgarsa qayta so'raladi. */
  useEffect(() => {
    if (view !== 'report') return;
    let alive = true;
    setReportBusy(true);
    const to = new Date();
    const from = new Date(to.getTime() - reportDays * 86400000);
    const iso = (d: Date) => d.toISOString().split('T')[0];
    setReportError(null);
    api.reports.attendance(iso(from), iso(to))
      .then(d => { if (alive) { setReport(d); setReportError(null); } })
      .catch(e => {
        /* Sabab SAQLANADI va ekranda ko'rsatiladi. Quruq «yuklab
           bo'lmadi» nima bo'lganini aytmaydi: server eskimi, tarmoqmi,
           ruxsatmi — hammasi bir xil ko'rinardi. */
        if (alive) { setReport(null); setReportError(e?.message || String(e)); }
      })
      .finally(() => { if (alive) setReportBusy(false); });
    return () => { alive = false; };
  }, [view, reportDays]);

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

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Check if clinic is on individual plan
    const isIndividualPlan = currentClinic?.planId === 'individual';

    // Validation check
    if (!formData.patientId) {
      toast.error("Iltimos, avval bemorni tanlang!");
      return;
    }

    let finalDoctorId = formData.doctorId;
    let finalDoctorName = '';

    // Special handling for individual plan or if doctor is missing
    if (!finalDoctorId) {
      if (isIndividualPlan && doctors.length === 0) {
        // Auto-create doctor logic
        try {
          // Use admin name or default
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

          // Notify user (optional, but good for context)
          // toast.error("Individual tarif bo'yicha shifokor profili avtomatik yaratildi.");
        } catch (err) {
          /* Shifokor yaratish faqat klinika EGASIDA (reliz 4). Registrator
             shu yerga tushsa 403 oladi — xabar shuni aytishi kerak, aks
             holda "nimadir ishlamadi" degan tuyuq ko'chaga olib boradi. */
          console.error('Failed to auto-create doctor', err);
          toast.error("Shifokor profili yo'q. Uni klinika egasi Sozlamalar bo'limida qo'shadi.");
          return;
        }
      } else if (doctors.length > 0) {
        // Auto-select first doctor
        finalDoctorId = doctors[0].id;
        finalDoctorName = `Dr. ${doctors[0].lastName}`;
      } else {
        toast.error("Tizimda shifokor mavjud emas! Iltimos, 'Sozlamalar' bo'limiga o'tib, kamida bitta shifokor profilini yarating.");
        return;
      }
    }

    if (!isIndividualPlan && !finalDoctorId) {
      toast.error("Iltimos, shifokorni tanlang!");
      return;
    }

    // Past Time Validation - REMOVED per user request
    // const selectedDateTime = new Date(`${formData.date}T${formData.time}`);
    // const now = new Date();
    // if (selectedDateTime < now) { ... }

    const patient = patients.find(p => p.id === formData.patientId);

    // Check if we found the doctor in existing list (might be new if we just created)
    let doctor = doctors.find(d => d.id === finalDoctorId);

    // If not in list (newly created), mock it for immediate UI usage if needed, 
    // but we have finalDoctorId and finalDoctorName now.

    if (!patient) {
      toast.error("Bemor topilmadi.");
      return;
    }

    // Only check for doctor object if we didn't just create it
    if (!doctor && !finalDoctorName) {
      // Should not match here if we handled creation
      toast.error("Shifokor topilmadi.");
      return;
    }

    // Set names if we found existing doctor
    if (doctor) {
      finalDoctorName = `Dr. ${doctor.lastName}`;
    }

    /* SHIFOKOR BANDLIGI — endi SERVERDA tekshiriladi (S2.4).

       Bu yerda ilgari ikkita tekshiruv turardi va ikkalasi ham
       `appt.time === formData.time` bilan solishtirardi — ya'ni faqat
       AYNAN bir xil boshlanish vaqtini topardi. 08:30 dagi 60 daqiqalik
       qabul ustiga 09:00 ni yozib bo'laverardi (audit B-19).

       Ikkinchi kamchiligi: `appointments` — brauzerga yuklangan qism,
       butun jadval emas. Ya'ni tekshiruv ko'rmagan qabulni "yo'q" deb
       hisoblardi.

       Server 409 va `code: 'DOCTOR_BUSY'` qaytaradi, quyidagi `catch`
       esa foydalanuvchidan tasdiq so'raydi. Bemorning o'zi bilan
       to'qnashuv ham server tomonda: bemor + sana + shifokor bo'yicha
       dublikat tekshiruvi allaqachon bor.

       Bemorni ikki shifokorga bir vaqtda yozish esa TAQIQLANMAYDI: bu
       xato emas, klinikada odatiy hol (tahlil va konsultatsiya bir
       vaqtda buyurilishi mumkin). */

    /* Yozishning o'zi alohida funksiyada: 409 dan keyin AYNAN shu
       so'rovni `force` bilan takrorlash kerak, ya'ni tanani ikki joyda
       yozib qo'ymaslik uchun. */
    const submit = async (force: boolean) => {
      const payload = {
        patientId: patient.id,
        patientName: `${formatFullName(patient)}`,
        doctorId: finalDoctorId,
        doctorName: finalDoctorName,
        type: formData.type || 'Konsultatsiya',
        date: formData.date,
        time: formData.time,
        duration: Number(formData.duration),
        notes: formData.notes,
        ...(force ? { force: true } : {}),
      };
      if (editingApptId) {
        await onUpdateAppointment(editingApptId, payload);
      } else {
        await onAddAppointment({ ...payload, status: 'Pending' });
      }
      setIsAddModalOpen(false);
      setEditingApptId(null);
    };

    try {
      await submit(false);
    } catch (error: any) {
      /* SHIFOKOR BAND (409). Server TO'SMAYDI, TANLOV beradi — bu
         loyihadagi mavjud naqsh (bemor dublikatida ham shunday).
         Shoshilinch holatda registrator ustiga yozishi kerak bo'lishi
         mumkin. */
      const code = error?.data?.code || error?.code;
      if (code === 'DOCTOR_BUSY') {
        const busy = error?.data?.conflict;
        const when = busy ? `${busy.time} — ${busy.patientName || 'bemor'}` : '';
        const msg = when
          ? `Bu vaqtda shifokor band: ${when}.

Baribir yozilsinmi?`
          : 'Bu vaqtda shifokor band. Baribir yozilsinmi?';
        if (await confirmAction({ title: msg })) {
          try { await submit(true); } catch { /* xatoni App.tsx toast ko'rsatadi */ }
        }
        return;
      }
      /* Boshqa xato: App.tsx toast ko'rsatadi va qayta uloqtiradi.
         Oyna OCHIQ qoladi — kiritilgan ma'lumot yo'qolmasin. */
    }
  };


  /* Kelgan bemorni navbatga qo'yish. Mantiq `utils/arrival.ts` da —
     Registratura ham xuddi shu funksiyani chaqiradi. */
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

  const handlePatientSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patientFormData.firstName || !patientFormData.lastName) {
      toast.error("Iltimos, bemor ismi va familiyasini kiriting!");
      return;
    }

    setIsSubmittingPatient(true);
    try {
      // Find the new patient after creation
      // Note: onAddPatient doesn't return the patient in App.tsx but api.patients.create does.
      // However, addPatient in App.tsx updates the state.
      // We might need to handle selecting it after it's added to the patients list.
      const currentPatientCount = patients.length;

      const newPatient = await onAddPatient({
        ...patientFormData,
        status: 'Active',
        lastVisit: 'Never',
        gender: patientFormData.gender as 'Male' | 'Female'
      });

      setIsAddPatientModalOpen(false);

      if (newPatient && newPatient.id) {
        setFormData(prev => ({ ...prev, patientId: newPatient.id }));
      }

      // Reset form
      setPatientFormData({
        firstName: '',
        lastName: '',
        phone: '',
        dob: '',
        gender: 'Male',
        medicalHistory: '',
        address: '',
        secondaryPhone: ''
      });

      // We'll need to wait for the patients list to update to find the new ID
      // For now, the user can select from the dropdown which will include the new patient
    } catch (error) {
      console.error('Failed to create patient', error);
    } finally {
      setIsSubmittingPatient(false);
    }
  };

  const openMessageModal = (appt: Appointment) => {
    setMessagePatientId(appt.patientId);
    setMessageType('Custom');

    // Check if appointment is tomorrow
    const apptDate = new Date(appt.date);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (apptDate.toDateString() === tomorrow.toDateString()) {
      setMessageType('Tomorrow');

      // Format date nicely
      const dayNames = ['Yakshanba', 'Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba'];
      const monthNames = ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'];
      const dayName = dayNames[apptDate.getDay()];
      const day = apptDate.getDate();
      const month = monthNames[apptDate.getMonth()];

      setMessageText(`🏥 Qabul eslatmasi\n\nHurmatli ${appt.patientName}!\n\nSizni ertaga, ${day}-${month} (${dayName}) kuni soat ${appt.time} da ${appt.doctorName} qabuliga kutamiz.\n\n📍 Manzil: Klinikamiz\n⏰ Vaqt: ${appt.time}\n👨‍⚕️ Shifokor: ${appt.doctorName}\n\nIltimos, vaqtida kelishingizni so'raymiz.\n\nSavol bo'lsa, biz bilan bog'laning.`);
    } else {
      // Default to generic appointment reminder
      setMessageType('Custom');
      setMessageText(`Hurmatli ${appt.patientName}, sizni ${appt.date} kuni soat ${appt.time} da ${appt.doctorName} qabuliga kutamiz.`);
    }

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
            <button
              onClick={() => setView('report')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${view === 'report' ? 'bg-white dark:bg-gray-600 shadow text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'}`}
            >
              Hisobot
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

      {view === 'report' ? (
        <AttendanceReport data={report} busy={reportBusy} days={reportDays} onDays={setReportDays} error={reportError} />
      ) : (
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

      {/* Add Appointment Modal */}
      <Modal isOpen={isAddModalOpen} onClose={() => { setIsAddModalOpen(false); setEditingApptId(null); }} title={editingApptId ? t('calendar.editAppointment') : t('calendar.newAppointment')}>
        <form onSubmit={handleAddSubmit} className="space-y-4">
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <SearchableSelect
                label={t('calendar.patient')}
                options={patients.map(p => ({ value: p.id, label: `${formatFullName(p)}` }))}
                value={formData.patientId}
                onChange={(val) => setFormData({ ...formData, patientId: val })}
              />
            </div>
            {!editingApptId && (
              <Button
                type="button"
                variant="secondary"
                className="mb-1 p-2 h-10 w-10 flex items-center justify-center"
                onClick={() => setIsAddPatientModalOpen(true)}
                title={t('patients.modal.addTitle')}
              >
                <Plus className="w-4 h-4" />
              </Button>
            )}
          </div>
          {/* Hide doctor selection for individual plan clinics */}
          {currentClinic?.planId !== 'individual' && (
            <Select
              label={t('calendar.doctor')}
              options={doctors.map(d => ({ value: d.id, label: `${formatDoctorName(d)}` }))}
              value={formData.doctorId}
              onChange={(e) => setFormData({ ...formData, doctorId: e.target.value })}
            />
          )}
          {categories.length > 0 && (
            <Select
              label={t('calendar.serviceCategory')}
              options={[
                { value: '', label: t('calendar.allCategories') },
                ...categories.map(c => ({ value: c.id, label: c.name }))
              ]}
              value={formData.categoryId}
              onChange={(e) => setFormData({ ...formData, categoryId: e.target.value, type: '' })}
            />
          )}
          <div className="grid grid-cols-2 gap-4">
            <Select
              label={t('calendar.serviceType')}
              options={[
                { value: '', label: t('common.select') },
                ...services
                  .filter(s => !formData.categoryId || (s as any).categoryId === formData.categoryId)
                  .map(s => ({ value: s.name, label: s.name }))
              ]}
              value={formData.type}
              onChange={e => {
                const service = services.find(s => s.name === e.target.value);
                setFormData({
                  ...formData,
                  type: e.target.value,
                  duration: service?.duration || formData.duration
                });
              }}
            />
            <Input label={t('calendar.duration')} type="number" value={formData.duration} onChange={e => setFormData({ ...formData, duration: Number(e.target.value) })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label={t('calendar.date')}
              type="date"
              value={formData.date}
              onChange={e => setFormData({ ...formData, date: e.target.value })}
            />
            <Input label={t('calendar.time')} type="time" value={formData.time} onChange={e => setFormData({ ...formData, time: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('calendar.notes')}</label>
            <textarea
              className="w-full rounded-md border border-gray-300 bg-transparent px-3 py-2 text-sm h-20 dark:border-gray-700 dark:text-white"
              value={formData.notes}
              onChange={e => setFormData({ ...formData, notes: e.target.value })}
            />
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="secondary" onClick={() => { setIsAddModalOpen(false); setEditingApptId(null); }}>{t('common.cancel')}</Button>
            <Button type="submit">{editingApptId ? t('common.save') : t('calendar.book')}</Button>
          </div>
        </form>
      </Modal>

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
                    <Button
                      variant="secondary"
                      className={`${remindedAppts.has(selectedAppointment.id) ? 'bg-green-100 text-green-700 border-green-200' : ''} flex-1`}
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
          <Select
            label={t('calendar.messageType')}
            value={messageType}
            onChange={(e) => {
              const type = e.target.value;
              setMessageType(type);
              // Logic to update text based on type if needed, similar to PatientDetails
              // For now, we just keep the text editable
              if (type === 'Custom') setMessageText('');
            }}
            options={[
              { value: 'Custom', label: t('calendar.customMessage') },
              { value: 'Tomorrow', label: t('calendar.tomorrowAppointment') },
              { value: 'Reminder', label: t('calendar.reminder') }
            ]}
          />
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
      <Modal isOpen={isAddPatientModalOpen} onClose={() => setIsAddPatientModalOpen(false)} title={t('patients.modal.addTitle')}>
        <form onSubmit={handlePatientSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input
              label={t('patients.modal.lastName')}
              value={patientFormData.lastName}
              onChange={e => setPatientFormData({ ...patientFormData, lastName: e.target.value })}
              required
            />
            <Input
              label={t('patients.modal.firstName')}
              value={patientFormData.firstName}
              onChange={e => setPatientFormData({ ...patientFormData, firstName: e.target.value })}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label={t('patients.modal.phone')}
              value={patientFormData.phone}
              onChange={e => setPatientFormData({ ...patientFormData, phone: e.target.value })}
              placeholder="+998 XX XXX XX XX"
              required
            />
            <Input
              label={t('patients.modal.secondaryPhone')}
              value={patientFormData.secondaryPhone}
              onChange={e => setPatientFormData({ ...patientFormData, secondaryPhone: e.target.value })}
              placeholder="+998 XX XXX XX XX"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label={t('patients.modal.dob')}
              type="date"
              value={patientFormData.dob}
              onChange={e => setPatientFormData({ ...patientFormData, dob: e.target.value })}
              required
            />
          </div>
          <Input
            label={t('patients.modal.address')}
            value={patientFormData.address}
            onChange={e => setPatientFormData({ ...patientFormData, address: e.target.value })}
            placeholder="Toshkent sh., Chilonzor t..."
          />
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('patients.modal.gender')}</label>
            <div className="flex gap-4">
              <label className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-400">
                <input
                  type="radio"
                  name="calendar-gender"
                  value="Male"
                  checked={patientFormData.gender === 'Male'}
                  onChange={e => setPatientFormData({ ...patientFormData, gender: e.target.value })}
                  className="text-primary-600 focus:ring-primary-500"
                /> <span>{t('patients.modal.male')}</span>
              </label>
              <label className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-400">
                <input
                  type="radio"
                  name="calendar-gender"
                  value="Female"
                  checked={patientFormData.gender === 'Female'}
                  onChange={e => setPatientFormData({ ...patientFormData, gender: e.target.value })}
                  className="text-primary-600 focus:ring-primary-500"
                /> <span>{t('patients.modal.female')}</span>
              </label>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('patients.modal.medicalHistory')}</label>
            <textarea
              value={patientFormData.medicalHistory}
              onChange={e => setPatientFormData({ ...patientFormData, medicalHistory: e.target.value })}
              className="w-full rounded-md border border-gray-300 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:text-white h-24 focus:ring-2 focus:ring-primary-500 focus:outline-none"
              placeholder={t('patients.modal.medicalHistoryPlaceholder')}
            ></textarea>
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="secondary" onClick={() => setIsAddPatientModalOpen(false)} disabled={isSubmittingPatient}>{t('common.cancel')}</Button>
            <Button type="submit" disabled={isSubmittingPatient}>
              {isSubmittingPatient ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {t('common.pleaseWait')}
                </>
              ) : t('common.save')}
            </Button>
          </div>
        </form>
      </Modal>

    </div>
  );
};
