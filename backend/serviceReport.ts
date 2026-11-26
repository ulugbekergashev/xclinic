/* XIZMATLAR HISOBOTI — «qaysi xizmat qancha keltiryapti» (2026-11-26).

   Egasining savoli: hisobotda xizmatlar bo'yicha hech narsa yo'q edi.
   Olti maslahatchi (ega, bosh shifokor, soddalik tanqidchisi, DentaCRM,
   bozor, raqamlar mosligi) bilan kelishilgan qoidalar:

   • Qator = bitta xizmat. Kalit — katalog id si (`serviceId`); id si yo'q
     meros qator — katalogdan nomi bo'yicha, topilmasa nomining o'zi.
   • Tahlil buyurtmasi kassaga BITTA qator bo'lib tushadi («OAK, Qand,
     ALT»). Bu yerda u `LabOrderItem` lar bo'yicha tahlilma-tahlil
     yoyiladi; qatorning summasi (keyin chegirma berilgan bo'lsa ham)
     tahlillarga narxiga mutanosib bo'linadi — jami o'zgarmaydi.
   • Dori va koyka-kun — bittadan yig'ma qator. Ularni nomma-nom yoyish
     ro'yxatni ko'mib yuboradi (dori nomida dozasi, koykada sanasi bor).
   • Jami Umumiydagi «Xizmatlar» bilan AYNAN bir xil: o'sha qatorlar, o'sha
     sana qoidasi, bekor qilinganlar kirmaydi.
   • Bo'lim — Bo'limlar tabidagi qoida (`chargeDepartmentId`). Bo'lim
     tanlanganda yig'indi Bo'limlar jadvalidagi o'sha bo'lim soni bilan teng.
   • Material — xizmat retseptidan (faqat sarflanadigan material, ombor
     narxi × miqdor × soni; ombordan ham aynan shu yechiladi), tahlilda —
     tahlil kartasidagi tannarx. Kiritilmagan bo'lsa `null` («—»), 0 EMAS:
     aks holda xizmat materialsiz ko'rinib, egani aldardi.
   • «Foyda» ustuni ATAYLAB yo'q. Sof foyda qoidasi bitta (xizmatlar −
     xarajat); xizmat bo'yicha «foyda» ikkinchi, unga zid raqam bo'lardi.
     Ombor xaridi baribir xarajat bo'lib yoziladi. */
import { som } from './money';
import { tashkentRangeBounds } from './tashkentTime';
import { previousPeriod } from './period';

const round = som;

/** Hisobotning hamma tabi bir xil qatorlarni oladi */
export const periodChargesWhere = (clinicId: string, from: string, to: string) => {
    const { start, end } = tashkentRangeBounds(from, to);
    return {
        clinicId,
        status: { not: 'Cancelled' },
        OR: [
            { visit: { date: { gte: from, lte: to } } },
            { visitId: null, createdAt: { gte: start, lte: end } },
        ],
    };
};

/** Qator qaysi bo'limga tushadi: statsionar qatori yotish bo'limiga,
    qolgani qabul bo'limiga. Umumiy, Bo'limlar, Xizmatlar — bitta qoida. */
export const chargeDepartmentId = (c: { admission?: { departmentId?: string | null } | null; visit?: { departmentId?: string | null } | null }) =>
    c.admission?.departmentId || c.visit?.departmentId || null;

/** Xizmat id → bitta bajarilishdagi material narxi (faqat sarflanadigan
    material: ombordan retsept bo'yicha aynan shular yechiladi) */
export async function recipeCostByService(prisma: any, clinicId: string): Promise<Map<number, number>> {
    const recipes = await prisma.serviceRecipe.findMany({
        where: { clinicId },
        select: { serviceId: true, quantity: true, item: { select: { price: true, isConsumable: true } } },
    });
    const out = new Map<number, number>();
    for (const r of recipes) {
        if (r.item && r.item.isConsumable === false) { if (!out.has(r.serviceId)) out.set(r.serviceId, 0); continue; }
        out.set(r.serviceId, (out.get(r.serviceId) || 0) + (r.item?.price || 0) * (r.quantity || 0));
    }
    return out;
}

/** Qatorning katalogdagi xizmati: id bo'yicha, meros qatorda — nomi bo'yicha
    (faqat «Service» manbasida: dori yoki tahlil xizmat nomiga o'xshasa ham
    unga retsept narxi yozilmasin) */
export const catalogMatcher = (services: { id: number; name: string }[]) => {
    const byId = new Map<number, any>(services.map(s => [s.id, s]));
    const byName = new Map<string, any>(services.map(s => [String(s.name).trim().toLowerCase(), s]));
    return (c: { serviceId?: number | null; source?: string; name?: string }) =>
        (c.serviceId != null ? byId.get(c.serviceId) : undefined)
        ?? (c.source === 'Service' ? byName.get(String(c.name || '').trim().toLowerCase()) : undefined);
};

/** Nomma-nom yoyilmaydigan manbalar — bittadan yig'ma qator */
const AGGREGATED = new Set(['Medication', 'Bed']);

export interface ServiceRow {
    key: string;
    serviceId: number | null;
    name: string;
    /** Service | Lab | Study | Medication | Bed | Other */
    source: string;
    departmentId: string | null;
    count: number;
    revenue: number;
    discount: number;
    /** Narxnomadagi joriy narx (katalogda bo'lsa) */
    listPrice: number | null;
    /** null — material kiritilmagan (yoki yig'ma qator) */
    materialCost: number | null;
    prevRevenue: number;
    prevCount: number;
}

/** Bitta hisob qatorining bir bo'lagi (tahlil buyurtmasi — tahlillarga yoyilgan) */
interface Line {
    key: string; serviceId: number | null; name: string; source: string; departmentId: string | null;
    qty: number; revenue: number; listAmount: number; material: number | null; listPrice: number | null;
}

const CHARGE_SELECT = {
    serviceId: true, name: true, source: true, sourceId: true, quantity: true, unitPrice: true, total: true,
    visit: { select: { departmentId: true } },
    admission: { select: { departmentId: true } },
};

async function loadLines(prisma: any, clinicId: string, from: string, to: string, ctx: {
    match: ReturnType<typeof catalogMatcher>; recipe: Map<number, number>;
}): Promise<Line[]> {
    const charges = await prisma.visitCharge.findMany({ where: periodChargesWhere(clinicId, from, to), select: CHARGE_SELECT });
    const orderIds = charges.filter((c: any) => c.source === 'Lab' && c.sourceId).map((c: any) => c.sourceId);
    const items = orderIds.length
        ? await prisma.labOrderItem.findMany({
            where: { orderId: { in: orderIds } },
            select: { orderId: true, testId: true, testName: true, price: true, test: { select: { name: true, price: true, cost: true } } },
        })
        : [];
    const itemsByOrder = new Map<string, any[]>();
    for (const it of items) itemsByOrder.set(it.orderId, [...(itemsByOrder.get(it.orderId) || []), it]);

    const lines: Line[] = [];
    for (const c of charges) {
        const dep = chargeDepartmentId(c);
        const qty = c.quantity || 1;
        const total = c.total || 0;
        const listAmount = Math.max(total, (c.unitPrice || 0) * qty);

        const tests = c.source === 'Lab' && c.sourceId ? itemsByOrder.get(c.sourceId) : undefined;
        if (tests && tests.length) {
            const priceSum = tests.reduce((s, t) => s + (t.price || 0), 0);
            /* Butun so'mda bo'linadi, qoldiq oxirgi tahlilga: yig'indi
               qatorning o'zi bilan so'mma-so'm teng qolsin */
            let restRev = total, restList = listAmount;
            tests.forEach((t, i) => {
                const last = i === tests.length - 1;
                /* Narxi 0 bo'lgan buyurtmada teng bo'linadi */
                const part = priceSum > 0 ? (t.price || 0) / priceSum : 1 / tests.length;
                const rev = last ? restRev : Math.round(total * part);
                const list = last ? restList : Math.round(listAmount * part);
                restRev -= rev; restList -= list;
                lines.push({
                    key: `lab:${t.testId}`, serviceId: null, name: t.test?.name || t.testName, source: 'Lab', departmentId: dep,
                    qty: 1, revenue: rev, listAmount: list,
                    material: t.test?.cost > 0 ? t.test.cost : null, listPrice: t.test?.price ?? null,
                });
            });
            continue;
        }
        if (AGGREGATED.has(c.source)) {
            lines.push({
                key: `src:${c.source}`, serviceId: null, name: c.source, source: c.source, departmentId: dep,
                qty, revenue: total, listAmount, material: null, listPrice: null,
            });
            continue;
        }
        const svc = ctx.match(c);
        const per = svc && ctx.recipe.has(svc.id) ? ctx.recipe.get(svc.id)! : null;
        lines.push({
            key: svc ? `svc:${svc.id}` : `name:${c.source}:${String(c.name || '').trim().toLowerCase()}`,
            serviceId: svc?.id ?? null, name: svc?.name || c.name || '—', source: c.source || 'Other', departmentId: dep,
            qty, revenue: total, listAmount, material: per == null ? null : per * qty, listPrice: svc?.price ?? null,
        });
    }
    return lines;
}

export async function serviceReport(prisma: any, clinicId: string, from: string, to: string) {
    const prevRange = previousPeriod(from, to);
    const [services, recipe, departments] = await Promise.all([
        prisma.service.findMany({ where: { clinicId }, select: { id: true, name: true, price: true, departmentId: true } }),
        recipeCostByService(prisma, clinicId),
        prisma.department.findMany({ where: { clinicId }, select: { id: true, name: true, color: true } }),
    ]);
    const ctx = { match: catalogMatcher(services), recipe };
    const [lines, prevLines] = await Promise.all([
        loadLines(prisma, clinicId, from, to, ctx),
        prevRange ? loadLines(prisma, clinicId, prevRange.from, prevRange.to, ctx) : Promise.resolve([] as Line[]),
    ]);

    /* Bitta xizmat ikki bo'limda bajarilgan bo'lsa — ikki qator: bo'lim
       bo'yicha tanlanganda yig'indi Bo'limlar jadvali bilan teng bo'lsin */
    const rowKey = (l: Line) => `${l.key}|${l.departmentId || ''}`;
    const rows = new Map<string, ServiceRow & { listAmount: number; materialKnown: boolean }>();
    for (const l of lines) {
        const k = rowKey(l);
        let r = rows.get(k);
        if (!r) {
            r = {
                key: k, serviceId: l.serviceId, name: l.name, source: l.source, departmentId: l.departmentId,
                count: 0, revenue: 0, discount: 0, listPrice: l.listPrice, materialCost: 0,
                prevRevenue: 0, prevCount: 0, listAmount: 0, materialKnown: true,
            };
            rows.set(k, r);
        }
        r.count += l.qty;
        r.revenue += l.revenue;
        r.listAmount += l.listAmount;
        if (l.material == null) r.materialKnown = false;
        else r.materialCost = (r.materialCost || 0) + l.material;
    }
    /* O'tgan davr jami — HAMMA qatorlar (bu davrda sotilmagan xizmat ham),
       bo'lim bo'yicha: jami qatordagi o'zgarish Umumiydagi bilan bir xil */
    const prevByDepartment: Record<string, number> = {};
    for (const l of prevLines) {
        const dk = l.departmentId || 'none';
        prevByDepartment[dk] = (prevByDepartment[dk] || 0) + l.revenue;
        /* O'tgan davrda bo'lib, bu davrda yo'q xizmat qatorga chiqmaydi */
        const r = rows.get(rowKey(l));
        if (!r) continue;
        r.prevRevenue += l.revenue;
        r.prevCount += l.qty;
    }

    const list: ServiceRow[] = Array.from(rows.values()).map(({ listAmount, materialKnown, ...r }) => ({
        ...r,
        count: round(r.count),
        revenue: round(r.revenue),
        /* Chegirma = narxi × soni − yozilgan summa. `discount` maydoni ham
           shu, lekin kassada summa keyin tuzatilsa u eskirib qoladi. */
        discount: round(Math.max(0, listAmount - r.revenue)),
        materialCost: materialKnown && !AGGREGATED.has(r.source) ? round(r.materialCost || 0) : null,
        prevRevenue: round(r.prevRevenue),
        prevCount: round(r.prevCount),
    })).sort((x, y) => y.revenue - x.revenue || x.name.localeCompare(y.name));

    /* Narxnomada bor, davrda bir marta ham bajarilmagan — «hech kim
       buyurtma qilmayapti» savoli uchun (bosh shifokor) */
    const sold = new Set(list.map(r => r.serviceId).filter((id): id is number => id != null));
    const unsold = services
        .filter((s: any) => !sold.has(s.id))
        .map((s: any) => ({ serviceId: s.id, name: s.name, departmentId: s.departmentId || null, listPrice: s.price }))
        .sort((x: any, y: any) => String(x.name).localeCompare(String(y.name)));

    const sum = (k: 'revenue' | 'discount') => round(list.reduce((s, r) => s + r[k], 0));
    for (const k of Object.keys(prevByDepartment)) prevByDepartment[k] = round(prevByDepartment[k]);
    return {
        range: { from, to },
        previous: prevRange,
        totals: {
            revenue: sum('revenue'), discount: sum('discount'),
            prevRevenue: round(Object.values(prevByDepartment).reduce((s, v) => s + v, 0)),
        },
        /** Bo'lim id (yoki 'none') → o'tgan davr summasi */
        prevByDepartment,
        departments: departments.map((d: any) => ({ id: d.id, name: d.name, color: d.color || null })),
        services: list,
        unsold,
    };
}
