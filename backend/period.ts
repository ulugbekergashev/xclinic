/* SOLISHTIRISH DAVRI — bitta qoida, Hisobotning hamma tabida (2026-11-26).
   Ilgari u faqat `/reports/compare` ichida yozilgan edi; Bemorlar tabi
   boshqa qoida bilan «1–26 noyabr» ni «6–31 oktyabr» bilan solishtirardi,
   Umumiy esa «1–26 oktyabr» bilan.

   • Odatda — shu uzunlikdagi oldingi davr.
   • Oyning boshidan (1–22 noyabr) — o'tgan oyning o'sha kunlari
     (1–22 oktyabr); to'liq oy tanlansa — o'tgan oy ham to'liq. */
export function previousPeriod(from: string, to: string): { from: string; to: string } | null {
    const dayMs = 864e5;
    const fromT = new Date(`${from}T00:00:00.000Z`).getTime();
    const toT = new Date(`${to}T00:00:00.000Z`).getTime();
    if (!isFinite(fromT) || !isFinite(toT) || toT < fromT) return null;
    const days = Math.round((toT - fromT) / dayMs) + 1;
    let prevTo = new Date(fromT - dayMs).toISOString().slice(0, 10);
    let prevFrom = new Date(fromT - days * dayMs).toISOString().slice(0, 10);
    const [fy, fm, fd] = from.split('-').map(Number);
    const [ty, tm, td] = to.split('-').map(Number);
    if (fd === 1 && fy === ty && fm === tm) {
        const py = fm === 1 ? fy - 1 : fy;
        const pm = fm === 1 ? 12 : fm - 1;
        const lastPrev = new Date(Date.UTC(py, pm, 0)).getUTCDate();
        const pad = (n: number) => String(n).padStart(2, '0');
        prevFrom = `${py}-${pad(pm)}-01`;
        const lastCur = new Date(Date.UTC(ty, tm, 0)).getUTCDate();
        prevTo = `${py}-${pad(pm)}-${pad(td >= lastCur ? lastPrev : Math.min(td, lastPrev))}`;
    }
    return { from: prevFrom, to: prevTo };
}
