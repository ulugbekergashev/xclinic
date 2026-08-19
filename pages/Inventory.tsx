import React, { useState } from 'react';
import { Card, Button, Input, Modal } from '../components/Common';
import { InventoryItem } from '../types';
import { Package, Plus, Minus, Trash2, AlertCircle } from 'lucide-react';
import { useLanguage, TranslationKey } from '../context/LanguageContext';

interface InventoryProps {
    items: InventoryItem[];
    userName: string;
    onAddItem: (item: Omit<InventoryItem, 'id' | 'createdAt' | 'updatedAt'> & { initialCost?: number }) => void;
    onUpdateStock: (id: string, data: { change: number; type: 'IN' | 'OUT'; note?: string; userName: string; cost?: number }) => void;
    onDeleteItem: (id: string) => void;
}

export const Inventory: React.FC<InventoryProps> = ({
    items, userName, onAddItem, onUpdateStock, onDeleteItem
}) => {
    const { t } = useLanguage();
    // Add Item Modal State
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [addForm, setAddForm] = useState({ name: '', unit: '', quantity: '0', minQuantity: '10', initialCost: '' });

    // Update Stock Modal State
    const [isStockModalOpen, setIsStockModalOpen] = useState(false);
    const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
    const [stockForm, setStockForm] = useState({ type: 'IN' as 'IN' | 'OUT', change: '', note: '', cost: '' });

    // Delete Confirmation
    const [deleteConfirm, setDeleteConfirm] = useState<InventoryItem | null>(null);

    const handleAddItem = (e: React.FormEvent) => {
        e.preventDefault();
        onAddItem({
            name: addForm.name,
            unit: addForm.unit,
            quantity: Number(addForm.quantity),
            minQuantity: Number(addForm.minQuantity),
            initialCost: addForm.initialCost ? Number(addForm.initialCost) : undefined,
            clinicId: '' // Will be set by parent
        });
        setIsAddModalOpen(false);
        setAddForm({ name: '', unit: '', quantity: '0', minQuantity: '10', initialCost: '' });
    };

    const handleOpenStockModal = (item: InventoryItem, type: 'IN' | 'OUT') => {
        setSelectedItem(item);
        setStockForm({ type, change: '', note: '', cost: '' });
        setIsStockModalOpen(true);
    };

    const handleUpdateStock = (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedItem) return;

        onUpdateStock(selectedItem.id, {
            change: Number(stockForm.change),
            type: stockForm.type,
            note: stockForm.note || undefined,
            userName,
            cost: stockForm.type === 'IN' && stockForm.cost ? Number(stockForm.cost) : undefined
        });
        setIsStockModalOpen(false);
        setStockForm({ type: 'IN', change: '', note: '', cost: '' });
        setSelectedItem(null);
    };

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('inventory.title')}</h1>
                    <p className="text-sm text-gray-500 mt-1">{t('inventory.subtitle')}</p>
                </div>
                <Button size="sm" onClick={() => setIsAddModalOpen(true)}>
                    <Package className="w-4 h-4 mr-2" />
                    {t('inventory.newItem')}
                </Button>
            </div>

            <Card className="p-0 overflow-hidden">
                {items.length === 0 ? (
                    <div className="p-12 text-center">
                        <div className="mx-auto w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-4">
                            <Package className="w-8 h-8 text-gray-400" />
                        </div>
                        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">{t('inventory.empty')}</h3>
                        <p className="text-gray-500 dark:text-gray-400 mb-4">{t('inventory.emptyDesc')}</p>
                        <Button size="sm" onClick={() => setIsAddModalOpen(true)}>
                            {t('inventory.addFirst')}
                        </Button>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                                <tr>
                                    <th className="px-6 py-3 font-medium text-gray-500">{t('inventory.thName')}</th>
                                    <th className="px-6 py-3 font-medium text-gray-500">{t('inventory.thUnit')}</th>
                                    <th className="px-6 py-3 font-medium text-gray-500">{t('inventory.thQuantity')}</th>
                                    <th className="px-6 py-3 font-medium text-gray-500">{t('inventory.thStatus')}</th>
                                    <th className="px-6 py-3 font-medium text-gray-500 text-right">{t('inventory.thActions')}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                {items.map((item) => {
                                    const isLowStock = item.quantity <= item.minQuantity;
                                    return (
                                        <tr key={item.id} className="bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                                            <td className="px-6 py-4 font-medium text-gray-900 dark:text-white">{item.name}</td>
                                            <td className="px-6 py-4 text-gray-500 dark:text-gray-400">{item.unit}</td>
                                            <td className="px-6 py-4">
                                                <span className={`font-semibold ${isLowStock ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white'}`}>
                                                    {item.quantity}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4">
                                                {isLowStock ? (
                                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
                                                        <AlertCircle className="w-3 h-3 mr-1" />
                                                        {t('inventory.statusLow')}
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                                                        {t('inventory.statusEnough')}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center justify-end gap-2">
                                                    <button
                                                        onClick={() => handleOpenStockModal(item, 'IN')}
                                                        className="p-2 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-md transition-colors"
                                                        title={t('inventory.addStockTitle')}
                                                    >
                                                        <Plus className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        onClick={() => handleOpenStockModal(item, 'OUT')}
                                                        className="p-2 text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded-md transition-colors"
                                                        title={t('inventory.outStockTitle')}
                                                    >
                                                        <Minus className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        onClick={() => setDeleteConfirm(item)}
                                                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors"
                                                        title={t('common.delete')}
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </Card>

            {/* Add Item Modal */}
            <Modal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} title={t('inventory.addTitle')}>
                <form onSubmit={handleAddItem} className="space-y-4">
                    <Input
                        label={t('inventory.itemName')}
                        value={addForm.name}
                        onChange={e => setAddForm({ ...addForm, name: e.target.value })}
                        placeholder={t('inventory.itemNamePlaceholder')}
                        required
                    />
                    <Input
                        label={t('inventory.unit')}
                        value={addForm.unit}
                        onChange={e => setAddForm({ ...addForm, unit: e.target.value })}
                        placeholder={t('inventory.unitPlaceholder')}
                        required
                    />
                    <Input
                        label={t('inventory.initialQty')}
                        type="number"
                        value={addForm.quantity}
                        onChange={e => setAddForm({ ...addForm, quantity: e.target.value })}
                        min="0"
                        required
                    />
                    <Input
                        label={t('inventory.minQty')}
                        type="number"
                        value={addForm.minQuantity}
                        onChange={e => setAddForm({ ...addForm, minQuantity: e.target.value })}
                        min="0"
                        required
                        helperText={t('inventory.minQtyHelp')}
                    />
                    <Input
                        label="Umumiy narxi (ixtiyoriy)"
                        type="number"
                        value={addForm.initialCost}
                        onChange={e => setAddForm({ ...addForm, initialCost: e.target.value })}
                        min="0"
                        placeholder="Masalan: 500000"
                        helperText="Kiritilsa, Moliya bo'limida 'Ombor' kategoriyali xarajat sifatida yoziladi"
                    />
                    <div className="flex justify-end gap-2 pt-4">
                        <Button type="button" variant="secondary" onClick={() => setIsAddModalOpen(false)}>
                            {t('common.cancel')}
                        </Button>
                        <Button type="submit">{t('common.add')}</Button>
                    </div>
                </form>
            </Modal>

            {/* Update Stock Modal */}
            <Modal isOpen={isStockModalOpen} onClose={() => setIsStockModalOpen(false)} title={stockForm.type === 'IN' ? t('inventory.addStockTitle') : t('inventory.outStockTitle')}>
                <form onSubmit={handleUpdateStock} className="space-y-4">
                    {selectedItem && (
                        <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
                            <p className="text-sm text-gray-500 dark:text-gray-400">{t('inventory.thName')}</p>
                            <p className="font-medium text-gray-900 dark:text-white">{selectedItem.name}</p>
                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">{t('inventory.currentQty')}</p>
                            <p className="text-lg font-semibold text-gray-900 dark:text-white">{selectedItem.quantity} {selectedItem.unit}</p>
                        </div>
                    )}
                    <Input
                        label={stockForm.type === 'IN' ? t('inventory.qtyToAdd') : t('inventory.qtyToRemove')}
                        type="number"
                        value={stockForm.change}
                        onChange={e => setStockForm({ ...stockForm, change: e.target.value })}
                        min="0"
                        step="0.01"
                        required
                    />
                    {stockForm.type === 'IN' && (
                        <Input
                            label="Xarajat (agar mavjud bo'lsa)"
                            type="number"
                            value={stockForm.cost}
                            onChange={e => setStockForm({ ...stockForm, cost: e.target.value })}
                            min="0"
                            placeholder="Masalan: 500000"
                            helperText="Omborga kiritish uchun ketgan mablag' (moliyaviy hisobotda ko'rinadi)"
                        />
                    )}
                    <Input
                        label={t('inventory.note')}
                        value={stockForm.note}
                        onChange={e => setStockForm({ ...stockForm, note: e.target.value })}
                        placeholder={stockForm.type === 'IN' ? t('inventory.noteInPlaceholder') : t('inventory.noteOutPlaceholder')}
                    />
                    <div className="flex justify-end gap-2 pt-4">
                        <Button type="button" variant="secondary" onClick={() => setIsStockModalOpen(false)}>
                            {t('common.cancel')}
                        </Button>
                        <Button type="submit">{stockForm.type === 'IN' ? t('common.add') : t('inventory.qtyToRemove')}</Button>
                    </div>
                </form>
            </Modal>

            {/* Delete Confirmation Modal */}
            <Modal isOpen={!!deleteConfirm} onClose={() => setDeleteConfirm(null)} title={t('inventory.deleteTitle')}>
                <div className="text-center space-y-4">
                    <div className="mx-auto w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
                        <Trash2 className="w-6 h-6 text-red-600 dark:text-red-400" />
                    </div>
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white">{t('common.confirm')}</h3>
                    <p className="text-gray-600 dark:text-gray-300" dangerouslySetInnerHTML={{ 
                        __html: t('inventory.deleteConfirm').replace('{name}', deleteConfirm?.name || '') 
                    }} />
                    <div className="flex justify-center gap-3 pt-4">
                        <Button variant="secondary" onClick={() => setDeleteConfirm(null)}>
                            {t('common.cancel')}
                        </Button>
                        <Button
                            className="bg-red-600 hover:bg-red-700 text-white border-none"
                            onClick={() => {
                                if (deleteConfirm) {
                                    onDeleteItem(deleteConfirm.id);
                                    setDeleteConfirm(null);
                                }
                            }}
                        >
                            {t('common.yesDelete')}
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};
