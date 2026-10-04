// Grafiklar uchun yagona rang palitrasi (dizayn tokenlariga mos).
// Recharts hex qiymatlarni talab qiladi, shuning uchun bu yerda markazlashtirilgan.
/* Shifokor va xona ranglari — palitraning «halqa, nuqta va kalendar bloki»
   uchun ajratilgan qatori (`index.css`, klassik tibbiy palitra). Xira,
   bir-biridan aniq farq qiladi va oq yuzada ham, to'q fonda ham o'qiladi. */
export const CHART_COLORS = [
    '#1D70B8', // ko'k
    '#D5281B', // qizil
    '#6F4FA3', // binafsha
    '#B5377A', // pushti
    '#C65D00', // to'q sariq
    '#2E8540', // yashil
    '#A8820A', // oltin
    '#1A8CA8', // zangori
];

export const CHART = {
    primary: '#005EB8',
    success: '#009639',
    warning: '#ED8B00',
    danger: '#D5281B',
    info: '#00A499',
    grid: '#D8DDE0',
    tooltipBg: '#212B32',
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
