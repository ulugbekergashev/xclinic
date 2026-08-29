# Sinovlar

```bash
cd backend
npm test          # birlik sinovlari (vitest) — serversiz, ~0.5 s
npm run test:api  # API sinovlari — serverni o'zi ko'taradi, ~1 daqiqa
npm run test:all  # ikkalasi
```

## Nima qayerda

| Papka | Nima | Server kerakmi |
|---|---|---|
| `tests/*.test.ts` | birlik sinovlari (vitest) | yo'q |
| `tests/api/` | uchidan-uchiga HTTP sinovlari | ha, `run-api.ts` o'zi ko'taradi |
| `tests/bench/` | o'lchov skriptlari (sinov emas) | ha |

## Uchta qoida

**1. Sinov ALOHIDA baza nusxasida yuritiladi.** `run-api.ts` `prisma/xclinic.db`
dan vaqtinchalik nusxa oladi va oxirida o'chiradi. Sinovlar bemor, to'lov va
hisob qatori yaratadi — ular ishlab turgan bazada qolmasligi kerak.

**2. `integrity` OXIRIDA yuritiladi.** U `paidAmount`, partiya qoldig'i va
bemor balansini ATAYLAB buzadi (tekshiruv ularni topishini isbotlash uchun) va
faqat balansni tuzatadi. Undan keyin yuritilgan har qanday sinov "bazada
buzilish bor" deb yiqiladi. Bu bir marta sodir bo'lgan va sababini topish
uchun yarim soat ketgan.

**3. Yiqilgan sinovni avval TEKSHIRING, keyin tuzating.** Bu ishda yiqilishlarning
yarmi sinovning o'zidagi xato bo'lib chiqqan (noto'g'ri kutilgan qiymat, bazada
allaqachon mavjud telefon raqami, oldingi sinovdan qolgan ma'lumot). Mahsulotni
"tuzatish"dan oldin yiqilish haqiqiyligiga ishonch hosil qiling.

## O'lchov skriptlari (`tests/bench/`)

Bular sinov emas — savolga javob beradigan o'lchovlar. Ular rejadagi ikkita
taxminni rad etgan:

| Skript | Nimani o'lchaydi | Natija |
|---|---|---|
| `scale.ts` | 3 yillik ma'lumot bilan kirishda qancha yuklanadi | 41 MB, 1.3 s — "dastur ochilmay qoladi" degan taxmin rad etildi |
| `readlat.ts` | yozuv paytida o'qish qancha kutadi | `connection_limit=1` o'qishni 14 barobar sekinlashtiradi — u qo'yilmadi |
| `locking.ts` | parallel tranzaksiyalar qulflanadimi | qulf xatosi 0 — "retry majburiy" degan tavsiya rad etildi |

```bash
cd backend
T_DB=<baza> npx ts-node --transpile-only tests/bench/scale.ts seed
npx ts-node --transpile-only tests/bench/locking.ts
```

## Nima sinaladi

| Fayl | Nimani himoya qiladi |
|---|---|
| `money.test.ts` | pul yaxlitlash va proportsional taqsimot — yig'indi har doim saqlanadi |
| `backup.test.ts` | zaxira jadvali, saqlash muddati, buzuq sozlama |
| `api/payments.ts` | to'lov atomarligi, poyga, rollback, fantom chek yo'qligi |
| `api/moneybugs.ts` | uchta topilgan pul bugi qaytib kelmasligi |
| `api/stock.ts` | FEFO, ombor invarianti, retsept "hammasi yoki hech biri" |
| `api/patients.ts` | qidiruv, takror bemor, birlashtirish |
| `api/events.ts` | hodisalar oqimi, smena poygasi |
| `api/integrity.ts` | yaxlitlik tekshiruvi soxta ogohlantirish bermasligi |
| `api/money.ts` | haqiqiy to'lovlarda kasrli pul paydo bo'lmasligi |
| `api/auth.ts` | standart parol, brute-force, masofaviy kirish |
| `api/restore.ts` | zaxiradan tiklash (ikki bosqichli, alohida yuritiladi) |

`auth.ts` va `restore.ts` `run-api.ts` ga kirmaydi — ular alohida shart talab
qiladi (`auth` standart parolli bazani, `restore` esa serverni to'xtatishni).
