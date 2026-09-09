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

/* Sinovlarning ko'pchiligi BITTA vaqtli jadvalni tekshiradi — shuning
   uchun `twiceDaily` bu yerda o'chirilgan. Ikki martalik jadval alohida
   bo'limda sinaladi. */
const CFG: BackupConfig = {
    enabled: true, hour: 23, minute: 30,
    twiceDaily: false, hour2: 13, minute2: 0,
    keepDaily: 14, keepMonthly: 12, extraDir: null,
};

/** Kuniga ikki marta: 13:00 va 23:30 */
const CFG2: BackupConfig = { ...CFG, twiceDaily: true };

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

    it('bugun BELGILANGAN VAQTDA olingan — takrorlamaydi', () => {
        const today = tashkentDateStr().replace(/-/g, '');
        expect(autoBackupDue(CFG, `${today}-233000`, at(23, 45))).toBe(false);
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

describe('Kuniga IKKI marta — har vaqt uchun alohida nusxa', () => {
    /* Ilgari qoida «bugun nusxa bormi» edi va ikkinchi vaqt kelganda ish
       o'tkazib yuborilardi: bugungi nusxa allaqachon bor. Endi hisob
       VAQT bo'yicha. */
    const stamp = (dayOffset: number, h: number, m: number) =>
        `${tashkentDateStr(dayOffset).replace(/-/g, '')}-${String(h).padStart(2, '0')}${String(m).padStart(2, '0')}00`;

    it('birinchi vaqt kelmagan — kutadi', () => {
        expect(autoBackupDue(CFG2, stamp(-1, 23, 30), at(9, 0))).toBe(false);
    });

    it('birinchi vaqt keldi — oladi', () => {
        expect(autoBackupDue(CFG2, stamp(-1, 23, 30), at(13, 5))).toBe(true);
    });

    it('birinchi vaqtda olingan, ikkinchisi hali kelmagan — kutadi', () => {
        expect(autoBackupDue(CFG2, stamp(0, 13, 0), at(18, 0))).toBe(false);
    });

    it("IKKINCHI vaqt keldi — bugun nusxa bo'lsa ham yana oladi", () => {
        expect(autoBackupDue(CFG2, stamp(0, 13, 0), at(23, 45))).toBe(true);
    });

    it('ikkinchi vaqtda ham olingan — takrorlamaydi', () => {
        expect(autoBackupDue(CFG2, stamp(0, 23, 30), at(23, 45))).toBe(false);
    });

    it('bitta vaqtli jadvalda ikkinchi nusxa OLINMAYDI', () => {
        expect(autoBackupDue(CFG, stamp(0, 13, 0), at(23, 45))).toBe(true);   // 23:30 keldi
        expect(autoBackupDue(CFG, stamp(0, 23, 30), at(23, 45))).toBe(false); // allaqachon olingan
    });
});

describe('Zaxira nusxalar HECH QACHON o\'chirilmaydi', () => {
    /* KLINIKA EGASINING QARORI (2026-09-09). Ilgari eskirganlari
       o'chirilardi: oxirgi 14 kunning hammasi, undan oldingi har oydan
       bittasi, izohlilari esa tegilmasdi.

       Endi hech biri o'chirilmaydi. Sabab: qaysi nusxa kerak bo'lishini
       oldindan bilib bo'lmaydi — xato bir oy o'tib sezilishi mumkin, va
       o'sha paytda aynan o'sha kunning nusxasi kerak bo'ladi.

       Sinov shuni qo'riqlaydi: kelajakda kimdir «joyni tejash» uchun
       tozalashni qaytarib qo'ysa, u shu yerda yiqiladi. */
    const dayFile = (i: number) => `xclinic-${tashkentDateStr(-i).replace(/-/g, '')}-233000.db`;

    function seedDir() {
        const dir = mkTmp('xclinic-ret-');
        const mk = (name: string, note?: string) => {
            fs.writeFileSync(path.join(dir, name), 'x');
            fs.writeFileSync(path.join(dir, name.replace(/\.db$/, '-uploads.zip')), 'z');
            if (note) fs.writeFileSync(path.join(dir, name.replace(/\.db$/, '.txt')), note);
        };
        for (let i = 0; i < 20; i++) mk(dayFile(i));
        for (let mo = 1; mo <= 15; mo++) {
            const d = new Date(Date.parse(`${tashkentDateStr()}T00:00:00Z`));
            d.setUTCMonth(d.getUTCMonth() - mo);
            const ds = d.toISOString().split('T')[0].replace(/-/g, '');
            mk(`xclinic-${ds}-100000.db`);
            mk(`xclinic-${ds}-200000.db`);
        }
        mk('xclinic-20240115-120000.db', 'migratsiyadan oldin');
        for (let i = 0; i < 6; i++) {
            fs.writeFileSync(path.join(dir, `pre-restore-2026-0${i + 1}-01T00-00-00-000Z.db`), 'p');
        }
        return dir;
    }

    it('bitta ham fayl o\'chmaydi', () => {
        const dir = seedDir();
        const before = fs.readdirSync(dir).sort();
        const { deleted } = applyRetention(dir, 14, 12);
        const after = fs.readdirSync(dir).sort();
        expect(deleted).toEqual([]);
        expect(after).toEqual(before);
    });

    it('eng eski oylik nusxa ham joyida qoladi', () => {
        const dir = seedDir();
        applyRetention(dir, 14, 12);
        const d = new Date(Date.parse(`${tashkentDateStr()}T00:00:00Z`));
        d.setUTCMonth(d.getUTCMonth() - 15);
        const ds = d.toISOString().split('T')[0].replace(/-/g, '');
        expect(fs.existsSync(path.join(dir, `xclinic-${ds}-100000.db`))).toBe(true);
        expect(fs.existsSync(path.join(dir, `xclinic-${ds}-200000.db`))).toBe(true);
    });

    it('tiklashdan oldingi nusxalar ham o\'chmaydi', () => {
        const dir = seedDir();
        applyRetention(dir, 14, 12);
        expect(fs.readdirSync(dir).filter((f) => f.startsWith('pre-restore-')).length).toBe(6);
    });

    it('izohli nusxa ham joyida', () => {
        const dir = seedDir();
        applyRetention(dir, 14, 12);
        expect(fs.existsSync(path.join(dir, 'xclinic-20240115-120000.db'))).toBe(true);
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
