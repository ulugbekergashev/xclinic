import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatMoney, formatFullName } from '../utils/format';
import { confirmAction } from '../services/confirm';
import { toast } from '../services/toast';
import { Card, Button, Input, Modal, Select } from '../components/Common';

import { UserRole, Doctor, Receptionist, Clinic, Service, ServiceCategory, Review, LabTechnician, AccessControl, RoleAccess, LeadApiKeyInfo, DepartmentType, DEPARTMENT_TYPE_LABELS } from '../types';
import { User, DollarSign, Users, Edit, Trash2, CheckCircle, Bot, Phone, Star, MessageSquare, Building2, Plus, Activity, RefreshCw, FlaskConical, Shield, KeyRound, Copy, Eye, EyeOff, Link2, ChevronDown, HardDrive, Database, AlertTriangle, Download, HeartPulse, History, ArrowRight, Wifi, Cloud, Check } from 'lucide-react';
import { api, API_URL, getAuthToken, isDemoMode } from '../services/api';
import type { AiSettingsResponse } from '../services/api';
import { useLanguage } from '../context/LanguageContext';
import { parseAccessControl } from '../utils/accessControl';
import { NetworkAccessTab } from '../components/NetworkAccessTab';
import { LabCatalogTab } from '../components/LabCatalogTab';
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


const ROLE_LABEL: Record<string, string> = {
   CLINIC_ADMIN: 'Klinika egasi', DOCTOR: 'Shifokor', RECEPTIONIST: 'Registrator',
   NURSE: 'Hamshira', LAB_TECHNICIAN: 'Laborant',
};
const ACTION_LABEL: Record<string, string> = {
   View: "Ko'rdi", Create: "Yaratdi", Update: "O'zgartirdi",
   Delete: "O'chirdi", Print: "Bosdi", Export: "Yukladi",
};
const ENTITY_LABEL: Record<string, string> = {
   Patient: 'Bemor kartasi', Visit: 'Qabul', PatientDocument: 'Hujjat',
   PatientPhoto: 'Surat', DiagnosticStudy: 'Tekshiruv', LabOrder: 'Tahlil',
};

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
   onAddDoctor: (doctor: Omit<Doctor, 'id' | 'clinicId'>) => void;
   onUpdateDoctor: (id: string, doctor: Partial<Doctor>) => void;
   onDeleteDoctor: (id: string) => void;
   onAddReceptionist?: (receptionist: Omit<Receptionist, 'id'>) => void;
   onUpdateReceptionist?: (id: string, receptionist: Partial<Receptionist>) => void;
   onDeleteReceptionist?: (id: string) => void;
   onAddLabTechnician?: (tech: Omit<LabTechnician, 'id' | 'status'>) => void;
   onUpdateLabTechnician?: (id: string, tech: Partial<LabTechnician>) => void;
   onDeleteLabTechnician?: (id: string) => void;
   currentClinic?: Clinic;
   reviews: Review[];
}

export const Settings: React.FC<SettingsProps> = ({
   userRole, services, categories, doctors, receptionists = [], labTechnicians = [], onAddService, onUpdateService, onDeleteService, onAddCategory, onDeleteCategory, onAddDoctor, onUpdateDoctor, onDeleteDoctor, onAddReceptionist, onUpdateReceptionist, onDeleteReceptionist, onAddLabTechnician, onUpdateLabTechnician, onDeleteLabTechnician, currentClinic, reviews
}) => {
   const { t } = useLanguage();
   const navigate = useNavigate();
   /* Kompyuterdagi bulut papkalari — «Xizmat ko'rsatish» bo'limi ochilganda
      bir marta so'raladi. Topilmasa oddiy papka tanlash qoladi. */
   const [cloudFolders, setCloudFolders] = useState<{ path: string; label: string }[]>([]);
   const [activeTab, setActiveTab] = useState<'general' | 'services' | 'doctors' | 'receptionists' | 'labTechnicians' | 'nurses' | 'messaging' | 'dmed' | 'access' | 'accessLog' | 'maintenance' | 'network' | 'labCatalog' | 'departments' | 'ai'>('services');

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
         toast.error(error?.message || 'Kassa sozlamasini saqlashda xatolik');
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
         toast.error(error?.message || 'Ruxsatlarni saqlashda xatolik. Backend yangilanganiga ishonch hosil qiling.');
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
         if (currentClinic?.id && currentClinic?.botToken) {
            try {
               // Token xotiradan olinadi (S1.3) — diskda saqlanmaydi.
               const token = getAuthToken();
               if (!token) {
                  console.error('No token found in auth data');
                  return;
               }

               // Demoda Telegram boti yo'q — so'rov yubormaymiz.
               if (isDemoMode()) return;

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
               if (data.botUsername) {
                  setBotUsername(data.botUsername);
               }
            } catch (err) {
               console.error('Failed to fetch bot username:', err);
            }
         } else {
            setBotUsername(null);
         }
      };
      fetchBotUsername();
   }, [currentClinic?.id, currentClinic?.botToken]);

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
      if (!await confirmAction({ title: 'Kategoriyani o\'chirmoqchimisiz?' })) return;
      onDeleteCategory(id);
      if (selectedCategory === id) setSelectedCategory(null);
   };

   const handleOpenDoctorModal = (doctor?: Doctor) => {
      /* TARIF BO'YICHA SHIFOKOR CHEGARASI OLIB TASHLANDI.
         XClinic bitta klinikaga o'rnatiladi va obuna sifatida sotilmaydi —
         klinika nechta shifokor ochishini o'zi hal qiladi. Server tomondagi
         tekshiruv ham shu bilan birga olib tashlandi. */

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
         toast.error(error.message || t('common.error'));
      }
   };

   const handleSmsTest = async () => {
      if (!currentClinic?.id || !smsTestPhone) return;
      setIsCheckingSms(true);
      try {
         const res = await api.sms.testSend(currentClinic.id, smsTestPhone);
         if (res.success) {
            toast.success('Test SMS muvaffaqiyatli yuborildi!');
         }
      } catch (error: any) {
         toast.error(error.message || 'SMS yuborishda xatolik yuz berdi. Sozlamalarni tekshiring.');
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
         toast.error('DMED sozlamalarini saqlashda xatolik yuz berdi');
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
            toast.success('DMED ulanishi muvaffaqiyatli!');
         } else {
            toast.error('Ulanishda xatolik: ' + ((res as any).error || 'Noma\'lum xatolik'));
         }
      } catch (error: any) {
         toast.error('DMED test xatosi: ' + error.message);
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
         toast.error(t('common.error'));
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
         toast.error(t('common.error'));
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
         toast.error(t('common.error'));
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
                     <Button onClick={(e) => { e.preventDefault(); toast.error(t('settings.general.saved')); }}>{t('common.save')}</Button>
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
   /* Avtomatik nusxa: holat serverdan, `cfgDraft` esa tahrirlanayotgan nusxa.
      Ikkisi alohida — saqlanmagan o'zgarish holat yangilanganda yo'qolmasin. */
   const [backupStatus, setBackupStatus] = useState<any>(null);
   const [cfgDraft, setCfgDraft] = useState<any>(null);
   const [cfgBusy, setCfgBusy] = useState(false);

   const loadMaintenance = React.useCallback(async () => {
      setMaintLoading(true);
      setMaintError('');
      try {
         const [sch, list, rst, st] = await Promise.all([
            api.maintenance.schemaStatus(),
            api.maintenance.backups(),
            api.maintenance.restoreState(),
            api.maintenance.backupStatus(),
         ]);
         setSchemaInfo(sch);
         setBackupList(list);
         setRestoreState(rst);
         setBackupStatus(st);
         setCfgDraft((cur: any) => cur || st.config);
      } catch (e: any) {
         setMaintError(e?.message || 'Ma\'lumotni yuklab bo\'lmadi');
      } finally {
         setMaintLoading(false);
      }
   }, []);

   const handleSaveBackupConfig = async () => {
      if (!cfgDraft) return;
      setCfgBusy(true);
      setMaintError('');
      try {
         const saved = await api.maintenance.saveBackupConfig(cfgDraft);
         setCfgDraft(saved);
         await loadMaintenance();
      } catch (e: any) {
         setMaintError(e?.message || 'Sozlamani saqlab bo\'lmadi');
      } finally {
         setCfgBusy(false);
      }
   };

   /* Yaxlitlik tekshiruvi — ATAYLAB avtomatik yuklanmaydi. U butun bazani
      skanerlaydi va tabga har kirganda yuritish ortiqcha yuk. */
   const [integrity, setIntegrity] = useState<any>(null);
   const [integrityBusy, setIntegrityBusy] = useState(false);
   const [balanceFix, setBalanceFix] = useState<any>(null);

   const handleCheckIntegrity = async () => {
      setIntegrityBusy(true);
      setMaintError('');
      try {
         setIntegrity(await api.maintenance.integrity());
      } catch (e: any) {
         setMaintError(e?.message || 'Tekshirib bo\'lmadi');
      } finally {
         setIntegrityBusy(false);
      }
   };

   const handleRecalcBalances = async (confirm: boolean) => {
      setIntegrityBusy(true);
      setMaintError('');
      try {
         const r = await api.maintenance.recalculateBalances(confirm);
         setBalanceFix(r);
         if (confirm) {
            setIntegrity(await api.maintenance.integrity());
         }
      } catch (e: any) {
         setMaintError(e?.message || 'Qayta hisoblab bo\'lmadi');
      } finally {
         setIntegrityBusy(false);
      }
   };

   const handlePickExtraDir = async () => {
      // Electron ichida papka tanlash oynasi; brauzerda bu imkoniyat yo'q
      // preload.ts `electron` nomi bilan ochadi (`electronAPI` emas)
      const picker = (window as any).electron?.selectBackupFolder;
      if (!picker) {
         setMaintError('Papka tanlash faqat dastur oynasida ishlaydi. Yo\'lni qo\'lda kiriting.');
         return;
      }
      try {
         const dir = await picker();
         if (dir) setCfgDraft((c: any) => ({ ...c, extraDir: dir }));
      } catch (e: any) {
         setMaintError(e?.message || 'Papka tanlanmadi');
      }
   };

   React.useEffect(() => {
      if (activeTab === 'maintenance' && userRole === UserRole.CLINIC_ADMIN) loadMaintenance();
   }, [activeTab, userRole, loadMaintenance]);

   /* Bulut papkalari alohida so'raladi: ular topilmasa ham qolgan
      sozlamalar ishlashi kerak. */
   React.useEffect(() => {
      if (activeTab !== 'maintenance' || userRole !== UserRole.CLINIC_ADMIN) return;
      api.maintenance.cloudFolders()
         .then(r => setCloudFolders(r.folders || []))
         .catch(() => setCloudFolders([]));
   }, [activeTab, userRole]);

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

   /* ─── Kirish jurnali (reliz 6) ─────────────────────────────────────────
      Faqat egaga ko'rinadi. Ro'yxat 500 yozuv bilan cheklangan — jurnal
      tez o'sadigan jadval, va butun tarixni ekranga tortishning ma'nosi yo'q. */
   const [logData, setLogData] = useState<any>(null);
   const [logLoading, setLogLoading] = useState(false);
   const [logError, setLogError] = useState('');
   const [logFrom, setLogFrom] = useState(() => {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      return d.toISOString().slice(0, 10);
   });
   const [logTo, setLogTo] = useState(() => new Date().toISOString().slice(0, 10));
   const [logAction, setLogAction] = useState('');

   const loadAccessLog = React.useCallback(async () => {
      setLogLoading(true);
      setLogError('');
      try {
         setLogData(await api.compliance.accessLog({
            from: logFrom, to: logTo,
            action: logAction || undefined,
         }));
      } catch (e: any) {
         setLogError(e?.message || 'Jurnal yuklanmadi');
      } finally {
         setLogLoading(false);
      }
   }, [logFrom, logTo, logAction]);

   React.useEffect(() => {
      if (activeTab === 'accessLog' && userRole === UserRole.CLINIC_ADMIN) loadAccessLog();
   }, [activeTab, userRole, loadAccessLog]);

   /* ─── Hamshiralar (reliz 4) ────────────────────────────────────────────
      Ro'yxat ota-komponentdan kelmaydi: bu bo'lim faqat egaga ko'rinadi va
      butun ilovaga hamshiralar keshi kerak emas. */
   const [nurses, setNurses] = useState<any[]>([]);
   const [nurseLoading, setNurseLoading] = useState(false);
   const [nurseError, setNurseError] = useState('');
   const [nurseModal, setNurseModal] = useState<any | null>(null);
   const [nurseForm, setNurseForm] = useState({
      firstName: '', lastName: '', phone: '', departmentId: '', username: '', password: '', status: 'Active',
   });
   const [nurseSaving, setNurseSaving] = useState(false);
   const [deleteNurse, setDeleteNurse] = useState<any | null>(null);

   const loadNurses = React.useCallback(async () => {
      setNurseLoading(true);
      setNurseError('');
      try {
         setNurses(await api.nurses.getAll());
      } catch (e: any) {
         setNurseError(e?.message || "Ro'yxatni yuklab bo'lmadi");
      } finally {
         setNurseLoading(false);
      }
   }, []);

   React.useEffect(() => {
      if (activeTab === 'nurses' && userRole === UserRole.CLINIC_ADMIN) {
         loadNurses();
         // Bo'lim nomlarini ko'rsatish uchun ro'yxat kerak
         if (deptList.length === 0) loadDepartments();
      }
   }, [activeTab, userRole, loadNurses]);

   const openNurseModal = (nr?: any) => {
      setNurseForm({
         firstName: nr?.firstName || '',
         lastName: nr?.lastName || '',
         phone: nr?.phone || '',
         departmentId: nr?.departmentId || '',
         username: nr?.username || '',
         // Parol hech qachon serverdan kelmaydi: bo'sh qoldirilsa o'zgarmaydi
         password: '',
         status: nr?.status || 'Active',
      });
      setNurseModal(nr || {});
   };

   const saveNurse = async () => {
      if (!nurseForm.firstName.trim() || !nurseForm.lastName.trim()) return;
      setNurseSaving(true);
      try {
         const payload: any = {
            firstName: nurseForm.firstName.trim(),
            lastName: nurseForm.lastName.trim(),
            phone: nurseForm.phone.trim() || undefined,
            departmentId: nurseForm.departmentId || null,
            username: nurseForm.username.trim() || undefined,
            status: nurseForm.status,
         };
         if (nurseForm.password.trim()) payload.password = nurseForm.password.trim();

         if (nurseModal?.id) await api.nurses.update(nurseModal.id, payload);
         else await api.nurses.create(payload);

         setNurseModal(null);
         await loadNurses();
      } catch (e: any) {
         setNurseError(e?.message || 'Saqlanmadi');
      } finally {
         setNurseSaving(false);
      }
   };

   const confirmDeleteNurse = async () => {
      if (!deleteNurse?.id) return;
      try {
         await api.nurses.remove(deleteNurse.id);
         setDeleteNurse(null);
         await loadNurses();
      } catch (e: any) {
         setNurseError(e?.message || "O'chirilmadi");
      }
   };

   /* KOD NOMDAN O'ZI YASALADI.

      Ilgari «Saqlash» tugmasi `name` VA `code` to'lmaguncha o'chiq turardi,
      lekin «Kod» maydonida majburiyligi haqida hech qanday belgi yo'q edi.
      Natijasi: odam nomni yozadi, tugma jim o'chiq qoladi va nima
      yetishmayotgani aytilmaydi — tashqaridan bu «tugma ishlamayapti»
      bo'lib ko'rinadi. Aynan shu holat sinovda ushlandi.

      Endi kod nomdan hosil bo'ladi (KARDIOLOGIYA → KARD) va foydalanuvchi
      xohlasa uni qo'lda o'zgartiradi. Takrorlanmasligi ham shu yerda
      ta'minlanadi: bandi bo'lsa oxiriga raqam qo'shiladi. */
   const makeDeptCode = (name: string) => {
      const base = name.trim().toUpperCase()
         .replace(/['''`ʻʼ]/g, '')          // apostroflar tashlanadi: O'PKA → OPKA
         .replace(/[^A-ZА-ЯЁ0-9]/g, '')     // faqat harf va raqam
         .slice(0, 4);
      if (!base) return '';
      const taken = new Set(deptList.map((d: any) => String(d.code || '').toUpperCase()));
      if (!taken.has(base)) return base;
      for (let i = 2; i < 100; i++) {
         const next = `${base.slice(0, 3)}${i}`;
         if (!taken.has(next)) return next;
      }
      return base;
   };

   /** Kodni foydalanuvchi O'ZI tahrirladimi. Tahrirlagan bo'lsa nomni
    *  o'zgartirish uning yozganini bosib ketmaydi. */
   const [deptCodeTouched, setDeptCodeTouched] = useState(false);

   const openDeptCreate = () => {
      setDeptForm({ name: '', code: '', type: 'CLINICAL', color: DEPT_COLORS[0].value, sortOrder: String((deptList.length + 1) * 10) });
      setDeptCodeTouched(false);
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
      /* Tahrirlashda kod ALLAQACHON bor — uni nomdan qayta yasash
         mavjud bo'limning kodini almashtirib yuborardi. */
      setDeptCodeTouched(true);
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
      /* TASDIQLASH SO'RALADI. Ilgari bu tugma darhol ishlardi va nomi ham
         «O'chirish» edi — ya'ni Terapiya yonidagi tugmani tasodifan
         bosgan odam registratura, kalendar va shifokorlar ro'yxatini bir
         zumda ishdan chiqarardi, hech qanday ogohlantirishsiz
         (audit XC-39). Yozuv o'chmaydi, faqat faolsizlanadi — matn ham
         shuni aytadi. */
      if (d.isActive) {
         const bound = [
            services.filter((s: any) => s.departmentId === d.id).length,
            doctors.filter((x: any) => x.departmentId === d.id).length,
         ];
         const detail = (bound[0] || bound[1])
            ? ` Unga ${bound[0]} ta xizmat va ${bound[1]} ta shifokor bog'langan.`
            : '';
         if (!await confirmAction({
            title: `«${d.name}» faolsizlantirilsinmi?`,
            body: `Bo'lim registratura, kalendar va yangi qabullardan yo'qoladi.${detail}`
               + " Eski yozuvlar joyida qoladi va bo'limni istalgan vaqtda qayta yoqish mumkin.",
            /* `danger` YO'Q: amal qaytariladi, qizil tugma esa qo'rqitadi. */
            confirmLabel: 'Faolsizlantirish',
         })) return;
      }
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

   /* ─── AI yordamchi kalitlari ───────────────────────────────────────
      Ilgari kalit faqat serverdagi `.env` faylida edi: klinika AI ni o’zi
      yoqa olmasdi, bizga murojaat qilib yangi build kutardi.

      Maydonlar HAR DOIM bo’sh ochiladi — server kalitning o’zini
      qaytarmaydi, faqat «bor/yo’q», oxirgi 4 belgi va qayerdan kelgani.
      Bo’sh qoldirilgan maydon «tegma» degani; o’chirish alohida tugma
      bilan, aks holda forma har saqlashda kalitlarni yo’q qilib
      yuborardi. */
   const [aiSettings, setAiSettings] = useState<AiSettingsResponse | null>(null);
   const [aiDraft, setAiDraft] = useState<Record<string, string>>({});
   const [aiPreferred, setAiPreferred] = useState<string>('');
   const [aiBusy, setAiBusy] = useState(false);
   const [aiTesting, setAiTesting] = useState(false);
   const [aiTest, setAiTest] = useState<{ ok: boolean; text: string } | null>(null);

   const loadAiSettings = React.useCallback(async () => {
      try {
         const data = await api.ai.getSettings();
         setAiSettings(data);
         setAiPreferred(data.preferred || '');
      } catch (err: any) {
         toast.error(err?.message || 'AI sozlamalarini olib bo’lmadi');
      }
   }, []);

   React.useEffect(() => {
      if (activeTab === 'ai' && userRole === UserRole.CLINIC_ADMIN) loadAiSettings();
   }, [activeTab, userRole, loadAiSettings]);

   const handleAiSave = async (e: React.FormEvent) => {
      e.preventDefault();
      setAiBusy(true);
      setAiTest(null);
      try {
         const keys: Record<string, string> = {};
         for (const [name, value] of Object.entries(aiDraft)) {
            if (value.trim()) keys[name] = value.trim();
         }
         const data = await api.ai.saveSettings({ keys, preferred: aiPreferred || null });
         setAiSettings(data);
         setAiDraft({});
         toast.success('Saqlandi');
      } catch (err: any) {
         toast.error(err?.message || 'Saqlab bo’lmadi');
      } finally {
         setAiBusy(false);
      }
   };

   const handleAiClear = async (name: string, label: string) => {
      if (!await confirmAction({
         title: `${label} kaliti o'chirilsinmi?`,
         body: 'AI boshqa provayder kaliti bilan ishlashda davom etadi. Kalit qolmasa — AI yordamchi o’chadi.',
         danger: true,
         confirmLabel: "O'chirish",
      })) return;
      setAiBusy(true);
      try {
         const data = await api.ai.saveSettings({ keys: { [name]: '' } });
         setAiSettings(data);
         toast.success('Kalit o’chirildi');
      } catch (err: any) {
         toast.error(err?.message || 'O’chirib bo’lmadi');
      } finally {
         setAiBusy(false);
      }
   };

   /* Tekshiruv SAQLAGANDAN KEYIN ishlaydi: server o’zidagi kalit bilan
      haqiqiy so’rov yuboradi. Shuning uchun «saqlamasdan tekshirish»
      yo’q — u yolg’on natija berardi. */
   const handleAiTest = async () => {
      setAiTesting(true);
      setAiTest(null);
      try {
         const r = await api.ai.test();
         setAiTest({ ok: true, text: r.message || 'Ulanish ishladi.' });
      } catch (err: any) {
         setAiTest({ ok: false, text: err?.message || 'Ulanib bo’lmadi' });
      } finally {
         setAiTesting(false);
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
                  /* Personal bilan EGASI shug'ullanadi. Ilgari bu uchta
                     bo'lim registratorga ham ko'rinardi va u login yaratib,
                     undan kira olardi — backend rolni tekshirmasdi. Endi
                     server 403 qaytaradi, shuning uchun bo'limlarning o'zi
                     ham yashiriladi: bosib bo'lmaydigan tugma ko'rsatmaymiz. */
                  ...(userRole === UserRole.CLINIC_ADMIN ? [
                     { id: 'doctors', name: t('settings.tabs.doctors'), icon: Users },
                     { id: 'receptionists', name: t('settings.tabs.receptionists'), icon: Phone },
                     { id: 'labTechnicians', name: t('settings.tabs.labTechnicians'), icon: FlaskConical },
                     { id: 'nurses', name: 'Hamshiralar', icon: HeartPulse },
                  ] : []),
                  /* Tarmoq havolasi — registrator ham ko'radi: telefonini
                     ulash yoki ikkinchi kompyuterni sozlash uning ishi. */
                  { id: 'network', name: t('net.tab'), icon: Wifi },
                  { id: 'messaging', name: "SMS va Telegram", icon: MessageSquare },
                  { id: 'dmed', name: "DMED (IT-MED)", icon: Activity },
                  ...(userRole === UserRole.CLINIC_ADMIN ? [{ id: 'access', name: 'Ruxsatlar', icon: Shield }] : []),
                  ...(userRole === UserRole.CLINIC_ADMIN ? [{ id: 'accessLog', name: 'Kirish jurnali', icon: History }] : []),
                  ...(userRole === UserRole.CLINIC_ADMIN ? [{ id: 'departments', name: 'Bo’limlar', icon: Building2 }] : []),
                  /* Tahlillar katalogi. Laboratoriya ekrani katalog bo'sh
                     bo'lganda AYNAN shu yerga yuborardi, lekin bunday
                     vkladka mavjud emas edi. */
                  ...(userRole === UserRole.CLINIC_ADMIN ? [{ id: 'labCatalog', name: t('lab.tab'), icon: FlaskConical }] : []),
                  ...(userRole === UserRole.CLINIC_ADMIN ? [{ id: 'maintenance', name: 'Xizmat ko’rsatish', icon: HardDrive }] : []),
                  // AI kalitlari pul turadigan resurs — faqat klinika egasi ko'radi.
                  ...(userRole === UserRole.CLINIC_ADMIN ? [{ id: 'ai', name: 'AI yordamchi', icon: Bot }] : []),
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
                              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                                 {clinicAvgRating > 0 ? clinicAvgRating.toFixed(1) : '0.0'}
                              </h2>
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
                        <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-6">{t('settings.general.info')}</h2>
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
                              <h2 className="text-xl font-bold text-gray-900 dark:text-white">Oldindan To'lov (Bron uchun)</h2>
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
               {activeTab === 'ai' && userRole === UserRole.CLINIC_ADMIN && (
                  <div className="space-y-6">
                     <Card className="p-6">
                        <div className="flex items-center gap-4 mb-6">
                           <div className="p-3 bg-violet-100 dark:bg-violet-900/40 rounded-xl text-violet-600 dark:text-violet-400">
                              <Bot className="w-8 h-8" />
                           </div>
                           <div>
                              <h2 className="text-xl font-bold text-gray-900 dark:text-white">AI yordamchi</h2>
                              <p className="text-sm text-gray-500">
                                 «Bugun nechta qabul bor?» kabi savollar va hisobotlar uchun. Ishlashi uchun
                                 kamida bitta provayder kaliti kerak.
                              </p>
                           </div>
                        </div>

                        <div className="bg-primary-50 dark:bg-primary-900/20 p-4 rounded-lg border border-primary-100 dark:border-primary-800/40 mb-6 space-y-2">
                           <p className="text-sm text-primary-800 dark:text-primary-200">
                              <strong>Uchtasidan bittasi yetadi.</strong> Bir nechtasi kiritilsa, biri limitga
                              urilganda ikkinchisiga avtomatik o’tadi.
                           </p>
                           {/* MATN ROSTGA MOSLANDI (audit XC-37, XC-38).

                               Ilgari bu yerda ikkita noaniq gap turardi:

                               1. «Kalit brauzerga uzatilmaydi» — bu FAQAT
                                  klinika o'rnatmasida to'g'ri. Namoyish
                                  nusxasida server umuman yo'q, shuning uchun
                                  u yerda kalit saqlanmaydi va matn ham
                                  boshqacha bo'lishi kerak.

                               2. «Bemor ismi va tashxisi AI ga yuboriladi» —
                                  bu ESKIRGAN: `backend/ai/tools.ts` da
                                  `maskName()` va `maskPhone()` bor va ular
                                  qator AI ga berilishidan oldin qo'llanadi.
                                  Eski matn borini yo'q, yo'qini bor qilib
                                  ko'rsatib, keraksiz qo'rquv uyg'otardi. */}
                           <p className="text-xs text-primary-700/80 dark:text-primary-300/80">
                              {isDemoMode()
                                 ? "Namoyish nusxasida server yo'q — bu yerda kalit saqlanmaydi. Haqiqiy o'rnatmada u shu kompyuterdagi bazada qoladi va brauzerga uzatilmaydi."
                                 : "Kalit shu kompyuterdagi bazada saqlanadi va faqat serverdan ishlatiladi — brauzerga uzatilmaydi."}
                              {' '}Bemor ismi va telefoni AI ga yuborilishidan oldin niqoblanadi,
                              lekin tashxis va davolash matni yuboriladi — buni hisobga oling.
                           </p>
                        </div>

                        {!aiSettings ? (
                           <p className="text-sm text-gray-500">Yuklanmoqda…</p>
                        ) : (
                        <form onSubmit={handleAiSave} className="space-y-5">
                           {aiSettings.providers.map((prov) => (
                              <div key={prov.name} className="p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60">
                                 <div className="flex items-center justify-between gap-3 mb-3">
                                    <div>
                                       <h3 className="font-medium text-gray-900 dark:text-white">{prov.label}</h3>
                                       <p className="text-xs text-gray-500">{prov.hint}</p>
                                    </div>
                                    {prov.configured ? (
                                       <span className="flex items-center gap-1.5 text-xs font-medium text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/30 px-2.5 py-1 rounded-full whitespace-nowrap">
                                          <CheckCircle className="w-3.5 h-3.5" /> {prov.masked}
                                       </span>
                                    ) : (
                                       <span className="text-xs text-gray-400 whitespace-nowrap">kalit yo’q</span>
                                    )}
                                 </div>

                                 <Input
                                    label={prov.configured ? 'Yangi kalit (almashtirish uchun)' : 'API kalit'}
                                    type="password"
                                    value={aiDraft[prov.name] || ''}
                                    onChange={e => setAiDraft({ ...aiDraft, [prov.name]: e.target.value })}
                                    placeholder={prov.configured ? 'Bo’sh qoldirilsa — o’zgarmaydi' : 'Kalitni shu yerga qo’ying'}
                                    autoComplete="off"
                                 />

                                 <div className="flex items-center gap-4 mt-2 flex-wrap">
                                    <a href={prov.url} target="_blank" rel="noopener noreferrer"
                                       className="text-xs text-primary-600 hover:underline inline-flex items-center gap-1">
                                       <Link2 className="w-3 h-3" /> Kalit olish
                                    </a>
                                    {/* `.env` dagi kalitni bu yerdan o’chirib bo’lmaydi — buni
                                        aytmasak, «o’chirdim, lekin qolib ketdi» degan xulosa chiqardi. */}
                                    {prov.source === 'settings' && (
                                       <button type="button" onClick={() => handleAiClear(prov.name, prov.label)}
                                          disabled={aiBusy}
                                          className="text-xs text-red-600 hover:underline inline-flex items-center gap-1">
                                          <Trash2 className="w-3 h-3" /> Kalitni o’chirish
                                       </button>
                                    )}
                                    {prov.source === 'env' && (
                                       <span className="text-xs text-gray-400">
                                          Serverdagi {prov.envName} dan olingan — bu yerdan o’chirilmaydi.
                                       </span>
                                    )}
                                 </div>
                              </div>
                           ))}

                           <div>
                              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                 Birinchi ishlatiladigan provayder
                              </label>
                              <Select
                                 value={aiPreferred}
                                 onChange={e => setAiPreferred(e.target.value)}
                                 options={[
                                    { value: '', label: 'Avtomatik (kalit bor birinchisi)' },
                                    ...aiSettings.providers.map(prov => ({ value: prov.name, label: prov.label })),
                                 ]}
                              />
                              <p className="text-xs text-gray-400 mt-1">
                                 Qolganlari zaxira bo’lib qoladi: tanlangani javob bermasa, keyingisiga o’tadi.
                              </p>
                           </div>

                           <div className="flex items-center gap-4 pt-2 flex-wrap">
                              <Button type="submit" disabled={aiBusy}>
                                 {aiBusy ? 'Saqlanmoqda…' : t('common.save')}
                              </Button>
                              <Button
                                 type="button"
                                 variant="secondary"
                                 onClick={handleAiTest}
                                 disabled={aiTesting || !aiSettings.providers.some(prov => prov.configured)}
                              >
                                 {aiTesting ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : null}
                                 Ulanishni tekshirish
                              </Button>
                              {aiTest && (
                                 <span className={`text-sm flex items-center gap-1 ${aiTest.ok ? 'text-green-600' : 'text-red-600'}`}>
                                    {aiTest.ok ? <CheckCircle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                                    {aiTest.text}
                                 </span>
                              )}
                           </div>
                        </form>
                        )}
                     </Card>
                  </div>
               )}

               {activeTab === 'dmed' && (
                  <div className="space-y-6">
                     <Card className="p-6">
                        <div className="flex items-center gap-4 mb-6">
                           <div className="p-3 bg-indigo-100 dark:bg-indigo-900/40 rounded-xl text-indigo-600 dark:text-indigo-400">
                              <Activity className="w-8 h-8" />
                           </div>
                           <div>
                              <h2 className="text-xl font-bold text-gray-900 dark:text-white">DMED (IT-MED) Integratsiyasi</h2>
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
                                 <h3 className="font-medium text-gray-900 dark:text-white">DMED Integratsiyasini yoqish</h3>
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
               {activeTab === 'labCatalog' && userRole === UserRole.CLINIC_ADMIN && (
                  <LabCatalogTab departments={[]} />
               )}

               {/* Tarmoq va kirish — havola, QR va internet tumbleri */}
               {activeTab === 'network' && (
                  <NetworkAccessTab canManageRemote={userRole === UserRole.CLINIC_ADMIN} />
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
                              <h2 className="text-xl font-bold text-gray-900 dark:text-white">Bo'limlar</h2>
                           </div>
                           <Button onClick={openDeptCreate} disabled={deptBusy}>
                              <Plus className="w-4 h-4 mr-1.5" /> Bo'lim qo'shish
                           </Button>
                        </div>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
                           Shifokorlar, xizmatlar, qabullar va kalendar bo'limga bog'lanadi.
                           {/* Ilgari bu yerda «registratura faqat klinik bo'limlarni
                               ko'rsatadi» deb yozilgan edi — bu noto'g'ri: diagnostika
                               ham chiqadi. Endi qoida to'liq aytiladi, chunki aynan shu
                               izoh tufayli laboratoriya bo'limi «yo'qolgan» deb
                               hisoblangan (audit XC-05). */}
                           <b> Klinik</b> va <b>diagnostika</b> bo'limlariga registratura bemorni o'zi yozadi.
                           <b> Laboratoriya</b>, <b>statsionar</b> va <b>dorixona</b> esa shifokor buyurtmasi
                           bilan ochiladi — ular registratura ro'yxatida ko'rinmaydi.
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
                                       {/* «O'chirish» EMAS: yozuv o'chmaydi, faqat
                                           faolsizlanadi. Eski nom qilinadigan ishga
                                           mos kelmasdi (audit XC-39). */}
                                       <Button variant="secondary" size="sm" onClick={() => toggleDepartmentActive(d)} disabled={deptBusy}>
                                          {d.isActive ? 'Faolsizlantirish' : 'Yoqish'}
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
                           <h2 className="text-xl font-bold text-gray-900 dark:text-white">Baza holati</h2>
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

                     {/* ─── Yaxlitlik tekshiruvi ──────────────────────────── */}
                     <Card className="p-6">
                        <div className="flex items-center gap-3 mb-2">
                           <div className="p-2 bg-primary-50 dark:bg-primary-900/30 rounded-lg">
                              <Shield className="w-5 h-5 text-primary-600 dark:text-primary-300" />
                           </div>
                           <h2 className="text-xl font-bold text-gray-900 dark:text-white">Yaxlitlik tekshiruvi</h2>
                        </div>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
                           Pul va ombor yozuvlari bir-biriga mos kelishini tekshiradi. Faqat
                           o'qiydi — hech narsani o'zgartirmaydi.
                        </p>

                        <Button onClick={handleCheckIntegrity} disabled={integrityBusy} className="mb-5">
                           {integrityBusy ? 'Tekshirilmoqda…' : 'Tekshirishni boshlash'}
                        </Button>

                        {integrity && (
                           <div className="space-y-3">
                              <div className={`p-3 rounded-lg text-sm font-semibold ${integrity.ok
                                 ? 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-200'
                                 : 'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200'}`}>
                                 {integrity.ok
                                    ? 'Buzilish topilmadi'
                                    : `${integrity.errorCount} ta buzilish topildi`}
                                 {integrity.warnCount > 0 && ` · ${integrity.warnCount} ta e'tibor talab qiladi`}
                              </div>

                              {integrity.checks.map((c: any) => {
                                 const tone = c.severity === 'error'
                                    ? 'border-red-200 dark:border-red-800'
                                    : c.severity === 'warn'
                                       ? 'border-amber-200 dark:border-amber-800'
                                       : 'border-gray-200 dark:border-gray-700';
                                 const badge = c.severity === 'error' ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                                    : c.severity === 'warn' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                                       : c.severity === 'info' ? 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'
                                          : 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300';
                                 return (
                                    <div key={c.key} className={`p-3 border rounded-lg ${tone}`}>
                                       <div className="flex items-start justify-between gap-3">
                                          <p className="text-sm font-medium text-gray-900 dark:text-white">{c.title}</p>
                                          <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${badge}`}>
                                             {c.severity === 'ok' ? 'toza' : c.count}
                                          </span>
                                       </div>
                                       <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                          {c.scanned} ta yozuv tekshirildi
                                       </p>
                                       {c.note && (
                                          <p className="text-xs text-gray-600 dark:text-gray-300 mt-1.5 italic">{c.note}</p>
                                       )}
                                       {c.sample?.length > 0 && c.severity !== 'ok' && (
                                          <div className="mt-2 max-h-40 overflow-y-auto overflow-x-auto">
                                             <table className="text-xs w-full">
                                                <tbody>
                                                   {c.sample.slice(0, 20).map((row: any, i: number) => (
                                                      <tr key={i} className="border-t border-gray-100 dark:border-gray-700">
                                                         {Object.entries(row)
                                                            .filter(([k]) => !k.toLowerCase().endsWith('id'))
                                                            .map(([k, v]) => (
                                                               <td key={k} className="py-1 pr-3 text-gray-600 dark:text-gray-300 whitespace-nowrap">
                                                                  <span className="text-gray-400">{k}:</span> {String(v)}
                                                               </td>
                                                            ))}
                                                      </tr>
                                                   ))}
                                                </tbody>
                                             </table>
                                             {c.count > 20 && (
                                                <p className="text-xs text-gray-400 mt-1">…yana {c.count - 20} ta</p>
                                             )}
                                          </div>
                                       )}

                                       {/* Balans farqini tuzatish yo'li shu yerda — boshqa joyda emas */}
                                       {c.key === 'patient_balance' && c.count > 0 && (
                                          <div className="mt-3 flex flex-wrap gap-2 items-center">
                                             <Button variant="secondary" size="sm"
                                                onClick={() => handleRecalcBalances(false)} disabled={integrityBusy}>
                                                Farqni ko'rish
                                             </Button>
                                             <Button variant="secondary" size="sm"
                                                onClick={() => handleRecalcBalances(true)} disabled={integrityBusy}>
                                                Qayta hisoblab yozish
                                             </Button>
                                             {balanceFix && (
                                                <span className="text-xs text-gray-600 dark:text-gray-300">
                                                   {balanceFix.dryRun
                                                      ? balanceFix.message
                                                      : `${balanceFix.patientsFixed} ta bemor tuzatildi`}
                                                </span>
                                             )}
                                          </div>
                                       )}
                                    </div>
                                 );
                              })}
                           </div>
                        )}
                     </Card>

                     {/* ─── Zaxira nusxa ──────────────────────────────────── */}
                     <Card className="p-6">
                        <div className="flex items-center gap-3 mb-2">
                           <div className="p-2 bg-primary-50 dark:bg-primary-900/30 rounded-lg">
                              <HardDrive className="w-5 h-5 text-primary-600 dark:text-primary-300" />
                           </div>
                           <h2 className="text-xl font-bold text-gray-900 dark:text-white">Zaxira nusxa</h2>
                        </div>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
                           Baza bilan birga bemor fotolari va tekshiruv fayllari ham saqlanadi.
                           Nusxalar <code className="text-xs">%APPDATA%\xclinic\backups</code> papkasida.
                        </p>

                        {/* ─── Holat: oxirgi nusxa qachon olingan ───────────
                            Eng muhim satr. Klinika nusxa olinmay qolganini
                            boshqa hech qayerdan bilmaydi. */}
                        {backupStatus && (
                           <div className={`mb-5 p-4 rounded-lg border ${backupStatus.stale
                              ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                              : 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'}`}>
                              <div className="flex items-start gap-3">
                                 {backupStatus.stale
                                    ? <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                                    : <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />}
                                 <div className="min-w-0">
                                    <p className={`text-sm font-semibold ${backupStatus.stale
                                       ? 'text-red-800 dark:text-red-200' : 'text-green-800 dark:text-green-200'}`}>
                                       {!backupStatus.lastBackup
                                          ? 'Zaxira nusxa hali olinmagan'
                                          : backupStatus.ageDays === 0
                                             ? 'Oxirgi nusxa: bugun'
                                             : backupStatus.ageDays === 1
                                                ? 'Oxirgi nusxa: kecha'
                                                : `Oxirgi nusxa: ${backupStatus.ageDays} kun oldin`}
                                    </p>
                                    <p className="text-xs mt-1 text-gray-600 dark:text-gray-300">
                                       {backupStatus.lastBackup && (
                                          <>{fmtWhen(backupStatus.lastBackup.createdAt)} · {fmtBytes(backupStatus.lastBackup.sizeBytes)} · </>
                                       )}
                                       Jami {backupStatus.count} ta nusxa, {fmtBytes(backupStatus.totalBytes)}
                                    </p>
                                    {backupStatus.scheduler?.lastError && (
                                       <p className="text-xs mt-1 text-red-700 dark:text-red-300">
                                          Oxirgi avtomatik nusxada xato: {backupStatus.scheduler.lastError}
                                       </p>
                                    )}
                                 </div>
                              </div>
                           </div>
                        )}

                        {/* ─── Avtomatik nusxa jadvali ─────────────────────── */}
                        {cfgDraft && (
                           <div className="mb-6 p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
                              <label className="flex items-center gap-3 cursor-pointer">
                                 <input
                                    type="checkbox"
                                    checked={cfgDraft.enabled}
                                    onChange={(e) => setCfgDraft((c: any) => ({ ...c, enabled: e.target.checked }))}
                                    className="w-4 h-4 rounded text-primary-600 focus:ring-primary-500"
                                 />
                                 <span className="text-sm font-medium text-gray-900 dark:text-white">
                                    Har kuni avtomatik nusxa olish
                                 </span>
                              </label>

                              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 ml-7">
                                 Belgilangan vaqtda kompyuter o'chiq bo'lsa, nusxa keyingi ishga
                                 tushishda olinadi — o'tkazib yuborilgan kun yo'qolmaydi. Kompyuter
                                 kechqurun o'chadigan bo'lsa, ish tugash vaqtini qo'ying.
                              </p>

                              {cfgDraft.enabled && (
                                 <div className="mt-4 ml-7 space-y-4">
                                    <div className="flex flex-wrap items-end gap-3">
                                       <div>
                                          <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Vaqt</label>
                                          <div className="flex items-center gap-1">
                                             <input type="number" min={0} max={23} value={cfgDraft.hour}
                                                onChange={(e) => setCfgDraft((c: any) => ({ ...c, hour: Number(e.target.value) }))}
                                                className="w-16 px-2 py-1.5 text-sm text-center border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
                                             <span className="text-gray-400">:</span>
                                             <input type="number" min={0} max={59} step={5} value={cfgDraft.minute}
                                                onChange={(e) => setCfgDraft((c: any) => ({ ...c, minute: Number(e.target.value) }))}
                                                className="w-16 px-2 py-1.5 text-sm text-center border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
                                          </div>
                                       </div>
                                       <div>
                                          <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Kunlik saqlash</label>
                                          <input type="number" min={2} max={365} value={cfgDraft.keepDaily}
                                             onChange={(e) => setCfgDraft((c: any) => ({ ...c, keepDaily: Number(e.target.value) }))}
                                             className="w-20 px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
                                       </div>
                                       <div>
                                          <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Oylik saqlash</label>
                                          <input type="number" min={0} max={120} value={cfgDraft.keepMonthly}
                                             onChange={(e) => setCfgDraft((c: any) => ({ ...c, keepMonthly: Number(e.target.value) }))}
                                             className="w-20 px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
                                       </div>
                                    </div>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">
                                       Oxirgi {cfgDraft.keepDaily} kunning hamma nusxasi va undan
                                       oldingi {cfgDraft.keepMonthly} oyning har biridan bittasi saqlanadi.
                                       Izohli nusxalar hech qachon o'chirilmaydi.
                                    </p>

                                    {/* ── NUSXA BULUT PAPKASIGA ────────────────────────

                                        Nima uchun Google API emas. Kalit dastur paketida
                                        yotishi kerak bo'lardi va uni ochib olish mumkin;
                                        internet uzilganda nusxa umuman olinmay qolardi;
                                        Drive o'rniga OneDrive ishlatadigan klinikaga esa
                                        yaramasdi. Papka esa hammasida bir xil ishlaydi:
                                        biz faylni qo'yamiz, bulut dasturi o'zi ko'taradi.

                                        dentalocal da ham aynan shu yo'l — u yerda faqat
                                        matn «Google Drive papkasini tanlang» deb turardi
                                        va papkani foydalanuvchi o'zi qidirardi. Bu yerda
                                        dastur uni topib beradi. */}
                                    <div className="p-3 rounded-lg border border-primary-200 dark:border-primary-800 bg-primary-50/50 dark:bg-primary-900/20">
                                       <p className="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-2">
                                          <Cloud className="w-4 h-4 text-primary-600 dark:text-primary-300" />
                                          {t('backup.cloudTitle')}
                                       </p>
                                       <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{t('backup.cloudDesc')}</p>
                                       {cloudFolders.length > 0 ? (
                                          <div className="flex flex-wrap gap-2 mt-3">
                                             {cloudFolders.map(f => {
                                                /* Teskari chiziq IKKI marta yozilishi shart:
                                                   `\X` va `\z` JavaScript da yaroqsiz qochish
                                                   ketma-ketligi va chiziq JIMGINA tushib qoladi —
                                                   yo'l «DriveXCliniczaxira» bo'lib chiqardi. */
                                                const target = `${f.path}\\XClinic\\zaxira`;
                                                const active = (cfgDraft.extraDir || '') === target;
                                                return (
                                                   <Button key={f.path} size="sm"
                                                      variant={active ? 'primary' : 'secondary'}
                                                      onClick={() => setCfgDraft((c: any) => ({ ...c, extraDir: target }))}>
                                                      {active ? <Check className="w-4 h-4 mr-2" /> : <Cloud className="w-4 h-4 mr-2" />}
                                                      {f.label}
                                                   </Button>
                                                );
                                             })}
                                          </div>
                                       ) : (
                                          <p className="text-xs text-amber-700 dark:text-amber-300 mt-2">{t('backup.cloudNotFound')}</p>
                                       )}
                                    </div>

                                    <div>
                                       <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                                          Ikkinchi manzil (ixtiyoriy) — flesh, tarmoq diski yoki bulut papkasi
                                       </label>
                                       <div className="flex flex-col sm:flex-row gap-2">
                                          <Input
                                             value={cfgDraft.extraDir || ''}
                                             onChange={(e: any) => setCfgDraft((c: any) => ({ ...c, extraDir: e.target.value }))}
                                             placeholder="masalan: D:\xclinic-zaxira"
                                             className="flex-1"
                                          />
                                          <Button variant="secondary" size="sm" onClick={handlePickExtraDir}>
                                             Papka tanlash
                                          </Button>
                                       </div>
                                       <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                          Disk ulanmagan bo'lsa asosiy nusxa baribir olinadi — faqat
                                          ko'chirish o'tkazib yuboriladi.
                                       </p>
                                    </div>
                                 </div>
                              )}

                              <div className="mt-4 ml-7">
                                 <Button size="sm" onClick={handleSaveBackupConfig} disabled={cfgBusy}>
                                    {cfgBusy ? 'Saqlanmoqda…' : 'Jadvalni saqlash'}
                                 </Button>
                              </div>
                           </div>
                        )}

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
                              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Ruxsatlarni boshqarish</h2>
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
                                    <h3 className="text-base font-bold text-gray-900 dark:text-white">{title}</h3>
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
                           <h3 className="text-base font-bold text-gray-900 dark:text-white">Kassa smenalari</h3>
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
                           <h2 className="font-medium text-gray-900 dark:text-white">{t('settings.services.categories')}</h2>
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
                                 <h2 className="text-lg font-medium text-gray-900 dark:text-white">{t('settings.services.title')}</h2>
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
                                             <td className="px-4 py-3 text-gray-500">{formatMoney(s.price)} UZS</td>
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
                                                            if (!await confirmAction({ title: `"${s.name}" xizmatini o'chirishni tasdiqlaysizmi?`, danger: true, confirmLabel: "O'chirish" })) return;
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

                     </div>
                  </div>
               )}

               {/* Doctors Tab */}
               {activeTab === 'doctors' && (
                  <Card className="p-6">
                     <div className="flex justify-between items-center mb-6">
                        <div>
                           <h2 className="text-lg font-medium text-gray-900 dark:text-white">{t('settings.staff.doctorsTitle')}</h2>
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
                                    <p className="font-medium text-gray-900 dark:text-white">Dr. {formatFullName(doc)}</p>
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
                           <h2 className="text-lg font-medium text-gray-900 dark:text-white">Resepshnlar Boshqaruvi</h2>
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
                                    <p className="font-medium text-gray-900 dark:text-white">{formatFullName(rec)}</p>
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
                           <h2 className="text-lg font-medium text-gray-900 dark:text-white">Lab Texniklar Boshqaruvi</h2>
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
                                    <p className="font-medium text-gray-900 dark:text-white">{formatFullName(tech)}</p>
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

               {/* ── Hamshiralar (reliz 4) ──────────────────────────────────
                   Dorini hamshira beradi va dori varag'iga o'z nomidan belgi
                   qo'yadi. Shuning uchun uning alohida logini bo'lishi kerak:
                   shifokor logini bilan yozilgan belgi — yolg'on hujjat. */}
               {activeTab === 'nurses' && userRole === UserRole.CLINIC_ADMIN && (
                  <Card className="p-6">
                     <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-6">
                        <div>
                           <h2 className="text-lg font-medium text-gray-900 dark:text-white">Hamshiralar</h2>
                           <p className="text-sm text-gray-500">
                              Statsionarda dori berish belgisini hamshira o'z nomidan qo'yadi.
                           </p>
                        </div>
                        <Button size="sm" onClick={() => openNurseModal()}>
                           <Plus className="w-4 h-4 mr-1.5" /> Hamshira qo'shish
                        </Button>
                     </div>

                     {nurseError && (
                        <div className="flex items-start gap-2 p-3 mb-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                           <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                           <p className="text-sm text-red-700 dark:text-red-300 flex-1">{nurseError}</p>
                           <button onClick={loadNurses} className="text-sm font-medium text-red-700 dark:text-red-300 hover:underline">
                              Qayta urinish
                           </button>
                        </div>
                     )}

                     {nurseLoading ? (
                        <div className="space-y-2">
                           {[0, 1].map(i => (
                              <div key={i} className="h-16 bg-gray-100 dark:bg-gray-700/40 rounded-lg animate-pulse" />
                           ))}
                        </div>
                     ) : nurses.length === 0 ? (
                        <div className="text-center py-10">
                           <HeartPulse className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                           <p className="text-sm text-gray-500">Hamshira qo'shilmagan</p>
                           <p className="text-xs text-gray-400 mt-1">
                              Loginsiz ham qo'shish mumkin — u holda hamshira ro'yxatda turadi, lekin tizimga kirmaydi.
                           </p>
                        </div>
                     ) : (
                        <div className="grid grid-cols-1 gap-3">
                           {nurses.map(nr => (
                              <div key={nr.id} className="flex items-center justify-between gap-3 p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800">
                                 <div className="flex items-center gap-3 min-w-0">
                                    <div className="h-10 w-10 rounded-full bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center text-rose-600 dark:text-rose-400 font-bold shrink-0">
                                       {(nr.firstName || '?')[0]}{(nr.lastName || '')[0]}
                                    </div>
                                    <div className="min-w-0">
                                       <p className="font-medium text-gray-900 dark:text-white truncate">
                                          {formatFullName(nr)}
                                       </p>
                                       <p className="text-xs text-gray-500 truncate">
                                          {deptList.find(d => d.id === nr.departmentId)?.name || "Bo'lim belgilanmagan"}
                                          {nr.phone ? ` · ${nr.phone}` : ''}
                                          {nr.username ? ` · login: ${nr.username}` : ' · loginsiz'}
                                       </p>
                                    </div>
                                 </div>
                                 <div className="flex items-center gap-2 shrink-0">
                                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${nr.status === 'Active'
                                       ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                                       : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'}`}>
                                       {nr.status === 'Active' ? 'Faol' : 'Faol emas'}
                                    </span>
                                    <button onClick={() => openNurseModal(nr)}
                                       className="p-2 text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-md">
                                       <Edit className="w-4 h-4" />
                                    </button>
                                    <button onClick={() => setDeleteNurse(nr)}
                                       className="p-2 text-gray-400 hover:text-red-600">
                                       <Trash2 className="w-4 h-4" />
                                    </button>
                                 </div>
                              </div>
                           ))}
                        </div>
                     )}
                  </Card>
               )}

               {/* ── Kirish jurnali (reliz 6) ───────────────────────────────
                   Kim bemor kartasini ochgani va o'zgartirgani. Huquqiy asos —
                   vrach siri (25-modda 3-qismi).

                   FAQAT EGAGA: "kim kartani ko'rdi" yozuvining o'zi ham nozik
                   ma'lumot, va shifokor kim uning murojaatlarini tekshirganini
                   ko'rmasligi kerak. Server ham shu rolni talab qiladi. */}
               {activeTab === 'accessLog' && userRole === UserRole.CLINIC_ADMIN && (
                  <Card className="p-6">
                     <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3 mb-5">
                        <div>
                           <h2 className="text-lg font-medium text-gray-900 dark:text-white">Kirish jurnali</h2>
                           <p className="text-sm text-gray-500">
                              Bemor kartasini kim ochgani va o'zgartirgani.
                              {logData?.retentionMonths ? ` ${logData.retentionMonths} oy saqlanadi.` : ''}
                           </p>
                        </div>
                        <Button size="sm" variant="secondary" onClick={loadAccessLog} disabled={logLoading}>
                           <RefreshCw className={`w-4 h-4 mr-1.5 ${logLoading ? 'animate-spin' : ''}`} /> Yangilash
                        </Button>
                     </div>

                     <div className="flex flex-wrap items-end gap-3 mb-4">
                        <div>
                           <label className="block text-[11px] text-gray-500 dark:text-gray-400 mb-1">Boshlanish</label>
                           <input type="date" value={logFrom} onChange={e => setLogFrom(e.target.value)}
                              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm" />
                        </div>
                        <div>
                           <label className="block text-[11px] text-gray-500 dark:text-gray-400 mb-1">Tugash</label>
                           <input type="date" value={logTo} onChange={e => setLogTo(e.target.value)}
                              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm" />
                        </div>
                        <div>
                           <label className="block text-[11px] text-gray-500 dark:text-gray-400 mb-1">Amal</label>
                           <select value={logAction} onChange={e => setLogAction(e.target.value)}
                              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm">
                              <option value="">Barchasi</option>
                              <option value="View">Ko'rish</option>
                              <option value="Create">Yaratish</option>
                              <option value="Update">O'zgartirish</option>
                              <option value="Print">Bosish</option>
                           </select>
                        </div>
                     </div>

                     {logError && (
                        <div className="flex items-start gap-2 p-3 mb-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                           <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                           <p className="text-sm text-red-700 dark:text-red-300">{logError}</p>
                        </div>
                     )}

                     {logLoading && !logData ? (
                        <div className="space-y-2">
                           {[0, 1, 2].map(i => <div key={i} className="h-10 bg-gray-100 dark:bg-gray-700/40 rounded animate-pulse" />)}
                        </div>
                     ) : !logData || logData.items.length === 0 ? (
                        <div className="text-center py-10">
                           <Shield className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                           <p className="text-sm text-gray-500">Bu davrda yozuv yo'q</p>
                        </div>
                     ) : (
                        <>
                           <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg">
                              <table className="w-full min-w-[640px]">
                                 <thead className="bg-gray-50 dark:bg-gray-900/40 border-b border-gray-200 dark:border-gray-700">
                                    <tr>
                                       {['Vaqt', 'Kim', 'Roli', 'Amal', 'Nima', 'Bemor'].map(h => (
                                          <th key={h} className="px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                             {h}
                                          </th>
                                       ))}
                                    </tr>
                                 </thead>
                                 <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                                    {logData.items.map((l: any) => (
                                       <tr key={l.id}>
                                          <td className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                                             {new Date(l.at).toLocaleString('uz-UZ')}
                                          </td>
                                          <td className="px-3 py-2 text-sm text-gray-900 dark:text-white">{l.userName || '—'}</td>
                                          <td className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400">{ROLE_LABEL[l.userRole] || l.userRole || '—'}</td>
                                          <td className="px-3 py-2">
                                             <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${l.action === 'View'
                                                ? 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                                                : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'}`}>
                                                {ACTION_LABEL[l.action] || l.action}
                                             </span>
                                          </td>
                                          <td className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400">{ENTITY_LABEL[l.entityType] || l.entityType}</td>
                                          <td className="px-3 py-2 text-sm text-gray-900 dark:text-white">{l.patientName || '—'}</td>
                                       </tr>
                                    ))}
                                 </tbody>
                              </table>
                           </div>
                           <p className="text-[11px] text-gray-400 mt-2">
                              {logData.total} yozuv
                              {logData.truncated ? ` — oxirgi ${logData.items.length} tasi ko'rsatilgan, davrni toraytiring` : ''}.
                              Jurnalga faqat server yozadi: tashqaridan yozib bo'lmaydi.
                           </p>
                        </>
                     )}
                  </Card>
               )}

               {/* SMS va Telegram Tab (birlashtirilgan) */}
               {activeTab === 'messaging' && (
                  <div className="space-y-6">
                  {/* XABARLAR MENYUDAN CHIQDI.

                      Shablon, avtomatik qoida va ommaviy jo'natish oyiga
                      bir-ikki marta kerak bo'ladi, menyuda esa u har kuni
                      joy egallab turardi. Endi sozlamalar ichida — kalitlar
                      ham shu yerda, ya'ni bir joyda. */}
                  <Card className="p-5 flex flex-wrap items-center gap-4">
                     <div className="p-2.5 bg-primary-50 dark:bg-primary-900/30 rounded-lg text-primary-600 dark:text-primary-300">
                        <MessageSquare className="w-5 h-5" />
                     </div>
                     <div className="min-w-0 flex-1">
                        <h3 className="font-semibold text-gray-900 dark:text-white">{t('settings.messagesLinkTitle')}</h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400">{t('settings.messagesLinkDesc')}</p>
                     </div>
                     <Button variant="secondary" onClick={() => navigate('/messages')}>
                        {t('settings.messagesLinkBtn')} <ArrowRight className="w-4 h-4 ml-2" />
                     </Button>
                  </Card>
                  <Card className="p-6">
                     <div className="flex items-center gap-4 mb-6">
                        <div className="p-3 bg-primary-100 dark:bg-primary-900/40 rounded-xl text-primary-600 dark:text-primary-400">
                           <Bot className="w-8 h-8" />
                        </div>
                        <div>
                           <h2 className="text-xl font-bold text-gray-900 dark:text-white">{t('settings.bot.title')}</h2>
                           <p className="text-sm text-gray-500">{t('settings.bot.subtitle')}</p>
                        </div>
                     </div>

                     <div className="space-y-6">
                        <div className="bg-gray-50 dark:bg-gray-800/50 p-6 rounded-2xl border border-gray-100 dark:border-gray-700">
                           <h3 className="font-bold text-gray-900 dark:text-white mb-2">Shaxsiy Telegram Botni Ulash</h3>
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
                              <h2 className="text-xl font-bold text-gray-900 dark:text-white">SMS va Xabar Yuborish Rejimi</h2>
                              <p className="text-sm text-gray-500">Mijozlarga xabarnomalar qanday yuborilishini sozlang va Eskiz.uz profilingizni ulang.</p>
                           </div>
                        </div>
                        <form onSubmit={handleSmsSave} className="space-y-8">
                           <div>
                              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">1. Standart kanalni tanlang</h3>
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
                                    <h3 className="text-lg font-medium text-gray-900 dark:text-white">2. Eskiz.uz Integratsiyasi</h3>
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
                                       {smsBalance !== null ? formatMoney(smsBalance) : 'Tekshirilmoqda...'}
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
                  <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-3">{t('settings.staff.authTitle')}</h3>
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
                  <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-1">Ishlash vaqti (Ixtiyoriy)</h3>
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


         {/* Delete Doctor Confirmation Modal */}
         <Modal isOpen={!!deleteConfirmDoctor} onClose={() => setDeleteConfirmDoctor(null)} title={t('settings.staff.deleteDoctorConfirm')}>
            <div className="text-center space-y-4">
               <div className="mx-auto w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                  <Trash2 className="w-6 h-6 text-red-600" />
               </div>
               <h2 className="text-lg font-medium text-gray-900 dark:text-white">Ishonchingiz komilmi?</h2>
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
                  <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-3">{t('settings.staff.authTitle')}</h3>
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
               <h2 className="text-lg font-medium text-gray-900 dark:text-white">Ishonchingiz komilmi?</h2>
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
               <h2 className="text-lg font-medium text-gray-900 dark:text-white">Ishonchingiz komilmi?</h2>
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
      {/* Bo'lim yaratish va tahrirlash */}
      {deptModal && (
         <Modal isOpen={true} onClose={() => setDeptModal(null)}
            title={deptModal.mode === 'edit' ? 'Bo\'limni tahrirlash' : 'Yangi bo\'lim'}>
            <div className="space-y-4">
               <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nomi</label>
                  <Input value={deptForm.name}
                     onChange={(e: any) => {
                        const name = e.target.value;
                        setDeptForm(f => ({
                           ...f, name,
                           // Kod qo'lda tegilmagan bo'lsa — nomdan yuriladi
                           code: deptCodeTouched ? f.code : makeDeptCode(name),
                        }));
                     }}
                     placeholder="Masalan: Kardiologiya" />
               </div>

               <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                     <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Kod</label>
                     <Input value={deptForm.code}
                        onChange={(e: any) => {
                           setDeptCodeTouched(true);
                           setDeptForm(f => ({ ...f, code: e.target.value.toUpperCase() }));
                        }}
                        placeholder="KARD" />
                     <p className="text-xs text-gray-400 mt-1">Qisqa, takrorlanmaydigan belgi — nomdan o'zi yasaladi</p>
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
         {/* ── Hamshira: qo'shish va tahrirlash ── */}
         <Modal
            isOpen={!!nurseModal}
            onClose={() => setNurseModal(null)}
            title={nurseModal?.id ? 'Hamshirani tahrirlash' : "Hamshira qo'shish"}
            className="max-w-md"
         >
            <div className="space-y-4">
               <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Input label="Ism" value={nurseForm.firstName} autoFocus
                     onChange={e => setNurseForm(f => ({ ...f, firstName: e.target.value }))} />
                  <Input label="Familiya" value={nurseForm.lastName}
                     onChange={e => setNurseForm(f => ({ ...f, lastName: e.target.value }))} />
               </div>
               <Input label="Telefon" value={nurseForm.phone}
                  onChange={e => setNurseForm(f => ({ ...f, phone: e.target.value }))} />

               <Select label="Bo'lim" value={nurseForm.departmentId}
                  onChange={e => setNurseForm(f => ({ ...f, departmentId: e.target.value }))}>
                  <option value="">Belgilanmagan</option>
                  {deptList.filter(d => d.isActive).map(d => (
                     <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
               </Select>
               <p className="text-xs text-gray-400 -mt-2">
                  Bo'lim tanlansa, kunlik dori varag'i o'sha bo'lim bo'yicha ochiladi.
               </p>

               <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                     Tizimga kirish (ixtiyoriy)
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                     <Input label="Login" value={nurseForm.username}
                        onChange={e => setNurseForm(f => ({ ...f, username: e.target.value }))} />
                     <Input label="Parol" type="password" value={nurseForm.password}
                        placeholder={nurseModal?.id ? "o'zgartirmaslik uchun bo'sh qoldiring" : ''}
                        onChange={e => setNurseForm(f => ({ ...f, password: e.target.value }))} />
                  </div>
               </div>

               {nurseModal?.id && (
                  <Select label="Holat" value={nurseForm.status}
                     onChange={e => setNurseForm(f => ({ ...f, status: e.target.value }))}>
                     <option value="Active">Faol</option>
                     <option value="Inactive">Faol emas</option>
                  </Select>
               )}

               <div className="flex justify-end gap-2 pt-2">
                  <Button variant="secondary" onClick={() => setNurseModal(null)}>Bekor</Button>
                  <Button onClick={saveNurse}
                     disabled={nurseSaving || !nurseForm.firstName.trim() || !nurseForm.lastName.trim()}>
                     Saqlash
                  </Button>
               </div>
            </div>
         </Modal>

         {/* ── Hamshirani o'chirish ── */}
         <Modal isOpen={!!deleteNurse} onClose={() => setDeleteNurse(null)} title="O'chirish" className="max-w-sm">
            {deleteNurse && (
               <div className="space-y-4">
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                     <b>{formatFullName(deleteNurse)}</b> ro'yxatdan chiqariladi va
                     tizimga kira olmaydi.
                  </p>
                  <p className="text-xs text-gray-500">
                     Dori berish belgilarida uning ismi QOLADI — tibbiy yozuvni xodim ketgani
                     uchun o'chirib bo'lmaydi.
                  </p>
                  <div className="flex justify-end gap-2">
                     <Button variant="secondary" onClick={() => setDeleteNurse(null)}>Bekor</Button>
                     <Button variant="danger" onClick={confirmDeleteNurse}>O'chirish</Button>
                  </div>
               </div>
            )}
         </Modal>

      </div>
   );
};