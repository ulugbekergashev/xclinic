import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Plus, X, Loader2 } from 'lucide-react';
import { api } from '../services/api';
import { InventoryItem } from '../types';
import { formatMoney } from '../utils/format';

/* ─────────────────────────────────────────────────────────────────────────────
   XIZMAT RETSEPTI — qaysi material, qancha ketadi.

   Server buni ALLAQACHON biladi: `ServiceRecipe` jadvali bor, marshrutlar
   bor (`/api/service-recipes`), va Moliya hisobotidagi TANNARX ustuni aynan
   shundan hisoblanadi (`reports.ts`: «Xizmat tannarxi retseptdan»).

   Lekin uni KIRITADIGAN ekran yo'q edi. Ya'ni tannarx har doim nol
   chiqardi va «qaysi xizmat foydali» degan savolga hisobot javob bera
   olmasdi — hamma xizmatning margasi 100% ko'rinardi.

   Xizmat formasidagi «Texniklar xarajati» (`Service.cost`) esa qo'lda
   kiritilardi va HECH QAYERDA o'qilmasdi: hisobot faqat retseptga
   qaraydi. U maydon olib tashlandi.
   ───────────────────────────────────────────────────────────────────────────── */

const inputCls = 'h-10 rounded-lg border border-line bg-transparent px-3 text-sm focus:ring-2 focus:ring-primary-500 outline-none';

interface Props {
    /** Yangi xizmatda `null` — saqlangandan keyin retsept kiritiladi */
    serviceId: number | null;
    /** Narx — marja darhol ko'rinsin */
    price?: number;
    items: InventoryItem[];
    addToast?: (type: 'success' | 'error' | 'info', msg: string) => void;
}

type Row = { itemId: string; quantity: string; note: string };

export const ServiceRecipeEditor: React.FC<Props> = ({ serviceId, price = 0, items, addToast }) => {
    const [rows, setRows] = useState<Row[]>([]);
    const [loading, setLoading] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const load = useCallback(async (id: number) => {
        setLoading(true); setError('');
        try {
            const lines = await api.recipes.get(id);
            setRows(lines.map((l: any) => ({
                itemId: l.itemId,
                quantity: String(l.quantity),
                note: l.note || '',
            })));
        } catch (e: any) {
            setError(e?.data?.error || e?.message || "Retsept o'qilmadi");
        } finally { setLoading(false); }
    }, []);

    useEffect(() => {
        if (serviceId == null) { setRows([]); return; }
        load(serviceId);
    }, [serviceId, load]);

    /* Tannarx SHU YERDA, jonli: qator qo'shilganda darhol ko'rinadi.
       Serverdagi hisob bilan bir xil formula — miqdor × material narxi. */
    const cost = useMemo(() => rows.reduce((sum, r) => {
        const it = items.find(x => x.id === r.itemId);
        return sum + (Number(r.quantity) || 0) * (it?.price || 0);
    }, 0), [rows, items]);

    const margin = price - cost;

    const save = async () => {
        if (serviceId == null) return;
        setBusy(true); setError('');
        try {
            await api.recipes.save(serviceId, rows
                .filter(r => r.itemId && Number(r.quantity) > 0)
                .map(r => ({
                    itemId: r.itemId,
                    quantity: Number(r.quantity),
                    note: r.note.trim() || undefined,
                })));
            addToast?.('success', 'Retsept saqlandi');
            await load(serviceId);
        } catch (e: any) {
            setError(e?.data?.error || e?.message || 'Saqlanmadi');
        } finally { setBusy(false); }
    };

    if (serviceId == null) {
        return (
            <p className="text-xs text-faint py-3">
                Materiallarni xizmat saqlangandan keyin kiritish mumkin.
            </p>
        );
    }

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-4 text-xs">
                <span className="text-muted">
                    Tannarx: <b className="tabular-nums text-ink">{formatMoney(cost)}</b>
                </span>
                <span className={margin >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}>
                    Marja: <b className="tabular-nums">{formatMoney(margin)}</b>
                    {price > 0 && ` (${Math.round((margin / price) * 100)}%)`}
                </span>
            </div>

            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

            {loading ? (
                <p className="text-sm text-faint py-4 text-center">Yuklanmoqda…</p>
            ) : rows.length === 0 ? (
                <p className="text-sm text-faint py-4 text-center">
                    Material biriktirilmagan — hisobotda tannarx nol bo'ladi
                </p>
            ) : (
                <div className="space-y-2">
                    {rows.map((r, i) => {
                        const it = items.find(x => x.id === r.itemId);
                        return (
                            <div key={i} className="flex flex-wrap items-center gap-2">
                                <select value={r.itemId}
                                    onChange={e => setRows(rs => rs.map((x, j) => j === i ? { ...x, itemId: e.target.value } : x))}
                                    className={inputCls + ' flex-1 min-w-[180px]'}>
                                    <option value="">— Material —</option>
                                    {items.map(m => (
                                        <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>
                                    ))}
                                </select>

                                <input type="number" step="0.001" value={r.quantity} placeholder="0"
                                    onChange={e => setRows(rs => rs.map((x, j) => j === i ? { ...x, quantity: e.target.value } : x))}
                                    className={inputCls + ' w-24 text-right'} />
                                <span className="text-xs text-faint w-10">{it?.unit || ''}</span>

                                <span className="text-xs tabular-nums text-muted w-24 text-right">
                                    {formatMoney((Number(r.quantity) || 0) * (it?.price || 0))}
                                </span>

                                <button type="button" onClick={() => setRows(rs => rs.filter((_, j) => j !== i))}
                                    className="p-2 text-faint hover:text-red-600">
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}

            <div className="flex items-center gap-2">
                <button type="button"
                    onClick={() => setRows(rs => [...rs, { itemId: '', quantity: '', note: '' }])}
                    className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium border border-line rounded-lg hover:bg-elevated">
                    <Plus className="w-4 h-4" /> Material qo'shish
                </button>
                <button type="button" onClick={save} disabled={busy}
                    className="ml-auto px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50 flex items-center gap-1.5">
                    {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                    Retseptni saqlash
                </button>
            </div>
        </div>
    );
};
