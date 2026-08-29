
import React, { useState, useEffect, useMemo, useCallback } from 'react';

/* ─── MARSHRUT BO'YICHA BO'LISH (S5.5, T08) ─────────────────────────────────

   MUAMMO. 15 modulning hammasi bitta bundle'ga tushardi — ~2,1 MB. Audit
   buni to'g'ridan-to'g'ri o'lchamagan, lekin tavsiyada aytilgan:
   «registratorning eski kompyuterida birinchi ochilish sekin bo'ladi».

   Registrator kuniga faqat 3-4 modul ochadi (registratura, navbat,
   bemorlar, kassa) — qolgan 11 tasini yuklab o'tirishning ma'nosi yo'q.

   ATAYLAB LAZY EMAS:
     • `SignIn`  — birinchi ko'rinadigan ekran, kechiktirish ko'rinadi;
     • `QueueBoard` — kiosk rejimida alohida oynada ochiladi va u yerda
       yuklash indikatori xunuk;
     • `NotFound` — kichkina, ajratishning foydasi yo'q. */
const Dashboard = React.lazy(() => import('./pages/Dashboard').then(m => ({ default: m.Dashboard })));
const Patients = React.lazy(() => import('./pages/Patients').then(m => ({ default: m.Patients })));
const PatientDetails = React.lazy(() => import('./pages/PatientDetails').then(m => ({ default: m.PatientDetails })));
const Calendar = React.lazy(() => import('./pages/Calendar').then(m => ({ default: m.Calendar })));
const FinanceHub = React.lazy(() => import('./pages/FinanceHub').then(m => ({ default: m.FinanceHub })));
const Leads = React.lazy(() => import('./pages/Leads').then(m => ({ default: m.Leads })));
const Settings = React.lazy(() => import('./pages/Settings').then(m => ({ default: m.Settings })));
const DoctorsAnalytics = React.lazy(() => import('./pages/DoctorsAnalytics').then(m => ({ default: m.DoctorsAnalytics })));
const DoctorDetails = React.lazy(() => import('./pages/DoctorDetails').then(m => ({ default: m.DoctorDetails })));
const Inventory = React.lazy(() => import('./pages/Inventory').then(m => ({ default: m.Inventory })));
const LabOrders = React.lazy(() => import('./pages/LabOrders').then(m => ({ default: m.LabOrders })));
const Diagnostics = React.lazy(() => import('./pages/Diagnostics').then(m => ({ default: m.Diagnostics })));
const Reception = React.lazy(() => import('./pages/Reception').then(m => ({ default: m.Reception })));
const MyQueue = React.lazy(() => import('./pages/MyQueue').then(m => ({ default: m.MyQueue })));
const VisitWorkspace = React.lazy(() => import('./pages/VisitWorkspace').then(m => ({ default: m.VisitWorkspace })));
const Inpatient = React.lazy(() => import('./pages/Inpatient').then(m => ({ default: m.Inpatient })));
const MessagesManagement = React.lazy(() => import('./pages/MessagesManagement').then(m => ({ default: m.MessagesManagement })));
import { todayISO } from './utils/dateUtils';
import { Routes, Route, NavLink, useNavigate, useLocation, Navigate } from 'react-router-dom';
import {
  LayoutDashboard, Users, Calendar as CalendarIcon,
  DollarSign, Settings as SettingsIcon, Menu, X, Moon, Sun, LogOut,
  Activity, RefreshCw, AlertTriangle, Loader2, Package, Search, UserCheck, Plus, Edit, Trash2, ListOrdered, FlaskConical, MessageSquare, Wallet, Scan, BedDouble, UserPlus, Stethoscope, Sparkles} from 'lucide-react';
import { SignIn } from './pages/SignIn';
import { FirstRunSetup } from './pages/FirstRunSetup';
import { QueueBoard } from './pages/QueueBoard';
import { UserRole, Patient, Appointment, Transaction, Expense, Doctor, Receptionist, Clinic, Service, InventoryItem, ServiceCategory, Lead, LabTechnician, LabOrder, CashRegisterDay, CashMovement, Department, VisitCharge } from './types';
import { ToastContainer, ToastMessage } from './components/Common';
import { InstallPWAButton } from './components/InstallPWAButton';
import { BottomNav } from './components/BottomNav';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Flag } from './components/Flag';
import { LogoWordmark } from './components/Logo';
import { ForcePasswordChange } from './components/ForcePasswordChange';
import { useHotkeys } from './hooks/useHotkeys';
import { startLiveUpdates, stopLiveUpdates } from './hooks/useLiveUpdates';
import { API_URL, API_BASE_URL, getAuthToken } from './services/api';
import * as auth from './services/authStore';
import { connectToast, disconnectToast } from './services/toast';
import { ConfirmDialog } from './components/ConfirmDialog';
import { NotFound } from './pages/NotFound';
import { confirmAction } from './services/confirm';
import { api } from './services/api';
import type { CashCloseInput } from './services/api';
import { parseAccessControl, isModuleHidden, canSeeFinance, canSeePatientPhone } from './utils/accessControl';
import { LanguageProvider, useLanguage } from './context/LanguageContext';
import { Language } from './i18n/translations';

// Navigation config for Clinic Admin and Doctors
const CLINIC_NAVIGATION = [
  { id: 'dashboard', labelKey: 'nav.dashboard', icon: LayoutDashboard, roles: [UserRole.CLINIC_ADMIN, UserRole.DOCTOR, UserRole.RECEPTIONIST] },
  { id: 'reception', labelKey: 'nav.reception', icon: UserPlus, roles: [UserRole.CLINIC_ADMIN, UserRole.RECEPTIONIST] },
  /* Hamshira navbatni va bemor kartasini ko'radi: dori berish va harorat
     varag'i uchun kimga nima buyurilganini bilishi kerak. Ilgari u faqat
     `inpatient` ni ko'rardi va bemorni izlashning yo'li yo'q edi. */
  { id: 'myqueue', labelKey: 'nav.myqueue', icon: Stethoscope, roles: [UserRole.CLINIC_ADMIN, UserRole.DOCTOR, UserRole.RECEPTIONIST, UserRole.NURSE] },
  { id: 'leads', labelKey: 'nav.leads', icon: Users, roles: [UserRole.CLINIC_ADMIN, UserRole.RECEPTIONIST] },
  { id: 'patients', labelKey: 'nav.patients', icon: Users, roles: [UserRole.CLINIC_ADMIN, UserRole.DOCTOR, UserRole.RECEPTIONIST, UserRole.NURSE] },
  { id: 'calendar', labelKey: 'nav.calendar', icon: CalendarIcon, roles: [UserRole.CLINIC_ADMIN, UserRole.DOCTOR, UserRole.RECEPTIONIST] },
  /* Moliya registratorda qoladi — u kassada ishlaydi. Hisobot va Ulush
     tablari FinanceHub ichida allaqachon egaga cheklangan. */
  { id: 'finance', labelKey: 'nav.finance', icon: Wallet, roles: [UserRole.CLINIC_ADMIN, UserRole.RECEPTIONIST] },
  /* Shifokorlar analitikasi har shifokorning hisoblangan ULUSHINI va
     tushumini ko'rsatadi (`DoctorsAnalytics` → `calculateDoctorShare`).
     Bu oylik ma'lumoti — registrator uni ko'rmasligi kerak. Sahifaning
     o'zida rol tekshiruvi yo'q edi, shuning uchun cheklov shu yerda va
     marshrut qo'riqchisida qo'yiladi. */
  { id: 'doctors', labelKey: 'nav.doctors', icon: Activity, roles: [UserRole.CLINIC_ADMIN] },
  { id: 'inventory', labelKey: 'inventory.title', icon: Package, roles: [UserRole.CLINIC_ADMIN, UserRole.RECEPTIONIST] },
  { id: 'board', labelKey: 'nav.board', icon: ListOrdered, roles: [UserRole.CLINIC_ADMIN, UserRole.RECEPTIONIST] },
  { id: 'lab', labelKey: 'nav.lab', icon: FlaskConical, roles: [UserRole.CLINIC_ADMIN, UserRole.DOCTOR, UserRole.RECEPTIONIST, UserRole.LAB_TECHNICIAN] },
  { id: 'diagnostics', labelKey: 'nav.diagnostics', icon: Scan, roles: [UserRole.CLINIC_ADMIN, UserRole.DOCTOR, UserRole.RECEPTIONIST] },
  // Hamshiraning yagona ish o'rni — statsionar (dori varag'i, harorat varag'i)
  { id: 'inpatient', labelKey: 'nav.inpatient', icon: BedDouble, roles: [UserRole.CLINIC_ADMIN, UserRole.DOCTOR, UserRole.RECEPTIONIST, UserRole.NURSE] },
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
  /* Standart parol bilan kirilgan. Server bu holatda CHEKLANGAN token beradi
     (faqat parol almashtirishga yaraydi), interfeys esa boshqa hech narsani
     ko'rsatmaydi. Ikkalasi ham kerak: faqat interfeys to'sig'i `curl` ni
     to'xtatmaydi, faqat server to'sig'i esa foydalanuvchini chalkashtiradi. */
  const [mustChangePassword, setMustChangePassword] = useState(false);

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


  // Check for stored session on mount
  useEffect(() => {
    /* Eski sessiyani diskdan xotiraga ko'chirish (S1.3): bu o'zgarishgacha
       token `localStorage` da yotgan. Bir marta ko'chiriladi va diskdan
       o'chiriladi — xodimlar bir kunda tizimdan chiqib qolmasin. */
    auth.migrateLegacyStorage();

    const storedAuth = auth.getSession();
    if (storedAuth) {
      try {
        const { role, name, clinicId: storedClinicId, doctorId: storedDoctorId, receptionistId: storedReceptionistId, technicianId: storedTechnicianId } = storedAuth;
        if (role && name) {
          /* `role` sessiyadan SATR bo'lib keladi (JSON da enum yo'q).
             Ilgari u to'g'ridan-to'g'ri uzatilardi va typecheck buni
             ko'rmasdi. Endi aniq aytamiz: bu qiymat `UserRole` deb
             qabul qilinadi. */
          setUserRole(role as UserRole);
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
        auth.setSession(null);
      }
      setAuthChecked(true);
    } else {
      /* `sessionStorage` bo'sh — yangi tab yoki brauzer qaytadan ochilgan.
         Lekin `httpOnly` cookie 30 kun yashaydi, ya'ni sessiya hali tirik
         bo'lishi mumkin. Bir marta so'raymiz: cookie bo'lsa foydalanuvchi
         parolsiz davom etadi, bo'lmasa kirish sahifasi ochiladi. */
      auth.refresh(API_URL)
        .then((restored) => {
          if (restored?.role && restored.name) {
            setUserRole(restored.role as UserRole);
            setUserName(restored.name);
            if (restored.clinicId) setClinicId(restored.clinicId);
            if (restored.doctorId) setDoctorId(restored.doctorId);
            if (restored.receptionistId) setReceptionistId(restored.receptionistId);
            if (restored.technicianId) setTechnicianId(restored.technicianId);
            setIsAuthenticated(true);
            if (restored.clinicId) {
              api.clinics.getById(restored.clinicId).then(setCurrentClinic).catch(console.error);
            }
          }
        })
        .finally(() => setAuthChecked(true));
    }

    const handleAuthError = () => handleLogout();
    window.addEventListener('auth:unauthorized', handleAuthError);
    return () => window.removeEventListener('auth:unauthorized', handleAuthError);
  }, []);

  /* Kirishda yuklanadigan oyna. Katta qilib qo'yish xavfsiz ko'rinadi, lekin
   aynan shu 41 MB ga olib kelgan edi — o'lcham har oy o'sadi. */
const INITIAL_DAYS = 45;
const INITIAL_PATIENTS = 500;

/** `n` kun oldingi sana, YYYY-MM-DD */
const sinceDate = (n: number) =>
  new Date(Date.now() - n * 86400000).toISOString().split('T')[0];

  // Load Data
  useEffect(() => {
    /* `mustChangePassword` ham tekshiriladi. Bu effekt RENDER dan mustaqil
       ishlaydi: faqat ekranni yashirish yetarli emas edi — yuklash zanjiri
       baribir ishga tushib, cheklangan token bilan 403 lar yog'ilardi. */
    if (!isAuthenticated || mustChangePassword) return;

    const loadData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const isDemo = auth.getSession()?.isDemo === true;

        if (isDemo && clinicId === 'demo-clinic-1') {
          const { DEMO_PATIENTS, DEMO_APPOINTMENTS, DEMO_TRANSACTIONS, DEMO_EXPENSES, DEMO_SERVICES, DEMO_DOCTORS, DEMO_CLINIC, DEMO_CATEGORIES, DEMO_LAB_TECHNICIANS, DEMO_LAB_ORDERS, DEMO_RECEPTIONISTS, DEMO_LEADS, DEMO_INVENTORY } = await import('./services/demoData');
          setCurrentClinic(DEMO_CLINIC);
          setPatients(DEMO_PATIENTS);
          setAppointments(DEMO_APPOINTMENTS);
          setTransactions(DEMO_TRANSACTIONS);
          setExpenses(DEMO_EXPENSES);
          setServices(DEMO_SERVICES);
          setCategories(DEMO_CATEGORIES);
          setDoctors(DEMO_DOCTORS);
          setInventoryItems(DEMO_INVENTORY || []);
          setLabTechnicians(DEMO_LAB_TECHNICIANS || []);
          setLabOrders(DEMO_LAB_ORDERS || []);
          setReceptionists(DEMO_RECEPTIONISTS || []);
          setLeads(DEMO_LEADS || []);
        } else if (clinicId) {
          const [pts, appts, txs, exps, svcs, docs, recs, invItems, cats, revs, leadsData, clinicData, labTechs, labOrds, closures, movements, depts, chrgs] = await Promise.all([
            // Butun klinika bo'yicha: shifokor boshqa bo'lim ko'rgan bemorning
            // kartasini ocha olishi kerak (ko'p profilli klinikaning asosi).
            /* ─── KIRISHDA CHEKLANGAN OYNA (FIX-PLAN 10.3) ───────────────
               Ilgari bu uch chaqiruv BUTUN jadvalni tortardi. O'lchov
               (`backend/tests/bench/scale.ts`, 3 yillik ma'lumot): 110 510
               qator, 41 MB. Localhost'da 1.3 s, LAN orqali 7-16 soniya — va
               bu har kirishda va har yangilashda takrorlanardi.

               Endi kirishda faqat KERAKLI oyna olinadi:
                 - bemorlar: oxirgi 500 ta (qidiruv allaqachon serverda, 8.1);
                 - tranzaksiya va qabullar: oxirgi 90 kun.

               Uzoqroq davr kerak bo'lgan ekranlar (Kassa, Kalendar, Hisobot)
               o'z oralig'ini o'zi so'raydi. Bosh sahifadagi UMUMIY raqamlar
               esa serverdan keladi (`api.reports.dashboard`) — aks holda
               qisqargan ro'yxatdan sanalgan son yolg'on bo'lardi. */
            api.patients.getAllForClinic(clinicId, INITIAL_PATIENTS),
            api.appointments.getAll(clinicId, { from: sinceDate(INITIAL_DAYS) }),
            api.transactions.getAll(clinicId, { from: sinceDate(INITIAL_DAYS) }),
            api.expenses.getAll(clinicId),
            api.services.getAll(clinicId),
            api.doctors.getAll(clinicId),
            api.receptionists.getAll(clinicId),
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
  }, [isAuthenticated, clinicId, userRole, mustChangePassword]);

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
  const handleLogin = (role: UserRole, name: string, clinicIdParam?: string, doctorIdParam?: string, receptionistIdParam?: string, mustChange?: boolean) => {
    setUserRole(role);
    setUserName(name);
    if (clinicIdParam) setClinicId(clinicIdParam);
    if (doctorIdParam) setDoctorId(doctorIdParam);
    if (receptionistIdParam) setReceptionistId(receptionistIdParam);
    setIsAuthenticated(true);

    /* Standart parol — boshqa hech qayerga o'tkazmaymiz. Marshrutlash va
       "Xush kelibsiz" ham keraksiz: foydalanuvchi bitta ekranni ko'radi. */
    if (mustChange) {
      setMustChangePassword(true);
      return;
    }

    // Navigate based on role
    // Har kim o'z ish o'rniga tushadi — hamma Dashboard'ga emas
    if (role === UserRole.RECEPTIONIST) {
      navigate('/reception');
    } else if (role === UserRole.DOCTOR) {
      navigate('/myqueue');
    } else if (role === UserRole.LAB_TECHNICIAN) {
      navigate('/lab');
    } else if (role === UserRole.NURSE) {
      navigate('/inpatient');
    } else {
      navigate('/');
    }
    addToast('success', `Xush kelibsiz, ${name}!`);
  };

  const handleLogout = () => {
    setMustChangePassword(false);
    /* `httpOnly` cookie'ni JavaScript o'chira olmaydi — server o'chiradi.
       Faqat lokal tozalash yetarli emas edi: cookie qolib, keyingi
       ochilishda sessiya o'z-o'zidan tiklanib ketardi. */
    void auth.clearSession(API_URL);
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
    if (!auth.getSession()) {
      handleLogout();
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      if (clinicId) {
        const [pts, appts, txs, exps, svcs, docs, recs, invItems, cats, revs, leadsData] = await Promise.all([
          api.patients.getAllForClinic(clinicId),
          api.appointments.getAll(clinicId),
          api.transactions.getAll(clinicId),
          api.expenses.getAll(clinicId),
          api.services.getAll(clinicId),
          api.doctors.getAll(clinicId),
          api.receptionists.getAll(clinicId),
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
  const addToast = useCallback((type: 'success' | 'error' | 'info', message: string) => {
    const id = Math.random().toString(36).substr(2, 9);
    setToasts(prev => [...prev, { id, type, message }]);
  }, []);

  /* Toast'ni butun ilovaga OCHIB QO'YAMIZ (S3.3).

     Ilgari u faqat prop orqali uzatilardi va chuqurdagi fayllarga yetib
     bormasdi — shuning uchun ular `alert()` ishlatardi (88 ta joy).
     `services/toast.ts` modul darajasidagi bitta nuqta: `catch` bloki ham,
     `api.ts` ham, hodisa ishlovchisi ham undan foydalana oladi. */
  useEffect(() => {
    connectToast(addToast);
    return () => disconnectToast();
  }, [addToast]);

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  // Patient Actions
  const addPatient = async (patient: Omit<Patient, 'id' | 'clinicId'>) => {
    try {
      /* Takror tekshiruvi SERVERGA ko'chdi.

         Bu yerda ilgari faqat ism va familiya bo'yicha tekshiruv bor edi va u
         yaratishni BUTUNLAY BLOKLARDI. Uch kamchiligi bor edi:
           - bir xil ismli ikki bemor bo'lishi mumkin, lekin ikkinchisini
             kiritishning iloji yo'q edi;
           - tug'ilgan sana va telefonni hisobga olmasdi, ya'ni haqiqiy
             takrorlarning ko'pini o'tkazib yuborardi;
           - brauzerdagi ro'yxatga tayanardi — unda yo'q bemor "yo'q" edi.

         Endi server tekshiradi (telefon normallashtirilgan holda va
         ism+familiya+tug'ilgan sana bo'yicha), 409 va topilganlar ro'yxatini
         qaytaradi, interfeys esa TANLOV beradi: mavjud kartani ochish yoki
         `force` bilan baribir yaratish. */

      let activeClinicId = clinicId;
      if (!activeClinicId) {
        const parsed = auth.getSession();
        if (parsed?.clinicId) activeClinicId = parsed.clinicId;
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
      /* Takror haqidagi 409 — xato emas, savol. Uni modal o'zi ro'yxat bilan
         ko'rsatadi, shuning uchun bu yerda toast chiqarmaymiz. */
      if (e?.data?.code !== 'DUPLICATE_PATIENT') {
        addToast('error', e.message || 'Xatolik yuz berdi');
      }
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
  const addAppointment = async (appt: Omit<Appointment, 'id' | 'clinicId'>) => {
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
  const addTransaction = async (tx: Omit<Transaction, 'id' | 'clinicId'>) => {
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
    const create = async (force: boolean) => {
      const newLead = await api.leads.create({ ...lead, clinicId, ...(force ? { force: true } : {}) } as any);
      setLeads(prev => [newLead, ...prev]);
      addToast('success', 'Yangi lid qo\'shildi.');
    };

    try {
      await create(false);
    } catch (e: any) {
      /* TAKROR LID (409, S3.4). Bloklamaydi, TANLOV beradi: reklama bir
         odamni ikki marta yuborishi mumkin, lekin operator buni bilishi
         kerak — aks holda bitta odamga ikki marta qo'ng'iroq qilinadi. */
      if (e?.data?.code === 'DUPLICATE_LEAD') {
        const m = (e.data.matches || [])[0];
        const okToAdd = await confirmAction({
          title: 'Bu raqam bilan lid allaqachon bor',
          body: m ? `${m.name} — ${m.phone}. Baribir yangisini yaratasizmi?` : undefined,
          confirmLabel: 'Baribir yaratish',
        });
        if (okToAdd) {
          try { await create(true); } catch (e2: any) { addToast('error', e2.message || 'Xatolik yuz berdi'); }
        }
        return;
      }
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

  /* LIDNI O'CHIRISH — QAYTARISH IMKONI BILAN (S3.6, audit B-05).

     «Lid bitta tugma bosilishi bilan yo'qoladi» degan e'tiroz ikki
     qismdan iborat edi: tasdiq yo'qligi (endi `confirmAction`,
     `Leads.tsx` da) va qaytarib bo'lmasligi.

     NIMA UCHUN AYNAN LID. Qaytarish bu yerda XAVFSIZ: lidga hech narsa
     bog'lanmagan, ya'ni uni qayta yaratish hech qanday havolani buzmaydi.
     Bemor yoki to'lov bilan bunday qilib bo'lmaydi — yangi `id` eski
     havolalarni yetim qoldiradi. Ular uchun javobgarlik boshqa yo'ldan:
     har o'chirish kirish jurnaliga tushadi (S1.4).

     `id` o'zgaradi — bu ataylab: tiklash emas, QAYTA YARATISH. */
  const deleteLead = async (id: string) => {
    const removed = leads.find(l => l.id === id);
    try {
      await api.leads.delete(id);
      setLeads(prev => prev.filter(l => l.id !== id));

      if (removed) {
        const { id: _oldId, createdAt: _c, updatedAt: _u, ...payload } = removed as any;
        const toastId = Math.random().toString(36).substr(2, 9);
        setToasts(prev => [...prev, {
          id: toastId,
          type: 'info',
          message: `Lid o'chirildi: ${removed.name || ''}`.trim(),
          action: { label: 'Bekor qilish', run: () => { void addLead(payload); } },
        }]);
      } else {
        addToast('info', 'Lid o\'chirildi.');
      }
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

  const addDoctor = async (doctor: Omit<Doctor, 'id' | 'clinicId'>) => {
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

  /* `updateInventoryStock` OLIB TASHLANDI (0028).
     U `PUT /api/inventory/:id/stock` ni chaqirardi — qoldiqni qayta yozib,
     eski jurnalga tushardi va partiyalarga tegmasdi. Chaqiruvchisi yo'q edi;
     endpointning o'zi ham yopildi (410). Ombor endi faqat `api.stock.*`. */

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

  /* ⚠️ QUYIDAGI HOOKLAR HAR RENDERDA CHAQIRILISHI SHART.

     Ular ilgari pastroqda — `if (!isAuthenticated) return ...` va boshqa erta
     `return` lardan KEYIN turgan edi. Natijada login ekranida uchta hook
     ishlamas, kirgandan keyin esa ishlar edi va React "Rendered more hooks
     than during the previous render" bilan yiqilardi: kirgandan keyin BO'SH
     OQ EKRAN.

     Typecheck ham, 170 ta backend sinovi ham buni ko'rmadi — xato faqat
     brauzerda ko'rinadi. Shuning uchun hook chaqiruvlari erta `return`
     lardan YUQORIDA turishi kerak. */
  /* NAV PANELINING SURILISHI (S5.1, audit B-03).

     `navOverflow` — qaysi tomonga surish mumkinligini aytadi; gradient
     faqat o'sha tomonda chiziladi. Ikkalasi ham `false` bo'lsa hech
     narsa ko'rinmaydi — panel to'liq sig'gan.

     ⚠️ Bu hooklar erta `return` lardan OLDIN turishi shart (yuqoridagi
     ogohlantirishga qarang). */
  const navRef = React.useRef<HTMLDivElement | null>(null);
  const [navOverflow, setNavOverflow] = useState({ left: false, right: false });

  const updateNavOverflow = React.useCallback(() => {
    const el = navRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setNavOverflow({
      left: el.scrollLeft > 4,
      // 4px — yaxlitlash xatosi uchun zaxira: `scrollWidth` kasr bo'lishi mumkin
      right: el.scrollLeft < max - 4,
    });
  }, []);

  useEffect(() => {
    updateNavOverflow();
    window.addEventListener('resize', updateNavOverflow);
    return () => window.removeEventListener('resize', updateNavOverflow);
  }, [updateNavOverflow, visibleNavigation.length]);

  /* Faol modulni ko'rinishga surish. `#/settings` da panel `scrollLeft = 0`
     bo'lib qolardi va faol tugma ekrandan tashqarida turardi (audit B-03).

     `scrollIntoView` ATAYLAB ishlatilmadi: birinchi renderda panel hali
     o'lchamga ega emas (`clientWidth = 0`) va u hech narsa qilmaydi —
     brauzer E2E sinovi aynan shuni ko'rsatdi («viewport ratio 0»).

     `requestAnimationFrame` layoutdan KEYIN ishlaydi, `scrollLeft` esa
     qo'lda hisoblanadi: faol element markazga tushadi. Ikkinchi kadr —
     shrift yuklangandan keyin kenglik biroz o'zgarishi mumkin. */
  useEffect(() => {
    let raf = 0, timer = 0;
    const deadline = Date.now() + 3000;

    /* `true` qaytarsa — surish HAQIQATAN bajarildi. */
    const center = (): boolean => {
      const el = navRef.current;
      if (!el || el.clientWidth === 0) return false;
      const active = el.querySelector('[aria-current="page"]') as HTMLElement | null;
      if (!active || active.offsetWidth === 0) return false;
      const target = active.offsetLeft - (el.clientWidth - active.offsetWidth) / 2;
      el.scrollLeft = Math.max(0, Math.min(target, el.scrollWidth - el.clientWidth));
      updateNavOverflow();
      return true;
    };

    /* MUVAFFAQIYATGACHA TAKRORLASH.

       Ilgari uchta urinish bor edi: ikkita `requestAnimationFrame` va
       250ms lik zaxira. Ular panel hali render bo'lmaganda ham «ishlab»
       ketardi — `clientWidth = 0` bo'lgani uchun funksiya jimgina
       qaytardi, uchala urinish sarflanardi va boshqa hech qachon
       takrorlanmasdi. Faol tugma ekrandan tashqarida qolib ketardi.

       Bu tasodifiy edi: E2E sinovi to'plam bilan birga yurganda
       (sekinroq) yiqilardi, yolg'iz yurganda o'tardi — ya'ni xato
       sinovda emas, shu yerda edi.

       Endi 3 soniya davomida har kadrda urinib ko'riladi va birinchi
       muvaffaqiyatda to'xtaydi. */
    const tick = () => {
      if (center() || Date.now() > deadline) return;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    /* Shrift kech yuklansa element kengligi o'zgaradi va markaz suriladi
       — o'lcham o'zgarishini kuzatib qayta markazlashtiramiz. */
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && navRef.current) {
      ro = new ResizeObserver(() => {
        clearTimeout(timer);
        timer = window.setTimeout(center, 60);
      });
      ro.observe(navRef.current);
    }

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
      ro?.disconnect();
    };
  }, [location.pathname, updateNavOverflow, visibleNavigation.length]);

  /* SAHIFA SARLAVHASI (S5.7, audit B-36).

     Audit: «Barcha route'da `document.title` — XClinic. Bir nechta tab
     ochilganda qaysi biri qayer ekanini bilib bo'lmaydi, brauzer tarixi
     ham foydasiz».

     `react-helmet-async` qo'shilmadi: bitta qatorlik ish uchun yangi
     bog'liqlik ortiqcha. Klinika nomi ham qo'shiladi — bir necha
     klinikaning oynasi ochiq bo'lishi mumkin.

     ⚠️ Bu hook YUQORIDAGI ogohlantirish ostida: erta `return` lardan
     OLDIN turishi shart. */
  useEffect(() => {
    const label = t(getPageLabelKey(location.pathname));
    document.title = [label, currentClinic?.name || 'XClinic'].filter(Boolean).join(' · ');
  }, [location.pathname, currentClinic?.name, t]);

  /* SAHIFA ALMASHGANDA SKROLL TEPAGA (audit B-37).

     «Shifokorlar sahifasini pastga skroll qiling → Ombor ga o'ting» —
     Ombor ro'yxatning o'rtasidan ochilardi. Brauzer o'zi qaytarmaydi:
     SPA da sahifa qayta yuklanmaydi, ya'ni skroll holati saqlanadi. */
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [location.pathname]);

  /* ─── Tezkor tugmalar (FIX-PLAN 8.2) ──────────────────────────────────────
     Registrator kuniga 100 bemor kiritadi. Har kiritishda 10 soniya yutilsa —
     kuniga 17 daqiqa, oyiga 6 soat.

     Marshrutga o'tish shu yerda, chunki `navigate` faqat shu daraja uchun
     mavjud. Sahifa ichidagi ish (fokus, modal ochish) esa sahifaning o'zida
     bo'ladi — u yerda `Escape` va `Ctrl+S` ishlatiladi. */
  const hotkeys = React.useMemo(() => ({
    F2: () => navigate('/reception'),
    F3: () => navigate('/patients'),
    F4: () => { if (showFinanceForRole) navigate('/finance'); },
  }), [navigate, showFinanceForRole]);
  useHotkeys(hotkeys, isAuthenticated && !mustChangePassword);

  /* Hodisalar oqimi — kirgandan keyin ochiladi, chiqishda yopiladi.
     Cheklangan token (standart parol) bilan ochmaymiz: server uni baribir
     rad etadi va bekorga qayta ulanish sikli boshlanardi. */
  React.useEffect(() => {
    if (isAuthenticated && !mustChangePassword) {
      startLiveUpdates();
      return () => stopLiveUpdates();
    }
    stopLiveUpdates();
  }, [isAuthenticated, mustChangePassword]);


  /* ── BIRINCHI ISHGA TUSHIRISH ─────────────────────────────────────
     Yangi o'rnatmada baza bo'sh: klinika ham, admin ham yo'q. Bunday
     holatda kirish sahifasini ko'rsatish ma'nosiz — kiradigan login
     mavjud emas. Server holatni `/api/license/status` orqali aytadi:

       clinicExists: false  -> to'liq sozlash (klinika + admin + kalit)
       activated: false     -> klinika bor, lekin kalit yo'q/eskirgan
                               (masalan baza boshqa kompyuterga ko'chgan)

     So'rov FAQAT tizimga kirilmagan holatda yuboriladi va javob
     kelmasa ekran avvalgidek kirish sahifasi bo'lib qolaveradi —
     tekshiruv ishlamay qolsa ham dasturga kirish yo'li yopilmasin. */
  const [licenseState, setLicenseState] = useState<
    { activated: boolean; clinicExists: boolean; machineId: string; enforced?: boolean } | null
  >(null);

  useEffect(() => {
    if (isAuthenticated) return;
    let alive = true;
    fetch(`${API_BASE_URL}/api/license/status`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (alive && d) setLicenseState(d); })
      .catch(() => { /* eski server — sozlash ekrani ko'rsatilmaydi */ });
    return () => { alive = false; };
  }, [isAuthenticated]);

  // --- Main Render ---
  if (!isAuthenticated) {
    if (!authChecked) return null;

    /* Navbat tablosi televizorda ochiq qoladi — u sozlashga bog'liq
       emas va klinika uni login qilmasdan ishlatadi. */
    const onBoard = location.pathname.startsWith('/board/');

    /* `enforced` — server tekshiruvni haqiqatan yoqganini bildiradi.
       Usiz bu shart ishlab turgan o'rnatmalarni kirish sahifasidan
       ajratib qo'yardi: ularda `licenseKey` yo'q, ya'ni
       `activated: false`, lekin tekshiruv ham o'chiq. */
    const needsSetup = !!licenseState?.enforced
        && (!licenseState.clinicExists || !licenseState.activated);

    if (needsSetup && !onBoard && licenseState) {
      return (
        <FirstRunSetup
          machineId={licenseState.machineId}
          activateOnly={licenseState.clinicExists}
          onDone={() => setLicenseState({ ...licenseState, activated: true, clinicExists: true })}
        />
      );
    }

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

  /* ─── Majburiy parol almashtirish ────────────────────────────────────────
     Standart `admin` / `admin` bilan kirilgan. Bu ekrandan chetga yo'l yo'q:
     serverdagi token ham cheklangan, ya'ni interfeysni chetlab o'tish
     (localStorage ni tahrirlash, curl) ham foyda bermaydi. */
  if (mustChangePassword) {
    return <ForcePasswordChange onDone={() => setMustChangePassword(false)} onLogout={handleLogout} addToast={addToast} />;
  }

  const pageLabel = t(getPageLabelKey(location.pathname));

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 font-sans transition-colors duration-200">
      <ToastContainer toasts={toasts} removeToast={removeToast} />
      {/* Tasdiqlash oynasi — ilovada BIR MARTA. Qolgan joylar uni
          `confirmAction()` orqali chaqiradi (S3.6). */}
      <ConfirmDialog />
      <InstallPWAButton />

      {/* Mobile Header (Hidden on Desktop) */}
      <div className="lg:hidden flex items-center justify-between p-4 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-30">
        <LogoWordmark size="sm" />
        <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 text-gray-600 dark:text-gray-300">
          {isSidebarOpen ? <X /> : <Menu />}
        </button>
      </div>

      {/* Mobile Sidebar Drawer (Hidden on Desktop) */}
      <aside className={`lg:hidden fixed inset-y-0 left-0 z-50 w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 transform transition-transform duration-300 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex flex-col h-full pb-16">
          <div className="h-16 flex items-center px-6 border-b border-gray-200 dark:border-gray-700">
            <LogoWordmark size="sm" />
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
                  <p className="text-xs text-gray-500 capitalize">{userRole === UserRole.CLINIC_ADMIN ? 'Administrator' : userRole === UserRole.RECEPTIONIST ? 'Resepshn' : userRole === UserRole.LAB_TECHNICIAN ? 'Laborant' : userRole === UserRole.NURSE ? 'Hamshira' : 'Shifokor'}</p>
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
                  <Flag code={lang} />
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
              <LogoWordmark />

              {clinicId === 'demo-clinic-1' && (
                <span className="px-2 py-1 text-xs font-bold bg-primary-100 dark:bg-primary-900/40 text-primary dark:text-primary-400 rounded-full border border-primary-200 dark:border-primary-800">
                  🧪 DEMO MODE
                </span>
              )}

              {/* Search and Branch Control */}
              {/* Qidiruv — keng va yumaloq. Ilgari u qo'shimcha ramkali quti
                  ichida, tor (w-72) va to'rtburchak edi; qidiruv esa bu
                  dasturdagi eng ko'p ishlatiladigan maydon. */}
              <div className="flex items-center gap-3 ml-2 flex-1 max-w-xl">
                <div className="relative group w-full">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-primary-500 transition-colors" />
                  <input
                    type="text"
                    placeholder={t('header.search')}
                    value={searchBarTerm}
                    onChange={(e) => setSearchBarTerm(e.target.value)}
                    onFocus={() => setIsSearchFocused(true)}
                    className="pl-11 pr-4 py-2.5 w-full bg-gray-100 dark:bg-white/[0.07] border border-gray-200 dark:border-white/10 focus:border-primary-500/40 rounded-full text-sm focus:ring-2 focus:ring-primary-500/15 placeholder-gray-400 transition-all outline-none"
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
              {/* AI yordamchi — ilgari faqat bosh panel ichidagi tab edi, ya'ni
                  uni bilmagan odam umuman topmasdi. Endi har bir sahifadan
                  bitta bosishda ochiladi. Hamshira moliyaviy panelni ko'rmaydi,
                  shuning uchun unga tugma ham chiqmaydi. */}
              {userRole !== UserRole.NURSE && (
                <button
                  onClick={() => navigate('/?tab=ai')}
                  className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold text-white
                             bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500
                             shadow-sm hover:shadow-md transition-all shrink-0"
                  title={t('ai.tab')}
                >
                  <Sparkles className="w-4 h-4" />
                  <span className="hidden xl:inline">{t('ai.tab')}</span>
                </button>
              )}
              <span className="hidden 2xl:inline text-sm font-medium text-gray-500 dark:text-gray-400">
                {formatHeaderDate(new Date(), language)}
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
                    <Flag code={lang} />
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
                    {userRole === UserRole.CLINIC_ADMIN ? t('roles.admin') : userRole === UserRole.RECEPTIONIST ? t('roles.receptionist') : userRole === UserRole.LAB_TECHNICIAN ? 'Laborant' : userRole === UserRole.NURSE ? 'Hamshira' : t('roles.doctor')}
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
            {/* NAV PANELI (S5.1, audit B-03).

                Audit: «Panel kengligi 1990px, ekranda 1193px ko'rinadi —
                15 modulning 6 tasi tashqarida. Scrollbar `no-scrollbar`
                bilan yashirilgan, chekkada gradient yoki o'q ham yo'q,
                ya'ni davomi borligini bildiradigan hech narsa yo'q».

                Ikkita narsa qo'shildi:
                  • chekkalarda gradient — faqat surish MUMKIN bo'lgan
                    tomonda ko'rinadi, ya'ni u ma'lumot beradi, bezak emas;
                  • route o'zgarganda faol element ko'rinishga suriladi —
                    `#/settings` da panel `scrollLeft = 0` bo'lib qolardi
                    va «Sozlamalar» umuman ko'rinmasdi. */}
            <div className="relative">
              {navOverflow.left && (
                <div aria-hidden="true"
                  className="pointer-events-none absolute left-0 top-0 bottom-0 w-8 z-10
                             bg-gradient-to-r from-gray-50 dark:from-gray-800 to-transparent" />
              )}
              {navOverflow.right && (
                <div aria-hidden="true"
                  className="pointer-events-none absolute right-0 top-0 bottom-0 w-8 z-10
                             bg-gradient-to-l from-gray-50 dark:from-gray-800 to-transparent" />
              )}
            <div ref={navRef} onScroll={updateNavOverflow}
                 className="h-12 flex items-center gap-2 overflow-x-auto no-scrollbar">
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
        </div>
      </header>

      <main className="flex-1 lg:pt-28 min-h-screen flex flex-col items-center">
        <div className="w-full px-4 sm:px-6 lg:px-10 xl:px-14 py-4 sm:py-6 lg:py-8 flex-1 overflow-x-hidden pb-24 lg:pb-8">
          <ErrorBoundary key={location.pathname} section={t(getPageLabelKey(location.pathname))}>
          {/* `Suspense` — `React.lazy` bilan bo'lingan sahifalar uchun (S5.5).
              Yuklash indikatori ERROR BOUNDARY ICHIDA: chunk yuklanmasa
              (tarmoq uzildi, eski kesh) xato ushlansin va oq ekran
              bo'lmasin. */}
          <React.Suspense fallback={
            <div className="flex items-center justify-center py-24" role="status" aria-live="polite">
              <div className="w-8 h-8 rounded-full border-2 border-gray-300 dark:border-gray-600 border-t-primary-600 animate-spin" />
              <span className="sr-only">Yuklanmoqda…</span>
            </div>
          }>
          <Routes>

            <>
              <Route path="/" element={
                /* Hamshira bosh panelni ko'rmaydi — unda butun klinikaning
                   moliyasi turadi. Fallback ham shu manzilga tushadi, shuning
                   uchun qayta yo'naltirish aynan marshrutning o'zida. */
                userRole === UserRole.NURSE ? <Navigate to="/inpatient" replace /> : (
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
                )
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
                  currentClinic={currentClinic}
                  token={getAuthToken() ?? undefined}
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
                  currentClinic={currentClinic}
                  userRole={userRole}
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
                  currentClinic={currentClinic}
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
                  {/* Shifokor ulushi va tushumi — faqat klinika egasiga.
                      Menyudan olib tashlash yetarli emas: `#/doctors` ni
                      qo'lda yozib kirish mumkin edi. */}
                  {userRole === UserRole.CLINIC_ADMIN && <>
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
                      doctors={doctors}
                      appointments={appointments}
                      transactions={transactions}
                      patients={patients}
                      services={services}
                      onBack={() => navigate('/doctors')}
                      onPatientClick={handlePatientClick}
                    />
                  } />
                  </>}

                  <Route path="/inventory" element={
                    <Inventory
                      items={inventoryItems}
                      userName={userName}
                      userRole={userRole}
                      departments={departments}
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
                          reviews={reviews}
                    />
                  } />
                </>
              )}

              {/* 404 — jimgina bosh sahifaga tashlamaydi (S5.7, audit B-37).
                  Ilgari `<Navigate to="/">` turardi va noto'g'ri manzil
                  sababsiz Dashboard'ga olib borardi. */}
              <Route path="*" element={<NotFound userRole={userRole} />} />
            </>
          </Routes>
          </React.Suspense>
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


/* Sarlavhadagi sana.

   `toLocaleDateString('uz-UZ', …)` ISHLATILMAYDI: Chrome'da o'zbek locali
   uchun oy nomi yo'q va u "2026 M08 28, Fri" deb chiqadi — ya'ni oy nomi
   o'rniga texnik "M08" va inglizcha hafta kuni. Nomlar shuning uchun qo'lda. */
const UZ_MONTHS = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun',
    'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'];
const UZ_DAYS = ['yakshanba', 'dushanba', 'seshanba', 'chorshanba', 'payshanba', 'juma', 'shanba'];

function formatHeaderDate(d: Date, lang: 'uz' | 'ru'): string {
    if (lang === 'ru') {
        return d.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'long' });
    }
    return `${d.getDate()} ${UZ_MONTHS[d.getMonth()]}, ${UZ_DAYS[d.getDay()]}`;
}

const App: React.FC = () => {
  return (
    <LanguageProvider>
      <AppContent />
    </LanguageProvider>
  );
};

export default App;
