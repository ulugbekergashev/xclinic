/**
 * XClinic shablonini Eskiz'dagi shablonlar ro'yxati bilan solishtirish.
 *
 * Sof funksiyalar — baza ham, tarmoq ham yo'q (smsService shularni ishlatadi),
 * shuning uchun ularni alohida sinab ko'rish oson (`tests/eskizTemplates.test.ts`).
 */

// Shablondagi o'zgaruvchi: {bemor_ismi}, {vaqt}, {BEMOR} ...
const TOKEN_SOURCE = '\\{[A-Za-z_]+\\}';

// Eskiz shablonida o'zgaruvchan qism `%w` bilan belgilanadi. Bizning
// `{bemor_ismi}` kabi tokenlarimiz literal matn sifatida yuborilsa, moderatsiyadan
// o'tgan shablon real (ism qo'yilgan) SMS'ga mos kelmaydi va yuborish rad etiladi.
export const toEskizTemplate = (text: string): string => (text || '').replace(new RegExp(TOKEN_SOURCE, 'g'), '%w');

// Eskiz matnni ozgina qayta formatlab qaytarishi mumkin — solishtirishdan oldin
// bo'sh joy va registr farqlarini yo'qotamiz.
export const normalizeForMatch = (text: string): string => (text || '').replace(/\s+/g, ' ').trim().toLowerCase();

/**
 * Shablon tasdiqlanganmi. Eskiz hujjatidagi holatlar: moderation — moderatsiyada,
 * inproccess — jarayonda, service — servis sifatida tasdiqlangan, reklama — reklama
 * sifatida tasdiqlangan. Hujjatda yo'q yozilishlar uchun kalit so'zlar ham qoldirildi
 * (Xabarlar sahifasidagi yorliq bilan bir xil qoida).
 */
export const isApprovedStatus = (status?: string | null): boolean =>
    /^(service|reklama)$|\b(confirm|approv|activ|tasdiq)/i.test((status || '').trim());

export interface EskizTemplate {
    id: number;
    template: string;
    original_text: string;
    status: string;
}

// Eskiz yozuvidagi o'zgaruvchan joylar: %w, %d, %w{1,4}, %d{1,3}
const ESKIZ_VAR_RE = /%[wd](\{\d+(,\d+)?\})?/g;
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Token o'rnidagi qiymat: 1–4 so'z (ism, "14:00", "Dr. Karimov" ...)
const TOKEN_VALUE = '\\S+(?: \\S+){0,3}';
// Juda qisqa shablon har qanday matnga "mos" bo'lib qolmasin
const MIN_LITERAL_LENGTH = 15;

/**
 * Eskiz'dagi matn bizning shablonimiz shaklidami: tokenlarimiz o'rnida istalgan qiymat
 * turishi mumkin. Klinika shablonni XClinic'dan oldin kabinetdan aniq misol bilan
 * tasdiqlatgan bo'lishi mumkin ("…, Muhammadalixon, bugun soat 14:00 da …") — Eskiz
 * uni shablon sifatida qabul qiladi va boshqa ism/vaqt qo'yilgan SMS'ni ham o'tkazadi.
 * Eskiz'dagi %w joylari ham tokenlarimizga to'g'ri keladi.
 */
export function matchesTemplateShape(ourText: string, eskizText: string): boolean {
    const ours = normalizeForMatch(ourText);
    const theirs = normalizeForMatch(eskizText).replace(ESKIZ_VAR_RE, 'x');
    if (!theirs) return false;
    const literals = ours.split(new RegExp(TOKEN_SOURCE));
    if (literals.join('').length < MIN_LITERAL_LENGTH) return false;

    // Tez tekshiruv: doimiy qismlar shu tartibda bo'lmasa, regex'ga ham o'tirmaymiz
    // (ro'yxatdagi deyarli hamma matn shu yerda to'xtaydi)
    const last = literals[literals.length - 1];
    if (!theirs.startsWith(literals[0]) || !theirs.endsWith(last)) return false;
    let pos = literals[0].length;
    for (let i = 1; i < literals.length - 1; i++) {
        const at = theirs.indexOf(literals[i], pos);
        if (at === -1) return false;
        pos = at + literals[i].length;
    }

    let pattern = escapeRe(literals[0]);
    for (let i = 1; i < literals.length; i++) {
        // Yonma-yon tokenlar ("{a}{b}") bitta o'zgaruvchi — aks holda regex juda sekinlashadi
        if (!(i >= 2 && literals[i - 1] === '')) pattern += TOKEN_VALUE;
        pattern += escapeRe(literals[i]);
    }
    return new RegExp(`^${pattern}$`).test(theirs);
}

/**
 * Eskiz ro'yxatidan shablonimizga mos yozuvni tanlaydi:
 *  1) allaqachon tasdiqlangan mos matn (kabinetdan misol bilan tasdiqlatilgani ham) —
 *     unda qayta moderatsiyaga yuborish shart emas;
 *  2) aynan shu matn avval yuborilgan bo'lsa (moderatsiyada yoki rad etilgan) — o'sha.
 * Ro'yxat eskidan yangiga keladi — oxirgi yuborilgani ustuvor.
 */
export function pickEskizTemplate(templates: EskizTemplate[], ourText: string): EskizTemplate | null {
    const target = normalizeForMatch(toEskizTemplate(ourText));
    const same = (t: EskizTemplate) =>
        normalizeForMatch(t.original_text) === target || normalizeForMatch(t.template) === target;
    const covers = (t: EskizTemplate) =>
        same(t) || matchesTemplateShape(ourText, t.original_text) || matchesTemplateShape(ourText, t.template);
    const recent = [...templates].reverse();
    return recent.find(t => isApprovedStatus(t.status) && covers(t)) || recent.find(same) || null;
}
