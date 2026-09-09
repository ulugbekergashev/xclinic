import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { Wallet, BarChart3, CalendarCheck } from 'lucide-react';
import { CashBook } from './CashBook';
import { FinanceReport } from './FinanceReport';
import { AttendanceTab } from '../components/AttendanceReport';
import { UserRole, Transaction, Expense, Doctor, Clinic, Appointment, Patient,
    LabOrder, Receptionist, CashRegisterDay, CashMovement, VisitCharge, Department, Service } from '../types';
import type { CashCloseArgs } from './CashBook';
import { useLanguage } from '../context/LanguageContext';
import type { TranslationKey } from '../i18n/translations';

// Moliya bo'limi — bitta menyu punkti, ikkita tab:
//   Kassa   — kassaga qancha pul kirdi va qancha qoldi (faktik pul harakati)
//   Hisobot — qancha ishlab topdik: foyda, qarz, shifokor ulushi (tahlil)
//
// Shifokor buyurgan xizmatlarning to'lanmagan qatorlari Kassa tabidagi
// "To'lanmagan" ro'yxatiga qo'shiladi — alohida ekran QURILMAGAN, chunki
// CashBook allaqachon to'lov qabul qiladi va qarz yopadi.

/* «Ulush» BU YERDA EMAS — u Xodimlar moduliga ko'chdi.

   Stavkalar va vedomost xodim haqidagi savol: kimga qancha hisoblandi.
   Moliyada u kassa va foyda bilan bir qatorda turardi, stavkani
   o'zgartirish uchun esa avval shifokorni RO'YXATDAN tanlash kerak
   edi — ya'ni xodim kartasidan chiqib, boshqa bo'limga borib, o'sha
   odamni qaytadan qidirish. Endi ikkalasi ham /staff da. */
type TabKey = 'kassa' | 'hisobot' | 'davomat';

/* SARLAVHALAR TARJIMA KALITI BILAN, MATN BILAN EMAS.

   Bu yerda ular qo'lda o'zbekcha yozilgan edi. Ilova rus tiliga
   o'tkazilganda ekranning yarmi o'zbekcha qolardi: tugmalar
   («Пополнить аванс», «Расход») tarjima qilinardi, sarlavha va
   vkladkalar esa yo'q. `checkI18n.mjs` buni ushlay olmaydi — u faqat
   ikki tilning kalitlarini solishtiradi, kalitsiz matnni ko'rmaydi. */
const TABS: { key: TabKey; labelKey: TranslationKey; icon: React.ElementType; subtitleKey: TranslationKey }[] = [
    {
        key: 'kassa',
        labelKey: 'finance.hub.kassa',
        icon: Wallet,
        subtitleKey: 'finance.hub.kassaHint',
    },
    {
        key: 'hisobot',
        labelKey: 'finance.hub.report',
        icon: BarChart3,
        subtitleKey: 'finance.hub.reportHint',
    },
    {
        /* DAVOMAT KALENDARDAN KO'CHDI.

           U kalendarning uchinchi ko'rinishi edi va kalendar bilan bitta
           tugmalar qatorida turardi. Kalendar esa ISH ekrani: registrator
           unda yozadi va «keldi» deb belgilaydi. Uch oylik grafik egaga
           oyda bir marta kerak — va u kassa, foyda, ulush bilan bir
           qatorda turgani mantiqiyroq: hammasi «klinika qanday
           ishlayapti» degan savolning javobi. */
        key: 'davomat',
        labelKey: 'finance.hub.attendance',
        icon: CalendarCheck,
        subtitleKey: 'finance.hub.attendanceHint',
    },
];

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

    // Hisobot — tahlil va foyda; buni faqat klinika rahbariyati ko'radi.
    const canSeeReports = userRole === UserRole.CLINIC_ADMIN;

    const [searchParams, setSearchParams] = useSearchParams();
    const requested = searchParams.get('tab') as TabKey | null;
    /* Hisobot — faqat egaga. Registrator kassada ishlaydi va manzilga
       qo'lda `?tab=hisobot` yozib kirib olmasligi kerak. */
    const activeTab: TabKey = canSeeReports
        && (requested === 'hisobot' || requested === 'davomat')
        ? requested
        : 'kassa';

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
                    <h1 className="text-2xl font-bold text-ink">{t('finance.hub.title')}</h1>
                    <p className="text-sm text-muted">{t(current.subtitleKey)}</p>
                </div>

                {visibleTabs.length > 1 && (
                    <div className="flex items-center gap-1 bg-elevated p-1 rounded-xl">
                        {visibleTabs.map(tab => {
                            const Icon = tab.icon;
                            const active = tab.key === activeTab;
                            return (
                                <button
                                    key={tab.key}
                                    onClick={() => selectTab(tab.key)}
                                    className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${active
                                        ? 'bg-surface text-primary-600 shadow-sm'
                                        : 'text-muted hover:text-muted'
                                        }`}
                                >
                                    <Icon className="w-4 h-4" />
                                    {t(tab.labelKey)}
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>

            {activeTab === 'davomat' ? (
                <AttendanceTab />
            ) : activeTab === 'kassa' ? (
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
            ) : (
                <FinanceReport embedded departments={props.departments} />
            )}
        </div>
    );
};
