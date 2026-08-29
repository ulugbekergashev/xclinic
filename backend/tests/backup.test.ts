import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { autoBackupDue, applyRetention, readBackupConfig, writeBackupConfig, BackupConfig } from '../maintenance';
import { tashkentDateStr } from '../tashkentTime';

/* ─────────────────────────────────────────────────────────────────────────────
   Zaxira nusxa mantig'i.

   Nima uchun sinaladi: bu yerdagi xato JIMGINA yo'qotadi. Nusxa olinmagani
   yoki keraklisi o'chirib yuborilgani faqat tiklash kerak bo'lganda —
   ya'ni eng yomon paytda — bilinadi.
   ───────────────────────────────────────────────────────────────────────────── */

const CFG: BackupConfig = {
    enabled: true, hour: 23, minute: 30, keepDaily: 14, keepMonthly: 12, extraDir: null,
};

/** Toshkent bo'yicha berilgan soatdagi "hozir" */
const at = (h: number, m: number) =>
    Date.parse(`${tashkentDateStr()}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00.000Z`);

const tmpDirs: string[] = [];
const mkTmp = (prefix: string) => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    tmpDirs.push(d);
    return d;
};
afterEach(() => {
    while (tmpDirs.length) {
        try { fs.rmSync(tmpDirs.pop()!, { recursive: true, force: true }); } catch { /* ignore */ }
    }
});

describe('autoBackupDue — kuniga bitta, quvib yetish bilan', () => {
    it('o\'chirilgan bo\'lsa hech qachon', () => {
        expect(autoBackupDue({ ...CFG, enabled: false }, null)).toBe(false);
    });

    it('umuman nusxa yo\'q — darhol', () => {
        expect(autoBackupDue(CFG, null, at(9, 0))).toBe(true);
    });

    it('bugun olingan — takrorlamaydi', () => {
        expect(autoBackupDue(CFG, tashkentDateStr(), at(23, 45))).toBe(false);
    });

    it('kecha olingan, belgilangan soat kelmagan — kutadi', () => {
        expect(autoBackupDue(CFG, tashkentDateStr(-1), at(9, 0))).toBe(false);
    });

    it('kecha olingan, soat keldi — oladi', () => {
        expect(autoBackupDue(CFG, tashkentDateStr(-1), at(23, 30))).toBe(true);
    });

    /* Eng muhim holat: kompyuter kechqurun o'chadi va 23:30 hech qachon
       kelmaydi. Quvib yetish bo'lmasa nusxa UMUMAN olinmasdi. */
    it('kun(lar) o\'tkazib yuborilgan — soatni kutmasdan DARHOL', () => {
        expect(autoBackupDue(CFG, tashkentDateStr(-2), at(9, 0))).toBe(true);
        expect(autoBackupDue(CFG, tashkentDateStr(-10), at(0, 5))).toBe(true);
    });

    it('erta soat sozlamasi (17:45) hurmat qilinadi', () => {
        const early = { ...CFG, hour: 17, minute: 45 };
        expect(autoBackupDue(early, tashkentDateStr(-1), at(17, 0))).toBe(false);
        expect(autoBackupDue(early, tashkentDateStr(-1), at(18, 0))).toBe(true);
    });
});

describe('applyRetention — kerakli nusxa o\'chib ketmasin', () => {
    const dayFile = (i: number) => `xclinic-${tashkentDateStr(-i).replace(/-/g, '')}-233000.db`;

    function seedDir() {
        const dir = mkTmp('xclinic-ret-');
        const mk = (name: string, note?: string) => {
            fs.writeFileSync(path.join(dir, name), 'x');
            fs.writeFileSync(path.join(dir, name.replace(/\.db$/, '-uploads.zip')), 'z');
            if (note) fs.writeFileSync(path.join(dir, name.replace(/\.db$/, '.txt')), note);
        };
        for (let i = 0; i < 20; i++) mk(dayFile(i));
        // Eski oylar: har oydan ikkitadan
        for (let mo = 1; mo <= 15; mo++) {
            const d = new Date(Date.parse(`${tashkentDateStr()}T00:00:00Z`));
            d.setUTCMonth(d.getUTCMonth() - mo);
            const ds = d.toISOString().split('T')[0].replace(/-/g, '');
            mk(`xclinic-${ds}-100000.db`);
            mk(`xclinic-${ds}-200000.db`);
        }
        mk('xclinic-20240115-120000.db', 'migratsiyadan oldin');   // izohli
        for (let i = 0; i < 6; i++) {
            fs.writeFileSync(path.join(dir, `pre-restore-2026-0${i + 1}-01T00-00-00-000Z.db`), 'p');
        }
        return dir;
    }

    it('oxirgi 14 kunning hammasi qoladi', () => {
        const dir = seedDir();
        applyRetention(dir, 14, 12);
        for (let i = 0; i < 14; i++) {
            expect(fs.existsSync(path.join(dir, dayFile(i)))).toBe(true);
        }
    });

    /* IZOHLI nusxa qo'lda, ataylab olingan ("migratsiyadan oldin") —
       ya'ni aynan saqlash uchun. Uni avtomatik o'chirish mumkin emas. */
    it('izohli nusxa hech qachon o\'chirilmaydi', () => {
        const dir = seedDir();
        applyRetention(dir, 14, 12);
        expect(fs.existsSync(path.join(dir, 'xclinic-20240115-120000.db'))).toBe(true);
    });

    it('eng yangi nusxa har qanday holatda qoladi', () => {
        const dir = seedDir();
        applyRetention(dir, 14, 12);
        expect(fs.existsSync(path.join(dir, dayFile(0)))).toBe(true);
    });

    it('har eski oydan aynan bittadan qoladi', () => {
        const dir = seedDir();
        applyRetention(dir, 14, 12);
        const byMonth = new Map<string, number>();
        for (const f of fs.readdirSync(dir).filter((x) => /^xclinic-\d{8}-\d{6}\.db$/.test(x))) {
            const m = /^xclinic-(\d{6})/.exec(f)![1];
            byMonth.set(m, (byMonth.get(m) || 0) + 1);
        }
        const cur = tashkentDateStr().slice(0, 7).replace('-', '');
        const prev = tashkentDateStr(-14).slice(0, 7).replace('-', '');
        for (const [month, n] of byMonth) {
            if (month === cur || month === prev || month === '202401') continue;
            expect(n).toBe(1);
        }
    });

    it('o\'chirilgan nusxaning zip arxivi ham o\'chadi (yetim qolmaydi)', () => {
        const dir = seedDir();
        applyRetention(dir, 14, 12);
        const orphans = fs.readdirSync(dir)
            .filter((f) => f.endsWith('-uploads.zip'))
            .filter((z) => !fs.existsSync(path.join(dir, z.replace('-uploads.zip', '.db'))));
        expect(orphans).toEqual([]);
    });

    it('pre-restore fayllardan eng yangi 3 tasi qoladi', () => {
        const dir = seedDir();
        applyRetention(dir, 14, 12);
        expect(fs.readdirSync(dir).filter((f) => /^pre-restore-/.test(f))).toHaveLength(3);
    });

    it('takroriy chaqiruv hech narsa o\'chirmaydi (idempotent)', () => {
        const dir = seedDir();
        applyRetention(dir, 14, 12);
        expect(applyRetention(dir, 14, 12).deleted).toEqual([]);
    });

    it('yagona nusxa o\'chirilmaydi', () => {
        const dir = mkTmp('xclinic-ret1-');
        fs.writeFileSync(path.join(dir, 'xclinic-20200101-120000.db'), 'x');
        expect(applyRetention(dir, 14, 12).deleted).toEqual([]);
        expect(fs.existsSync(path.join(dir, 'xclinic-20200101-120000.db'))).toBe(true);
    });
});

describe('backup-config — buzuq sozlama dasturni to\'xtatmasin', () => {
    it('fayl yo\'q — sukut sozlama', () => {
        const d = mkTmp('xclinic-cfg-');
        const c = readBackupConfig(d);
        expect(c.enabled).toBe(true);
        expect(c.hour).toBe(23);
        expect(c.keepDaily).toBe(14);
    });

    it('chegaradan tashqari qiymatlar cheklanadi', () => {
        const d = mkTmp('xclinic-cfg-');
        writeBackupConfig(d, { ...CFG, hour: 99, minute: -5, keepDaily: 1, keepMonthly: 999 } as any);
        const c = readBackupConfig(d);
        expect(c.hour).toBe(23);
        // Chegaraga SIQILADI, sukutga qaytmaydi: -5 → 0, 99 → 23
        expect(c.minute).toBe(0);
        expect(c.keepDaily).toBe(2);    // kamida 2: bitta nusxa qolishi xavfli
        expect(c.keepMonthly).toBe(120);
    });

    it('bo\'sh ikkinchi manzil null ga aylanadi', () => {
        const d = mkTmp('xclinic-cfg-');
        writeBackupConfig(d, { ...CFG, extraDir: '   ' } as any);
        expect(readBackupConfig(d).extraDir).toBeNull();
    });

    it('buzuq JSON xato tashlamaydi', () => {
        const d = mkTmp('xclinic-cfg-');
        fs.writeFileSync(path.join(d, 'backup-config.json'), '{buzuq');
        expect(readBackupConfig(d).hour).toBe(23);
    });
});
