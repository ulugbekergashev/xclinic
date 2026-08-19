import React, { useState, useEffect } from 'react';
import { Activity, Trash2 } from 'lucide-react';
import { Button, Card, Badge } from '../components/Common';
import { Transaction, Service, ServiceCategory } from '../types';
import { AddProcedureModal } from './AddProcedureModal';
import { useLanguage } from '../context/LanguageContext';

interface ProcedureItem {
    id: string;
    serviceId: number;
    serviceName: string;
    toothNumber?: number;
    price: number;
    notes?: string;
}

interface VisitWorkflowProps {
    services: Service[];
    categories: ServiceCategory[];
    doctors: any[];
    onCompleteVisit: (procedures: ProcedureItem[], total: number) => Promise<void>;
    onProceduresChange?: (procedures: ProcedureItem[]) => void;
    initialProcedures?: ProcedureItem[];
}

export const VisitWorkflow: React.FC<VisitWorkflowProps> = ({
    services = [],
    categories = [],
    doctors,
    onCompleteVisit,
    onProceduresChange,
    initialProcedures = []
}) => {
    const { t } = useLanguage();
    const [procedures, setProcedures] = useState<ProcedureItem[]>(initialProcedures);
    const [isModalOpen, setIsModalOpen] = useState(false);

    // Sync state if initialProcedures changes externally
    useEffect(() => {
        if (initialProcedures.length > 0 && procedures.length === 0) {
            setProcedures(initialProcedures);
        }
    }, [initialProcedures]);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleAddProcedure = (procedure: Omit<ProcedureItem, 'id'>) => {
        const newProcedure: ProcedureItem = {
            ...procedure,
            id: Date.now().toString() + Math.random()
        };
        const updated = [...procedures, newProcedure];
        setProcedures(updated);
        onProceduresChange?.(updated);
    };

    const handleAddProcedures = (newProcedures: Omit<ProcedureItem, 'id'>[]) => {
        const proceduresWithIds = newProcedures.map(p => ({
            ...p,
            id: Date.now().toString() + Math.random()
        }));
        const updated = [...procedures, ...proceduresWithIds];
        setProcedures(updated);
        onProceduresChange?.(updated);
    };

    const handleRemoveProcedure = (id: string) => {
        const updated = procedures.filter(p => p.id !== id);
        setProcedures(updated);
        onProceduresChange?.(updated);
    };

    const total = procedures.reduce((sum, p) => sum + p.price, 0);

    const handleCompleteVisit = async () => {
        if (procedures.length === 0) {
            alert(t('patients.details.procedures.addProcedureReq'));
            return;
        }

        setIsSubmitting(true);
        try {
            await onCompleteVisit(procedures, total);
        } catch (error) {
            console.error("Error completing visit:", error);
        } finally {
            setIsSubmitting(false);
        }
        // setProcedures([]); // Don't clear automatically, let user clear or handle via parent key reset
    };

    return (
        <>
            <Card className="p-6 space-y-4">
                <div className="flex justify-between items-center">
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <Activity className="w-5 h-5" /> {t('patients.details.procedures.todayVisit')}
                    </h3>
                    <Button onClick={() => setIsModalOpen(true)} disabled={isSubmitting} className="px-5 py-2">
                        {t('patients.details.procedures.addProcedure')}
                    </Button>
                </div>

                {/* Procedures List */}
                <div className="space-y-2">
                    {procedures.length === 0 && (
                        <div className="text-center py-8 text-gray-500">
                            {t('patients.details.procedures.clickToAdd')}
                        </div>
                    )}

                    {procedures.map(proc => (
                        <div key={proc.id} className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 flex justify-between items-center">
                            <div className="flex-1">
                                <div className="flex items-center gap-2">
                                    {proc.toothNumber && (
                                        <span className="px-2 py-0.5 bg-primary-100 dark:bg-primary-900 text-primary-800 dark:text-primary-200 text-xs font-bold rounded">
                                            #{proc.toothNumber}
                                        </span>
                                    )}
                                    <span className="font-medium text-gray-900 dark:text-white">
                                        {proc.serviceName}
                                    </span>
                                </div>
                                {proc.notes && (
                                    <p className="text-xs text-gray-500 mt-1">{proc.notes}</p>
                                )}
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="font-bold text-gray-900 dark:text-white">
                                    {proc.price.toLocaleString()} UZS
                                </span>
                                <button
                                    onClick={() => handleRemoveProcedure(proc.id)}
                                    className="text-red-500 hover:text-red-700 p-1"
                                    disabled={isSubmitting}
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Total and Complete Button */}
                {procedures.length > 0 && (
                    <div className="pt-4 border-t border-gray-200 dark:border-gray-700 space-y-3">
                        <div className="flex justify-between items-center">
                            <span className="text-lg font-medium text-gray-700 dark:text-gray-300">
                                {t('patients.details.procedures.total')}
                            </span>
                            <span className="text-2xl font-bold text-primary-600 dark:text-primary-400">
                                {total.toLocaleString()} UZS
                            </span>
                        </div>
                        <Button
                            onClick={handleCompleteVisit}
                            className="w-full"
                            disabled={isSubmitting}
                        >
                            {isSubmitting ? t('patients.details.procedures.saving') : t('patients.details.procedures.completeVisit')}
                        </Button>
                    </div>
                )}
            </Card>

            <AddProcedureModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                services={services}
                categories={categories}
                onAddProcedures={handleAddProcedures}
                onAddProcedure={handleAddProcedure}
            />
        </>
    );
};

interface ProceduresSectionProps {
    transactions: Transaction[];
    doctors: any[];
    onAddProcedure: () => void;
    onViewAll: () => void;
}

export const ProceduresSection: React.FC<ProceduresSectionProps> = ({
    transactions,
    doctors,
    onAddProcedure,
    onViewAll
}) => {
    const { t } = useLanguage();
    
    // Get last 5 procedures
    const recentTransactions = [...transactions]
        .filter(t => t.status === 'Paid' || t.status === 'Pending')
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 5);

    return (
        <Card className="p-6 space-y-4">
            <div className="flex justify-between items-center">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <Activity className="w-5 h-5" /> {t('patients.details.procedures.title')}
                </h3>
                <Button onClick={onAddProcedure} size="sm">
                    {t('patients.details.procedures.addBtn')}
                </Button>
            </div>

            <div className="space-y-3">
                {recentTransactions.length === 0 ? (
                    <p className="text-center py-4 text-gray-500 text-sm">{t('patients.details.procedures.notFound')}</p>
                ) : (
                    recentTransactions.map((tx) => (
                        <div key={tx.id} className="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-100 dark:border-gray-700">
                            <div>
                                <p className="font-medium text-sm text-gray-900 dark:text-white">{tx.service}</p>
                                <p className="text-xs text-gray-500">{tx.date} • {tx.doctorName}</p>
                            </div>
                            <div className="text-right">
                                <p className="font-bold text-sm text-gray-900 dark:text-white">
                                    {tx.amount.toLocaleString()} UZS
                                </p>
                                <Badge status={tx.status} />
                            </div>
                        </div>
                    ))
                )}
            </div>

            {transactions.length > 5 && (
                <button
                    onClick={onViewAll}
                    className="w-full text-center text-sm text-primary-600 dark:text-primary-400 hover:underline pt-2 border-t border-gray-100 dark:border-gray-700"
                >
                    {t('patients.details.procedures.viewAll')}
                </button>
            )}
        </Card>
    );
};
