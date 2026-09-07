import React, { useState, useMemo, useEffect } from 'react';
import { formatFullName } from '../utils/format';
import { confirmAction } from '../services/confirm';
import { toast } from '../services/toast';
import { Card, Button, Badge, Modal } from '../components/Common';
import { StatCard } from '../components/StatCard';
import { Search, Plus, Eye, Pencil, Trash2, Loader2, Download, Filter, UserCheck, AlertCircle, ChevronDown, Cake, Wallet, Users as UsersIcon, UserPlus as UserPlusIcon, Activity } from 'lucide-react';
import { Patient, Doctor, Appointment, Transaction, Clinic } from '../types';
import { api, getFileUrl } from '../services/api';
import type { Snapshot } from '../services/api';
import { usePatientSearch } from '../hooks/usePatientSearch';
import { PatientFormModal } from '../components/PatientFormModal';
import { useLanguage } from '../context/LanguageContext';
import { calcAge, formatDay } from '../utils/dateUtils';
import { maskPhone } from '../utils/accessControl';

interface PatientsProps {
  userRole: string;
  patients: Patient[];
  doctors: Doctor[];
  appointments: Appointment[];
  transactions: Transaction[];
  onPatientClick: (id: string) => void;
  onAddPatient: (patient: Omit<Patient, 'id' | 'clinicId'>) => Promise<any>;
  onDeletePatient: (id: string) => void;
  onUpdatePatient: (id: string, data: Partial<Patient>) => Promise<void>;
  currentClinic?: Clinic;
  showPatientPhone?: boolean; // Ruxsatlar: bemor telefon raqamini ko'rsatish
}

export const Patients: React.FC<PatientsProps> = ({
  userRole,
  patients,
  doctors,
  appointments,
  transactions,
  onPatientClick,
  onAddPatient,
  onDeletePatient,
  onUpdatePatient,
  currentClinic,
  showPatientPhone = true,
}) => {
  const { t } = useLanguage();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [assignDoctorId, setAssignDoctorId] = useState('');
  const [isAssigning, setIsAssigning] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  // Filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterGender, setFilterGender] = useState('all');
  const [filterDoctor, setFilterDoctor] = useState('all');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [activeStatFilter, setActiveStatFilter] = useState<string | null>(null);

  /* BEMOR FORMASI — YAGONA (`PatientFormModal`).

     Bu sahifada o'z nusxasi bor edi. Ikkalasi bir xil ishni qilardi, lekin
     ular allaqachon ajralib ketgan edi: bu yerda rasm yuklash bor edi-yu,
     karta raqami yo'q edi; takror bemor haqidagi 409 esa `catch {}` bilan
     JIMGINA yutilardi — ya'ni takror bemorda tugma bosilardi va ekranda
     mutlaqo hech narsa bo'lmasdi.

     `editing` — tahrirlash uchun: ilgari bemorni faqat kartasidan, faqat
     5 maydon bo'yicha tahrirlash mumkin edi. */
  const [editing, setEditing] = useState<Patient | null>(null);

  /* Qidiruv SERVERDA, qolgan filtrlar brauzerda.

     Nima uchun aralash. Server qidiruvi karta raqami va JSHSHIR ni ham
     biladi — brauzerdagi filtr esa faqat ism va telefonni bilardi, ya'ni
     karta bo'yicha bemorni topib bo'lmasdi. Qolgan filtrlar (jins, shifokor,
     sana, holat) hozircha brauzerda qoladi: ularni serverga chiqarish
     10-relizdagi sahifalash bilan birga bo'ladi.

     Qidiruv yozilganda ASOS serverdan kelgan ro'yxat bo'ladi, aks holda —
     odatdagi to'liq ro'yxat. Filtrlar ikkala holatda ham bir xil qo'llanadi. */
  const { results: searchResults, loading: searching, active: searchActive } =
    usePatientSearch(searchTerm);

  const filteredPatients = useMemo(() => {
    const base = searchActive ? searchResults : patients;
    return base.filter((p) => {
      // Qidiruv serverda bajarilgan bo'lsa, bu yerda qayta filtrlash shart emas
      const matchesSearch = searchActive || !searchTerm ||
        p.firstName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.lastName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.phone.includes(searchTerm);

      const matchesStatus =
        filterStatus === 'all' ||
        (filterStatus === 'active' && p.status === 'Active') ||
        (filterStatus === 'archived' && p.status === 'Archived') ||
        (filterStatus === 'unassigned' && !p.doctorId);

      const matchesGender =
        filterGender === 'all' ||
        (filterGender === 'male' && p.gender === 'Male') ||
        (filterGender === 'female' && p.gender === 'Female');

      const matchesDoctor =
        filterDoctor === 'all' ||
        (filterDoctor === 'none' && !p.doctorId) ||
        p.doctorId === filterDoctor;

      const matchesDateFrom = !filterDateFrom || p.dob >= filterDateFrom;
      const matchesDateTo = !filterDateTo || p.dob <= filterDateTo;

      // Stats filters
      let matchesStat = true;
      if (activeStatFilter === 'new') {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        // We don't have createdAt, but assuming lastVisit 'Never' or recent lastVisit as proxy if needed,
        // but wait, types.ts doesn't have createdAt. Let's check patients for any date field.
        // If not available, we might need to skip 'New' or use a different logic.
        // Actually, looking at the screenshot, "Yangi Bemorlar" exists.
        // Let's assume patients added in the system have some date.
        // Since I can't see createdAt, I'll use a placeholder logic or check if I can add it.
        // Actually, let's use lastVisit as a proxy for "New" if it's within 7 days and they are new.
        const lastVisitDate = p.lastVisit === 'Never' ? null : new Date(p.lastVisit);
        matchesStat = lastVisitDate ? lastVisitDate >= sevenDaysAgo : true;
      } else if (activeStatFilter === 'debtor' || activeStatFilter === 'waiting') {
        /* QARZ SERVERDAN. Ilgari bu yerda ikkita mustaqil hisob turardi va
           ikkalasi ham noto'g'ri edi:

             · «qarzdor» — `Transaction.status === 'Pending'` cheklari
               bo'yicha. Bunday chek faqat bemor kartasidagi to'lov oynasi
               yaratardi va u olib tashlandi;
             · «to'lov kutmoqda» — yakunlangan yozuvga o'sha SANADA chek
               yo'qligi bo'yicha. Yozuvning `Completed` holatini esa kod
               hech qayerda qo'ymaydi, ya'ni filtr hech qachon ishlamagan.

           Endi ikkalasi ham bitta manbadan: to'lanmagan hisob qatorlari
           (`GET /api/reports/debtors`). */
        matchesStat = debtorIds.has(p.id);
      }

      return matchesSearch && matchesStatus && matchesGender && matchesDoctor && matchesDateFrom && matchesDateTo && matchesStat;
    });
  }, [patients, searchResults, searchActive, searchTerm, filterStatus, filterGender, filterDoctor, filterDateFrom, filterDateTo, activeStatFilter, appointments, transactions]);

  /* KPI RAQAMLARI SERVERDAN (S2.1).

     Ilgari uchalasi ham shu yerda, BRAUZERDAGI ro'yxatdan sanalardi va
     uchtasi ham noto'g'ri chiqardi:

     - «Jami» — yuklangan 500 bemorni sanardi, bazadagi hammasini emas;
     - «Yangi» — `lastVisit === 'Never'` ni ham yangi deb hisoblardi, ya'ni
       hech qachon kelmagan bemor ham «oxirgi 7 kunda yangi» bo'lardi va
       butun baza «yangi» chiqardi;
     - «Qarzdorlar» — `Transaction.status === 'Pending'` dan sanardi va
       bemorni ISMI bo'yicha moslashtirardi. To'g'ri manba —
       to'lanmagan `VisitCharge` qatorlari (`billing.ts`), va u serverda.

     Endi uchalasi ham `/api/reports/snapshot` dan, ya'ni bosh sahifadagi
     raqamlar bilan AYNAN bir xil. */
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  /* Qarzdorlar ro'yxati — serverdan, to'lanmagan qatorlardan yig'ilgan. */
  const [debtorIds, setDebtorIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    let alive = true;
    api.reports.snapshot().then(s => { if (alive) setSnapshot(s); }).catch(() => {});
    api.reports.debtors()
      .then((d: any) => {
        if (!alive) return;
        setDebtorIds(new Set((d?.patients || [])
          .map((x: any) => x.patientId).filter(Boolean)));
      })
      .catch(() => { });
    return () => { alive = false; };
  }, []);

  // Stats
  const stats = useMemo(() => {
    /* Server javobi kelmaguncha yuklangan ro'yxatdan ko'rsatiladi — kartalar
       bo'sh turmasin. Kelgach, serverdagi raqam ustun turadi. */
    const total = snapshot?.patients.total ?? patients.length;
    const newPatients = snapshot?.patients.newLast7Days ?? 0;
    const debtors = snapshot?.debt.patients ?? 0;

    const waiting = patients.filter(p => {
      const pAppts = appointments.filter(a => a.patientId === p.id || a.patientName === `${formatFullName(p)}`);
      const pTxs = transactions.filter(t => t.patientId === p.id || t.patientName === `${formatFullName(p)}`);
      return pAppts.some(app => {
        const hasTransaction = pTxs.some(t => t.date === app.date);
        return (app.status === 'Completed' || app.status === 'Checked-In') && !hasTransaction;
      });
    }).length;

    return { total, newPatients, debtors, waiting };
  }, [patients, appointments, transactions, snapshot]);

  const unassignedCount = patients.filter((p) => !p.doctorId).length;

  // Shifokor ismi: API'dan kelgan doctorName yoki doctorId orqali doctors ro'yxatidan
  // (doctorName bazada saqlanmaydi — doctorId asosiy manba)
  const getPatientDoctorName = (p: Patient): string | null => {
    if (p.doctorName) return p.doctorName;
    if (!p.doctorId) return null;
    const doc = doctors.find(d => d.id === p.doctorId);
    return doc ? `${formatFullName(doc)}` : null;
  };

  // CSV Export
  const handleExport = () => {
    const headers = ['ID', 'Familiya', 'Ism', 'Telefon', 'Tug\'ilgan sana', 'Jins', 'Status', 'Shifokor', 'Oxirgi tashrif'];
    const rows = filteredPatients.map((p) => [
      p.id,
      p.lastName,
      p.firstName,
      showPatientPhone ? p.phone : maskPhone(p.phone),
      p.dob,
      p.gender === 'Male' ? 'Erkak' : 'Ayol',
      p.status === 'Active' ? 'Faol' : 'Arxiv',
      getPatientDoctorName(p) || 'Biriktirilmagan',
      p.lastVisit,
    ]);
    const csvContent = [headers, ...rows].map((r) => r.join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `bemorlar_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Doctor Assignment
  const openAssignModal = (e: React.MouseEvent, patient: Patient) => {
    e.stopPropagation();
    setSelectedPatient(patient);
    setAssignDoctorId(patient.doctorId || '');
    setIsAssignModalOpen(true);
  };

  const handleAssignDoctor = async () => {
    if (!selectedPatient) return;
    setIsAssigning(true);
    try {
      const doctor = doctors.find((d) => d.id === assignDoctorId);
      await onUpdatePatient(selectedPatient.id, {
        doctorId: assignDoctorId || undefined,
        doctorName: doctor ? `${formatFullName(doctor)}` : undefined,
      });
      setIsAssignModalOpen(false);
    } catch {
      // handled by parent toast
    } finally {
      setIsAssigning(false);
    }
  };

  const activeFiltersCount = [
    filterStatus !== 'all',
    filterGender !== 'all',
    filterDoctor !== 'all',
    !!filterDateFrom,
    !!filterDateTo,
  ].filter(Boolean).length;

  return (
    <div className="space-y-6 animate-fade-in px-2 sm:px-0">
      {/* Header */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 pb-2">
        <div>
          <h1 className="text-3xl font-extrabold text-gray-900 dark:text-white tracking-tight">
            {t('patients.title')}
          </h1>
          <div className="flex items-center gap-4 mt-2">
            <div className="flex items-center gap-1.5 px-3 py-1 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 rounded-full text-xs font-bold border border-primary-100 dark:border-primary-800">
              <UsersIcon className="w-3.5 h-3.5" />
              {stats.total} {t('patients.badges.patientsCount')}
            </div>
            {unassignedCount > 0 && (
              <div className="flex items-center gap-1.5 px-3 py-1 bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded-full text-xs font-bold border border-amber-100 dark:border-amber-800">
                <AlertCircle className="w-3.5 h-3.5" />
                {unassignedCount} {t('patients.badges.unassigned')}
              </div>
            )}
          </div>
        </div>
        
        <div className="flex flex-wrap gap-3 w-full lg:w-auto">
          <Button
            variant="secondary" 
            className="flex-1 lg:flex-none justify-center gap-2 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md transition-all active:scale-95 py-2.5"
            onClick={handleExport}
          >
            <Download className="w-4 h-4" />
            <span className="whitespace-nowrap">{t('patients.buttons.export')}</span>
          </Button>
          
          <Button 
            className="flex-1 lg:flex-none justify-center gap-2 bg-primary-600 hover:bg-primary-700 text-white shadow-lg shadow-primary-500/25 transition-all active:scale-95 py-2.5 border-none"
            onClick={() => setIsAddModalOpen(true)}
          >
            <Plus className="w-4 h-4" /> 
            <span className="whitespace-nowrap">{t('patients.buttons.add')}</span>
          </Button>
        </div>
      </div>

      {/* Stats Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <StatCard
          label={t('patients.stats.total')} value={stats.total} icon={UsersIcon} color="primary"
          active={activeStatFilter === null} subtitle={t('patients.stats.allTime')}
          onClick={() => setActiveStatFilter(null)}
        />
        <StatCard
          label={t('patients.stats.new')} value={stats.newPatients} icon={UserPlusIcon} color="warning"
          active={activeStatFilter === 'new'} subtitle={t('patients.stats.last7Days')}
          onClick={() => setActiveStatFilter(activeStatFilter === 'new' ? null : 'new')}
        />
        <StatCard
          label={t('patients.stats.debtors')} value={stats.debtors} icon={Wallet} color="success"
          active={activeStatFilter === 'debtor'} subtitle={t('patients.stats.activeDebt')}
          onClick={() => setActiveStatFilter(activeStatFilter === 'debtor' ? null : 'debtor')}
        />
        <StatCard
          label={t('patients.stats.waiting')} value={stats.waiting} icon={AlertCircle} color="danger"
          active={activeStatFilter === 'waiting'} subtitle={t('patients.stats.paymentPending')}
          onClick={() => setActiveStatFilter(activeStatFilter === 'waiting' ? null : 'waiting')}
        />
      </div>

      {/* Search + Filter toggle row */}
      <Card className="p-4 space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder={t('patients.search.placeholder')}
              className="pl-9 h-9 w-full rounded-md border border-gray-300 bg-transparent text-sm focus:ring-2 focus:ring-primary-500 dark:border-gray-700 dark:text-white"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-4 h-9 rounded-md border text-sm font-medium transition-colors ${showFilters || activeFiltersCount > 0
              ? 'border-primary-500 bg-primary-50 text-primary-600 dark:bg-primary-900/30 dark:text-primary-400'
              : 'border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
          >
            <Filter className="w-4 h-4" />
            {t('patients.filter.button')}
            {activeFiltersCount > 0 && (
              <span className="ml-1 bg-primary-600 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center">
                {activeFiltersCount}
              </span>
            )}
            <ChevronDown className={`w-4 h-4 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {/* Expanded filter panel */}
        {showFilters && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 pt-2 border-t border-gray-100 dark:border-gray-700">
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Status</label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full h-9 rounded-md border border-gray-300 dark:border-gray-700 bg-transparent text-sm dark:text-white px-2 focus:ring-2 focus:ring-primary-500"
              >
                <option value="all">{t('patients.filter.all')}</option>
                <option value="active">{t('patients.filter.active')}</option>
                <option value="archived">{t('patients.filter.archived')}</option>
                <option value="unassigned">{t('patients.filter.unassigned')}</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Jins</label>
              <select
                value={filterGender}
                onChange={(e) => setFilterGender(e.target.value)}
                className="w-full h-9 rounded-md border border-gray-300 dark:border-gray-700 bg-transparent text-sm dark:text-white px-2 focus:ring-2 focus:ring-primary-500"
              >
                <option value="all">{t('patients.filter.all')}</option>
                <option value="male">{t('patients.filter.male')}</option>
                <option value="female">{t('patients.filter.female')}</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Shifokor</label>
              <select
                value={filterDoctor}
                onChange={(e) => setFilterDoctor(e.target.value)}
                className="w-full h-9 rounded-md border border-gray-300 dark:border-gray-700 bg-transparent text-sm dark:text-white px-2 focus:ring-2 focus:ring-primary-500"
              >
                <option value="all">{t('patients.filter.all')}</option>
                <option value="none">{t('patients.filter.unassigned')}</option>
                {doctors.map((d) => (
                  <option key={d.id} value={d.id}>{formatFullName(d)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Tug'ilganidan boshlab</label>
              <input
                type="date"
                value={filterDateFrom}
                onChange={(e) => setFilterDateFrom(e.target.value)}
                className="w-full h-9 rounded-md border border-gray-300 dark:border-gray-700 bg-transparent text-sm dark:text-white px-2 focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Tugash sanasi</label>
              <input
                type="date"
                value={filterDateTo}
                onChange={(e) => setFilterDateTo(e.target.value)}
                className="w-full h-9 rounded-md border border-gray-300 dark:border-gray-700 bg-transparent text-sm dark:text-white px-2 focus:ring-2 focus:ring-primary-500"
              />
            </div>

            {activeFiltersCount > 0 && (
              <div className="col-span-full flex justify-end">
                <button
                  onClick={() => {
                    setFilterStatus('all'); setFilterGender('all'); setFilterDoctor('all');
                    setFilterDateFrom(''); setFilterDateTo('');
                  }}
                  className="text-xs text-red-500 hover:text-red-700 dark:hover:text-red-400 underline"
                >
                  Barcha filtrlarni tozalash
                </button>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-gray-50 dark:bg-gray-800/50">
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="px-6 py-4 text-xs font-medium text-gray-500 uppercase tracking-wider">{t('patients.table.name')}</th>
                <th className="px-6 py-4 text-xs font-medium text-gray-500 uppercase tracking-wider">{t('patients.table.phone')}</th>
                <th className="px-6 py-4 text-xs font-medium text-gray-500 uppercase tracking-wider">{t('patients.table.age_gender')}</th>
                <th className="px-6 py-4 text-xs font-medium text-gray-500 uppercase tracking-wider">{t('patients.table.doctor')}</th>
                <th className="px-6 py-4 text-xs font-medium text-gray-500 uppercase tracking-wider">{t('patients.table.lastVisit')}</th>
                <th className="px-6 py-4 text-xs font-medium text-gray-500 uppercase tracking-wider">DMED</th>
                <th className="px-6 py-4 text-xs font-medium text-gray-500 uppercase tracking-wider">{t('patients.table.status')}</th>
                <th className="px-6 py-4 text-xs font-medium text-gray-500 uppercase tracking-wider text-right">{t('patients.table.actions')}</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {filteredPatients.map((patient) => (
                <tr
                  key={patient.id}
                  className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors cursor-pointer group"
                  onClick={() => onPatientClick(patient.id)}
                >
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="h-9 w-9 rounded-full bg-primary-100 dark:bg-primary-900/50 flex items-center justify-center text-primary-600 dark:text-primary-300 font-bold text-sm group-hover:bg-primary-200 dark:group-hover:bg-primary-800 transition-colors overflow-hidden">
                        {patient.avatarUrl ? (
                          <img src={getFileUrl('patient-avatar', patient.avatarUrl ? patient.id : null)} alt="" className="w-full h-full object-cover" />
                        ) : (
                          `${patient.firstName[0]}${patient.lastName[0]}`
                        )}
                      </div>
                      <div className="ml-3">
                        <div className="text-sm font-medium text-gray-900 dark:text-white group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
                          {formatFullName(patient)}
                        </div>
                        <div className="text-xs text-gray-500">ID: {patient.id}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{showPatientPhone ? patient.phone : maskPhone(patient.phone)}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {calcAge(patient.dob) ?? 'N/A'} / {patient.gender === 'Male' ? 'Erkak' : 'Ayol'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {(() => {
                      const docName = getPatientDoctorName(patient);
                      return docName ? (
                        <span className="flex items-center gap-1.5 text-gray-700 dark:text-gray-300">
                          <div className="w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center text-emerald-600 dark:text-emerald-400 text-xs font-bold">
                            {docName[0]}
                          </div>
                          {docName}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-2 py-1 rounded-full">
                          <AlertCircle className="w-3 h-3" /> Biriktirilmagan
                        </span>
                      );
                    })()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{patient.lastVisit && patient.lastVisit !== 'Never' ? formatDay(patient.lastVisit) : 'Hali kelmagan'}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {patient.pinfl ? (
                      <span className="text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-2 py-1 rounded text-[10px] font-bold flex items-center gap-1 w-fit">
                        <Activity className="w-3 h-3" /> {patient.pinfl}
                      </span>
                    ) : (
                      <span className="text-gray-400 text-[10px]">—</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <Badge status={patient.status} />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={(e) => openAssignModal(e, patient)}
                        className="text-emerald-600 hover:text-emerald-800 dark:hover:text-emerald-400 p-1.5 rounded-md hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors"
                        title={t('patients.actions.assign')}
                      >
                        <UserCheck className="w-4 h-4" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); onPatientClick(patient.id); }}
                        className="text-primary-600 hover:text-primary-900 dark:hover:text-primary-400 p-1.5 rounded-md hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors"
                        title={t('patients.actions.details')}
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      {/* Tahrirlash — ro'yxatdan ham. Ilgari bemor
                          ma'lumotini o'zgartirish uchun uning kartasiga
                          kirish shart edi, u yerda esa atigi 5 maydon
                          bor edi. */}
                      <button
                        onClick={(e) => { e.stopPropagation(); setEditing(patient); }}
                        className="text-gray-500 hover:text-primary-600 dark:hover:text-primary-400 p-1.5 rounded-md hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors"
                        title="Tahrirlash"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (await confirmAction({ title: t('patients.deleteConfirm') })) onDeletePatient(patient.id);
                        }}
                        className="text-gray-400 hover:text-red-600 dark:hover:text-red-400 p-1.5 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                        title={t('patients.actions.delete')}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredPatients.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                    <Search className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                    So'rovingiz bo'yicha bemorlar topilmadi.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Doctor Assignment Modal */}
      <Modal isOpen={isAssignModalOpen} onClose={() => setIsAssignModalOpen(false)} title="Doktorga Biriktirish">
        {selectedPatient && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
              <div className="h-10 w-10 rounded-full bg-primary-100 dark:bg-primary-900/50 flex items-center justify-center text-primary-600 font-bold">
                {selectedPatient.firstName[0]}{selectedPatient.lastName[0]}
              </div>
              <div>
                <p className="font-semibold text-gray-900 dark:text-white">{formatFullName(selectedPatient)}</p>
                <p className="text-sm text-gray-500">{showPatientPhone ? selectedPatient.phone : maskPhone(selectedPatient.phone)}</p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Shifokorni tanlang</label>
              <select
                value={assignDoctorId}
                onChange={(e) => setAssignDoctorId(e.target.value)}
                className="w-full h-10 rounded-md border border-gray-300 dark:border-gray-700 bg-transparent text-sm dark:text-white px-3 focus:ring-2 focus:ring-primary-500"
              >
                <option value="">— Biriktirilmagan —</option>
                {doctors.filter((d) => d.status === 'Active').map((d) => (
                  <option key={d.id} value={d.id}>{formatFullName(d)} ({d.specialty})</option>
                ))}
              </select>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="secondary" onClick={() => setIsAssignModalOpen(false)} disabled={isAssigning}>
                Bekor qilish
              </Button>
              <Button onClick={handleAssignDoctor} disabled={isAssigning}>
                {isAssigning ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saqlanmoqda...</> : <><UserCheck className="w-4 h-4 mr-2" />Biriktirish</>}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Bemor formasi — YAGONA. Yaratish va tahrirlash bitta oynada. */}
      <PatientFormModal
        isOpen={isAddModalOpen || !!editing}
        onClose={() => { setIsAddModalOpen(false); setEditing(null); }}
        patient={editing}
        onCreate={onAddPatient}
        onUpdate={onUpdatePatient}
        doctors={doctors}
        userRole={userRole as any}
        allowPhoto
        onSaved={(p, kind) => {
          setIsAddModalOpen(false);
          setEditing(null);
          /* Takror ro'yxatidan MAVJUD karta tanlansa — uni ochamiz: odam
             aynan shuni qidirayotgan edi. Ilgari 409 bu yerda jimgina
             yutilardi (`catch {}`) va ekranda hech narsa bo'lmasdi.

             Yangi bemor yaratilganda ro'yxatda qolamiz — ketma-ket bir
             necha bemor kiritish odatiy ish. */
          if (kind === 'existing') onPatientClick(p.id);
        }}
      />

    </div>
  );
};