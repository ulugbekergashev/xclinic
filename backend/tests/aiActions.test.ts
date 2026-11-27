/* AI amal tokeni va g'ayrioddiy kun qoidasi — sof qismlar (2026-11-27) */
import { describe, it, expect } from 'vitest';
import { signAction, consumeAction, ACTION_DEFS, actionToolsForRole } from '../ai/actions';
import { detectAnomalies, DayPoint } from '../ownerBot';

const act = { kind: 'send_reminder', summary: 's', request: { method: 'POST' as const, path: '/api/appointments/abc-1/remind' } };

describe('AI amal tokeni', () => {
    it('to\'g\'ri token bir marta ishlaydi', () => {
        const t = signAction(act, 'CLINIC_ADMIN:1', 'c1', 'k', 1_000);
        expect(consumeAction(t, 'CLINIC_ADMIN:1', 'c1', 'k', 2_000, 0)).toMatchObject({ kind: 'send_reminder' });
        expect(consumeAction(t, 'CLINIC_ADMIN:1', 'c1', 'k', 2_000, 0)).toMatch(/allaqachon/);
    });
    it('boshqa foydalanuvchi, klinika, kalit, muddat — rad', () => {
        const t = () => signAction(act, 'CLINIC_ADMIN:1', 'c1', 'k', 5_000);
        expect(consumeAction(t(), 'RECEPTIONIST:2', 'c1', 'k', 6_000, 0)).toMatch(/boshqa/);
        expect(consumeAction(t(), 'CLINIC_ADMIN:1', 'c2', 'k', 6_000, 0)).toMatch(/boshqa/);
        expect(consumeAction(t(), 'CLINIC_ADMIN:1', 'c1', 'x', 6_000, 0)).toMatch(/noto'g'ri/);
        expect(consumeAction(t(), 'CLINIC_ADMIN:1', 'c1', 'k', 5_000 + 11 * 60_000, 0)).toMatch(/muddati/);
    });
    it("tana o'zgartirilsa imzo buziladi", () => {
        const t = signAction(act, 'A:1', 'c1', 'k', 1);
        const [body, sig] = t.split('.');
        const evil = Buffer.from(Buffer.from(body, 'base64url').toString().replace('remind', 'xx')).toString('base64url');
        expect(consumeAction(`${evil}.${sig}`, 'A:1', 'c1', 'k', 2, 0)).toMatch(/noto'g'ri/);
    });
    it('dastur qayta ishga tushgandan oldingi token — rad (bir martalik kafolat)', () => {
        const t = signAction(act, 'A:1', 'c1', 'k', 1_000);
        expect(consumeAction(t, 'A:1', 'c1', 'k', 2_000, 1_500)).toMatch(/eskirgan/);
    });
    it("faqat ma'lum manzillar", () => {
        const bad = { ...act, request: { method: 'PUT' as const, path: '/api/clinics/c1/settings' } };
        expect(consumeAction(signAction(bad, 'A:1', 'c1', 'k', 1), 'A:1', 'c1', 'k', 2, 0)).toMatch(/Noma'lum/);
    });
    it('rollar: shifokor va laborantga amal yo\'q, xarajat faqat egaga', () => {
        expect(actionToolsForRole('DOCTOR')).toHaveLength(0);
        expect(actionToolsForRole('LAB_TECHNICIAN')).toHaveLength(0);
        expect(actionToolsForRole('RECEPTIONIST').map(t => t.function.name)).not.toContain('create_expense');
        expect(actionToolsForRole('CLINIC_ADMIN')).toHaveLength(ACTION_DEFS.length);
    });
});

describe("g'ayrioddiy kun", () => {
    const normal = (n: number): DayPoint[] => Array.from({ length: n }, (_, i) => ({ revenue: 2_000_000 + (i % 5) * 100_000, visits: 20 + (i % 3), noShow: i % 2 }));
    it("ma'lumot kam — jim", () => {
        expect(detectAnomalies({ revenue: 0, visits: 1, noShow: 9 }, normal(5))).toEqual([]);
    });
    it('oddiy kun — jim', () => {
        expect(detectAnomalies({ revenue: 2_100_000, visits: 21, noShow: 1 }, normal(30))).toEqual([]);
    });
    it('tushum va qabul keskin past — ikkala satr', () => {
        const out = detectAnomalies({ revenue: 300_000, visits: 4, noShow: 0 }, normal(30));
        expect(out.join('\n')).toMatch(/Tushum/);
        expect(out.join('\n')).toMatch(/Qabullar/);
    });
    it("kelmaganlar ko'p", () => {
        expect(detectAnomalies({ revenue: 2_100_000, visits: 21, noShow: 7 }, normal(30)).join()).toMatch(/Kelmaganlar/);
    });
    it('yopiq kunlar (nol) o\'rtachani tushirmaydi', () => {
        const hist = [...normal(20), ...Array.from({ length: 10 }, () => ({ revenue: 0, visits: 0, noShow: 0 }))];
        expect(detectAnomalies({ revenue: 2_100_000, visits: 21, noShow: 0 }, hist)).toEqual([]);
    });
});
