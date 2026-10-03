import { describe, it, expect } from 'vitest';
import {
    toEskizTemplate, isApprovedStatus, matchesTemplateShape, pickEskizTemplate, EskizTemplate,
} from '../eskizTemplates';

/* ─────────────────────────────────────────────────────────────────────────────
   Shablonni Eskiz ro'yxati bilan solishtirish.

   Nima uchun sinov kerak. Bu qoida xato bo'lsa ikki yo'nalishda ham zarar:
   mos kelmasa — tasdiqlangan shablon qaytadan moderatsiyaga ketadi va klinika
   bekorga kutadi; keragidan ko'p narsaga mos kelsa — begona tasdiqlangan
   matnning holati bizning shablonga yopishadi va «tasdiqlangan» deb ko'ringan
   SMS Eskizda rad etiladi.
   ───────────────────────────────────────────────────────────────────────────── */

const OURS = 'Hurmatli {bemor_ismi}, sizni {sana} kuni soat {vaqt} da kutamiz. {klinika_nomi}';

const tpl = (id: number, text: string, status: string): EskizTemplate =>
    ({ id, template: text, original_text: text, status });

describe('toEskizTemplate', () => {
    it("o'zgaruvchilarni %w ga aylantiradi", () => {
        expect(toEskizTemplate('Salom {bemor_ismi}, soat {vaqt}')).toBe('Salom %w, soat %w');
    });
    it("bo'sh matnda yiqilmaydi", () => {
        expect(toEskizTemplate('')).toBe('');
        expect(toEskizTemplate(undefined as any)).toBe('');
    });
});

describe('isApprovedStatus', () => {
    it("Eskizning «service» va «reklama» holatlari — tasdiqlangan", () => {
        expect(isApprovedStatus('service')).toBe(true);
        expect(isApprovedStatus('reklama')).toBe(true);
        expect(isApprovedStatus(' Service ')).toBe(true);
    });
    it('moderatsiyadagi va rad etilgan — tasdiqlanmagan', () => {
        expect(isApprovedStatus('moderation')).toBe(false);
        expect(isApprovedStatus('inproccess')).toBe(false);
        expect(isApprovedStatus('rejected')).toBe(false);
        expect(isApprovedStatus(null)).toBe(false);
        expect(isApprovedStatus('')).toBe(false);
    });
    it("hujjatda yo'q yozilishlar kalit so'z bo'yicha taniladi", () => {
        expect(isApprovedStatus('confirmed')).toBe(true);
        expect(isApprovedStatus('Tasdiqlangan')).toBe(true);
        // «inactive» ichida «activ» bor, lekin so'z boshida emas
        expect(isApprovedStatus('inactive')).toBe(false);
    });
});

describe('matchesTemplateShape', () => {
    it('kabinetdan aniq misol bilan tasdiqlatilgan matnni taniydi', () => {
        expect(matchesTemplateShape(OURS,
            'Hurmatli Muhammadalixon, sizni 12.10.2026 kuni soat 14:00 da kutamiz. Nur Klinika')).toBe(true);
    });
    it('Eskizdagi %w joylari ham tokenlarga mos keladi', () => {
        expect(matchesTemplateShape(OURS, 'Hurmatli %w, sizni %w kuni soat %w da kutamiz. %w')).toBe(true);
    });
    it("bo'sh joy va registr farqi xalaqit bermaydi", () => {
        expect(matchesTemplateShape(OURS,
            'HURMATLI  Ali,  sizni 01.01.2027 kuni soat 9:00 da kutamiz.   Klinika')).toBe(true);
    });
    it('boshqa matnga mos kelmaydi', () => {
        expect(matchesTemplateShape(OURS, "Hurmatli Ali, qarzingiz 100 000 so'm. Nur Klinika")).toBe(false);
        expect(matchesTemplateShape(OURS, '')).toBe(false);
    });
    it("token o'rnida to'rt so'zdan ko'p bo'lsa — bu boshqa matn", () => {
        expect(matchesTemplateShape(OURS,
            'Hurmatli bir ikki uch tort besh olti, sizni 12.10 kuni soat 14:00 da kutamiz. Nur')).toBe(false);
    });
    it('juda qisqa shablon har narsaga mos kelib qolmaydi', () => {
        expect(matchesTemplateShape('{bemor_ismi}, keling', 'Ali, keling')).toBe(false);
    });
});

describe('pickEskizTemplate', () => {
    it('tasdiqlangan mos yozuv keyinroq yuborilgan nusxadan ustun', () => {
        const list = [
            tpl(1, 'Hurmatli Ali, sizni 12.10.2026 kuni soat 14:00 da kutamiz. Nur Klinika', 'service'),
            tpl(2, toEskizTemplate(OURS), 'moderation'),
        ];
        expect(pickEskizTemplate(list, OURS)?.id).toBe(1);
    });
    it("tasdiqlangani yo'q bo'lsa — aynan shu matnning oxirgi yuborilgani", () => {
        const list = [
            tpl(1, toEskizTemplate(OURS), 'rejected'),
            tpl(2, toEskizTemplate(OURS), 'moderation'),
        ];
        expect(pickEskizTemplate(list, OURS)?.id).toBe(2);
    });
    it("tasdiqlanmagan «o'xshash» matn olinmaydi — faqat aynan o'zi", () => {
        const list = [tpl(1, 'Hurmatli Ali, sizni 12.10.2026 kuni soat 14:00 da kutamiz. Nur Klinika', 'moderation')];
        expect(pickEskizTemplate(list, OURS)).toBeNull();
    });
    it("ro'yxatda yo'q bo'lsa — null", () => {
        expect(pickEskizTemplate([], OURS)).toBeNull();
        expect(pickEskizTemplate([tpl(1, "Qarzingiz bor, to'lang iltimos hurmatli mijoz", 'service')], OURS)).toBeNull();
    });
});
