import React, { useState } from 'react';
import { Card, Button, Modal, Input, Select, Badge, SearchableSelect } from '../components/Common';
import {
  ChevronLeft, ChevronRight, Plus, Clock, User, FileText,
  XCircle, CheckCircle, Send, Bell, Edit2, Loader2,
  Search
} from 'lucide-react';
import { Appointment, Patient, Doctor, UserRole, Clinic, SubscriptionPlan, ServiceCategory } from '../types';
import { api } from '../services/api';
import { useLanguage } from '../context/LanguageContext';

interface CalendarProps {
  appointments: Appointment[];
  patients: Patient[];
  doctors: Doctor[];
  services: { name: string; price: number; duration: number }[];
  categories: ServiceCategory[];
  onAddAppointment: (appt: Omit<Appointment, 'id'>) => Promise<void>;
  onUpdateAppointment: (id: string, data: Partial<Appointment>) => Promise<void>;
  onDeleteAppointment: (id: string) => void;
  onAddPatient: (patient: Omit<Patient, 'id'>) => Promise<Patient | undefined>;
  userRole: UserRole;
  doctorId: string;
  currentClinic?: Clinic;
  plans: SubscriptionPlan[];
  onPatientClick?: (id: string) => void;
}



export const Calendar: React.FC<CalendarProps> = ({
  appointments, patients, doctors, services, categories, onAddAppointment, onUpdateAppointment, onDeleteAppointment, onAddPatient, userRole, doctorId, currentClinic, plans, onPatientClick
}) => {
  const { t } = useLanguage();
  const startHour = currentClinic?.startHour ?? 8;
  const endHour = currentClinic?.endHour ?? 20;
  const HOURS = Array.from({ length: Math.max(1, endHour - startHour + 1) }, (_, i) => i + startHour);
  // Filter appointments for doctors
  const filteredAppointments = userRole === UserRole.DOCTOR && doctorId
    ? appointments.filter(a => a.doctorId === doctorId)
    : appointments;
  // State
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<'day' | 'week'>('week');
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
    date: new Date().toISOString().split('T')[0],
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
      date: initialDate || new Date().toISOString().split('T')[0],
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

  const activeDoctors = doctors.filter(d => d.status === 'Active');
  const gridColsClass = view === 'week' 
    ? 'grid-cols-8' 
    : activeDoctors.length > 0 
      ? `grid-cols-[60px_repeat(${activeDoctors.length},minmax(200px,1fr))]` 
      : 'grid-cols-[60px_1fr]';

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
      alert("Iltimos, avval bemorni tanlang!");
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
          // alert("Individual tarif bo'yicha shifokor profili avtomatik yaratildi.");
        } catch (err) {
          console.error('Failed to auto-create doctor', err);
          alert("Xatolik: Shifokor profilini avtomatik yaratib bo'lmadi. Iltimos, Sozlamalar bo'limida yarating.");
          return;
        }
      } else if (doctors.length > 0) {
        // Auto-select first doctor
        finalDoctorId = doctors[0].id;
        finalDoctorName = `Dr. ${doctors[0].lastName}`;
      } else {
        alert("Tizimda shifokor mavjud emas! Iltimos, 'Sozlamalar' bo'limiga o'tib, kamida bitta shifokor profilini yarating.");
        return;
      }
    }

    if (!isIndividualPlan && !finalDoctorId) {
      alert("Iltimos, shifokorni tanlang!");
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
      alert("Bemor topilmadi.");
      return;
    }

    // Only check for doctor object if we didn't just create it
    if (!doctor && !finalDoctorName) {
      // Should not match here if we handled creation
      alert("Shifokor topilmadi.");
      return;
    }

    // Set names if we found existing doctor
    if (doctor) {
      finalDoctorName = `Dr. ${doctor.lastName}`;
    }

    // Doctor Conflict Validation
    const doctorConflict = appointments.some(appt =>
      appt.id !== editingApptId &&
      appt.doctorId === finalDoctorId &&
      appt.date === formData.date &&
      appt.time === formData.time &&
      appt.status !== 'Cancelled'
    );

    if (doctorConflict) {
      alert('Ushbu vaqtda shifokorda boshqa qabul mavjud! Iltimos, boshqa vaqt tanlang.');
      return;
    }

    // Patient Conflict Validation
    const patientConflict = appointments.some(appt =>
      appt.id !== editingApptId &&
      appt.patientId === patient.id &&
      appt.date === formData.date &&
      appt.time === formData.time &&
      appt.status !== 'Cancelled'
    );

    if (patientConflict) {
      alert('Ushbu vaqtda bemorda boshqa qabul mavjud! Iltimos, boshqa vaqt tanlang.');
      return;
    }

    try {
      if (editingApptId) {
        await onUpdateAppointment(editingApptId, {
          patientId: patient.id,
          patientName: `${patient.lastName} ${patient.firstName}`,
          doctorId: finalDoctorId,
          doctorName: finalDoctorName,
          type: formData.type || 'Konsultatsiya',
          date: formData.date,
          time: formData.time,
          duration: Number(formData.duration),
          notes: formData.notes
        });
      } else {
        await onAddAppointment({
          patientId: patient.id,
          patientName: `${patient.lastName} ${patient.firstName}`,
          doctorId: finalDoctorId,
          doctorName: finalDoctorName,
          type: formData.type || 'Konsultatsiya',
          date: formData.date,
          time: formData.time,
          duration: Number(formData.duration),
          status: 'Pending',
          notes: formData.notes
        });
      }
      setIsAddModalOpen(false);
      setEditingApptId(null);
    } catch (error) {
      // Error is handled by App.tsx toast and re-thrown
      // Keeping modal open on failure
    }
  };

  const handleStatusUpdate = async (status: Appointment['status']) => {
    if (selectedAppointment) {
      try {
        await onUpdateAppointment(selectedAppointment.id, { status });
        setSelectedAppointment({ ...selectedAppointment, status }); // Optimistic update for modal
      } catch (error) {
        // Error handled by App.tsx
      }
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messagePatientId) return;

    try {
      await api.patients.sendMessage(messagePatientId, messageText);
      alert('Xabar muvaffaqiyatli yuborildi!');
      setIsMessageModalOpen(false);
      setMessageText('');
    } catch (error: any) {
      console.error('Error sending message:', error);
      if (error.message === 'Bot not configured' || error.error === 'Bot not configured') {
        alert('⚠️ Bot sozlanmagan. Iltimos, Sozlamalar bo\'limida bot tokenini kiriting.');
      } else if (error.message === 'Patient telegram not linked' || error.error === 'Patient telegram not linked') {
        alert('⚠️ Bemor Telegram botga ulanmagan. Iltimos, bemorga bot havolasini yuboring.');
      } else {
        alert(`Xatolik: ${error.message || 'Xabar yuborishda xatolik yuz berdi.'}`);
      }
    }
  };

  const handlePatientSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patientFormData.firstName || !patientFormData.lastName) {
      alert("Iltimos, bemor ismi va familiyasini kiriting!");
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
            <button onClick={handlePrev} className="p-2 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300"><ChevronLeft className="w-4 h-4" /></button>
            <span className="px-4 text-sm font-medium min-w-[140px] text-center">
              {view === 'week'
                ? `${displayDays[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${displayDays[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                : displayDays[0].toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
              }
            </span>
            <button onClick={handleNext} className="p-2 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300"><ChevronRight className="w-4 h-4" /></button>
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
          <Button onClick={openAddModal} className="flex-1 sm:flex-none"><Plus className="w-4 h-4 mr-2" /> {t('calendar.newAppointment')}</Button>
        </div>
      </div>

      {/* Doctor Color Legend */}
      <div className="flex flex-wrap gap-4 px-1 py-1">
        {doctors.filter(d => d.status === 'Active').map(doc => (
          <div key={doc.id} className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full shadow-sm" style={{ backgroundColor: doc.color || '#3B82F6' }} />
            <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Dr. {doc.lastName}</span>
          </div>
        ))}
      </div>

      {/* Calendar Grid */}
      <div className="flex-1 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col relative">
        <div className="flex-1 overflow-auto">
          <div className={`h-full relative ${view === 'week' ? 'min-w-[1000px]' : activeDoctors.length > 2 ? 'min-w-fit' : 'w-full'}`}>
            {/* Header Row */}
            <div className={`grid ${gridColsClass} border-b border-gray-200 dark:border-gray-700 sticky top-0 z-30 bg-white dark:bg-gray-800`}>
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
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: doc.color || '#3B82F6' }} />
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
            <div className={`grid ${gridColsClass} h-[1200px] relative`}>
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
                  });
                });

                return filteredAppointments.map(app => {
                  const appDate = new Date(app.date);
                  const dayIndex = displayDays.findIndex(d => d.toDateString() === appDate.toDateString());
                  if (dayIndex === -1 && view === 'week') return null;
                  if (view === 'day' && app.date !== currentDate.toISOString().split('T')[0]) return null;

                  const [h, m] = app.time.split(':').map(Number);
                  if (isNaN(h)) return null;

                  const topOffset = ((h - startHour) * 96) + (m >= 30 ? 48 : 0) + (m % 30 / 30 * 48);
                  const height = (app.duration / 30) * 48;

                  const { col = 0, total = 1 } = layoutData[app.id] || {};
                  const colWidth = 100 / total;
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
                  const doctorColor = doctor?.color || '#3B82F6';

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
                      className={`absolute m-1 p-2 rounded-md border-l-4 text-xs shadow-sm cursor-pointer hover:brightness-95 transition-all z-10 ${isSpecialStatus ? statusColors : ''}`}
                      style={!isSpecialStatus ? {
                        top: `${topOffset}px`,
                        left: left,
                        width: width,
                        height: `${height - 4}px`,
                        backgroundColor: `${doctorColor}15`,
                        borderLeftColor: doctorColor,
                        color: doctorColor,
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
              })()}

            </div>
          </div>
        </div>
      </div>

      {/* Add Appointment Modal */}
      <Modal isOpen={isAddModalOpen} onClose={() => { setIsAddModalOpen(false); setEditingApptId(null); }} title={editingApptId ? t('calendar.editAppointment') : t('calendar.newAppointment')}>
        <form onSubmit={handleAddSubmit} className="space-y-4">
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <SearchableSelect
                label={t('calendar.patient')}
                options={patients.map(p => ({ value: p.id, label: `${p.lastName} ${p.firstName}` }))}
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
              options={doctors.map(d => ({ value: d.id, label: `Dr. ${d.firstName} ${d.lastName}` }))}
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
                <h3
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
                </h3>
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

                    <button
                      onClick={() => handleStatusUpdate('Completed')}
                      className="inline-flex items-center justify-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 flex-1"
                    >
                      <CheckCircle className="w-4 h-4 mr-2" />
                      {t('calendar.complete')}
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
                        if (confirm('Haqiqatan ham bu qabulni butunlay o\'chirmoqchimisiz?')) {
                          try {
                            await onDeleteAppointment(selectedAppointment.id);
                            setSelectedAppointment(null);
                          } catch (e) { }
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
