import React, { useState, useMemo } from 'react';
import { Card, Button, Input, Modal, Select } from '../components/Common';

import { UserRole, Doctor, Receptionist, Clinic, SubscriptionPlan, Service, ServiceCategory, Review, LabTechnician, AccessControl, RoleAccess, LeadApiKeyInfo, DepartmentType, DEPARTMENT_TYPE_LABELS } from '../types';
import { User, DollarSign, Users, Edit, Trash2, CheckCircle, Bot, Phone, Star, MessageSquare, Building2, Plus, Facebook, Activity, RefreshCw, FlaskConical, Shield, KeyRound, Copy, Eye, EyeOff, Link2, ChevronDown, HardDrive, Database, AlertTriangle, Download } from 'lucide-react';
import { api, API_URL } from '../services/api';
import { useLanguage } from '../context/LanguageContext';
import { parseAccessControl } from '../utils/accessControl';
import { ACCESS_MODULES, SIMPLE_VIEW_HIDDEN_MODULES } from '../constants';

/** Bo'lim rangi — navbat tablosi va kalendar shu ranglarni ishlatadi */
const DEPT_COLORS = [
   { name: "Ko'k", value: '#2563EB' },
   { name: 'Qizil', value: '#DC2626' },
   { name: 'Binafsha', value: '#7C3AED' },
   { name: 'Pushti', value: '#DB2777' },
   { name: 'Moviy', value: '#0891B2' },
   { name: 'Yashil', value: '#059669' },
   { name: 'Sariq', value: '#D97706' },
   { name: 'Feruza', value: '#0D9488' },
   { name: 'Indigo', value: '#4F46E5' },
   { name: 'Jigarrang', value: '#B45309' },
];

const DOCTOR_COLORS = [
   { name: 'Ko\'k', value: '#3B82F6' },
   { name: 'Yashil', value: '#10B981' },
   { name: 'Binafsha', value: '#8B5CF6' },
   { name: 'Qizil', value: '#F43F5E' },
   { name: 'Sariq', value: '#F59E0B' },
   { name: 'Havorang', value: '#06B6D4' },
   { name: 'To\'q ko\'k', value: '#6366F1' },
   { name: 'To\'q sariq', value: '#FB923C' },
];

interface SettingsProps {
   userRole: UserRole;
   services: Service[];
   doctors: Doctor[];
   receptionists?: Receptionist[];
   labTechnicians?: LabTechnician[];
   categories: ServiceCategory[];
   onAddService: (service: Omit<Service, 'id' | 'clinicId'>) => void;
   onUpdateService: (index: number, service: Partial<Service>) => void;
   onDeleteService?: (id: number) => Promise<void>;
   onAddCategory: (category: Omit<ServiceCategory, 'id' | 'clinicId'>) => void;
   onDeleteCategory: (id: string) => void;
   onAddDoctor: (doctor: Omit<Doctor, 'id'>) => void;
   onUpdateDoctor: (id: string, doctor: Partial<Doctor>) => void;
   onDeleteDoctor: (id: string) => void;
   onAddReceptionist?: (receptionist: Omit<Receptionist, 'id'>) => void;
   onUpdateReceptionist?: (id: string, receptionist: Partial<Receptionist>) => void;
   onDeleteReceptionist?: (id: string) => void;
   onAddLabTechnician?: (tech: Omit<LabTechnician, 'id' | 'status'>) => void;
   onUpdateLabTechnician?: (id: string, tech: Partial<LabTechnician>) => void;
   onDeleteLabTechnician?: (id: string) => void;
   currentClinic?: Clinic;
   plans?: SubscriptionPlan[];
   reviews: Review[];
}

export const Settings: React.FC<SettingsProps> = ({
   userRole, services, categories, doctors, receptionists = [], labTechnicians = [], onAddService, onUpdateService, onDeleteService, onAddCategory, onDeleteCategory, onAddDoctor, onUpdateDoctor, onDeleteDoctor, onAddReceptionist, onUpdateReceptionist, onDeleteReceptionist, onAddLabTechnician, onUpdateLabTechnician, onDeleteLabTechnician, currentClinic, plans, reviews
}) => {
   const { t } = useLanguage();
   const [activeTab, setActiveTab] = useState<'general' | 'services' | 'doctors' | 'receptionists' | 'labTechnicians' | 'messaging' | 'facebook' | 'dmed' | 'access' | 'leadApi' | 'maintenance' | 'departments'>('services');

   // Tashqi lid manbalari (yuboraman.uz va h.k.) uchun integratsiya kaliti
   const [leadApiInfo, setLeadApiInfo] = useState<LeadApiKeyInfo | null>(null);
   const [leadApiLoading, setLeadApiLoading] = useState(false);
   const [leadKeyVisible, setLeadKeyVisible] = useState(false);
   const [leadCopied, setLeadCopied] = useState<string | null>(null);
   const [leadDocsOpen, setLeadDocsOpen] = useState(false);

   React.useEffect(() => {
      if (activeTab !== 'leadApi' || !currentClinic?.id) return;
      let cancelled = false;
      setLeadApiLoading(true);
      api.leads.getApiKey(currentClinic.id)
         .then(info => { if (!cancelled) setLeadApiInfo(info); })
         .catch(err => console.error('Lid API kalitini yuklab bo\'lmadi', err))
         .finally(() => { if (!cancelled) setLeadApiLoading(false); });
      return () => { cancelled = true; };
   }, [activeTab, currentClinic?.id]);

   const copyLeadValue = async (value: string, marker: string) => {
      try {
         await navigator.clipboard.writeText(value);
         setLeadCopied(marker);
         setTimeout(() => setLeadCopied(null), 1800);
      } catch {
         alert('Nusxalab bo\'lmadi. Qo\'lda belgilab oling.');
      }
   };

   const handleGenerateLeadKey = async () => {
      if (!currentClinic?.id) return;
      if (leadApiInfo?.apiKey && !window.confirm('Yangi kalit yaratilsa, eski kalit darhol ishlamay qoladi. Davom etasizmi?')) return;
      setLeadApiLoading(true);
      try {
         setLeadApiInfo(await api.leads.generateApiKey(currentClinic.id));
         setLeadKeyVisible(true);
      } catch (err: any) {
         alert(err?.message || 'Kalit yaratishda xatolik');
      } finally {
         setLeadApiLoading(false);
      }
   };

   const handleRevokeLeadKey = async () => {
      if (!currentClinic?.id) return;
      if (!window.confirm('Kalit o\'chirilsa, tashqi manbadan lid tushishi to\'xtaydi. Davom etasizmi?')) return;
      setLeadApiLoading(true);
      try {
         await api.leads.revokeApiKey(currentClinic.id);
         setLeadApiInfo(prev => prev ? { ...prev, apiKey: null, createdAt: null } : prev);
      } catch (err: any) {
         alert(err?.message || 'Kalitni o\'chirishda xatolik');
      } finally {
         setLeadApiLoading(false);
      }
   };

   // Ruxsatlar (access control) formasi — klinika sozlamalaridan boshlang'ich qiymat
   const [accessForm, setAccessForm] = useState<AccessControl>(() => parseAccessControl(currentClinic));
   const [accessSaving, setAccessSaving] = useState(false);
   // Kassa smenalari (Ruxsatlar bo'limining oxirida)
   const [cashShifts, setCashShifts] = useState<number>(currentClinic?.cashShiftsPerDay || 1);
   const [cashShiftsSaving, setCashShiftsSaving] = useState(false);
   const [accessSaved, setAccessSaved] = useState(false);

   const updateRoleAccess = (roleKey: 'doctor' | 'receptionist', patch: Partial<RoleAccess>) => {
      setAccessForm(prev => ({ ...prev, [roleKey]: { ...prev[roleKey], ...patch } }));
   };

   const toggleModule = (roleKey: 'doctor' | 'receptionist', moduleId: string) => {
      const hidden = accessForm[roleKey]?.hiddenModules || [];
      const next = hidden.includes(moduleId) ? hidden.filter(m => m !== moduleId) : [...hidden, moduleId];
      updateRoleAccess(roleKey, { hiddenModules: next });
   };

   // Tayyor presetlar: "Sodda" — faqat kundalik ish uchun kerak modullar, "Hammasi" — cheklovsiz
   const applyPreset = (roleKey: 'doctor' | 'receptionist', preset: 'simple' | 'all') => {
      const roleId = roleKey === 'doctor' ? 'DOCTOR' : 'RECEPTIONIST';
      updateRoleAccess(roleKey, {
         hiddenModules: preset === 'simple' ? [...SIMPLE_VIEW_HIDDEN_MODULES[roleId]] : [],
      });
   };

   const isSimplePreset = (roleKey: 'doctor' | 'receptionist') => {
      const roleId = roleKey === 'doctor' ? 'DOCTOR' : 'RECEPTIONIST';
      const hidden = [...(accessForm[roleKey]?.hiddenModules || [])].sort();
      const target = [...SIMPLE_VIEW_HIDDEN_MODULES[roleId]].sort();
      return hidden.length === target.length && hidden.every((m, i) => m === target[i]);
   };

   // Klinika ma'lumoti keyin yuklansa, formani sinxronlash
   React.useEffect(() => {
      setAccessForm(parseAccessControl(currentClinic));
      setCashShifts(currentClinic?.cashShiftsPerDay || 1);
   }, [currentClinic?.id, currentClinic?.accessControl, currentClinic?.cashShiftsPerDay]);

   const saveCashShifts = async (value: number) => {
      if (!currentClinic?.id) return;
      setCashShifts(value);
      setCashShiftsSaving(true);
      try {
         await api.clinics.updateCashSettings(currentClinic.id, value);
      } catch (error: any) {
         console.error('Cash settings save failed:', error);
         setCashShifts(currentClinic?.cashShiftsPerDay || 1);
         alert(error?.message || 'Kassa sozlamasini saqlashda xatolik');
      } finally {
         setCashShiftsSaving(false);
      }
   };

   const handleAccessSave = async () => {
      if (!currentClinic?.id) return;
      setAccessSaving(true);
      try {
         await api.clinics.updateAccessControl(currentClinic.id, accessForm);
         setAccessSaved(true);
         setTimeout(() => {
            setAccessSaved(false);
            window.location.reload();
         }, 1000);
      } catch (error: any) {
         console.error('Failed to save access control:', error);
         alert(error?.message || 'Ruxsatlarni saqlashda xatolik. Backend yangilanganiga ishonch hosil qiling.');
      } finally {
         setAccessSaving(false);
      }
   };
   const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
   const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
   const [categoryForm, setCategoryForm] = useState({ name: '' });

   // Service Modal State
   const [isServiceModalOpen, setIsServiceModalOpen] = useState(false);
   const [editingServiceId, setEditingServiceId] = useState<number | null>(null);
   const [serviceForm, setServiceForm] = useState({ name: '', price: '', cost: '', categoryId: '' });

   // Doctor Modal State
   const [isDoctorModalOpen, setIsDoctorModalOpen] = useState(false);
   const [editingDoctorId, setEditingDoctorId] = useState<string | null>(null);
   const [doctorForm, setDoctorForm] = useState({ firstName: '', lastName: '', specialty: '', phone: '', secondaryPhone: '', username: '', password: '', percentage: '', salaryType: 'none' as 'none' | 'fixed' | 'fixed_kpi' | 'kpi', fixedSalary: '', color: DOCTOR_COLORS[0].value, startHour: '', endHour: '', room: '' });

   // Receptionist Modal State
   const [isReceptionistModalOpen, setIsReceptionistModalOpen] = useState(false);
   const [editingReceptionistId, setEditingReceptionistId] = useState<string | null>(null);
   const [receptionistForm, setReceptionistForm] = useState({ firstName: '', lastName: '', phone: '', username: '', password: '' });

   // LabTechnician Modal State
   const [isLabTechModalOpen, setIsLabTechModalOpen] = useState(false);
   const [editingLabTechId, setEditingLabTechId] = useState<string | null>(null);
   const [labTechForm, setLabTechForm] = useState({ firstName: '', lastName: '', specialty: '', phone: '', username: '', password: '' });

   // Upgrade Plan Modal State
   const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);

   // Delete Confirmation Modals
   const [deleteConfirmDoctor, setDeleteConfirmDoctor] = useState<Doctor | null>(null);
   const [deleteConfirmLabTech, setDeleteConfirmLabTech] = useState<LabTechnician | null>(null);
   const [deleteConfirmReceptionist, setDeleteConfirmReceptionist] = useState<Receptionist | null>(null);



   // General Form State
   const [generalForm, setGeneralForm] = useState({
      clinicName: '',
      address: '',
      phone: '',
      email: '',
      ownerPhone: '',
      startHour: 8,
      endHour: 20,
      enableReceipts: false
   });
   const [generalSaved, setGeneralSaved] = useState(false);

   // Bot Settings State
   const [botToken, setBotToken] = useState(currentClinic?.botToken || '');
   const [botSaved, setBotSaved] = useState(false);
   const [botUsername, setBotUsername] = useState<string | null>(null);

   const [botLogs, setBotLogs] = useState<any[]>([]);
   const [isLoadingLogs, setIsLoadingLogs] = useState(false);

   // Facebook State
   const [facebookPages, setFacebookPages] = useState<any[]>([]);
   const [isFBPageModalOpen, setIsFBPageModalOpen] = useState(false);
   const [isFBLoading, setIsFBLoading] = useState(false);

   // SMS Settings State
   const [smsForm, setSmsForm] = useState({
      notificationMode: 'telegram_only',
      eskizEmail: '',
      eskizPassword: '',
      eskizNick: '4546'
   });
   const [smsConnected, setSmsConnected] = useState(false);
   const [smsHasPassword, setSmsHasPassword] = useState(false);
   const [smsBalance, setSmsBalance] = useState<number | null>(null);
   const [isCheckingSms, setIsCheckingSms] = useState(false);
   const [smsTestPhone, setSmsTestPhone] = useState('');
   const [smsSaved, setSmsSaved] = useState(false);
   
   // DMED Settings State
   const [dmedEnabled, setDmedEnabled] = useState(false);
   const [dmedApiKey, setDmedApiKey] = useState('');
   const [dmedApiSecret, setDmedApiSecret] = useState('');
   const [dmedClinicId, setDmedClinicId] = useState('');
   const [dmedSaved, setDmedSaved] = useState(false);
   const [isCheckingDmed, setIsCheckingDmed] = useState(false);

   // Prepayment Settings State
   const [prepaymentForm, setPrepaymentForm] = useState({
      prepaymentEnabled: false,
      prepaymentCardNumber: '',
      prepaymentAmount: 0,
   });
   const [prepaymentSaved, setPrepaymentSaved] = useState(false);

   // Clinic overall rating calculation
   const clinicAvgRating = useMemo(() => {
      if (!reviews || reviews.length === 0) return 0;
      const total = reviews.reduce((sum, r) => sum + r.rating, 0);
      return total / reviews.length;
   }, [reviews]);

   // Debug: Log botUsername changes
   React.useEffect(() => {
      console.log('🔍 botUsername state changed:', botUsername);
   }, [botUsername]);

   // Sync generalForm with currentClinic
   React.useEffect(() => {
      if (currentClinic) {
         setGeneralForm({
            clinicName: currentClinic.name || '',
            address: (currentClinic as any).address || '',
            phone: currentClinic.phone || '',
            email: (currentClinic as any).email || '',
            ownerPhone: currentClinic.ownerPhone || '',
            startHour: currentClinic.startHour ?? 8,
            endHour: currentClinic.endHour ?? 20,
            enableReceipts: currentClinic.enableReceipts ?? false
         });
      }
   }, [currentClinic]);

   // Sync DMED settings
   React.useEffect(() => {
      if (currentClinic) {
         setDmedEnabled(currentClinic.dmedEnabled || false);
         setDmedApiKey(currentClinic.dmedApiKey || '');
         setDmedApiSecret(currentClinic.dmedApiSecret || '');
         setDmedClinicId(currentClinic.dmedClinicId || '');
      }
   }, [currentClinic]);

   // Sync prepayment settings
   React.useEffect(() => {
      if (currentClinic) {
         setPrepaymentForm({
            prepaymentEnabled: currentClinic.prepaymentEnabled ?? false,
            prepaymentCardNumber: currentClinic.prepaymentCardNumber || '',
            prepaymentAmount: currentClinic.prepaymentAmount ?? 0,
         });
      }
   }, [currentClinic]);

   // Load SMS settings
   React.useEffect(() => {
      const fetchSms = async () => {
         if (currentClinic?.id) {
            try {
               const data = await api.sms.getSettings(currentClinic.id);
               setSmsForm(prev => ({
                  ...prev,
                  notificationMode: data.notificationMode || 'telegram_only',
                  eskizEmail: data.eskizEmail || '',
                  eskizNick: data.eskizNick || '4546'
               }));
               setSmsHasPassword(data.hasPassword);
               setSmsConnected(data.isConnected);

               if (data.isConnected) {
                  const balanceRes = await api.sms.getBalance(currentClinic.id);
                  if (balanceRes.balance !== null) setSmsBalance(balanceRes.balance);
               }
            } catch (err) {
               console.error('Failed to fetch SMS settings', err);
            }
         }
      };
      if (activeTab === 'messaging') {
          fetchSms();
      }
   }, [currentClinic?.id, activeTab]);


   // Fetch bot username when clinic has bot token
   React.useEffect(() => {
      const fetchBotUsername = async () => {
         console.log('Checking bot username...', {
            clinicId: currentClinic?.id,
            hasBotToken: !!currentClinic?.botToken,
            botToken: currentClinic?.botToken?.substring(0, 10) + '...'
         });

         if (currentClinic?.id && currentClinic?.botToken) {
            try {
               const authData = localStorage.getItem('xclinic_auth');
               if (!authData) {
                  console.error('No auth data found');
                  return;
               }

               const token = JSON.parse(authData).token;
               if (!token) {
                  console.error('No token found in auth data');
                  return;
               }

               const response = await fetch(`${API_URL}/clinics/${currentClinic.id}/bot-username`, {
                  headers: {
                     'Authorization': `Bearer ${token}`
                  }
               });

               if (!response.ok) {
                  console.error('Failed to fetch bot username:', response.status, response.statusText);
                  return;
               }

               const data = await response.json();
               console.log('Bot username response:', data);
               if (data.botUsername) {
                  setBotUsername(data.botUsername);
                  console.log('Bot username set:', data.botUsername);
               }
            } catch (err) {
               console.error('Failed to fetch bot username:', err);
            }
         } else {
            console.log('No clinic ID or bot token, clearing username');
            setBotUsername(null);
         }
      };
      fetchBotUsername();
   }, [currentClinic?.id, currentClinic?.botToken]);

   // Handle Facebook Redirect success
   React.useEffect(() => {
       const urlParams = new URLSearchParams(window.location.search);
       if (urlParams.get('connected') === 'true' && urlParams.get('tab') === 'facebook') {
           setActiveTab('facebook');
           handleFetchFBPages();
           // Clear search params
           window.history.replaceState({}, '', window.location.pathname);
       }
   }, []);

   const handleFetchFBPages = async () => {
       if (!currentClinic?.id) return;
       setIsFBLoading(true);
       try {
           const pages = await api.facebook.getPages(currentClinic.id);
           setFacebookPages(pages);
           setIsFBPageModalOpen(true);
       } catch (error) {
           console.error('Failed to fetch FB pages:', error);
           alert('Facebook sahifalarini yuklashda xatolik yuz berdi');
       } finally {
           setIsFBLoading(false);
       }
   };

   const handleConnectFB = async () => {
       if (!currentClinic?.id) return;
       try {
           const { url } = await api.facebook.getAuthUrl(currentClinic.id);
           const width = 700;
           const height = 850;
           const left = Math.max(0, (window.screen.width / 2) - (width / 2));
           const top = Math.max(0, (window.screen.height / 2) - (height / 2));
           window.open(
               url,
               'FacebookLogin',
               `width=${width},height=${height},left=${left},top=${top},status=yes,scrollbars=yes`
           );
       } catch (error) {
           console.error('Failed to get FB auth URL:', error);
           alert('Facebook-ga bog\'lanishda xatolik yuz berdi');
       }
   };

   const handleSelectFBPage = async (page: any) => {
       if (!currentClinic?.id) return;
       try {
           await api.facebook.selectPage({
               clinicId: currentClinic.id,
               pageId: page.id,
               pageAccessToken: page.access_token,
               pageName: page.name
           });
           setIsFBPageModalOpen(false);
           alert('Sahifa muvaffaqiyatli bog\'landi!');
           window.location.reload(); // Refresh to get updated clinic data
       } catch (error) {
           console.error('Failed to select FB page:', error);
           alert('Sahifani saqlashda xatolik yuz berdi');
       }
   };

   const handleDisconnectFB = async () => {
       if (!currentClinic?.id || !window.confirm('Facebook-ni uzmoqchimisiz?')) return;
       try {
           await api.facebook.disconnect(currentClinic.id);
           alert('Facebook muvaffaqiyatli uzildi');
           window.location.reload();
       } catch (error) {
           console.error('Failed to disconnect FB:', error);
       }
   };

   // Categories effect removed as it's now in App.tsx


   // Handlers
   const handleOpenServiceModal = (service?: Service) => {
      if (service) {
         setEditingServiceId(service.id as number);
         setServiceForm({
            name: service.name,
            price: service.price.toString(),
            cost: (service.cost || 0).toString(),
            categoryId: service.categoryId || ''
         });
      } else {
         setEditingServiceId(null);
         setServiceForm({ name: '', price: '', cost: '', categoryId: selectedCategory || '' });
      }
      setIsServiceModalOpen(true);
   };

   const handleServiceSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      const data = {
         name: serviceForm.name,
         price: Number(serviceForm.price),
         cost: Number(serviceForm.cost) || 0,
         duration: 60,
         categoryId: serviceForm.categoryId || undefined
      };

      if (editingServiceId !== null) {
         const realIndex = services.findIndex(s => s.id === editingServiceId);
         if (realIndex !== -1) onUpdateService(realIndex, data);
      } else {
         onAddService(data);
      }
      setIsServiceModalOpen(false);
   };

   const handleCategorySubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      onAddCategory({ name: categoryForm.name });
      setCategoryForm({ name: '' });
      setIsCategoryModalOpen(false);
   };

   const handleDeleteCategory = async (id: string) => {
      if (!window.confirm('Kategoriyani o\'chirmoqchimisiz?')) return;
      onDeleteCategory(id);
      if (selectedCategory === id) setSelectedCategory(null);
   };

   const handleOpenDoctorModal = (doctor?: Doctor) => {
      if (!doctor) {
         // Adding new doctor - check limit
         const currentPlanId = currentClinic?.planId;
         const currentPlan = plans?.find(p => p.id === currentPlanId);
         const maxDoctors = currentPlan?.maxDoctors || 10;

         if (doctors.length >= maxDoctors) {
            setIsUpgradeModalOpen(true);
            return;
         }
      }

      if (doctor) {
         setEditingDoctorId(doctor.id);
         setDoctorForm({
            firstName: doctor.firstName,
            lastName: doctor.lastName,
            specialty: doctor.specialty,
            phone: doctor.phone,
            secondaryPhone: doctor.secondaryPhone || '',
            username: doctor.username || '',
            password: '',
            percentage: (doctor.percentage || 0).toString(),
            salaryType: (doctor.salaryType || 'none') as 'none' | 'fixed' | 'fixed_kpi' | 'kpi',
            fixedSalary: (doctor.fixedSalary || 0).toString(),
            color: doctor.color || DOCTOR_COLORS[0].value,
            startHour: doctor.startHour != null ? String(doctor.startHour) : '',
            endHour: doctor.endHour != null ? String(doctor.endHour) : '',
            room: doctor.room || '',
         });
      } else {
         setEditingDoctorId(null);
         setDoctorForm({ firstName: '', lastName: '', specialty: '', phone: '', secondaryPhone: '', username: '', password: '', percentage: '', salaryType: 'none', fixedSalary: '', color: DOCTOR_COLORS[0].value, startHour: '', endHour: '', room: '' });
      }
      setIsDoctorModalOpen(true);
   };

   const handleDoctorSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (editingDoctorId) {
         const updateData: any = { ...doctorForm };
         if (!updateData.password) delete updateData.password;
         updateData.percentage = Number(updateData.percentage) || 0;
         updateData.fixedSalary = Number(updateData.fixedSalary) || 0;
         updateData.startHour = doctorForm.startHour !== '' ? Number(doctorForm.startHour) : null;
         updateData.endHour = doctorForm.endHour !== '' ? Number(doctorForm.endHour) : null;
         onUpdateDoctor(editingDoctorId, updateData);
      } else {
         onAddDoctor({
            ...doctorForm,
            percentage: Number(doctorForm.percentage) || 0,
            fixedSalary: Number(doctorForm.fixedSalary) || 0,
            startHour: doctorForm.startHour !== '' ? Number(doctorForm.startHour) : null,
            endHour: doctorForm.endHour !== '' ? Number(doctorForm.endHour) : null,
            status: 'Active'
         });
      }
      setIsDoctorModalOpen(false);
   };

   const handleOpenReceptionistModal = (receptionist?: Receptionist) => {
      if (receptionist) {
         setEditingReceptionistId(receptionist.id);
         setReceptionistForm({
            firstName: receptionist.firstName,
            lastName: receptionist.lastName,
            phone: receptionist.phone,
            username: receptionist.username,
            password: ''
         });
      } else {
         setEditingReceptionistId(null);
         setReceptionistForm({ firstName: '', lastName: '', phone: '', username: '', password: '' });
      }
      setIsReceptionistModalOpen(true);
   };

   const handleReceptionistSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (editingReceptionistId) {
         if (onUpdateReceptionist) {
            const updateData: any = { ...receptionistForm };
            if (!updateData.password) {
               delete updateData.password;
            }
            onUpdateReceptionist(editingReceptionistId, updateData);
         }
      } else {
         if (onAddReceptionist) {
            onAddReceptionist({
               ...receptionistForm,
               status: 'Active',
               clinicId: currentClinic?.id || ''
            });
         }
      }
      setIsReceptionistModalOpen(false);
   };

   const handleOpenLabTechModal = (tech?: LabTechnician) => {
      if (tech) {
         setEditingLabTechId(tech.id);
         setLabTechForm({
            firstName: tech.firstName,
            lastName: tech.lastName,
            specialty: tech.specialty,
            phone: tech.phone,
            username: tech.username || '',
            password: ''
         });
      } else {
         setEditingLabTechId(null);
         setLabTechForm({ firstName: '', lastName: '', specialty: '', phone: '', username: '', password: '' });
      }
      setIsLabTechModalOpen(true);
   };

   const handleLabTechSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      const data: any = {
         firstName: labTechForm.firstName,
         lastName: labTechForm.lastName,
         specialty: labTechForm.specialty,
         phone: labTechForm.phone,
         username: labTechForm.username || undefined,
      };
      if (labTechForm.password) data.password = labTechForm.password;
      if (editingLabTechId) {
         if (onUpdateLabTechnician) onUpdateLabTechnician(editingLabTechId, data);
      } else {
         if (onAddLabTechnician) onAddLabTechnician(data);
      }
      setIsLabTechModalOpen(false);
   };

   const handleSmsSave = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!currentClinic?.id) return;

      try {
         await api.sms.saveSettings(currentClinic.id, {
            notificationMode: smsForm.notificationMode,
            eskizEmail: smsForm.eskizEmail,
            eskizPassword: smsForm.eskizPassword || undefined,
            eskizNick: smsForm.eskizNick || '4546'
         });
         
         setSmsSaved(true);
         setTimeout(() => setSmsSaved(false), 3000);
         
         // Reload settings to get updated state
         const data = await api.sms.getSettings(currentClinic.id);
         setSmsConnected(data.isConnected);
         setSmsHasPassword(data.hasPassword);
         
         setSmsForm(prev => ({ ...prev, eskizPassword: '' }));
         
         if (data.isConnected) {
             const balanceRes = await api.sms.getBalance(currentClinic.id);
             if (balanceRes.balance !== null) setSmsBalance(balanceRes.balance);
         }
      } catch (error: any) {
         console.error('Failed to save SMS settings:', error);
         alert(error.message || t('common.error'));
      }
   };

   const handleSmsTest = async () => {
      if (!currentClinic?.id || !smsTestPhone) return;
      setIsCheckingSms(true);
      try {
         const res = await api.sms.testSend(currentClinic.id, smsTestPhone);
         if (res.success) {
            alert('Test SMS muvaffaqiyatli yuborildi!');
         }
      } catch (error: any) {
         alert(error.message || 'SMS yuborishda xatolik yuz berdi. Sozlamalarni tekshiring.');
      } finally {
         setIsCheckingSms(false);
      }
   };

   const handleDmedSave = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!currentClinic?.id) return;
      try {
         await api.clinics.updateDmedSettings(currentClinic.id, {
            dmedEnabled,
            dmedApiKey,
            dmedApiSecret,
            dmedClinicId
         });
         setDmedSaved(true);
         setTimeout(() => setDmedSaved(false), 3000);
         window.location.reload(); 
      } catch (error) {
         console.error('Failed to save DMED settings:', error);
         alert('DMED sozlamalarini saqlashda xatolik yuz berdi');
      }
   };

   const handleDmedTest = async () => {
      if (!currentClinic?.id) return;
      setIsCheckingDmed(true);
      try {
         const res = await api.clinics.testDmed(currentClinic.id, {
            dmedApiKey,
            dmedApiSecret
         });
         if (res.valid) {
            alert('DMED ulanishi muvaffaqiyatli!');
         } else {
            alert('Ulanishda xatolik: ' + ((res as any).error || 'Noma\'lum xatolik'));
         }
      } catch (error: any) {
         alert('DMED test xatosi: ' + error.message);
      } finally {
         setIsCheckingDmed(false);
      }
   };

   const handleGeneralSave = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!currentClinic?.id) return;

      try {
         const response = await api.clinics.updateGeneral(currentClinic.id, {
            name: generalForm.clinicName,
            address: generalForm.address,
            phone: generalForm.phone,
            email: generalForm.email,
            ownerPhone: generalForm.ownerPhone,
            startHour: Number(generalForm.startHour),
            endHour: Number(generalForm.endHour),
            enableReceipts: generalForm.enableReceipts
         });

         if (response && response.id) {
            setGeneralSaved(true);
            setTimeout(() => {
               setGeneralSaved(false);
               window.location.reload();
            }, 1000);
         }
      } catch (error) {
         console.error('Failed to save general settings:', error);
         alert(t('common.error'));
      }
   };

   const handleBotSave = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!currentClinic?.id) return;

      try {
         await api.clinics.updateSettings(currentClinic.id, { botToken });
         setBotSaved(true);
         setTimeout(() => {
            setBotSaved(false);
            window.location.reload();
         }, 1000);
      } catch (error) {
         console.error('Failed to save bot settings:', error);
         alert(t('common.error'));
      }
   };

   const handlePrepaymentSave = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!currentClinic?.id) return;
      try {
         await api.clinics.savePrepaymentSettings(currentClinic.id, {
            prepaymentEnabled: prepaymentForm.prepaymentEnabled,
            prepaymentCardNumber: prepaymentForm.prepaymentCardNumber,
            prepaymentAmount: Number(prepaymentForm.prepaymentAmount),
         });
         setPrepaymentSaved(true);
         setTimeout(() => setPrepaymentSaved(false), 2000);
      } catch (error) {
         console.error('Failed to save prepayment settings:', error);
         alert(t('common.error'));
      }
   };

   if (userRole === UserRole.DOCTOR) {
      return (
         <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('settings.general.myProfile')}</h1>
            <Card className="p-6">
               <div className="flex items-center gap-6 mb-6">
                  <div className="h-20 w-20 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                     <User className="w-10 h-10 text-gray-400" />
                  </div>
                  <div>
                     <Button variant="secondary" size="sm">{t('settings.general.changePhoto')}</Button>
                  </div>
               </div>
               <form className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                     <Input label={t('settings.staff.firstName')} defaultValue="Alisher" />
                     <Input label={t('settings.staff.lastName')} defaultValue="Sobirov" />
                  </div>
                  <Input label={t('settings.general.email')} type="email" defaultValue="dr.sobirov@clinic.com" />
                  <Input label={t('settings.staff.specialty')} disabled defaultValue="Terapevt" />
                  <div className="pt-4">
                     <Button onClick={(e) => { e.preventDefault(); alert(t('settings.general.saved')); }}>{t('common.save')}</Button>
                  </div>
               </form>
            </Card>
         </div>
      );
   }

   /* ─── Xizmat ko'rsatish: sxema va zaxira nusxa ─────────────────────────
      Yuklash/xato holatlari alohida saqlanadi: bitta umumiy `loading` bo'lsa,
      nusxa olish paytida butun sahifa muzlab qolardi. */
   const [schemaInfo, setSchemaInfo] = useState<any>(null);
   const [backupList, setBackupList] = useState<any[]>([]);
   const [restoreState, setRestoreState] = useState<{ staged: boolean; file?: string; stagedAt?: string; byName?: string | null } | null>(null);
   const [maintLoading, setMaintLoading] = useState(false);
   const [maintError, setMaintError] = useState('');
   const [backupBusy, setBackupBusy] = useState(false);
   const [backupNote, setBackupNote] = useState('');
   const [restoreTarget, setRestoreTarget] = useState<any>(null);
   const [restoreConfirmText, setRestoreConfirmText] = useState('');

   const loadMaintenance = React.useCallback(async () => {
      setMaintLoading(true);
      setMaintError('');
      try {
         const [sch, list, rst] = await Promise.all([
            api.maintenance.schemaStatus(),
            api.maintenance.backups(),
            api.maintenance.restoreState(),
         ]);
         setSchemaInfo(sch);
         setBackupList(list);
         setRestoreState(rst);
      } catch (e: any) {
         setMaintError(e?.message || 'Ma\'lumotni yuklab bo\'lmadi');
      } finally {
         setMaintLoading(false);
      }
   }, []);

   React.useEffect(() => {
      if (activeTab === 'maintenance' && userRole === UserRole.CLINIC_ADMIN) loadMaintenance();
   }, [activeTab, userRole, loadMaintenance]);

   const handleCreateBackup = async () => {
      setBackupBusy(true);
      setMaintError('');
      try {
         await api.maintenance.createBackup(backupNote);
         setBackupNote('');
         await loadMaintenance();
      } catch (e: any) {
         setMaintError(e?.message || 'Nusxa olinmadi');
      } finally {
         setBackupBusy(false);
      }
   };

   const handleStageRestore = async () => {
      if (!restoreTarget) return;
      setBackupBusy(true);
      setMaintError('');
      try {
         await api.maintenance.stageRestore(restoreTarget.file);
         setRestoreTarget(null);
         setRestoreConfirmText('');
         await loadMaintenance();
      } catch (e: any) {
         setMaintError(e?.message || 'Tiklashni belgilab bo\'lmadi');
      } finally {
         setBackupBusy(false);
      }
   };

   const handleCancelRestore = async () => {
      setBackupBusy(true);
      try {
         await api.maintenance.cancelRestore();
         await loadMaintenance();
      } catch (e: any) {
         setMaintError(e?.message || 'Bekor qilib bo\'lmadi');
      } finally {
         setBackupBusy(false);
      }
   };

   const fmtBytes = (n: number) => n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`;
   const fmtWhen = (iso: string) => {
      try { return new Date(iso).toLocaleString('uz-UZ'); } catch { return iso; }
   };

   /* ─── Bo'limlar ────────────────────────────────────────────────────────
      Ilgari bo'limlarni faqat seed yaratardi: klinika yangi bo'lim qo'sha
      olmasdi, nomini tuzata olmasdi, yopilganini o'chira olmasdi. */
   const [deptList, setDeptList] = useState<any[]>([]);
   const [deptLoading, setDeptLoading] = useState(false);
   const [deptError, setDeptError] = useState('');
   const [deptBusy, setDeptBusy] = useState(false);
   const [deptModal, setDeptModal] = useState<null | { mode: 'create' | 'edit'; data: any }>(null);
   const [deptForm, setDeptForm] = useState({ name: '', code: '', type: 'CLINICAL', color: '', sortOrder: '0' });

   const loadDepartments = React.useCallback(async () => {
      setDeptLoading(true);
      setDeptError('');
      try {
         setDeptList(await api.departments.getAll());
      } catch (e: any) {
         setDeptError(e?.message || 'Bo\'limlarni yuklab bo\'lmadi');
      } finally {
         setDeptLoading(false);
      }
   }, []);

   React.useEffect(() => {
      if (activeTab === 'departments' && userRole === UserRole.CLINIC_ADMIN) loadDepartments();
   }, [activeTab, userRole, loadDepartments]);

   const openDeptCreate = () => {
      setDeptForm({ name: '', code: '', type: 'CLINICAL', color: DEPT_COLORS[0].value, sortOrder: String((deptList.length + 1) * 10) });
      setDeptModal({ mode: 'create', data: null });
   };

   const openDeptEdit = (d: any) => {
      setDeptForm({
         name: d.name || '',
         code: d.code || '',
         type: d.type || 'CLINICAL',
         color: d.color || DEPT_COLORS[0].value,
         sortOrder: String(d.sortOrder ?? 0),
      });
      setDeptModal({ mode: 'edit', data: d });
   };

   const saveDepartment = async () => {
      if (!deptForm.name.trim() || !deptForm.code.trim()) return;
      setDeptBusy(true);
      setDeptError('');
      try {
         const payload = {
            name: deptForm.name.trim(),
            code: deptForm.code.trim().toUpperCase(),
            type: deptForm.type,
            color: deptForm.color || null,
            sortOrder: Number(deptForm.sortOrder) || 0,
         };
         if (deptModal?.mode === 'edit' && deptModal.data) {
            await api.departments.update(deptModal.data.id, payload as any);
         } else {
            await api.departments.create(payload as any);
         }
         setDeptModal(null);
         await loadDepartments();
      } catch (e: any) {
         setDeptError(e?.message || 'Saqlab bo\'lmadi');
      } finally {
         setDeptBusy(false);
      }
   };

   /* O'chirish EMAS, faolsizlantirish: eski qabullar bo'limga bog'langan va
      ular tarixdan yo'qolmasligi kerak. Backend ham shunday ishlaydi. */
   const toggleDepartmentActive = async (d: any) => {
      setDeptBusy(true);
      setDeptError('');
      try {
         if (d.isActive) {
            await api.departments.deactivate(d.id);
         } else {
            await api.departments.update(d.id, { isActive: true } as any);
         }
         await loadDepartments();
      } catch (e: any) {
         setDeptError(e?.message || 'O\'zgartirib bo\'lmadi');
      } finally {
         setDeptBusy(false);
      }
   };

   return (
      <div className="space-y-6 animate-fade-in">
         <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('settings.title')}</h1>

         <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Sidebar Tabs */}
            <Card className="col-span-1 h-fit p-2">
               {[
                  { id: 'general', name: t('settings.tabs.general'), icon: User },
                  { id: 'services', name: t('settings.tabs.services'), icon: DollarSign },
                  { id: 'doctors', name: t('settings.tabs.doctors'), icon: Users },
                  { id: 'receptionists', name: t('settings.tabs.receptionists'), icon: Phone },
                  { id: 'labTechnicians', name: t('settings.tabs.labTechnicians'), icon: FlaskConical },
                  { id: 'messaging', name: "SMS va Telegram", icon: MessageSquare },
                  { id: 'dmed', name: "DMED (IT-MED)", icon: Activity },
                  // Kalitni faqat klinika egasi ko'radi — backend ham shu rolni talab qiladi.
                  ...(userRole === UserRole.CLINIC_ADMIN ? [{ id: 'leadApi', name: 'Lid integratsiyasi', icon: Link2 }] : []),
                  ...(userRole === UserRole.CLINIC_ADMIN ? [{ id: 'access', name: 'Ruxsatlar', icon: Shield }] : []),
                  ...(userRole === UserRole.CLINIC_ADMIN ? [{ id: 'departments', name: 'Bo’limlar', icon: Building2 }] : []),
                  ...(userRole === UserRole.CLINIC_ADMIN ? [{ id: 'maintenance', name: 'Xizmat ko’rsatish', icon: HardDrive }] : []),
               ].map((item) => (
                  <button
                     key={item.id}
                     onClick={() => setActiveTab(item.id as any)}
                     className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-md transition-colors 
                   ${activeTab === item.id
                           ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
                           : 'text-gray-600 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800'
                        }`}
                  >
                     <item.icon className="w-4 h-4" />
                     {item.name}
                  </button>
               ))}
            </Card>

            <div className="lg:col-span-3 space-y-6">

                {/* General Tab */}
               {activeTab === 'general' && (
                  <div className="space-y-6">
                     <Card className="p-6">
                        <div className="flex items-center justify-between">
                           <div>
                              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{t('settings.general.rating')}</p>
                              <h3 className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                                 {clinicAvgRating > 0 ? clinicAvgRating.toFixed(1) : '0.0'}
                              </h3>
                           </div>
                           <div className="p-3 bg-yellow-50 dark:bg-yellow-900/30 rounded-full">
                              <Star className="w-6 h-6 text-yellow-500 fill-current" />
                           </div>
                        </div>
                        <div className="mt-4 flex items-center text-sm text-gray-500">
                           <span className="font-medium text-yellow-600 mr-2 flex items-center">
                              {[...Array(5)].map((_, i) => (
                                 <Star key={i} className={`w-3 h-3 ${i < Math.round(clinicAvgRating) ? 'fill-current' : 'text-gray-200'}`} />
                              ))}
                           </span>
                           {reviews.length} {t('settings.general.reviewsSuffix')}
                        </div>
                     </Card>

                     <Card className="p-6">
                        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-6">{t('settings.general.info')}</h3>
                        <form onSubmit={handleGeneralSave} className="space-y-4">
                           <Input label={t('settings.general.clinicName')} value={generalForm.clinicName} onChange={e => setGeneralForm({ ...generalForm, clinicName: e.target.value })} />
                           <Input label={t('settings.general.address')} value={generalForm.address} onChange={e => setGeneralForm({ ...generalForm, address: e.target.value })} />
                           <div className="grid grid-cols-2 gap-4">
                              <Input label={t('settings.general.phone')} value={generalForm.phone} onChange={e => setGeneralForm({ ...generalForm, phone: e.target.value })} />
                              <Input label={t('settings.general.email')} value={generalForm.email} onChange={e => setGeneralForm({ ...generalForm, email: e.target.value })} />
                           </div>
                           <Input
                              label={t('settings.general.ownerPhone')}
                              value={generalForm.ownerPhone}
                              onChange={e => setGeneralForm({ ...generalForm, ownerPhone: e.target.value })}
                              placeholder="998901234567"
                              helperText={t('settings.general.ownerPhoneHelp')}
                           />
                           <div className="grid grid-cols-2 gap-4 mt-4">
                              <div>
                                 <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Ishni boshlash vaqti</label>
                                 <Select
                                    value={generalForm.startHour.toString()}
                                    onChange={e => setGeneralForm({ ...generalForm, startHour: parseInt(e.target.value) })}
                                    options={Array.from({ length: 24 }, (_, i) => ({ value: i.toString(), label: `${i.toString().padStart(2, '0')}:00` }))}
                                 />
                              </div>
                              <div>
                                 <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Ishni tugash vaqti</label>
                                 <Select
                                    value={generalForm.endHour.toString()}
                                    onChange={e => setGeneralForm({ ...generalForm, endHour: parseInt(e.target.value) })}
                                    options={Array.from({ length: 24 }, (_, i) => ({ value: i.toString(), label: `${i.toString().padStart(2, '0')}:00` }))}
                                 />
                              </div>
                           </div>
                           
                           {/* Receipt Printing Toggle */}
                           <div className="pt-2">
                              <label className="flex items-center space-x-3 cursor-pointer">
                                 <input
                                    type="checkbox"
                                    checked={generalForm.enableReceipts}
                                    onChange={(e) => setGeneralForm({ ...generalForm, enableReceipts: e.target.checked })}
                                    className="w-5 h-5 text-primary-600 border-gray-300 rounded focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700"
                                 />
                                 <div>
                                    <p className="text-sm font-medium text-gray-900 dark:text-white">Chek chiqarish funksiyasi</p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">Yoqilsa, to'lov qabul qilinganda avtomatik ravishda chek oynasi ochiladi.</p>
                                 </div>
                              </label>
                           </div>

                           <div className="pt-4 flex items-center gap-4">
                              <Button type="submit">{t('common.save')}</Button>
                              {generalSaved && <span className="text-green-600 text-sm flex items-center"><CheckCircle className="w-4 h-4 mr-1" /> {t('settings.general.saved')}</span>}
                           </div>
                        </form>
                     </Card>

                     {/* Prepayment Settings Card */}
                     <Card className="p-6">
                        <div className="flex items-center gap-4 mb-6">
                           <div className="p-3 bg-emerald-100 dark:bg-emerald-900/40 rounded-xl text-emerald-600 dark:text-emerald-400">
                              <DollarSign className="w-8 h-8" />
                           </div>
                           <div>
                              <h3 className="text-xl font-bold text-gray-900 dark:text-white">Oldindan To'lov (Bron uchun)</h3>
                              <p className="text-sm text-gray-500">Bemor bot orqali qabulga yozilganda oldindan to'lov talab qilish.</p>
                           </div>
                        </div>

                        <form onSubmit={handlePrepaymentSave} className="space-y-5">
                           <div className="bg-gray-50 dark:bg-gray-800/50 p-5 rounded-2xl border border-gray-100 dark:border-gray-700">
                              <label className="flex items-center justify-between cursor-pointer">
                                 <div>
                                    <p className="text-sm font-semibold text-gray-900 dark:text-white">Oldindan to'lovni yoqish</p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Yoqilsa, bemor qabulga yozilgandan keyin to'lov cheki yuborishi shart bo'ladi</p>
                                 </div>
                                 <div className="relative w-12 h-6 flex-shrink-0">
                                    <input
                                       type="checkbox"
                                       className="sr-only"
                                       checked={prepaymentForm.prepaymentEnabled}
                                       onChange={(e) => setPrepaymentForm({ ...prepaymentForm, prepaymentEnabled: e.target.checked })}
                                    />
                                    <div className={`w-12 h-6 rounded-full transition-colors ${prepaymentForm.prepaymentEnabled ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'}`}>
                                       <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${prepaymentForm.prepaymentEnabled ? 'translate-x-6' : 'translate-x-0'}`} />
                                    </div>
                                 </div>
                              </label>
                           </div>

                           {prepaymentForm.prepaymentEnabled && (
                              <div className="space-y-4">
                                 <Input
                                    label="Karta raqami"
                                    value={prepaymentForm.prepaymentCardNumber}
                                    onChange={(e) => setPrepaymentForm({ ...prepaymentForm, prepaymentCardNumber: e.target.value })}
                                    placeholder="8600 1234 5678 9012"
                                 />
                                 <Input
                                    label="Bron summasi (so'm)"
                                    type="number"
                                    value={prepaymentForm.prepaymentAmount === 0 ? '' : String(prepaymentForm.prepaymentAmount)}
                                    onChange={(e) => setPrepaymentForm({ ...prepaymentForm, prepaymentAmount: Number(e.target.value) })}
                                    placeholder="50000"
                                 />
                                 <p className="text-xs text-gray-500 dark:text-gray-400">
                                    Bemor to'lov chekini (rasm yoki fayl) telegram bot orqali yuborganda, bu chek admin telegram chatiga avtomatik yuboriladi.
                                 </p>
                              </div>
                           )}

                           <div className="flex items-center gap-4">
                              <Button type="submit" variant="primary">Saqlash</Button>
                              {prepaymentSaved && (
                                 <span className="text-green-600 text-sm flex items-center gap-1">
                                    <CheckCircle className="w-4 h-4" /> Saqlandi
                                 </span>
                              )}
                           </div>
                        </form>
                     </Card>
                  </div>
               )}

               {/* DMED Tab */}
               {activeTab === 'dmed' && (
                  <div className="space-y-6">
                     <Card className="p-6">
                        <div className="flex items-center gap-4 mb-6">
                           <div className="p-3 bg-indigo-100 dark:bg-indigo-900/40 rounded-xl text-indigo-600 dark:text-indigo-400">
                              <Activity className="w-8 h-8" />
                           </div>
                           <div>
                              <h3 className="text-xl font-bold text-gray-900 dark:text-white">DMED (IT-MED) Integratsiyasi</h3>
                              <p className="text-sm text-gray-500">O'zbekiston milliy tibbiy axborot tizimi bilan bog'lanish va ma'lumotlarni sinxronizatsiya qilish.</p>
                           </div>
                        </div>

                        <div className="bg-primary-50 dark:bg-primary-900/20 p-4 rounded-lg border border-primary-100 dark:border-primary-800/40 mb-6">
                           <p className="text-sm text-primary-800 dark:text-primary-200">
                              <strong>Eslatma:</strong> DMED tizimiga ulanish uchun klinika rasmiy ravishda SSV (Uzinfocom) orqali Client ID va Client Secret kalitlarini olgan bo'lishi shart.
                           </p>
                        </div>

                        <form onSubmit={handleDmedSave} className="space-y-6">
                           <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
                              <div>
                                 <h4 className="font-medium text-gray-900 dark:text-white">DMED Integratsiyasini yoqish</h4>
                                 <p className="text-sm text-gray-500">Agar yoqilsa, bemorlar profilida DMED ma'lumotlari paydo bo'ladi.</p>
                              </div>
                              <label className="relative inline-flex items-center cursor-pointer">
                                 <input 
                                    type="checkbox" 
                                    className="sr-only peer" 
                                    checked={dmedEnabled}
                                    onChange={(e) => setDmedEnabled(e.target.checked)}
                                 />
                                 <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 dark:peer-focus:ring-indigo-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-indigo-600"></div>
                              </label>
                           </div>

                           <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <Input 
                                 label="DMED Client ID (API Key)" 
                                 value={dmedApiKey} 
                                 onChange={e => setDmedApiKey(e.target.value)} 
                                 placeholder="Masalan: denta_clinic_123"
                                 disabled={!dmedEnabled}
                              />
                              <Input 
                                 label="DMED Client Secret" 
                                 value={dmedApiSecret} 
                                 onChange={e => setDmedApiSecret(e.target.value)} 
                                 type="password"
                                 placeholder="••••••••••••••••"
                                 disabled={!dmedEnabled}
                              />
                           </div>
                           
                           <Input 
                              label="Klinika ID (DMED tizimidagi)" 
                              value={dmedClinicId} 
                              onChange={e => setDmedClinicId(e.target.value)} 
                              placeholder="Masalan: 69213aa6-b1f2-11ee-9cc3..."
                              disabled={!dmedEnabled}
                           />

                           <div className="flex items-center gap-4 pt-4">
                              <Button type="submit" disabled={!dmedEnabled}>
                                 {t('common.save')}
                              </Button>
                              <Button 
                                 type="button" 
                                 variant="secondary" 
                                 onClick={handleDmedTest}
                                 disabled={!dmedEnabled || isCheckingDmed || !dmedApiKey || !dmedApiSecret}
                              >
                                 {isCheckingDmed ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : null}
                                 Ulanishni tekshirish
                              </Button>
                              {dmedSaved && <span className="text-green-600 text-sm flex items-center"><CheckCircle className="w-4 h-4 mr-1" /> {t('settings.general.saved')}</span>}
                           </div>
                        </form>
                     </Card>
                  </div>
               )}

               {/* Services Tab */}
               {/* Access Control Tab — faqat klinika admini */}
               {activeTab === 'leadApi' && userRole === UserRole.CLINIC_ADMIN && (
                  <div className="space-y-6">
                     <Card className="p-6">
                        <div className="flex items-center gap-3 mb-2">
                           <div className="p-2 bg-primary-50 dark:bg-primary-900/30 rounded-lg">
                              <Link2 className="w-5 h-5 text-primary-600 dark:text-primary-300" />
                           </div>
                           <h3 className="text-xl font-bold text-gray-900 dark:text-white">Lid integratsiyasi</h3>
                        </div>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                           yuboraman.uz va shunga o'xshash manbalar lidlarni to'g'ridan-to'g'ri CRM'ga yuborishi uchun
                           quyidagi manzil va kalitni ularga bering. Lid tushishi bilan «Lidlar» bo'limida paydo bo'ladi
                           va Telegram bot orqali xabar keladi.
                        </p>

                        {/* Endpoint */}
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">So'rov manzili (endpoint)</label>
                        <div className="flex gap-2 mb-5">
                           <code className="flex-1 px-3 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-gray-100 break-all">
                              POST {leadApiInfo?.endpoint || '—'}
                           </code>
                           <Button
                              variant="secondary"
                              onClick={() => leadApiInfo?.endpoint && copyLeadValue(leadApiInfo.endpoint, 'endpoint')}
                              disabled={!leadApiInfo?.endpoint}
                           >
                              {leadCopied === 'endpoint' ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                           </Button>
                        </div>

                        {/* API kalit */}
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">API kalit (X-API-Key)</label>
                        {leadApiInfo?.apiKey ? (
                           <>
                              <div className="flex gap-2">
                                 <code className="flex-1 px-3 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-gray-100 break-all">
                                    {leadKeyVisible
                                       ? leadApiInfo.apiKey
                                       : `${leadApiInfo.apiKey.slice(0, 8)}${'•'.repeat(24)}${leadApiInfo.apiKey.slice(-4)}`}
                                 </code>
                                 <Button variant="secondary" onClick={() => setLeadKeyVisible(v => !v)}>
                                    {leadKeyVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                 </Button>
                                 <Button variant="secondary" onClick={() => copyLeadValue(leadApiInfo.apiKey as string, 'key')}>
                                    {leadCopied === 'key' ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                                 </Button>
                              </div>
                              {leadApiInfo.createdAt && (
                                 <p className="text-xs text-gray-400 mt-2">
                                    Yaratilgan: {new Date(leadApiInfo.createdAt).toLocaleString('uz-UZ')}
                                 </p>
                              )}
                              <div className="flex flex-wrap gap-2 mt-4">
                                 <Button variant="secondary" onClick={handleGenerateLeadKey} disabled={leadApiLoading}>
                                    <RefreshCw className={`w-4 h-4 mr-2 ${leadApiLoading ? 'animate-spin' : ''}`} />
                                    Yangi kalit yaratish
                                 </Button>
                                 <Button variant="danger" onClick={handleRevokeLeadKey} disabled={leadApiLoading}>
                                    <Trash2 className="w-4 h-4 mr-2" />
                                    Kalitni o'chirish
                                 </Button>
                              </div>
                              <p className="text-xs text-amber-600 dark:text-amber-400 mt-3">
                                 ⚠️ Kalitni faqat ishonchli hamkorga bering — u bilan klinikangizga lid yozish mumkin.
                              </p>
                           </>
                        ) : (
                           <div className="p-5 border border-dashed border-gray-300 dark:border-gray-700 rounded-lg text-center">
                              <KeyRound className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                              <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                                 Kalit hali yaratilmagan.
                              </p>
                              <Button onClick={handleGenerateLeadKey} disabled={leadApiLoading}>
                                 <Plus className="w-4 h-4 mr-2" />
                                 Kalit yaratish
                              </Button>
                           </div>
                        )}
                     </Card>

                     {/* Texnik ma'lumot — odatda kerak emas, shuning uchun yig'ib qo'yilgan.
                         yuboraman.uz'da XClinic allaqachon ulangan, kalitni kiritish yetarli.
                         Bu bo'lim klinikaning o'z dasturchisi yoki boshqa xizmat uchun qoldirilgan. */}
                     <Card className="p-6">
                        <button
                           onClick={() => setLeadDocsOpen(v => !v)}
                           className="w-full flex items-center justify-between gap-3 text-left"
                        >
                           <div>
                              <h4 className="text-lg font-semibold text-gray-900 dark:text-white">Texnik ma'lumot</h4>
                              <p className="text-sm text-gray-500 dark:text-gray-400">
                                 Odatda kerak emas — kalitni kiritish yetarli. Boshqa xizmat ulanmoqchi bo'lsa kerak bo'ladi.
                              </p>
                           </div>
                           <ChevronDown className={`w-5 h-5 text-gray-400 flex-shrink-0 transition-transform ${leadDocsOpen ? 'rotate-180' : ''}`} />
                        </button>

                        {leadDocsOpen && (<>
                        <pre className="mt-4 p-4 bg-gray-900 text-gray-100 rounded-lg text-xs overflow-x-auto leading-relaxed">
{`POST ${leadApiInfo?.endpoint || 'https://<server>/api/public/leads'}
Content-Type: application/json
X-API-Key: ${leadKeyVisible && leadApiInfo?.apiKey ? leadApiInfo.apiKey : '<sizga berilgan kalit>'}

{
  "name": "Ali Valiyev",
  "phone": "+998901234567",
  "service": "Implantatsiya",
  "manzil": "Toshkent, Chilonzor 5",
  "yosh": "34"
}`}
                        </pre>

                        <div className="mt-5 space-y-2 text-sm text-gray-600 dark:text-gray-400">
                           <p><b className="text-gray-900 dark:text-white">phone</b> — yagona majburiy maydon. Qolgani ixtiyoriy.</p>
                           <p>
                              <b className="text-gray-900 dark:text-white">Tanish maydonlar:</b> name/ism/fio, phone/telefon,
                              service/xizmat, source/manba, address/manzil, dob/tug'ilgan sana, notes/izoh.
                           </p>
                           <p>
                              <b className="text-gray-900 dark:text-white">Boshqa har qanday maydon</b> ham qabul qilinadi —
                              u lid kartasida alohida qator bo'lib ko'rinadi. Ya'ni target formasidagi savollar
                              o'zgarsa ham, bizga qayta sozlash kerak emas.
                           </p>
                           <p>
                              Javob: muvaffaqiyatli bo'lsa <code className="px-1 bg-gray-100 dark:bg-gray-800 rounded">201</code> va lid <code className="px-1 bg-gray-100 dark:bg-gray-800 rounded">id</code> si.
                              15 daqiqa ichida shu raqamdan takroriy lid kelsa, <code className="px-1 bg-gray-100 dark:bg-gray-800 rounded">duplicate: true</code> qaytadi va yangi yozuv yaratilmaydi.
                           </p>
                        </div>
                        </>)}
                     </Card>
                  </div>
               )}

               {/* Bo'limlar — ko'p profilli klinikaning asosiy o'qi */}
               {activeTab === 'departments' && userRole === UserRole.CLINIC_ADMIN && (
                  <div className="space-y-6">
                     <Card className="p-6">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-2">
                           <div className="flex items-center gap-3 flex-1">
                              <div className="p-2 bg-primary-50 dark:bg-primary-900/30 rounded-lg">
                                 <Building2 className="w-5 h-5 text-primary-600 dark:text-primary-300" />
                              </div>
                              <h3 className="text-xl font-bold text-gray-900 dark:text-white">Bo'limlar</h3>
                           </div>
                           <Button onClick={openDeptCreate} disabled={deptBusy}>
                              <Plus className="w-4 h-4 mr-1.5" /> Bo'lim qo'shish
                           </Button>
                        </div>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
                           Shifokorlar, xizmatlar, qabullar va kalendar bo'limga bog'lanadi.
                           Bo'lim turi qaysi ekranda ko'rinishini belgilaydi: registratura faqat
                           klinik bo'limlarni ko'rsatadi.
                        </p>

                        {deptError && (
                           <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-start gap-2">
                              <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                              <p className="text-sm text-red-700 dark:text-red-300 flex-1">{deptError}</p>
                              <Button variant="secondary" size="sm" onClick={loadDepartments}>Qayta urinish</Button>
                           </div>
                        )}

                        {deptLoading && deptList.length === 0 ? (
                           <div className="space-y-2">
                              {[0, 1, 2].map((i) => (
                                 <div key={i} className="h-14 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
                              ))}
                           </div>
                        ) : deptList.length === 0 ? (
                           <div className="text-center py-10 border border-dashed border-gray-200 dark:border-gray-700 rounded-lg">
                              <Building2 className="w-8 h-8 mx-auto text-gray-300 dark:text-gray-600 mb-2" />
                              <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">Bo'lim yo'q</p>
                              <Button size="sm" onClick={openDeptCreate}>Birinchisini qo'shish</Button>
                           </div>
                        ) : (
                           <div className="space-y-2">
                              {deptList.map((d) => (
                                 <div key={d.id}
                                    className={`flex flex-col sm:flex-row sm:items-center gap-3 p-3 border rounded-lg
                                       ${d.isActive
                                          ? 'border-gray-200 dark:border-gray-700'
                                          : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/40 opacity-60'}`}>
                                    <span className="w-3 h-3 rounded-full shrink-0"
                                       style={{ backgroundColor: d.color || '#9CA3AF' }} />
                                    <div className="min-w-0 flex-1">
                                       <div className="flex items-center gap-2 flex-wrap">
                                          <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{d.name}</p>
                                          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                                             {d.code}
                                          </span>
                                          {!d.isActive && (
                                             <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300">
                                                o'chirilgan
                                             </span>
                                          )}
                                       </div>
                                       <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                          {DEPARTMENT_TYPE_LABELS[d.type as DepartmentType] || d.type}
                                          {' · '}tartib {d.sortOrder ?? 0}
                                       </p>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                       <Button variant="secondary" size="sm" onClick={() => openDeptEdit(d)} disabled={deptBusy}>
                                          <Edit className="w-4 h-4" />
                                       </Button>
                                       <Button variant="secondary" size="sm" onClick={() => toggleDepartmentActive(d)} disabled={deptBusy}>
                                          {d.isActive ? 'O\'chirish' : 'Yoqish'}
                                       </Button>
                                    </div>
                                 </div>
                              ))}
                           </div>
                        )}
                     </Card>
                  </div>
               )}

               {/* Xizmat ko'rsatish: sxema versiyasi va zaxira nusxa */}
               {activeTab === 'maintenance' && userRole === UserRole.CLINIC_ADMIN && (
                  <div className="space-y-6">

                     {/* Belgilangan tiklash — sahifaning eng tepasida, chunki bu kutilayotgan amal */}
                     {restoreState?.staged && (
                        <Card className="p-4 border-l-4 border-amber-500 bg-amber-50 dark:bg-amber-900/20">
                           <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                              <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
                              <div className="flex-1 min-w-0">
                                 <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                                    Tiklash belgilangan: {restoreState.file}
                                 </p>
                                 <p className="text-xs text-amber-800 dark:text-amber-300 mt-0.5">
                                    Dastur qayta ishga tushganda baza shu nusxadan tiklanadi.
                                    Joriy baza avtomatik saqlanadi.
                                 </p>
                              </div>
                              <Button variant="secondary" size="sm" onClick={handleCancelRestore} disabled={backupBusy}>
                                 Bekor qilish
                              </Button>
                           </div>
                        </Card>
                     )}

                     {maintError && (
                        <Card className="p-4 border-l-4 border-red-500 bg-red-50 dark:bg-red-900/20">
                           <div className="flex items-start gap-3">
                              <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                              <p className="text-sm text-red-700 dark:text-red-300 flex-1">{maintError}</p>
                              <Button variant="secondary" size="sm" onClick={loadMaintenance}>Qayta urinish</Button>
                           </div>
                        </Card>
                     )}

                     {/* ─── Baza holati ───────────────────────────────────── */}
                     <Card className="p-6">
                        <div className="flex items-center gap-3 mb-2">
                           <div className="p-2 bg-primary-50 dark:bg-primary-900/30 rounded-lg">
                              <Database className="w-5 h-5 text-primary-600 dark:text-primary-300" />
                           </div>
                           <h3 className="text-xl font-bold text-gray-900 dark:text-white">Baza holati</h3>
                        </div>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
                           Qo'llab-quvvatlashga murojaat qilganda birinchi so'raladigan ma'lumot.
                        </p>

                        {maintLoading && !schemaInfo ? (
                           <div className="space-y-2">
                              <div className="h-4 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
                              <div className="h-4 bg-gray-100 dark:bg-gray-800 rounded w-2/3 animate-pulse" />
                           </div>
                        ) : schemaInfo ? (
                           <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                              <div>
                                 <p className="text-xs uppercase tracking-wide text-gray-400">Sxema versiyasi</p>
                                 <p className="text-sm font-mono font-semibold text-gray-900 dark:text-white mt-1 break-all">
                                    {schemaInfo.current || (schemaInfo.baseline ? 'boshlang’ich holat' : '—')}
                                 </p>
                              </div>
                              <div>
                                 <p className="text-xs uppercase tracking-wide text-gray-400">Qo'llanilgan</p>
                                 <p className="text-sm font-semibold text-gray-900 dark:text-white mt-1">
                                    {schemaInfo.appliedCount} ta migratsiya
                                 </p>
                              </div>
                              <div>
                                 <p className="text-xs uppercase tracking-wide text-gray-400">Kutilmoqda</p>
                                 <p className={`text-sm font-semibold mt-1 ${schemaInfo.pendingCount > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                                    {schemaInfo.pendingCount > 0 ? `${schemaInfo.pendingCount} ta` : 'yo’q'}
                                 </p>
                              </div>
                           </div>
                        ) : (
                           <p className="text-sm text-gray-400">Ma'lumot yo'q</p>
                        )}

                        {schemaInfo?.pendingCount > 0 && (
                           <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                              <p className="text-sm text-amber-800 dark:text-amber-200">
                                 Qo'llanilmagan o'zgarishlar bor. Dasturni qayta ishga tushiring.
                              </p>
                           </div>
                        )}
                     </Card>

                     {/* ─── Zaxira nusxa ──────────────────────────────────── */}
                     <Card className="p-6">
                        <div className="flex items-center gap-3 mb-2">
                           <div className="p-2 bg-primary-50 dark:bg-primary-900/30 rounded-lg">
                              <HardDrive className="w-5 h-5 text-primary-600 dark:text-primary-300" />
                           </div>
                           <h3 className="text-xl font-bold text-gray-900 dark:text-white">Zaxira nusxa</h3>
                        </div>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
                           Baza bilan birga bemor fotolari va tekshiruv fayllari ham saqlanadi.
                           Nusxalar <code className="text-xs">%APPDATA%\xclinic\backups</code> papkasida.
                        </p>

                        <div className="flex flex-col sm:flex-row gap-2 mb-6">
                           <Input
                              value={backupNote}
                              onChange={(e: any) => setBackupNote(e.target.value)}
                              placeholder="Izoh (ixtiyoriy): masalan, yangilanishdan oldin"
                              className="flex-1"
                           />
                           <Button onClick={handleCreateBackup} disabled={backupBusy}>
                              {backupBusy ? 'Bajarilmoqda…' : 'Hozir nusxa olish'}
                           </Button>
                        </div>

                        {maintLoading && backupList.length === 0 ? (
                           <div className="space-y-2">
                              {[0, 1, 2].map((i) => (
                                 <div key={i} className="h-12 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
                              ))}
                           </div>
                        ) : backupList.length === 0 ? (
                           <div className="text-center py-8 border border-dashed border-gray-200 dark:border-gray-700 rounded-lg">
                              <HardDrive className="w-8 h-8 mx-auto text-gray-300 dark:text-gray-600 mb-2" />
                              <p className="text-sm text-gray-500 dark:text-gray-400">
                                 Nusxa hali yo'q. Birinchisini hozir oling.
                              </p>
                           </div>
                        ) : (
                           <div className="space-y-2">
                              {backupList.map((b) => (
                                 <div key={b.file}
                                    className="flex flex-col sm:flex-row sm:items-center gap-2 p-3 border border-gray-200 dark:border-gray-700 rounded-lg">
                                    <div className="min-w-0 flex-1">
                                       <p className="text-sm font-mono text-gray-900 dark:text-white truncate">{b.file}</p>
                                       <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                          {fmtWhen(b.createdAt)} · {fmtBytes(b.sizeBytes)}
                                          {b.hasUploads ? ' · fayllar arxivi bor' : ' · faqat baza'}
                                       </p>
                                       {b.note && (
                                          <p className="text-xs text-gray-600 dark:text-gray-300 mt-1 italic truncate">{b.note}</p>
                                       )}
                                    </div>
                                    <Button variant="secondary" size="sm"
                                       onClick={() => { setRestoreTarget(b); setRestoreConfirmText(''); }}
                                       disabled={backupBusy || restoreState?.staged}>
                                       <Download className="w-4 h-4 mr-1.5" /> Tiklash
                                    </Button>
                                 </div>
                              ))}
                           </div>
                        )}
                     </Card>
                  </div>
               )}

               {activeTab === 'access' && userRole === UserRole.CLINIC_ADMIN && (
                  <div className="space-y-6">
                     <Card className="p-6">
                        <div className="flex items-start gap-3">
                           <div className="p-2.5 bg-primary-50 dark:bg-primary-900/30 rounded-xl">
                              <Shield className="w-5 h-5 text-primary-600 dark:text-primary-400" />
                           </div>
                           <div>
                              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Ruxsatlarni boshqarish</h3>
                              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                 Shifokor va resepshn qaysi bo'limlar va ma'lumotlarni ko'rishini belgilang.
                                 Belgisi olib tashlangan modul menyuda ko'rinmaydi. Bosh sahifa (Dashboard) har doim ochiq qoladi.
                              </p>
                           </div>
                        </div>
                     </Card>

                     {([
                        { roleKey: 'receptionist' as const, roleId: 'RECEPTIONIST' as const, title: 'Resepshn', desc: 'Qabulxona xodimlari uchun' },
                        { roleKey: 'doctor' as const, roleId: 'DOCTOR' as const, title: 'Shifokor', desc: 'Shifokorlar uchun' },
                     ]).map(({ roleKey, roleId, title, desc }) => {
                        const roleAccess = accessForm[roleKey] || {};
                        const hidden = roleAccess.hiddenModules || [];
                        const modules = ACCESS_MODULES.filter(m => m.roles.includes(roleId));
                        return (
                           <Card key={roleKey} className="p-6">
                              <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
                                 <div>
                                    <h4 className="text-base font-bold text-gray-900 dark:text-white">{title}</h4>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">{desc}</p>
                                 </div>
                                 <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl">
                                    {([
                                       { key: 'simple' as const, label: 'Sodda', active: isSimplePreset(roleKey) },
                                       { key: 'all' as const, label: 'Hammasi', active: (accessForm[roleKey]?.hiddenModules || []).length === 0 },
                                    ]).map(p => (
                                       <button
                                          key={p.key}
                                          type="button"
                                          onClick={() => applyPreset(roleKey, p.key)}
                                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${p.active
                                             ? 'bg-white dark:bg-gray-700 text-primary-600 dark:text-white shadow-sm'
                                             : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
                                       >
                                          {p.label}
                                       </button>
                                    ))}
                                 </div>
                              </div>

                              {roleKey === 'receptionist' && (
                                 <p className="text-xs text-gray-500 dark:text-gray-400 mb-3 -mt-2">
                                    <b>Sodda</b> — faqat kundalik ish uchun kerak bo'lgan bo'limlar qoladi
                                    (Bemorlar, Kalendar, Kassa, Navbat). Menyu qisqarsa, yangi xodim tezroq o'rganadi.
                                 </p>
                              )}

                              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Ko'rinadigan modullar</p>
                              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-6">
                                 {modules.map(m => {
                                    const visible = !hidden.includes(m.id);
                                    return (
                                       <label key={m.id} className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border cursor-pointer transition-all text-sm font-medium ${visible
                                          ? 'border-primary-200 bg-primary-50/60 text-primary-700 dark:border-primary-800 dark:bg-primary-900/20 dark:text-primary-300'
                                          : 'border-gray-200 bg-gray-50 text-gray-400 dark:border-gray-700 dark:bg-gray-800/50 line-through'}`}>
                                          <input
                                             type="checkbox"
                                             checked={visible}
                                             onChange={() => toggleModule(roleKey, m.id)}
                                             className="w-4 h-4 rounded text-primary-600 focus:ring-primary-500"
                                          />
                                          {m.label}
                                       </label>
                                    );
                                 })}
                              </div>

                              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Maxfiy ma'lumotlar</p>
                              <div className="space-y-2">
                                 <label className="flex items-start gap-3 p-3 rounded-xl border border-gray-200 dark:border-gray-700 cursor-pointer hover:border-primary-300 transition-colors">
                                    <input
                                       type="checkbox"
                                       checked={roleAccess.showFinance !== false}
                                       onChange={e => updateRoleAccess(roleKey, { showFinance: e.target.checked })}
                                       className="w-4 h-4 mt-0.5 rounded text-primary-600 focus:ring-primary-500"
                                    />
                                    <div>
                                       <p className="text-sm font-semibold text-gray-900 dark:text-white">Moliyaviy ko'rsatkichlarni ko'rsatish</p>
                                       <p className="text-xs text-gray-500 dark:text-gray-400">Dashboarddagi tushum, o'rtacha chek, kutilayotgan to'lovlar va qarzdorlar ro'yxati</p>
                                    </div>
                                 </label>
                                 {roleKey === 'doctor' && (
                                    <label className="flex items-start gap-3 p-3 rounded-xl border border-gray-200 dark:border-gray-700 cursor-pointer hover:border-primary-300 transition-colors">
                                       <input
                                          type="checkbox"
                                          checked={roleAccess.showPatientPhone !== false}
                                          onChange={e => updateRoleAccess(roleKey, { showPatientPhone: e.target.checked })}
                                          className="w-4 h-4 mt-0.5 rounded text-primary-600 focus:ring-primary-500"
                                       />
                                       <div>
                                          <p className="text-sm font-semibold text-gray-900 dark:text-white">Bemor telefon raqamlarini ko'rsatish</p>
                                          <p className="text-xs text-gray-500 dark:text-gray-400">O'chirilsa, shifokorga raqamlar yulduzcha bilan maskalanadi (masalan, +*** ** *** ** 67)</p>
                                       </div>
                                    </label>
                                 )}
                              </div>
                           </Card>
                        );
                     })}

                     <Card className="p-6">
                        <div className="mb-4">
                           <h4 className="text-base font-bold text-gray-900 dark:text-white">Kassa smenalari</h4>
                           <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                              Smena kassir "Kunni yopish" bosgan daqiqada tugaydi — soat bo'yicha emas.
                              Undan keyingi to'lovlar keyingi smenaga o'tadi.
                           </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                           {[1, 2].map(n => (
                              <button
                                 key={n}
                                 type="button"
                                 disabled={cashShiftsSaving}
                                 onClick={() => saveCashShifts(n)}
                                 className={`px-4 py-2 rounded-xl text-sm font-bold border transition-all disabled:opacity-50 ${cashShifts === n
                                    ? 'bg-primary-600 text-white border-primary-600'
                                    : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-primary-400'}`}
                              >
                                 {n === 1 ? 'Kuniga 1 smena' : 'Kuniga 2 smena'}
                              </button>
                           ))}
                           {cashShiftsSaving && <span className="text-xs text-gray-400">Saqlanmoqda...</span>}
                        </div>
                        <p className="text-[11px] text-gray-400 mt-3">
                           {cashShifts === 1
                              ? 'Kassa sahifasida kun butunligicha ko\'rinadi.'
                              : 'Kassa sahifasida "1-smena / 2-smena" tanlagichi chiqadi. 2-smena 1-smena topshirgan naqddan boshlanadi.'}
                        </p>
                     </Card>

                     <div className="flex items-center gap-3">
                        <Button onClick={handleAccessSave} disabled={accessSaving}>
                           {accessSaving ? 'Saqlanmoqda...' : accessSaved ? 'Saqlandi ✓' : 'Saqlash'}
                        </Button>
                        {accessSaved && <span className="text-sm text-success-600 font-medium">Ruxsatlar yangilandi, sahifa yangilanmoqda...</span>}
                     </div>
                  </div>
               )}

               {activeTab === 'services' && (

                  <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                     {/* Categories Sidebar */}
                     <Card className="col-span-1 h-fit p-4">
                        <div className="flex justify-between items-center mb-4">
                           <h3 className="font-medium text-gray-900 dark:text-white">{t('settings.services.categories')}</h3>
                           <Button size="sm" variant="secondary" onClick={() => setIsCategoryModalOpen(true)}>+</Button>
                        </div>
                        <div className="space-y-1">
                           <button
                              onClick={() => setSelectedCategory(null)}
                              className={`w-full text-left px-3 py-2 rounded-md text-sm font-medium transition-colors ${!selectedCategory ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300' : 'text-gray-600 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800'}`}
                           >
                              {t('settings.services.all')}
                           </button>
                           {categories.map(cat => (
                              <div key={cat.id} className="group flex items-center justify-between">
                                 <button
                                    onClick={() => setSelectedCategory(cat.id)}
                                    className={`flex-1 text-left px-3 py-2 rounded-md text-sm font-medium transition-colors ${selectedCategory === cat.id ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300' : 'text-gray-600 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800'}`}
                                 >
                                    {cat.name}
                                 </button>
                                 <button onClick={() => handleDeleteCategory(cat.id)} className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-500">
                                    <Trash2 className="w-3 h-3" />
                                 </button>
                              </div>
                           ))}
                        </div>
                     </Card>

                     {/* Services List */}
                     <div className="lg:col-span-3 space-y-6">
                        <Card className="p-6">
                           <div className="flex justify-between items-center mb-6">
                              <div>
                                 <h3 className="text-lg font-medium text-gray-900 dark:text-white">{t('settings.services.title')}</h3>
                                 <p className="text-sm text-gray-500">{t('settings.services.subtitle')}</p>
                              </div>
                              <Button size="sm" onClick={() => handleOpenServiceModal()}>Xizmat Qo'shish</Button>
                           </div>

                           <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
                              <table className="w-full text-left text-sm">
                                 <thead className="bg-gray-50 dark:bg-gray-800">
                                    <tr>
                                       <th className="px-4 py-3 font-medium text-gray-500">{t('settings.services.thName')}</th>
                                       <th className="px-4 py-3 font-medium text-gray-500">{t('settings.services.thPrice')}</th>
                                       <th className="px-4 py-3 font-medium text-gray-500 text-right">{t('settings.services.thAction')}</th>
                                    </tr>
                                 </thead>
                                 <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                    {services
                                       .filter(s => !selectedCategory || s.categoryId === selectedCategory)
                                       .map((s) => (
                                          <tr key={s.id ?? s.name} className="bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800">
                                             <td className="px-4 py-3 text-gray-900 dark:text-gray-200 font-medium">{s.name}</td>
                                             <td className="px-4 py-3 text-gray-500">{s.price.toLocaleString()} UZS</td>
                                             <td className="px-4 py-3 text-right">
                                                <div className="flex items-center justify-end gap-1">
                                                   <button
                                                      onClick={() => handleOpenServiceModal(s)}
                                                      className="text-primary-600 hover:text-primary-800 p-1 hover:bg-primary-50 rounded transition-colors"
                                                   >
                                                      <Edit className="w-4 h-4" />
                                                   </button>
                                                   {onDeleteService && s.id && (
                                                      <button
                                                         onClick={async () => {
                                                            if (!window.confirm(`"${s.name}" xizmatini o'chirishni tasdiqlaysizmi?`)) return;
                                                            await onDeleteService(s.id as number);
                                                         }}
                                                         className="text-red-500 hover:text-red-700 p-1 hover:bg-red-50 rounded transition-colors"
                                                      >
                                                         <Trash2 className="w-4 h-4" />
                                                      </button>
                                                   )}
                                                </div>
                                             </td>
                                          </tr>
                                       ))}
                                    {services.filter(s => !selectedCategory || s.categoryId === selectedCategory).length === 0 && (
                                       <tr>
                                          <td colSpan={3} className="px-4 py-8 text-center text-gray-500">
                                             {t('settings.services.notFound')}
                                          </td>
                                       </tr>
                                    )}
                                 </tbody>
                              </table>
                           </div>
                        </Card>

                        <Card className="p-6">
                           <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">{t('settings.services.currentPlan')}</h3>
                           <div className="flex items-center justify-between bg-indigo-50 dark:bg-indigo-900/20 p-4 rounded-lg border border-indigo-100 dark:border-indigo-800">
                              <div>
                                 <p className="font-bold text-indigo-900 dark:text-indigo-200">{plans?.find(p => p.id === currentClinic?.planId)?.name || 'Standart Tarif'}</p>
                                 <p className="text-sm text-indigo-700 dark:text-indigo-300 mt-1">{plans?.find(p => p.id === currentClinic?.planId)?.maxDoctors || 10} tagacha shifokor • Ustuvor Yordam</p>
                              </div>
                              <Button
                                 size="sm"
                                 className="bg-indigo-600 hover:bg-indigo-700 text-white border-none"
                                 onClick={() => setIsUpgradeModalOpen(true)}
                              >
                                 {t('settings.services.upgrade')}
                              </Button>
                           </div>
                        </Card>
                     </div>
                  </div>
               )}

               {/* Doctors Tab */}
               {activeTab === 'doctors' && (
                  <Card className="p-6">
                     <div className="flex justify-between items-center mb-6">
                        <div>
                           <h3 className="text-lg font-medium text-gray-900 dark:text-white">{t('settings.staff.doctorsTitle')}</h3>
                           <p className="text-sm text-gray-500">{t('settings.staff.doctorsSubtitle')}</p>
                        </div>
                        <Button size="sm" onClick={() => handleOpenDoctorModal()}>{t('settings.staff.addDoctor')}</Button>
                     </div>
                     <div className="grid grid-cols-1 gap-4">
                        {doctors.map(doc => (
                           <div key={doc.id} className="flex items-center justify-between p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800">
                              <div className="flex items-center gap-4">
                                 <div className="h-10 w-10 rounded-full flex items-center justify-center text-white font-bold shadow-sm" style={{ backgroundColor: doc.color || '#3B82F6' }}>
                                    {doc.firstName[0]}{doc.lastName[0]}
                                 </div>
                                 <div>
                                    <p className="font-medium text-gray-900 dark:text-white">Dr. {doc.firstName} {doc.lastName}</p>
                                    <p className="text-xs text-gray-500">{doc.specialty}</p>
                                 </div>
                              </div>
                              <div className="flex items-center gap-2">
                                 <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs font-medium">{doc.status === 'Active' ? t('settings.staff.statusActive') : t('settings.staff.statusVoc')}</span>
                                 <button
                                    onClick={() => handleOpenDoctorModal(doc)}
                                    className="p-2 text-primary-600 hover:bg-primary-50 rounded-md"
                                 >
                                    <Edit className="w-4 h-4" />
                                 </button>
                                 <button
                                    className="p-2 text-gray-400 hover:text-red-600"
                                    onClick={() => setDeleteConfirmDoctor(doc)}
                                 >
                                    <Trash2 className="w-4 h-4" />
                                 </button>
                              </div>
                           </div>
                        ))}
                     </div>
                  </Card>
               )}

                {/* Receptionists Tab */}
               {activeTab === 'receptionists' && (
                  <Card className="p-6">
                     <div className="flex justify-between items-center mb-6">
                        <div>
                           <h3 className="text-lg font-medium text-gray-900 dark:text-white">Resepshnlar Boshqaruvi</h3>
                           <p className="text-sm text-gray-500">Qabul xodimlarini boshqarish.</p>
                        </div>
                        <Button size="sm" onClick={() => handleOpenReceptionistModal()}>Resepshn Qo'shish</Button>
                     </div>
                     <div className="grid grid-cols-1 gap-4">
                        {receptionists.map(rec => (
                           <div key={rec.id} className="flex items-center justify-between p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800">
                              <div className="flex items-center gap-4">
                                 <div className="h-10 w-10 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center text-purple-600 dark:text-purple-400 font-bold">
                                    {rec.firstName[0]}{rec.lastName[0]}
                                 </div>
                                 <div>
                                    <p className="font-medium text-gray-900 dark:text-white">{rec.firstName} {rec.lastName}</p>
                                    <p className="text-xs text-gray-500">{rec.phone}</p>
                                 </div>
                              </div>
                              <div className="flex items-center gap-2">
                                 <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs font-medium">{rec.status === 'Active' ? t('settings.staff.statusActive') : t('settings.staff.statusVoc')}</span>
                                 <button
                                    onClick={() => handleOpenReceptionistModal(rec)}
                                    className="p-2 text-primary-600 hover:bg-primary-50 rounded-md"
                                 >
                                    <Edit className="w-4 h-4" />
                                 </button>
                                 <button
                                    className="p-2 text-gray-400 hover:text-red-600"
                                    onClick={() => setDeleteConfirmReceptionist(rec)}
                                 >
                                    <Trash2 className="w-4 h-4" />
                                 </button>
                              </div>
                           </div>
                        ))}
                        {receptionists.length === 0 && (
                           <div className="text-center py-8 text-gray-500 text-sm">
                              Hozircha resepshnlar qo'shilmagan
                           </div>
                        )}
                     </div>
                  </Card>
               )}

               {/* Lab Technicians Tab */}
               {activeTab === 'labTechnicians' && (
                  <Card className="p-6">
                     <div className="flex justify-between items-center mb-6">
                        <div>
                           <h3 className="text-lg font-medium text-gray-900 dark:text-white">Lab Texniklar Boshqaruvi</h3>
                           <p className="text-sm text-gray-500">Stomatologik laboratoriya texniklarini boshqarish.</p>
                        </div>
                        <Button size="sm" onClick={() => handleOpenLabTechModal()}>Texnik Qo'shish</Button>
                     </div>
                     <div className="grid grid-cols-1 gap-4">
                        {labTechnicians.map(tech => (
                           <div key={tech.id} className="flex items-center justify-between p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800">
                              <div className="flex items-center gap-4">
                                 <div className="h-10 w-10 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400 font-bold">
                                    {tech.firstName[0]}{tech.lastName[0]}
                                 </div>
                                 <div>
                                    <p className="font-medium text-gray-900 dark:text-white">{tech.firstName} {tech.lastName}</p>
                                    <p className="text-xs text-gray-500">{tech.specialty} · {tech.phone}</p>
                                 </div>
                              </div>
                              <div className="flex items-center gap-2">
                                 <span className={`px-2 py-1 rounded-full text-xs font-medium ${tech.status === 'Active' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'}`}>
                                    {tech.status === 'Active' ? 'Faol' : 'Faol emas'}
                                 </span>
                                 <button
                                    onClick={() => handleOpenLabTechModal(tech)}
                                    className="p-2 text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-md"
                                 >
                                    <Edit className="w-4 h-4" />
                                 </button>
                                 <button
                                    className="p-2 text-gray-400 hover:text-red-600"
                                    onClick={() => setDeleteConfirmLabTech(tech)}
                                 >
                                    <Trash2 className="w-4 h-4" />
                                 </button>
                              </div>
                           </div>
                        ))}
                        {labTechnicians.length === 0 && (
                           <div className="text-center py-8 text-gray-500 text-sm">
                              Hozircha lab texniklar qo'shilmagan
                           </div>
                        )}
                     </div>
                  </Card>
               )}

               {/* SMS va Telegram Tab (birlashtirilgan) */}
               {activeTab === 'messaging' && (
                  <div className="space-y-6">
                  <Card className="p-6">
                     <div className="flex items-center gap-4 mb-6">
                        <div className="p-3 bg-primary-100 dark:bg-primary-900/40 rounded-xl text-primary-600 dark:text-primary-400">
                           <Bot className="w-8 h-8" />
                        </div>
                        <div>
                           <h3 className="text-xl font-bold text-gray-900 dark:text-white">{t('settings.bot.title')}</h3>
                           <p className="text-sm text-gray-500">{t('settings.bot.subtitle')}</p>
                        </div>
                     </div>

                     <div className="space-y-6">
                        <div className="bg-gray-50 dark:bg-gray-800/50 p-6 rounded-2xl border border-gray-100 dark:border-gray-700">
                           <h4 className="font-bold text-gray-900 dark:text-white mb-2">Shaxsiy Telegram Botni Ulash</h4>
                           <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                              Telegram-da @BotFather orqali o'zingizning shaxsiy botingizni yarating va bot tokenini quyidagi maydonga kiritib, uni tizimga ulang.
                           </p>

                           <form onSubmit={handleBotSave} className="space-y-4">
                              <Input
                                 label="Telegram Bot Token"
                                 value={botToken}
                                 onChange={e => setBotToken(e.target.value)}
                                 placeholder="7451241151:AAEi-y2F4_abcdefghijklmnopqrst..."
                              />
                              <div className="flex items-center gap-4">
                                 <Button type="submit">{t('common.save')}</Button>
                                 {botSaved && <span className="text-green-600 text-sm flex items-center"><CheckCircle className="w-4 h-4 mr-1" /> {t('settings.general.saved')}</span>}
                              </div>
                           </form>
                        </div>

                        {currentClinic?.telegramChatId ? (
                           <div className="flex items-center justify-between p-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800/40 rounded-xl">
                              <div className="flex items-center gap-3">
                                 <CheckCircle className="w-5 h-5 text-emerald-500" />
                                 <div>
                                    <p className="text-sm font-bold text-emerald-900 dark:text-emerald-200">{t('settings.bot.active')}</p>
                                    <p className="text-xs text-emerald-700 dark:text-emerald-400">Siz har kuni soat 22:00 da hisobotlarni qabul qilasiz.</p>
                                 </div>
                              </div>
                           </div>
                        ) : (
                           <div className="flex items-center gap-3 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800/40 rounded-xl">
                              <Activity className="w-5 h-5 text-amber-500" />
                              <p className="text-sm text-amber-900 dark:text-amber-200">{t('settings.bot.notConnected')}</p>
                           </div>
                        )}
                     </div>
                  </Card>

                     <Card className="p-6">
                        <div className="flex items-center gap-4 mb-6">
                           <div className="p-3 bg-purple-100 dark:bg-purple-900/40 rounded-xl text-purple-600 dark:text-purple-400">
                              <MessageSquare className="w-8 h-8" />
                           </div>
                           <div>
                              <h3 className="text-xl font-bold text-gray-900 dark:text-white">SMS va Xabar Yuborish Rejimi</h3>
                              <p className="text-sm text-gray-500">Mijozlarga xabarnomalar qanday yuborilishini sozlang va Eskiz.uz profilingizni ulang.</p>
                           </div>
                        </div>
                        <form onSubmit={handleSmsSave} className="space-y-8">
                           <div>
                              <h4 className="text-lg font-medium text-gray-900 dark:text-white mb-4">1. Standart kanalni tanlang</h4>
                              <p className="text-xs text-gray-500 dark:text-gray-400 -mt-2 mb-4">Bu rejim Xabarlar bo'limidagi "avtomatik" (auto) yuborishlar uchun standart kanal sifatida ishlatiladi.</p>
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                 <label className={`relative flex cursor-pointer rounded-lg border bg-white dark:bg-gray-800 p-4 shadow-sm focus:outline-none ${smsForm.notificationMode === 'telegram_only' ? 'border-purple-500 ring-1 ring-purple-500' : 'border-gray-300 dark:border-gray-700'}`}>
                                    <input 
                                       type="radio" 
                                       name="notificationMode"
                                       value="telegram_only"
                                       checked={smsForm.notificationMode === 'telegram_only'}
                                       onChange={(e) => setSmsForm({...smsForm, notificationMode: e.target.value})}
                                       className="sr-only"
                                    />
                                    <span className="flex flex-1">
                                       <span className="flex flex-col">
                                          <span className="block text-sm font-medium text-gray-900 dark:text-white mb-1">🤖 Faqat Telegram Bot</span>
                                          <span className="mt-1 flex items-center text-xs text-gray-500 dark:text-gray-400">Xabarlar mijozning Telegram profiliga (bepul) yuboriladi</span>
                                       </span>
                                    </span>
                                    <CheckCircle className={`h-5 w-5 ${smsForm.notificationMode === 'telegram_only' ? 'text-purple-600' : 'invisible'}`} />
                                 </label>
                                 <label className={`relative flex cursor-pointer rounded-lg border bg-white dark:bg-gray-800 p-4 shadow-sm focus:outline-none ${smsForm.notificationMode === 'sms_only' ? 'border-purple-500 ring-1 ring-purple-500' : 'border-gray-300 dark:border-gray-700'}`}>
                                    <input 
                                       type="radio" 
                                       name="notificationMode"
                                       value="sms_only"
                                       checked={smsForm.notificationMode === 'sms_only'}
                                       onChange={(e) => setSmsForm({...smsForm, notificationMode: e.target.value})}
                                       className="sr-only"
                                    />
                                    <span className="flex flex-1">
                                       <span className="flex flex-col">
                                          <span className="block text-sm font-medium text-gray-900 dark:text-white mb-1">📱 Faqat SMS (Eskiz)</span>
                                          <span className="mt-1 flex items-center text-xs text-gray-500 dark:text-gray-400">Xabarlar bevosita telefon raqamiga (pullik) yuboriladi</span>
                                       </span>
                                    </span>
                                    <CheckCircle className={`h-5 w-5 ${smsForm.notificationMode === 'sms_only' ? 'text-purple-600' : 'invisible'}`} />
                                 </label>
                                 <label className={`relative flex cursor-pointer rounded-lg border bg-white dark:bg-gray-800 p-4 shadow-sm focus:outline-none ${smsForm.notificationMode === 'both' ? 'border-purple-500 ring-1 ring-purple-500' : 'border-gray-300 dark:border-gray-700'}`}>
                                    <input 
                                       type="radio" 
                                       name="notificationMode"
                                       value="both"
                                       checked={smsForm.notificationMode === 'both'}
                                       onChange={(e) => setSmsForm({...smsForm, notificationMode: e.target.value})}
                                       className="sr-only"
                                    />
                                    <span className="flex flex-1">
                                       <span className="flex flex-col">
                                          <span className="block text-sm font-medium text-gray-900 dark:text-white mb-1">🤖📱 Ikkalasi ham</span>
                                          <span className="mt-1 flex items-center text-xs text-gray-500 dark:text-gray-400">Xabarlar avval Telegram, so'ng qo'shimcha sifatida SMS orqali boradi</span>
                                       </span>
                                    </span>
                                    <CheckCircle className={`h-5 w-5 ${smsForm.notificationMode === 'both' ? 'text-purple-600' : 'invisible'}`} />
                                 </label>
                              </div>
                           </div>

                           {(smsForm.notificationMode === 'sms_only' || smsForm.notificationMode === 'both') && (
                              <div className="bg-gray-50 dark:bg-gray-800/50 p-6 rounded-2xl border border-gray-100 dark:border-gray-700">
                                 <div className="flex items-center justify-between mb-6">
                                    <h4 className="text-lg font-medium text-gray-900 dark:text-white">2. Eskiz.uz Integratsiyasi</h4>
                                    {smsConnected ? (
                                       <span className="flex items-center text-green-600 text-sm font-medium bg-green-50 dark:bg-green-900/30 px-3 py-1.5 rounded-full">
                                          <CheckCircle className="w-4 h-4 mr-1.5" /> Ulangan
                                       </span>
                                    ) : (
                                       <span className="flex items-center text-amber-600 text-sm font-medium bg-amber-50 dark:bg-amber-900/30 px-3 py-1.5 rounded-full">
                                          <Activity className="w-4 h-4 mr-1.5" /> Ulanmagan
                                       </span>
                                    )}
                                 </div>
                                 <div className="space-y-4">
                                    <Input 
                                       label="Eskiz.uz Kabinet Email" 
                                       placeholder="kabinet@eskiz.uz"
                                       value={smsForm.eskizEmail} 
                                       onChange={(e) => setSmsForm({...smsForm, eskizEmail: e.target.value})}
                                       required
                                    />
                                    <div className="space-y-1">
                                        <p className="sms-settings-label text-sm font-medium text-gray-700 dark:text-gray-300">Eskiz.uz Kabinet Paroli</p>
                                        <input
                                            type="password"
                                            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-purple-500 focus:border-purple-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                            placeholder={smsHasPassword ? "(Parol kiritilgan. O'zgartirish uchun yangisini kiriting)" : "Yashirin kalitni kiriting"}
                                            value={smsForm.eskizPassword}
                                            onChange={(e) => setSmsForm({...smsForm, eskizPassword: e.target.value})}
                                        />
                                    </div>

                                    <div className="space-y-1">
                                        <p className="sms-settings-label text-sm font-medium text-gray-700 dark:text-gray-300">Nickname (Yuboruvchi nomi)</p>
                                        <input
                                            type="text"
                                            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-purple-500 focus:border-purple-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                            placeholder="Masalan: 4546 yoki XClinic"
                                            value={smsForm.eskizNick}
                                            onChange={(e) => setSmsForm({...smsForm, eskizNick: e.target.value})}
                                        />
                                        <p className="text-xs text-gray-500 mt-1">
                                            Eskizda tasdiqlangan maxsus nomingiz bo'lsa kiriting. Aks holda 4546 qoladi.
                                        </p>
                                    </div>
                                </div>
                     
                                    <div className="pt-2">
                                       <Button type="submit" className="w-full sm:w-auto">Saqlash va Ulanishni Tekshirish</Button>
                                    </div>
                                 </div>
                           )}

                           {smsForm.notificationMode === 'telegram_only' && (
                              <div className="pt-4">
                                 <Button type="submit" variant="primary">Saqlash</Button>
                              </div>
                           )}
                           
                           {smsSaved && <span className="text-green-600 text-sm flex items-center mt-2"><CheckCircle className="w-4 h-4 mr-1" /> Saqlandi</span>}
                        </form>
                     </Card>

                     {smsConnected && (smsForm.notificationMode === 'sms_only' || smsForm.notificationMode === 'both') && (
                        <Card className="p-6 border-l-4 border-l-purple-500">
                           <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                              <div>
                                 <p className="text-sm font-medium text-gray-500 mb-1">Joriy SMS balans (Eskiz.uz)</p>
                                 <div className="flex items-end gap-2">
                                    <p className="text-3xl font-bold text-gray-900 dark:text-white">
                                       {smsBalance !== null ? smsBalance.toLocaleString() : 'Tekshirilmoqda...'}
                                    </p>
                                    <span className="text-gray-500 mb-1 font-medium">ta SMS qoldi</span>
                                 </div>
                              </div>

                              <div className="w-full md:w-auto p-4 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700">
                                 <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Test SMS yuborish</p>
                                 <div className="flex gap-2">
                                    <Input 
                                       placeholder="998901234567" 
                                       value={smsTestPhone} 
                                       onChange={(e) => setSmsTestPhone(e.target.value)} 
                                    />
                                    <Button onClick={handleSmsTest} disabled={!smsTestPhone || !smsConnected || isCheckingSms} variant="secondary" className="whitespace-nowrap">
                                       {isCheckingSms ? '...' : 'Yuborish'}
                                    </Button>
                                 </div>
                              </div>
                           </div>
                        </Card>
                     )}
                  </div>
               )}


            </div>
         </div>

         {/* Add/Edit Service Modal */}
         <Modal isOpen={isServiceModalOpen} onClose={() => setIsServiceModalOpen(false)} title={editingServiceId !== null ? t('settings.services.edit') : t('settings.services.addModal')}>
            <form onSubmit={handleServiceSubmit} className="space-y-4">
               <Input label={t('settings.services.thName')} value={serviceForm.name} onChange={e => setServiceForm({ ...serviceForm, name: e.target.value })} required />

               <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Kategoriya</label>
                  <Select
                     value={serviceForm.categoryId}
                     onChange={e => setServiceForm({ ...serviceForm, categoryId: e.target.value })}
                     options={[
                        { value: '', label: 'Kategoriyasiz' },
                        ...categories.map(c => ({ value: c.id, label: c.name }))
                     ]}
                  />
               </div>
               <div className="grid grid-cols-2 gap-4">
                  <Input label={t('settings.services.thPrice')} type="number" value={serviceForm.price} onChange={e => setServiceForm({ ...serviceForm, price: e.target.value })} required />
                  <Input label="Texniklar xarajati" type="number" value={serviceForm.cost} onChange={e => setServiceForm({ ...serviceForm, cost: e.target.value })} placeholder="0" />
               </div>
               <div className="flex justify-end gap-2 pt-4">
                  <Button type="button" variant="secondary" onClick={() => setIsServiceModalOpen(false)}>{t('common.cancel')}</Button>
                  <Button type="submit">{t('common.save')}</Button>
               </div>
            </form>
         </Modal>

         {/* Add Category Modal */}
         <Modal isOpen={isCategoryModalOpen} onClose={() => setIsCategoryModalOpen(false)} title={t('settings.services.addCategory')}>
            <form onSubmit={handleCategorySubmit} className="space-y-4">
               <Input label={t('settings.services.categoryName')} value={categoryForm.name} onChange={e => setCategoryForm({ ...categoryForm, name: e.target.value })} required />
               <div className="flex justify-end gap-2 pt-4">
                  <Button type="button" variant="secondary" onClick={() => setIsCategoryModalOpen(false)}>{t('common.cancel')}</Button>
                  <Button type="submit">{t('common.save')}</Button>
               </div>
            </form>
         </Modal>



         {/* Add/Edit Doctor Modal */}
         <Modal isOpen={isDoctorModalOpen} onClose={() => setIsDoctorModalOpen(false)} title={editingDoctorId ? t('settings.staff.editDoctor') : t('settings.staff.addDoctorModal')}>
            <form onSubmit={handleDoctorSubmit} className="space-y-4">
               <div className="grid grid-cols-2 gap-4">
                  <Input label={t('settings.staff.firstName')} value={doctorForm.firstName} onChange={e => setDoctorForm({ ...doctorForm, firstName: e.target.value })} required />
                  <Input label={t('settings.staff.lastName')} value={doctorForm.lastName} onChange={e => setDoctorForm({ ...doctorForm, lastName: e.target.value })} required />
               </div>
               <Input label={t('settings.staff.specialty')} value={doctorForm.specialty} onChange={e => setDoctorForm({ ...doctorForm, specialty: e.target.value })} required />
               {/* Kabinet — talonda va navbat tablosida chiqadi, bemor qaysi
                   xonaga borishini bilishi uchun */}
               <Input label="Kabinet" value={doctorForm.room}
                  onChange={e => setDoctorForm({ ...doctorForm, room: e.target.value })}
                  placeholder="Masalan: 204"
                  helperText="Talonda bemorga ko'rsatiladi" />
               <div className="grid grid-cols-2 gap-4">
                  <Input label={t('settings.staff.phone')} value={doctorForm.phone} onChange={e => setDoctorForm({ ...doctorForm, phone: e.target.value })} required />
                  <Input label="Qo'shimcha raqam (Ixtiyoriy)" value={doctorForm.secondaryPhone} onChange={e => setDoctorForm({ ...doctorForm, secondaryPhone: e.target.value })} />
               </div>

               <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-4">
                  <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-3">{t('settings.staff.authTitle')}</h4>
                  <div className="grid grid-cols-2 gap-4">
                     <Input
                        label="Login (Username)"
                        value={doctorForm.username}
                        onChange={e => setDoctorForm({ ...doctorForm, username: e.target.value })}
                        required={!editingDoctorId}
                        placeholder="shifokor_login"
                     />
                     <Input
                        label={t('settings.staff.password')}
                        type="password"
                        value={doctorForm.password}
                        onChange={e => setDoctorForm({ ...doctorForm, password: e.target.value })}
                        required={!editingDoctorId}
                        placeholder={editingDoctorId ? "O'zgartirish uchun kiriting" : "********"}
                     />
                  </div>

                  <div className="mt-4">
                     <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Maosh turi</label>
                     <div className="grid grid-cols-4 gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
                        {([
                           ['none', "Bo'sh"],
                           ['fixed', 'Fix'],
                           ['fixed_kpi', 'Fix+KPI'],
                           ['kpi', 'KPI'],
                        ] as const).map(([val, label]) => (
                           <button
                              key={val}
                              type="button"
                              onClick={() => setDoctorForm({ ...doctorForm, salaryType: val })}
                              className={`px-2 py-2 rounded-lg text-xs font-bold transition-all ${doctorForm.salaryType === val
                                 ? 'bg-white dark:bg-gray-700 text-primary-600 dark:text-primary-400 shadow-sm'
                                 : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
                           >
                              {label}
                           </button>
                        ))}
                     </div>
                     <p className="text-xs text-gray-500 mt-1.5">
                        {doctorForm.salaryType === 'none' && "Maosh turi belgilanmagan — Xarajat bo'limida qo'lda kiritiladi."}
                        {doctorForm.salaryType === 'fixed' && "Har oy belgilangan qat'iy summa to'lanadi."}
                        {doctorForm.salaryType === 'fixed_kpi' && "Qat'iy summa + sof foydadan foiz — ikkalasi ham to'lanadi."}
                        {doctorForm.salaryType === 'kpi' && "Faqat sof foydadan foiz (hisoblangan ulush) to'lanadi."}
                     </p>

                     {(doctorForm.salaryType === 'fixed' || doctorForm.salaryType === 'fixed_kpi') && (
                        <Input
                           label="Fix maosh (UZS)"
                           type="number"
                           value={doctorForm.fixedSalary}
                           onChange={e => setDoctorForm({ ...doctorForm, fixedSalary: e.target.value })}
                           placeholder="2000000"
                           containerClassName="w-full mt-3"
                        />
                     )}

                     {(doctorForm.salaryType === 'fixed_kpi' || doctorForm.salaryType === 'kpi') && (
                        <Input
                           label="Shifokor Ulushi (%)"
                           type="number"
                           value={doctorForm.percentage}
                           onChange={e => setDoctorForm({ ...doctorForm, percentage: e.target.value })}
                           placeholder="50"
                           helperText="Sof foydadan shifokor olishi kerak bo'lgan foiz"
                           containerClassName="w-full mt-3"
                        />
                     )}
                  </div>

                  <div className="pt-4 border-t border-gray-100 dark:border-gray-800">
                     <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Kalendar rangi</label>
                     <div className="flex flex-wrap gap-3">
                        {DOCTOR_COLORS.map((color) => (
                           <button
                              key={color.value}
                              type="button"
                              onClick={() => setDoctorForm({ ...doctorForm, color: color.value })}
                              className={`w-8 h-8 rounded-full border-2 transition-all ${doctorForm.color === color.value ? 'border-primary-500 scale-110 shadow-md' : 'border-transparent hover:scale-105'}`}
                              style={{ backgroundColor: color.value }}
                              title={color.name}
                           />
                        ))}
                     </div>
                     <p className="text-xs text-gray-500 mt-2">Bu rang kalendarda shifokor qabullarini belgilash uchun ishlatiladi.</p>
                  </div>
               </div>

               <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-4">
                  <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-1">Ishlash vaqti (Ixtiyoriy)</h4>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Bo'sh qoldirsa, klinika umumiy vaqti ishlatiladi</p>
                  <div className="grid grid-cols-2 gap-4">
                     <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Boshlanish vaqti</label>
                        <select
                           value={doctorForm.startHour}
                           onChange={e => setDoctorForm({ ...doctorForm, startHour: e.target.value })}
                           className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                        >
                           <option value="">— Klinika vaqti —</option>
                           {Array.from({ length: 18 }, (_, i) => i + 6).map(h => (
                              <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
                           ))}
                        </select>
                     </div>
                     <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tugash vaqti</label>
                        <select
                           value={doctorForm.endHour}
                           onChange={e => setDoctorForm({ ...doctorForm, endHour: e.target.value })}
                           className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                        >
                           <option value="">— Klinika vaqti —</option>
                           {Array.from({ length: 18 }, (_, i) => i + 6).map(h => (
                              <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
                           ))}
                        </select>
                     </div>
                  </div>
               </div>

               <div className="flex justify-end gap-2 pt-4">
                  <Button type="button" variant="secondary" onClick={() => setIsDoctorModalOpen(false)}>{t('common.cancel')}</Button>
                  <Button type="submit">{t('common.save')}</Button>
               </div>
            </form>
         </Modal>

         {/* Upgrade Plan Modal */}
         <Modal isOpen={isUpgradeModalOpen} onClose={() => setIsUpgradeModalOpen(false)} title="{t('settings.services.upgrade')}">
            <div className="text-center py-4 space-y-4">
               <div className="mx-auto w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center mb-4">
                  <Users className="w-6 h-6 text-indigo-600" />
               </div>
               <h3 className="text-lg font-medium text-gray-900 dark:text-white">Cheklovlarni olib tashlang!</h3>
               <p className="text-gray-500 dark:text-gray-400 px-4">
                  Sizning tarifingiz bo'yicha yangi shifokor qo'sha olmaysiz. Iltimos, tarifingizni o'zgartirish uchun menejer bilan bog'laning!
               </p>
               <div className="bg-gray-100 dark:bg-gray-800 p-4 rounded-lg space-y-2">
                  <p className="font-bold text-gray-900 dark:text-white text-lg">+998 90 824 29 92</p>
                  <a
                     href="https://t.me/ergashevulugbekk"
                     target="_blank"
                     rel="noopener noreferrer"
                     className="flex items-center justify-center gap-2 text-primary-500 hover:text-primary-600 font-medium"
                  >
                     <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69.01-.03.01-.14-.07-.2-.08-.06-.19-.04-.27-.02-.11.02-1.93 1.23-5.46 3.62-.51.35-.98.52-1.4.51-.46-.01-1.35-.26-2.01-.48-.81-.27-1.44-.42-1.38-.88.03-.24.38-.49 1.03-.75 4.06-1.77 6.77-2.94 8.13-3.51 3.87-1.6 4.67-1.88 5.2-1.88.11 0 .37.03.54.17.14.12.18.28.2.45-.02.07-.02.13-.03.23z" />
                     </svg>
                     t.me/ergashevulugbekk
                  </a>
               </div>
               <div className="pt-2">
                  <Button onClick={() => setIsUpgradeModalOpen(false)}>Tushunarli</Button>
               </div>
            </div>
         </Modal>

         {/* Delete Doctor Confirmation Modal */}
         <Modal isOpen={!!deleteConfirmDoctor} onClose={() => setDeleteConfirmDoctor(null)} title={t('settings.staff.deleteDoctorConfirm')}>
            <div className="text-center space-y-4">
               <div className="mx-auto w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                  <Trash2 className="w-6 h-6 text-red-600" />
               </div>
               <h3 className="text-lg font-medium text-gray-900 dark:text-white">Ishonchingiz komilmi?</h3>
               <p className="text-gray-600 dark:text-gray-300">
                  {t('settings.staff.deleteDoctorConfirm')} <br />
                   <strong>Dr. {deleteConfirmDoctor?.firstName} {deleteConfirmDoctor?.lastName}</strong>. {t('common.confirmDeleteDesc')}
               </p>
               <div className="flex justify-center gap-3 pt-4">
                  <Button variant="secondary" onClick={() => setDeleteConfirmDoctor(null)}>{t('common.cancel')}</Button>
                  <Button
                     className="bg-red-600 hover:bg-red-700 text-white border-none"
                     onClick={() => {
                        if (deleteConfirmDoctor) {
                           onDeleteDoctor(deleteConfirmDoctor.id);
                           setDeleteConfirmDoctor(null);
                        }
                     }}
                  >
                     Ha, O'chirish
                  </Button>
               </div>
            </div>
         </Modal>

         {/* Add/Edit Receptionist Modal */}
         <Modal isOpen={isReceptionistModalOpen} onClose={() => setIsReceptionistModalOpen(false)} title={editingReceptionistId ? t('settings.staff.editReceptionist') : t('settings.staff.addReceptionistModal')}>
            <form onSubmit={handleReceptionistSubmit} className="space-y-4">
               <div className="grid grid-cols-2 gap-4">
                  <Input label={t('settings.staff.firstName')} value={receptionistForm.firstName} onChange={e => setReceptionistForm({ ...receptionistForm, firstName: e.target.value })} required />
                  <Input label={t('settings.staff.lastName')} value={receptionistForm.lastName} onChange={e => setReceptionistForm({ ...receptionistForm, lastName: e.target.value })} required />
               </div>
               <Input label={t('settings.staff.phone')} value={receptionistForm.phone} onChange={e => setReceptionistForm({ ...receptionistForm, phone: e.target.value })} required />

               <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-4">
                  <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-3">{t('settings.staff.authTitle')}</h4>
                  <div className="grid grid-cols-2 gap-4">
                     <Input
                        label="Login (Username)"
                        value={receptionistForm.username}
                        onChange={e => setReceptionistForm({ ...receptionistForm, username: e.target.value })}
                        required={!editingReceptionistId}
                        placeholder="resepshn_login"
                     />
                     <Input
                        label={t('settings.staff.password')}
                        type="password"
                        value={receptionistForm.password}
                        onChange={e => setReceptionistForm({ ...receptionistForm, password: e.target.value })}
                        required={!editingReceptionistId}
                        placeholder={editingReceptionistId ? "O'zgartirish uchun kiriting" : "********"}
                     />
                  </div>
               </div>
               <div className="flex justify-end gap-2 pt-4">
                  <Button type="button" variant="secondary" onClick={() => setIsReceptionistModalOpen(false)}>{t('common.cancel')}</Button>
                  <Button type="submit">{t('common.save')}</Button>
               </div>
            </form>
         </Modal>

         {/* Add/Edit Lab Technician Modal */}
         <Modal isOpen={isLabTechModalOpen} onClose={() => setIsLabTechModalOpen(false)} title={editingLabTechId ? 'Texnikni Tahrirlash' : 'Texnik Qo\'shish'}>
            <form onSubmit={handleLabTechSubmit} className="space-y-4">
               <div className="grid grid-cols-2 gap-4">
                  <Input label="Ism" value={labTechForm.firstName} onChange={e => setLabTechForm({ ...labTechForm, firstName: e.target.value })} required />
                  <Input label="Familiya" value={labTechForm.lastName} onChange={e => setLabTechForm({ ...labTechForm, lastName: e.target.value })} required />
               </div>
               <Input label="Mutaxassislik" value={labTechForm.specialty} onChange={e => setLabTechForm({ ...labTechForm, specialty: e.target.value })} placeholder="Koronka, Protez, Veneer..." required />
               <Input label="Telefon" value={labTechForm.phone} onChange={e => setLabTechForm({ ...labTechForm, phone: e.target.value })} required />
               <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Tizimga kirish (ixtiyoriy)</p>
                  <div className="grid grid-cols-2 gap-4">
                     <Input
                        label="Login (Username)"
                        value={labTechForm.username}
                        onChange={e => setLabTechForm({ ...labTechForm, username: e.target.value })}
                        placeholder="texnik_login"
                     />
                     <Input
                        label="Parol"
                        type="password"
                        value={labTechForm.password}
                        onChange={e => setLabTechForm({ ...labTechForm, password: e.target.value })}
                        placeholder={editingLabTechId ? "O'zgartirish uchun kiriting" : "********"}
                     />
                  </div>
               </div>
               <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="secondary" onClick={() => setIsLabTechModalOpen(false)}>{t('common.cancel')}</Button>
                  <Button type="submit">{t('common.save')}</Button>
               </div>
            </form>
         </Modal>

         {/* Delete Lab Technician Confirmation Modal */}
         <Modal isOpen={!!deleteConfirmLabTech} onClose={() => setDeleteConfirmLabTech(null)} title="Texnikni O'chirish">
            <div className="text-center space-y-4">
               <div className="mx-auto w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                  <Trash2 className="w-6 h-6 text-red-600" />
               </div>
               <h3 className="text-lg font-medium text-gray-900 dark:text-white">Ishonchingiz komilmi?</h3>
               <p className="text-gray-600 dark:text-gray-300">
                  <strong>{deleteConfirmLabTech?.firstName} {deleteConfirmLabTech?.lastName}</strong> texnikni o'chirasizmi? {t('common.confirmDeleteDesc')}
               </p>
               <div className="flex justify-center gap-3 pt-4">
                  <Button variant="secondary" onClick={() => setDeleteConfirmLabTech(null)}>{t('common.cancel')}</Button>
                  <Button
                     className="bg-red-600 hover:bg-red-700 text-white border-none"
                     onClick={() => {
                        if (deleteConfirmLabTech && onDeleteLabTechnician) {
                           onDeleteLabTechnician(deleteConfirmLabTech.id);
                           setDeleteConfirmLabTech(null);
                        }
                     }}
                  >
                     Ha, O'chirish
                  </Button>
               </div>
            </div>
         </Modal>

         {/* Delete Receptionist Confirmation Modal */}
         <Modal isOpen={!!deleteConfirmReceptionist} onClose={() => setDeleteConfirmReceptionist(null)} title={t('settings.staff.deleteReceptionistConfirm')}>
            <div className="text-center space-y-4">
               <div className="mx-auto w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                  <Trash2 className="w-6 h-6 text-red-600" />
               </div>
               <h3 className="text-lg font-medium text-gray-900 dark:text-white">Ishonchingiz komilmi?</h3>
               <p className="text-gray-600 dark:text-gray-300">
                  {t('settings.staff.deleteReceptionistConfirm')} <br />
                   <strong>{deleteConfirmReceptionist?.firstName} {deleteConfirmReceptionist?.lastName}</strong>. {t('common.confirmDeleteDesc')}
               </p>
               <div className="flex justify-center gap-3 pt-4">
                  <Button variant="secondary" onClick={() => setDeleteConfirmReceptionist(null)}>{t('common.cancel')}</Button>
                  <Button
                     className="bg-red-600 hover:bg-red-700 text-white border-none"
                     onClick={() => {
                        if (deleteConfirmReceptionist && onDeleteReceptionist) {
                           onDeleteReceptionist(deleteConfirmReceptionist.id);
                           setDeleteConfirmReceptionist(null);
                        }
                     }}
                  >
                     Ha, O'chirish
                  </Button>
               </div>
            </div>
         </Modal>
         {/* Facebook Page Selection Modal */}
         <Modal isOpen={isFBPageModalOpen} onClose={() => setIsFBPageModalOpen(false)} title="Facebook Sahifasini Tanlang">
            <div className="space-y-4">
               <p className="text-sm text-gray-500 mb-4">
                  Quyidagi sahifalardan birini tanlang. Ushbu sahifaga kelgan arizalar tizimga avtomatik tushadi.
               </p>
               <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1 custom-scrollbar">
                  {facebookPages.map(page => (
                     <button
                        key={page.id}
                        onClick={() => handleSelectFBPage(page)}
                        className="w-full flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 hover:bg-primary-50 dark:hover:bg-primary-900/30 border border-gray-100 dark:border-gray-700 rounded-xl transition-all group"
                     >
                        <div className="flex items-center gap-3 text-left">
                           <div className="w-10 h-10 bg-primary-100 dark:bg-primary-900/40 rounded-lg flex items-center justify-center text-primary-600 dark:text-primary-400">
                              <Facebook className="w-6 h-6" />
                           </div>
                           <div>
                              <div className="font-bold text-gray-900 dark:text-white group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
                                 {page.name}
                               </div>
                              <div className="text-xs text-gray-500 dark:text-gray-400">ID: {page.id}</div>
                           </div>
                        </div>
                        <div className="w-8 h-8 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 flex items-center justify-center group-hover:border-primary-500 transition-colors">
                           <Plus className="w-4 h-4 text-gray-400 group-hover:text-primary-500" />
                        </div>
                     </button>
                  ))}
                  {facebookPages.length === 0 && (
                     <div className="py-8 text-center bg-gray-50 dark:bg-gray-800/50 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700">
                        <Facebook className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                        <p className="text-sm text-gray-500">Hech qanday sahifa topilmadi</p>
                     </div>
                  )}
               </div>
               <div className="flex justify-end pt-4">
                  <Button variant="secondary" onClick={() => setIsFBPageModalOpen(false)}>Yopish</Button>
               </div>
            </div>
         </Modal>
      {/* Bo'lim yaratish va tahrirlash */}
      {deptModal && (
         <Modal isOpen={true} onClose={() => setDeptModal(null)}
            title={deptModal.mode === 'edit' ? 'Bo\'limni tahrirlash' : 'Yangi bo\'lim'}>
            <div className="space-y-4">
               <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nomi</label>
                  <Input value={deptForm.name}
                     onChange={(e: any) => setDeptForm(f => ({ ...f, name: e.target.value }))}
                     placeholder="Masalan: Kardiologiya" />
               </div>

               <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                     <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Kod</label>
                     <Input value={deptForm.code}
                        onChange={(e: any) => setDeptForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
                        placeholder="KARD" />
                     <p className="text-xs text-gray-400 mt-1">Qisqa, takrorlanmaydigan belgi</p>
                  </div>
                  <div>
                     <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tartib</label>
                     <Input type="number" value={deptForm.sortOrder}
                        onChange={(e: any) => setDeptForm(f => ({ ...f, sortOrder: e.target.value }))} />
                     <p className="text-xs text-gray-400 mt-1">Ro'yxatlarda joyi</p>
                  </div>
               </div>

               <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Turi</label>
                  <Select value={deptForm.type}
                     onChange={(e: any) => setDeptForm(f => ({ ...f, type: e.target.value }))}>
                     {(Object.keys(DEPARTMENT_TYPE_LABELS) as DepartmentType[]).map((k) => (
                        <option key={k} value={k}>{DEPARTMENT_TYPE_LABELS[k]}</option>
                     ))}
                  </Select>
                  {/* Turni tushuntirish TALTIQ emas: noto'g'ri tanlangan tur — keyin
                      hech kim topa olmaydigan bo'lim. */}
                  <div className="mt-2 p-3 bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 rounded-lg text-xs text-gray-600 dark:text-gray-300 space-y-1">
                     <p><b>Klinik</b> — registraturada bemor shu bo'limga yoziladi</p>
                     <p><b>Laboratoriya</b> — tahlillar katalogi va yo'llanmalar</p>
                     <p><b>Diagnostika</b> — UZI, EKG, rentgen</p>
                     <p><b>Statsionar</b> — palata va koykalar</p>
                     <p><b>Dorixona</b> — ombor va retseptlar</p>
                  </div>
               </div>

               <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Rangi</label>
                  <div className="flex flex-wrap gap-2">
                     {DEPT_COLORS.map((c) => (
                        <button key={c.value} type="button"
                           onClick={() => setDeptForm(f => ({ ...f, color: c.value }))}
                           title={c.name}
                           className={`w-8 h-8 rounded-full border-2 transition-transform
                              ${deptForm.color === c.value
                                 ? 'border-gray-900 dark:border-white scale-110'
                                 : 'border-transparent hover:scale-105'}`}
                           style={{ backgroundColor: c.value }} />
                     ))}
                  </div>
                  <p className="text-xs text-gray-400 mt-2">Navbat tablosida va kalendarda ishlatiladi</p>
               </div>

               {deptError && (
                  <p className="text-sm text-red-600 dark:text-red-400">{deptError}</p>
               )}

               <div className="flex justify-end gap-2 pt-2">
                  <Button variant="secondary" onClick={() => setDeptModal(null)}>Bekor qilish</Button>
                  <Button onClick={saveDepartment}
                     disabled={deptBusy || !deptForm.name.trim() || !deptForm.code.trim()}>
                     {deptBusy ? 'Saqlanmoqda…' : 'Saqlash'}
                  </Button>
               </div>
            </div>
         </Modal>
      )}

      {/* Tiklashni tasdiqlash. Amal QAYTARILMAYDI, shuning uchun oddiy "Ha" yetarli
          emas: foydalanuvchi nusxa sanasini o'z qo'li bilan yozib tasdiqlaydi. */}
      {restoreTarget && (
         <Modal isOpen={true} onClose={() => setRestoreTarget(null)} title="Zaxiradan tiklash">
            <div className="space-y-4">
               <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                  <div className="flex items-start gap-3">
                     <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                     <div className="text-sm text-red-800 dark:text-red-200 space-y-2">
                        <p className="font-semibold">
                           {fmtWhen(restoreTarget.createdAt)} dan KEYIN kiritilgan barcha ma'lumot yo'qoladi.
                        </p>
                        <p>
                           Bu qabullar, to'lovlar, tahlil natijalari va boshqa hamma narsaga tegishli.
                           Joriy baza almashtirishdan oldin avtomatik saqlanadi, lekin unga qaytish
                           faqat qo'lda mumkin.
                        </p>
                     </div>
                  </div>
               </div>

               <div className="text-sm text-gray-600 dark:text-gray-300 space-y-1">
                  <p><span className="text-gray-400">Nusxa:</span> <span className="font-mono">{restoreTarget.file}</span></p>
                  <p><span className="text-gray-400">Hajmi:</span> {fmtBytes(restoreTarget.sizeBytes)}</p>
                  <p><span className="text-gray-400">Fayllar arxivi:</span> {restoreTarget.hasUploads ? 'bor' : 'yo’q'}</p>
               </div>

               <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                     Tasdiqlash uchun <span className="font-mono font-bold">TIKLASH</span> deb yozing
                  </label>
                  <Input
                     value={restoreConfirmText}
                     onChange={(e: any) => setRestoreConfirmText(e.target.value)}
                     placeholder="TIKLASH"
                  />
               </div>

               <p className="text-xs text-gray-500 dark:text-gray-400">
                  Tiklash darhol bajarilmaydi: server bazani ochiq tutadi. Belgi qo'yiladi va
                  almashtirish dastur qayta ishga tushganda bo'ladi. Shu paytgacha bekor qilish mumkin.
               </p>

               <div className="flex justify-end gap-2 pt-2">
                  <Button variant="secondary" onClick={() => setRestoreTarget(null)}>Bekor qilish</Button>
                  <Button
                     onClick={handleStageRestore}
                     disabled={backupBusy || restoreConfirmText.trim().toUpperCase() !== 'TIKLASH'}
                  >
                     Tiklashni belgilash
                  </Button>
               </div>
            </div>
         </Modal>
      )}
      </div>
   );
};