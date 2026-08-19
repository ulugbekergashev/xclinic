import React, { useState, useMemo } from 'react';
import { motion } from 'motion/react';
import { DentaAiMode } from './DentaAiMode';
import { Card, Badge, Input, Modal, Button } from '../components/Common';
import { StatCard } from '../components/StatCard';
import {
  Users, Calendar, DollarSign, TrendingUp, TrendingDown,
  CheckCircle, Clock, AlertCircle, Plus, ChevronRight, Star, ArrowLeft,
  Zap, FlaskConical, CreditCard, UserPlus, UserCheck, XCircle, CalendarClock, Bot, Sparkles
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, BarChart, Bar
} from 'recharts';
import { Patient, Appointment, Transaction, UserRole, Doctor, Lead, LabOrder, Clinic, Service, PaymentMethod } from '../types';
import { INCOMING_PAYMENT_METHODS, getPaymentMethodLabel } from '../utils/paymentMethods';
import { getCurrentMonthRange } from '../utils/dateUtils';
import { transactionBelongsToDoctor, calculateAppointmentTotal, isAppointmentPaid } from '../utils/financialCalculations';
import { useLanguage } from '../context/LanguageContext';
import { useNavigate } from 'react-router-dom';
import { AddPatientModal } from '../components/AddPatientModal';
import { QuickPaymentModal } from '../components/QuickPaymentModal';
import { CHART_COLORS, CHART } from '../utils/chartColors';

interface DashboardProps {
  patients: Patient[];
  appointments: Appointment[];
  transactions: Transaction[];
  reviews: any[];
  userRole: UserRole;
  doctorId?: string;
  doctors: Doctor[];
  leads: Lead[];
  labOrders?: LabOrder[];
  services?: Service[];
  currentClinic?: Clinic;
  clinicId?: string;
  showFinance?: boolean; // Ruxsatlar: pul ko'rsatkichlari (KPI, tushum grafigi, qarzdorlar)
  onPatientClick?: (id: string) => void;
  onUpdateAppointment?: (id: string, data: Partial<Appointment>) => Promise<void>;
  onUpdateTransaction?: (id: string, data: Partial<Transaction>) => Promise<void>;
  onAddPatient?: (data: Omit<Patient, 'id' | 'clinicId'>) => Promise<Patient | void>;
  onAddTransaction?: (tx: Omit<Transaction, 'id'>) => Promise<any>;
  onAddAppointment?: (appt: Omit<Appointment, 'id'>) => Promise<any>;
  addToast?: (type: 'success' | 'error' | 'info', message: string) => void;
}

// Dashboard ro'yxatlarida ko'rsatiladigan qatorlar soni. Qolgani "Hammasi" ortida —
// dashboard umumiy holatni ko'rsatadi, to'liq ro'yxat o'z sahifasida.
const DASH_ROW_LIMIT = 4;

export const Dashboard: React.FC<DashboardProps> = ({ patients, appointments, transactions, reviews, userRole, doctorId, doctors, leads, labOrders = [], services = [], currentClinic, clinicId = '', showFinance = true, onPatientClick, onUpdateAppointment, onUpdateTransaction, onAddPatient, onAddTransaction, onAddAppointment }) => {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [isAddPatientOpen, setIsAddPatientOpen] = useState(false);
  const [isQuickPaymentOpen, setIsQuickPaymentOpen] = useState(false);
  const [payingAppointment, setPayingAppointment] = useState<Appointment | null>(null);
  const [payingDebt, setPayingDebt] = useState<Transaction | null>(null);
  const [debtPayAmount, setDebtPayAmount] = useState('');
  const [debtPayMethod, setDebtPayMethod] = useState<PaymentMethod>('Cash');
  const [debtSaving, setDebtSaving] = useState(false);
  const [intensityView, setIntensityView] = useState<'month' | 'year'>('year');
  const [activeTab, setActiveTab] = useState<'overview' | 'ai'>('overview');
  const isReceptionist = userRole === UserRole.RECEPTIONIST;
  const today = new Date().toISOString().split('T')[0];
  const { startDate: defaultStart, endDate: defaultEnd } = getCurrentMonthRange();
  const [startDate, setStartDate] = useState(isReceptionist ? today : defaultStart);
  const [endDate, setEndDate] = useState(isReceptionist ? today : defaultEnd);

  // Filter data for doctors - only show their appointments and transactions
  const filteredAppointmentsByDoctor = useMemo(() => {
    if (userRole === UserRole.DOCTOR && doctorId) {
      return appointments.filter(a => a.doctorId === doctorId);
    }
    return appointments;
  }, [appointments, userRole, doctorId]);

  const filteredTransactionsByDoctor = useMemo(() => {
    if (userRole === UserRole.DOCTOR && doctorId) {
      // Qat'iy atributsiya: doctorId yoki aniq ism tengligi (taxminiy moslashtirish yo'q)
      const doctor = doctors.find(d => d.id === doctorId);
      return transactions.filter(t => {
        if (t.doctorId) return t.doctorId === doctorId;
        return doctor ? transactionBelongsToDoctor(t, doctor) : false;
      });
    }
    return transactions;
  }, [transactions, doctors, userRole, doctorId]);

  // --- Filter Logic ---
  const isDateInRange = (dateStr: string) => {
    if (!startDate && !endDate) return true;
    const itemDate = new Date(dateStr);
    const start = startDate ? new Date(startDate) : null;
    const end = endDate ? new Date(endDate) : null;

    if (start && itemDate < start) return false;
    if (end && itemDate > end) return false;
    return true;
  };

  // Filter Data by date range
  const filteredAppointments = useMemo(() => filteredAppointmentsByDoctor.filter(a => isDateInRange(a.date)), [filteredAppointmentsByDoctor, startDate, endDate]);
  const filteredTransactions = useMemo(() => filteredTransactionsByDoctor.filter(t => isDateInRange(t.date)), [filteredTransactionsByDoctor, startDate, endDate]);

  // Stats Calculation
  const totalPatients = patients.length; // Patient count usually stays total DB count
  const activePatients = patients.filter(p => p.status === 'Active').length;

  const periodAppointmentsCount = filteredAppointments.length;
  const pendingAppointments = filteredAppointments.filter(a => a.status === 'Pending').length;

  // Daromad = to'langan to'lovlar (Finance sahifasi bilan izchil)
  const totalRevenue = filteredTransactions.reduce((acc, t) => acc + (t.status === 'Paid' ? t.amount : 0), 0);

  // Dynamic Service Data from Appointments
  const SERVICE_DATA = useMemo(() => {
    const serviceCount = new Map<string, number>();

    filteredAppointments.forEach(app => {
      const count = serviceCount.get(app.type) || 0;
      serviceCount.set(app.type, count + 1);
    });

    const colors = CHART_COLORS;

    return Array.from(serviceCount.entries())
      .map(([name, value], index) => ({
        name,
        value,
        color: colors[index % colors.length]
      }))
      .sort((a, b) => b.value - a.value);
  }, [filteredAppointments]);

  // Dynamic Chart Data Aggregation
  const trendData = useMemo(() => {
    const dataMap = new Map<string, { revenue: number, appointments: number }>();

    // Aggregate Transactions (faqat to'langanlari)
    filteredTransactions.forEach(t => {
      if (t.status !== 'Paid') return;
      const current = dataMap.get(t.date) || { revenue: 0, appointments: 0 };
      dataMap.set(t.date, { ...current, revenue: current.revenue + t.amount });
    });

    // Aggregate Appointments
    filteredAppointments.forEach(a => {
      const current = dataMap.get(a.date) || { revenue: 0, appointments: 0 };
      dataMap.set(a.date, { ...current, appointments: current.appointments + 1 });
    });

    // Convert to Array & Sort
    const result = Array.from(dataMap.entries())
      .map(([date, data]) => ({ name: date, ...data }))
      .sort((a, b) => new Date(a.name).getTime() - new Date(b.name).getTime());

    // If no data, return empty or a placeholder
    return result.length > 0 ? result : [];
  }, [filteredTransactions, filteredAppointments]);

  // New Stats Calculation
  const newLeadsCount = useMemo(() => leads.filter(l => l.status === 'New').length, [leads]);

  const avgCheck = useMemo(() => {
    const completed = filteredAppointments.filter(a => a.status === 'Completed').length;
    return completed > 0 ? Math.round(totalRevenue / completed) : 0;
  }, [totalRevenue, filteredAppointments]);

  const pendingRevenue = useMemo(() =>
    filteredTransactions.filter(t => t.status === 'Pending').reduce((acc, t) => acc + t.amount, 0)
    , [filteredTransactions]);

  // Seasonal Intensity Data
  const intensityData = useMemo(() => {
    const uzMonths = ["Yanvar", "Fevral", "Mart", "Aprel", "May", "Iyun", "Iyul", "Avgust", "Sentabr", "Oktabr", "Noyabr", "Dekabr"];
    const now = new Date();

    if (intensityView === 'month') {
      // Current Month Daily Distribution
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const days: { [key: string]: number } = {};

      for (let i = 1; i <= daysInMonth; i++) {
        days[i.toString()] = 0;
      }

      appointments.forEach(a => {
        const d = new Date(a.date);
        if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()) {
          days[d.getDate().toString()]++;
        }
      });

      return Object.entries(days).map(([name, count]) => ({ name, count }));
    } else {
      // Last 12 Months Overview
      const result: { name: string, count: number, monthIndex: number, year: number }[] = [];

      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        result.push({
          name: uzMonths[d.getMonth()],
          count: 0,
          monthIndex: d.getMonth(),
          year: d.getFullYear()
        });
      }

      appointments.forEach(a => {
        const apptDate = new Date(a.date);
        const item = result.find(r => r.monthIndex === apptDate.getMonth() && r.year === apptDate.getFullYear());
        if (item) {
          item.count++;
        }
      });

      return result;
    }
  }, [appointments, intensityView]);

  // Today's Appointments
  const todayAppointments = useMemo(() => {
    const base = userRole === UserRole.DOCTOR && doctorId
      ? appointments.filter(a => a.doctorId === doctorId)
      : appointments;
    return base
      .filter(a => a.date === today)
      .sort((a, b) => a.time.localeCompare(b.time));
  }, [appointments, today, userRole, doctorId]);

  // Overdue lab orders (by patient name)
  const overdueLabPatients = useMemo(() => {
    return new Set(
      labOrders
        .filter(o => ['Pending', 'In-Progress'].includes(o.status) && o.deadline < today)
        .map(o => o.patientName)
    );
  }, [labOrders, today]);

  // Tanlangan davrda yakunlangan, lekin hali to'lanmagan qabullar — ресепшн шу ердан бирдан ёпиши учун
  const unpaidCompleted = useMemo(() => {
    return filteredAppointments
      .filter(app =>
        (app.status === 'Completed' || app.status === 'Checked-In') && !isAppointmentPaid(app, transactions)
      )
      .sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
  }, [filteredAppointments, transactions]);

  // Kutilayotgan to'lovlar (qarzdorlar) — Pending/Overdue tranzaksiyalar, davr filtridan qat'i nazar
  const pendingDebts = useMemo(() => {
    return filteredTransactionsByDoctor
      .filter(t => t.status === 'Pending' || t.status === 'Overdue')
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [filteredTransactionsByDoctor]);

  const pendingDebtsTotal = useMemo(() =>
    pendingDebts.reduce((acc, t) => acc + t.amount, 0)
    , [pendingDebts]);

  const openDebtPayment = (tx: Transaction) => {
    setPayingDebt(tx);
    setDebtPayAmount(String(tx.amount));
    setDebtPayMethod('Cash');
  };

  // PatientDetails'dagi qarz yopish mantig'i bilan bir xil:
  // qisman — yangi Paid tranzaksiya + qoldiq Pending'da qoladi; to'liq — Paid, sana bugungi
  const handleDebtPayment = async () => {
    if (!payingDebt || !onUpdateTransaction) return;
    const paid = Math.min(Number(debtPayAmount) || 0, payingDebt.amount);
    if (paid <= 0) return;
    setDebtSaving(true);
    try {
      if (paid < payingDebt.amount) {
        if (!onAddTransaction) return;
        await onAddTransaction({
          patientName: payingDebt.patientName,
          patientId: payingDebt.patientId,
          doctorId: payingDebt.doctorId,
          doctorName: payingDebt.doctorName,
          clinicId: payingDebt.clinicId,
          amount: paid,
          status: 'Paid',
          type: debtPayMethod,
          service: `${payingDebt.service} (Qarzdorlik yopildi)`,
          date: today,
        });
        await onUpdateTransaction(payingDebt.id, { amount: payingDebt.amount - paid });
      } else {
        await onUpdateTransaction(payingDebt.id, { status: 'Paid', type: debtPayMethod, date: today });
      }
      setPayingDebt(null);
    } finally {
      setDebtSaving(false);
    }
  };

  const openPaymentForAppointment = (app: Appointment) => {
    setPayingAppointment(app);
    setIsQuickPaymentOpen(true);
  };

  // AI tab uchun stats obyekti
  const aiStats = useMemo(() => ({
    todayAppointments: todayAppointments.length,
    monthAppointments: filteredAppointments.length,
    monthRevenue: totalRevenue,
    newLeads: newLeadsCount,
    debtorsCount: pendingDebts.length,
    pendingRevenue,
    totalPatients,
    avgCheck,
    unpaidCompleted: unpaidCompleted.length,
  }), [todayAppointments, filteredAppointments, totalRevenue, newLeadsCount, pendingDebts, pendingRevenue, totalPatients, avgCheck, unpaidCompleted]);

  return (
    <div className="space-y-6 animate-fade-in">

      {/* Nom chapda, tanlov o'ng chekkada.
          Pastki chiziqli indikator o'rniga segment switch: chetga chiqarilgan
          chiziq uzilib qolgandek ko'rinardi, quti esa o'zi tugagan joyini
          ko'rsatadi. Faol segment layoutId bilan silliq siljiydi. */}
      <div className="flex items-center justify-between gap-6 pb-4 border-b border-gray-200 dark:border-gray-700/60">
        <h1 className="text-[22px] font-bold text-gray-900 dark:text-white tracking-tight">
          Dashboard
        </h1>

        <div className="flex items-center gap-1 p-1 rounded-xl bg-gray-100 dark:bg-white/[0.04]">
          {([
            { id: 'overview' as const, label: t('ai.reportTab') },
            { id: 'ai' as const, label: t('ai.tab') },
          ]).map(tab => {
            const on = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`relative px-4 py-1.5 rounded-lg text-[14.5px] font-semibold transition-colors ${
                  on
                    ? 'text-gray-900 dark:text-white'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                }`}
              >
                {on && (
                  <motion.span
                    layoutId="dashboard-tab-pill"
                    transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                    className="absolute inset-0 rounded-lg bg-white dark:bg-gray-800
                               shadow-sm ring-1 ring-gray-200/70 dark:ring-white/[0.06]"
                  />
                )}
                <span className="relative flex items-center gap-1.5 whitespace-nowrap">
                  {tab.id === 'ai' && (
                    <Sparkles className={`w-4 h-4 ${on ? 'text-violet-500' : 'text-violet-400/60'}`} />
                  )}
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Boshqaruvlar — faqat Hisobot bo'limida.
          AI da yashiriladi, chunki sana oralig'i AI hisobotlariga ta'sir
          qilmaydi (har biri o'z davrini hisoblaydi) va ekranda ikkita
          raqobatlashuvchi sana manbai ko'rinib qolardi. */}
      <div className={`flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 pb-2 ${
        activeTab === 'ai' ? 'hidden' : ''
      }`}>
        {!isReceptionist && (
          <div className="flex items-center gap-3 p-1.5 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm">
            <div className="flex items-center gap-2 px-3">
              <Calendar className="w-4 h-4 text-gray-400" />
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="bg-transparent border-none text-sm font-semibold text-gray-700 dark:text-gray-200 focus:ring-0 p-0 cursor-pointer w-32"
              />
            </div>
            <div className="w-px h-8 bg-gray-100 dark:bg-gray-700" />
            <div className="flex items-center gap-2 px-3">
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="bg-transparent border-none text-sm font-semibold text-gray-700 dark:text-gray-200 focus:ring-0 p-0 cursor-pointer w-32"
              />
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          {/* Quick Actions — dashboarddan turib bajariladi */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => onAddPatient ? setIsAddPatientOpen(true) : navigate('/patients')}
              className="flex items-center gap-1.5 px-3 py-2 bg-primary hover:bg-primary-700 text-white text-xs font-bold rounded-xl transition-all shadow-sm hover:shadow-md active:scale-95"
            >
              <UserPlus className="w-3.5 h-3.5" />
              Bemor
            </button>
            <button
              onClick={() => navigate('/calendar')}
              className="flex items-center gap-1.5 px-3 py-2 bg-info hover:bg-info-600 text-white text-xs font-bold rounded-xl transition-all shadow-sm hover:shadow-md active:scale-95"
            >
              <Calendar className="w-3.5 h-3.5" />
              Qabul
            </button>
            {!isReceptionist && (
              <button
                onClick={() => {
                  if (!onAddTransaction) return navigate('/finance');
                  setPayingAppointment(null);
                  setIsQuickPaymentOpen(true);
                }}
                className="flex items-center gap-1.5 px-3 py-2 bg-success hover:bg-success-700 text-white text-xs font-bold rounded-xl transition-all shadow-sm hover:shadow-md active:scale-95"
              >
                <CreditCard className="w-3.5 h-3.5" />
                To'lov
              </button>
            )}
          </div>

        </div>
      </div>

      {activeTab === 'ai' && <DentaAiMode userRole={userRole} />}

      {/* UMUMIY */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-4">
        <StatCard
          label={t('dashboard.totalPatients')} value={totalPatients.toLocaleString()} icon={Users} color="primary"
          subtitle={<span className="flex items-center"><span className="font-bold text-success-600 bg-success-50 dark:bg-success-900/30 px-1.5 py-0.5 rounded-full">+{activePatients}</span><span className="ml-1.5">{t('dashboard.active')}</span></span>}
        />
        <StatCard
          label={t('dashboard.todayAppointments')} value={periodAppointmentsCount} icon={Calendar} color="info"
          subtitle={pendingAppointments > 0 ? `${pendingAppointments} ${t('dashboard.pending')}` : t('dashboard.allOk')}
        />
        <StatCard
          label={t('dashboard.newLeads')} value={newLeadsCount} icon={Star} color="warning"
          subtitle={t('dashboard.fromAds')}
        />
        {showFinance && (<>
          <StatCard
            label={t('dashboard.avgCheck')} value={avgCheck.toLocaleString()} unit="UZS" icon={TrendingUp} color="success"
            subtitle={t('dashboard.perPatient')}
          />
          <StatCard
            label={t('dashboard.pending')} value={pendingRevenue.toLocaleString()} unit="UZS" icon={Clock} color="warning"
            subtitle={t('dashboard.unpaid')}
          />
          <StatCard
            label={t('dashboard.todayRevenue')} value={totalRevenue.toLocaleString()} unit="UZS" icon={DollarSign} color="success" variant="gradient"
            subtitle={t('dashboard.selectedPeriod')}
          />
        </>)}
      </div>

      {/* Bugungi Qabullar */}
      <Card className="p-6 rounded-[2rem]">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-xl font-black text-gray-900 dark:text-white">
              Bugungi <span className="text-primary">Qabullar</span>
            </h3>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-1">
              {new Date().toLocaleDateString('uz-UZ', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-3 py-1.5 bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 text-xs font-black rounded-full">
              {todayAppointments.length} ta
            </span>
            <button
              onClick={() => navigate('/calendar')}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-gray-500 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-xl transition-all"
            >
              Hammasi <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {todayAppointments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400">
            <Calendar className="w-10 h-10 mb-3 opacity-30" />
            <p className="text-sm font-medium">Bugun qabul yo'q</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-800">
                  <th className="pb-3 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Vaqt</th>
                  <th className="pb-3 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Bemor</th>
                  <th className="pb-3 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Shifokor</th>
                  <th className="pb-3 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Xizmat</th>
                  <th className="pb-3 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Status</th>
                  <th className="pb-3 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Holat</th>
                  <th className="pb-3 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Amallar</th>
                </tr>
              </thead>
              <tbody>
                {todayAppointments.slice(0, DASH_ROW_LIMIT).map(app => {
                  const patient = patients.find(p => p.id === app.patientId);
                  const hasDebt = patient?.balance !== undefined && patient.balance < 0;
                  const hasLabWarning = overdueLabPatients.has(app.patientName);
                  const doctorColor = doctors.find(d => d.id === app.doctorId)?.color || '#3B82F6';
                  return (
                    <tr
                      key={app.id}
                      className="border-b border-gray-50 dark:border-gray-800/60 last:border-0 hover:bg-gray-50/70 dark:hover:bg-gray-800/30 transition-colors group"
                    >
                      <td className="py-3.5 pr-4">
                        <span className="text-sm font-black text-gray-900 dark:text-white tabular-nums">{app.time}</span>
                      </td>
                      <td className="py-3.5 pr-4">
                        <button
                          onClick={() => patient && onPatientClick && onPatientClick(patient.id)}
                          className="text-sm font-semibold text-gray-900 dark:text-white hover:text-primary-600 dark:hover:text-primary-400 transition-colors text-left"
                        >
                          {app.patientName}
                        </button>
                      </td>
                      <td className="py-3.5 pr-4">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: doctorColor }} />
                          <span className="text-sm text-gray-600 dark:text-gray-300">{app.doctorName}</span>
                        </div>
                      </td>
                      <td className="py-3.5 pr-4">
                        <span className="text-sm text-gray-500 dark:text-gray-400">{app.type}</span>
                      </td>
                      <td className="py-3.5 pr-4">
                        <Badge status={app.status} />
                      </td>
                      <td className="py-3.5 pr-4">
                        <div className="flex items-center gap-1.5">
                          {hasDebt && (
                            <span className="flex items-center gap-1 px-2 py-0.5 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-[10px] font-black rounded-full border border-red-100 dark:border-red-900/30" title="Qarz bor">
                              <AlertCircle className="w-3 h-3" /> Qarz
                            </span>
                          )}
                          {hasLabWarning && (
                            <span className="flex items-center gap-1 px-2 py-0.5 bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 text-[10px] font-black rounded-full border border-amber-100 dark:border-amber-900/30" title="Lab buyurtma muddati o'tgan">
                              <FlaskConical className="w-3 h-3" /> Lab
                            </span>
                          )}
                          {!hasDebt && !hasLabWarning && (
                            <span className="text-[10px] text-gray-300 dark:text-gray-600 font-medium">—</span>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5">
                        {app.status !== 'Completed' && app.status !== 'Cancelled' && onUpdateAppointment && (
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {app.status !== 'Checked-In' && (
                              <button
                                onClick={() => onUpdateAppointment(app.id, { status: 'Checked-In' })}
                                title="Keldi — tasdiqlash"
                                className="flex items-center gap-1 px-2 py-1 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-900/20 dark:hover:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold rounded-lg transition-colors"
                              >
                                <UserCheck className="w-3 h-3" /> Keldi
                              </button>
                            )}
                            <button
                              onClick={() => navigate('/calendar')}
                              title="Boshqa kunga ko'chirish"
                              className="flex items-center gap-1 px-2 py-1 bg-primary-50 hover:bg-primary-100 dark:bg-primary-900/20 dark:hover:bg-primary-900/40 text-primary-600 dark:text-primary-400 text-[10px] font-bold rounded-lg transition-colors"
                            >
                              <CalendarClock className="w-3 h-3" /> Ko'chir
                            </button>
                            <button
                              onClick={() => onUpdateAppointment(app.id, { status: 'Cancelled' })}
                              title="Bekor qilish"
                              className="flex items-center gap-1 px-2 py-1 bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/40 text-red-500 dark:text-red-400 text-[10px] font-bold rounded-lg transition-colors"
                            >
                              <XCircle className="w-3 h-3" /> Bekor
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {todayAppointments.length > DASH_ROW_LIMIT && (
              <button
                onClick={() => navigate('/calendar')}
                className="w-full mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 flex items-center justify-center gap-1 text-xs font-bold text-gray-500 hover:text-primary-600 transition-colors"
              >
                Yana {todayAppointments.length - DASH_ROW_LIMIT} ta · Hammasi <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
      </Card>

      {/* Yig'ilmagan pul — ikkita ro'yxat yonma-yon.
          Ikkalasi ham "hali olinmagan pul" bo'lgani uchun bir qatorda turadi. */}
      {((showFinance && pendingDebts.length > 0) || unpaidCompleted.length > 0) && (
        <div className={`grid grid-cols-1 gap-6 ${showFinance && pendingDebts.length > 0 && unpaidCompleted.length > 0 ? 'xl:grid-cols-2' : ''}`}>

          {/* Qarzdorlar — qarzga yozilgan, yopilmagan to'lovlar */}
          {showFinance && pendingDebts.length > 0 && (
            <Card className="p-6 rounded-[2rem] border border-red-200 dark:border-red-800/50">
              <div className="flex items-start justify-between gap-3 mb-4">
                <div className="min-w-0">
                  <h3 className="text-lg font-black text-gray-900 dark:text-white">
                    Kutilayotgan <span className="text-red-500">To'lovlar</span>
                  </h3>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">
                    Qarzga yozilgan, hali yopilmagan
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  <span className="px-3 py-1 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-xs font-black rounded-full whitespace-nowrap">
                    {pendingDebtsTotal.toLocaleString()} UZS
                  </span>
                  <span className="text-[10px] font-bold text-gray-400">{pendingDebts.length} ta</span>
                </div>
              </div>

              <div className="divide-y divide-gray-50 dark:divide-gray-800/60">
                {pendingDebts.slice(0, DASH_ROW_LIMIT).map(tx => {
                  const patient = patients.find(p => p.id === tx.patientId)
                    || patients.find(p => `${p.lastName} ${p.firstName}` === tx.patientName);
                  const serviceLabel = tx.service?.includes('|') ? tx.service.split('||')[0].split('|')[0] : (tx.service || '—');
                  return (
                    <div key={tx.id} className="flex items-center gap-3 py-3 group">
                      <div className="min-w-0 flex-1">
                        <button
                          onClick={() => patient && onPatientClick && onPatientClick(patient.id)}
                          className="block max-w-full truncate text-sm font-semibold text-gray-900 dark:text-white hover:text-primary-600 dark:hover:text-primary-400 transition-colors text-left"
                        >
                          {tx.patientName}
                        </button>
                        <p className="text-[11px] text-gray-400 truncate">{tx.date} · {serviceLabel}</p>
                      </div>
                      <span className="text-sm font-bold text-red-600 dark:text-red-400 tabular-nums whitespace-nowrap">
                        {tx.amount.toLocaleString()}
                      </span>
                      {onUpdateTransaction && (
                        <button
                          onClick={() => openDebtPayment(tx)}
                          className="flex items-center gap-1 px-2.5 py-1.5 bg-success hover:bg-success-700 text-white text-[11px] font-bold rounded-lg transition-colors flex-shrink-0"
                        >
                          <CreditCard className="w-3.5 h-3.5" /> To'lov
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              {pendingDebts.length > DASH_ROW_LIMIT && (
                <button
                  onClick={() => navigate('/finance')}
                  className="w-full mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 flex items-center justify-center gap-1 text-xs font-bold text-gray-500 hover:text-primary-600 transition-colors"
                >
                  Yana {pendingDebts.length - DASH_ROW_LIMIT} ta · Hammasi <ChevronRight className="w-3.5 h-3.5" />
                </button>
              )}
            </Card>
          )}

          {/* To'lovni kutayotgan qabullar — protsedura yakunlangan, to'lov olinmagan */}
          {unpaidCompleted.length > 0 && (
            <Card className="p-6 rounded-[2rem] border border-amber-200 dark:border-amber-800/50">
              <div className="flex items-start justify-between gap-3 mb-4">
                <div className="min-w-0">
                  <h3 className="text-lg font-black text-gray-900 dark:text-white">
                    To'lovni <span className="text-amber-500">Kutayotgan</span>
                  </h3>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">
                    Yakunlangan, to'lov qabul qilinmagan
                  </p>
                </div>
                <span className="px-3 py-1 bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 text-xs font-black rounded-full flex-shrink-0">
                  {unpaidCompleted.length} ta
                </span>
              </div>

              <div className="divide-y divide-gray-50 dark:divide-gray-800/60">
                {unpaidCompleted.slice(0, DASH_ROW_LIMIT).map(app => {
                  const patient = patients.find(p => p.id === app.patientId);
                  const doctorColor = doctors.find(d => d.id === app.doctorId)?.color || '#3B82F6';
                  const { total, breakdown } = calculateAppointmentTotal(app.notes || '', services);
                  const serviceLabel = breakdown ? breakdown.split('||')[0].split('|')[0] : app.type;
                  return (
                    <div key={app.id} className="flex items-center gap-3 py-3">
                      <div className="min-w-0 flex-1">
                        <button
                          onClick={() => patient && onPatientClick && onPatientClick(patient.id)}
                          className="block max-w-full truncate text-sm font-semibold text-gray-900 dark:text-white hover:text-primary-600 dark:hover:text-primary-400 transition-colors text-left"
                        >
                          {app.patientName}
                        </button>
                        <p className="flex items-center gap-1.5 text-[11px] text-gray-400 truncate">
                          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: doctorColor }} />
                          <span className="truncate">{app.date} · {serviceLabel}</span>
                        </p>
                      </div>
                      <span className="text-sm font-bold text-gray-900 dark:text-white tabular-nums whitespace-nowrap">
                        {total > 0 ? total.toLocaleString() : '—'}
                      </span>
                      {onAddTransaction && (
                        <button
                          onClick={() => openPaymentForAppointment(app)}
                          className="flex items-center gap-1 px-2.5 py-1.5 bg-success hover:bg-success-700 text-white text-[11px] font-bold rounded-lg transition-colors flex-shrink-0"
                        >
                          <CreditCard className="w-3.5 h-3.5" /> Yopish
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              {unpaidCompleted.length > DASH_ROW_LIMIT && (
                <button
                  onClick={() => navigate('/finance')}
                  className="w-full mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 flex items-center justify-center gap-1 text-xs font-bold text-gray-500 hover:text-primary-600 transition-colors"
                >
                  Yana {unpaidCompleted.length - DASH_ROW_LIMIT} ta · Hammasi <ChevronRight className="w-3.5 h-3.5" />
                </button>
              )}
            </Card>
          )}
        </div>
      )}

      {/* Charts Row - hidden for receptionist */}
      {!isReceptionist && (<>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Revenue Chart */}
          {showFinance && <Card className="p-8 lg:col-span-2 rounded-[2rem]">
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-xl font-black text-gray-900 dark:text-white">
                {t('dashboard.financialFlow')}
              </h3>
              <div className="flex gap-4">
                <div className="flex items-center gap-1.5 text-xs font-bold text-gray-400">
                  <div className="w-2.5 h-2.5 rounded-full bg-primary" /> {t('dashboard.income')}
                </div>
                <div className="flex items-center gap-1.5 text-xs font-bold text-gray-400">
                  <div className="w-2.5 h-2.5 rounded-full bg-success" /> {t('dashboard.visits')}
                </div>
              </div>
            </div>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData}>
                  <defs>
                    <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2563EB" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#2563EB" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorAppts" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#059669" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#059669" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" dark:stroke="#374151" strokeOpacity={0.4} />
                  <XAxis
                    dataKey="name"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#9CA3AF', fontSize: 10, fontWeight: 600 }}
                    dy={10}
                  />
                  <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{ fill: '#9CA3AF', fontSize: 10, fontWeight: 600 }} />
                  <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{ fill: '#9CA3AF', fontSize: 10, fontWeight: 600 }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1F2937', borderRadius: '16px', border: 'none', color: '#fff', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)' }}
                    itemStyle={{ color: '#fff', fontSize: '12px', fontWeight: 'bold' }}
                    labelStyle={{ color: '#9CA3AF', marginBottom: '0.5rem', fontWeight: 'bold' }}
                  />
                  <Area
                    yAxisId="left"
                    type="monotone"
                    dataKey="revenue"
                    stroke="#2563EB"
                    strokeWidth={4}
                    fillOpacity={1}
                    fill="url(#colorRevenue)"
                    activeDot={{ r: 6, fill: '#2563EB', stroke: '#fff', strokeWidth: 2 }}
                  />
                  <Area
                    yAxisId="right"
                    type="monotone"
                    dataKey="appointments"
                    stroke="#059669"
                    strokeWidth={4}
                    fillOpacity={1}
                    fill="url(#colorAppts)"
                    activeDot={{ r: 6, fill: '#059669', stroke: '#fff', strokeWidth: 2 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
              {trendData.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-sm font-medium">
                  Ma'lumotlar mavjud emas
                </div>
              )}
            </div>
          </Card>}

          {/* Service Distribution */}
          <Card className="p-8 rounded-[2rem]">
            <h3 className="text-xl font-black text-gray-900 dark:text-white mb-8">{t('dashboard.specialty')}</h3>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={SERVICE_DATA}
                    cx="50%"
                    cy="50%"
                    innerRadius={65}
                    outerRadius={95}
                    paddingAngle={8}
                    dataKey="value"
                    stroke="none"
                  >
                    {SERVICE_DATA.map((entry, index) => (
                      <Cell key={`cell - ${index} `} fill={entry.color} />
                    ))}
                  </Pie>
                  <Legend
                    verticalAlign="bottom"
                    height={36}
                    iconType="circle"
                    formatter={(value) => <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{value}</span>}
                  />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1F2937', borderRadius: '16px', border: 'none', color: '#fff' }}
                    itemStyle={{ color: '#fff', fontSize: '12px', fontWeight: 'bold' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pb-6">
          <Card className="p-8 lg:col-span-2 rounded-[2rem]">
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-xl font-black text-gray-900 dark:text-white">So'nggi <span className="text-primary">Qabullar</span></h3>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-800">
                    <th className="pb-4 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Sana/Vaqt</th>
                    <th className="pb-4 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Bemor</th>
                    <th className="pb-4 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Shifokor</th>
                    <th className="pb-4 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Status</th>
                    <th className="pb-4 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Baho</th>
                  </tr>
                </thead>
                <tbody className="text-sm">
                  {filteredAppointments.slice(0, 5).map(app => (
                    <tr key={app.id} className="border-b border-gray-50 dark:border-gray-800 last:border-0">
                      <td className="py-4 font-medium text-gray-900 dark:text-white">{app.date} {app.time}</td>
                      <td className="py-4 text-gray-600 dark:text-gray-300">{app.patientName}</td>
                      <td className="py-4 text-gray-500">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: doctors.find(d => d.id === app.doctorId)?.color || '#3B82F6' }} />
                          {app.doctorName}
                        </div>
                      </td>
                      <td className="py-4 text-gray-500">{app.type}</td>
                      <td className="py-4"><Badge status={app.status} /></td>
                      <td className="py-4">
                        {app.review ? (
                          <div className="flex items-center gap-0.5 text-yellow-500">
                            {[...Array(5)].map((_, i) => (
                              <Star key={i} className={`w-3 h-3 ${i < app.review.rating ? 'fill-current' : 'text-gray-200'}`} />
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">Baholanmagan</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {filteredAppointments.length === 0 && (
                    <tr>
                      <td colSpan={6} className="text-center py-4 text-gray-500">Qabullar topilmadi</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          <Card className="p-8 rounded-[2rem]">
            <h3 className="text-xl font-black text-gray-900 dark:text-white mb-8">{t('dashboard.recentAppointments')}</h3>
            <div className="space-y-8 relative before:absolute before:inset-0 before:left-4 before:h-full before:w-0.5 before:bg-gray-100 dark:before:bg-gray-700">
              {(() => {
                // Combine recent activities from all sources
                const activities: Array<{ type: string; text: string; time: Date; icon: any; color: string }> = [];

                // Recent patients (last 5)
                patients.slice(-5).reverse().forEach(patient => {
                  const createdDate = new Date(patient.lastVisit);
                  activities.push({
                    type: 'patient',
                    text: `Yangi bemor ro'yxatga olindi: ${patient.lastName} ${patient.firstName}`,
                    time: createdDate,
                    icon: Users,
                    color: 'bg-primary-100 text-primary-600 dark:bg-primary-900/30 dark:text-primary-400'
                  });
                });

                // Recent transactions (last 5) — moliya yashirilgan rolga ko'rsatilmaydi
                if (showFinance) filteredTransactions.slice(-5).reverse().forEach(tx => {
                  const txDate = new Date(tx.date);
                  activities.push({
                    type: 'transaction',
                    text: `To'lov qabul qilindi: ${tx.amount.toLocaleString()} UZS - ${tx.service}`,
                    time: txDate,
                    icon: DollarSign,
                    color: 'bg-success-100 text-success-600 dark:bg-success-900/30 dark:text-success'
                  });
                });

                // Recent completed appointments (last 5)
                filteredAppointments
                  .filter(a => a.status === 'Completed')
                  .slice(-5)
                  .reverse()
                  .forEach(appt => {
                    const apptDate = new Date(`${appt.date} ${appt.time}`);
                    activities.push({
                      type: 'appointment',
                      text: `${appt.doctorName} ${appt.type} yakunladi`,
                      time: apptDate,
                      icon: CheckCircle,
                      color: 'bg-primary-100 text-primary-600 dark:bg-primary-900/30 dark:text-primary-400'
                    });
                  });

                // Sort by time (most recent first) and take top 5
                const sortedActivities = activities
                  .sort((a, b) => b.time.getTime() - a.time.getTime())
                  .slice(0, 5);

                // Helper function to format time ago
                const getTimeAgo = (date: Date) => {
                  if (!date || isNaN(date.getTime())) return 'Yaqinda';
                  const now = new Date();
                  const diffMs = now.getTime() - date.getTime();
                  if (diffMs < 0) return 'Hozirgina'; // Handle future dates gracefully
                  const diffMins = Math.floor(diffMs / 60000);
                  const diffHours = Math.floor(diffMs / 3600000);
                  const diffDays = Math.floor(diffMs / 86400000);

                  if (diffMins < 1) return 'Hozirgina';
                  if (diffMins < 60) return `${diffMins} daq oldin`;
                  if (diffHours < 24) return `${diffHours} soat oldin`;
                  return `${diffDays} kun oldin`;
                };

                if (sortedActivities.length === 0) {
                  return (
                    <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                      Hozircha faoliyat yo'q
                    </div>
                  );
                }

                return sortedActivities.map((item, i) => (
                  <div key={i} className="flex gap-4 relative z-10">
                    <div className={`mt-0.5 w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${item.color} border-4 border-white dark:border-gray-800 shadow-sm transition-transform hover:scale-110`}>
                      <item.icon className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">{item.text}</p>
                      <p className="text-xs text-gray-500">{getTimeAgo(item.time)}</p>
                    </div>
                  </div>
                ));
              })()}
            </div >
          </Card >
        </div >

        {/* Seasonal Intensity Chart */}
        <Card className="p-8 rounded-[2rem]">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-4">
            <div>
              <h3 className="text-xl font-black text-gray-900 dark:text-white">
                Qabullar <span className="text-danger">Intensivligi</span>
              </h3>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-1">
                {intensityView === 'month' ? "Joriy oy kunlari bo'yicha" : "Oxirgi 12 oy davomida"}
              </p>
            </div>

            {/* View Toggle */}
            <div className="flex bg-gray-100 dark:bg-gray-800 p-1 rounded-xl w-fit">
              <button
                onClick={() => setIntensityView('month')}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${intensityView === 'month'
                  ? 'bg-white dark:bg-gray-700 text-danger shadow-sm'
                  : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                  }`}
              >
                OYLIK
              </button>
              <button
                onClick={() => setIntensityView('year')}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${intensityView === 'year'
                  ? 'bg-white dark:bg-gray-700 text-danger shadow-sm'
                  : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                  }`}
              >
                YILLIK
              </button>
            </div>
          </div>

          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={intensityData}>
                <defs>
                  <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#FB7185" stopOpacity={1} />
                    <stop offset="100%" stopColor="#E11D48" stopOpacity={1} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" dark:stroke="#374151" strokeOpacity={0.4} />
                <XAxis
                  dataKey="name"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#9CA3AF', fontSize: 9, fontWeight: 700 }}
                  interval={intensityView === 'month' ? 1 : 0}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#9CA3AF', fontSize: 10, fontWeight: 700 }}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(0,0,0,0.05)', radius: [8, 8, 4, 4] }}
                  contentStyle={{ backgroundColor: '#1F2937', borderRadius: '12px', border: 'none', color: '#fff' }}
                  labelStyle={{ fontWeight: 'bold', marginBottom: '4px' }}
                />
                <Bar
                  dataKey="count"
                  fill="url(#barGradient)"
                  radius={[8, 8, 4, 4]}
                  barSize={intensityView === 'month' ? 12 : 32}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-6 flex items-start gap-3 text-xs text-gray-500 font-medium bg-gray-50 dark:bg-gray-800/50 p-4 rounded-2xl border border-gray-100 dark:border-gray-700/50">
            <div className="p-1.5 bg-rose-100 dark:bg-rose-900/30 rounded-lg">
              <AlertCircle className="w-4 h-4 text-rose-500" />
            </div>
            <p className="leading-relaxed">
              {intensityView === 'year'
                ? "Yillik tahlil klinika faolligini oylar kesimida ko'rsatadi. Kunlik tahlilga o'tish uchun tepadan 'OYLIK' tugmasini bosing."
                : "Joriy oy uchun kunlik qabullar soni. Bu qaysi kunlarda klinika yuklamasi yuqori ekanini ko'rsatadi."}
            </p>
          </div>
        </Card>
      </>)}

      {/* Qarz to'lash modali — qisman yoki to'liq */}
      {payingDebt && (() => {
        const debtTotal = payingDebt.amount;
        const entered = Math.min(Number(debtPayAmount) || 0, debtTotal);
        const remaining = debtTotal - entered;
        const serviceLabel = payingDebt.service?.includes('|') ? payingDebt.service.split('||')[0].split('|')[0] : (payingDebt.service || '—');
        return (
          <Modal isOpen={true} onClose={() => setPayingDebt(null)} title="💳 Qarzni to'lash" className="max-w-md">
            <div className="space-y-4">
              <div className="p-4 bg-gray-50 dark:bg-gray-800/60 rounded-xl border border-gray-100 dark:border-gray-700">
                <p className="text-sm font-bold text-gray-900 dark:text-white">{payingDebt.patientName}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{serviceLabel} · {payingDebt.date}</p>
                <p className="text-lg font-black text-red-500 mt-2 tabular-nums">{debtTotal.toLocaleString()} UZS</p>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">To'lanayotgan summa (UZS)</label>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => setDebtPayAmount(String(Math.round(debtTotal / 2)))}
                      className="px-2 py-0.5 text-[10px] font-bold text-primary-600 bg-primary-50 dark:bg-primary-900/20 rounded-md hover:bg-primary-100"
                    >Yarmi</button>
                    <button
                      type="button"
                      onClick={() => setDebtPayAmount(String(debtTotal))}
                      className="px-2 py-0.5 text-[10px] font-bold text-primary-600 bg-primary-50 dark:bg-primary-900/20 rounded-md hover:bg-primary-100"
                    >Hammasi</button>
                  </div>
                </div>
                <input
                  type="number"
                  min={0}
                  max={debtTotal}
                  value={debtPayAmount}
                  onChange={e => setDebtPayAmount(e.target.value)}
                  onWheel={e => e.currentTarget.blur()}
                  className="w-full px-3 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary-500/30 dark:text-white tabular-nums"
                />
                {entered > 0 && remaining > 0 && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 font-medium mt-1.5">
                    Qoldiq qarz: {remaining.toLocaleString()} UZS (qarzdorlarda qoladi)
                  </p>
                )}
                {entered > 0 && remaining === 0 && (
                  <p className="text-xs text-success-600 dark:text-success font-medium mt-1.5">
                    Qarz to'liq yopiladi
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">To'lov usuli</label>
                <div className="flex gap-2 flex-wrap">
                  {INCOMING_PAYMENT_METHODS.map(m => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setDebtPayMethod(m)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${debtPayMethod === m
                        ? 'bg-primary text-white border-primary'
                        : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-primary-400'}`}
                    >
                      {getPaymentMethodLabel(m)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <Button variant="secondary" className="flex-1" onClick={() => setPayingDebt(null)}>Bekor</Button>
                <button
                  disabled={debtSaving || entered <= 0}
                  onClick={handleDebtPayment}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-bold text-sm text-white bg-success hover:bg-success-700 disabled:bg-success/50 disabled:cursor-not-allowed transition-all"
                >
                  <CreditCard className="w-4 h-4" />
                  {debtSaving ? 'Saqlanmoqda...' : "To'lovni qabul qilish"}
                </button>
              </div>
            </div>
          </Modal>
        );
      })()}
        </div>
      )}

      {/* Tezkor amal modallari */}
      {onAddPatient && (
        <AddPatientModal
          isOpen={isAddPatientOpen}
          onClose={() => setIsAddPatientOpen(false)}
          onAddPatient={onAddPatient}
          doctors={doctors}
          userRole={userRole}
          doctorId={doctorId}
          compact
          onCreated={(p) => onPatientClick?.(p.id)}
        />
      )}
      {onAddTransaction && (() => {
        const { total: presetAmount } = payingAppointment
          ? calculateAppointmentTotal(payingAppointment.notes || '', services)
          : { total: 0 };
        return (
          <QuickPaymentModal
            isOpen={isQuickPaymentOpen}
            onClose={() => { setIsQuickPaymentOpen(false); setPayingAppointment(null); }}
            patients={patients}
            doctors={doctors}
            services={services}
            clinicId={clinicId}
            onAddTransaction={onAddTransaction}
            presetPatientId={payingAppointment?.patientId}
            presetDoctorId={payingAppointment?.doctorId || (userRole === UserRole.DOCTOR ? doctorId : undefined)}
            presetService={payingAppointment?.type}
            presetAmount={presetAmount || undefined}
            presetDate={payingAppointment?.date}
          />
        );
      })()}
    </div>
  );
};
