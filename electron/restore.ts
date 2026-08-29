/* ─────────────────────────────────────────────────────────────────────────────
   XClinic — zaxiradan tiklash.

   Nima uchun ALOHIDA modul. Bu mantiq faqat `fs` va `path` ni ishlatadi,
   Electron API siga tegmaydi — ya'ni uni sinovdan o'tkazish mumkin. Ilgari u
   `main.ts` ichida yopiq turardi va tiklash yo'li HECH QACHON uchidan-uchiga
   sinalmagan edi (FIX-PLAN 7.2). Tiklanmagan nusxa — nusxa emas, umid.
   ───────────────────────────────────────────────────────────────────────────── */

import path from 'path';
import fs from 'fs';

/**
 * Belgilangan tiklashni qo'llaydi. Backend ishga tushishidan OLDIN chaqiriladi.
 *
 * Tartib muhim:
 *   1. joriy bazani yonma-yon saqlaymiz (noto'g'ri nusxa tanlangan bo'lsa qaytish yo'li);
 *   2. nusxani asosiy joyga qo'yamiz;
 *   3. uploads arxivi bo'lsa — fayllarni tiklaymiz;
 *   4. belgini o'chiramiz, aks holda har ishga tushishda takrorlanadi.
 *
 * Xatolik bo'lsa: belgi O'CHIRILADI va joriy baza tegilmagan holda qoladi —
 * cheksiz qayta urinish holatiga tushmaslik uchun.
 */
export function applyPendingRestore(userData: string, dbPath: string) {
    const marker = path.join(userData, 'restore-pending.json');
    if (!fs.existsSync(marker)) return;

    let file = '';
    try {
        file = String(JSON.parse(fs.readFileSync(marker, 'utf8')).file || '');
    } catch {
        console.error("[Restore] belgi fayli o'qilmadi — bekor qilinadi");
        try { fs.unlinkSync(marker); } catch { /* ignore */ }
        return;
    }

    // Nomni qat'iy tekshiramiz: belgi fayli orqali istalgan yo'lni ko'rsatib
    // bo'lmasligi kerak.
    if (!/^xclinic-\d{8}-\d{6}\.db$/.test(file)) {
        console.error("[Restore] nusxa nomi noto'g'ri:", file);
        try { fs.unlinkSync(marker); } catch { /* ignore */ }
        return;
    }

    const backupDir = path.join(userData, 'backups');
    const source = path.join(backupDir, file);
    if (!fs.existsSync(source)) {
        console.error('[Restore] nusxa topilmadi:', source);
        try { fs.unlinkSync(marker); } catch { /* ignore */ }
        return;
    }

    try {
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        if (fs.existsSync(dbPath)) {
            const aside = path.join(backupDir, `pre-restore-${stamp}.db`);
            fs.copyFileSync(dbPath, aside);

            /* WAL VA SHM HAM KO'CHIRILADI — busiz qaytish yo'li TO'LIQ EMAS.

               Baza WAL rejimida ishlaydi (7.0). Bu rejimda tasdiqlangan
               tranzaksiyalar darhol asosiy faylga tushmaydi — ular `-wal` da
               turadi va checkpoint da ko'chadi. Ya'ni faqat `.db` ni nusxalash
               oxirgi checkpoint dan keyingi HAMMA ishni tashlab ketadi.

               Bu 7.2 tiklash mashqida topilgan: nusxadan keyin qo'shilgan
               5 ta bemor `pre-restore` fayliga TUSHMAGAN edi, ya'ni noto'g'ri
               tiklashdan keyin qaytib olish uchun mo'ljallangan fayl aynan
               yo'qolgan ma'lumotni saqlamasdi.

               Uchtasi yonma-yon qo'yilsa SQLite ularni juftlik deb tanidi va
               `pre-restore-<stamp>.db` ni ochganda WAL o'zi qo'llanadi. */
            for (const suffix of ['-wal', '-shm']) {
                try {
                    if (fs.existsSync(dbPath + suffix)) {
                        fs.copyFileSync(dbPath + suffix, aside + suffix);
                    }
                } catch (e: any) {
                    console.error(`[Restore] ${suffix} ko'chirilmadi:`, e?.message || e);
                }
            }
            console.log('[Restore] joriy baza saqlandi:', path.basename(aside));
        }
        fs.copyFileSync(source, dbPath);
        // SQLite yordamchi fayllari eski bazadan qolib ketmasligi kerak
        for (const suffix of ['-wal', '-shm', '-journal']) {
            const extra = dbPath + suffix;
            try { if (fs.existsSync(extra)) fs.unlinkSync(extra); } catch { /* ignore */ }
        }
        console.log('[Restore] baza tiklandi:', file);

        const zip = path.join(backupDir, file.replace(/\.db$/, '-uploads.zip'));
        if (fs.existsSync(zip)) {
            try {
                const AdmZip = require('adm-zip');
                const uploadsDir = path.join(userData, 'uploads');
                if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
                new AdmZip(zip).extractAllTo(uploadsDir, true);
                console.log('[Restore] fayllar tiklandi');
            } catch (e: any) {
                console.error('[Restore] fayllar arxividan tiklanmadi:', e?.message || e);
            }
        }
    } catch (e: any) {
        console.error('[Restore] tiklash bajarilmadi:', e?.message || e);
    } finally {
        try { fs.unlinkSync(marker); } catch { /* ignore */ }
    }
}
