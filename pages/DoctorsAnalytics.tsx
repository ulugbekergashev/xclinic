import React, { useMemo, useState } from 'react';
import { Doctor, Appointment, Service, Transaction, Review } from '../types';
import { Card, Input } from '../components/Common';
import { DollarSign, Calendar, Award, Users, Star } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Legend } from 'recharts';
import { calculateDoctorShare, transactionBelongsToDoctor } from '../utils/financialCalculations';
import { Link, useNavigate } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext';
import { TranslationKey } from '../i18n/translations';

interface DoctorsAnalyticsProps {
    doctors: Doctor[];
    appointments: Appointment[];
    services: Service[];
    transactions: Transaction[];
    reviews: Review[];
}

type DateRange = 'month' | '3months' | '6months' | 'year' | 'all' | 'custom';

import { getCurrentMonthRange } from '../utils/dateUtils';

export const DoctorsAnalytics: React.FC<DoctorsAnalyticsProps> = ({ doctors, appointments, services, transactions, reviews }) => {
    const { t } = useLanguage();
    const navigate = useNavigate();
    const { startDate: defaultStart, endDate: defaultEnd } = getCurrentMonthRange();
    const [dateRange, setDateRange] = useState<DateRange>('month');
    const [customStartDate, setCustomStartDate] = useState(defaultStart);
    const [customEndDate, setCustomEndDate] = useState(defaultEnd);

    // Detect if clinic has only 1 doctor (individual plan)
    const hasSingleDoctor = doctors.length === 1;

    // Filter appointments by date range
    const filteredAppointments = useMemo(() => {
        if (dateRange === 'all') return appointments;

        const now = new Date();
        let startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        let endDate = now;

        if (dateRange === 'custom') {
            if (!customStartDate || !customEndDate) return appointments;
            startDate = new Date(customStartDate);
            endDate = new Date(customEndDate);
        } else if (dateRange !== 'month') {
            switch (dateRange) {
                case '3months':
                    startDate.setMonth(now.getMonth() - 3);
                    break;
                case '6months':
                    startDate.setMonth(now.getMonth() - 6);
                    break;
                case 'year':
                    startDate.setFullYear(now.getFullYear() - 1);
                    break;
            }
        }

        return appointments.filter(appt => {
            const apptDate = new Date(appt.date);
            return apptDate >= startDate && apptDate <= endDate;
        });
    }, [appointments, dateRange, customStartDate, customEndDate]);

    // Filter transactions by date range
    const filteredTransactions = useMemo(() => {
        if (dateRange === 'all') return transactions;

        const now = new Date();
        let startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        let endDate = now;

        if (dateRange === 'custom') {
            if (!customStartDate || !customEndDate) return transactions;
            startDate = new Date(customStartDate);
            endDate = new Date(customEndDate);
        } else if (dateRange !== 'month') {
            switch (dateRange) {
                case '3months':
                    startDate.setMonth(now.getMonth() - 3);
                    break;
                case '6months':
                    startDate.setMonth(now.getMonth() - 6);
                    break;
                case 'year':
                    startDate.setFullYear(now.getFullYear() - 1);
                    break;
            }
        }

        return transactions.filter(tx => {
            const txDate = new Date(tx.date);
            return txDate >= startDate && txDate <= endDate;
        });
    }, [transactions, dateRange, customStartDate, customEndDate]);

    // Calculate Metrics
    const analyticsData = useMemo(() => {
        return doctors.map(doctor => {
            const doctorAppts = filteredAppointments.filter(a => a.doctorId === doctor.id);
            const completedAppts = doctorAppts.filter(a => a.status === 'Completed');

            // Qat'iy atributsiya: doctorId yoki aniq ism tengligi.
            // Yagona shifokorli klinikada barcha kirim o'sha shifokorga tegishli (individual plan).
            const doctorTransactions = filteredTransactions.filter(tx => {
                if (hasSingleDoctor) {
                    return true;
                }
                return transactionBelongsToDoctor(tx, doctor);
            });

            // Calculate metrics
            // Use shared financial calculation utility
            // Hisoblangan ulush = to'langan to'lovlar × shifokor foizi
            const share = calculateDoctorShare(doctorTransactions, doctor);
            const grossRevenue = share.grossRevenue;
            const doctorSalary = share.accrued;
            const totalNetRevenue = grossRevenue - doctorSalary;

            // Unique Patients
            const uniquePatients = new Set(doctorAppts.map(a => a.patientId)).size;

            // Calculate Average Rating
            const doctorReviews = reviews.filter(r => {
                // Since Review has appointmentId, we can match through filteredAppointments
                const appt = appointments.find(a => a.id === r.appointmentId);
                return appt?.doctorId === doctor.id;
            });
            const avgRating = doctorReviews.length > 0
                ? doctorReviews.reduce((acc, r) => acc + r.rating, 0) / doctorReviews.length
                : 0;

            // Top Service
            const serviceCounts: Record<string, number> = {};
            completedAppts.forEach(appt => {
                serviceCounts[appt.type] = (serviceCounts[appt.type] || 0) + 1;
            });

            let topService = '-';
            let maxCount = 0;
            Object.entries(serviceCounts).forEach(([name, count]) => {
                if (count > maxCount) {
                    maxCount = count;
                    topService = name;
                }
            });

            // Average revenue per appointment
            const avgRevenue = doctorTransactions.length > 0
                ? grossRevenue / doctorTransactions.length
                : 0;

            // Day of week analysis
            const dayCount: Record<number, number> = {};
            doctorAppts.forEach(appt => {
                const day = new Date(appt.date).getDay();
                dayCount[day] = (dayCount[day] || 0) + 1;
            });
            const busiestDay = Object.entries(dayCount).sort((a, b) => b[1] - a[1])[0];
            const busiestDayName = busiestDay ? t(`common.days.${busiestDay[0]}` as TranslationKey) : '-';

            return {
                ...doctor,
                totalAppts: doctorAppts.length,
                completedAppts: completedAppts.length,
                uniquePatients,
                revenue: grossRevenue, // For charts/sorting (Total generated)
                salary: doctorSalary, // Actual doctor pay
                netRevenue: totalNetRevenue, // Profit for clinic context
                topService,
                topServiceCount: maxCount,
                avgRevenue,
                avgRating,
                reviewCount: doctorReviews.length,
                busiestDay: busiestDayName,
                name: `Dr. ${doctor.lastName}` // For charts
            };
        }).sort((a, b) => b.revenue - a.revenue);
    }, [doctors, filteredAppointments, filteredTransactions, t]);

    const totalRevenue = filteredTransactions.reduce((acc, t) => acc + (t.status === 'Paid' ? t.amount : 0), 0);
    const totalAppointments = analyticsData.reduce((sum, d) => sum + d.totalAppts, 0);
    const totalPatients = analyticsData.reduce((sum, d) => sum + d.uniquePatients, 0);
    const topPerformer = analyticsData.length > 0 ? analyticsData[0] : null;

    const dateRangeOptions = [
        { value: 'month' as DateRange, label: t('common.range.month') },
        { value: '3months' as DateRange, label: t('common.range.3months') },
        { value: '6months' as DateRange, label: t('common.range.6months') },
        { value: 'year' as DateRange, label: t('common.range.year') },
        { value: 'custom' as DateRange, label: t('common.range.custom') },
        { value: 'all' as DateRange, label: t('common.range.all') },
    ];

    const COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#6366f1'];

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Header with Date Range Filter */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('doctors.analytics.title')}</h1>

                <div className="flex gap-3">
                    <Input
                        type="date"
                        label={t('doctors.analytics.startDate')}
                        value={customStartDate}
                        onChange={(e) => {
                            setCustomStartDate(e.target.value);
                            setDateRange('custom');
                        }}
                        containerClassName="w-40"
                    />
                    <Input
                        type="date"
                        label={t('doctors.analytics.endDate')}
                        value={customEndDate}
                        onChange={(e) => {
                            setCustomEndDate(e.target.value);
                            setDateRange('custom');
                        }}
                        containerClassName="w-40"
                    />
                </div>
            </div>
            {/* Detailed Table Moved to Top */}
            <Card className="overflow-hidden bg-white dark:bg-gray-800">
                <div className="p-6 border-b border-gray-200 dark:border-gray-700">
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white">{t('doctors.analytics.detailedMetrics')}</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-gray-50 dark:bg-gray-900/50 text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider">
                                <th className="p-4 font-medium">{t('doctors.analytics.thDoctor')}</th>
                                <th className="p-4 font-medium">{t('doctors.analytics.thSpecialty')}</th>
                                <th className="p-4 font-medium text-center">{t('doctors.analytics.thPatients')}</th>
                                <th className="p-4 font-medium text-center">{t('doctors.analytics.thAppointments')}</th>
                                <th className="p-4 font-medium">{t('doctors.analytics.thTopService')}</th>
                                <th className="p-4 font-medium text-right">{t('doctors.analytics.thTotalRevenue')}</th>
                                <th className="p-4 font-medium text-right">{t('doctors.analytics.thDoctorShare')}</th>
                                <th className="p-4 font-medium text-right">{t('doctors.analytics.thAverage')}</th>
                                <th className="p-4 font-medium text-center">{t('doctors.analytics.thRating')}</th>
                                <th className="p-4 font-medium text-center">{t('doctors.analytics.thBusiestDay')}</th>
                                <th className="p-4 font-medium text-center">{t('doctors.analytics.thEfficiency')}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                            {analyticsData.map((doc) => (
                                <tr
                                    key={doc.id}
                                    className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors cursor-pointer"
                                    onClick={() => navigate(`/doctors/${doc.id}`)}
                                >
                                    <td className="p-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-primary-100 dark:bg-primary-900/50 flex items-center justify-center text-primary-600 dark:text-primary-400 font-bold text-sm">
                                                {doc.firstName[0]}{doc.lastName[0]}
                                            </div>
                                            <div>
                                                <Link to={`/doctors/${doc.id}`} onClick={(e) => e.stopPropagation()} className="font-medium text-primary-600 hover:text-primary-800 dark:text-primary-400 dark:hover:text-primary-300 hover:underline">
                                                    Dr. {doc.firstName} {doc.lastName}
                                                </Link>
                                                <p className="text-xs text-gray-500">{doc.phone}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="p-4 text-gray-600 dark:text-gray-300 text-sm">{doc.specialty}</td>
                                    <td className="p-4 text-center">
                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary-100 text-primary-800 dark:bg-primary-900/30 dark:text-primary-300">
                                            {doc.uniquePatients}
                                        </span>
                                    </td>
                                    <td className="p-4 text-center text-gray-900 dark:text-white font-medium text-sm">
                                        {doc.completedAppts} <span className="text-gray-400 text-xs font-normal">/ {doc.totalAppts}</span>
                                    </td>
                                    <td className="p-4">
                                        <div className="text-sm text-gray-900 dark:text-white">{doc.topService}</div>
                                        <div className="text-xs text-gray-500">{doc.topServiceCount} {t('common.times')}</div>
                                    </td>
                                    <td className="p-4 text-right font-bold text-gray-900 dark:text-white">
                                        {doc.revenue.toLocaleString()} UZS
                                    </td>
                                    <td className="p-4 text-right font-bold text-green-600 dark:text-green-400">
                                        {doc.salary.toLocaleString()} UZS
                                    </td>
                                    <td className="p-4 text-right text-sm text-gray-700 dark:text-gray-300">
                                        {Math.round(doc.avgRevenue).toLocaleString()} UZS
                                    </td>
                                    <td className="p-4 text-center">
                                        {doc.avgRating > 0 ? (
                                            <div className="flex flex-col items-center">
                                                <div className="flex items-center gap-1 text-yellow-500">
                                                    <Star className="w-4 h-4 fill-current" />
                                                    <span className="font-bold text-gray-900 dark:text-white">{doc.avgRating.toFixed(1)}</span>
                                                </div>
                                                <span className="text-[10px] text-gray-400">({doc.reviewCount})</span>
                                            </div>
                                        ) : (
                                            <span className="text-xs text-gray-400">-</span>
                                        )}
                                    </td>
                                    <td className="p-4 text-center">
                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300">
                                            {doc.busiestDay}
                                        </span>
                                    </td>
                                    <td className="p-4">
                                        <div className="flex items-center justify-center gap-2">
                                            <div className="w-24 h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                                                <div
                                                    className="h-full bg-primary-500 rounded-full transition-all"
                                                    style={{ width: `${doc.totalAppts > 0 ? (doc.completedAppts / doc.totalAppts) * 100 : 0}%` }}
                                                ></div>
                                            </div>
                                            <span className="text-xs text-gray-500 min-w-[35px]">
                                                {doc.totalAppts > 0 ? Math.round((doc.completedAppts / doc.totalAppts) * 100) : 0}%
                                            </span>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {analyticsData.length === 0 && (
                                <tr>
                                    <td colSpan={11} className="p-8 text-center text-gray-500">
                                        {t('doctors.analytics.noData')}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <Card className="p-6 bg-gradient-to-br from-primary-500 to-primary-600 text-white border-none">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-primary-100 text-sm font-medium mb-1">{t('doctors.analytics.thTotalRevenue')}</p>
                            <h3 className="text-3xl font-bold">{totalRevenue.toLocaleString()} UZS</h3>
                        </div>
                        <div className="p-3 bg-white/20 rounded-xl backdrop-blur-sm">
                            <DollarSign className="w-8 h-8 text-white" />
                        </div>
                    </div>
                </Card>

                <Card className="p-6 bg-white dark:bg-gray-800">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-gray-500 dark:text-gray-400 text-sm font-medium mb-1">{t('doctors.analytics.totalAppointments')}</p>
                            <h3 className="text-3xl font-bold text-gray-900 dark:text-white">{totalAppointments}</h3>
                        </div>
                        <div className="p-3 bg-purple-100 dark:bg-purple-900/30 rounded-xl">
                            <Calendar className="w-8 h-8 text-purple-600 dark:text-purple-400" />
                        </div>
                    </div>
                </Card>

                <Card className="p-6 bg-white dark:bg-gray-800">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-gray-500 dark:text-gray-400 text-sm font-medium mb-1">{t('doctors.analytics.totalPatients')}</p>
                            <h3 className="text-3xl font-bold text-gray-900 dark:text-white">{totalPatients}</h3>
                        </div>
                        <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-xl">
                            <Users className="w-8 h-8 text-green-600 dark:text-green-400" />
                        </div>
                    </div>
                </Card>

                <Card className="p-6 bg-white dark:bg-gray-800">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-gray-500 dark:text-gray-400 text-sm font-medium mb-1">{t('doctors.analytics.mostActive')}</p>
                            <h3 className="text-xl font-bold text-gray-900 dark:text-white truncate max-w-[180px]">
                                {topPerformer ? `Dr. ${topPerformer.lastName}` : '-'}
                            </h3>
                            <p className="text-xs text-green-500 font-medium mt-1">
                                {topPerformer ? `${topPerformer.revenue.toLocaleString()} UZS` : ''}
                            </p>
                        </div>
                        <div className="p-3 bg-yellow-100 dark:bg-yellow-900/30 rounded-xl">
                            <Award className="w-8 h-8 text-yellow-600 dark:text-yellow-400" />
                        </div>
                    </div>
                </Card>
            </div>

            {/* Single Doctor Mode Indicator */}
            {
                hasSingleDoctor && (
                    <Card className="p-4 bg-primary-50 dark:bg-primary-900/20 border-primary-200 dark:border-primary-800">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-primary-100 dark:bg-primary-900/40 rounded-lg">
                                <Users className="w-5 h-5 text-primary-600 dark:text-primary-400" />
                            </div>
                            <div className="flex-1">
                                <p className="text-sm font-medium text-primary-900 dark:text-primary-100">
                                    {t('doctors.analytics.individualMode')}
                                </p>
                                <p className="text-xs text-primary-600 dark:text-primary-400">
                                    {t('doctors.analytics.individualModeDesc').replace('{count}', filteredTransactions.length.toString())}
                                </p>
                            </div>
                        </div>
                    </Card>
                )
            }

            {/* Charts Section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Revenue Comparison Chart */}
                <Card className="p-6 bg-white dark:bg-gray-800">
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">{t('doctors.analytics.revenueComparison')}</h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={analyticsData} layout="vertical">
                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.1} />
                            <XAxis type="number" stroke="#9ca3af" fontSize={12} />
                            <YAxis dataKey="name" type="category" stroke="#9ca3af" fontSize={12} width={80} />
                            <Tooltip
                                contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px', color: '#fff' }}
                                formatter={(value: number) => `${value.toLocaleString()} UZS`}
                            />
                            <Bar dataKey="revenue" radius={[0, 8, 8, 0]}>
                                {analyticsData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </Card>

                {/* Appointments Comparison Chart */}
                <Card className="p-6 bg-white dark:bg-gray-800">
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">{t('doctors.analytics.appointmentsComparison')}</h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={analyticsData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.1} />
                            <XAxis dataKey="name" stroke="#9ca3af" fontSize={12} angle={-45} textAnchor="end" height={80} />
                            <YAxis stroke="#9ca3af" fontSize={12} />
                            <Tooltip
                                contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px', color: '#fff' }}
                            />
                            <Legend />
                            <Bar dataKey="totalAppts" name={t('doctors.analytics.chartTotal')} fill="#8b5cf6" radius={[8, 8, 0, 0]} />
                            <Bar dataKey="completedAppts" name={t('doctors.analytics.chartCompleted')} fill="#10b981" radius={[8, 8, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </Card>

                {/* Completion Rate Chart */}
                <Card className="p-6 bg-white dark:bg-gray-800">
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">{t('doctors.analytics.efficiencyRate')}</h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={analyticsData.map(d => ({
                            ...d,
                            completionRate: d.totalAppts > 0 ? Math.round((d.completedAppts / d.totalAppts) * 100) : 0
                        }))}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.1} />
                            <XAxis dataKey="name" stroke="#9ca3af" fontSize={12} angle={-45} textAnchor="end" height={80} />
                            <YAxis stroke="#9ca3af" fontSize={12} domain={[0, 100]} />
                            <Tooltip
                                contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px', color: '#fff' }}
                                formatter={(value: number) => `${value}%`}
                            />
                            <Bar dataKey="completionRate" name={t('doctors.analytics.thEfficiency')} fill="#3b82f6" radius={[8, 8, 0, 0]}>
                                {analyticsData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </Card>

                {/* Average Revenue Chart */}
                <Card className="p-6 bg-white dark:bg-gray-800">
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">{t('doctors.analytics.averageRevenuePerAppt')}</h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={analyticsData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.1} />
                            <XAxis dataKey="name" stroke="#9ca3af" fontSize={12} angle={-45} textAnchor="end" height={80} />
                            <YAxis stroke="#9ca3af" fontSize={12} />
                            <Tooltip
                                contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px', color: '#fff' }}
                                formatter={(value: number) => `${value.toLocaleString()} UZS`}
                            />
                            <Bar dataKey="avgRevenue" name={t('doctors.analytics.thAverage')} fill="#f59e0b" radius={[8, 8, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </Card>
            </div>

        </div>
    );
};
