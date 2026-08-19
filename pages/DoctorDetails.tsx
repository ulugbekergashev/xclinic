import React, { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Doctor, Appointment, Transaction, Patient, Service } from '../types';
import { Card, Button, Badge } from '../components/Common';
import { ArrowLeft, Phone, Mail, Award, Calendar, DollarSign, Users, Star } from 'lucide-react';
import { calculateDoctorShare, transactionBelongsToDoctor } from '../utils/financialCalculations';
import { getPaymentMethodLabel, getPaymentMethodColor } from '../utils/paymentMethods';
import { getCurrentMonthRange } from '../utils/dateUtils';
import { useLanguage } from '../context/LanguageContext';

interface DoctorDetailsProps {
    doctors: Doctor[];
    appointments: Appointment[];
    transactions: Transaction[];
    patients: Patient[];
    services: Service[];
    onBack: () => void;
    onPatientClick: (id: string) => void;
}

export const DoctorDetails: React.FC<DoctorDetailsProps> = ({
    doctors,
    appointments,
    transactions,
    patients,
    services,
    onBack,
    onPatientClick
}) => {
    const { t } = useLanguage();
    const { doctorId } = useParams<{ doctorId: string }>();
    const [activeTab, setActiveTab] = useState<'appointments' | 'upcoming_appointments' | 'transactions' | 'patients'>('upcoming_appointments');
    const doctor = doctors.find(d => d.id === doctorId);

    // Time filters for stats
    const { startDate, endDate } = getCurrentMonthRange();

    // Filter doctor's specific data
    const doctorAppts = useMemo(() => appointments.filter(a => a.doctorId === doctorId), [appointments, doctorId]);

    const upcomingAppts = useMemo(() => {
        const now = new Date();
        now.setHours(0, 0, 0, 0); // Start of today
        return doctorAppts.filter(a => {
            const apptDate = new Date(a.date);
            return apptDate >= now && a.status !== 'Completed' && a.status !== 'Cancelled';
        });
    }, [doctorAppts]);

    const pastAppts = useMemo(() => {
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        return doctorAppts.filter(a => {
            const apptDate = new Date(a.date);
            return apptDate < now || a.status === 'Completed' || a.status === 'Cancelled';
        });
    }, [doctorAppts]);

    const doctorPatients = useMemo(() => patients.filter(p => p.doctorId === doctorId), [patients, doctorId]);

    // Qat'iy atributsiya: doctorId yoki aniq ism tengligi (taxminiy moslashtirish yo'q)
    const doctorTransactions = useMemo(() => {
        if (!doctor) return [];
        return transactions.filter(tx => transactionBelongsToDoctor(tx, doctor));
    }, [transactions, doctor]);


    // Current Month Stats (for the header cards)
    const currentMonthStats = useMemo(() => {
        if (!doctor) return { gross: 0, net: 0, salary: 0, apptCount: 0, uniquePatients: 0 };

        const monthStart = new Date(startDate);
        const monthEnd = new Date(endDate);

        const monthTx = doctorTransactions.filter(tx => {
            const d = new Date(tx.date);
            return d >= monthStart && d <= monthEnd;
        });

        const monthAppts = doctorAppts.filter(a => {
            const d = new Date(a.date);
            return d >= monthStart && d <= monthEnd;
        });

        // Hisoblangan ulush = to'langan to'lovlar × shifokor foizi
        const share = calculateDoctorShare(monthTx, doctor);
        const uniquePats = new Set(monthAppts.map(a => a.patientId)).size;

        return {
            gross: share.grossRevenue,
            net: share.grossRevenue - share.accrued,
            salary: share.accrued,
            apptCount: monthAppts.length,
            uniquePatients: uniquePats
        };
    }, [doctor, doctorTransactions, doctorAppts, startDate, endDate, services]);

    if (!doctor) {
        return (
            <div className="flex flex-col items-center justify-center h-96">
                <h2 className="text-xl font-bold text-gray-900 mb-4">{t('doctors.details.notFound')}</h2>
                <Button onClick={onBack}>{t('common.back') || 'Ortga qaytish'}</Button>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-fade-in max-w-7xl mx-auto">
            {/* Header and Back Button */}
            <div className="flex items-center gap-4">
                <button
                    onClick={onBack}
                    className="p-2 -ml-2 text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                    <ArrowLeft className="w-6 h-6" />
                </button>
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
                        Dr. {doctor.lastName} {doctor.firstName}
                        <span className={`text-xs px-2.5 py-1 rounded-full border ${doctor.status === 'Active'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800'
                            : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800'
                            }`}>
                            {doctor.status === 'Active' ? t('doctors.status.active') : t('doctors.status.inactive')}
                        </span>
                    </h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{doctor.specialty} • {doctor.percentage || 0}% {t('doctors.details.share')}</p>
                </div>
            </div>

            {/* Profile Overview */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Contact info card */}
                <Card className="p-6">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4 uppercase tracking-wider">{t('doctors.details.contactInfo')}</h3>
                    <div className="space-y-4">
                        <div className="flex items-center gap-3 text-sm">
                            <div className="w-8 h-8 rounded-full bg-primary-50 dark:bg-primary-900/20 flex items-center justify-center text-primary-600 dark:text-primary-400">
                                <Phone className="w-4 h-4" />
                            </div>
                            <div>
                                <p className="text-gray-500 dark:text-gray-400 text-xs">{t('doctors.details.primaryPhone')}</p>
                                <p className="font-medium text-gray-900 dark:text-white">{doctor.phone}</p>
                            </div>
                        </div>
                        {doctor.secondaryPhone && (
                            <div className="flex items-center gap-3 text-sm">
                                <div className="w-8 h-8 rounded-full bg-primary-50 dark:bg-primary-900/20 flex items-center justify-center text-primary-600 dark:text-primary-400">
                                    <Phone className="w-4 h-4" />
                                </div>
                                <div>
                                    <p className="text-gray-500 dark:text-gray-400 text-xs">{t('doctors.details.secondaryPhone')}</p>
                                    <p className="font-medium text-gray-900 dark:text-white">{doctor.secondaryPhone}</p>
                                </div>
                            </div>
                        )}
                        {doctor.email && (
                            <div className="flex items-center gap-3 text-sm">
                                <div className="w-8 h-8 rounded-full bg-purple-50 dark:bg-purple-900/20 flex items-center justify-center text-purple-600 dark:text-purple-400">
                                    <Mail className="w-4 h-4" />
                                </div>
                                <div>
                                    <p className="text-gray-500 dark:text-gray-400 text-xs">{t('doctors.details.email')}</p>
                                    <p className="font-medium text-gray-900 dark:text-white">{doctor.email}</p>
                                </div>
                            </div>
                        )}
                        <div className="flex items-center gap-3 text-sm">
                            <div className="w-8 h-8 rounded-full bg-yellow-50 dark:bg-yellow-900/20 flex items-center justify-center text-yellow-600 dark:text-yellow-400">
                                <Award className="w-4 h-4" />
                            </div>
                            <div>
                                <p className="text-gray-500 dark:text-gray-400 text-xs">{t('doctors.details.specialty')}</p>
                                <p className="font-medium text-gray-900 dark:text-white">{doctor.specialty}</p>
                            </div>
                        </div>
                    </div>
                </Card>

                {/* Current Month Stats */}
                <div className="lg:col-span-2 grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <Card className="p-4 flex flex-col justify-center">
                        <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 mb-2">
                            <Calendar className="w-4 h-4" />
                            <span className="text-xs font-medium uppercase tracking-wider">{t('doctors.details.monthAppts')}</span>
                        </div>
                        <p className="text-2xl font-bold text-gray-900 dark:text-white">{currentMonthStats.apptCount}</p>
                    </Card>

                    <Card className="p-4 flex flex-col justify-center">
                        <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 mb-2">
                            <Users className="w-4 h-4" />
                            <span className="text-xs font-medium uppercase tracking-wider">{t('doctors.details.uniquePatients')}</span>
                        </div>
                        <p className="text-2xl font-bold text-gray-900 dark:text-white">{currentMonthStats.uniquePatients}</p>
                    </Card>

                    <Card className="p-4 flex flex-col justify-center">
                        <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 mb-2">
                            <DollarSign className="w-4 h-4 text-green-500" />
                            <span className="text-xs font-medium uppercase tracking-wider">{t('doctors.details.monthGross')}</span>
                        </div>
                        <p className="text-xl font-bold text-gray-900 dark:text-white">{currentMonthStats.gross.toLocaleString()} UZS</p>
                    </Card>

                    <Card className="p-4 flex flex-col justify-center bg-primary-50 dark:bg-primary-900/10 border-primary-100 dark:border-primary-900/30">
                        <div className="flex items-center gap-2 text-primary-600 dark:text-primary-400 mb-2">
                            <DollarSign className="w-4 h-4" />
                            <span className="text-xs font-medium uppercase tracking-wider">{t('doctors.details.monthSalary')}</span>
                        </div>
                        <p className="text-xl font-bold text-primary-700 dark:text-primary-300">{currentMonthStats.salary.toLocaleString()} UZS</p>
                    </Card>
                </div>
            </div>

            {/* Tabs */}
            <div className="border-b border-gray-200 dark:border-gray-700">
                <nav className="-mb-px flex space-x-8 overflow-x-auto">
                    <button
                        onClick={() => setActiveTab('upcoming_appointments')}
                        className={`whitespace-nowrap pb-4 px-1 border-b-2 font-medium text-sm transition-colors ${activeTab === 'upcoming_appointments'
                            ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                            }`}
                    >
                        {t('doctors.details.tabUpcoming')} ({upcomingAppts.length})
                    </button>
                    <button
                        onClick={() => setActiveTab('appointments')}
                        className={`whitespace-nowrap pb-4 px-1 border-b-2 font-medium text-sm transition-colors ${activeTab === 'appointments'
                            ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                            }`}
                    >
                        {t('doctors.details.tabHistory')} ({pastAppts.length})
                    </button>
                    <button
                        onClick={() => setActiveTab('transactions')}
                        className={`whitespace-nowrap pb-4 px-1 border-b-2 font-medium text-sm transition-colors ${activeTab === 'transactions'
                            ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                            }`}
                    >
                        {t('doctors.details.tabTransactions')} ({doctorTransactions.length})
                    </button>
                    <button
                        onClick={() => setActiveTab('patients')}
                        className={`whitespace-nowrap pb-4 px-1 border-b-2 font-medium text-sm transition-colors ${activeTab === 'patients'
                            ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                            }`}
                    >
                        {t('doctors.details.tabPatients')} ({doctorPatients.length})
                    </button>
                </nav>
            </div>

            {/* Tab Content */}
            <Card className="overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-gray-50 dark:bg-gray-900/50">
                            <tr className="border-b border-gray-200 dark:border-gray-700">
                                <th className="px-6 py-4 text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    {activeTab === 'patients' ? t('doctors.details.thName') : t('doctors.details.thDate')}
                                </th>
                                <th className="px-6 py-4 text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    {activeTab === 'patients' ? t('doctors.details.thPhone') : t('doctors.details.thPatient')}
                                </th>
                                <th className="px-6 py-4 text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    {activeTab === 'patients' ? t('doctors.details.thLastVisit') : t('doctors.details.thService')}
                                </th>
                                {(activeTab === 'appointments' || activeTab === 'upcoming_appointments') && (
                                    <th className="px-6 py-4 text-xs font-medium text-gray-500 uppercase tracking-wider">{t('doctors.details.thStatus')}</th>
                                )}
                                {activeTab === 'patients' && (
                                    <th className="px-6 py-4 text-xs font-medium text-gray-500 uppercase tracking-wider text-right">{t('doctors.details.thStatus')}</th>
                                )}
                                {activeTab === 'transactions' && (
                                    <>
                                        <th className="px-6 py-4 text-xs font-medium text-gray-500 uppercase tracking-wider text-right">{t('doctors.details.thAmount')}</th>
                                        <th className="px-6 py-4 text-xs font-medium text-gray-500 uppercase tracking-wider">{t('doctors.details.thPaymentType')}</th>
                                    </>
                                )}
                            </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                            {(activeTab === 'appointments' || activeTab === 'upcoming_appointments') ? (
                                (activeTab === 'appointments' ? pastAppts : upcomingAppts)
                                    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                                    .map(appt => (
                                        <tr key={appt.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="text-sm font-medium text-gray-900 dark:text-white">{appt.date}</div>
                                                <div className="text-xs text-gray-500">{appt.time} ({appt.duration} {t('common.min') || 'daq'})</div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <button
                                                    onClick={() => onPatientClick(appt.patientId)}
                                                    className="text-sm font-medium text-primary-600 hover:text-primary-800 dark:text-primary-400 dark:hover:text-primary-300 hover:underline"
                                                >
                                                    {appt.patientName}
                                                </button>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{appt.type}</td>
                                            <td className="px-6 py-4 whitespace-nowrap"><Badge status={appt.status} /></td>
                                        </tr>
                                    ))
                            ) : activeTab === 'patients' ? (
                                doctorPatients.sort((a, b) => new Date(b.lastVisit).getTime() - new Date(a.lastVisit).getTime()).map(p => (
                                    <tr key={p.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <button
                                                onClick={() => onPatientClick(p.id)}
                                                className="text-sm font-medium text-primary-600 hover:text-primary-800 dark:text-primary-400 dark:hover:text-primary-300 hover:underline"
                                            >
                                                {p.lastName} {p.firstName}
                                            </button>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                                            {p.phone}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                            {p.lastVisit ? new Date(p.lastVisit).toLocaleDateString() : '-'}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right">
                                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${p.status === 'Active' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400'
                                                }`}>
                                                {p.status === 'Active' ? t('doctors.status.active') : t('doctors.status.inactive')}
                                            </span>
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                doctorTransactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(tx => (
                                    <tr key={tx.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                                            {new Date(tx.date).toLocaleDateString('uz-UZ', { year: 'numeric', month: 'short', day: 'numeric' })}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                                            {tx.patientName}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{tx.service}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900 dark:text-white text-right">
                                            {tx.amount.toLocaleString()} UZS
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span
                                                className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700 dark:bg-gray-700/50 dark:text-gray-200"
                                            >
                                                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: getPaymentMethodColor(tx.type) }} />
                                                {getPaymentMethodLabel(tx.type)}
                                            </span>
                                        </td>
                                    </tr>
                                ))
                            )}
                            {((activeTab === 'appointments' && pastAppts.length === 0) ||
                                (activeTab === 'upcoming_appointments' && upcomingAppts.length === 0) ||
                                (activeTab === 'transactions' && doctorTransactions.length === 0) ||
                                (activeTab === 'patients' && doctorPatients.length === 0)) && (
                                    <tr>
                                        <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                                            {t('common.noData')}
                                        </td>
                                    </tr>
                                )}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    );
};
