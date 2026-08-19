import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, Button, Input, Modal, Select } from '../components/Common';
import { InventoryItem, UserRole } from '../types';
import {
    Package, Plus, Trash2, AlertCircle, ArrowDownToLine, ArrowUpFromLine,
    History, ClipboardCheck, CalendarClock, RefreshCw, AlertTriangle,
} from 'lucide-react';
import { api } from '../services/api';
import { todayISO } from '../utils/dateUtils';

/* ─────────────────────────────────────────────────────────────────────────────
   Ombor.

   MUHIM O'ZGARISH. Ilgari bu ekran `PUT /api/inventory/:id/stock` orqali
   qoldiqni TO'G'RIDAN-TO'G'RI qayta yozardi. Bu modulning asosiy qoidasini
   buzardi (backend/inventory.ts boshidagi izoh): qoldiq hech qachon qo'lda
   yozilmaydi, u harakatlar yig'indisi. Qo'lda yozish mumkin bo'lsa, "kim oldi,
   qachon yo'qoldi" degan savolga javob yo'q va ombor raqamlari isbotlanmaydi.

   Endi hamma o'zgarish `StockMovement` orqali: kirim partiya bilan, chiqim
   FEFO bo'yicha, farq inventarizatsiya bilan. Eski endpoint o'z joyida qoldi
   (ishlayotgan narsani buzmaymiz), lekin interfeys undan foydalanmaydi.

   To'rt bo'lim to'rt savolga javob beradi:
     Qoldiqlar      — nima bor
     Harakatlar     — qayerga ketdi
     Partiya/muddat — nima muddati o'tgan
     Inventarizatsiya — hisob va haqiqat farqi
   ───────────────────────────────────────────────────────────────────────────── */

type Tab = 'stock' | 'movements' | 'batches' | 'audit';

interface InventoryProps {
    items: InventoryItem[];
    userName: string;
    userRole?: UserRole;
    onAddItem: (item: Omit<InventoryItem, 'id' | 'createdAt' | 'updatedAt'> & { initialCost?: number }) => void;
    onDeleteItem: (id: string) => void;
    /** Ro'yxatni qayta yuklash — harakat qoldiqni o'zgartirgandan keyin kerak */
    onRefreshItems?: () => void;
}

const fmt = (n: number) => new Intl.NumberFormat('uz-UZ').format(Math.round((n ?? 0) * 1000) / 1000);
const fmtWhen = (iso: string) => {
    try { return new Date(iso).toLocaleString('uz-UZ'); } catch { return iso; }
};

const MOVEMENT_LABEL: Record<string, string> = {
    In: 'Kirim', Out: 'Chiqim', Adjust: 'Tuzatish', Writeoff: 'Hisobdan chiqarish',
};
const REASON_LABEL: Record<string, string> = {
    Purchase: 'Xarid', Service: 'Xizmat', Expired: 'Muddati o\'tgan',
    Damaged: 'Buzilgan', Inventory: 'Inventarizatsiya', Manual: 'Qo\'lda',
};
/** Qo'lda chiqim sabablari — "Xizmat" yo'q, u avtomatik retsept orqali yoziladi */
const OUT_REASONS = ['Expired', 'Damaged', 'Manual'];

export const Inventory: React.FC<InventoryProps> = ({
    items, userName, userRole, onAddItem, onDeleteItem, onRefreshItems,
}) => {
    const [tab, setTab] = useState<Tab>('stock');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    const readOnly = userRole === UserRole.DOCTOR || userRole === UserRole.LAB_TECHNICIAN;

    // ─── Qo'shish ───────────────────────────────────────────────────────────
    const [addOpen, setAddOpen] = useState(false);
    const [addForm, setAddForm] = useState({ name: '', unit: '', minQuantity: '10', price: '', isMedication: false });

    // ─── Kirim / chiqim ─────────────────────────────────────────────────────
    const [inTarget, setInTarget] = useState<InventoryItem | null>(null);
    const [inForm, setInForm] = useState({ quantity: '', cost: '', batchNumber: '', expiryDate: '', note: '' });
    const [outTarget, setOutTarget] = useState<InventoryItem | null>(null);
    const [outForm, setOutForm] = useState({ quantity: '', reason: 'Manual', note: '' });
    /** Chiqim tasdiqlashdan OLDIN qaysi partiyalardan yechilishini ko'rsatamiz */
    const [outPreview, setOutPreview] = useState<{ batch: string; expiry: string | null; take: number }[]>([]);

    // ─── Harakatlar ─────────────────────────────────────────────────────────
    const [movements, setMovements] = useState<any[]>([]);
    const [movFilter, setMovFilter] = useState({ itemId: '', from: '', to: '' });
    const [movLoading, setMovLoading] = useState(false);

    // ─── Partiya va muddat ─────────────────────────────────────────────────
    const [alerts, setAlerts] = useState<{ expiring: any[]; lowStock: any[] } | null>(null);
    const [alertsLoading, setAlertsLoading] = useState(false);

    // ─── Inventarizatsiya ──────────────────────────────────────────────────
    const [auditValues, setAuditValues] = useState<Record<string, string>>({});
    const [auditConfirm, setAuditConfirm] = useState(false);

    // ─── Tarix (bitta mahsulot) ────────────────────────────────────────────
    const [historyItem, setHistoryItem] = useState<InventoryItem | null>(null);
    const [historyRows, setHistoryRows] = useState<any[]>([]);

    const reloadItems = useCallback(() => { onRefreshItems?.(); }, [onRefreshItems]);

    const loadMovements = useCallback(async () => {
        setMovLoading(true);
        try {
            setMovements(await api.stock.movements({
                itemId: movFilter.itemId || undefined,
                from: movFilter.from || undefined,
                to: movFilter.to || undefined,
            }));
            setError('');
        } catch (e: any) {
            setError(e?.message || 'Harakatlarni yuklab bo\'lmadi');
        } finally { setMovLoading(false); }
    }, [movFilter]);

    const loadAlerts = useCallback(async () => {
        setAlertsLoading(true);
        try {
            setAlerts(await api.stock.alerts(60));
            setError('');
        } catch (e: any) {
            setError(e?.message || 'Ogohlantirishlarni yuklab bo\'lmadi');
        } finally { setAlertsLoading(false); }
    }, []);

    useEffect(() => { if (tab === 'movements') loadMovements(); }, [tab, loadMovements]);
    useEffect(() => { if (tab === 'batches') loadAlerts(); }, [tab, loadAlerts]);

    // ─── Amallar ────────────────────────────────────────────────────────────

    const openIn = (item: InventoryItem) => {
        setInForm({ quantity: '', cost: String(item.price || ''), batchNumber: '', expiryDate: '', note: '' });
        setInTarget(item);
    };

    const submitIn = async () => {
        if (!inTarget) return;
        const qty = Number(inForm.quantity);
        if (!(qty > 0)) return;
        // Dori bo'lsa muddat majburiy: aks holda FEFO ishlamaydi va muddati
        // o'tgan qoldiq omborda ko'rinmay yig'iladi
        if (inTarget.isMedication && !inForm.expiryDate) {
            setError('Dori uchun yaroqlilik muddati majburiy');
            return;
        }
        setBusy(true); setError('');
        try {
            await api.stock.receive({
                itemId: inTarget.id, quantity: qty,
                cost: inForm.cost ? Number(inForm.cost) : undefined,
                batchNumber: inForm.batchNumber || undefined,
                expiryDate: inForm.expiryDate || undefined,
                note: inForm.note || undefined,
                userName,
            });
            setInTarget(null);
            reloadItems();
            if (tab === 'movements') loadMovements();
            if (tab === 'batches') loadAlerts();
        } catch (e: any) {
            setError(e?.message || 'Kirim yozilmadi');
        } finally { setBusy(false); }
    };

    const openOut = async (item: InventoryItem) => {
        setOutForm({ quantity: '', reason: 'Manual', note: '' });
        setOutPreview([]);
        setOutTarget(item);
    };

    /** FEFO ko'rinishi: chiqim qaysi partiyalardan bo'lishini oldindan ko'rsatadi */
    const previewOut = useCallback(async (item: InventoryItem, qty: number) => {
        if (!(qty > 0)) { setOutPreview([]); return; }
        try {
            const batches = await api.batches.getAll(item.id);
            const sorted = [...batches]
                .filter((b: any) => (b.quantity ?? 0) > 0)
                .sort((a: any, b: any) => {
                    if (!a.expiryDate && !b.expiryDate) return 0;
                    if (!a.expiryDate) return 1;
                    if (!b.expiryDate) return -1;
                    return String(a.expiryDate).localeCompare(String(b.expiryDate));
                });
            let left = qty;
            const plan: { batch: string; expiry: string | null; take: number }[] = [];
            for (const b of sorted) {
                if (left <= 0) break;
                const take = Math.min(left, b.quantity);
                plan.push({ batch: b.batchNumber || 'partiya raqamsiz', expiry: b.expiryDate || null, take });
                left -= take;
            }
            if (left > 0) plan.push({ batch: 'partiyasiz (qoldiq yetmadi)', expiry: null, take: left });
            setOutPreview(plan);
        } catch { setOutPreview([]); }
    }, []);

    const submitOut = async () => {
        if (!outTarget) return;
        const qty = Number(outForm.quantity);
        if (!(qty > 0)) return;
        setBusy(true); setError('');
        try {
            await api.stock.issue({
                itemId: outTarget.id, quantity: qty,
                reason: outForm.reason, note: outForm.note || undefined, userName,
            });
            setOutTarget(null);
            reloadItems();
            if (tab === 'movements') loadMovements();
            if (tab === 'batches') loadAlerts();
        } catch (e: any) {
            setError(e?.message || 'Chiqim yozilmadi');
        } finally { setBusy(false); }
    };

    const openHistory = async (item: InventoryItem) => {
        setHistoryItem(item);
        setHistoryRows([]);
        try {
            setHistoryRows(await api.stock.movements({ itemId: item.id }));
        } catch (e: any) {
            setError(e?.message || 'Tarixni yuklab bo\'lmadi');
        }
    };

    // Inventarizatsiya: faqat kiritilgan va farqi bor qatorlar
    const auditRows = useMemo(() => items.map((it) => {
        const raw = auditValues[it.id];
        const actual = raw === undefined || raw === '' ? null : Number(raw);
        const diff = actual == null || isNaN(actual) ? null : Math.round((actual - (it.quantity || 0)) * 1000) / 1000;
        return { item: it, actual, diff };
    }), [items, auditValues]);

    const auditChanged = auditRows.filter((r) => r.diff !== null && r.diff !== 0);

    const submitAudit = async () => {
        setBusy(true); setError('');
        try {
            for (const r of auditChanged) {
                await api.stock.adjust({
                    itemId: r.item.id, actualQuantity: r.actual as number,
                    note: `Inventarizatsiya ${todayISO()}`, userName,
                });
            }
            setAuditValues({});
            setAuditConfirm(false);
            reloadItems();
        } catch (e: any) {
            setError(e?.message || 'Inventarizatsiya yozilmadi');
        } finally { setBusy(false); }
    };

    const handleAdd = (e: React.FormEvent) => {
        e.preventDefault();
        onAddItem({
            name: addForm.name, unit: addForm.unit,
            quantity: 0,                       // qoldiq faqat kirim orqali paydo bo'ladi
            minQuantity: Number(addForm.minQuantity) || 0,
            price: addForm.price ? Number(addForm.price) : 0,
            isMedication: addForm.isMedication,
            clinicId: '',                      // serverda tokendan qo'yiladi
        } as any);
        setAddForm({ name: '', unit: '', minQuantity: '10', price: '', isMedication: false });
        setAddOpen(false);
    };

    const lowStock = items.filter((i) => (i.minQuantity || 0) > 0 && (i.quantity || 0) <= (i.minQuantity || 0));

    const TABS: { id: Tab; name: string; icon: React.ElementType }[] = [
        { id: 'stock', name: 'Qoldiqlar', icon: Package },
        { id: 'movements', name: 'Harakatlar', icon: History },
        { id: 'batches', name: 'Partiya va muddat', icon: CalendarClock },
        { id: 'audit', name: 'Inventarizatsiya', icon: ClipboardCheck },
    ];

    return (
        <div className="space-y-5 animate-fade-in">
            {/* Sarlavha */}
            <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 mr-auto">
                    <Package className="w-6 h-6 text-primary-600 dark:text-primary-400" />
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">Ombor</h2>
                </div>
                {!readOnly && (
                    <Button size="sm" onClick={() => setAddOpen(true)}>
                        <Plus className="w-4 h-4 mr-1.5" /> Mahsulot qo'shish
                    </Button>
                )}
            </div>

            {/* Bo'limlar — tor ekranda gorizontal siljiydi */}
            <div className="flex gap-1 overflow-x-auto pb-1 border-b border-gray-200 dark:border-gray-700">
                {TABS.map((tb) => (
                    <button key={tb.id} onClick={() => setTab(tb.id)}
                        className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap rounded-t-lg transition-colors
                            ${tab === tb.id
                                ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300 border-b-2 border-primary-500'
                                : 'text-gray-600 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800'}`}>
                        <tb.icon className="w-4 h-4" />
                        {tb.name}
                    </button>
                ))}
            </div>

            {error && (
                <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                    <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                    <p className="text-sm text-red-700 dark:text-red-300 flex-1">{error}</p>
                    <button onClick={() => setError('')} className="text-red-400 hover:text-red-600 text-sm">yopish</button>
                </div>
            )}

            {/* ═══ QOLDIQLAR ═══════════════════════════════════════════════ */}
            {tab === 'stock' && (
                <Card className="p-0 overflow-hidden">
                    {lowStock.length > 0 && (
                        <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800 flex items-center gap-2">
                            <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                            <p className="text-sm text-amber-800 dark:text-amber-200">
                                {lowStock.length} ta mahsulot minimal qoldiqdan tushgan
                            </p>
                        </div>
                    )}

                    {items.length === 0 ? (
                        <div className="text-center py-12">
                            <Package className="w-10 h-10 mx-auto text-gray-300 dark:text-gray-600 mb-2" />
                            <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">Ombor bo'sh</p>
                            {!readOnly && <Button size="sm" onClick={() => setAddOpen(true)}>Mahsulot qo'shish</Button>}
                        </div>
                    ) : (
                        <div className="divide-y divide-gray-200 dark:divide-gray-700">
                            {items.map((it) => {
                                const low = (it.minQuantity || 0) > 0 && (it.quantity || 0) <= (it.minQuantity || 0);
                                return (
                                    <div key={it.id} className="p-3 flex flex-col sm:flex-row sm:items-center gap-3">
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{it.name}</p>
                                                {it.isMedication && (
                                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300">
                                                        dori
                                                    </span>
                                                )}
                                                {low && (
                                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                                                        kam qoldi
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                                minimal {fmt(it.minQuantity || 0)} {it.unit}
                                                {it.price ? ` · tannarx ${fmt(it.price)}` : ''}
                                            </p>
                                        </div>
                                        <div className="text-right shrink-0 min-w-[90px]">
                                            <p className={`text-lg font-bold tabular-nums ${low ? 'text-amber-600 dark:text-amber-400' : 'text-gray-900 dark:text-white'}`}>
                                                {fmt(it.quantity || 0)}
                                            </p>
                                            <p className="text-xs text-gray-400">{it.unit}</p>
                                        </div>
                                        <div className="flex items-center gap-1.5 shrink-0">
                                            {!readOnly && (
                                                <>
                                                    <Button variant="secondary" size="sm" onClick={() => openIn(it)} title="Kirim">
                                                        <ArrowDownToLine className="w-4 h-4" />
                                                    </Button>
                                                    <Button variant="secondary" size="sm" onClick={() => openOut(it)} title="Chiqim">
                                                        <ArrowUpFromLine className="w-4 h-4" />
                                                    </Button>
                                                </>
                                            )}
                                            <Button variant="secondary" size="sm" onClick={() => openHistory(it)} title="Tarix">
                                                <History className="w-4 h-4" />
                                            </Button>
                                            {!readOnly && (
                                                <Button variant="secondary" size="sm" onClick={() => onDeleteItem(it.id)} title="O'chirish">
                                                    <Trash2 className="w-4 h-4 text-red-500" />
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </Card>
            )}

            {/* ═══ HARAKATLAR ══════════════════════════════════════════════ */}
            {tab === 'movements' && (
                <Card className="p-4">
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-4">
                        <Select value={movFilter.itemId} onChange={(e: any) => setMovFilter(f => ({ ...f, itemId: e.target.value }))}>
                            <option value="">Barcha mahsulotlar</option>
                            {items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                        </Select>
                        <Input type="date" value={movFilter.from} onChange={(e: any) => setMovFilter(f => ({ ...f, from: e.target.value }))} />
                        <Input type="date" value={movFilter.to} onChange={(e: any) => setMovFilter(f => ({ ...f, to: e.target.value }))} />
                        <Button variant="secondary" onClick={loadMovements} disabled={movLoading}>
                            <RefreshCw className="w-4 h-4 mr-1.5" /> Ko'rsatish
                        </Button>
                    </div>

                    {movLoading && movements.length === 0 ? (
                        <div className="space-y-2">
                            {[0, 1, 2, 3].map((i) => <div key={i} className="h-12 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />)}
                        </div>
                    ) : movements.length === 0 ? (
                        <div className="text-center py-10">
                            <History className="w-8 h-8 mx-auto text-gray-300 dark:text-gray-600 mb-2" />
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                Tanlangan shart bo'yicha harakat yo'q
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-1.5">
                            {movements.map((m) => (
                                <div key={m.id} className="flex items-center gap-3 p-2.5 border border-gray-200 dark:border-gray-700 rounded-lg">
                                    <span className={`w-16 text-sm font-bold tabular-nums shrink-0 ${m.quantity >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                                        {m.quantity >= 0 ? '+' : ''}{fmt(m.quantity)}
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm text-gray-900 dark:text-white truncate">
                                            {m.item?.name || '—'} <span className="text-gray-400">{m.item?.unit || ''}</span>
                                        </p>
                                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                            {MOVEMENT_LABEL[m.type] || m.type} · {REASON_LABEL[m.reason] || m.reason}
                                            {m.batch?.batchNumber ? ` · partiya ${m.batch.batchNumber}` : ''}
                                            {m.userName ? ` · ${m.userName}` : ''}
                                            {m.note ? ` · ${m.note}` : ''}
                                        </p>
                                    </div>
                                    <span className="text-xs text-gray-400 shrink-0 hidden sm:block">{fmtWhen(m.createdAt)}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </Card>
            )}

            {/* ═══ PARTIYA VA MUDDAT ═══════════════════════════════════════ */}
            {tab === 'batches' && (
                <Card className="p-4">
                    {alertsLoading && !alerts ? (
                        <div className="space-y-2">
                            {[0, 1, 2].map((i) => <div key={i} className="h-12 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />)}
                        </div>
                    ) : !alerts || (alerts.expiring.length === 0 && alerts.lowStock.length === 0) ? (
                        <div className="text-center py-10">
                            <CalendarClock className="w-8 h-8 mx-auto text-gray-300 dark:text-gray-600 mb-2" />
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                Muddati yaqinlashgan partiya ham, kam qoldiq ham yo'q
                            </p>
                            <p className="text-xs text-gray-400 mt-1">
                                Partiyalar kirim paytida yaroqlilik muddati ko'rsatilganda paydo bo'ladi
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-5">
                            {alerts.expiring.length > 0 && (
                                <div>
                                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
                                        Muddati o'tgan va yaqinlashgan ({alerts.expiring.length})
                                    </h3>
                                    <div className="space-y-1.5">
                                        {alerts.expiring.map((b: any) => (
                                            <div key={b.id}
                                                className={`flex items-center gap-3 p-2.5 rounded-lg border
                                                    ${b.expired
                                                        ? 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20'
                                                        : 'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20'}`}>
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                                        {b.item?.name || '—'}
                                                    </p>
                                                    <p className="text-xs text-gray-600 dark:text-gray-300">
                                                        {b.batchNumber ? `partiya ${b.batchNumber} · ` : ''}
                                                        muddat {b.expiryDate}
                                                        {b.expired ? ' · MUDDATI O\'TGAN' : ''}
                                                    </p>
                                                </div>
                                                <span className="text-sm font-bold tabular-nums shrink-0">
                                                    {fmt(b.quantity)} {b.item?.unit || ''}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {alerts.lowStock.length > 0 && (
                                <div>
                                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
                                        Minimal qoldiqdan tushgan ({alerts.lowStock.length})
                                    </h3>
                                    <div className="space-y-1.5">
                                        {alerts.lowStock.map((r: any) => (
                                            <div key={r.id} className="flex items-center gap-3 p-2.5 border border-gray-200 dark:border-gray-700 rounded-lg">
                                                <p className="text-sm text-gray-900 dark:text-white flex-1 truncate">{r.name}</p>
                                                <span className="text-sm tabular-nums text-amber-600 dark:text-amber-400">
                                                    {fmt(r.quantity)} / {fmt(r.minQuantity)} {r.unit}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </Card>
            )}

            {/* ═══ INVENTARIZATSIYA ════════════════════════════════════════ */}
            {tab === 'audit' && (
                <Card className="p-4">
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                        Har mahsulot uchun HAQIQIY qoldiqni kiriting. Farq pastda ko'rinadi.
                        Inventarizatsiya BUTUNLIGICHA o'tkaziladi — bittalab saqlash yo'q,
                        aks holda yarmi yopilmagan holda qolib ketadi.
                    </p>

                    {items.length === 0 ? (
                        <p className="text-sm text-gray-400 py-8 text-center">Ombor bo'sh</p>
                    ) : (
                        <>
                            <div className="space-y-1.5 mb-4">
                                {auditRows.map(({ item, diff }) => (
                                    <div key={item.id} className="flex flex-col sm:flex-row sm:items-center gap-2 p-2.5 border border-gray-200 dark:border-gray-700 rounded-lg">
                                        <p className="text-sm text-gray-900 dark:text-white flex-1 min-w-0 truncate">{item.name}</p>
                                        <span className="text-xs text-gray-400 shrink-0 w-28">
                                            hisobda {fmt(item.quantity || 0)} {item.unit}
                                        </span>
                                        <Input type="number" step="any"
                                            value={auditValues[item.id] ?? ''}
                                            onChange={(e: any) => setAuditValues(v => ({ ...v, [item.id]: e.target.value }))}
                                            placeholder="haqiqiy"
                                            containerClassName="w-full sm:w-28"
                                            disabled={readOnly} />
                                        <span className={`text-sm font-bold tabular-nums shrink-0 w-24 text-right
                                            ${diff === null ? 'text-gray-300' : diff === 0 ? 'text-gray-400' : diff > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                            {diff === null ? '—' : diff === 0 ? 'to\'g\'ri' : `${diff > 0 ? '+' : ''}${fmt(diff)}`}
                                        </span>
                                    </div>
                                ))}
                            </div>

                            <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                                <p className="text-sm text-gray-600 dark:text-gray-300 flex-1">
                                    Farqi bor qatorlar: <b>{auditChanged.length}</b>
                                </p>
                                <Button variant="secondary" onClick={() => setAuditValues({})} disabled={busy}>
                                    Tozalash
                                </Button>
                                <Button onClick={() => setAuditConfirm(true)} disabled={busy || readOnly || auditChanged.length === 0}>
                                    Inventarizatsiyani o'tkazish
                                </Button>
                            </div>
                        </>
                    )}
                </Card>
            )}

            {/* ─── Mahsulot qo'shish ──────────────────────────────────────── */}
            <Modal isOpen={addOpen} onClose={() => setAddOpen(false)} title="Yangi mahsulot">
                <form onSubmit={handleAdd} className="space-y-4">
                    <Input label="Nomi" value={addForm.name} required
                        onChange={(e: any) => setAddForm(f => ({ ...f, name: e.target.value }))} />
                    <div className="grid grid-cols-2 gap-3">
                        <Input label="O'lchov birligi" value={addForm.unit} required placeholder="dona, ml, quti"
                            onChange={(e: any) => setAddForm(f => ({ ...f, unit: e.target.value }))} />
                        <Input label="Minimal qoldiq" type="number" value={addForm.minQuantity}
                            onChange={(e: any) => setAddForm(f => ({ ...f, minQuantity: e.target.value }))} />
                    </div>
                    <Input label="Tannarx (birlik uchun)" type="number" value={addForm.price}
                        helperText="Xizmat retsepti tannarxni shu narxdan hisoblaydi"
                        onChange={(e: any) => setAddForm(f => ({ ...f, price: e.target.value }))} />
                    <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                        <input type="checkbox" checked={addForm.isMedication} className="w-4 h-4 rounded"
                            onChange={(e) => setAddForm(f => ({ ...f, isMedication: e.target.checked }))} />
                        Dori — partiya va yaroqlilik muddati nazorat qilinadi
                    </label>
                    <div className="p-3 bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 rounded-lg">
                        <p className="text-xs text-gray-600 dark:text-gray-300">
                            Boshlang'ich qoldiq bu yerda kiritilmaydi: qoldiq faqat KIRIM orqali
                            paydo bo'ladi, shunda har birlikning qayerdan kelgani ko'rinadi.
                        </p>
                    </div>
                    <div className="flex justify-end gap-2">
                        <Button type="button" variant="secondary" onClick={() => setAddOpen(false)}>Bekor qilish</Button>
                        <Button type="submit">Qo'shish</Button>
                    </div>
                </form>
            </Modal>

            {/* ─── Kirim ──────────────────────────────────────────────────── */}
            {inTarget && (
                <Modal isOpen={true} onClose={() => setInTarget(null)} title={`Kirim — ${inTarget.name}`}>
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-3">
                            <Input label={`Miqdor (${inTarget.unit})`} type="number" step="any" value={inForm.quantity}
                                onChange={(e: any) => setInForm(f => ({ ...f, quantity: e.target.value }))} />
                            <Input label="Tannarx (birlik)" type="number" value={inForm.cost}
                                onChange={(e: any) => setInForm(f => ({ ...f, cost: e.target.value }))} />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <Input label="Partiya raqami" value={inForm.batchNumber}
                                onChange={(e: any) => setInForm(f => ({ ...f, batchNumber: e.target.value }))} />
                            <Input label={inTarget.isMedication ? 'Yaroqlilik muddati (majburiy)' : 'Yaroqlilik muddati'}
                                type="date" value={inForm.expiryDate}
                                onChange={(e: any) => setInForm(f => ({ ...f, expiryDate: e.target.value }))} />
                        </div>
                        <Input label="Izoh" value={inForm.note}
                            onChange={(e: any) => setInForm(f => ({ ...f, note: e.target.value }))} />
                        <div className="flex justify-end gap-2">
                            <Button variant="secondary" onClick={() => setInTarget(null)}>Bekor qilish</Button>
                            <Button onClick={submitIn} disabled={busy || !(Number(inForm.quantity) > 0)}>
                                {busy ? 'Saqlanmoqda…' : 'Kirimni yozish'}
                            </Button>
                        </div>
                    </div>
                </Modal>
            )}

            {/* ─── Chiqim ─────────────────────────────────────────────────── */}
            {outTarget && (
                <Modal isOpen={true} onClose={() => setOutTarget(null)} title={`Chiqim — ${outTarget.name}`}>
                    <div className="space-y-4">
                        <Input label={`Miqdor (${outTarget.unit})`} type="number" step="any" value={outForm.quantity}
                            onChange={(e: any) => {
                                const v = e.target.value;
                                setOutForm(f => ({ ...f, quantity: v }));
                                previewOut(outTarget, Number(v));
                            }} />
                        <Select label="Sababi" value={outForm.reason}
                            onChange={(e: any) => setOutForm(f => ({ ...f, reason: e.target.value }))}>
                            {OUT_REASONS.map((r) => <option key={r} value={r}>{REASON_LABEL[r]}</option>)}
                        </Select>
                        <Input label="Izoh" value={outForm.note}
                            onChange={(e: any) => setOutForm(f => ({ ...f, note: e.target.value }))} />

                        {/* FEFO ko'rinishi TASDIQLASHDAN OLDIN: odam nima bo'layotganini
                            tushunmasa, qoldiq bilan ishonch yo'qoladi */}
                        {outPreview.length > 0 && (
                            <div className="p-3 bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 rounded-lg">
                                <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">
                                    Qaysi partiyalardan yechiladi (muddati yaqinidan boshlab):
                                </p>
                                <div className="space-y-1">
                                    {outPreview.map((p, i) => (
                                        <div key={i} className="flex items-center justify-between text-xs">
                                            <span className="text-gray-600 dark:text-gray-300 truncate">
                                                {p.batch}{p.expiry ? ` · ${p.expiry}` : ''}
                                            </span>
                                            <span className="tabular-nums font-medium text-gray-900 dark:text-white shrink-0 ml-2">
                                                {fmt(p.take)} {outTarget.unit}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="flex justify-end gap-2">
                            <Button variant="secondary" onClick={() => setOutTarget(null)}>Bekor qilish</Button>
                            <Button onClick={submitOut} disabled={busy || !(Number(outForm.quantity) > 0)}>
                                {busy ? 'Saqlanmoqda…' : 'Chiqimni yozish'}
                            </Button>
                        </div>
                    </div>
                </Modal>
            )}

            {/* ─── Tarix ──────────────────────────────────────────────────── */}
            {historyItem && (
                <Modal isOpen={true} onClose={() => setHistoryItem(null)} title={`Tarix — ${historyItem.name}`}>
                    {historyRows.length === 0 ? (
                        <p className="text-sm text-gray-400 py-6 text-center">Harakat yo'q</p>
                    ) : (
                        <div className="space-y-1.5 max-h-96 overflow-y-auto">
                            {historyRows.map((m) => (
                                <div key={m.id} className="flex items-center gap-3 text-sm">
                                    <span className={`w-16 font-bold tabular-nums shrink-0 ${m.quantity >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                        {m.quantity >= 0 ? '+' : ''}{fmt(m.quantity)}
                                    </span>
                                    <span className="flex-1 min-w-0 truncate text-gray-600 dark:text-gray-300">
                                        {MOVEMENT_LABEL[m.type] || m.type} · {REASON_LABEL[m.reason] || m.reason}
                                        {m.note ? ` · ${m.note}` : ''}
                                    </span>
                                    <span className="text-xs text-gray-400 shrink-0">{fmtWhen(m.createdAt)}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </Modal>
            )}

            {/* ─── Inventarizatsiyani tasdiqlash ──────────────────────────── */}
            {auditConfirm && (
                <Modal isOpen={true} onClose={() => setAuditConfirm(false)} title="Inventarizatsiyani o'tkazish">
                    <div className="space-y-4">
                        <p className="text-sm text-gray-600 dark:text-gray-300">
                            {auditChanged.length} ta qatorda farq bor. Har biri uchun tuzatish harakati
                            yoziladi — qoldiq haqiqiy qiymatga tenglashadi va farq tarixda qoladi.
                        </p>
                        <div className="max-h-64 overflow-y-auto space-y-1">
                            {auditChanged.map((r) => (
                                <div key={r.item.id} className="flex items-center justify-between text-sm">
                                    <span className="truncate text-gray-700 dark:text-gray-300">{r.item.name}</span>
                                    <span className={`tabular-nums font-medium shrink-0 ml-2 ${(r.diff as number) > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                        {fmt(r.item.quantity || 0)} → {fmt(r.actual as number)}
                                    </span>
                                </div>
                            ))}
                        </div>
                        <div className="flex justify-end gap-2">
                            <Button variant="secondary" onClick={() => setAuditConfirm(false)}>Bekor qilish</Button>
                            <Button onClick={submitAudit} disabled={busy}>
                                {busy ? 'Yozilmoqda…' : 'Tasdiqlash'}
                            </Button>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
};
