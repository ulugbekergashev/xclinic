import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { Wallet, BarChart3 } from 'lucide-react';
import { CashBook } from './CashBook';
import { FinanceReport } from './FinanceReport';
import {
    UserRole, Transaction, Expense, Doctor, Clinic, Appointment, Patient,
    LabOrder, Receptionist, CashRegisterDay, CashMovement, VisitCharge, Department,
} from '../types';
import type { CashCloseArgs } from './CashBook';

// Moliya bo'limi — bitta menyu punkti, ikkita tab:
//   Kassa   — kassaga qancha pul kirdi va qancha qoldi (faktik pul harakati)
//   Hisobot — qancha ishlab topdik: foyda, qarz, shifokor ulushi (tahlil)
//
// Shifokor buyurgan xizmatlarning to'lanmagan qatorlari Kassa tabidagi
// "To'lanmagan" ro'yxatiga qo'shiladi — alohida ekran QURILMAGAN, chunki
// CashBook allaqachon to'lov qabul qiladi va qarz yopadi.

type TabKey = 'kassa' | 'hisobot';

const TABS: { key: TabKey; label: string; icon: React.ElementType; subtitle: string }[] = [
    {
        key: 'kassa',
        label: 'Kassa',
        icon: Wallet,
        subtitle: 'Kassaga qancha pul kirdi va qancha qoldi',
    },
    {
        key: 'hisobot',
        label: 'Hisobot',
        icon: BarChart3,
        subtitle: "Qancha ishlab topdik — foyda, qarz, shifokor ulushi",
    },
];

interface FinanceHubProps {
    userRole: UserRole;
    transactions: Transaction[];
    expenses: Expense[];
    appointments: Appointment[];
    services: { name: string; price: number; duration: number }[];
    patients: Patient[];
    doctors: Doctor[];
    receptionists?: Receptionist[];
    currentClinic?: Clinic;
    labOrders?: LabOrder[];
    doctorId: string;
    clinicId?: string;
    onPatientClick: (id: string) => void;
    onAddTransaction?: (tx: Omit<Transaction, 'id'>) => Promise<any>;
    onAddExpense?: (expense: Omit<Expense, 'id'>) => Promise<any>;
    onUpdateExpense?: (id: string, data: Partial<Expense>) => Promise<void>;
    onDeleteExpense?: (id: string) => Promise<void>;
    closures?: CashRegisterDay[];
    movements?: CashMovement[];
    onCloseDay?: (payload: CashCloseArgs) => Promise<any>;
    onReopenDay?: (date: string, shift?: number) => Promise<void>;
    onAddCashMovement?: (data: Omit<CashMovement, 'id' | 'clinicId' | 'createdAt' | 'createdByName'>) => Promise<any>;
    onDeleteCashMovement?: (id: string) => Promise<void>;
    onUpdateTransaction?: (id: string, data: Partial<Transaction>) => Promise<void>;
    onDeleteTransaction?: (id: string) => Promise<void>;
    currentUserName?: string;
    addToast: (type: 'success' | 'error' | 'info', msg: string) => void;
    /** Shifokor buyurgan to'lanmagan hisob qatorlari */
    charges?: VisitCharge[];
    onChargesChanged?: () => void;
    departments?: Department[];
}

export const FinanceHub: React.FC<FinanceHubProps> = (props) => {
    const { userRole, transactions, expenses, doctors, currentClinic, onPatientClick } = props;

    // Hisobot — tahlil va foyda; buni faqat klinika rahbariyati ko'radi.
    const canSeeReports = userRole === UserRole.CLINIC_ADMIN;

    const [searchParams, setSearchParams] = useSearchParams();
    const requested = searchParams.get('tab') as TabKey | null;
    const activeTab: TabKey = requested === 'hisobot' && canSeeReports ? 'hisobot' : 'kassa';

    const visibleTabs = canSeeReports ? TABS : TABS.filter(t => t.key === 'kassa');
    const current = TABS.find(t => t.key === activeTab)!;

    const selectTab = (key: TabKey) => {
        const next = new URLSearchParams(searchParams);
        if (key === 'kassa') next.delete('tab');
        else next.set('tab', key);
        setSearchParams(next, { replace: true });
    };

    return (
        <div className="space-y-5 animate-fade-in">
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Moliya</h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{current.subtitle}</p>
                </div>

                {visibleTabs.length > 1 && (
                    <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl">
                        {visibleTabs.map(tab => {
                            const Icon = tab.icon;
                            const active = tab.key === activeTab;
                            return (
                                <button
                                    key={tab.key}
                                    onClick={() => selectTab(tab.key)}
                                    className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${active
                                        ? 'bg-white dark:bg-gray-700 text-primary-600 dark:text-white shadow-sm'
                                        : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                                        }`}
                                >
                                    <Icon className="w-4 h-4" />
                                    {tab.label}
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>

            {activeTab === 'kassa' ? (
                <CashBook
                    embedded
                    transactions={transactions}
                    expenses={expenses}
                    doctors={doctors}
                    currentClinic={currentClinic}
                    onPatientClick={onPatientClick}
                    closures={props.closures}
                    canReopen={userRole === UserRole.CLINIC_ADMIN}
                    onCloseDay={props.onCloseDay}
                    onReopenDay={props.onReopenDay}
                    patients={props.patients}
                    appointments={props.appointments}
                    services={props.services}
                    clinicId={props.clinicId || currentClinic?.id || ''}
                    onAddTransaction={props.onAddTransaction}
                    onAddExpense={props.onAddExpense}
                    movements={props.movements}
                    onAddCashMovement={props.onAddCashMovement}
                    onDeleteCashMovement={props.onDeleteCashMovement}
                    onUpdateTransaction={props.onUpdateTransaction}
                    onDeleteTransaction={props.onDeleteTransaction}
                    charges={props.charges}
                    onChargesChanged={props.onChargesChanged}
                />
            ) : (
                <FinanceReport embedded departments={props.departments} />
            )}
        </div>
    );
};
