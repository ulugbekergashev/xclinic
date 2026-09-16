import React from 'react';
import { useSearchParams, Navigate } from 'react-router-dom';
import { CashBook } from './CashBook';
import { UserRole, Transaction, Expense, Doctor, Clinic, Appointment, Patient,
    LabOrder, Receptionist, CashRegisterDay, CashMovement, VisitCharge, Department, Service } from '../types';
import type { CashCloseArgs } from './CashBook';
import { useLanguage } from '../context/LanguageContext';

/* Moliya — KASSA. Kassaga qancha pul kirdi va qancha qoldi (faktik pul
   harakati). Shifokor buyurgan xizmatlarning to'lanmagan qatorlari shu
   yerdagi «To'lanmagan» ro'yxatiga tushadi — alohida ekran QURILMAGAN,
   chunki CashBook allaqachon to'lov qabul qiladi va qarz yopadi.

   HISOBOT VA DAVOMAT BU YERDA EMAS (2026-09-16). Ular Moliyaning
   vkladkalari edi — faqat egaga ko'rinadigan, kassaning yonida. Endi ular
   Bosh panelda (`pages/Dashboard.tsx`): Moliya registratorning ish
   quroli, Bosh panel eganing savoli. Eski `?tab=hisobot` va
   `?tab=davomat` havolalari o'sha yerga yo'naltiriladi. */

/* «Ulush» BU YERDA EMAS — u Xodimlar moduliga ko'chdi.

   Stavkalar va vedomost xodim haqidagi savol: kimga qancha hisoblandi.
   Moliyada u kassa va foyda bilan bir qatorda turardi, stavkani
   o'zgartirish uchun esa avval shifokorni RO'YXATDAN tanlash kerak
   edi — ya'ni xodim kartasidan chiqib, boshqa bo'limga borib, o'sha
   odamni qaytadan qidirish. Endi ikkalasi ham /staff da. */
interface FinanceHubProps {
    userRole: UserRole;
    transactions: Transaction[];
    expenses: Expense[];
    appointments: Appointment[];
    /* `Service` — yagona haqiqat manbai (`types.ts`). Bu yerda uning
    QISQARTIRILGAN nusxasi yozilgan edi va u haqiqatdan farq qilardi:
    `duration` u yerda ixtiyoriy, bu yerda majburiy. Nusxa turlar
    ajralib ketishiga olib keladi. */
    services: Service[];
    patients: Patient[];
    doctors: Doctor[];
    receptionists?: Receptionist[];
    currentClinic?: Clinic;
    labOrders?: LabOrder[];
    doctorId: string;
    clinicId?: string;
    onPatientClick: (id: string) => void;
    onAddTransaction?: (tx: Omit<Transaction, 'id' | 'clinicId'>) => Promise<any>;
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
    const { t } = useLanguage();
    const { userRole, transactions, expenses, doctors, currentClinic, onPatientClick } = props;

    /* Eski havola: `/finance?tab=hisobot` yoki `?tab=davomat`. Hisobot
       Bosh panelga ko'chdi — o'sha yerga, o'sha vkladkaga. Egadan boshqa
       rol uchun bu vkladkalar hech qachon bo'lmagan: ular kassada qoladi. */
    const [searchParams] = useSearchParams();
    const requested = searchParams.get('tab');
    if (userRole === UserRole.CLINIC_ADMIN && (requested === 'hisobot' || requested === 'davomat')) {
        return <Navigate to={`/dashboard?tab=${requested}`} replace />;
    }

    return (
        <div className="space-y-5 animate-fade-in">
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-ink">{t('finance.hub.title')}</h1>
                    <p className="text-sm text-muted">{t('finance.hub.kassaHint')}</p>
                </div>

            </div>

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
                    onUpdateExpense={props.onUpdateExpense}
                    onDeleteExpense={props.onDeleteExpense}
                    movements={props.movements}
                    onAddCashMovement={props.onAddCashMovement}
                    onDeleteCashMovement={props.onDeleteCashMovement}
                    onUpdateTransaction={props.onUpdateTransaction}
                    onDeleteTransaction={props.onDeleteTransaction}
                    charges={props.charges}
                    onChargesChanged={props.onChargesChanged}
                    // Chegirma va qaytarish tugmalari rolga qarab ko'rinadi
                    userRole={userRole}
                    departments={props.departments}
                    currentUserName={props.currentUserName}
                    addToast={props.addToast}
                />
        </div>
    );
};
