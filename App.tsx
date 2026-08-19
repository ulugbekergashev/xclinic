
import React, { useState, useEffect, useMemo } from 'react';
import { todayISO } from './utils/dateUtils';
import { Routes, Route, NavLink, useNavigate, useLocation, Navigate } from 'react-router-dom';
import {
  LayoutDashboard, Users, Calendar as CalendarIcon,
  DollarSign, Settings as SettingsIcon, Menu, X, Moon, Sun, LogOut,
  Activity, RefreshCw, AlertTriangle, Loader2, Package, Search, UserCheck, Plus, Edit, Trash2, ListOrdered, FlaskConical, MessageSquare, Wallet, Scan, BedDouble, UserPlus, Stethoscope
} from 'lucide-react';
import { Dashboard } from './pages/Dashboard';
import { Patients } from './pages/Patients';
import { PatientDetails } from './pages/PatientDetails';
import { Calendar } from './pages/Calendar';
import { FinanceHub } from './pages/FinanceHub';
import { Leads } from './pages/Leads';
import { Settings } from './pages/Settings';
import { SignIn } from './pages/SignIn';
import { DoctorsAnalytics } from './pages/DoctorsAnalytics';
import { DoctorDetails } from './pages/DoctorDetails';
import { Inventory } from './pages/Inventory';
import { QueueBoard } from './pages/QueueBoard';
import { LabOrders } from './pages/LabOrders';
import { Diagnostics } from './pages/Diagnostics';
import { Reception } from './pages/Reception';
import { MyQueue } from './pages/MyQueue';
import { VisitWorkspace } from './pages/VisitWorkspace';
import { Inpatient } from './pages/Inpatient';
import { MessagesManagement } from './pages/MessagesManagement';
import { UserRole, Patient, Appointment, Transaction, Expense, Doctor, Receptionist, Clinic, SubscriptionPlan, Service, InventoryItem, ServiceCategory, Lead, LabTechnician, LabOrder, CashRegisterDay, CashMovement, Department, VisitCharge } from './types';
import { ToastContainer, ToastMessage } from './components/Common';
import { InstallPWAButton } from './components/InstallPWAButton';
import { BottomNav } from './components/BottomNav';
import { ErrorBoundary } from './components/ErrorBoundary';
import { api } from './services/api';
import type { CashCloseInput } from './services/api';
import { parseAccessControl, isModuleHidden, canSeeFinance, canSeePatientPhone } from './utils/accessControl';
import { LanguageProvider, useLanguage } from './context/LanguageContext';
import { Language } from './i18n/translations';

// Navigation config for Clinic Admin and Doctors
const CLINIC_NAVIGATION = [
  { id: 'dashboard', labelKey: 'nav.dashboard', icon: LayoutDashboard, roles: [UserRole.CLINIC_ADMIN, UserRole.DOCTOR, UserRole.RECEPTIONIST] },
  { id: 'reception', labelKey: 'nav.reception', icon: UserPlus, roles: [UserRole.CLINIC_ADMIN, UserRole.RECEPTIONIST] },
  { id: 'myqueue', labelKey: 'nav.myqueue', icon: Stethoscope, roles: [UserRole.CLINIC_ADMIN, UserRole.DOCTOR, UserRole.RECEPTIONIST] },
  { id: 'leads', labelKey: 'nav.leads', icon: Users, roles: [UserRole.CLINIC_ADMIN, UserRole.RECEPTIONIST] },
  { id: 'patients', labelKey: 'nav.patients', icon: Users, roles: [UserRole.CLINIC_ADMIN, UserRole.DOCTOR, UserRole.RECEPTIONIST] },
  { id: 'calendar', labelKey: 'nav.calendar', icon: CalendarIcon, roles: [UserRole.CLINIC_ADMIN, UserRole.DOCTOR, UserRole.RECEPTIONIST] },
  { id: 'finance', labelKey: 'nav.finance', icon: Wallet, roles: [UserRole.CLINIC_ADMIN, UserRole.RECEPTIONIST] },
  { id: 'doctors', labelKey: 'nav.doctors', icon: Activity, roles: [UserRole.CLINIC_ADMIN, UserRole.RECEPTIONIST] },
  { id: 'inventory', labelKey: 'inventory.title', icon: Package, roles: [UserRole.CLINIC_ADMIN, UserRole.RECEPTIONIST] },
  { id: 'board', labelKey: 'nav.board', icon: ListOrdered, roles: [UserRole.CLINIC_ADMIN, UserRole.RECEPTIONIST] },
  { id: 'lab', labelKey: 'nav.lab', icon: FlaskConical, roles: [UserRole.CLINIC_ADMIN, UserRole.DOCTOR, UserRole.RECEPTIONIST, UserRole.LAB_TECHNICIAN] },
  { id: 'diagnostics', labelKey: 'nav.diagnostics', icon: Scan, roles: [UserRole.CLINIC_ADMIN, UserRole.DOCTOR, UserRole.RECEPTIONIST] },
  { id: 'inpatient', labelKey: 'nav.inpatient', icon: BedDouble, roles: [UserRole.CLINIC_ADMIN, UserRole.DOCTOR, UserRole.RECEPTIONIST] },
  { id: 'messages', labelKey: 'nav.messages', icon: MessageSquare, roles: [UserRole.CLINIC_ADMIN, UserRole.RECEPTIONIST] },
  { id: 'settings', labelKey: 'nav.settings', icon: SettingsIcon, roles: [UserRole.CLINIC_ADMIN, UserRole.RECEPTIONIST] },
];

// Helper: get page label key from path
const getPageLabelKey = (pathname: string): any => {
  if (pathname === '/' || pathname === '/dashboard') return 'nav.dashboard';
  if (pathname === '/leads') return 'nav.leads';
  if (pathname.startsWith('/patients/')) return 'nav.patients'; // Will translate as "Patients", detail page handles own title
  if (pathname === '/patients') return 'nav.patients';
  if (pathname === '/calendar') return 'nav.calendar';
  if (pathname === '/finance') return 'nav.finance';
  if (pathname === '/doctors') return 'nav.doctors';
  if (pathname === '/inventory') return 'inventory.title';
  if (pathname === '/reception') return 'nav.reception';
  if (pathname === '/myqueue') return 'nav.myqueue';
  if (pathname.startsWith('/visit/')) return 'nav.visit';
  if (pathname === '/board') return 'nav.board';
  if (pathname === '/diagnostics') return 'nav.diagnostics';
  if (pathname === '/inpatient') return 'nav.inpatient';
  if (pathname === '/lab') return 'nav.lab';
  if (pathname === '/messages') return 'nav.messages';
  if (pathname === '/settings') return 'nav.settings';
  if (pathname === '/admin') return 'nav.saas';
  return 'nav.dashboard';
};

const AppContent: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { t, language, setLanguage } = useLanguage();

  // --- Global State ---
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [userRole, setUserRole] = useState<UserRole>(UserRole.CLINIC_ADMIN);
  const [userName, setUserName] = useState('');
  const [clinicId, setClinicId] = useState<string>('');
  const [doctorId, setDoctorId] = useState<string>('');
  const [receptionistId, setReceptionistId] = useState<string>('');
  const [technicianId, setTechnicianId] = useState<string>('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    // Dark mode holatini saqlash: localStorage в†’ tizim sozlamasi
    try {
      const stored = localStorage.getItem('xclinic_theme');
      if (stored) return stored === 'dark';
      return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    } catch { return false; }
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Data Store
  const [patients, setPatients] = useState<Patient[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [cashClosures, setCashClosures] = useState<CashRegisterDay[]>([]);
  const [cashMovements, setCashMovements] = useState<CashMovement[]>([]);
  const [currentClinic, setCurrentClinic] = useState<Clinic | undefined>();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [receptionists, setReceptionists] = useState<Receptionist[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [labTechnicians, setLabTechnicians] = useState<LabTechnician[]>([]);
  const [labOrders, setLabOrders] = useState<LabOrder[]>([]);
  // Bo'limlar — ko'p profilli klinikaning asosiy o'lchovi. Kalendar, xizmatlar,
  // qabul bayoni va hisobotlar shunga tayanadi.
  const [departments, setDepartments] = useState<Department[]>([]);
  // Shifokor buyurgan to'lanmagan xizmatlar — Kassa ro'yxatida ko'rinadi
  const [charges, setCharges] = useState<VisitCharge[]>([]);
  const [reviews, setReviews] = useState<any[]>([]);
  const [searchBarTerm, setSearchBarTerm] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  // Search logic
  const searchResults = useMemo(() => {
    if (!searchBarTerm.trim() || searchBarTerm.length < 2) return { patients: [], doctors: [] };

    const term = searchBarTerm.toLowerCase();
    const filteredPatients = patients.filter(p =>
      p.firstName.toLowerCase().includes(term) ||
      p.lastName.toLowerCase().includes(term) ||
      p.phone.includes(term)
    ).slice(0, 5);

    const filteredDoctors = doctors.filter(d =>
      d.firstName.toLowerCase().includes(term) ||
      d.lastName.toLowerCase().includes(term) ||
      d.specialty.toLowerCase().includes(term)
    ).slice(0, 3);

    return { patients: filteredPatients, doctors: filteredDoctors };
  }, [searchBarTerm, patients, doctors]);

  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);

  // Check for stored session on mount
  useEffect(() => {
    const storedAuth = sessionStorage.getItem('xclinic_auth') || localStorage.getItem('xclinic_auth');
    if (storedAuth) {
      try {
        const { role, name, clinicId: storedClinicId, doctorId: storedDoctorId, receptionistId: storedReceptionistId, technicianId: storedTechnicianId } = JSON.parse(storedAuth);
        if (role && name) {
          setUserRole(role);
          setUserName(name);
          if (storedClinicId) setClinicId(storedClinicId);
          if (storedDoctorId) setDoctorId(storedDoctorId);
          if (storedReceptionistId) setReceptionistId(storedReceptionistId);
          if (storedTechnicianId) setTechnicianId(storedTechnicianId);
          setIsAuthenticated(true);
          // Offline rejimda bazada bitta klinika bo'ladi
          if (storedClinicId) {
            api.clinics.getById(storedClinicId).then(setCurrentClinic).catch(console.error);
          } else {
            api.clinics.getAll().then(list => {
              if (list.length > 0) setCurrentClinic(list[0]);
            });
          }
        }
      } catch (e) {
        console.error('Failed to parse stored auth', e);
        localStorage.removeItem('xclinic_auth');
        sessionStorage.removeItem('xclinic_auth');
      }
    }

    setAuthChecked(true);
    const handleAuthError = () => handleLogout();
    window.addEventListener('auth:unauthorized', handleAuthError);
    return () => window.removeEventListener('auth:unauthorized', handleAuthError);
  }, []);

  // Load Data
  useEffect(() => {
    if (!isAuthenticated) return;

    const loadData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const storedAuth = sessionStorage.getItem('xclinic_auth') || localStorage.getItem('xclinic_auth');
        const isDemo = storedAuth ? JSON.parse(storedAuth).isDemo : false;

        if (isDemo && clinicId === 'demo-clinic-1') {
          const { DEMO_PATIENTS, DEMO_APPOINTMENTS, DEMO_TRANSACTIONS, DEMO_EXPENSES, DEMO_SERVICES, DEMO_DOCTORS, DEMO_CLINIC, DEMO_PLAN, DEMO_CATEGORIES, DEMO_LAB_TECHNICIANS, DEMO_LAB_ORDERS, DEMO_RECEPTIONISTS, DEMO_LEADS, DEMO_INVENTORY } = await import('./services/demoData');
          setCurrentClinic(DEMO_CLINIC);
          setPatients(DEMO_PATIENTS);
          setAppointments(DEMO_APPOINTMENTS);
          setTransactions(DEMO_TRANSACTIONS);
          setExpenses(DEMO_EXPENSES);
          setServices(DEMO_SERVICES);
          setCategories(DEMO_CATEGORIES);
          setDoctors(DEMO_DOCTORS);
          setPlans([DEMO_PLAN]);
          setInventoryItems(DEMO_INVENTORY || []);
          setLabTechnicians(DEMO_LAB_TECHNICIANS || []);
          setLabOrders(DEMO_LAB_ORDERS || []);
          setReceptionists(DEMO_RECEPTIONISTS || []);
          setLeads(DEMO_LEADS || []);
        } else if (clinicId) {
          const [pts, appts, txs, exps, svcs, docs, recs, plns, invItems, cats, revs, leadsData, clinicData, labTechs, labOrds, closures, movements, depts, chrgs] = await Promise.all([
            api.patients.getAll(clinicId),
            api.appointments.getAll(clinicId),
            api.transactions.getAll(clinicId),
            api.expenses.getAll(clinicId),
            api.services.getAll(clinicId),
            api.doctors.getAll(clinicId),
            api.receptionists.getAll(clinicId),
            api.plans.getAll(),
            api.inventory.getAll(clinicId),
            api.categories.getAll(clinicId),
            api.reviews.getAll(clinicId),
            api.leads.getAll(clinicId),
            api.clinics.getById(clinicId),
            api.labTechnicians.getAll(clinicId),
            api.labOrders.getAll(clinicId),
            // Kassa ma'lumotlari — yuklanmasa sahifa baribir ishlashi kerak
            api.cashRegister.getAll(clinicId).catch(() => []),
            api.cashMovements.getAll(clinicId).catch(() => []),
            // Bo'limlar — yuklanmasa qolgan sahifalar baribir ishlashi kerak
            api.departments.getAll().catch(() => []),
            api.charges.getAll({ status: 'Unpaid' }).catch(() => [])
          ]);
          setCurrentClinic(clinicData);
          setPatients(pts);
          setAppointments(appts);
          setTransactions(txs);
          setExpenses(exps || []);
          setServices(svcs);
          setDoctors(docs);
          setReceptionists(recs);
          setPlans(plns);
          setInventoryItems(invItems);
          // @ts-ignore
          setCategories(cats);
          setReviews(revs || []);
          setLeads(leadsData || []);
          setLabTechnicians(labTechs || []);
          setLabOrders(labOrds || []);
          setCashClosures(closures || []);
          setCashMovements(movements || []);
          setDepartments(depts || []);
          setCharges(chrgs || []);
        }
      } catch (error: any) {
        console.error('Failed to load data:', error);
        if (error.message === 'Session expired') {
          handleLogout();
        } else {
          setError('Ma\'lumotlarni yuklashda xatolik yuz berdi. Iltimos, qayta urinib ko\'ring.');
        }
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, [isAuthenticated, clinicId, userRole]);

  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Theme toggle (localStorage'ga saqlanadi)
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    try { localStorage.setItem('xclinic_theme', isDarkMode ? 'dark' : 'light'); } catch {}
  }, [isDarkMode]);

  // --- Auth Actions ---
  const handleLogin = (role: UserRole, name: string, clinicIdParam?: string, doctorIdParam?: string, receptionistIdParam?: string) => {
    setUserRole(role);
    setUserName(name);
    if (clinicIdParam) setClinicId(clinicIdParam);
    if (doctorIdParam) setDoctorId(doctorIdParam);
    if (receptionistIdParam) setReceptionistId(receptionistIdParam);
    setIsAuthenticated(true);

    // Navigate based on role
    // Har kim o'z ish o'rniga tushadi — hamma Dashboard'ga emas
    if (role === UserRole.RECEPTIONIST) {
      navigate('/reception');
    } else if (role === UserRole.DOCTOR) {
      navigate('/myqueue');
    } else if (role === UserRole.LAB_TECHNICIAN) {
      navigate('/lab');
    } else {
      navigate('/');
    }
    addToast('success', `Xush kelibsiz, ${name}!`);
  };

  const handleLogout = () => {
    localStorage.removeItem('xclinic_auth');
    sessionStorage.removeItem('xclinic_auth');
    setIsAuthenticated(false);
    setUserRole(UserRole.CLINIC_ADMIN);
    setUserName('');
    setClinicId('');
    setDoctorId('');
    setReceptionistId('');
    navigate('/login');
  };

  const retryLoadData = async () => {
    // Sessiya allaqachon tozalangan bo'lsa qayta urinish befoyda — tokensiz so'rov
    // yana 401 beradi va foydalanuvchi xato ekranida qamalib qoladi. To'g'ridan-to'g'ri
    // login sahifasiga chiqaramiz.
    const storedAuth = sessionStorage.getItem('xclinic_auth') || localStorage.getItem('xclinic_auth');
    if (!storedAuth) {
      handleLogout();
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      if (clinicId) {
        const [pts, appts, txs, exps, svcs, docs, recs, plns, invItems, cats, revs, leadsData] = await Promise.all([
          api.patients.getAll(clinicId),
          api.appointments.getAll(clinicId),
          api.transactions.getAll(clinicId),
          api.expenses.getAll(clinicId),
          api.services.getAll(clinicId),
          api.doctors.getAll(clinicId),
          api.receptionists.getAll(clinicId),
          api.plans.getAll(),
          api.inventory.getAll(clinicId),
          api.categories.getAll(clinicId),
          api.reviews.getAll(clinicId),
          api.leads.getAll(clinicId)
        ]);
        setPatients(pts);
        setAppointments(appts);
        setTransactions(txs);
        setExpenses(exps || []);
        setServices(svcs);
        setDoctors(docs);
        setReceptionists(recs);
        setPlans(plns);
        setInventoryItems(invItems);
        setCategories(cats);
        // @ts-ignore
        setReviews(revs || []);
        setLeads(leadsData || []);
      }
      addToast('success', 'Ma\'lumotlar muvaffaqiyatli yuklandi!');
    } catch (error) {
      console.error('Failed to load data:', error);
      setError('Ma\'lumotlarni yuklashda xatolik yuz berdi. Iltimos, qayta urinib ko\'ring.');
    } finally {
      setIsLoading(false);
    }
  };

  // --- UI Actions ---
  const addToast = (type: 'success' | 'error' | 'info', message: string) => {
    const id = Math.random().toString(36).substr(2, 9);
    setToasts(prev => [...prev, { id, type, message }]);
  };

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  // Patient Actions
  const addPatient = async (patient: Omit<Patient, 'id'>) => {
    try {
      const normalizedFirst = patient.firstName.trim().toLowerCase();
      const normalizedLast = patient.lastName.trim().toLowerCase();
      const isDuplicate = patients.some(
        p => p.firstName.trim().toLowerCase() === normalizedFirst &&
          p.lastName.trim().toLowerCase() === normalizedLast
      );

      if (isDuplicate) {
        throw new Error(t('patients.alerts.duplicateName') || "Bunday ism va familiyali bemor allaqachon mavjud!");
      }

      let activeClinicId = clinicId;
      if (!activeClinicId) {
        const stored = sessionStorage.getItem('xclinic_auth') || localStorage.getItem('xclinic_auth');
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed.clinicId) activeClinicId = parsed.clinicId;
        }
      }
      if (!activeClinicId) {
        addToast('error', 'Klinika aniqlanmadi. Iltimos sahafani yangilang.');
        return;
      }
      const newPatient = await api.patients.create({ ...patient, clinicId: activeClinicId });
      setPatients(prev => {
        if (prev.find(p => p.id === newPatient.id)) return prev;
        return [newPatient, ...prev];
      });
      addToast('success', `Bemor ${patient.firstName} muvaffaqiyatli qo'shildi!`);
      return newPatient;
    } catch (e: any) {
      console.error('Add patient error:', e);
      addToast('error', e.message || 'Xatolik yuz berdi');
      throw e;
    }
  };

  const updatePatient = async (id: string, data: Partial<Patient>) => {
    try {
      const updated = await api.patients.update(id, data);
      setPatients(prev => prev.map(p => p.id === id ? updated : p));
      addToast('success', 'Bemor ma\'lumotlari yangilandi.');
    } catch (e: any) {
      addToast('error', e.message || 'Xatolik yuz berdi');
      throw e;
    }
  };

  const deletePatient = async (id: string) => {
    try {
      await api.patients.delete(id);
      setPatients(prev => prev.filter(p => p.id !== id));
      addToast('info', 'Bemor o\'chirildi.');
      navigate('/patients');
    } catch (e: any) {
      addToast('error', e.message || 'Xatolik yuz berdi');
      throw e;
    }
  };

  // Appointment Actions
  const addAppointment = async (appt: Omit<Appointment, 'id'>) => {
    try {
      const newAppt = await api.appointments.create({ ...appt, clinicId });
      setAppointments(prev => {
        const exists = prev.find(a => a.id === newAppt.id);
        if (exists) return prev.map(a => a.id === newAppt.id ? newAppt : a);
        return [...prev, newAppt];
      });
      addToast('success', 'Uchrashuv belgilandi.');
    } catch (e: any) {
      addToast('error', e.message || 'Xatolik yuz berdi');
      throw e;
    }
  };

  const updateAppointment = async (id: string, data: Partial<Appointment>) => {
    try {
      const updated = await api.appointments.update(id, data);
      setAppointments(prev => prev.map(a => a.id === id ? updated : a));
      addToast('success', 'Uchrashuv yangilandi.');
    } catch (e: any) {
      addToast('error', e.message || 'Xatolik yuz berdi');
      throw e;
    }
  };

  const deleteAppointment = async (id: string) => {
    try {
      await api.appointments.delete(id);
      setAppointments(prev => prev.filter(a => a.id !== id));
      addToast('info', 'Uchrashuv bekor qilindi.');
    } catch (e: any) {
      addToast('error', e.message || 'Xatolik yuz berdi');
      throw e;
    }
  };

  // Transaction Actions
  const addTransaction = async (tx: Omit<Transaction, 'id'>) => {
    try {
      const newTx = await api.transactions.create({ ...tx, clinicId });
      setTransactions(prev => {
        if (prev.find(t => t.id === newTx.id)) return prev;
        return [newTx, ...prev];
      });

      // If patientId is linked, refetch patient to get updated balance
      if (tx.patientId) {
        api.patients.getById(tx.patientId).then(updatedPatient => {
          setPatients(prev => prev.map(p => p.id === tx.patientId ? updatedPatient : p));
        }).catch(err => console.error('Failed to refetch patient after transaction:', err));
      }

      addToast('success', 'To\'lov qabul qilindi.');
      return newTx;
    } catch (e: any) {
      console.error('Add transaction error:', e);
      addToast('error', e.message || 'To\'lovni saqlashda xatolik yuz berdi');
      throw e;
    }
  };

  // Kassa kunini yopish / qayta ochish
  const closeCashDay = async (payload: Omit<CashCloseInput, 'clinicId'>) => {
    try {
      const closure = await api.cashRegister.close({ ...payload, clinicId });
      setCashClosures(prev => {
        const rest = prev.filter(c => !(c.date === closure.date && c.shift === closure.shift));
        return [closure, ...rest];
      });
      addToast('success', 'Kun yopildi.');
      return closure;
    } catch (e: any) {
      console.error('Close cash day error:', e);
      addToast('error', e.message || 'Kunni yopishda xatolik');
      throw e;
    }
  };

  const reopenCashDay = async (date: string, shift?: number) => {
    try {
      await api.cashRegister.reopen(date, shift);
      setCashClosures(prev => prev.filter(c => !(c.date === date && (!shift || c.shift === shift))));
      addToast('success', 'Kun qayta ochildi.');
    } catch (e: any) {
      console.error('Reopen cash day error:', e);
      addToast('error', e.message || 'Kunni qayta ochishda xatolik');
      throw e;
    }
  };

  const deleteTransaction = async (id: string) => {
    try {
      const tx = transactions.find(t => t.id === id);
      await api.transactions.delete(id);
      setTransactions(prev => prev.filter(t => t.id !== id));
      // Avans/balans to'lovi o'chirilsa bemor hisobini yangilab olamiz
      if (tx?.patientId) {
        api.patients.getById(tx.patientId).then(p => {
          setPatients(prev => prev.map(x => x.id === tx.patientId ? p : x));
        }).catch(() => { });
      }
      addToast('success', "To'lov o'chirildi.");
    } catch (e: any) {
      console.error('Delete transaction error:', e);
      addToast('error', e.message || "To'lovni o'chirishda xatolik");
      throw e;
    }
  };

  // Kassa harakati: inkassatsiya, bemorga qaytarish, kassaga pul solish
  const addCashMovement = async (data: Omit<CashMovement, 'id' | 'clinicId' | 'createdAt' | 'createdByName'>) => {
    try {
      const movement = await api.cashMovements.create({ ...data, clinicId } as any);
      setCashMovements(prev => [movement, ...prev]);
      addToast('success', 'Kassa harakati saqlandi.');
      return movement;
    } catch (e: any) {
      console.error('Cash movement error:', e);
      addToast('error', e.message || 'Saqlashda xatolik');
      throw e;
    }
  };

  const deleteCashMovement = async (id: string) => {
    try {
      await api.cashMovements.delete(id);
      setCashMovements(prev => prev.filter(m => m.id !== id));
      addToast('success', "Kassa harakati o'chirildi.");
    } catch (e: any) {
      console.error('Cash movement delete error:', e);
      addToast('error', e.message || "O'chirishda xatolik");
      throw e;
    }
  };

  const updateTransaction = async (id: string, data: Partial<Transaction>) => {
    try {
      console.log('Updating transaction:', id, data);
      const updated = await api.transactions.update(id, { ...data });
      setTransactions(prev => prev.map(t => t.id === id ? updated : t));

      // If patientId is linked, refetch patient to get updated balance
      if (updated.patientId) {
        api.patients.getById(updated.patientId).then(updatedPatient => {
          setPatients(prev => prev.map(p => p.id === updated.patientId ? updatedPatient : p));
        }).catch(err => console.error('Failed to refetch patient after update:', err));
      }

      addToast('success', 'To\'lov holati yangilandi.');
    } catch (e: any) {
      console.error('Transaction update error:', e);
      addToast('error', e.message || 'Xatolik yuz berdi');
    }
  };

  // Expense Actions (Xarajatlar)
  const refreshExpenses = async () => {
    try {
      const exps = await api.expenses.getAll(clinicId);
      setExpenses(exps || []);
    } catch (e) {
      console.error('Failed to refresh expenses:', e);
    }
  };

  /* Ombor qoldig'ini qayta o'qish. Kerak, chunki qoldiq endi harakatlar orqali
     o'zgaradi: kirim/chiqim/inventarizatsiyadan keyin ro'yxat eskirib qoladi. */
  const refreshInventory = async () => {
    try {
      const invItems = await api.inventory.getAll(clinicId);
      setInventoryItems(invItems || []);
    } catch (e) {
      console.error('Failed to refresh inventory:', e);
    }
  };

  const addExpense = async (expense: Omit<Expense, 'id'>) => {
    try {
      const newExpense = await api.expenses.create({ ...expense, clinicId });
      setExpenses(prev => [newExpense, ...prev]);
      addToast('success', 'Xarajat qo\'shildi.');
      return newExpense;
    } catch (e: any) {
      console.error('Add expense error:', e);
      addToast('error', e.message || 'Xarajatni saqlashda xatolik yuz berdi');
      throw e;
    }
  };

  const updateExpense = async (id: string, data: Partial<Expense>) => {
    try {
      const updated = await api.expenses.update(id, data);
      setExpenses(prev => prev.map(e => e.id === id ? updated : e));
      addToast('success', 'Xarajat yangilandi.');
    } catch (e: any) {
      console.error('Expense update error:', e);
      addToast('error', e.message || 'Xatolik yuz berdi');
    }
  };

  const deleteExpense = async (id: string) => {
    try {
      await api.expenses.delete(id);
      setExpenses(prev => prev.filter(e => e.id !== id));
      addToast('info', 'Xarajat o\'chirildi.');
    } catch (e: any) {
      addToast('error', e.message || 'Xatolik yuz berdi');
    }
  };

  // Leads Actions
  const addLead = async (lead: Omit<Lead, 'id' | 'createdAt' | 'updatedAt'>) => {
    try {
      const newLead = await api.leads.create({ ...lead, clinicId });
      setLeads(prev => [newLead, ...prev]);
      addToast('success', 'Yangi lid qo\'shildi.');
    } catch (e: any) {
      addToast('error', e.message || 'Xatolik yuz berdi');
    }
  };

  const updateLead = async (id: string, data: Partial<Lead>) => {
    try {
      const updated = await api.leads.update(id, data);
      setLeads(prev => prev.map(l => l.id === id ? updated : l));
    } catch (e: any) {
      addToast('error', e.message || 'Xatolik yuz berdi');
    }
  };

  const deleteLead = async (id: string) => {
    try {
      await api.leads.delete(id);
      setLeads(prev => prev.filter(l => l.id !== id));
      addToast('info', 'Lid o\'chirildi.');
    } catch (e: any) {
      addToast('error', e.message || 'Xatolik yuz berdi');
    }
  };

  const convertLeadToPatient = async (leadId: string, appointmentData: Partial<Appointment>) => {
    try {
      const lead = leads.find(l => l.id === leadId);
      if (!lead) return;

      // 1. Create Patient
      const nameParts = lead.name.split(' ');
      const firstName = nameParts[0] || '';
      const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';

      // Tashqi manbadan kelgan lidda manzil va tug'ilgan sana bo'lishi mumkin —
      // ular bemor kartasidagi o'z maydoniga tushadi, izohlar ichida qolib ketmaydi.
      const newPatient = await api.patients.create({
        firstName,
        lastName,
        phone: lead.phone,
        dob: lead.dob || '',
        address: lead.address || undefined,
        gender: 'Male',
        status: 'Active',
        lastVisit: 'Never',
        medicalHistory: lead.notes || '',
        clinicId,
      });

      setPatients(prev => {
        if (prev.find(p => p.id === newPatient.id)) return prev;
        return [newPatient, ...prev];
      });

      // 2. Schedule Appointment
      const doctor = doctors.find(d => d.id === appointmentData.doctorId);
      if (doctor) {
        await addAppointment({
          patientId: newPatient.id,
          patientName: `${newPatient.lastName} ${newPatient.firstName}`,
          doctorId: doctor.id,
          doctorName: `Dr. ${doctor.lastName} ${doctor.firstName}`,
          type: appointmentData.type || 'Konsultatsiya',
          date: appointmentData.date || todayISO(),
          time: appointmentData.time || '12:00',
          duration: appointmentData.duration || 60,
          status: 'Pending',
          notes: lead.service ? `Qiziqish bildirdi: ${lead.service}` : '',
          clinicId,
        });
      }

      // 3. Update Lead Status
      await updateLead(leadId, { status: 'Booked' });

      addToast('success', 'Lid mijozga aylantirildi va qabulga yozildi!');
    } catch (e: any) {
      addToast('error', e.message || 'Lidni aylantirishda xatolik yuz berdi');
    }
  };

  // Settings Actions
  const addService = async (service: Omit<Service, 'id' | 'clinicId'>) => {
    try {
      const newService = await api.services.create({ ...service, duration: service.duration || 60, clinicId });
      setServices(prev => {
        if (prev.find(s => s.id === newService.id)) return prev;
        return [...prev, newService];
      });
      addToast('success', 'Yangi xizmat qo\'shildi.');
    } catch (e: any) { addToast('error', e.message || 'Xatolik yuz berdi'); }
  };

  const updateService = async (index: number, service: Partial<Service>) => {
    const serviceToUpdate = services[index];
    if (serviceToUpdate && serviceToUpdate.id) {
      try {
        const updated = await api.services.update(serviceToUpdate.id, { ...service, duration: service.duration || 60 });
        setServices(prev => prev.map(s => s.id === updated.id ? updated : s));
        addToast('success', 'Xizmat yangilandi.');
      } catch (e: any) { addToast('error', e.message || 'Xatolik yuz berdi'); }
    }
  };

  const deleteService = async (id: number) => {
    try {
      await api.services.remove(id);
      setServices(prev => prev.filter(s => s.id !== id));
      addToast('success', 'Xizmat o\'chirildi.');
    } catch (e: any) { addToast('error', e.message || 'Xatolik yuz berdi'); }
  };

  const addDoctor = async (doctor: Omit<Doctor, 'id'>) => {
    try {
      const newDoc = await api.doctors.create({ ...doctor, clinicId });
      setDoctors(prev => {
        if (prev.find(d => d.id === newDoc.id)) return prev;
        return [...prev, newDoc];
      });
      addToast('success', 'Yangi shifokor qo\'shildi.');
    } catch (e: any) { addToast('error', e.message || 'Xatolik yuz berdi'); }
  };

  const updateDoctor = async (id: string, data: Partial<Doctor>) => {
    try {
      const updated = await api.doctors.update(id, data);
      setDoctors(prev => prev.map(d => d.id === id ? updated : d));
      addToast('success', 'Shifokor ma\'lumotlari yangilandi.');
    } catch (e: any) { addToast('error', e.message || 'Xatolik yuz berdi'); }
  };

  const deleteDoctor = async (id: string) => {
    try {
      await api.doctors.delete(id);
      setDoctors(prev => prev.filter(d => d.id !== id));
      addToast('info', 'Shifokor o\'chirildi.');
    } catch (e: any) { addToast('error', e.message || 'Xatolik yuz berdi'); }
  };

  const addReceptionist = async (receptionist: Omit<Receptionist, 'id'>) => {
    try {
      const newRec = await api.receptionists.create({ ...receptionist, clinicId });
      setReceptionists(prev => [...prev, newRec]);
      addToast('success', 'Yangi resepshn qo\'shildi.');
    } catch (e: any) { addToast('error', e.message || 'Xatolik yuz berdi'); }
  };

  const updateReceptionist = async (id: string, data: Partial<Receptionist>) => {
    try {
      const updated = await api.receptionists.update(id, data);
      setReceptionists(prev => prev.map(r => r.id === id ? updated : r));
      addToast('success', 'Resepshn ma\'lumotlari yangilandi.');
    } catch (e: any) {
      addToast('error', e.message || 'Xatolik yuz berdi');
      throw e;
    }
  };

  const deleteReceptionist = async (id: string) => {
    try {
      await api.receptionists.delete(id);
      setReceptionists(prev => prev.filter(r => r.id !== id));
      addToast('info', 'Resepshn o\'chirildi.');
    } catch (e: any) { addToast('error', e.message || 'Xatolik yuz berdi'); }
  };

  const addLabTechnician = async (tech: Omit<LabTechnician, 'id' | 'status'>) => {
    try {
      const newTech = await api.labTechnicians.create({ ...tech, clinicId });
      setLabTechnicians(prev => [...prev, newTech]);
      addToast('success', 'Yangi lab texnik qo\'shildi.');
    } catch (e: any) { addToast('error', e.message || 'Xatolik yuz berdi'); }
  };

  const updateLabTechnician = async (id: string, data: Partial<LabTechnician>) => {
    try {
      const updated = await api.labTechnicians.update(id, data);
      setLabTechnicians(prev => prev.map(t => t.id === id ? updated : t));
      addToast('success', 'Texnik ma\'lumotlari yangilandi.');
    } catch (e: any) {
      addToast('error', e.message || 'Xatolik yuz berdi');
      throw e;
    }
  };

  const deleteLabTechnician = async (id: string) => {
    try {
      await api.labTechnicians.delete(id);
      setLabTechnicians(prev => prev.filter(t => t.id !== id));
      addToast('info', 'Texnik o\'chirildi.');
    } catch (e: any) { addToast('error', e.message || 'Xatolik yuz berdi'); }
  };



  // Inventory Actions
  const addInventoryItem = async (item: Omit<InventoryItem, 'id' | 'createdAt' | 'updatedAt'> & { initialCost?: number }) => {
    try {
      const newItem = await api.inventory.create({ ...item, clinicId });
      setInventoryItems(prev => [...prev, newItem]);
      // Boshlang'ich narx kiritilgan bo'lsa backend Ombor xarajatini yozadi
      if (item.initialCost && item.initialCost > 0) refreshExpenses();
      addToast('success', 'Material qo\'shildi!');
    } catch (e: any) { addToast('error', e.message || 'Xatolik yuz berdi'); }
  };

  /* ESKIRGAN — interfeys endi bundan FOYDALANMAYDI.
     Bu funksiya `PUT /api/inventory/:id/stock` ni chaqiradi, u esa qoldiqni
     to'g'ridan-to'g'ri qayta yozadi va harakat qatorini yozmaydi. Ombor ekrani
     endi `api.stock.*` orqali ishlaydi: kirim/chiqim/inventarizatsiya —
     hammasi StockMovement bo'lib tushadi, shunda qoldiq isbotlanadi.
     Endpoint o'z joyida qoldirildi (ishlayotgan narsani buzmaymiz), lekin bu
     yo'lni QAYTA ISHLATMANG. */
  const updateInventoryStock = async (id: string, data: { change: number; type: 'IN' | 'OUT'; note?: string; userName: string; cost?: number }) => {
    try {
      const updated = await api.inventory.updateStock(id, data);
      setInventoryItems(prev => prev.map(item => item.id === id ? updated : item));

      // Kirim narxi bo'lsa backend Ombor xarajatini yaratadi вЂ” ro'yxatni yangilaymiz
      if (data.type === 'IN' && data.cost && data.cost > 0) refreshExpenses();

      addToast('success', 'Miqdor yangilandi.');
    } catch (e: any) { addToast('error', e.message || 'Xatolik yuz berdi'); }
  };

  const deleteInventoryItem = async (id: string) => {
    try {
      await api.inventory.delete(id);
      setInventoryItems(prev => prev.filter(item => item.id !== id));
      addToast('info', 'Material o\'chirildi.');
    } catch (e: any) { addToast('error', e.message || 'Xatolik yuz berdi'); }
  };

  // Category Actions
  const addCategory = async (category: Omit<ServiceCategory, 'id' | 'clinicId'>) => {
    try {
      const newCategory = await api.categories.create({ ...category, clinicId });
      setCategories(prev => [...prev, newCategory]);
      addToast('success', 'Kategoriya qo\'shildi!');
    } catch (e) { addToast('error', 'Xatolik yuz berdi'); }
  };

  const deleteCategory = async (id: string) => {
    try {
      await api.categories.delete(id);
      setCategories(prev => prev.filter(c => c.id !== id));
      addToast('info', 'Kategoriya o\'chirildi.');
    } catch (e) { addToast('error', 'Xatolik yuz berdi'); }
  };

  // --- Navigation ---
  const handlePatientClick = (id: string) => {
    navigate(`/patients/${id}`);
  };

  // Ruxsatlar (Sozlamalar в†’ Ruxsatlar): rol bo'yicha modul/moliya/telefon ko'rinishi
  const accessControl = parseAccessControl(currentClinic);
  const showFinanceForRole = canSeeFinance(accessControl, userRole);
  const visibleNavigation = CLINIC_NAVIGATION.filter(nav =>
    nav.roles.includes(userRole)
    && !isModuleHidden(accessControl, userRole, nav.id)
    // Moliya — pul ma'lumoti; "Moliyani ko'rsatish" o'chirilgan rol uni ko'rmasligi kerak
    && (nav.id !== 'finance' || showFinanceForRole)
  );
  const showPatientPhoneForRole = canSeePatientPhone(accessControl, userRole);

  // --- Main Render ---
  if (!isAuthenticated) {
    if (!authChecked) return null;
    return (
      <>
        <Routes>
          <Route path="/" element={<SignIn onLogin={handleLogin} />} />
          <Route path="/login" element={<SignIn onLogin={handleLogin} />} />
          {/* Tablo televizorda login qilmasdan ochiladi */}
          <Route path="/board/:clinicId" element={<QueueBoard />} />
          <Route path="*" element={<SignIn onLogin={handleLogin} />} />
        </Routes>
        <InstallPWAButton />
      </>
    );
  }


  // Loading Screen
  if (isLoading && !error) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-primary-600 dark:text-primary-400 animate-spin mx-auto mb-4" />
          <p className="text-lg font-medium text-gray-700 dark:text-gray-300">{t('common.loading')}</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">{t('common.pleaseWait')}</p>
        </div>
      </div>
    );
  }

  // Error Screen
  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8 text-center">
          <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-8 h-8 text-red-600 dark:text-red-400" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">{t('common.error')}</h2>
          <p className="text-gray-600 dark:text-gray-400 mb-6">{error}</p>
          <div className="space-y-3">
            <button
              onClick={retryLoadData}
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-primary-600 hover:bg-primary-700 disabled:bg-primary-400 text-white rounded-lg font-medium transition-colors"
            >
              <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
              {isLoading ? t('common.loading') : t('common.retry')}
            </button>
            <button
              onClick={handleLogout}
              className="w-full px-6 py-3 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-900 dark:text-white rounded-lg font-medium transition-colors"
            >
              {t('common.logout')}
            </button>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-6">
            Ma'lumotlaringiz xavfsiz. Bu faqat ulanish muammosi.
          </p>
        </div>
      </div>
    );
  }

  const pageLabel = t(getPageLabelKey(location.pathname));

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 font-sans transition-colors duration-200">
      <ToastContainer toasts={toasts} removeToast={removeToast} />
      <InstallPWAButton />

      {/* Mobile Header (Hidden on Desktop) */}
      <div className="lg:hidden flex items-center justify-between p-4 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-30">
        <div className="flex items-center gap-2 font-bold text-xl text-primary dark:text-primary-400">
          <div className="w-8 h-8 rounded-[8px] overflow-hidden shadow-sm">
            <img src="/logo-icon.png" alt="Logo" className="w-full h-full object-cover" />
          </div>
          XClinic
        </div>
        <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 text-gray-600 dark:text-gray-300">
          {isSidebarOpen ? <X /> : <Menu />}
        </button>
      </div>

      {/* Mobile Sidebar Drawer (Hidden on Desktop) */}
      <aside className={`lg:hidden fixed inset-y-0 left-0 z-50 w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 transform transition-transform duration-300 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex flex-col h-full pb-16">
          <div className="h-16 flex items-center px-6 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2 font-bold text-xl text-primary dark:text-primary-400">
              <div className="w-8 h-8 rounded-[8px] overflow-hidden shadow-sm">
                <img src="/logo-icon.png" alt="Logo" className="w-full h-full object-cover" />
              </div>
              XClinic
            </div>
            <button onClick={() => setIsSidebarOpen(false)} className="ml-auto p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
              <X className="w-5 h-5" />
            </button>
          </div>

          <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
            {visibleNavigation.map((item) => {
              const to = item.id === 'dashboard' ? '/' : `/${item.id}`;
              return (
                <NavLink
                  key={item.id}
                  to={to}
                  end={item.id === 'dashboard'}
                  onClick={() => setIsSidebarOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center w-full px-3 py-2.5 text-sm font-medium rounded-lg transition-colors group ${isActive || (item.id === 'patients' && location.pathname.startsWith('/patients'))
                      ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300'
                      : 'text-gray-700 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700/50'
                    }`
                  }
                >
                  <item.icon className={`w-5 h-5 mr-3 ${location.pathname === to || (item.id === 'patients' && location.pathname.startsWith('/patients'))
                    ? 'text-primary dark:text-primary-400'
                    : 'text-gray-400 group-hover:text-gray-500'
                    }`} />
                  {t(item.labelKey as any)}
                </NavLink>
              );
            })}
          </nav>

          <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center overflow-hidden flex-1 mr-2">
                <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-white font-bold text-xs uppercase bg-primary`}>
                  {userName ? userName.slice(0, 2) : 'A'}
                </div>
                <div className="ml-3 truncate">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate" title={userName}>{userName}</p>
                  <p className="text-xs text-gray-500 capitalize">{userRole === UserRole.CLINIC_ADMIN ? 'Administrator' : userRole === UserRole.RECEPTIONIST ? 'Resepshn' : userRole === UserRole.LAB_TECHNICIAN ? 'Laborant' : 'Shifokor'}</p>
                </div>
              </div>
              <button onClick={handleLogout} className="text-gray-400 hover:text-red-500 flex-shrink-0" title="Chiqish">
                <LogOut className="w-5 h-5" />
              </button>
            </div>
            {/* Language Toggle */}
            <div className="flex items-center bg-gray-200/70 dark:bg-gray-700/60 rounded-full p-0.5 gap-0.5 border border-gray-200 dark:border-gray-600">
              {(['uz', 'ru'] as const).map((lang) => (
                <button
                  key={lang}
                  onClick={() => setLanguage(lang)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-full text-xs font-semibold transition-all duration-200 ${language === lang
                      ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm'
                      : 'text-gray-500 dark:text-gray-400'
                    }`}
                >
                  <span className="text-base leading-none">{lang === 'uz' ? '🇺🇿' : '🇷🇺'}</span>
                  <span className="uppercase tracking-wide">{lang}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </aside>

      {/* Desktop Top Navbar (Hidden on Mobile) */}
      <header className="hidden lg:block fixed top-0 inset-x-0 z-40 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shadow-sm transition-colors duration-200">
        {/* Center container for alignment with main content */}
        <div className="w-full px-4 sm:px-6 lg:px-10 xl:px-14">
          {/* Top Row: Logo, Search, Actions */}
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-6">
              {/* Logo */}
              <div className="flex items-center gap-3 font-extrabold text-primary dark:text-primary-400 text-2xl tracking-tight">
                <div className="w-10 h-10 rounded-[10px] overflow-hidden shadow-md">
                  <img src="/logo-icon.png" alt="XClinic" className="w-full h-full object-cover" />
                </div>
                XClinic
              </div>

              {clinicId === 'demo-clinic-1' && (
                <span className="px-2 py-1 text-xs font-bold bg-primary-100 dark:bg-primary-900/40 text-primary dark:text-primary-400 rounded-full border border-primary-200 dark:border-primary-800">
                  рџ§Є DEMO MODE
                </span>
              )}

              {/* Search and Branch Control */}
              <div className="flex items-center gap-3 ml-4 bg-gray-50 dark:bg-gray-800/50 p-1 rounded-xl border border-gray-100 dark:border-gray-700">
                <div className="relative group">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-primary-500 transition-colors" />
                  <input
                    type="text"
                    placeholder={t('header.search')}
                    value={searchBarTerm}
                    onChange={(e) => setSearchBarTerm(e.target.value)}
                    onFocus={() => setIsSearchFocused(true)}
                    className="pl-9 pr-4 py-2 w-72 bg-white dark:bg-gray-800 border-none rounded-lg text-sm focus:ring-2 focus:ring-primary-500/20 placeholder-gray-400 transition-all outline-none"
                  />

                  {/* Search Results Dropdown */}
                  {isSearchFocused && searchBarTerm.length >= 2 && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setIsSearchFocused(false)}></div>
                      <div className="absolute top-full left-0 mt-2 w-[340px] bg-white/90 dark:bg-gray-800/90 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/20 dark:border-gray-700/50 overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-300">
                        {searchResults.patients.length === 0 && searchResults.doctors.length === 0 ? (
                          <div className="p-8 text-center">
                            <div className="w-12 h-12 bg-gray-50 dark:bg-gray-700/50 rounded-full flex items-center justify-center mx-auto mb-3">
                              <Search className="w-5 h-5 text-gray-400" />
                            </div>
                            <p className="text-sm font-medium text-gray-900 dark:text-white">Natija topilmadi</p>
                            <p className="text-xs text-gray-500 mt-1">Boshqa so'z bilan urinib ko'ring</p>
                          </div>
                        ) : (
                          <div className="max-h-[420px] overflow-y-auto no-scrollbar py-2">
                            {searchResults.patients.length > 0 && (
                              <div className="px-2 mb-2">
                                <div className="px-3 py-2 flex items-center gap-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                                  <Users className="w-3 h-3" />
                                  Bemorlar
                                </div>
                                {searchResults.patients.map(p => (
                                  <button
                                    key={p.id}
                                    onClick={() => {
                                      navigate(`/patients/${p.id}`);
                                      setSearchBarTerm('');
                                      setIsSearchFocused(false);
                                    }}
                                    className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-primary/5 dark:hover:bg-primary-400/10 group transition-all text-left"
                                  >
                                    <div className="w-9 h-9 rounded-lg bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center text-primary-600 dark:text-primary-400 font-bold text-xs shrink-0 group-hover:scale-110 transition-transform">
                                      {p.firstName[0]}{p.lastName[0]}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                                        {p.firstName} {p.lastName}
                                      </p>
                                      <p className="text-[11px] text-gray-500 truncate">{p.phone}</p>
                                    </div>
                                  </button>
                                ))}
                              </div>
                            )}

                            {searchResults.doctors.length > 0 && (
                              <div className="px-2 border-t border-gray-100 dark:border-gray-700/50 pt-2">
                                <div className="px-3 py-2 flex items-center gap-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                                  <Activity className="w-3 h-3" />
                                  Shifokorlar
                                </div>
                                {searchResults.doctors.map(d => (
                                  <button
                                    key={d.id}
                                    onClick={() => {
                                      navigate(`/doctors/${d.id}`);
                                      setSearchBarTerm('');
                                      setIsSearchFocused(false);
                                    }}
                                    className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-primary/5 dark:hover:bg-primary-400/10 group transition-all text-left"
                                  >
                                    <div className="w-9 h-9 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center text-emerald-600 dark:text-emerald-400 font-bold text-xs shrink-0 group-hover:scale-110 transition-transform">
                                      {d.firstName[0]}{d.lastName[0]}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                                        Dr. {d.firstName} {d.lastName}
                                      </p>
                                      <p className="text-[11px] text-gray-500 truncate">{d.specialty}</p>
                                    </div>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                        <div className="p-3 bg-gray-50 dark:bg-gray-800/80 border-t border-gray-100 dark:border-gray-700/50 text-center">
                          <p className="text-[10px] text-gray-400 font-medium">Barcha natijalarni ko'rish uchun "Enter" ni bosing</p>
                        </div>
                      </div>
                    </>
                  )}
                </div>


              </div>
            </div>

            <div className="flex items-center gap-5">
              <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
                {new Date().toLocaleDateString('uz-UZ', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
              </span>
              <div className="h-6 w-px bg-gray-200 dark:bg-gray-700"></div>
              <button
                onClick={() => setIsDarkMode(!isDarkMode)}
                className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
              >
                {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              </button>

              {/* Language Switcher - Pill Toggle */}
              <div className="flex items-center bg-gray-100 dark:bg-gray-700/60 rounded-full p-0.5 gap-0.5 border border-gray-200 dark:border-gray-600">
                {(['uz', 'ru'] as const).map((lang) => (
                  <button
                    key={lang}
                    onClick={() => setLanguage(lang)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all duration-200 ${language === lang
                        ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm'
                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                      }`}
                  >
                    <span className="text-base leading-none">{lang === 'uz' ? '🇺🇿' : '🇷🇺'}</span>
                    <span className="uppercase tracking-wide">{lang}</span>
                  </button>
                ))}
              </div>

              {/* User Profile Info */}
              <div className="flex items-center gap-3 pl-4 border-l border-gray-200 dark:border-gray-700 ml-2">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm uppercase shadow-sm bg-primary`}>
                  {userName ? userName.slice(0, 2) : 'A'}
                </div>
                <div className="flex flex-col">
                  <span className="text-sm font-semibold text-gray-900 dark:text-white leading-tight">{userName}</span>
                  <span className="text-xs text-gray-500 capitalize leading-tight">
                    {userRole === UserRole.CLINIC_ADMIN ? t('roles.admin') : userRole === UserRole.RECEPTIONIST ? t('roles.receptionist') : userRole === UserRole.LAB_TECHNICIAN ? 'Laborant' : t('roles.doctor')}
                  </span>
                </div>
                <button onClick={handleLogout} className="ml-2 p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors" title={t('common.logout')}>
                  <LogOut className="w-5 h-5" />
                </button>
              </div>

            </div>
          </div>
        </div>

        {/* Bottom Row: Navigation Links */}
        <div className="border-t border-gray-100 dark:border-gray-700/50 bg-gray-50/50 dark:bg-gray-800/80">
          <div className="w-full px-4 sm:px-6 lg:px-10 xl:px-14">
            <div className="h-12 flex items-center gap-2 overflow-x-auto no-scrollbar">
              {visibleNavigation.map((item) => {
                const to = item.id === 'dashboard' ? '/' : `/${item.id}`;
                return (
                  <NavLink
                    key={item.id}
                    to={to}
                    end={item.id === 'dashboard'}
                    className={({ isActive }) => {
                      const active = isActive || (item.id === 'patients' && location.pathname.startsWith('/patients'));
                      return `relative flex items-center h-12 px-4 text-sm font-medium transition-colors whitespace-nowrap group ${active
                        ? 'text-primary dark:text-primary-400 bg-primary-50/60 dark:bg-primary-900/20'
                        : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700'
                        }`
                    }}
                  >
                    {({ isActive }) => {
                      const active = isActive || (item.id === 'patients' && location.pathname.startsWith('/patients'));
                      return (
                        <>
                          <item.icon className={`w-4 h-4 mr-2 ${active ? 'text-primary dark:text-primary-400' : 'text-gray-400 group-hover:text-gray-500 dark:group-hover:text-gray-300'}`} />
                          {t(item.labelKey as any)}
                          {active && (
                            <span className="absolute bottom-0 left-0 w-full h-0.5 bg-primary dark:bg-primary-400 rounded-t-full"></span>
                          )}
                        </>
                      );
                    }}
                  </NavLink>
                );
              })}
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 lg:pt-28 min-h-screen flex flex-col items-center">
        <div className="w-full px-4 sm:px-6 lg:px-10 xl:px-14 py-4 sm:py-6 lg:py-8 flex-1 overflow-x-hidden pb-24 lg:pb-8">
          <ErrorBoundary key={location.pathname} section={t(getPageLabelKey(location.pathname))}>
          <Routes>

            <>
              <Route path="/" element={
                  <Dashboard
                    patients={patients}
                    appointments={appointments}
                    transactions={transactions}
                    reviews={reviews}
                    userRole={userRole}
                    doctorId={doctorId}
                    doctors={doctors}
                    leads={leads}
                    labOrders={labOrders}
                    services={services}
                    currentClinic={currentClinic}
                    clinicId={clinicId}
                    showFinance={showFinanceForRole}
                    onPatientClick={handlePatientClick}
                    onUpdateAppointment={updateAppointment}
                    onUpdateTransaction={updateTransaction}
                    onAddPatient={addPatient}
                    onAddTransaction={addTransaction}
                    onAddAppointment={addAppointment}
                    addToast={addToast}
                  />
                } />

              <Route path="/patients" element={
                <Patients
                  userRole={userRole}
                  patients={patients}
                  doctors={doctors}
                  appointments={appointments}
                  transactions={transactions}
                  showPatientPhone={showPatientPhoneForRole}
                  onPatientClick={handlePatientClick}
                  onAddPatient={addPatient}
                  onDeletePatient={deletePatient}
                  onUpdatePatient={updatePatient}
                  currentClinic={currentClinic}
                />
              } />

              {(userRole === UserRole.CLINIC_ADMIN || userRole === UserRole.RECEPTIONIST) && (
                <Route path="/leads" element={
                  <Leads
                    leads={leads}
                    doctors={doctors}
                    categories={categories}
                    services={services}
                    currentClinic={currentClinic}
                    onAddLead={addLead}
                    onUpdateLead={updateLead}
                    onDeleteLead={deleteLead}
                    onConvertLead={convertLeadToPatient}
                  />
                } />
              )}

              <Route path="/patients/:patientId" element={
                <PatientDetails
                  patients={patients}
                  appointments={appointments}
                  transactions={transactions}
                  doctors={doctors}
                  services={services}
                  categories={categories}
                  currentClinic={currentClinic}
                  plans={plans}
                  userRole={userRole}
                  doctorId={doctorId}
                  showPatientPhone={showPatientPhoneForRole}
                  onBack={() => navigate('/patients')}
                  onUpdatePatient={updatePatient}
                  onAddTransaction={addTransaction}
                  onUpdateTransaction={updateTransaction}
                  onAddAppointment={addAppointment}
                  onUpdateAppointment={updateAppointment}
                />
              } />

              <Route path="/calendar" element={
                <Calendar
                  appointments={appointments}
                  patients={patients}
                  doctors={doctors}
                  services={services}
                  categories={categories}
                  onAddAppointment={addAppointment}
                  onUpdateAppointment={updateAppointment}
                  onDeleteAppointment={deleteAppointment}
                  onAddPatient={addPatient}
                  userRole={userRole}
                  doctorId={doctorId}
                  currentClinic={currentClinic}
                  plans={plans}
                  onPatientClick={handlePatientClick}
                />
              } />

              {/* Eski manzil — zakladkalar buzilmasligi uchun yo'naltiriladi */}
              <Route path="/cashbook" element={<Navigate to="/finance" replace />} />

              {(userRole === UserRole.CLINIC_ADMIN || userRole === UserRole.RECEPTIONIST) && showFinanceForRole && (
                <Route path="/finance" element={
                  <FinanceHub
                    userRole={userRole}
                    transactions={transactions}
                    expenses={expenses}
                    appointments={appointments}
                    services={services}
                    patients={patients}
                    onPatientClick={handlePatientClick}
                    doctorId={doctorId}
                    clinicId={clinicId}
                    doctors={doctors}
                    receptionists={receptionists}
                    currentClinic={currentClinic}
                    labOrders={labOrders}
                    onAddTransaction={addTransaction}
                    onAddExpense={addExpense}
                    onUpdateExpense={updateExpense}
                    onDeleteExpense={deleteExpense}
                    closures={cashClosures}
                    movements={cashMovements}
                    onCloseDay={closeCashDay}
                    onReopenDay={reopenCashDay}
                    onAddCashMovement={addCashMovement}
                    onDeleteCashMovement={deleteCashMovement}
                    onUpdateTransaction={updateTransaction}
                    onDeleteTransaction={deleteTransaction}
                    currentUserName={userName}
                    addToast={addToast}
                    departments={departments}
                    charges={charges}
                    onChargesChanged={() => {
                      // To'lovdan keyin ikkalasi ham yangilanadi: qatorlar va kassa
                      api.charges.getAll({ status: 'Unpaid' }).then(setCharges).catch(console.error);
                      if (clinicId) api.transactions.getAll(clinicId).then(setTransactions).catch(console.error);
                    }}
                  />
                } />
              )}

              <Route path="/board" element={<QueueBoard clinicId={clinicId} />} />

              <Route path="/reception" element={
                <Reception
                  clinicId={clinicId}
                  patients={patients}
                  doctors={doctors}
                  departments={departments}
                  services={services}
                  currentClinic={currentClinic}
                  onPatientAdded={(p) => setPatients(prev => [p, ...prev])}
                  addToast={addToast}
                />
              } />

              <Route path="/myqueue" element={
                <MyQueue
                  userRole={userRole}
                  doctorId={doctorId}
                  departments={departments}
                  addToast={addToast}
                />
              } />

              {/* Kassa endi Moliya ichida — eski havolalar shu yerga tushadi */}
              <Route path="/cashier" element={<Navigate to="/finance" replace />} />

              <Route path="/visit/:visitId" element={
                <VisitWorkspace
                  departments={departments}
                  services={services}
                  doctors={doctors}
                  currentUserName={userName}
                  addToast={addToast}
                />
              } />

              <Route path="/diagnostics" element={
                <Diagnostics
                  clinicId={clinicId}
                  patients={patients}
                  departments={departments}
                  services={services}
                  doctors={doctors}
                  currentUserName={userName}
                  token={(() => {
                    try {
                      const raw = sessionStorage.getItem('xclinic_auth') || localStorage.getItem('xclinic_auth');
                      return raw ? JSON.parse(raw).token : undefined;
                    } catch { return undefined; }
                  })()}
                />
              } />

              <Route path="/inpatient" element={
                <Inpatient
                  clinicId={clinicId}
                  patients={patients}
                  departments={departments}
                  doctors={doctors}
                  inventoryItems={inventoryItems}
                  currentUserName={userName}
                />
              } />

              <Route path="/lab" element={
                <LabOrders
                  clinicId={clinicId}
                  labOrders={labOrders}
                  setLabOrders={setLabOrders}
                  doctors={doctors}
                  patients={patients}
                  departments={departments}
                  currentUserName={userName}
                  onExpensesChanged={refreshExpenses}
                  defaultDoctorName={(() => {
                    if (userRole !== UserRole.DOCTOR) return undefined;
                    const d = doctors.find(x => x.id === doctorId);
                    return d ? `Dr. ${d.lastName} ${d.firstName}` : undefined;
                  })()}
                />
              } />

              {(userRole === UserRole.CLINIC_ADMIN || userRole === UserRole.RECEPTIONIST) && (
                <>
                  <Route path="/doctors" element={
                    <DoctorsAnalytics
                      doctors={doctors}
                      appointments={appointments}
                      services={services}
                      transactions={transactions}
                      reviews={reviews}
                    />
                  } />

                  <Route path="/doctors/:doctorId" element={
                    <DoctorDetails
                      doctorId="" // Will be handled by useParams in a wrapper or directly if we use useParams inside DoctorDetails, but wait, let's just make DoctorDetails use useParams or pass a wrapper.
                      doctors={doctors}
                      appointments={appointments}
                      transactions={transactions}
                      patients={patients}
                      services={services}
                      onBack={() => navigate('/doctors')}
                      onPatientClick={handlePatientClick}
                    />
                  } />

                  <Route path="/inventory" element={
                    <Inventory
                      items={inventoryItems}
                      userName={userName}
                      userRole={userRole}
                      onAddItem={addInventoryItem}
                      onDeleteItem={deleteInventoryItem}
                      onRefreshItems={refreshInventory}
                    />
                  } />

                  <Route path="/messages" element={
                    <MessagesManagement
                      clinicId={clinicId}
                      currentClinic={currentClinic}
                      doctors={doctors}
                      addToast={addToast}
                    />
                  } />

                  <Route path="/settings" element={
                    <Settings
                      userRole={userRole}
                      services={services}
                      categories={categories}
                      doctors={doctors}
                      receptionists={receptionists}
                      labTechnicians={labTechnicians}
                      onAddService={addService}
                      onUpdateService={updateService}
                      onDeleteService={deleteService}
                      onAddCategory={addCategory}
                      onDeleteCategory={deleteCategory}
                      onAddDoctor={addDoctor}
                      onUpdateDoctor={updateDoctor}
                      onDeleteDoctor={deleteDoctor}
                      onAddReceptionist={addReceptionist}
                      onUpdateReceptionist={updateReceptionist}
                      onDeleteReceptionist={deleteReceptionist}
                      onAddLabTechnician={addLabTechnician}
                      onUpdateLabTechnician={updateLabTechnician}
                      onDeleteLabTechnician={deleteLabTechnician}
                      currentClinic={currentClinic}
                      plans={plans}
                      reviews={reviews}
                    />
                  } />
                </>
              )}

              {/* Fallback */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </>
          </Routes>
          </ErrorBoundary>
        </div>
      </main>

      <BottomNav
        userRole={userRole}
        isSidebarOpen={isSidebarOpen}
        setIsSidebarOpen={setIsSidebarOpen}
        accessControl={accessControl}
      />

      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}
    </div>
  );
};

const App: React.FC = () => {
  return (
    <LanguageProvider>
      <AppContent />
    </LanguageProvider>
  );
};

export default App;
