// utils/staffPerms.ts va backend/staffPerms.ts bayt-bayt bir xil bo'lishi shart:
// interfeys tugmani ko'rsatib, server uni rad etmasin (yoki aksincha).
import fs from 'node:fs';
// Namoyish (Vercel) — faqat frontend yig'iladi, `backend/` yuborilmaydi (.vercelignore)
if (!fs.existsSync('backend/staffPerms.ts')) {
    console.log('ℹ️ backend/ yo\'q (faqat frontend yig\'ilmoqda) — katalog solishtirilmadi');
    process.exit(0);
}
const a = fs.readFileSync('utils/staffPerms.ts', 'utf8').replace(/\r\n/g, '\n');
const b = fs.readFileSync('backend/staffPerms.ts', 'utf8').replace(/\r\n/g, '\n');
if (a !== b) {
    console.error('❌ utils/staffPerms.ts va backend/staffPerms.ts farq qiladi. Tuzatish: cp utils/staffPerms.ts backend/staffPerms.ts');
    process.exit(1);
}
console.log('✅ Ruxsatlar katalogi ikki tomonda bir xil');
