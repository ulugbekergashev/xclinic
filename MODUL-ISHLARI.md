# MODUL-ISHLARI — XClinic

Sana: 2026-08-28 (yangilandi). FIX-PLAN reliz bo'yicha yozilgan; bu hujjat
**shu ishlarni modul kesimida** ko'rsatadi.

**Holat: ochiq qolgan beshta ishdan to'rttasi bajarildi, bittasi rad etildi**
(sababi bilan). Tafsilot va o'lchovlar — FIX-PLAN, «RELIZ 12» bo'limi.

---

## Qisqa jadval

| Modul | Ish | Holat |
|---|---|---|
| Ombor | Ikki parallel jurnalni birlashtirish | ✅ **bajarildi** (migratsiya 0028) |
| Bemorlar | Karta to'liq tarixni ko'rsatishi | ✅ bajarildi (`?patientId=`) |
| Shifokorlar | Karta to'liq tarixni ko'rsatishi | ✅ bajarildi (`?doctorId=`) |
| Shifokorlar | `DoctorsAnalytics` — davr filtri bugi | ✅ tuzatildi (yo'l-yo'lakay topildi) |
| Platforma | Indekslar (10.5) | ✅ bajarildi (migratsiya 0029) |
| Kirish/Rollar | `SUPER_ADMIN`, `SALES_AGENT`, obuna konturi | ✅ bajarildi |
| Moliya | Pul turi `Float` → `Int` | ⛔ **qilinmaydi** — quyida |
| Moliya | `FinanceHub` ni serverga o'tkazish | ⛔ **kerak emas ekan** — quyida |
| DMED | Endpointlarni tasdiqlash | ⏸ hujjat kutilmoqda |

---

## Ikkita tuzatish — oldingi ro'yxatdagi xato

**1. Pul turini `Int` ga ko'chirish "qolgan ish" EMAS.** FIX-PLAN 11.1-B da u
allaqachon **o'lchov bilan rad etilgan**: ko'chirish ~20 jadvalni qayta
qurishni talab qiladi, migratsiya mexanizmi buni bajara olmaydi (`PRAGMA`
tranzaksiya ichida ishlamaydi), va yozish nuqtalari (`money.ts`) kafolatni
allaqachon beradi — bazadagi kasrli pul soni **0** (o'lchandi).

O'rniga arzon qo'riqchi turibdi: yaxlitlik tekshiruvidagi `money_precision`
9 ta pul ustunini skanerlaydi va kasr paydo bo'lsa darhol ko'rsatadi.

**Fikrni o'zgartiradigan narsa:** `money_precision` biror klinikada kasr
ko'rsatsa. Unda avval yozish nuqtasi tuzatiladi; ustun turi baribir oxirgi
chora.

**2. `FinanceHub` ni o'zgartirish kerak emas ekan.** U hech narsa
hisoblamaydi: proplarni `CashBook` va `FinanceReport` ga uzatadi, ular esa
o'z sana oralig'ini o'zi serverdan so'raydi. Ro'yxatdagi «propdan o'qiydi»
belgisi tekshirilmagan taxmin edi — kod ko'rilganda tasdiqlanmadi.

---

# Modullar

## 1. Bosh sahifa — ✅ ochiq ish yo'q

Raqamlar serverda sanaladi (`/api/reports/dashboard`).

**Ehtiyot.** Yangi raqam qo'shilsa u ham serverdan kelishi shart. Propdagi
45 kunlik ro'yxatdan sanalgan har qanday son — jimgina yolg'on.

## 2. Registratura va navbat — ✅ ochiq ish yo'q

## 3. Bemorlar — ✅ bajarildi

Karta endi bemorning **to'liq** tarixini ko'rsatadi: `/api/appointments` va
`/api/transactions` ga `?patientId=` qo'shildi, kesim sana bilan
chegaralanmaydi.

**Muhim tafsilot.** Server ro'yxati propni almashtirmaydi, **birlashtiradi**.
Eski to'lovlarda `patientId` bo'sh bo'lishi mumkin va ular bemorga ISM
bo'yicha bog'lanadi — almashtirsak, aynan o'sha eski qatorlar kartadan
yo'qolardi.

Material bo'limi ham o'zgardi: yozuv endi ombor bilan bir xil yo'ldan o'tadi
va «o'chirish» tugmasi «bekor qilish»ga almashdi (7-bo'limga qarang).

## 4. Kalendar — ✅ ochiq ish yo'q

## 5. Moliya — ✅ ochiq ish yo'q

Yuqoridagi ikkita tuzatishga qarang: pul turi rad etilgan, `FinanceHub` ga
o'zgartirish kerak emas.

**Saqlanadigan qoidalar.** Chek `ChargePayment` ga bog'langan bo'lsa —
o'chirish va summa/turini o'zgartirish **409**. Har qanday pul yozuvi bitta
tranzaksiyada.

## 6. Shifokorlar va ish haqi — ✅ bajarildi

**2026-09-09 dan boshlab bu modul alohida:** «Xodimlar» (`/staff`). Unda
to'rt rolning ro'yxati, xodim kartasi (oylik, bonus/jarima, ish grafigi,
davomat, stavkalar) va vedomost bor. Moliyadagi «Ulush» vkladkasi olib
tashlandi. Tafsilot — `PLAN-HR.md`.

Muhim qoida: vedomost shifokorga fix maoshni ham hisoblaydi, shuning
uchun xodim kartasi shifokorga asosiy oylikni to'lamaydi — faqat bonus.


Shifokor kartasi `?doctorId=` bilan to'liq tarixni oladi (qabullar, to'lovlar
va bemorlar).

**Yo'l-yo'lakay bug topildi va tuzatildi.** `DoctorsAnalytics` da `3 oy` /
`6 oy` / `yil` tanlanganda serverga **umuman chiqilmasdi** (so'rov
`customStartDate` ga qarardi, u esa bu tanlovlarda o'zgarmaydi), va to'lovlar
filtri serverdan kelgan ro'yxatni **umuman ishlatmasdi**. Ya'ni bu uch
tanlovda ekran 45 kunlik propdan sanardi — jimgina qisqargan son.

Davr chegarasi endi bitta joyda hisoblanadi va uchalasi — so'rov, yozuvlar
filtri, to'lovlar filtri — o'shandan foydalanadi.

## 7. Ombor — ✅ bajarildi (eng katta ish)

Ikki parallel jurnal birlashtirildi. Migratsiya `0028`:

- `StockMovement` ga `patientId` va `reversalOfId` ustunlari;
- eski `InventoryLog` ning **har qatori** harakatga ko'chirildi
  (`reason='Legacy'` — ular xizmat tannarxiga qo'shilmaydi);
- har mahsulot uchun qolgan farq bitta ochilish harakati bilan yopildi.

Kod tomonda:

| Nima | Holat |
|---|---|
| Bemor kartasidan material | endi oddiy chiqim: FEFO, partiya, harakat |
| `PUT /api/inventory/:id/stock` | **410** (yopilgan) |
| `DELETE /api/inventory/logs/:id` | **410** (yopilgan) |
| Chiqimni bekor qilish | `POST /api/stock-movements/:id/reverse` — teskari harakat, qator o'chirilmaydi |
| Sarf tahlili | harakatlardan o'qiydi (ilgari retsept va statsionar sarfini ko'rmasdi) |

**Yaxlitlik tekshiruvi kuchaydi.** «Ikki jurnal ishlatilgan» degan ma'lumot
bandi o'rniga ikkita haqiqiy tekshiruv: `item_movements` (har mahsulot:
qoldiq = harakatlar yig'indisi) va `inventory_legacy_writes` (eski jadvalga
yangi yozuv tushmayaptimi).

**Alohida sinov:** `npm run test:migration` — 14 ta tekshiruv. U ataylab 0028
gacha bo'lgan holatni yasaydi, chunki dev bazada eski jurnal bo'sh va usiz
migratsiya sinovi hech narsani isbotlamaydi.

## 8–11. Laboratoriya, Diagnostika, Qabul ish stoli, Statsionar — ✅ ochiq ish yo'q

Statsionar ombor ishi doirasida qayta sinaldi (dori berish → qoldiq → partiya
zanjiri): invariant buzilmadi.

## 12. Xabarlar, bot, avtomatlashtirish — ✅ ochiq ish yo'q

`POST /api/test/send-*` (6 ta qo'lda yuborish endpointi) **o'chirildi**: ular
barcha klinikalar bo'yicha SMS yuborardi va hech kimga ochilmagan edi.
Avtomatik jadval (cron) o'z ishini qilaveradi.

Kuzatuv: `botManager.ts` — 1060 qator. Yangi funksiya alohida faylga
chiqarilsin.

## 13. Lidlar — ✅ ochiq ish yo'q

Facebook integratsiyasining **sozlash** yarmi tiriltirildi: u
`SUPER_ADMIN` ga yopiq edi, ya'ni hech kim sozlay olmasdi. Endi klinika
egasiga ochiq.

## 14. Kirish, rollar, litsenziya — ✅ bajarildi

`SUPER_ADMIN` — 70 ta joydan **butunlay** olib tashlandi:

- rol ro'yxatlaridan — ruxsat **toraydi**;
- egalik istisnolaridan (`if (role === 'SUPER_ADMIN') return true`) —
  tekshiruv endi **har doim** ishlaydi;
- faqat shu rolga ochiq bo'lgan o'lik endpointlar — o'chirildi yoki
  qayta yo'naltirildi (FIX-PLAN 12.5 da har biri alohida asoslangan).

**`SALES_AGENT` ham ketdi** — bu shunchaki o'lik rol emas, **tirik kirish
yo'li** edi: login `SalesAgent` jadvalini ham tekshirardi. Yana bitta parol,
yana bitta hujum yuzasi. Bazada 0 qator.

**Tarif bo'yicha shifokor chegarasi olib tashlandi** — server, Sozlamalar
ekrani va «menejer bilan bog'laning» oynasi bilan birga.

**`SubscriptionPlan` jadvali bazada qoldi — ataylab.** `Clinic.planId`
majburiy tashqi kalit; uni yo'qotish `Clinic` ni qayta qurishni talab qiladi,
bu esa `migrations/README.md` da taqiqlangan. Ilova darajasida esa u endi
yo'q: endpoint yo'q, prop yo'q, ekranda ko'rinmaydi.

## 15. Sozlamalar va xizmat ko'rsatish — ✅ ochiq ish yo'q

Ombor istisnosi tekshiruvdan olib tashlandi (7-bo'lim).

## 16. AI — ✅ ochiq ish yo'q

`SUPER_ADMIN` roli `ai/tools.ts` va `ai/reports.ts` dan ham ketdi.

## 17. Platforma — ✅ bajarildi

**Indekslar (10.5).** `EXPLAIN QUERY PLAN` kutilmagan narsani ko'rsatdi:
sxemada 94 ta indeks bor, lekin **`Transaction` jadvalida bittasi ham yo'q
edi** — holbuki u eng katta jadval (110 010 qator, 41 MB) va kassa, bosh
sahifa, hisobotlar hammasi undan o'qiydi. Migratsiya `0029`: 7 ta indeks va
`ANALYZE`.

**`server.ts` ni bo'lish — ataylab qilinmaydi.** Qoida o'sha-o'sha: yangi kod
alohida faylga ketaveradi.

**Saqlanadigan sozlamalar:** `journal_mode = WAL`. `connection_limit=1` va
`synchronous=NORMAL` rad etilgan.

## 18. DMED — ⏸ muzlatilgan

`dmedService.ts:27` — auth endpointi tasdiqlanmagan. IT-MED dan rasmiy hujjat
kelmaguncha modul shu holida qoladi.

---

# Doimiy qoidalar

## Tarjima

Yangi ekran uchun majburiy: har `t()` kaliti ikkala tilda bormi — yakuniy
avtomatik tekshiruv. Ikki tuzoq: o'zbekcha apostrof (qo'sh tirnoq bilan
yozish) va skriptning partiyani o'tkazib yuborishi.

## Testlar

| Buyruq | Nima |
|---|---|
| `npm test` | hisob-kitoblar va zaxira nusxa (35) |
| `npm run test:migration` | 0028 migratsiyasi eski ma'lumot ustida (14) |
| `npm run test:api` | server ustida to'liq ssenariylar (153) |
| `npm run test:all` | uchalasi |

**Sinov nusxasi `VACUUM INTO` bilan olinadi**, `copyFileSync` bilan emas:
baza WAL rejimida va oddiy nusxa oxirgi yozuvlarni tushirib qoldiradi. Bu
amalda bir marta yuz bergan.

Yangi pul yoki ombor mantiqi qo'shilsa — unga test **majburiy**.

## Namoyish ma'lumoti

```
cd backend && npm run seed:demo     # server ishlab turishi shart
```

`seed.ts` faqat spravochniklarni yaratadi, ya'ni yangi o'rnatmada dastur
bo'sh ko'rinadi. `demoSeed.ts` esa har bir modulni ishlayotgan holatda
to'ldiradi: xodimlar, 60 bemor, ~230 tashrif, to'lovlar va qarzlar, bugungi
navbat (kutmoqda / chaqirilgan / qabulda / natija kutmoqda / yakunlangan),
laboratoriya natijalari, diagnostika, statsionar, ombor partiyalari,
xarajatlar, smena yopilishi, bo'lib to'lash, lidlar va ish haqi vedomosti.

**Hammasi HTTP orqali, xuddi foydalanuvchi kabi.** Bazaga to'g'ridan-to'g'ri
yozilsa ma'lumot chiroyli ko'rinardi, lekin FEFO, proporsional taqsimot va
"qoldiq = harakatlar yig'indisi" qoidalari chetlab o'tilardi — skript oxirida
yaxlitlik tekshiruvi ishlaydi va u **0 buzilish** ko'rsatishi shart.

Skript qoidalarni chetlab o'tmaydi: tahlil natijasini kiritishdan oldin
hisobni to'laydi, bemorni chiqarishdan oldin qarzini yopadi — chunki server
aynan shuni talab qiladi.

## Priyomka

Har ish yopilishidan oldin ssenariylar haqiqiy ma'lumot bilan boshidan
oxirigacha o'tkaziladi va natija BUILD-SPEC ga yoziladi.

## denta7

XClinic dagi hech qanday ish denta7 ning kodi, bazasi yoki hisoblariga
ta'sir qilmasligi shart.

---

# Keyingi ishlar uchun ro'yxat

Ochiq P0/P1 ish qolmadi. Kelgusida qaralishi mumkin bo'lganlar:

| Nima | Ustuvorlik | Izoh |
|---|---|---|
| DMED | — | hujjat kelganda |
| `SubscriptionPlan` jadvalini bazadan chiqarish | P3 | `Clinic` ni qayta qurish kerak — narxi foydasidan yuqori |
| `botManager.ts` (1060 qator) ni bo'lish | P3 | faqat yangi funksiya qo'shilganda |
| Segment/trigger mantiqi besh faylga tarqalgan | P3 | ishlayapti, tegilmaydi |
| Pul turi `Int` | — | `money_precision` kasr ko'rsatsagina |
