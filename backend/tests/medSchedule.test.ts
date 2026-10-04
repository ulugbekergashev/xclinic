import { describe, it, expect } from 'vitest';
import { dosesPerDay, slotMinutes, slotLabel, medDue } from '../../shared/medSchedule';

/* ─────────────────────────────────────────────────────────────────────────────
   Dori jadvali — «kuniga 3 mahal» matnidan bugungi vaqtlar.

   Nima uchun sinov kerak. Bu funksiya hamshiraga «doza kutyapti» deb aytadi.
   Matnni noto'g'ri o'qisa ikki xil zarar bo'ladi: jadvalsiz dorini («og'riqda»)
   vaqtga bog'lab, keraksiz eslatma chiqaradi — yoki jadvalli dorini tanimay,
   jim turadi. Ikkalasi ham ekranda xato bo'lib ko'rinmaydi.
   ───────────────────────────────────────────────────────────────────────────── */

describe('dosesPerDay — matndan «necha mahal»', () => {
    it('o\'zbekcha: son + mahal / marta', () => {
        expect(dosesPerDay('Kuniga 3 marta')).toBe(3);
        expect(dosesPerDay('Kuniga 2 mahal')).toBe(2);
        expect(dosesPerDay('3 mahal')).toBe(3);
        expect(dosesPerDay('kuniga 1 marta, ovqatdan keyin')).toBe(1);
        expect(dosesPerDay('4 marotaba')).toBe(4);
    });

    it('o\'zbekcha: so\'z bilan', () => {
        expect(dosesPerDay('kuniga ikki mahal')).toBe(2);
        expect(dosesPerDay("Kuniga to'rt marta")).toBe(4);
        expect(dosesPerDay('bir mahal')).toBe(1);
    });

    it('ruscha', () => {
        expect(dosesPerDay('2 раза в день')).toBe(2);
        expect(dosesPerDay('3 р/д')).toBe(3);
        expect(dosesPerDay('1 раз в сутки')).toBe(1);
        expect(dosesPerDay('три раза в день')).toBe(3);
        expect(dosesPerDay('дважды в день')).toBe(2);
    });

    it('«har N soatda» — sutkaga bo\'linadi', () => {
        expect(dosesPerDay('har 8 soatda')).toBe(3);
        expect(dosesPerDay('Har 12 soatda')).toBe(2);
        expect(dosesPerDay('каждые 6 часов')).toBe(4);
    });

    it('kun qismlari', () => {
        expect(dosesPerDay('ertalab va kechqurun')).toBe(2);
        expect(dosesPerDay('утром и вечером')).toBe(2);
        expect(dosesPerDay('ertalab, tushda, kechqurun')).toBe(3);
        expect(dosesPerDay('yotishdan oldin')).toBe(1);
    });

    it('faqat son', () => {
        expect(dosesPerDay('3')).toBe(3);
        expect(dosesPerDay('3x')).toBe(3);
    });

    it('zaruratga qarab — jadvalsiz', () => {
        expect(dosesPerDay("Og'riqda")).toBeNull();
        expect(dosesPerDay('Og‘riq bo‘lganda 1 marta')).toBeNull();
        expect(dosesPerDay('zaruratga qarab')).toBeNull();
        expect(dosesPerDay('при боли')).toBeNull();
        expect(dosesPerDay('по необходимости')).toBeNull();
    });

    it('bo\'sh yoki tushunarsiz matn — jadvalsiz, taxmin qilinmaydi', () => {
        expect(dosesPerDay('')).toBeNull();
        expect(dosesPerDay(null)).toBeNull();
        expect(dosesPerDay(undefined)).toBeNull();
        expect(dosesPerDay('shifokor ko\'rsatmasi bo\'yicha')).toBeNull();
        expect(dosesPerDay('500 mg')).toBeNull();
        expect(dosesPerDay('40 marta')).toBeNull();   // aql bovar qilmaydigan son
    });
});

describe('slotMinutes — standart vaqtlar', () => {
    const labels = (n: number) => slotMinutes(n).map(slotLabel);

    it('bir, ikki, uch, to\'rt mahal', () => {
        expect(labels(1)).toEqual(['09:00']);
        expect(labels(2)).toEqual(['08:00', '20:00']);
        expect(labels(3)).toEqual(['08:00', '14:00', '20:00']);
        expect(labels(4)).toEqual(['08:00', '12:00', '16:00', '20:00']);
    });

    it('besh va undan ko\'pi — 06:00 dan 22:00 gacha teng oraliqda', () => {
        expect(labels(5)).toEqual(['06:00', '10:00', '14:00', '18:00', '22:00']);
        expect(slotMinutes(6)).toHaveLength(6);
        expect(labels(6)[0]).toBe('06:00');
        expect(labels(6)[5]).toBe('22:00');
    });
});

describe('medDue — doza kutyaptimi', () => {
    const at = (h: number, m = 0) => h * 60 + m;

    it('vaqti kelmaguncha kutmaydi', () => {
        const d = medDue('Kuniga 3 marta', 0, at(7, 59));
        expect(d.due).toBe(0);
        expect(d.nextAt).toBe('08:00');
        expect(d.slots).toEqual(['08:00', '14:00', '20:00']);
    });

    it('vaqti keldi va belgilanmagan — kutyapti', () => {
        expect(medDue('Kuniga 3 marta', 0, at(8)).due).toBe(1);
        expect(medDue('Kuniga 3 marta', 0, at(14, 5)).due).toBe(2);   // ertalabkisi ham berilmagan
        expect(medDue('Kuniga 3 marta', 1, at(14, 5)).due).toBe(1);
    });

    it('belgilangach kutmaydi — kech berilgan bo\'lsa ham', () => {
        const d = medDue('Kuniga 3 marta', 1, at(10, 30));
        expect(d.due).toBe(0);
        expect(d.nextAt).toBe('14:00');
    });

    it('oldindan berilgan doza keyingi vaqtni yopadi', () => {
        expect(medDue('Kuniga 2 mahal', 2, at(20, 5)).due).toBe(0);
    });

    it('kun oxirida keyingi vaqt yo\'q', () => {
        expect(medDue('Kuniga 2 mahal', 2, at(21)).nextAt).toBeNull();
    });

    it('jadvalsiz dori hech qachon kutmaydi', () => {
        const d = medDue("Og'riqda", 0, at(23, 59));
        expect(d).toEqual({ perDay: null, slots: [], due: 0, nextAt: null });
    });
});
