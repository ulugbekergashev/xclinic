
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { IS_DEMO_BUILD } from './services/demoBuild';

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

const Patients = React.lazy(() => import('./pages/Patients').then(m => ({ default: m.Patients })));
const PatientDetails = React.lazy(() => import('./pages/PatientDetails').then(m => ({ default: m.PatientDetails })));
const Calendar = React.lazy(() => import('./pages/Calendar').then(m => ({ default: m.Calendar })));
const FinanceHub = React.lazy(() => import('./pages/FinanceHub').then(m => ({ default: m.FinanceHub })));
const Settings = React.lazy(() => import('./pages/Settings').then(m => ({ default: m.Settings })));
const Inventory = React.lazy(() => import('./pages/Inventory').then(m => ({ default: m.Inventory })));
const LabOrders = React.lazy(() => import('./pages/LabOrders').then(m => ({ default: m.LabOrders })));
const Diagnostics = React.lazy(() => import('./pages/Diagnostics').then(m => ({ default: m.Diagnostics })));
const Today = React.lazy(() => import('./pages/Today').then(m => ({ default: m.Today })));
const VisitWorkspace = React.lazy(() => import('./pages/VisitWorkspace').then(m => ({ default: m.VisitWorkspace })));
const Inpatient = React.lazy(() => import('./pages/Inpatient').then(m => ({ default: m.Inpatient })));
const MessagesManagement = React.lazy(() => import('./pages/MessagesManagement').then(m => ({ default: m.MessagesManagement })));
const Staff = React.lazy(() => import('./pages/Staff').then(m => ({ default: m.Staff })));
const StaffCard = React.lazy(() => import('./pages/StaffCard').then(m => ({ default: m.StaffCard })));
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
import { AiOverlay } from './components/AiOverlay';
import { ToastContainer, ToastMessage } from './components/Common';
import { InstallPWAButton } from './components/InstallPWAButton';
import { BottomNav } from './components/BottomNav';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Flag } from './components/Flag';
import { Logo, LogoWordmark } from './components/Logo';
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
import { parseAccessControl, canSeeFinance, canSeePatientPhone } from './utils/accessControl';
import { visibleNavigation as buildNavigation, canOpenModule, homeFor } from './utils/navigation';
import { LanguageProvider, useLanguage } from './context/LanguageContext';
import { Language } from './i18n/translations';


/* Namoyishdagi rollar. Shifokorning `doctorId` si demo ma'lumotidagi
   shifokor bilan mos bo'lishi SHART: navbat aynan shu bo'yicha
   filtrlanadi va mos kelmasa ekran bo'sh chiqadi. */
const DEMO_ROLE_PROFILES: Record<string, { label: string; name: string; doctorId?: string }> = {
  [UserRole.CLINIC_ADMIN]: { label: 'Ega', name: 'Demo Admin' },
  [UserRole.DOCTOR]: { label: 'Shifokor', name: 'Dr. Kamola Ahmedova', doctorId: 'demo-doctor-1' },
  [UserRole.RECEPTIONIST]: { label: 'Registrator', name: 'Registrator' },
  [UserRole.LAB_TECHNICIAN]: { label: 'Laborant', name: 'Laborant' },
  [UserRole.NURSE]: { label: 'Hamshira', name: 'Hamshira' },
};

/* Manzil → sahifa nomi. Yuqori qatorda klinika nomi ostida turadi va
   brauzer tabining sarlavhasiga ham shu tushadi.

   XODIMLAR TUSHIB QOLGAN EDI: `/staff` uchun qoida yo'q edi va oxirgi
   `return 'today.title'` ishlab ketardi — Xodimlar sahifasida yuqorida
   «Bugun» deb turardi. Ilgari bu ko'rinmasdi, chunki sahifa nomi faqat
   brauzer tabida edi; endi ekranda ham chiqadi. */
const getPageLabelKey = (pathname: string): any => {
  if (pathname === '/' || pathname === '/dashboard') return 'today.title';
  if (pathname.startsWith('/patients/')) return 'nav.patients'; // Will translate as "Patients", detail page handles own title
  if (pathname === '/patients') return 'nav.patients';
  if (pathname.startsWith('/staff')) return 'nav.staff';
  if (pathname === '/calendar') return 'nav.calendar';
  if (pathname === '/finance') return 'nav.finance';
  if (pathname === '/inventory') return 'inventory.title';
  if (pathname === '/today') return 'today.title';
  if (pathname.startsWith('/visit/')) return 'nav.visit';
  if (pathname === '/board') return 'nav.board';
  if (pathname === '/diagnostics') return 'nav.diagnostics';
  if (pathname === '/inpatient') return 'nav.inpatient';
  if (pathname === '/lab') return 'nav.lab';
  if (pathname === '/messages') return 'nav.messages';
  if (pathname === '/settings') return 'nav.settings';
  return 'today.title';
};

const AppContent: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { t, language, setLanguage } = useLanguage();

  // --- Global State ---
  /* AI yordamchi sahifa USTIDA ochiladi — turgan joyingizni tashlab
     ketmasdan savol berish uchun. Ilgari u boshqaruv paneli ichidagi
     vkladka edi va tugma o'sha sahifaga olib o'tardi. */
  const [aiOpen, setAiOpen] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [userRole, setUserRole] = useState<UserRole>(UserRole.CLINIC_ADMIN);
  const [userName, setUserName] = useState('');
  const [clinicId, setClinicId] = useState<string>('');
  const [doctorId, setDoctorId] = useState<string>('');
  const [receptionistId, setReceptionistId] = useState<string>('');
  const [technicianId, setTechnicianId] = useState<string>('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  /* Standart holat — QORONG'I. Ilgari tizim sozlamasidan olinardi, ya'ni
     ko'pchilik kompyuterda dastur yorug' temada ochilardi. Yangi palitra
     qorong'i uchun tuzilgan va dasturning asosiy ko'rinishi shu; yorug'
     tema qoladi, lekin uni foydalanuvchi ataylab tanlaydi.

     Boshlang'ich qiymat `index.html` dagi skript bilan MOS bo'lishi shart:
     u sinfni React ishga tushishidan oldin qo'yadi (oq lop etib chiqmasin),
     bu yer esa o'sha qarorni takrorlaydi. */
  const [isDarkMode, setIsDarkMode] = useState(() => {
    try {
      return localStorage.getItem('xclinic_theme') !== 'light';
    } catch { return true; }
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
          /* HISOB QATORLARI VA BO'LIMLAR — demo tarmog'ida TUSHIB QOLGAN edi.
             Pastdagi haqiqiy tarmoqda ular yuklanadi, bu yerda esa yo'q edi,
             ya'ni `charges` bo'sh massiv bo'lib qolardi.

             Ko'rinishi: kassada «Hozir klinikada» ro'yxati bemorning 90 000
             qarzini ko'rsatadi (u boshqa manbadan — `charges.pending()` dan
             keladi), lekin «To'lash» bosilganda oyna «To'lanmagan qator yo'q»
             deydi va «qabul qilish» tugmasi o'chiq turadi. Ya'ni kassaning
             asosiy tugmasi ishlamaydi. Bo'limlarsiz esa registratura va
             kalendar filtrlari bo'sh qolardi. */
          const [demoCharges, demoDepts] = await Promise.all([
            api.charges.getAll({ status: 'Unpaid' }).catch(() => []),
            api.departments.getAll().catch(() => []),
          ]);
          setCharges(demoCharges || []);
          setDepartments(demoDepts || []);
        } else if (clinicId) {
          const [pts, appts, txs, exps, svcs, docs, recs, invItems, cats, revs, clinicData, labTechs, labOrds, closures, movements, depts, chrgs] = await Promise.all([
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
  const handleLogin = (role: UserRole, name: string, clinicIdParam?: string, doctorIdParam?: string, receptionistIdParam?: string, mustChange?: boolean, keepRoute?: boolean) => {
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

    /* SO'RALGAN SAHIFADA QOLISH (demo avtomatik kirishi).
       Demo nusxada kirish sahifasi ko'rsatilmaydi — havolani ochgan odam
       darhol ichkarida bo'ladi. Lekin quyidagi `navigate` o'sha havolani
       tashlab yuborardi: `#/inventory` ni ochgan odam Boshqaruv panelida
       paydo bo'lardi va sahifa ochilmadi deb o'ylardi.

       Faqat HAQIQIY manzil saqlanadi: `/` va `/login` da qolishning
       ma'nosi yo'q — ular kirish sahifasining o'zi. */
    const asked = location.pathname;
    if (keepRoute && asked && asked !== '/' && asked !== '/login') {
      addToast('success', `Xush kelibsiz, ${name}!`);
      return;
    }

    // Navigate based on role
    // Har kim o'z ish o'rniga tushadi — hamma Dashboard'ga emas
    if (role === UserRole.RECEPTIONIST) {
      navigate('/today');
    } else if (role === UserRole.DOCTOR) {
      navigate('/today');
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
        const [pts, appts, txs, exps, svcs, docs, recs, invItems, cats, revs] = await Promise.all([
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
  /* Menyu `utils/navigation.ts` dan. Ilgari ro'yxat shu yerda va
     `BottomNav.tsx` da ALOHIDA yozilgan edi va ular ajralib ketgan. */
  const visibleNavigation = buildNavigation(userRole, accessControl);

  /* MARSHRUT QO'RIQCHISI.

     «Ruxsatlar» dagi filtr ilgari FAQAT menyuga qo'llanardi: modul
     yashirilgan bo'lsa ham `#/inventory` ni qo'lda yozib kirish mumkin
     edi. Endi sahifaning o'zi ham tekshiradi va ruxsat bo'lmasa rolning
     bosh sahifasiga qaytaradi. */
  /* Xodim qo'shildi yoki o'zgardi — App dagi ro'yxatlar yangilanadi.
     Ular hamma joyda ishlatiladi: kalendar shifokorni filtrlaydi, kassa
     ismini ko'rsatadi. Ilgari bu funksiya Sozlamalar marshrutining
     ichida yozilgan edi; endi uni Xodimlar moduli ham chaqiradi. */
  const refreshStaffLists = React.useCallback(async () => {
    if (!clinicId) return;
    try {
      const [docs, recs, techs] = await Promise.all([
        api.doctors.getAll(clinicId),
        api.receptionists.getAll(clinicId),
        api.labTechnicians.getAll(clinicId),
      ]);
      setDoctors(docs);
      setReceptionists(recs);
      setLabTechnicians(techs || []);
    } catch { /* xato toast orqali ko'rsatilgan bo'ladi */ }
  }, [clinicId]);

  const guard = (moduleId: string, element: React.ReactNode) =>
    canOpenModule(userRole, accessControl, moduleId)
      ? element
      : <Navigate to={homeFor(userRole)} replace />;
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
  /* NAV PANELINING GORIZONTAL SURILISHI — OLIB TASHLANDI.

     Bu yerda ~95 qator turardi: `navOverflow` holati, chekkadagi
     gradientlar, faol tugmani markazga suruvchi `requestAnimationFrame`
     halqasi va `ResizeObserver`. Hammasi BITTA muammoni yamardi —
     menyu gorizontal chiziq bo'lgani uchun 9 ta modul ekranga sig'masdi
     va oxirgilari ko'rinmay qolardi (audit B-03).

     Menyu endi CHAPDAGI VERTIKAL USTUN. To'qqizta punkt istalgan
     noutbuk balandligiga bemalol sig'adi, ya'ni surish ham, gradient
     ham, markazlashtirish ham kerak emas — muammoning o'zi yo'q.
     Yamoqni saqlab qolish esa ishlamaydigan kodni saqlash bo'lardi. */

  /* QARZDORLAR — yuqori qatordagi ko'rsatkich.

     `charges` da faqat to'lanmagan qatorlar turadi (`status: 'Unpaid'`),
     lekin qisman to'lov ham bo'ladi — shuning uchun qoldiq
     `total - paidAmount` bo'yicha hisoblanadi, qatorlar soni bo'yicha
     emas. Bitta bemorning beshta to'lanmagan qatori — bitta qarzdor,
     shuning uchun `Set`.

     `patientId` bo'sh bo'lishi mumkin (kartaga bog'lanmagan qator) —
     bunday holda ism kalit bo'ladi, aks holda hammasi bitta `null`
     kaliti ostida qo'shilib, bitta qarzdor bo'lib ko'rinardi. */
  const { debtorCount, debtTotal } = useMemo(() => {
    const ids = new Set<string>();
    let sum = 0;
    for (const c of charges) {
      const left = (c.total || 0) - (c.paidAmount || 0);
      if (left <= 0) continue;
      sum += left;
      ids.add(c.patientId || `name:${c.patientName}`);
    }
    return { debtorCount: ids.size, debtTotal: sum };
  }, [charges]);


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
    F2: () => navigate('/today'),
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
    /* DEMO NUSXADA SERVER YO'Q. Vercelga chiqariladigan build backendsiz
       ishlaydi, ya'ni bu so'rov har ochilishda behuda yiqiladi. Xatoni
       `catch` yutadi va ekran buzilmaydi, lekin konsolda «500» ko'rinib
       turadi — demo ko'rsatayotgan odam uni nosozlik deb o'ylaydi. */
    if (IS_DEMO_BUILD) return;
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
      <div className="min-h-screen bg-canvas flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-primary-600 dark:text-primary-400 animate-spin mx-auto mb-4" />
          <p className="text-lg font-medium text-muted">{t('common.loading')}</p>
          <p className="text-sm text-muted mt-2">{t('common.pleaseWait')}</p>
        </div>
      </div>
    );
  }

  // Error Screen
  if (error) {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-surface rounded-lg shadow-lg p-8 text-center">
          <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-8 h-8 text-red-600 dark:text-red-400" />
          </div>
          <h2 className="text-xl font-bold text-ink mb-2">{t('common.error')}</h2>
          <p className="text-muted mb-6">{error}</p>
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
              className="w-full px-6 py-3 bg-elevated hover:bg-elevated text-ink rounded-lg font-medium transition-colors"
            >
              {t('common.logout')}
            </button>
          </div>
          <p className="text-xs text-muted mt-6">
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

  /* Rol nomi — ilgari bu uch qavatli shartli ifoda IKKI JOYDA (yuqori
     qator va telefon menyusi) nusxalangan edi va ular ajralib ketgandi:
     birida `t('roles.admin')`, ikkinchisida qo'lda yozilgan
     «Administrator». Endi bitta joyda. */
  const roleLabel =
    userRole === UserRole.CLINIC_ADMIN ? t('roles.admin')
      : userRole === UserRole.RECEPTIONIST ? t('roles.receptionist')
        : userRole === UserRole.LAB_TECHNICIAN ? 'Laborant'
          : userRole === UserRole.NURSE ? 'Hamshira'
            : t('roles.doctor');

  return (
    <div className="min-h-screen bg-canvas text-ink font-sans">
      <ToastContainer toasts={toasts} removeToast={removeToast} />
      {/* Tasdiqlash oynasi — ilovada BIR MARTA. Qolgan joylar uni
          `confirmAction()` orqali chaqiradi (S3.6). */}
      <ConfirmDialog />
      <InstallPWAButton />

      {/* ═══════════════════════════════════════════════════════════════
          QOBIQ

          Ilgari navigatsiya YUQORIDA, ikki qavatli sarlavhada turardi:
          birinchi qatorda logotip va qidiruv, ikkinchisida esa to'qqizta
          modul gorizontal chiziq bo'lib. Bu ikkita narsani buzardi —
          modullar ekranga sig'masdi (audit B-03) va sahifaning eng qimmat
          joyi, yuqori 112 piksel, menyuga ketardi.

          Endi menyu CHAPDA, tor vertikal ustunda (ikonka + yozuv), yuqorida
          esa bitta qator qoladi: klinika nomi, qidiruv va o'ng chekkadagi
          boshqaruvlar. Ish maydoni balandligi ~36px ga oshdi va menyuga
          modul qo'shilsa ham sig'adi.
          ═══════════════════════════════════════════════════════════════ */}

      {/* ─── TELEFON: yuqori qator ──────────────────────────────── */}
      <div className="lg:hidden sticky top-0 z-30 flex items-center justify-between px-4 h-16 bg-canvas/90 backdrop-blur-xl border-b border-line">
        <LogoWordmark size="sm" />
        <button
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className="p-2 -mr-2 text-muted hover:text-ink rounded-xl hover:bg-elevated transition-colors"
          aria-label={t('common.menu')}
        >
          {isSidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* ─── TELEFON: chekka menyu ──────────────────────────────── */}
      <aside className={`lg:hidden fixed inset-y-0 left-0 z-50 w-72 bg-rail border-r border-line transform transition-transform duration-300 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex flex-col h-full pb-16">
          <div className="h-16 flex items-center px-5 border-b border-line">
            <LogoWordmark size="sm" />
            <button onClick={() => setIsSidebarOpen(false)} className="ml-auto p-2 text-faint hover:text-ink hover:bg-elevated rounded-xl transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
            {visibleNavigation.map((item) => {
              const to = item.id === 'dashboard' ? '/' : `/${item.id}`;
              return (
                <NavLink
                  key={item.id}
                  to={to}
                  end={item.id === 'dashboard'}
                  onClick={() => setIsSidebarOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 w-full px-3 py-3 text-sm font-semibold rounded-2xl transition-colors ${isActive || (item.id === 'patients' && location.pathname.startsWith('/patients'))
                      ? 'bg-primary-500/12 text-primary-700 dark:text-primary-300'
                      : 'text-muted hover:text-ink hover:bg-elevated'
                    }`
                  }
                >
                  <item.icon className="w-5 h-5 shrink-0" strokeWidth={1.9} />
                  {t(item.labelKey as any)}
                </NavLink>
              );
            })}
          </nav>

          <div className="p-4 border-t border-line">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center overflow-hidden flex-1 mr-2">
                <div className="w-9 h-9 rounded-full shrink-0 flex items-center justify-center text-white font-bold text-xs uppercase bg-gradient-to-br from-primary-500 to-primary-700">
                  {userName ? userName.slice(0, 2) : 'A'}
                </div>
                <div className="ml-3 truncate">
                  <p className="text-sm font-semibold text-ink truncate" title={userName}>{userName}</p>
                  <p className="text-xs text-faint">{roleLabel}</p>
                </div>
              </div>
              <button onClick={handleLogout} className="p-2 text-faint hover:text-danger rounded-xl hover:bg-elevated shrink-0 transition-colors" title={t('common.logout')}>
                <LogOut className="w-5 h-5" />
              </button>
            </div>
            <div className="flex items-center bg-elevated rounded-full p-1 gap-1 border border-line">
              {(['uz', 'ru'] as const).map((lang) => (
                <button
                  key={lang}
                  onClick={() => setLanguage(lang)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-full text-xs font-bold transition-colors ${language === lang
                    ? 'bg-surface text-ink'
                    : 'text-faint'
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

      {/* ─── KOMPYUTER: chapdagi menyu ustuni ───────────────────────
          Kengligi — `--spacing-rail` (index.css). `w-rail`, `left-rail` va
          `pl-rail` bitta qiymatdan oziqlanadi, ya'ni ustun kengligini
          o'zgartirish uchun bitta joyni tahrirlash yetarli. */}
      <aside className="hidden lg:flex fixed inset-y-0 left-0 z-40 w-rail flex-col bg-rail border-r border-line">
        {/* Logotip — yuqori qator bilan bir xil balandlikda, shunda
            ikkalasining ostki chizig'i bitta gorizontal chiziq bo'lib ketadi. */}
        <div className="h-topbar flex items-center justify-center border-b border-line shrink-0">
          <Logo className="w-11 h-11" />
        </div>

        {/* ‘no-scrollbar’ ATAYLAB YO'Q. Kichik noutbukda (720px) o'nta
            modul + chiqish zo'rg'a sig'adi; ruxsatlarga qarab yana punkt
            qo'shilsa oxirgisi ko'rinmay qoladi. Yashirin scrollbar aynan
            shu holatni — «davomi bor» degan yagona belgini — o'chiradi.
            Bu eski gorizontal panelning xatosi edi, uni takrorlamaymiz. */}
        <nav className="flex-1 w-full px-2 py-2 space-y-0.5 overflow-y-auto">
          {visibleNavigation.map((item) => {
            const to = item.id === 'dashboard' ? '/' : `/${item.id}`;
            return (
              <NavLink
                key={item.id}
                to={to}
                end={item.id === 'dashboard'}
                title={t(item.labelKey as any)}
                className={({ isActive }) => {
                  const active = isActive || (item.id === 'patients' && location.pathname.startsWith('/patients'));
                  return `group relative flex flex-col items-center justify-center gap-1 w-full py-2 rounded-2xl transition-colors ${active
                    ? 'bg-primary-500/12 text-primary-700 dark:text-primary-300'
                    : 'text-faint hover:text-ink hover:bg-elevated'
                    }`;
                }}
              >
                {({ isActive }) => {
                  const active = isActive || (item.id === 'patients' && location.pathname.startsWith('/patients'));
                  return (
                    <>
                      {/* Chap qirradagi ingichka chiziq — faol modulni fon
                          rangiga qaramay aniq ko'rsatadi. */}
                      {active && (
                        <span aria-hidden="true"
                          className="absolute left-0 top-1/2 -translate-y-1/2 h-7 w-[3px] rounded-r-full bg-primary" />
                      )}
                      <item.icon className="w-5 h-5" strokeWidth={active ? 2.3 : 1.8} />
                      <span className="text-[10px] font-semibold leading-tight text-center px-0.5">
                        {t(item.labelKey as any)}
                      </span>
                    </>
                  );
                }}
              </NavLink>
            );
          })}
        </nav>

        <div className="px-2 py-2 border-t border-line shrink-0">
          <button
            onClick={handleLogout}
            title={t('common.logout')}
            className="flex flex-col items-center justify-center gap-1 w-full py-2 rounded-2xl text-faint hover:text-danger hover:bg-danger-500/10 transition-colors"
          >
            <LogOut className="w-5 h-5" strokeWidth={1.8} />
            <span className="text-[10px] font-semibold leading-none">{t('common.logout')}</span>
          </button>
        </div>
      </aside>

      {/* ─── KOMPYUTER: yuqori qator ───────────────────────────── */}
      <header className="hidden lg:flex fixed top-0 right-0 left-rail z-30 h-topbar items-center gap-4 px-6 bg-canvas/85 backdrop-blur-xl border-b border-line">
        {/* Klinika nomi + turgan sahifa. Ilgari bu yerda yana bitta logotip
            turardi — chapdagi ustunda logotip bor ekan, uni takrorlash
            joyni bekorga egallaydi. Klinika nomi esa foydali: bitta
            kompyuterda ikkita nusxa ochilsa qaysi biri ekani ko'rinadi. */}
        <div className="min-w-0 shrink-0 max-w-[200px]">
          <p className="text-[15px] font-extrabold tracking-tight text-ink truncate uppercase">
            {currentClinic?.name || 'XClinic'}
          </p>
          <p className="text-[11px] font-medium text-faint truncate">{pageLabel}</p>
        </div>

        {clinicId === 'demo-clinic-1' && (
          <span className="shrink-0 px-2.5 py-1 text-[10px] font-bold bg-primary-500/12 text-primary-700 dark:text-primary-300 rounded-full border border-primary-500/25">
            DEMO
          </span>
        )}

        {/* Sana — reference dagi filial tanlagichning o'rnida. XClinic bitta
            klinika uchun, filial tushunchasi yo'q; kunlik ishda esa eng ko'p
            keraklisi aynan bugungi sana. */}
        <div className="hidden 2xl:flex shrink-0 items-center gap-2 h-10 px-4 rounded-full border border-line bg-surface text-sm font-semibold text-muted">
          <CalendarIcon className="w-4 h-4 text-faint" />
          {formatHeaderDate(new Date(), language)}
        </div>

        {/* Qidiruv — markazda va keng. Dasturdagi eng ko'p ishlatiladigan
            maydon, shuning uchun eng ko'rinadigan joyda turadi. */}
        <div className="flex-1 flex justify-center min-w-0">
          <div className="relative group w-full max-w-2xl">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-faint group-focus-within:text-primary transition-colors" />
            <input
              type="text"
              placeholder={t('header.search')}
              value={searchBarTerm}
              onChange={(e) => setSearchBarTerm(e.target.value)}
              onFocus={() => setIsSearchFocused(true)}
              className="w-full h-11 pl-12 pr-4 bg-surface border border-line rounded-full text-sm text-ink
                         placeholder:text-faint outline-none transition-colors
                         focus:border-primary-500/50 focus:ring-4 focus:ring-primary-500/10"
            />

            {/* Qidiruv natijalari */}
            {isSearchFocused && searchBarTerm.length >= 2 && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setIsSearchFocused(false)}></div>
                <div className="absolute top-full left-0 right-0 mt-2 panel overflow-hidden z-50 animate-in">
                  {searchResults.patients.length === 0 && searchResults.doctors.length === 0 ? (
                    <div className="p-8 text-center">
                      <div className="w-12 h-12 bg-elevated rounded-full flex items-center justify-center mx-auto mb-3">
                        <Search className="w-5 h-5 text-faint" />
                      </div>
                      <p className="text-sm font-semibold text-ink">Natija topilmadi</p>
                      <p className="text-xs text-faint mt-1">Boshqa so'z bilan urinib ko'ring</p>
                    </div>
                  ) : (
                    <div className="max-h-[420px] overflow-y-auto py-2">
                      {searchResults.patients.length > 0 && (
                        <div className="px-2 mb-1">
                          <div className="px-3 py-2 flex items-center gap-2 text-[10px] font-bold text-faint uppercase tracking-widest">
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
                              className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-elevated transition-colors text-left"
                            >
                              <div className="w-9 h-9 rounded-full bg-primary-500/12 flex items-center justify-center text-primary-700 dark:text-primary-300 font-bold text-xs shrink-0">
                                {p.firstName[0]}{p.lastName[0]}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-ink truncate">
                                  {p.firstName} {p.lastName}
                                </p>
                                <p className="text-[11px] text-faint truncate">{p.phone}</p>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}

                      {searchResults.doctors.length > 0 && (
                        <div className="px-2 border-t border-line-soft pt-1">
                          <div className="px-3 py-2 flex items-center gap-2 text-[10px] font-bold text-faint uppercase tracking-widest">
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
                              className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-elevated transition-colors text-left"
                            >
                              <div className="w-9 h-9 rounded-full bg-success-500/12 flex items-center justify-center text-success font-bold text-xs shrink-0">
                                {d.firstName[0]}{d.lastName[0]}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-ink truncate">
                                  Dr. {d.firstName} {d.lastName}
                                </p>
                                <p className="text-[11px] text-faint truncate">{d.specialty}</p>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* ─── O'ng chekka ─────────────────────────────────── */}
        <div className="flex items-center gap-2.5 shrink-0">
          {/* QARZDORLAR. Ilgari to'lanmagan hisoblar faqat Moliya bo'limiga
              kirgandagina ko'rinardi, ya'ni ularni ataylab qidirish kerak
              edi. Endi raqam har sahifada turadi va bosilganda kassaga
              olib boradi. Nol bo'lsa — tugma umuman chiqmaydi. */}
          {debtorCount > 0 && showFinanceForRole && (
            <button
              onClick={() => navigate('/finance')}
              title={`To'lanmagan: ${debtTotal.toLocaleString('ru-RU')} so'm`}
              className="flex items-center gap-2 h-10 px-4 rounded-full text-sm font-bold
                         bg-danger-500/10 text-danger border border-danger-500/25
                         hover:bg-danger-500/20 transition-colors"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-danger" />
              {debtorCount} {t('common.debtors')}
            </button>
          )}

          {/* AI yordamchi — sahifa USTIDA ochiladi, turgan joyni tashlab
              ketmasdan. Hamshira moliyaviy panelni ko'rmaydi, unga tugma
              ham chiqmaydi. */}
          {userRole !== UserRole.NURSE && (
            <button
              onClick={() => setAiOpen(true)}
              className="flex items-center gap-2 h-10 px-4 rounded-full text-sm font-bold text-white
                         bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500
                         transition-colors shrink-0"
              title={t('ai.tab')}
            >
              <Sparkles className="w-4 h-4" />
              <span className="hidden 2xl:inline">{t('ai.tab')}</span>
            </button>
          )}

          {/* Til */}
          <div className="flex items-center h-10 bg-surface rounded-full p-1 gap-0.5 border border-line">
            {(['uz', 'ru'] as const).map((lang) => (
              <button
                key={lang}
                onClick={() => setLanguage(lang)}
                className={`flex items-center gap-1.5 px-3 h-8 rounded-full text-xs font-bold transition-colors ${language === lang
                  ? 'bg-primary-500/15 text-primary'
                  : 'text-faint hover:text-muted'
                  }`}
              >
                <Flag code={lang} />
                <span className="uppercase tracking-wide">{lang}</span>
              </button>
            ))}
          </div>

          <button
            onClick={() => setIsDarkMode(!isDarkMode)}
            className="w-10 h-10 flex items-center justify-center rounded-full border border-line bg-surface text-muted hover:text-ink transition-colors"
            title={isDarkMode ? "Yorug' tema" : "Qorong'i tema"}
          >
            {isDarkMode ? <Sun className="w-[18px] h-[18px]" /> : <Moon className="w-[18px] h-[18px]" />}
          </button>

          {/* ── NAMOYISHDA ROLNI ALMASHTIRISH ─────────────────────
              Faqat namoyish nusxasida. Klinikaga tarqatiladigan bundle'da
              bu tugma umuman yo'q. */}
          {IS_DEMO_BUILD && (
            <select
              aria-label="Demo: rol"
              value={userRole}
              onChange={(e) => {
                const r = e.target.value as UserRole;
                const who = DEMO_ROLE_PROFILES[r];
                auth.setSession({
                  role: r, name: who.name, clinicId: 'demo-clinic-1',
                  username: 'demo', token: 'demo-token', isDemo: true,
                  ...(who.doctorId ? { doctorId: who.doctorId } : {}),
                } as any);
                handleLogin(r, who.name, 'demo-clinic-1', who.doctorId);
              }}
              className="h-10 px-3 text-xs font-bold rounded-full border border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-300"
            >
              {Object.entries(DEMO_ROLE_PROFILES).map(([role, who]) => (
                <option key={role} value={role}>{who.label}</option>
              ))}
            </select>
          )}

          {/* Kim kirgan. Klinikada bitta kompyuterda navbatma-navbat
              ishlashadi — ism ko'rinib turishi shart. Chiqish tugmasi bu
              yerdan chapdagi ustun ostiga ko'chdi. */}
          <div className="flex items-center gap-2.5 pl-2.5 ml-0.5 border-l border-line">
            <div className="hidden xl:block text-right leading-tight">
              <p className="text-sm font-bold text-ink max-w-[140px] truncate" title={userName}>{userName}</p>
              <p className="text-[11px] text-faint">{roleLabel}</p>
            </div>
            <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm uppercase bg-gradient-to-br from-primary-500 to-primary-700">
              {userName ? userName.slice(0, 2) : 'A'}
            </div>
          </div>
        </div>
      </header>

      <main className="min-h-screen flex flex-col lg:pl-rail lg:pt-topbar">
        <div className="w-full px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-7 flex-1 overflow-x-hidden pb-24 lg:pb-10">
          <ErrorBoundary key={location.pathname} section={t(getPageLabelKey(location.pathname))}>
          {/* `Suspense` — `React.lazy` bilan bo'lingan sahifalar uchun (S5.5).
              Yuklash indikatori ERROR BOUNDARY ICHIDA: chunk yuklanmasa
              (tarmoq uzildi, eski kesh) xato ushlansin va oq ekran
              bo'lmasin. */}
          <React.Suspense fallback={
            <div className="flex items-center justify-center py-24" role="status" aria-live="polite">
              <div className="w-8 h-8 rounded-full border-2 border-line border-t-primary-600 animate-spin" />
              <span className="sr-only">Yuklanmoqda…</span>
            </div>
          }>
          <Routes>

            <>
              {/* BOSH SAHIFA — «Bugun».

                  Ilgari bu «Boshqaruv paneli» edi: oltita bosilmaydigan
                  plitka, ikkita diagramma va bugungi qabullar jadvali.
                  Raqamlar u yerda BRAUZERDA qayta hisoblanardi, Moliya
                  bo'limidagi hisobot esa serverda — ya'ni bitta savolga
                  ikkita javob bor edi. Kunlik ish uchun kerak bo'lgani
                  («bugun kim keldi») «Bugun» ekraniga o'tdi, raqamlar esa
                  Moliya → Hisobotda qoladi. */}
              <Route path="/" element={
                <Navigate to={userRole === UserRole.NURSE ? '/inpatient'
                  : userRole === UserRole.LAB_TECHNICIAN ? '/lab' : '/today'} replace />
              } />

              <Route path="/patients" element={
                guard('patients',
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
              )} />

              <Route path="/patients/:patientId" element={
                guard('patients',
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
                  onAddAppointment={addAppointment}
                  onUpdateAppointment={updateAppointment}
                />
              )} />

              <Route path="/calendar" element={
                guard('calendar',
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
              )} />

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

              {/* ── XODIMLAR ────────────────────────────────────────────
                  Ro'yxat va xodim kartasi. Ulush va vedomost ham shu
                  yerda — ilgari ular Moliyada, xodimlar esa Sozlamalarda
                  edi va bitta savol ikkita bo'limga bo'lingan edi. */}
              <Route path="/staff" element={
                guard('staff',
                  <Staff
                    departments={departments}
                    services={services}
                    doctors={doctors}
                    clinicId={clinicId}
                    addToast={addToast}
                    onStaffChanged={refreshStaffLists}
                  />)
              } />
              <Route path="/staff/:role/:id" element={
                guard('staff',
                  <StaffCard
                    departments={departments}
                    services={services}
                    clinicId={clinicId}
                    addToast={addToast}
                    onStaffChanged={refreshStaffLists}
                  />)
              } />

              <Route path="/board" element={<QueueBoard clinicId={clinicId} />} />
              {/* Kiosk ko'rinishi — televizorga chiqariladigan alohida oyna.
                  Bu marshrut FAQAT kirmagan holat uchun e'lon qilingan edi
                  (yuqoridagi ro'yxatga qarang), ya'ni tizimga kirgan odam
                  «Kiosk rejimi» havolasini bosganda «Sahifa topilmadi»
                  chiqardi — havola esa aynan shu ekranda turadi
                  (audit XC-02). */}
              <Route path="/board/:clinicId" element={<QueueBoard />} />

              <Route path="/today" element={
                guard('today',
                <Today
                  clinicId={clinicId}
                  patients={patients}
                  doctors={doctors}
                  departments={departments}
                  services={services}
                  currentClinic={currentClinic}
                  userRole={userRole}
                  doctorId={doctorId}
                  showPatientPhone={showPatientPhoneForRole}
                  onCreatePatient={addPatient}
                  onPatientAdded={(p: Patient) => setPatients(prev => prev.some(x => x.id === p.id) ? prev : [p, ...prev])}
                  addToast={addToast}
                  userName={userName}
                />
              )} />

              {/* Eski manzillar — talonlar, xatcho'plar va odat uchun */}
              <Route path="/reception" element={<Navigate to="/today" replace />} />
              <Route path="/myqueue" element={<Navigate to="/today" replace />} />

              {/* Kassa endi Moliya ichida — eski havolalar shu yerga tushadi */}
              <Route path="/cashier" element={<Navigate to="/finance" replace />} />

              {/* Qabul ish stoli bemor kartasiga ko'chdi. Marshrut kartaga
                  yo'naltiradi — eski havolalar va talonlar ishlayveradi. */}
              <Route path="/visit/:visitId" element={<VisitWorkspace />} />

              <Route path="/diagnostics" element={
                guard('diagnostics',
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
              )} />

              <Route path="/inpatient" element={
                guard('inpatient',
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
              )} />

              <Route path="/lab" element={
                guard('lab',
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
              )} />

              {(userRole === UserRole.CLINIC_ADMIN || userRole === UserRole.RECEPTIONIST) && (
                <>
                  {/* SHIFOKORLAR ANALITIKASI OLIB TASHLANDI.

                      U shifokor ulushini BRAUZERDA qayta hisoblardi
                      (`calculateDoctorShare`), holbuki server buni ikki
                      joyda allaqachon hisoblaydi: Moliya → Hisobot →
                      «Shifokorlar» va Moliya → «Ulush» (vedomost). Uch xil
                      hisob — uch xil raqam; oylik to'lanadigan yagona
                      raqam esa vedomostdagisi. Sahifada birorta ham amal
                      yo'q edi. */}

                  <Route path="/inventory" element={
                    guard('inventory',
                    <Inventory
                      items={inventoryItems}
                      userName={userName}
                      userRole={userRole}
                      departments={departments}
                      onAddItem={addInventoryItem}
                      onDeleteItem={deleteInventoryItem}
                      onRefreshItems={refreshInventory}
                    />
                  )} />

                  {/* XABARLAR — FAQAT EGAGA.

                      Bu sahifa menyuda yo'q, shuning uchun `guard()` uni
                      cheklamasdi: `canOpenModule` menyuda bo'lmagan
                      sahifani «ochiq» deb hisoblaydi. Ya'ni hamshira,
                      laborant yoki shifokor manzilni qo'lda yozib kirsa,
                      butun bemorlar bazasi bo'yicha ommaviy jo'natish
                      oynasini ko'rardi.

                      Server yozishni allaqachon to'sardi (`permissions.ts`
                      da `send-bulk` — faqat ega), lekin ekranning O'ZI
                      ochilardi: shablonlar, segmentlar va bemor ro'yxati
                      ko'rinib turardi. */}
                  <Route path="/messages" element={
                    userRole !== UserRole.CLINIC_ADMIN
                      ? <Navigate to={homeFor(userRole)} replace />
                      : <MessagesManagement
                      clinicId={clinicId}
                      currentClinic={currentClinic}
                      doctors={doctors}
                      addToast={addToast}
                    />
                  } />

                  <Route path="/settings" element={
                    guard('settings',
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
                      /* Xodim qo'shilgan yoki o'zgargan — App dagi ro'yxatlar
                         yangilanadi. Ular hamma joyda ishlatiladi: kalendar
                         shifokorni filtrlaydi, kassa ismini ko'rsatadi. */
                      /* Klinika sozlamasi o'zgardi — `currentClinic` ni
                         qayta o'qiymiz. Ilgari Sozlamalar TO'RT joyda
                         `window.location.reload()` chaqirardi: butun ilova
                         qaytadan yuklanardi, xotiradagi hamma ro'yxat
                         yo'qolardi va Electron oynasida bu sezilarli
                         to'xtash edi. */
                      onClinicUpdated={async () => {
                        if (!clinicId) return;
                        try { setCurrentClinic(await api.clinics.getById(clinicId)); }
                        catch { /* xato toast orqali ko'rsatilgan bo'ladi */ }
                      }}
                      onStaffChanged={refreshStaffLists}
                          reviews={reviews}
                    />
                  )} />
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

      {/* Sahifa ustidan ochiladi — turgan joyingiz saqlanadi */}
      <AiOverlay open={aiOpen} onClose={() => setAiOpen(false)} userRole={userRole} />
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
