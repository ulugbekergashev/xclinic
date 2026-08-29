// Grafiklar uchun yagona rang palitrasi (dizayn tokenlariga mos).
// Recharts hex qiymatlarni talab qiladi, shuning uchun bu yerda markazlashtirilgan.
export const CHART_COLORS = [
    '#2563EB', // primary
    '#059669', // success
    '#D97706', // warning
    '#DC2626', // danger
    '#0EA5E9', // info
    '#7C3AED', // violet (qo'shimcha)
    '#DB2777', // pink (qo'shimcha)
];

export const CHART = {
    primary: '#2563EB',
    success: '#059669',
    warning: '#D97706',
    danger: '#DC2626',
    info: '#0EA5E9',
    grid: '#E5E7EB',
    tooltipBg: '#1F2937',
};

/* ─── Shifokor rangi (S5.3, audit B-18) ─────────────────────────────────────

   MUAMMO. Kalendarda `doc.color || '#3B82F6'` yozilgan edi. `Doctor.color`
   bazada NULL — dev bazadagi oltita shifokorning hammasida. Ya'ni zaxira
   rang har doim ishlaydi va oltita legenda nuqtasi ham, qabul bloklari ham
   bir xil ko'k bo'lib chiqadi: audit aynan shuni ko'rgan.

   YECHIM — barqaror zaxira. Rang shifokor ID'sidan hisoblanadi, ya'ni:
     • migratsiya kerak emas;
     • har ochilishda BIR XIL rang chiqadi (tasodifiy emas);
     • ro'yxat tartibi o'zgarsa ham rang o'zgarmaydi — indeksga bog'liq
       emas, aks holda yangi shifokor qo'shilganda hammasi surilib ketardi.

   Bazadagi `color` to'ldirilgan bo'lsa — u ustun turadi. */

/** Satrdan barqaror musbat son (FNV-1a) — hash tanlash uchun kifoya. */
function stableHash(s: string): number {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return Math.abs(h);
}

/** Shifokor rangi: bazadagisi, bo'lmasa ID dan hisoblangan barqaror rang. */
export function doctorColor(doctor?: { id?: string; color?: string | null } | null): string {
    if (doctor?.color) return doctor.color;
    if (!doctor?.id) return CHART_COLORS[0];
    return CHART_COLORS[stableHash(doctor.id) % CHART_COLORS.length];
}
