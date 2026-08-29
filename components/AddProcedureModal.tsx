import React, { useState, useMemo } from 'react';
import { formatNumber } from '../utils/format';
import { toast } from '../services/toast';
import { Plus, Trash2 } from 'lucide-react';
import { Modal, Button, Select, Input } from './Common';
import { Service, ServiceCategory, Department } from '../types';
import { useLanguage } from '../context/LanguageContext';

/* ─────────────────────────────────────────────────────────────────────────────
   Xizmat qo'shish.

   denta7 da bu oynaning yarmini tish sxemasi egallardi: avval tish tanlanardi,
   keyin muolaja. Ko'p profilli klinikada tish tushunchasi yo'q — endi avval
   bo'lim, keyin xizmat tanlanadi.
   ───────────────────────────────────────────────────────────────────────────── */

interface ProcedureItem {
    serviceId: number;
    serviceName: string;
    departmentId?: string;
    price: number;
    notes?: string;
}

interface AddProcedureModalProps {
    isOpen: boolean;
    onClose: () => void;
    services?: Service[];
    categories?: ServiceCategory[];
    departments?: Department[];
    onAddProcedure: (procedure: ProcedureItem) => void;
    onAddProcedures?: (procedures: ProcedureItem[]) => void;
}

/* Raqam formati BITTA joydan — `utils/format.ts`. Ilgari bu yerda
   `Intl.NumberFormat('uz-UZ')` turardi: Chrome da `uz` lokali to'liq
   emas va u vergul qo'yadi («160,000»), Moliya bo'limi esa bo'shliq
   qo'yardi («160 000») — bitta ilovada ikki xil ko'rinish. */
const fmt = (n: number) => formatNumber(n);

export const AddProcedureModal: React.FC<AddProcedureModalProps> = ({
    isOpen, onClose, services = [], categories = [], departments = [],
    onAddProcedure, onAddProcedures,
}) => {
    const { t } = useLanguage();

    const [queue, setQueue] = useState<ProcedureItem[]>([]);
    const [departmentId, setDepartmentId] = useState<string>('');
    const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
    const [selectedServiceId, setSelectedServiceId] = useState<number | null>(null);
    const [price, setPrice] = useState<string>('');
    const [notes, setNotes] = useState<string>('');

    // Bo'lim tanlansa — faqat o'sha bo'lim xizmatlari. Bo'limi ko'rsatilmagan
    // xizmatlar har doim ko'rinadi (eski ma'lumot yo'qolmasligi uchun).
    const visibleServices = useMemo(() => services.filter(s =>
        (!departmentId || !s.departmentId || s.departmentId === departmentId) &&
        (!selectedCategoryId || s.categoryId === selectedCategoryId)
    ), [services, departmentId, selectedCategoryId]);

    const visibleCategories = useMemo(() => {
        if (!departmentId) return categories;
        const ids = new Set(services.filter(s => s.departmentId === departmentId).map(s => s.categoryId).filter(Boolean));
        return categories.filter(c => ids.size === 0 || ids.has(c.id));
    }, [categories, services, departmentId]);

    const total = useMemo(() => queue.reduce((s, q) => s + q.price, 0), [queue]);

    const handleServiceChange = (serviceId: number) => {
        setSelectedServiceId(serviceId);
        const service = services.find(s => s.id === serviceId);
        if (service) setPrice(String(service.price));
    };

    const addToQueue = () => {
        if (!selectedServiceId) {
            toast.error(t('patients.details.alerts.selectServiceReq'));
            return;
        }
        const service = services.find(s => s.id === selectedServiceId);
        /* `Service.id` turda IXTIYORIY (katalogdan kelmagan, qo'lda
           tuzilgan xizmat bo'lishi mumkin). Idsiz xizmat kassaga
           bog'lanmaydi va hisobotda ko'rinmaydi, shuning uchun uni
           navbatga qo'shmaymiz. */
        if (!service || service.id === undefined) return;

        setQueue([...queue, {
            serviceId: service.id,
            serviceName: service.name,
            departmentId: service.departmentId || departmentId || undefined,
            price: parseFloat(price) || 0,
            notes: notes || undefined,
        }]);

        // Bo'lim tanlangicha qoladi — ketma-ket kiritish tez bo'lsin
        setSelectedServiceId(null);
        setPrice('');
        setNotes('');
    };

    const removeFromQueue = (index: number) => {
        const next = [...queue];
        next.splice(index, 1);
        setQueue(next);
    };

    const handleSaveAll = () => {
        if (queue.length === 0) {
            toast.error(t('patients.details.alerts.listEmpty'));
            return;
        }
        if (onAddProcedures) onAddProcedures(queue);
        else queue.forEach(p => onAddProcedure(p));
        handleClose();
    };

    const handleClose = () => {
        setQueue([]);
        setDepartmentId('');
        setSelectedCategoryId('');
        setSelectedServiceId(null);
        setPrice('');
        setNotes('');
        onClose();
    };

    if (!isOpen) return null;

    const deptName = (id?: string) => departments.find(d => d.id === id)?.name;

    return (
        <Modal isOpen={isOpen} onClose={handleClose} title={t('patients.details.modals.addProcedureTitle')} className="max-w-3xl">
            <div className="space-y-5">
                {/* Tanlash */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Select
                        label="Bo'lim"
                        value={departmentId}
                        onChange={e => { setDepartmentId(e.target.value); setSelectedCategoryId(''); setSelectedServiceId(null); }}
                    >
                        <option value="">Barcha bo'limlar</option>
                        {departments.filter(d => d.isActive).map(d => (
                            <option key={d.id} value={d.id}>{d.name}</option>
                        ))}
                    </Select>

                    <Select
                        label="Kategoriya"
                        value={selectedCategoryId}
                        onChange={e => { setSelectedCategoryId(e.target.value); setSelectedServiceId(null); }}
                    >
                        <option value="">Barchasi</option>
                        {visibleCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </Select>

                    <Select
                        label="Xizmat"
                        value={selectedServiceId ?? ''}
                        onChange={e => handleServiceChange(Number(e.target.value))}
                    >
                        <option value="">Tanlang...</option>
                        {visibleServices.map(s => (
                            <option key={s.id} value={s.id}>{s.name} — {fmt(s.price)}</option>
                        ))}
                    </Select>

                    <Input
                        label="Narx"
                        type="number"
                        value={price}
                        onChange={e => setPrice(e.target.value)}
                        placeholder="0"
                    />

                    <div className="sm:col-span-2">
                        <Input
                            label="Izoh"
                            value={notes}
                            onChange={e => setNotes(e.target.value)}
                            placeholder="Ixtiyoriy"
                        />
                    </div>
                </div>

                <Button onClick={addToQueue} variant="secondary" className="w-full">
                    <Plus className="w-4 h-4 mr-2" /> Ro'yxatga qo'shish
                </Button>

                {/* Ro'yxat */}
                <div>
                    <h4 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                        Qo'shiladigan xizmatlar ({queue.length})
                    </h4>

                    {queue.length === 0 ? (
                        <div className="text-center py-8 border border-dashed border-gray-300 dark:border-gray-600 rounded-lg">
                            <p className="text-sm text-gray-400 dark:text-gray-500">Ro'yxat bo'sh</p>
                        </div>
                    ) : (
                        <div className="border border-gray-200 dark:border-gray-700 rounded-lg divide-y divide-gray-200 dark:divide-gray-700 max-h-64 overflow-y-auto">
                            {queue.map((item, i) => (
                                <div key={i} className="flex items-center gap-3 p-3">
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{item.serviceName}</p>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">
                                            {deptName(item.departmentId) || 'Bo\'limsiz'}
                                            {item.notes ? ` · ${item.notes}` : ''}
                                        </p>
                                    </div>
                                    <span className="text-sm tabular-nums text-gray-700 dark:text-gray-300">{fmt(item.price)}</span>
                                    <button onClick={() => removeFromQueue(i)}
                                        className="p-1.5 text-gray-400 hover:text-red-500 rounded" title="Olib tashlash">
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Yakun */}
                <div className="flex items-center gap-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                    <div className="mr-auto">
                        <span className="text-sm text-gray-500 dark:text-gray-400">Jami: </span>
                        <span className="font-semibold text-gray-900 dark:text-white tabular-nums">{fmt(total)} so'm</span>
                    </div>
                    <Button variant="secondary" onClick={handleClose}>Bekor qilish</Button>
                    <Button onClick={handleSaveAll} disabled={queue.length === 0}>Saqlash</Button>
                </div>
            </div>
        </Modal>
    );
};
