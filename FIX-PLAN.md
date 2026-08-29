# FIX-PLAN — XClinic

Relizlar 7–11. Bu hujjat GAP-ANALYSIS va BUILD-SPEC ning davomi:
GAP-ANALYSIS muammolarni topdi, BUILD-SPEC 1–6 relizlarni qurdi, bu yerda
**topilgan, lekin hali yopilmagan** kamchiliklar reja bo'lib yoziladi.

Sana: 2026-08-24. Bazaviy holat: 33 kommit, 64 model, 27 migratsiya (0002–0027).

---

## Bajarilgan ishlar jurnali

| Band | Holat | Izoh |
|---|---|---|
| **7.0 SQLite poydevori** | ✅ **bajarildi** | rejaga keyin qo'shildi, quyida |
| 7.1 Avtomatik zaxira nusxa | ✅ **bajarildi** | quyida |
| 7.2 Tiklashni sinash | ✅ **bajarildi** | quyida — REGRESSIYA TOPDI |
| 7.3 Pul oqimi tranzaksiyasi | ✅ **bajarildi** | quyida |
| 7.4 Ombor atomarligi | ✅ **bajarildi** | quyida |
| 7.5 Yaxlitlik tekshiruvi | ✅ **bajarildi** | quyida |
| 7.6 Kirish xavfsizligi | ✅ **bajarildi** | quyida |
| **7.7 Mavjud pul buglari** | ✅ **bajarildi** | quyida — 7.3 dan oldin qilindi |

### 7.0 — SQLite poydevori (rejaga keyin qo'shildi, bajarildi 2026-08-24)

**Nega qo'shildi.** 7.3/7.4 loyihadagi **birinchi interaktiv tranzaksiyalarni**
kiritadi. Ulardan oldin bazaning o'zi qanday rejimda ishlayotganini o'lchash
kerak edi — aks holda tranzaksiyaga o'rash ahvolni yaxshilash o'rniga
yomonlashtirishi mumkin.

**O'lchandi.** `journal_mode = delete` (WAL emas), `connection_limit`
sozlanmagan, `trust proxy` yo'q, `foreign_keys = 1`.

**Ikki o'lchov o'tkazildi va ikkalasi ham dastlabki taxminni RAD ETDI.**

*O'lchov 1 — 12 ta parallel interaktiv tranzaksiya (`backend/_t_locking.ts`):*

| Sozlama | Qulf xatolari | Yo'qolgan yangilanish |
|---|---|---|
| `connection_limit` sozlanmagan | **0** | **0** |
| `connection_limit=1` | 0 | 0 |

Ya'ni "SQLite qulflanib qoladi" degan qo'rquv **asossiz** — Prisma SQLite
so'rovlarini o'zi ketma-ketlashtirar ekan.

*O'lchov 2 — 300 ms lik yozuv paytida 6 ta o'qish (`backend/_t_readlat.ts`):*

| Sozlama | Eng yomon o'qish kechikishi |
|---|---|
| rollback-journal, limitsiz | 13–14 ms |
| **WAL, limitsiz** | **10–18 ms** ← tanlandi |
| WAL + `connection_limit=1` | **253–269 ms** ← 14 barobar yomon |

**Qaror.** Faqat **WAL** yoqiladi. Uchta sozlama ko'rib chiqilib rad etildi:

- `connection_limit=1` — **rad etildi**: o'qishni yozuv ortida navbatga qo'yadi.
  Klinikada bu shifokorning ro'yxati kassirning har to'lovida qotib qolishini
  bildiradi.
- `synchronous = NORMAL` — **rad etildi**: tezroq, lekin tok o'chganda oxirgi
  tranzaksiyalar yo'qolishi mumkin. Klinikada UPS bo'lmaydi.
- `busy_timeout`, `foreign_keys` — **qo'yilmaydi**: ular ULANISHGA tegishli,
  havzada esa bir nechta ulanish bor — ishga tushishda qo'yilgani faqat
  bittasiga tegadi, ya'ni yolg'on kafolat bo'lardi.

`journal_mode` esa baza **fayliga** yoziladi va hamma ulanishga, hamma keyingi
ishga tushishga amal qiladi — shuning uchun u yagona ishonchli sozlama.

**Tekshirildi.** Server WAL bilan ko'tarildi (`journal_mode=wal`,
`.db-wal`/`.db-shm` yaratildi). WAL rejimida olingan zaxira nusxa manbaga aynan
mos: 64 jadval, 285 qator, `integrity_check: ok`.

### 7.7 — Mavjud pul buglari (bajarildi 2026-08-24)

**Qanday tuzatildi.**

| Bug | Yechim |
|---|---|
| A — chekni o'chirish | `ChargePayment` bog'langan chek uchun **409** (`DELETE /api/transactions/:id`). Bog'lanmagan chek uchun balansni qaytarish va o'chirish endi **bitta tranzaksiyada**, xatosi yutilmaydi |
| A2 — chekni tahrirlash | Bog'langan chekda `amount`/`type`/`status`/`patientId` — **409**; `date` ni tuzatishga ruxsat (qonuniy ehtiyoj) |
| A3 — interfeys | `GET /api/transactions` endi `linkedToCharges` bayrog'ini qaytaradi; Kassa ekranida «Tuzatish» va «O'chirish» tugmalari bunday chekda **o'chiq**, sababi tooltipda |
| B — qayta hisoblash | Uchinchi qoida qo'shildi: avansga qaytarish (`CashMovement type='Refund', method='Balance', transactionId != null`). Endpoint endi **sukut bo'yicha quruq yuritadi** — farqni ko'rsatadi, yozish uchun `confirm: true` kerak. Faqat klinika egasiga |
| C — bo'lib to'lash | `paymentMethod='Balance'` bo'lsa avans yetarliligi tekshiriladi va balansdan yechiladi. Beshta yozuv bitta tranzaksiyada |

**Tekshirildi** (`backend/_t_moneybugs.ts`, haqiqiy server, HTTP orqali, alohida
baza nusxasida): **24 sinov, hammasi o'tdi.** Jumladan:

- avansdan to'langan chekni **3 marta** o'chirishga urinish — balans o'zgarmadi
  (eski kodda har bosishda oshardi);
- summani o'zgartirish 409, sanani tuzatish 200;
- bog'lanmagan avans cheki o'chdi va balans to'g'ri qaytarildi;
- avansga qaytarilgandan keyin qayta hisoblash **farq ko'rsatmadi**;
- bo'lib to'lashda avansdan to'lov balansni kamaytirdi.

**A bugining mexanizmi to'g'ridan-to'g'ri isbotlandi.** Bazada `ChargePayment`
qatorlari bor chekni o'chirishga urinish:
`SQLITE_CONSTRAINT_FOREIGNKEY — FOREIGN KEY constraint failed`. Eski kod aynan
shu yerda 500 berardi, balans esa undan oldin allaqachon o'zgargan bo'lardi.
Sinovda ishlatilgan chek — dev bazadagi **haqiqiy** yozuv (Card, 45 000, 2 ta
bog'langan qator), ya'ni bug ishlaydigan ma'lumotda ham yetib boradigan edi.

### 7.7 — muammolarning tavsifi

Reliz 7 spetsifikatsiyasini adversarial tekshirish paytida **atomarlikka
aloqasi bo'lmagan, hozir tirik uchta bug** topildi. Ikkitasi kodni o'qib
tasdiqlandi. Bular 7.3 dan oldin yopilishi kerak, chunki tranzaksiya ularni
tuzatmaydi — faqat muhrlab qo'yadi.

**A. Chekni o'chirish bemor balansini SHISHIRADI — tasdiqlandi.**

`DELETE /api/transactions/:id` (`backend/server.ts:2446-2467`) avval balansni
qaytaradi (2455-2464, xatosi `.catch` bilan yutiladi), keyin chekni o'chiradi
(2467). `ChargePayment.transactionId` majburiy FK (`schema.prisma:1340, 1350`)
va `foreign_keys = 1` (o'lchandi) — ya'ni `POST /api/payments` yaratgan chek
uchun `delete` **FK xatosi bilan yiqiladi**. Lekin balans allaqachon
o'zgargan.

Natija: avansdan to'langan chekda («Kassa» ekranida «O'chirish» tugmasi —
`pages/CashBook.tsx:1316`) tugma bosilganda balans **oshadi**, chek esa
o'chmaydi. Har bosishda yana oshadi. Bu tekin pul.

**B. `recalculate-balances` qaytarilgan avanslarni O'CHIRIB TASHLAYDI — tasdiqlandi.**

`POST /api/admin/recalculate-balances` (`server.ts:3184-3216`) balansni faqat
ikki qoida bo'yicha qayta hisoblaydi: `service === 'Avans'` (+) va
`type === 'Balance'` (−). Avansga qaytarish esa (`billing.ts:568, 589-594`)
`type: 'Refund'` li chek yaratadi — bu qoidalarga **tushmaydi**.

Ya'ni bu endpointni bir marta chaqirish bemorlarga qaytarilgan **barcha**
avansni nolga tushiradi. Interfeysdan chaqirilmaydi (tekshirildi), lekin
autentifikatsiyalangan har qanday foydalanuvchi uchun ochiq.

**C. Bo'lib to'lashda `Balance` cheki balansni kamaytirmaydi.**

`POST /api/installments/:id/pay` (`server.ts:3117-3165`) chekni
`type: paymentMethod` bilan yozadi (3154), lekin balans mantiqi yo'q. Kassir
«avansdan» tanlasa, chek `type:'Balance'` bo'ladi, balans esa kamaymaydi —
keyin (B) dagi qayta hisoblash uni kamaytiradi. Ikki endpoint bir xil
ma'lumotni qarama-qarshi talqin qiladi.

### 7.3 — Pul oqimi tranzaksiyasi (bajarildi 2026-08-24)

**Asosiy qaror: qatorlar IKKI MARTA o'qiladi.** Birinchi o'qish — faqat
o'zgarish aniqlash uchun ("barmoq izi"), ikkinchisi tranzaksiya ichida va
**hamma hisob-kitob aynan o'shandan quriladi**.

Nima uchun sodda "tranzaksiya ichida qayta o'qish" yetarli emasligi
tekshiruvda aniqlandi: to'lov summasi (`received`, `methodSplit`) tashqi
o'qishga tayanadi, ichki o'qish esa qatorni topmasligi mumkin — u holda chek
yaratilib, `ChargePayment` yaratilmasdi va kassada **uydirma chek** paydo
bo'lardi. Hozirgi kodda bunday holat yo'q edi, ya'ni sodda tuzatish ahvolni
yomonlashtirardi. Endi holat o'zgargan bo'lsa umuman to'lanmaydi — **409**,
kassir ro'yxatni yangilaydi.

| O'zgarish | Qayerda |
|---|---|
| `HttpError` + `route()` da xato xaritasi | tranzaksiya ichidan `res.json()` qaytarib bo'lmaydi — xato tashlash rollback ning yagona to'g'ri usuli |
| `POST /api/payments` butunlay tranzaksiyada | barmoq izi mos kelmasa 409; `first`, `serviceLabel`, `plan`, `due` — hammasi ichki o'qishdan |
| `POST /api/charges/:id/refund` tranzaksiyada | qator ham ichkarida o'qiladi: parallel ikki qaytarish to'langanidan ko'p chiqara olmaydi |
| `PUT /api/charges/:id/discount` shartli yozuv | `status` + `paidAmount` o'zgarmagan bo'lsa yoziladi, aks holda 409 |
| `DELETE /api/charges/:id` shartli yozuv | `status: { not: 'Paid' }` — **idempotentlik saqlandi**: ikki marta bosish baribir 200 |
| Kassa jurnali tranzaksiyadan tashqarida | commit dan keyin: jurnal to'lovni to'xtatmaydi va faqat haqiqatan bo'lgan to'lov uchun yoziladi |

**Tekshirildi** (`backend/_t_payments.ts`, haqiqiy server): **26 sinov, hammasi
o'tdi.** Eng muhimlari:

- **Poyga:** ikki kassir bir vaqtda bitta qatorni to'laydi → bittasi 200,
  ikkinchisi rad etildi, `paidAmount` aynan 100 000, kassada **aynan bitta
  chek** (fantom chek yo'q);
- **Rollback:** avans yetmaganda qator to'lanmagan qoldi va **chek umuman
  yaratilmadi**;
- Ko'p usulli to'lov (naqd + karta) atomar, ikkita chek;
- Qaytarish atomar; ortiqcha qaytarishda hech narsa yozilmadi;
- Bekor qilishda ikki marta bosish baribir 200 (mavjud xatti-harakat buzilmadi);
- **Yaxlitlik:** hamma qatorda `SUM(ChargePayment) == paidAmount`.

**Regressiya yo'q:** 7.7 ning 24 sinovi va 7.1 ning 27 birlik sinovi shu
o'zgarishlardan keyin ham to'liq o'tadi. Jami **77 sinov**.

### 7.4 — Ombor atomarligi (bajarildi 2026-08-24)

**Asosiy qaror: `writeOffCore(db, …)` ajratildi.** U tranzaksiya **ochmaydi** —
uni chaqiruvchi ochadi. Shunda retsept bo'yicha bir necha modda chiqarilganda
hammasi **bitta** tranzaksiyaga tushadi.

| O'zgarish | Nima beradi |
|---|---|
| `writeOffCore(db, …)` + `writeOff(prisma, …)` | o'zak qayta ishlatiladi; tashqi chaqiruvchilar uchun o'ram o'z tranzaksiyasini ochadi |
| `applyServiceRecipe` — **bitta** tranzaksiya | ilgari har modda alohida edi: uchinchisida xato bo'lsa birinchi ikkitasi ombordan yechilgan holda qolardi |
| Kirim (`/stock-movements/in`) tranzaksiyada | partiya + harakat + qoldiq birga |
| Inventarizatsiya — qoldiq **tranzaksiya ichida** o'qiladi | ilgari tashqarida o'qilardi va oraliqdagi chiqimni **o'chirib** tashlardi |
| `withRetry` — vaqtinchalik xatolarda 3 urinish | chiqim yo'qolmasin |

**Nima uchun `writeOffCore` Prisma ning avtoaniqlashiga tayanmaydi.** Yagona
ichki chaqiruvchi — `applyServiceRecipe`, u ham shu faylda. `tx` ni aniq
uzatish Prisma versiyasiga bog'liqlikni ham, "xato bilan root prisma ga yozib
yuborish" xato sinfini ham butunlay yo'q qiladi.

**Tekshirildi** (`backend/_t_stock.ts`, haqiqiy server): **20 sinov, hammasi
o'tdi.** Hal qiluvchisi — **rollback sinovi**: retsept qatorining ikkinchisi
buzilgan (mavjud bo'lmagan modda), natijada:

- **birinchi modda ham tegilmadi** — eski kodda u allaqachon ombordan
  yechilgan bo'lardi va qoldiq yolg'on bo'lib qolardi;
- xizmat baribir qabulga qo'shildi — tibbiy yozuv ombor xatosi tufayli
  yo'qolmaydi (bu qaror ataylab saqlandi);
- xato server jurnaliga tushdi.

Yana: FEFO tartibi (eng yaqin muddatli partiyadan), 10 ta parallel chiqim,
inventarizatsiya + chiqim poygasi — hamma holatda **`qoldiq = harakatlar
yig'indisi`** invarianti saqlandi.

> **O'lchov tavsiyani rad etdi (ikkinchi marta).** Tekshiruv "retry MAJBURIY,
> ixtiyoriy emas" degan edi — sababi qulf to'qnashuvi qo'rquvi. Sinovda
> **qayta urinish bironta ham ishga tushmadi** (`qayta urinilmoqda` jurnalda
> 0 marta), bu 7.0 dagi o'lchov bilan mos. Retry baribir qoldirildi, lekin
> boshqa sabab bilan: chiqimning ikki chaqiruvchisi xatoni ataylab yutadi,
> ya'ni rollback bo'lgan chiqim jimgina yo'qolardi. Ya'ni retry — qulf
> uchun emas, **jimgina yo'qolishga qarshi** sug'urta.

### Ochiq qolgan masala — IKKI PARALLEL OMBOR JURNALI

7.4 ni qilish paytida topildi va **7.5 ga to'g'ridan-to'g'ri ta'sir qiladi**.

Omborda **ikkita** mustaqil hisob yuritiladi:

| Yo'l | Jadval | Qoldiq | Kim ishlatadi |
|---|---|---|---|
| Yangi | `StockMovement` + `InventoryBatch` | harakatlar yig'indisi | Ombor ekrani, xizmat retsepti, statsionar |
| **Eski** | `InventoryLog` | **absolyut qiymat yoziladi** | `PUT /api/inventory/:id/stock` — bemor kartasidan material yozish (`PatientDetails.tsx:468`) |

Eski yo'l `StockMovement` yozmaydi va partiyalarga tegmaydi. Ya'ni
`qoldiq = harakatlar yig'indisi` invarianti **bu yo'l ishlatilganda buziladi** —
kodning aybi emas, ikki avlod hisobining yonma-yon yashashi.

**7.5 uchun oqibat:** partiyalar va qoldiq bo'yicha sodda tekshiruv shu
sababli **soxta ogohlantirish** beradi. 7.5 ni loyihalashda bu hisobga
olinishi shart (tekshiruv ham buni aytgan edi). Ikki jurnalni birlashtirish —
alohida ish, Reliz 7 doirasidan tashqarida.

### 7.5 — Yaxlitlik tekshiruvi (bajarildi 2026-08-24)

`GET /api/admin/integrity` — faqat klinika egasiga, faqat **o'qiydi**.
Sozlamalar → Xizmat ko'rsatish da tugma bilan ishga tushadi (avtomatik emas:
butun bazani skanerlaydi).

**Ikki qaror tekshiruvlarning shaklini belgiladi.**

**1. Raw SQL emas, Prisma agregatsiyalari.** Adversarial tekshiruv aniqladi:
SQLite da `COALESCE(x, 0)` ning literal `0` i INTEGER bo'lib qoladi va Prisma
uni **BigInt** qilib qaytaradi — `res.json()` esa BigInt ni seriyalashtira
olmaydi. Ya'ni endpoint aynan **buzilish topilgan paytda** 500 berardi.
Agregatsiyalar oddiy `number` qaytaradi va muammo umuman paydo bo'lmaydi.

**2. Faqat SHUBHASIZ buzilish "xato" deb belgilanadi.** Soxta ogohlantirish
beradigan tekshiruv — foydasiz tekshiruv: bir-ikki bekorga qo'ng'iroqdan
keyin unga hech kim qaramaydi.

| Tekshiruv | Daraja | Nima taqqoslanadi |
|---|---|---|
| To'lovlar | `error` | `SUM(ChargePayment) == paidAmount` |
| Eski to'lovlar (0006 gacha) | `info` | chek qatori yo'q, lekin pul bor — meros, buzilish emas |
| Holat | `error` | to'liq to'langan qator `Paid` bo'lishi kerak |
| Bekor qilingan, puli olingan | `warn` | `cancelChargesBySource` buni qonuniy hosil qiladi |
| **Ombor — PARTIYA bo'yicha** | `error` | `SUM(harakatlar) == partiya qoldig'i` |
| Ikki ombor jurnali | `info` | eski yo'l ishlatilgan mahsulotlar |
| Avans balansi | `warn` | `billing.ts` dagi **yagona** formula orqali |

**Ombor tekshiruvi nima uchun PARTIYA bo'yicha.** "Qoldiq = harakatlar
yig'indisi" tekshiruvi eski yo'l (`PUT /api/inventory/:id/stock`) ishlatilgan
**har** mahsulotda soxta xato berardi. Partiya esa faqat yangi yo'lda
o'zgaradi: kirim partiyani yaratib `+qty` yozadi, FEFO chiqimi partiyani
kamaytirib `−take` yozadi. Ya'ni har partiya uchun `SUM(harakatlar) ==
qoldiq` — bu **aniq** invariant, ikki jurnal muammosidan mustaqil.

**Balans formulasi endi bitta joyda.** `findBalanceMismatches` (`billing.ts`)
ni yaxlitlik tekshiruvi ham, balanslarni qayta hisoblash endpointi ham
ishlatadi — ikkalasi ayri ketolmaydi. Aynan shu ayrilik 7.7-B dagi xatoning
sababi edi.

**Tekshirildi** (`backend/_t_integrity.ts`): **17 sinov, hammasi o'tdi.**

| Sinov | Natija |
|---|---|
| Sog'lom bazada (haqiqiy dev ma'lumoti) | **0 xato** |
| To'liq pul aylanishidan keyin (avans, qisman to'lov, qaytarish) | **0 xato** |
| Ombor: kirim + chiqim + inventarizatsiya | **0 xato** |
| **Eski ombor yo'li ishlatilgandan keyin** | **0 xato**, `info` bo'lib ko'rsatildi |
| Qo'lda buzilgan `paidAmount` | topildi |
| Qo'lda buzilgan partiya qoldig'i | topildi |
| Qo'lda buzilgan balans | topildi, tuzatildi |
| Buzilish topilganda javob | **JSON, 500 emas** (BigInt tuzog'i yo'q) |
| Namunadagi summalar turi | `number`, matn emas |

### 7.6 — Kirish xavfsizligi (bajarildi 2026-08-24)

**Eng muhim qaror: to'siq TOKENDA, interfeysda emas.** Tekshiruv haqli edi —
`mustChangePassword` bayrog'ining o'zi faqat bezak: server to'liq huquqli
30 kunlik token berardi, ya'ni `admin`/`admin` ni bilgan odam `curl` bilan
hamma joyga kiraverardi.

Endi standart parol bilan kirilganda token `scope: 'password-change'` bilan
beriladi (30 daqiqa) va `authenticateToken` uni faqat parol almashtirish
endpointiga o'tkazadi. Interfeys to'sig'i qo'shimcha, asosiy emas.

| O'zgarish | Tafsilot |
|---|---|
| Login cheklovi | login bo'yicha 5 xato → 15 daqiqa; IP bo'yicha 30 → 15 daqiqa |
| **`X-Forwarded-For` ISHLATILMAYDI** | `trust proxy` yo'q, sarlavha hujumchi qo'lida — IP faqat `socket.remoteAddress` dan |
| Muvaffaqiyatda | login hisoblagichi tozalanadi, **IP hisoblagichi — yo'q** |
| Jurnal | muvaffaqiyatsiz urinish oynada FAQAT bir marta yoziladi (baza shishirilmasin) |
| `POST /api/auth/change-password` | kamida 8 belgi, standart parolni qayta qo'yib bo'lmaydi, joriy parol tekshiriladi |
| Majburiy ekran | `ForcePasswordChange`; ma'lumot yuklash effekti ham to'xtatiladi |
| **Masofaviy kirish** | endi ixtiyoriy, **sukut bo'yicha o'chiq** |

**Topilgan narsa: tunnel SHARTSIZ ishlar ekan.** `electron/main.ts` da
"Quick tunnel always runs as a fallback link" yozilgan edi va u har ishga
tushishda ko'tarilardi — ya'ni **har bir o'rnatma o'zi bilmagan holda
`trycloudflare.com` manzili orqali internetga ochiq** bo'lardi. Standart
login bilan birga bu jiddiy teshik edi. Endi `remote-access.json` bilan
boshqariladi, yoqish uchun standart parol almashtirilgan bo'lishi shart, va
o'chirilganda manzil fayllari ham o'chiriladi (aks holda Sozlamalar "internetdan
ochiq" degan yolg'on ogohlantirishni abadiy ko'rsatardi).

**Tekshirildi** (`backend/_t_auth.ts`): **23 sinov, hammasi o'tdi.**

- **Cheklangan token 6/6 endpointda rad etildi** (`/patients`, `/transactions`,
  `/charges`, `/admin/integrity`, `/inventory`, `/visits`) va yozishga urinish ham;
- qisqa parol, standart parolni qaytarish, noto'g'ri joriy parol — rad etildi;
- almashtirilgach to'liq token darhol berildi va hamma joy ochildi;
- **brute-force cheklovi har so'rovda BOSHQA `X-Forwarded-For` yuborilganda ham
  ishladi** — ya'ni soxtalashtirish bilan chetlab o'tib bo'lmaydi;
- bloklangan holatda to'g'ri parol ham o'tmaydi;
- masofaviy kirish sukut bo'yicha o'chiq, parol almashtirilgach yoqiladi.

### 7.2 — Tiklashni sinash (bajarildi 2026-08-24) — REGRESSIYA TOPDI

Tiklash mantig'i `electron/main.ts` dan `electron/restore.ts` ga chiqarildi.
U faqat `fs` va `path` ni ishlatadi, ya'ni sinovdan o'tkazish mumkin — ilgari
u yopiq turardi va **tiklash yo'li hech qachon uchidan-uchiga sinalmagan edi**.

Sinov ikki bosqichda, haqiqiy oqimdagidek: server ishlayotganda nusxa olinadi
va belgi qo'yiladi, keyin server to'xtatiladi va **kompilyatsiya qilingan
haqiqiy modul** chaqiriladi.

> **VA U REGRESSIYA TOPDI.** WAL yoqilgach (7.0), tiklashdan oldingi zaxira
> nusxa (`pre-restore-*.db`) faqat `.db` faylini ko'chirardi. WAL rejimida esa
> tasdiqlangan tranzaksiyalar `-wal` da turadi va checkpoint da ko'chadi —
> ya'ni **noto'g'ri tiklashdan qaytish uchun mo'ljallangan fayl aynan yo'qolgan
> ma'lumotni saqlamasdi**. Sinovda: 10 ta bemor bor edi, `pre-restore` da 5 tasi.
>
> Tuzatildi: `-wal` va `-shm` ham yonma-yon ko'chiriladi, SQLite ularni juftlik
> deb tanidi. Tuzatishdan keyin `pre-restore` da 10 ta bemor.
>
> Bu 7.2 ning mavjud bo'lish sababi: "hech qachon tiklanmagan nusxa — nusxa
> emas, faqat umid."

**Tekshirildi** (`backend/_t_restore.ts`): **20 sinov, hammasi o'tdi.**

- nusxa → 5 bemor qo'shildi → tiklandi → **5 tasi yo'q, eskisi butun**;
- belgilangan tiklashni bekor qilish ishlaydi va bazaga tegmaydi;
- `pre-restore` nusxasi yaratiladi va **yo'qolgan 5 bemorni saqlaydi**;
- eski WAL/SHM fayllari tozalanadi (yangi bazaga eski jurnal qo'llanmasin);
- yomon belgi fayli: yo'l bilan chiqish (`../../../etc/passwd`), buzuq JSON,
  mavjud bo'lmagan nusxa — uchalasi ham xavfsiz rad etildi.

### 7.6 dizaynidagi tuzatishlar (adversarial tekshiruvdan)

To'rtala band ham `NEEDS_FIX` hukmini oldi. Eng muhim to'rttasi:

1. **7.3 — «tranzaksiya ichida qayta o'qish» yolg'iz o'zi FANTOM CHEK yaratadi.**
   Tashqi o'qish qatorni `Unpaid` ko'rgan, ichki o'qish esa uni topmasa
   (boshqa kassir to'lab bo'lgan), `methodSplit` sikli baribir `Transaction`
   yaratadi, `ChargePayment` esa yaratilmaydi → kassada uydirma chek. Ichki va
   tashqi o'qish farq qilganda **409 qaytarish shart**, shunchaki qayta o'qish
   yetarli emas. Shuningdek `first = charges[0]` va `serviceLabel`
   (`billing.ts:405, 441-443`) ham tashqi o'qishdan olinadi.
2. **7.4 — retry IXTIYORIY EMAS, majburiy.** `writeOff` ning ikki chaqiruvchisi
   xatoni yutadi (`inpatient.ts:324-328`, `multiprofile.ts:387-390`) — ya'ni
   tranzaksiya rollback bo'lsa chiqim **jimgina yo'qoladi**. Bundan tashqari
   `writeOffCore(tx, …)` ni to'g'ridan-to'g'ri chaqirish kerak (yagona ichki
   chaqiruvchi — `applyServiceRecipe`, `inventory.ts:130`), Prisma ning
   avtoaniqlashiga tayanmasdan.
3. **7.5 — `COALESCE(x, 0)` BigInt qaytaradi va `res.json()` ni yiqitadi.**
   Aynan buzilish topilgan holatda endpoint 500 beradi. Hamma joyda
   `CAST(COALESCE(x,0) AS REAL)` kerak. Shuningdek (c) tekshiruvi
   («partiyalar yig'indisi > qoldiq») **normal** oqimlarda ham chiqadi:
   inventarizatsiya kamomad bilan (`inventory.ts:297-303`) va bemor kartasidan
   material yozish (`PatientDetails.tsx:468`).
4. **7.6 — IP bo'yicha cheklash o'z-o'zidan aylanib o'tiladi.**
   `trust proxy` o'rnatilmagan (tekshirildi), `X-Forwarded-For` esa hujumchi
   qo'lida — har so'rovda yangi bucket. Bundan tashqari `mustChangePassword`
   faqat UI bezagi: `server.ts:1727` muvaffaqiyatli loginda to'liq huquqli
   30 kunlik JWT beradi, ya'ni standart parolni bilgan odam `curl` bilan
   hamma joyga kiraveradi. Backend darajasida cheklov shart.

### 7.1 — bajarildi (2026-08-24)

**Nima qo'shildi.** `backend/maintenance.ts`: `performBackup()` (endpoint ham,
jadval ham shuni chaqiradi), `applyRetention()`, `autoBackupDue()`,
`startBackupScheduler()`, sozlama fayli `%APPDATA%\xclinic\backup-config.json`.
Yangi endpointlar: `GET /api/admin/backup/status`,
`PUT /api/admin/backup/config`. `runMigrations()` ga `beforeApply` ilgagi.
Frontend: Sozlamalar → Xizmat ko'rsatish da holat chizig'i va jadval sozlamasi.

**Tekshirildi (haqiqiy serverda, alohida sinov bazasida).**

| Ssenariy | Natija |
|---|---|
| 4 kun nusxa olinmagan baza bilan ishga tushish | 20 s ichida quvib yetdi, nusxa olindi |
| `stale` bayrog'i | nusxadan keyin `true → false`, `ageDays: 0` |
| Sozlama chegaralari (`hour:99`, `keepDaily:0`) | `23` va `2` ga cheklandi |
| Yaroqsiz ikkinchi manzil (fayl) | HTTP 400, saqlanmadi |
| Ikkinchi manzil ulangan | nusxa ikkala joyga tushdi |
| Ikkinchi manzil uzilgan (`Z:/`) | asosiy nusxa olindi, xato alohida qayd etildi |
| Migratsiyadan oldingi nusxa | olindi, izohi `migratsiyadan oldin: 0028_…` |
| `applyRetention` va `autoBackupDue` birlik sinovlari | 27 tekshiruv, hammasi o'tdi |

**Topilgan va tuzatilgan xato.** `keepDaily = 14` aslida **15 kunni** saqlar edi
(`tashkentDateStr(-keepDaily)` chegarasi bir kun ortiqcha oladi). Sozlamada
yozilgan raqam haqiqatga mos kelmasligi keyin chalkashtiradi — tuzatildi.

**Rejadan chiqarilgani.** Electron `before-quit` da nusxa olish. U dasturning
yopilishini sekinlashtiradi, quvib yetish esa o'sha ma'lumotning aynan o'zini
keyingi ishga tushishda oladi — foyda yo'q, narx bor.

---

## RELIZ 12 — Yagona ombor jurnali va meros tozalash (bajarildi 2026-08-28)

| Band | Holat | Natija |
|---|---|---|
| 12.1 Ombor: ikki jurnal birlashtirildi | ✅ | eski yo'l 410, item invarianti endi HAQIQIY |
| 12.2 Pul turi `Int` (11.1-B) | ⛔ **qilinmadi** | qaror o'zgarmadi — quyida |
| 12.3 Eski tarix: bemor va shifokor kartasi | ✅ | kesim so'rovlari (`?patientId=`, `?doctorId=`) |
| 12.4 Indekslar (10.5) | ✅ | `Transaction` da indeks UMUMAN yo'q ekan |
| 12.5 `SUPER_ADMIN` va obuna konturi | ✅ | 70 → 0 tekshiruv, ~430 qator o'lik kod |

### 12.1 — Ombor: yagona jurnal

**Muammo.** Ikki avlod hisobi yonma-yon yashardi: yangi yo'l `StockMovement`
yozardi, eski yo'l (`PUT /api/inventory/:id/stock`, bemor kartasidan material)
esa `InventoryLog` ga yozib, qoldiqni to'g'ridan-to'g'ri qayta yozardi va
partiyalarga tegmasdi.

**Nima qilindi.**

| Qadam | Tafsilot |
|---|---|
| Migratsiya `0028` | `StockMovement` ga `patientId`, `reversalOfId`; `InventoryLog` ning har qatori harakatga ko'chirildi (`reason='Legacy'`) |
| Boshlang'ich qoldiqlar | har mahsulot uchun qolgan farq bitta `Adjust` harakati bilan yopildi — shundan keyingina item invarianti mumkin bo'ldi |
| Bemor materiali | endi oddiy chiqim: FEFO, partiya, harakat (`POST /api/stock-movements/out` + `patientId`) |
| Eski yo'l | `PUT /api/inventory/:id/stock` va `DELETE /api/inventory/logs/:id` → **410** |
| Sarf tahlili | `GET /api/inventory/analytics` endi harakatlardan o'qiydi — ilgari u xizmat retsepti va statsionar sarfini UMUMAN ko'rmasdi |
| O'chirish → bekor qilish | jurnal qatori o'chirilmaydi: `POST /api/stock-movements/:id/reverse` teskari harakat yozadi |

**Yaxlitlik tekshiruvi qayta yozildi.** `inventory_dual_ledger` (ma'lumot
bandi) o'rniga ikkita HAQIQIY tekshiruv:

- `item_movements` — har mahsulot: `qoldiq == harakatlar yig'indisi`
  (`Transfer` chiqarib tashlanadi: u umumiy qoldiqni o'zgartirmaydi);
- `inventory_legacy_writes` — eski jadvalga yangi yozuv tushmaganini kuzatadi.

**Nima uchun alohida sinov yozildi (`npm run test:migration`).** Dev bazada
`InventoryLog` **bo'sh** (0 qator) — ya'ni migratsiyani shu bazada yurgizib
"o'tdi" deyish hech narsani isbotlamaydi. Sinov ataylab 0028 gacha bo'lgan
holatni yasaydi (harakatsiz mahsulot + eski jurnal qatorlari) va migratsiyani
serverdagi bilan bir xil usulda qo'llaydi. 14 ta tekshiruv.

**Yon natija — sinov nusxasidagi jimgina eskilik.** `tests/run-api.ts`
bazani `copyFileSync` bilan nusxalardi. Baza esa **WAL** rejimida (7.0) va
oxirgi yozuvlar `.db-wal` da yotadi — ya'ni nusxa jimgina ESKI holatni
berardi. Amalda ko'rindi: 0028 qo'llangan bazadan olingan nusxada yangi
ustunlar yo'q edi. Ikkala sinov ham `VACUUM INTO` ga o'tkazildi — zaxira nusxa
moduli allaqachon shu usulni ishlatardi.

### 12.2 — Pul turi: qaror O'ZGARMADI

Modul kesimidagi ro'yxatda bu "qolgan ish" deb yozilgan edi. Xato: 11.1-B
allaqachon **o'lchov bilan rad etilgan**. Ko'chirish ~20 jadvalni qayta
qurishni talab qiladi, migratsiya mexanizmi buni bajara olmaydi, va yozish
nuqtalari (`money.ts`) kafolatni allaqachon beradi. O'rniga
`money_precision` qo'riqchisi turibdi.

Fikrni o'zgartiradigan yagona narsa o'sha-o'sha: agar `money_precision` biror
klinikada kasr ko'rsatsa.

### 12.3 — Eski tarix: kesim so'rovlari

**Muammo.** Kirishda 45 kunlik oyna yuklanadi (10.3). Bemor va shifokor
kartasi esa aynan ESKI tarix uchun ochiladi.

**Yechim — butun jadvalni tortish EMAS**, kesimni serverda qisqartirish:
`/api/appointments` va `/api/transactions` ga `?patientId=` / `?doctorId=`,
`/api/patients` ga `?doctorId=` qo'shildi. Parametrsiz chaqiruv o'zgarmadi.

**Bemor kartasida server ro'yxati propni ALMASHTIRMAYDI, birlashtiradi.**
Sabab: eski to'lovlarda `patientId` bo'sh bo'lishi mumkin va ular bemorga ISM
bo'yicha bog'lanadi. Almashtirsak, aynan o'sha eski qatorlar kartadan
yo'qolardi — ya'ni "eski tarixni ochamiz" degan ish eski tarixni o'chirardi.

**Yo'l-yo'lakay topilgan bug — `DoctorsAnalytics`.** 10.3 da "3 oy / 6 oy /
yil / butun davr tanlansa serverdan so'raydi" deb yozilgan edi. Amalda:

- so'rov `customStartDate` ga qarardi, u esa `3 oy`/`6 oy`/`yil` da
  o'zgarmaydi — ya'ni bu uch tanlovda **serverga umuman chiqilmasdi**;
- to'lovlar filtri serverdan kelgan ro'yxatni **umuman ishlatmasdi**
  (`effectiveTransactions` hech qayerda o'qilmagan).

Davr chegarasi endi BITTA joyda hisoblanadi va uchalasi — so'rov, yozuvlar
filtri, to'lovlar filtri — o'shandan foydalanadi.

**`FinanceHub` — o'zgartirish KERAK EMAS ekan.** U hech narsa hisoblamaydi:
proplarni `CashBook` va `FinanceReport` ga uzatadi, ular esa o'z oralig'ini
o'zi so'raydi. Rejadagi "propdan o'qiydi" belgisi tekshirilmagan taxmin edi.

### 12.4 — Indekslar

`EXPLAIN QUERY PLAN` bitta kutilmagan narsani ko'rsatdi: sxemada 94 ta indeks
bor, lekin **`Transaction` jadvalida bittasi ham yo'q** — holbuki u eng katta
jadval (10.1 o'lchovi: 110 010 qator, 41 MB) va kassa, bosh sahifa,
hisobotlar, bemor kartasi — hammasi undan o'qiydi.

| So'rov | Oldin | Keyin |
|---|---|---|
| tranzaksiya: klinika + sana | `SCAN` + vaqtinchalik B-daraxt | `SEARCH ... USING INDEX` |
| tranzaksiya: bemor / shifokor | `SCAN` + B-daraxt | indeks |
| qabul: klinika + shifokor | butun jadval sana indeksi bo'ylab | indeks |
| bemor: `createdAt DESC LIMIT 500` | B-daraxt bilan saralash | indeks |

Migratsiya `0029` — 7 ta indeks va `ANALYZE`. Statistikasiz SQLite qaysi
indeks arzonligini TAXMIN qiladi; bitta klinikali bazada `clinicId` hamma
qatorga mos kelgani uchun taxmin xato bo'lishi mumkin.

### 12.5 — `SUPER_ADMIN` va obuna konturi

**O'lchov:** 70 ta joy, 11 fayl. Uch xil turda edi va uchtasi uch xil hal
qilindi:

| Tur | Nima qilindi |
|---|---|
| Rol ro'yxatlari (`['DOCTOR','CLINIC_ADMIN','SUPER_ADMIN']`) | rol olib tashlandi — ruxsat TORAYDI |
| Egalik istisnolari (`if (role === 'SUPER_ADMIN') return true`) | olib tashlandi — tekshiruv endi HAR DOIM ishlaydi |
| Faqat `SUPER_ADMIN` ga ochiq endpointlar | hech kim chaqira olmasdi, ya'ni O'LIK edi — quyida |

O'lik endpointlar bo'yicha qaror har biriga alohida:

- **O'chirildi** (obuna/sotuv konturidan meros): `/api/superadmin/sales`,
  `/api/sales/clinics`, `POST`/`PUT`/`DELETE /api/clinics`,
  `GET`/`PUT /api/plans`, demo-so'rovlar, lead-api-key — jami ~430 qator.
- **O'chirildi** (o'lik + xavfli): `POST /api/test/send-*` (6 ta). Ular
  BARCHA klinikalar bo'yicha SMS yuborardi. Klinika adminiga ochish noto'g'ri
  bo'lardi: bir bosishda hamma bemorga xabar va Eskiz balansidan pul.
- **Klinika egasiga ochildi**: Facebook sozlash endpointlari. Ular
  integratsiyaning SOZLASH yarmi edi, ISHLATISH yarmi esa (`Leads` ekrani)
  tirik — ya'ni o'chirish ishlaydigan funksiyani butunlay buzardi.
- **Tuzatildi**: `GET /api/clinics` endi tokendagi klinikani qaytaradi.
  Ilgari u `SUPER_ADMIN` ga yopiq edi, ya'ni `App.tsx` dagi zaxira yo'l
  ("saqlangan clinicId yo'q bo'lsa ro'yxatdan olamiz") HAR DOIM 403 olardi.

**`SALES_AGENT` ham ketdi.** U shunchaki o'lik rol emas edi — **tirik kirish
yo'li** edi (login `SalesAgent` jadvalini tekshirardi): yana bitta parol, yana
bitta hujum yuzasi. Bazada 0 qator.

**Tarif bo'yicha shifokor chegarasi olib tashlandi** (server va Sozlamalar
ekrani, "tarifni o'zgartirish uchun menejer bilan bog'laning" oynasi bilan
birga). Amalda u allaqachon ishlamasdi ham: tarif ma'lumoti so'rovga
qo'shilmagani uchun chegara har doim standart 10 ga tushardi.

**`SubscriptionPlan` jadvali BAZADA qoldi — ataylab.** `Clinic.planId`
majburiy tashqi kalit; uni yo'qotish `Clinic` jadvalini qayta qurishni talab
qiladi, bu esa `migrations/README.md` da taqiqlangan — 11.1-B rad etilgan
sabab bilan aynan bir xil. Ilova darajasida esa u endi yo'q: endpoint yo'q,
prop yo'q, interfeysda ko'rinmaydi.

### Tekshiruv

| Sinov | Natija |
|---|---|
| `npm test` (birlik) | 35 ✅ |
| `npm run test:migration` | 14 ✅ |
| `npm run test:api` | 153 ✅ (payments 26, moneybugs 24, stock 33, patients 30, events 16, money 5, integrity 19) |
| `tsc --noEmit` (server va interfeys) | xatosiz |
| `vite build` | muvaffaqiyatli |
| Dev bazaga 0028+0029 qo'llanishi | migratsiyadan oldin avtomatik nusxa olindi, invariant 0 buzilish |

---

## Ish qoidalari

Bu qoidalar 1–6 relizlarda ishlagan va o'zgarmaydi:

1. **Har reliz = migratsiya fayli + kod + priyomka ssenariysi.** Migratsiyasiz
   sxema o'zgarishi yo'q, priyomkasiz reliz yopilmaydi.
2. **Migratsiyalar faqat oldinga.** Yangi raqamlar `0028` dan boshlanadi.
3. **Orqaga moslik majburiy.** Yangi parametr ixtiyoriy bo'ladi, parametrsiz
   chaqiruv ilgarigidek ishlaydi. Bu qoida `?scope=clinic` da ishlagan.
4. **Har relizdan keyin BUILD-SPEC ga jurnal yozuvi**: nima qilindi, qaysi
   xatolar topildi, chegara qayerda.

## Ustuvorlik shkalasi

| Belgi | Ma'nosi |
|---|---|
| **P0** | Ma'lumot yoki pul yo'qoladi. Klinikaga qo'yishdan oldin yopilishi shart |
| **P1** | Kunlik ishni sekinlashtiradi yoki xato kiritishga majbur qiladi |
| **P2** | Dasturning umrini cheklaydi — bugun ko'rinmaydi, 1–2 yildan keyin qimmat |
| **P3** | Sifat, ko'rinish, texnik qarz |

## Umumiy jadval

| Reliz | Nomi | Ustuvorlik | Hajm | Natija |
|---|---|---|---|---|
| **7** | Ma'lumot yo'qolmaydi va pul to'g'ri | P0 | ~7 kun | Klinikaga qo'yish mumkin bo'ladi |
| **8** | Kunlik ish tezligi | P1 | ~5 kun | Registrator sichqonsiz ishlaydi |
| **9** | Ko'p ish o'rni | P1 | ~6 kun | Ekranlar bir-birini kutmaydi |
| **10** | Tarmoqdan kirish tezligi | P2 | ✅ bajarildi | 41 MB → 1.9 MB (o'lchandi) |
| **11** | Pul turi va sifat | P2/P3 | ~8 kun | Texnik qarz yopiladi |

**Jami ≈ 36 ish kuni ≈ 7–8 hafta** (bitta dasturchi, kuniga 5–6 soat samarali ish).

---

# RELIZ 7 — Ma'lumot yo'qolmaydi va pul to'g'ri (P0)

Bu relizsiz dasturni ishlayotgan klinikaga qo'yib bo'lmaydi. Qolgan hamma narsa
kutishi mumkin, bu — yo'q.

## 7.1. Avtomatik zaxira nusxa

**Muammo.** `POST /api/admin/backup` bor (`backend/maintenance.ts:281`), lekin
jadval bo'yicha avtomatik nusxa yo'q — butun backendda `setInterval` faqat AI
rate-limit tozalash uchun ishlatilgan. Admin tugmani bir hafta bosadi, keyin
unutadi. SQLite fayli bitta kompyuterda turadi.

**Nega bu birinchi o'rinda.** Qolgan hamma muammo ma'lumotni buzadi — bu esa
butunlay yo'qotadi. Va tuzatilishi eng arzoni.

**Yechim.**

1. `maintenance.ts` ga rejalashtiruvchi. **Jadval emas, quvib yetish.** Loyihada
   bu qaror allaqachon qabul qilingan va `server.ts` da yozilgan: *"Offline
   dasturda jadval (cron) ishonchsiz — kompyuter kechqurun o'chadi"*. Koyka haqi
   va jurnal tozalash shu tamoyil bo'yicha ishlaydi, zaxira ham shunday:
   Toshkent kuniga bitta nusxa, belgilangan soatda; kompyuter o'sha paytda o'chiq
   bo'lsa — keyingi ishga tushishda darhol.
2. Saqlash siyosati: oxirgi 14 kunning hammasi + undan oldingi 12 oyning har
   biridan eng yangisi. Izohli nusxalar hech qachon o'chirilmaydi.
3. Ikkinchi manzil (ixtiyoriy): Sozlamalarda "Nusxa papkasi" — flesh yoki tarmoq
   diski. `select-backup-folder` IPC allaqachon bor (`electron/main.ts:498`).
4. Sozlamalar → Xizmat ko'rsatish ga **oxirgi muvaffaqiyatli nusxa sanasi** va
   3 kundan oshsa qizil ogohlantirish.
5. Sxema migratsiyasidan **oldin** ham nusxa: migratsiyaning o'zi tranzaksiyada
   qaytariladi, lekin muvaffaqiyatli qo'llangan o'zgarishdan qaytish yo'li faqat
   nusxa.

> **Rejadagi xato tuzatildi.** Bu yerda avval `PRAGMA wal_checkpoint(TRUNCATE)`
> talab qilingan edi. **Kerak emas:** nusxa `VACUUM INTO` bilan olinadi, u esa
> ochiq baza ustida ham izchil snapshot beradi va WAL dagi tasdiqlangan
> tranzaksiyalarni o'z ichiga oladi. Buni `maintenance.ts` ning o'z izohi
> allaqachon yozib qo'ygan ekan.

**Qabul mezoni.**
- Dastur yopilib, ertasi kuni ochilsa — `backups/` da kechagi nusxa turibdi.
- 20 kun ishlagandan keyin papkada 14 ta kunlik + oylik nusxalar bor, qolgani yo'q.
- Ikkinchi manzil ulanmagan bo'lsa — asosiy nusxa baribir olinadi.

**Hajm:** 1.5 kun. **Xavf:** past.

## 7.2. Tiklashni sinab ko'rish (restore drill)

**Muammo.** Hech qachon tiklanmagan nusxa — nusxa emas, faqat umid.
`/api/admin/backup/restore` bor va u faqat BELGI qo'yadi
(`electron/main.ts:285`), haqiqiy almashtirish Electron qayta ishga tushganda
bo'ladi. Bu yo'l hech qachon to'liq sinalmagan.

**Yechim.** Sinov ssenariysi va uni hujjatlashtirish:

1. Nusxa olinadi → 5 ta yangi bemor qo'shiladi → nusxadan tiklanadi →
   o'sha 5 bemor yo'qligi va eski ma'lumot butunligi tekshiriladi.
2. `pre-restore-*.db` haqiqatan yaratilishini tekshirish
   (`electron/main.ts:219`) — noto'g'ri nusxadan tiklansa qaytish yo'li shu.
3. Natija BUILD-SPEC ga yoziladi.

**Qabul mezoni.** Tiklash yo'li qo'lda bir marta to'liq o'tilgan va hujjatlangan.

**Hajm:** 0.5 kun. **Xavf:** yo'q (faqat sinov).

## 7.3. Pul oqimini atomarlashtirish

**Muammo.** To'lov qabul qilishda (`backend/billing.ts:452-508`) ketma-ket
**to'rt guruh alohida yozuv** boradi: `Transaction` yaratildi → `ChargePayment`
yaratildi → `VisitCharge` yangilandi → `Patient.balance` kamaytirildi.
`$transaction` butun backendda atigi 2 marta ishlatilgan va ikkalasi ham
billing'da emas.

Jarayon o'rtada uzilsa: pul kirim bo'lib turadi, xizmat "to'lanmagan" bo'lib
qoladi. Yoki avans yechilmay qoladi. Kun oxirida kassa mos kelmaydi va kassir
aybdor bo'ladi. Bu GAP-ANALYSIS ning **C3** bandi.

**Yechim.**

1. `POST /api/charges/pay` butunlay `prisma.$transaction(async (tx) => {...})`
   ichiga. Tekshiruvlar (avans yetarliligi, qator holati) ham **tranzaksiya
   ichida** qayta o'qiladi — hozir tashqarida o'qilyapti va bu poyga
   (race condition) beradi.
2. Xuddi shu narsa: `POST /api/charges/:id/refund`, avans kiritish,
   `POST /api/transactions`, smena yopish.
3. **Optimistik qulf.** Ikki kassir bitta qatorni bir vaqtda to'lasa, hozir
   ikkalasi ham o'tadi. Tranzaksiya ichida `paidAmount` mijoz ko'rgan qiymatga
   mos kelishini tekshirish, mos kelmasa **409** va "Bu qator allaqachon
   to'langan, ro'yxatni yangilang".
4. Interaktiv tranzaksiya uzoq ketmasligi uchun `timeout: 10000` beriladi;
   audit yozuvi (`writeAudit`) tranzaksiyadan **tashqarida** qoladi — u so'rovni
   to'xtatmasligi kerak (compliance.ts dagi qaror bilan bir xil).

**Qabul mezoni.**

- Tranzaksiya o'rtasida sun'iy xato tashlansa — bazada na chek, na
  `ChargePayment`, na o'zgargan `paidAmount` qoladi.
- Ikki brauzerdan bir vaqtda bitta qator to'lansa — biri o'tadi, ikkinchisi 409 oladi.

**Hajm:** 2 kun. **Xavf:** o'rta — kassa mantiqiga tegiladi, priyomka to'liq
o'tkazilishi shart.

## 7.4. Ombor chiqimini atomarlashtirish

**Muammo.** FEFO chiqimida (`backend/inventory.ts:69-95`) sikl ichida
`inventoryBatch.update` va `stockMovement.create` alohida boradi. O'rtada uzilsa
partiya qoldig'i kamaydi, harakat qatori yozilmadi — ya'ni "qoldiq = harakatlar
yig'indisi" degan asosiy qoida buziladi. Modulning butun qiymati shu qoidaga
tayangan edi.

Ikkinchi muammo: partiyalar tranzaksiyasiz o'qiladi, ya'ni bir vaqtda ikki qabul
bitta partiyadan yechsa ikkalasi ham eski qoldiqni ko'radi.

**Yechim.** `issueStock()` butunlay bitta tranzaksiyada; partiyalar tranzaksiya
ichida o'qiladi; xizmat retsepti bo'yicha avtomatik chiqim ham shu tranzaksiyaga
kiradi (xizmat qo'shildi, material chiqmadi — bo'lmasin).

**Qabul mezoni.** 200 ta parallel chiqim so'rovidan keyin
`SUM(StockMovement.quantity)` har bir modda uchun partiya qoldiqlari yig'indisiga
teng.

**Hajm:** 1 kun. **Xavf:** past.

## 7.5. Yaxlitlik tekshiruvi (integrity check)

**Muammo.** Yuqoridagi ikki tuzatish bundan keyingi buzilishlarni to'xtatadi,
lekin **allaqachon buzilgan yozuvlarni topmaydi**. Va tekshirmasdan buzilganini
bilib bo'lmaydi.

**Yechim.** `GET /api/admin/integrity` — faqat egaga. To'rtta tekshiruv:

| Tekshiruv | Qoida |
|---|---|
| To'lovlar | har `VisitCharge` uchun `SUM(ChargePayment.amount)` = `paidAmount` |
| Holat | `paidAmount >= total` bo'lgan qator `status = 'Paid'` bo'lishi kerak |
| Ombor | har modda uchun `SUM(StockMovement.quantity)` = partiya qoldiqlari yig'indisi |
| Avans | `Patient.balance` = avans kirimlari − `Balance` turidagi to'lovlar |

Natija Sozlamalar → Xizmat ko'rsatish da: "Yaxlitlik: 0 nomuvofiqlik" yoki
ro'yxat bilan. Server ishga tushganda ham bir marta yuritiladi va nomuvofiqlik
bo'lsa konsolga yoziladi.

**Qabul mezoni.** Qo'lda buzilgan yozuv (SQL bilan `paidAmount` o'zgartirilsa)
ro'yxatda chiqadi.

**Hajm:** 1 kun. **Xavf:** yo'q — faqat o'qiydi.

## 7.6. Kirish xavfsizligi

**Muammo.** Uchta ochiq joy:

1. `/api/auth/login` da urinishlar cheklanmagan. Rate-limit faqat AI
   endpointlarida (`backend/server.ts:1468`, 6655, 6745).
2. Birinchi ishga tushishda `admin` / `admin` yaratiladi va uni almashtirish
   **majburiy emas** — README da "albatta o'zgartiring" deb yozilgan, xolos.
3. Cloudflare tunnel yoqilsa server internetda bo'ladi va yuqoridagi ikkalasi
   birga jiddiy teshik beradi.

**Yechim.**

1. IP + login bo'yicha rate-limit: 5 xato urinishdan keyin 15 daqiqa blok.
   Mavjud `aiRateLimit` mexanizmini umumiy `rateLimit` ga chiqarish kifoya.
2. Standart parol bilan kirilsa — boshqa hech qayerga o'tkazmaydigan "parolni
   almashtiring" ekrani. Almashtirilmaguncha API faqat shu endpointni qabul
   qiladi.
3. Cloudflare tunnelni yoqishda ogohlantirish: "Server internetdan ochiladi.
   Standart parol almashtirilganmi?" — va almashtirilmagan bo'lsa yoqishga
   ruxsat bermaslik.
4. Muvaffaqiyatsiz kirishlar `AccessLog` ga yoziladi (jadval 0025 da bor).

**Qabul mezoni.** 6-urinish 429 qaytaradi. Yangi o'rnatmada admin parolni
almashtirmaguncha boshqa ekranga o'ta olmaydi.

**Hajm:** 1 kun. **Xavf:** past.

**RELIZ 7 JAMI: ~7 kun.**

---

## RELIZ 8 — bajarildi (2026-08-24)

| Band | Holat |
|---|---|
| 8.1 Qidiruv serverga | ✅ |
| 8.2 Klaviatura ergonomikasi | ✅ |
| 8.3 Takror bemor + birlashtirish | ✅ |
| 8.4 Kiritish sifati | ✅ |

### 8.1 — Qidiruv serverga

`hooks/usePatientSearch.ts` — 250 ms debounce, eskirgan javobni bosib
ketmaslik himoyasi bilan. Registratura va Bemorlar ro'yxati shunga o'tdi.
Endi **karta raqami va JSHSHIR bo'yicha ham topiladi** — serverda bu
allaqachon bor edi, undan hech kim foydalanmasdi.

Bemorlar ro'yxatida qidiruv serverda, qolgan filtrlar (jins, shifokor, sana)
brauzerda qoldi — ularni ko'chirish 10-relizdagi sahifalash bilan birga
bo'ladi.

### 8.2 — Klaviatura ergonomikasi

`hooks/useHotkeys.ts`. Uch qoida: matn kiritilayotganda aralashmaslik,
brauzer tugmalarini tortib olmaslik (shu sababli `F2`–`F4` va `Esc`), har
tugmaga bitta ma'no.

| Tugma | Amal |
|---|---|
| `F2` / `F3` / `F4` | Registratura / Bemorlar / Kassa |
| `F3` (registraturada) | qidiruvni tozalab, fokusni qaytaradi |
| `Enter` | yagona natija bo'lsa — o'shani tanlaydi |
| `Esc` | qidiruvni tozalaydi, keyin tanlovni bekor qiladi |
| `Ctrl+S` | ochiq formani saqlash (hook qo'llab-quvvatlaydi) |

Bemor tanlangach fokus **o'zi bo'limga** o'tadi. Shtrix-kod skaneri alohida
ish talab qilmadi: u klaviatura sifatida ishlaydi, `useScannerInput` esa
"tez kelgan uzun satr + Enter" ni tanib qidiruvga yuboradi.

### 8.3 — Takror bemor

**Yaratishda:** telefon (normallashtirilgan) yoki ism+familiya+tug'ilgan
sana bo'yicha mos keladigan bemor topilsa — **409** va topilganlar ro'yxati.
Bloklamaydi: `force: true` bilan baribir yaratiladi, interfeys esa mavjud
kartani ochish tugmasini beradi.

> **Eski, YOMONROQ tekshiruv olib tashlandi.** `App.tsx` da faqat ism va
> familiya bo'yicha tekshiruv bor edi va u yaratishni **butunlay bloklardi**:
> bir xil ismli ikkinchi bemorni kiritishning iloji yo'q edi, tug'ilgan sana
> va telefon hisobga olinmasdi, va u brauzerdagi ro'yxatga tayanardi.

**Mavjud takrorlar:** `GET /api/patient-duplicates` va `POST /api/patient-merge`
(`backend/patientMerge.ts`). Birlashtirish sukut bo'yicha **quruq yuritadi**.

Ikki narsa alohida e'tibor talab qildi:

1. **`CashMovement` qo'lda sanaldi.** Prisma sxemasida `Patient` ning 18 ta
   relationi bor, lekin `patientId` maydoni **19 ta** modelda uchraydi —
   `CashMovement` da relation e'lon qilinmagan. Relationlar bo'yicha avtomatik
   yurgan birlashtirish **pul harakatlarini o'tkazib yuborardi**.
2. **Yo'l nomi `/api/patients/...` EMAS.** `app.get('/api/patients/:id')`
   ancha oldin ro'yxatdan o'tgan, ya'ni `/api/patients/duplicates` unga
   `id = "duplicates"` bo'lib tushardi va 404 qaytardi — sinovda aynan shunday
   bo'ldi. Alohida nom bu bog'liqlikni umuman yo'q qiladi.

Manba karta **o'chirilmaydi, arxivga o'tadi**: uning id si tashqarida (chek,
qog'oz karta) ishlatilgan bo'lishi mumkin.

### 8.4 — Kiritish sifati

Telefon `normalizeUzPhone` bilan tekshiriladi (tanilmasa — "SMS
yuborilmaydi" ogohlantirishi), tug'ilgan sana kelajakda yoki 120 yildan
katta bo'lolmaydi, JSHSHIR faqat raqam va 14 belgi. Tekshiruv **yumshoq**:
faqat aniq noto'g'ri sana saqlashni to'xtatadi — shoshilinch holatda
raqamsiz bemorni ham kiritish kerak bo'ladi.

### Tekshiruv

`backend/_t_patients.ts` — **27 sinov, hammasi o'tdi**, takroriy yuritishda
ham. Jumladan: karta raqami va uch xil formatdagi telefon bo'yicha qidiruv,
409 va `force`, birlashtirishda balans va qatorlarning ko'chishi, manbaning
arxivga o'tishi, va birlashtirish **yangi yaxlitlik xatosi qo'shmagani**.

**Sinov davomida topilgan xatolar:** marshrut nomi to'qnashuvi (404) va
`NAME_TABLES` da bo'lmagan maydon (`Visit.patientName` yo'q — butun
birlashtirishni yiqitardi).

---

# RELIZ 8 — Kunlik ish tezligi (P1)

Registrator kuniga 100 bemor kiritadi. Har kiritishda 10 soniya yutilsa — kuniga
17 daqiqa, oyiga 6 soat.

## 8.1. Qidiruv serverga o'tadi

**Muammo.** Serverda **to'g'ri yozilgan** qidiruv endpointi bor
(`backend/server.ts:1863-1893`): ism, familiya, telefon, **karta raqami**,
**JSHSHIR**, raqamlarni ajratib qidirish, `take: 50`. `services/api.ts:257` da
mijoz tomoni ham bor.

**Undan hech kim foydalanmaydi.** Registratura brauzerdagi massivni filtrlaydi va
faqat ism + telefon bo'yicha (`pages/Reception.tsx:86-93`), Bemorlar ro'yxati ham
xuddi shunday (`pages/Patients.tsx:72-77`).

Ya'ni registrator karta raqami bo'yicha bemorni **umuman topa olmaydi**, garchi
server buni qila olsa ham.

**Yechim.** Reception va Patients qidiruvini `api.patients.search()` ga
o'tkazish, 250 ms debounce bilan. Bu 10.2 (pagination) ga ham tayyorgarlik.

**Qabul mezoni.** Karta raqamining bir qismini kiritganda bemor topiladi.
15 000 bemorli bazada qidiruv 200 ms dan tez.

**Hajm:** 0.5 kun. **Xavf:** yo'q.

## 8.2. Klaviatura ergonomikasi

**Muammo.** Butun kodda `keydown` faqat AI oynasida ishlatilgan
(`pages/DentaAiMode.tsx:246`). Global tezkor tugmalar yo'q, fokus tartibi
o'ylanmagan.

**Yechim.**

| Tugma | Amal |
|---|---|
| `F2` | Registratura: yangi qabul, fokus qidiruvda |
| `F3` | Istalgan joydan bemor qidirish |
| `F4` | Kassa: to'lov qabul qilish |
| `Enter` | Qidiruvda: yagona natija bo'lsa uni tanlaydi |
| `Esc` | Modal yopiladi / qidiruv tozalanadi |
| `Ctrl+S` | Ochiq forma saqlanadi |

Qo'shimcha: Registraturada bemor tanlangach fokus avtomatik bo'limga, bo'lim
tanlangach shifokorga o'tadi — sichqonsiz to'liq oqim.

**Shtrix-kod skaneri** alohida ish talab qilmaydi: skaner klaviatura sifatida
ishlaydi, `F3` + tez kiritish + `Enter` uni o'zi qo'llab-quvvatlaydi. Faqat
qidiruv maydonida "tez kiritilgan uzun satr" ni skaner deb tanib, avtomatik
tanlash kerak.

**Qabul mezoni.** Yangi bemorni qabulga yozish sichqonga tegmasdan bajariladi.

**Hajm:** 1.5 kun. **Xavf:** past.

## 8.3. Takror bemor tekshiruvi

**Muammo.** `POST /api/patients` da bir xil ism + telefon tekshirilmaydi. Lid
uchun tekshiruv bor (`backend/server.ts:4480`), bemor uchun yo'q. Bir yildan
keyin bazada "Karimov Aziz" ning uch nusxasi bo'ladi, har birida tarixning bir
bo'lagi — bu tibbiy xavf, faqat noqulaylik emas.

**Yechim.**

1. Server: yaratishdan oldin bir xil telefon **yoki** (ism + familiya + tug'ilgan
   sana) bo'yicha qidiradi. Topilsa **409** va topilgan bemorlar ro'yxati.
2. UI: "Bunday bemor bor: Karimov Aziz, +998 90 …, oxirgi tashrif 12.03.2026.
   [Shu bemor] [Baribir yangi yaratish]". Bloklamaydi — tanlov beradi.
3. Sozlamalarga "Takrorlarni topish" — mavjud bazadagi shubhali juftliklar va
   ularni birlashtirish (`merge`): tarix, cheklar va qabullar bitta kartaga
   ko'chadi, ikkinchisi arxivga.

**Qabul mezoni.** Bir xil telefon bilan ikkinchi bemor yaratishga urinilganda
ogohlantirish chiqadi. Birlashtirilgan bemorda ikkala tarix ham ko'rinadi.

**Hajm:** 2 kun (birlashtirish — shundan 1.5 kun). **Xavf:** o'rta —
birlashtirish qaytarib bo'lmaydigan amal, tranzaksiya va tasdiqlash shart.

## 8.4. Ma'lumot kiritish sifati

**Muammo.** `AddPatientModal` faqat ism va familiyani tekshiradi
(`components/AddPatientModal.tsx:63`). Telefon formati, tug'ilgan sana
mantiqiyligi tekshirilmaydi.

**Yechim.** `utils/phone.ts` allaqachon bor — undan foydalanish. Telefon niqobi
(+998 __ ___ __ __), tug'ilgan sana kelajakda bo'lmasligi va 120 yildan
oshmasligi, JSHSHIR uzunligi 14 ta raqam.

**Hajm:** 0.5 kun. **Xavf:** yo'q.

**RELIZ 8 JAMI: ~5 kun.**

---

## RELIZ 9 — bajarildi (2026-08-28)

| Band | Holat |
|---|---|
| 9.1 SSE hodisalar oqimi | ✅ |
| 9.2 Kritik ekranlar obunasi | ✅ |
| 9.3 Smena poygasi | ✅ |

### 9.1 — Hodisalar oqimi

`backend/events.ts` — `GET /api/events`, klinika bo'yicha ajratilgan, 25
soniyalik tiriklik signali bilan. `hooks/useLiveUpdates.ts` — mijoz tomoni.

**To'rtta qaror:**

1. **SSE, WebSocket emas.** Bir tomonlama oqim yetarli, u oddiy HTTP ustida
   ishlaydi — mavjud autentifikatsiya, CORS va Cloudflare tunnel bilan
   qo'shimcha ishsiz ketadi.
2. **Hodisa ma'lumot tashimaydi**, faqat "nima o'zgardi" ni. Ekran o'zi
   qayta so'raydi. Oqim yengil qoladi va **bemor ismi ochiq kanalga
   chiqmaydi** — sinovda alohida tekshirildi.
3. **`EventSource` emas, `fetch` + `ReadableStream`.** `EventSource` sarlavha
   yubora olmaydi, ya'ni tokenni URL ga qo'yishga to'g'ri kelardi va u server
   jurnaliga tushardi. Narxi — qayta ulanishni o'zimiz yozdik (baribir kerak edi).
4. **Bitta ulanish, ko'p obunachi.** Ulanish modul darajasida: beshta ekran
   ochilgan kompyuterda ham bitta oqim.

**Uzilsa — polling ga qaytadi.** Ekranlar oqim tirikligiga qarab 30 soniyalik
so'rovni yoqadi/o'chiradi. Ya'ni eng yomon holatda **avvalgi xatti-harakat**
qoladi: yomonlashuv yo'q, faqat yaxshilanish.

### 9.2 — Ekranlar

`MyQueue`, `Reception`, `Inpatient` obunaga o'tdi. Hodisalar yozuv
nuqtalariga qo'yildi: qabul ochilishi va holati, to'lov, muolaja, tahlil
natijasi, diagnostika xulosasi, statsionar ko'chirishi.

> **`QueueBoard` ATAYLAB polling da qoldi.** Tablo televizorda turadi va
> **login talab qilmaydi**, ya'ni autentifikatsiya so'raydigan oqimga ulana
> olmaydi. Bu yerda 5 soniyalik so'rov — yagona to'g'ri yechim, kamchilik emas.

### 9.3 — Smena poygasi

`POST /api/cash-register/open` da holat tashqarida o'qilib, keyin `upsert`
bajarilardi. Ikki kassir bir vaqtda bossa ikkalasi ham o'tar, jurnalda ikkita
"ochildi" qolar va `openedByName` da ikkinchisining ismi turardi — smenani
kim ochgani noto'g'ri yozilardi. Endi tekshiruv va yozuv bitta tranzaksiyada,
ikkinchisi **409 `SHIFT_CONFLICT`** oladi.

### Tekshiruv

`backend/_t_events.ts` — **16 sinov, hammasi o'tdi.**

| Sinov | Natija |
|---|---|
| Qabul ochildi → ikkinchi ekran | **35 ms** da yetib bordi |
| Hodisada bemor ismi | yo'q (maxfiylik) |
| To'lov → laboratoriya ekrani | yetib bordi |
| Ikki ekran bir vaqtda | ikkalasi ham oldi |
| Tokensiz ulanish | 401 |
| To'satdan uzilish | server ishlayapti, yangi ulanish hodisa oladi |
| Ikki kassir smenani ochadi | biri 200, ikkinchisi 409 |

Ilgari bu javob "30 soniyagacha yoki umuman yo'q" edi.

---

# RELIZ 9 — Ko'p ish o'rni (P1)

## 9.1. Real vaqtda yangilanish

**Muammo.** Hozir `MyQueue` 30 soniyada bir marta so'raydi
(`pages/MyQueue.tsx:79`), `QueueBoard` ham (`pages/QueueBoard.tsx:93`), qolgan
ekranlar **umuman yangilanmaydi** — App.tsx bir marta yuklaydi va shu holicha
turadi.

Kunlik sahnalar:

- Registrator bemorni yozdi → shifokor ekranida 30 soniyagacha yo'q.
- Kassir to'lovni qabul qildi → laborant hali "to'lanmagan" ko'radi, natija
  kirita olmaydi (402), kassirga qo'ng'iroq qiladi.
- Ikki registrator bir vaqtda ishlaydi → biri ikkinchisining qabulini ko'rmaydi.

**Yechim: SSE (Server-Sent Events).** WebSocket emas — SSE bu yerda to'g'riroq:
bir tomonlama, HTTP ustida ishlaydi, proksi va Cloudflare tunnel bilan muammosiz,
uzilsa brauzer o'zi qayta ulanadi.

1. `GET /api/events` — `text/event-stream`, autentifikatsiya bilan, klinika
   bo'yicha filtrlangan.
2. Server hodisa yuboradi: `visit.created`, `visit.status`, `charge.paid`,
   `lab.result`, `admission.changed`, `queue.called`. Hodisa **ma'lumotni emas,
   faqat "nima o'zgardi" ni** tashiydi — ekran o'zi kerakli joyni qayta so'raydi.
   Bu SSE ni yengil qoldiradi va maxfiylik muammosini bermaydi.
3. `hooks/useLiveUpdates.ts` — bitta umumiy ulanish, sahifalar unga obuna bo'ladi.
4. Ulanish uzilsa: 30 soniyalik polling ga qaytadi (hozirgi xatti-harakat) —
   ya'ni yomonlashuv yo'q, faqat yaxshilanish.

**Qabul mezoni.** Ikki brauzer ochiq: birida qabul ochilsa, ikkinchisida 1
soniyada ko'rinadi. Tarmoq uzilib ulansa — o'zi tiklanadi.

**Hajm:** 3 kun. **Xavf:** o'rta — Electron va LAN da alohida sinash kerak.

## 9.2. Kritik ekranlar obunasi

`MyQueue`, `Reception`, `CashBook`, `LabOrders`, `Diagnostics`, `Inpatient`,
`QueueBoard` — hammasi `useLiveUpdates` ga o'tadi. Polling `setInterval` lar olib
tashlanadi.

**Hajm:** 1.5 kun.

## 9.3. Smena va kassa konflikti

**Muammo.** Ikki kassir bitta smenani yopishi yoki bir vaqtda ochishi mumkin.
Smena holati `CashRegisterDay` da, lekin qulf yo'q.

**Yechim.** Smena ochish/yopish tranzaksiya ichida, holat qayta o'qiladi, mos
kelmasa 409. 7.3 dagi optimistik qulf naqshining o'zi.

**Hajm:** 1 kun.

**RELIZ 9 JAMI: ~6 kun.**

---

## RELIZ 10 — bajarildi (2026-08-28)

**O'lchangan natija: 41.1 MB → 1.9 MB (95% kam).** Qabul mezoni (2 MB dan
kam) bajarildi.

| Nima | Qator | Hajm |
|---|---|---|
| **Ilgari** — butun jadval | 110 010 | 41.1 MB |
| **Endi** — 45 kunlik oyna + 500 bemor | ~8 800 | **1.9 MB** |

### Nima qilindi

**10.2 — server tomonda filtr.** `/api/transactions`, `/api/appointments` ga
`from`/`to`/`limit`, `/api/patients` ga `limit`. **Orqaga mos:** parametrsiz
chaqiruv ilgarigidek butun massiv qaytaradi.

**10.3 — kirishda cheklangan oyna.** `App.tsx` endi oxirgi **45 kun** va
**500 bemor** yuklaydi. Qidiruv allaqachon serverda (8.1).

**10.4 — bosh sahifa raqamlari serverda.** `/api/reports/dashboard` bemorlar
soni, bugungi tushum, oylik tushum va qarzni sanaydi. Bu 10.3 bilan **birga**
ketishi shart edi: qisqargan ro'yxatdan sanalgan son yolg'on bo'lardi.

### Eng muhim qism: jimgina yolg'ondan qochish

Oynani qisqartirish o'z-o'zidan XAVFLI: sana oralig'i tanlanadigan ekranlar
propdagi to'liq bo'lmagan ro'yxatdan hisoblab, **ishonchli ko'rinadigan
yolg'on son** ko'rsatardi. Eng yomon xato turi — ekranda hech narsa
buzilmagandek turadi.

Shuning uchun oyna tashqarisiga chiqadigan HAR BIR ekran o'z oralig'ini o'zi
so'raydigan qilindi:

| Ekran | Qachon serverdan so'raydi |
|---|---|
| Bosh sahifa | tanlangan davr 45 kundan eski bo'lsa |
| Kassa kitobi | tanlangan kun yoki oy oynadan eski bo'lsa |
| Kalendar | ko'rinayotgan oy oynadan eski bo'lsa |
| Shifokorlar tahlili | `3 oy` / `6 oy` / `yil` / `butun davr` tanlansa |
| Moliyaviy hisobot | allaqachon to'liq server API da edi |

### Nima qilinmadi

`PatientDetails`, `DoctorDetails`, `FinanceHub` hali proplardan o'qiydi. Ular
bitta bemor yoki shifokor kesimida ishlaydi va oynadan tashqariga chiqsa
to'liq bo'lmagan tarix ko'rsatishi mumkin. Bu keyingi qadam — lekin ular
raqam SANAMAYDI, ro'yxat ko'rsatadi, ya'ni xato "kam ma'lumot" ko'rinishida,
"yolg'on son" ko'rinishida emas.

## SUPER_ADMIN olib tashlandi (2026-08-28)

100 ta joyda edi. Olib tashlash **xavfsizlikni oshirdi**, kamaytirmadi:

| Naqsh | Ilgari | Endi |
|---|---|---|
| `getScopedClinicId` | SUPER_ADMIN uchun **mijoz yuborgan** `clinicId` ga ishonardi | har doim **tokendan** |
| Egalik tekshiruvlari | `role !== 'SUPER_ADMIN' && ...` — istisno bor edi | **har doim** tekshiriladi |
| `requireRole(..., 'SUPER_ADMIN')` | 22 joyda | olib tashlandi |
| Login shoxi | env o'zgaruvchilari bilan kirish | butunlay olib tashlandi |
| `UserRole` enum, interfeys | 6 joyda | olib tashlandi |

**Nima uchun xavfsiz bo'ldi:** rol hech qachon ishlatilmagan (kirish uchun
`SUPERADMIN_USERNAME` va `SUPERADMIN_PASSWORD` kerak, ular sozlanmagan), lekin
u tekshiruvlarda **istisno** yaratib turardi. Istisnoni olib tashlash — kodni
qat'iyroq qiladi.

**Qolgani:** `requireRole('SUPER_ADMIN')` bilan himoyalangan 21 ta SaaS
endpointi (demo so'rovlari, lid API kaliti). Ular endi **erishib bo'lmaydigan
o'lik kod** — hech kim bu rolga ega bo'lolmaydi. Ularni o'chirish alohida,
xavfsiz ish; hozir zarari yo'q.

## 11.2 — Testlar (bajarildi 2026-08-28)

> ### ⚠️ Sinovlar repoga TUSHMAYOTGAN ekan
>
> Bu ish davomida yozilgan 166 sinov `backend/_t_*.ts` fayllarida edi.
> `.gitignore` da esa `backend/_*` qatori bor — ya'ni **hammasi
> e'tiborsiz qoldirilgan**. Sessiya tugashi bilan ular yo'qolar edi.
>
> Shuning uchun 11.2 birinchi navbatda ko'chirish ishi bo'ldi.

**Nima qilindi.**

| Nima | Qayerga |
|---|---|
| Sof birlik sinovlari | `backend/tests/*.test.ts` — **vitest**, serversiz, 0.5 s |
| HTTP sinovlari | `backend/tests/api/` — kuzatiladigan papka |
| O'lchov skriptlari | `backend/tests/bench/` |
| Yurituvchi | `backend/tests/run-api.ts` |
| Hujjat | `backend/tests/README.md` |

```
npm test          # 35 birlik sinovi, ~0.5 s
npm run test:api  # 7 to'plam, serverni o'zi ko'taradi
npm run test:all  # ikkalasi
```

**`run-api.ts` nima qiladi:** bazaning alohida nusxasini yasaydi, sinov
parolini qo'yadi, serverni bo'sh portda ko'taradi, to'plamlarni **qat'iy
tartibda** yuritadi va oxirida hammasini tozalaydi.

**Tartib qat'iy bo'lishining sababi** README ga yozildi: `integrity` ataylab
ma'lumot buzadi va faqat balansni tuzatadi — undan keyin yuritilgan har qanday
sinov "bazada buzilish bor" deb yiqiladi. Bu bir marta sodir bo'lgan va
sababini topish uchun yarim soat ketgan.

**Natija:** 35 birlik + 135 API = **170 sinov**, hammasi repoda va bitta
buyruq bilan qayta yuritiladi.

### O'lchov skriptlari ham saqlandi

`tests/bench/` — bular sinov emas, savolga javob beradigan o'lchovlar. Ular bu
ishda **ikkita taxminni rad etgan** va shuning uchun saqlanishi kerak:

| Skript | Natija |
|---|---|
| `scale.ts` | 41 MB, 1.3 s — "dastur ochilmay qoladi" rad etildi |
| `readlat.ts` | `connection_limit=1` o'qishni 14 barobar sekinlashtiradi — qo'yilmadi |
| `locking.ts` | qulf xatosi 0 — "retry majburiy" rad etildi |


## 11.3 — denta7 qoldiqlari (bajarildi 2026-08-28)

| Nima | Holat |
|---|---|
| AI promptlari "stomatolog" deydi | ✅ mutaxassislikka bog'landi |
| `cloudflareAuto.ts` da `denta-crm.com` | ✅ olib tashlandi |
| `FB_WEBHOOK_VERIFY_TOKEN` = `denta_leads_secret` | ✅ standart qiymat olib tashlandi |
| `clinicName || 'Denta CRM'` | ✅ `'Klinika'` |
| `DentaAiMode` komponenti | ✅ `AiAssistant` |
| `SUPER_ADMIN` va `SubscriptionPlan` | ⏳ alohida ish — quyida |

**AI promptlari.** Ular denta7 dan o'zgarmasdan ko'chgan edi: *"Sen tajribali
STOMATOLOG-maslahatchisan"*. Ko'p profilli klinikada bu shunday ko'rinardi —
kardiolog AI yordamchini ochsa, unga tish davolash rejasi tuzib berilardi.
Endi mutaxassislik so'rovda keladi (`specialty`), berilmasa umumiy amaliyot.

> **`denta-crm.com` — mina bo'lib turgan ekan.** `cloudflareAuto.ts` da domen
> QATTIQ yozilgan va subdomen `denta-${uid}` deb nomlanardi. Ya'ni Cloudflare
> kalitlari qo'yilsa, XClinic **denta7 ning domenida** DNS yozuvi yaratardi.
>
> Modul hech qayerdan chaqirilmaydi va kalitlarsiz ishlamaydi — ya'ni tirik
> xavf emas edi. Lekin XClinic denta7 ning hisoblariga tegmasligi shart, va
> qattiq yozilgan begona domen shu shartni buzishga tayyor turardi. Endi
> domen `CLOUDFLARE_TUNNEL_DOMAIN` dan olinadi, u yo'q bo'lsa modul umuman
> ishlamaydi.

### `SUPER_ADMIN` — nima uchun HOZIR olib tashlanmadi

XClinic bitta o'rnatma = bitta klinika, ya'ni superadmin tushunchasi keraksiz
meros. Lekin u **64 joyda** (faqat `server.ts` da) va yana o'nta faylda —
har biri egalik tekshiruvi (`getScopedClinicId`, `requireRole`,
`assertOwnership`). Uni oxirida shosha-pisha olib tashlash aynan o'sha
tekshiruvlardan birini tushirib qoldirish xavfini beradi.

**Tekshirildi: hozir o'lik.** Kirish uchun `SUPERADMIN_USERNAME` va
`SUPERADMIN_PASSWORD` env o'zgaruvchilari kerak, ular sozlanmagan — ya'ni
hech kim SUPER_ADMIN sifatida kira olmaydi.

Bu alohida, o'z sinovlari bilan qilinadigan ish: rollarni olib tashlash,
`SubscriptionPlan` ni sxemadan chiqarish, `plans` propini o'nlab
komponentdan yechish.

## 11.4 — Lokalizatsiya (bajarildi 2026-08-28)

| Ekran | `t()` chaqiruvlari |
|---|---|
| Kompyuter menyusi | allaqachon tarjima qilingan edi |
| **Telefon menyusi** (`BottomNav`) | tarjimaga o'tkazildi |
| Registratura | 25 |
| Mening navbatim | 7 |
| Laboratoriya | 22 |
| Diagnostika | 19 |
| Qabul ish stoli | 20 |
| Statsionar | 37 |

Oltala ekranda qattiq yozilgan matn **qolmadi** (avtomatik tekshiruv: 0).

**Nima uchun telefon menyusi birinchi.** Kompyuter menyusi `labelKey` bilan
tarjima qilinardi, telefon menyusi esa yorliqlarni qattiq yozgan edi — ya'ni
bir xil menyu ikki qurilmada ikki xil tilda chiqardi.

### Yon natija: OLDINDAN mavjud bo'shliqlar topildi

Butun loyiha bo'yicha `t()` chaqiruvlari tarjima fayli bilan solishtirildi:

- **8 ta kalit o'zbekchada ham yo'q edi** (`common.close`, `common.send`,
  `common.back`, `common.min` va boshqalar) — foydalanuvchi ekranda xom kalit
  nomini ko'rardi;
- 24 ta kalit faqat ruschada yo'q edi.

Hammasi to'ldirildi. Endi butun loyihada **yetim kalit yo'q** (0/0).

### Ikki tuzoq — kelgusi ish uchun

1. **O'zbekcha apostrof.** `qo'shish`, `bo'lim` — bular JS satrini uzadi.
   Tarjima fayliga **qo'sh tirnoq** bilan yozish kerak: `"Bo'lim"`. Sinov
   davomida to'rtta matn shu sababdan buzilib, keyin tuzatildi.

2. **Partiyani o'tkazib yuborish.** Avtomatlashtirilgan skript "birinchi kalit
   allaqachon bor ekan" deb butun partiyani o'tkazib yuborgan edi — natijada
   Statsionar ekrani mavjud bo'lmagan 4 ta kalitga murojaat qilardi va
   foydalanuvchi xom kalit nomini ko'rardi. Yakuniy tekshiruv (har `t()`
   kaliti ikkala tilda bormi) buni topdi.

   **Shu tekshiruvsiz tarjima ishini yopib bo'lmaydi.**

## 11.5 — Interfeys sayqali (bajarildi 2026-08-28)

`components/Common.tsx` ga uchta qayta ishlatiladigan komponent:

| Komponent | Nima uchun |
|---|---|
| `Skeleton` | bitta kulrang chiziq |
| `SkeletonList` | ro'yxat skeleti — kelayotgan qatorlarning o'rnini egallaydi |
| `EmptyState` | ikona + sarlavha + **maslahat** + amal |

**Muammo nimada edi.** Ekranlar ma'lumot kelguncha bo'sh turardi yoki
"Yuklanmoqda..." degan bitta satr ko'rsatardi. Ikkalasi ham yomon:
birinchisida foydalanuvchi dastur qotib qoldi deb o'ylaydi, ikkinchisida
ma'lumot kelganda sahifa **sakraydi** — matn yo'qolib, o'rniga ro'yxat chiqadi.

Skelet ikkalasini ham hal qiladi: joy oldindan band qilinadi, harakat esa
"ishlayapti" degan signal beradi.

**`EmptyState` da `hint` ATAYLAB majburiy emas, lekin tavsiya etiladi.**
"Yo'llanmalar yo'q" degan xabar foydalanuvchini nima qilishni bilmagan holda
qoldiradi. "Shifokor tahlilga yo'llanma yozganda ular shu yerda paydo bo'ladi"
esa savolni yopadi.

**Qo'llanildi:** `MyQueue`, `FinanceReport` (skelet), `LabOrders`,
`Diagnostics`, `Inpatient` (bo'sh holat + maslahat).

Yangi matnlar ikkala tilga qo'shildi va yetim kalit tekshiruvi toza.

## 11.1 — Pul turi (bajarildi 2026-08-28)

### 11.1-A — yagona yaxlitlash: BAJARILDI

`backend/money.ts` — pul bilan ishlashning yagona joyi:

| Funksiya | Nima uchun |
|---|---|
| `som(n)` | pul — **butun so'm** (tiyin muomaladan chiqqan) |
| `qty(n)` | ombor miqdori — uch xona (0.5 ampula, 2.5 ml real qiymatlar) |
| `pct(n)` | foiz — bir xona |
| `splitProportionally(total, weights)` | **eng katta qoldiq** usuli bilan taqsimot |

**`round()` ning YETTITA nusxasi topildi va almashtirildi** — rejada oltita
deb yozilgan edi, yettinchisi `server.ts` dagi `computeExpectedCash` da
chiqdi, ya'ni aynan **kassa hisobida**. Aniqliklari ham har xil edi
(`*100` va `*1000`), ya'ni bitta summa ikki modulda ikki xil yaxlitlanardi.

**`splitProportionally` shunchaki almashtirish emas.** Butun songa o'tish
proportsional taqsimotni buzardi: 100 000 ni uchga bo'lsak har biri 33 333,
yig'indi 99 999 — bitta so'm yo'qoladi va yaxlitlik tekshiruvi (7.5) buni
darhol "buzilish" deb ko'rsatardi. To'lovda ikki qavatli kafolat qo'yildi:
qatorlar bo'yicha eng katta qoldiq, usullar bo'yicha esa **oxirgi usul
qolgan summani oladi**.

### 11.1-B — ustun turini `Int` ga ko'chirish: QILINMADI, sababi o'lchov

Reja `Float` → `Int` ko'chirishni talab qilgan edi. O'lchov buni **keraksiz**
deb ko'rsatdi:

| O'lchov | Natija |
|---|---|
| Hozirgi bazada kasrli pul | **0** (68 qator) |
| `splitProportionally`, 2000 ta tasodifiy holat | yig'indi **aynan** teng, hammasi butun |
| Eng yomon to'lov (33333/33333/33334, ikki usul + foizli chegirma) | bazada kasr **0** |
| To'lov yig'indisi qatorlarga mos | **aynan** |

Ya'ni yozish nuqtalari kafolatni allaqachon beradi. Ko'chirishning narxi esa
yuqori: ~20 jadvalni qayta qurish, migratsiya mexanizmi buni bajara olmaydi
(`PRAGMA foreign_keys` tranzaksiya ichida ishlamaydi), va bularning hammasi
ishlayotgan klinika bazasida.

**Buning o'rniga arzon qo'riqchi qo'yildi:** yaxlitlik tekshiruviga
`money_precision` bandi qo'shildi — 9 ta pul ustunini skanerlaydi va kasr
paydo bo'lsa darhol ko'rsatadi. Sinovda tasdiqlandi: qo'lda kiritilgan
0.37 topildi.

> **Fikrni o'zgartiradigan narsa:** agar `money_precision` biror klinikada
> kasr ko'rsatsa — demak yozish nuqtasi `money.ts` dan o'tmayapti. Avval
> o'sha nuqta tuzatiladi; ustun turi baribir oxirgi chora bo'lib qoladi.

---

# RELIZ 10 — Tarmoqdan kirish tezligi (P2)

> Reliz ilgari "Dasturning umri" deb atalgan edi va asosi "2-3 yildan keyin
> dastur ochilmay qoladi" degan taxmin edi. O'lchov buni rad etdi (10.1) —
> nom ham, asos ham haqiqiy foydaga qarab tuzatildi.

Bu relizni kechiktirish mumkin, lekin **bekor qilib bo'lmaydi**. Har oy
kechiktirilgani uni qimmatlashtiradi, chunki baza o'sadi va ko'chiriladigan
ekranlar ko'payadi.

## 10.1. Muammoning kattaligi — O'LCHANDI (2026-08-28)

`App.tsx:220-245` da `Promise.all` bilan 19 ta so'rov yuboriladi va ularning
ichida **hamma** bemor, **hamma** tranzaksiya, **hamma** qabul, xarajat, ombor va
hisob qatori bor. `/api/patients` da `take`/`skip` yo'q (`backend/server.ts:1767`),
`/api/transactions` da ham yo'q (`backend/server.ts:2284`).

> ### ⚠️ Bu bo'limdagi oldingi baho NOTO'G'RI edi
>
> Ilgari bu yerda "3 yildan keyin kirish 25–40 soniya, telefonda brauzer
> yiqiladi" deb yozilgan edi. **O'lchanmagan taxmin edi va oshirib
> yuborilgan.** Uch yillik hajmdagi baza yasab (`backend/_t_scale.ts`)
> haqiqiy raqamlar olindi.

**O'lchov sharti:** 15 000 bemor, 55 000 tranzaksiya, 40 000 qabul,
130 000 hisob qatori (kuniga 60 bemor × 300 kun × 3 yil).

| Nima | Qator | Hajm | Vaqt |
|---|---|---|---|
| Bemorlar | 15 005 | 6.9 MB | 580 ms |
| Tranzaksiyalar | 55 005 | 21.9 MB | 1227 ms |
| Qabullar | 40 000 | 13.2 MB | 672 ms |
| **Jami (parallel)** | **110 510** | **41 MB** | **1.3 s** |

Qo'shimcha: `JSON.parse` 142 ms (shu paytda interfeys qotadi), JS obyektlari
xotirada 43 MB. Besh yilda taxminan ikki barobar: ~82 MB, ~86 MB, ~284 ms.

**Ya'ni dastur ochilmay qolmaydi.** O'sish chiziqli — jar emas, qiyalik.

### Muammo qayerda ekan

Localhost'da 41 MB tekin. Lekin README ga ko'ra klinikadagi ikkinchi kompyuter
va shifokorning telefoni `http://<server-ip>:3001` orqali kiradi — va u yerda
41 MB tekin emas:

| Tarmoq | 41 MB qancha vaqt |
|---|---|
| localhost | 1.3 s (o'lchandi) |
| LAN 50 Mbit/s | ~7 s (baholash) |
| Telefon, zaif Wi-Fi 20 Mbit/s | ~16 s (baholash) |

Va bu **har kirishda va har sahifa yangilanishida** takrorlanadi.

Solishtirish uchun o'sha bazada server qidiruvi: **50 qator, 23 KB, 16 ms**.
Ya'ni kerakli ma'lumot 41 MB emas, 23 KB.

### Bahoning tuzatilishi

| Ilgari | Haqiqat |
|---|---|
| "2–3 yildan keyin ochilmay qoladi" | ochiladi, faqat sekinlashadi |
| "telefonda brauzer yiqiladi" | 43 MB — og'ir, lekin halokatli emas |
| Ustuvorlik: shoshilinch | P2 to'g'ri, lekin **jar yo'q** |

**Relizning haqiqiy foydasi:** LAN va telefondan kirish 7–16 soniyadan
1 soniyaga tushadi. "Dastur ishlamay qoladi" emas.

Eng qimmatli qismi esa **allaqachon qilingan**: qidiruv serverga o'tgan (8.1),
ya'ni eng ko'p ishlatiladigan amal endi 41 MB emas, 23 KB.

## 10.2. Server tomonda pagination va filtr

**Yechim.** Quyidagi endpointlarga `?page`, `?limit`, `?from`, `?to`, `?q`
qo'shiladi va javob `{ items, total, page }` ko'rinishiga o'tadi:

`/api/patients`, `/api/transactions`, `/api/appointments`, `/api/charges`,
`/api/expenses`, `/api/stock-movements`, `/api/lab-orders`, `/api/leads`.

**Orqaga moslik (3-qoida).** Parametrsiz chaqiruv eski ko'rinishda massiv
qaytaradi. Yangi format faqat `?page` berilganda. Shunda ekranlarni bittalab
ko'chirish mumkin, hammasini bir kunda emas.

**Hajm:** 3 kun.

## 10.3. Ekranlarni global do'kondan ajratish

**Muammo.** App.tsx hamma narsani `useState` da ushlaydi va sahifalarga `props`
orqali uzatadi. Sahifa o'z ma'lumotini o'zi so'ramaydi.

**Yechim.** Bosqichma-bosqich, xavf tartibida:

1. `Patients` — serverdan qidiruv + sahifalash (8.1 dan keyin oson).
2. `CashBook` va `FinanceReport` — sana oralig'i bo'yicha.
3. `Calendar` — ko'rinayotgan hafta/oy bo'yicha.
4. `Inventory`, `Leads`, `MessagesManagement`.
5. App.tsx da faqat **kichik va tez-tez kerak bo'ladigan** ro'yxatlar qoladi:
   shifokorlar, bo'limlar, xizmatlar, kategoriyalar, klinika sozlamalari.

**Qabul mezoni.** 15 000 bemorli sinov bazasida (`_t_scale.ts` yasaydi) kirishda
yuklanadigan hajm 41 MB dan **2 MB dan kamga** tushsin — vaqt emas, HAJM
o'lchanadi, chunki muammo tarmoqda va u kompyuterga qarab o'zgaradi.

**Hajm:** 5 kun.

## 10.4. Hisobotlar server tomonda hisoblanadi

**Muammo.** `Dashboard` va `FinanceReport` brauzerdagi massivlarni sanaydi. 10.3
dan keyin bu massivlar to'liq bo'lmaydi — ya'ni hisobotlar avtomatik buziladi.
Shuning uchun bu ish 10.3 bilan **birga** ketishi kerak, keyin emas.

**Yechim.** `backend/reports.ts` allaqachon bor va 793 qator — agregatsiyalar
o'sha yerga qo'shiladi. `GET /api/reports/dashboard?from&to` bitta so'rovda tayyor
raqamlar qaytaradi.

**Hajm:** 2 kun.

## 10.5. Indekslar

Sxemada 94 ta `@@index` bor — bu yaxshi asos. 10.2 dagi yangi filtrlar bo'yicha
`EXPLAIN QUERY PLAN` bilan tekshirish va yetishmaganini `0029_indexes.sql` da
qo'shish.

**Hajm:** 0.5 kun.

**RELIZ 10 JAMI: ~10 kun.**

---

# RELIZ 11 — Pul turi va sifat (P2/P3)

## 11.1. Pul `Float` dan `Int` ga

**Muammo.** Sxemada 20+ pul maydoni `Float`: `balance`, `basePrice`,
`finalPrice`, `amount`, `countedCash`, `expectedCash`, `difference` va boshqalar.
So'm butun son bo'lgani uchun ko'p hollarda ko'rinmaydi, lekin chegirma foizi
(`discountPercent`), qisman to'lovni qatorlar bo'yicha proportsional taqsimlash
(`backend/billing.ts:470`) va oylik hisob-kitobida 0.0000001 chiqadi. Yil oxirida
"1 so'm farq" ni tushuntirish og'ir. Bu **C14**.

Qo'shimcha muammo: `round()` funksiyasi **6 marta alohida** yozilgan va aniqligi
bir xil emas — `billing.ts`, `clinical.ts`, `inpatient.ts`, `payroll.ts`,
`reports.ts` da `Math.round(n*100)/100`, `inventory.ts` da esa
`Math.round(n*1000)/1000`.

**Yechim — ikki bosqich.**

**Bosqich A (arzon, 1 kun, darhol qilinadi).** `backend/money.ts` — yagona manba:
pul uchun butun so'mga yaxlitlash, ombor miqdori uchun uch xona. Hamma `round()`
nusxalari o'chiriladi, yozish nuqtalari shu funksiyadan o'tadi. Bu drayfning
**manbasini** yopadi, turni o'zgartirmasdan.

**Bosqich B (qimmat, 3 kun).** Ustunlarni `Int` ga ko'chirish.

> ⚠️ **Muhim texnik cheklov.** SQLite da ustun turini o'zgartirish jadvalni qayta
> qurishni talab qiladi (yangi jadval → nusxalash → o'chirish → nomlash), bu esa
> `PRAGMA foreign_keys=OFF` ni talab qiladi. Lekin migratsiya yurituvchisi har
> faylni **bitta tranzaksiyada** bajaradi (`backend/maintenance.ts:12`), va
> SQLite da `PRAGMA foreign_keys` tranzaksiya ichida ishlamaydi.
>
> Ya'ni bu migratsiya **hozirgi mexanizm bilan bajarilmaydi**. Ikki yo'l:
>
> 1. Yurituvchiga `-- @no-transaction` sarlavhasini qo'llab-quvvatlash qo'shish
>    (~0.5 kun) va shu bayroqli faylda qayta qurish.
> 2. Yoki bu ko'chirishni alohida bir martalik xizmat amali qilib yozish
>    (Sozlamalar → Xizmat ko'rsatish → "Pul turini yangilash"), nusxa olishdan
>    keyin, boshqa hech kim ishlamayotgan paytda.

**Tavsiya:** Bosqich A ni darhol qilish, Bosqich B ni **Reliz 10 dan oldin**
qilish — baza qanchalik kichik bo'lsa, qayta qurish shunchalik xavfsiz.

**Qabul mezoni.** 1000 ta tasodifiy chegirmali to'lovdan keyin
`SUM(ChargePayment.amount)` va `SUM(Transaction.amount)` aynan teng, kasr yo'q.

## 11.2. Testlar

**Muammo.** Butun repoda bitta `.test.*` fayl yo'q. Pul, tannarx va lab normasi
hisoblanadigan tizimda har regressiya faqat klinikada, ish paytida topiladi.

**Yechim.** `vitest` (Vite allaqachon bor, qo'shimcha konfiguratsiya deyarli
kerak emas). Hamma narsani qoplash maqsad emas — **faqat qaytarib bo'lmaydigan
hisob-kitoblar**:

| Modul | Nima sinaladi |
|---|---|
| `utils/financialCalculations.ts` | chegirma, qarz, qisman to'lov taqsimoti |
| `utils/cashbook.ts` | smena kutilgan qoldig'i, usullar bo'yicha ajratish |
| `backend/inventory.ts` | FEFO tartibi, partiya yetmagan holat, manfiy qoldiq |
| `backend/multiprofile.ts` | lab normasi: jins/yosh bo'yicha tanlash, chegara qiymatlar |
| `backend/billing.ts` | to'lov tranzaksiyasi, avans, 409 konflikti |

**Qabul mezoni.** `npm test` ishlaydi, 5 modul qoplangan. CI shart emas —
kommitdan oldin qo'lda yuritish yetarli.

**Hajm:** 3 kun.

## 11.3. denta7 qoldiqlarini tozalash

**Muammo.** Uch guruh qoldiq:

1. **AI promptlari stomatologiya haqida** (`backend/server.ts:1448-1457`):
   "Sen tajribali **stomatolog**-maslahatchisan", "**stomatologiya** klinikasining
   marketing mutaxassisi". Kardiolog AI yordamchini ochsa, tish haqida maslahat
   oladi.
2. **SaaS merosi**: `SUPER_ADMIN` roli (`types.ts:6`) va `SubscriptionPlan`
   modeli. XClinic — bitta o'rnatma, bitta klinika; bu tushunchalar keraksiz va
   ular ruxsatlar mantig'ini murakkablashtiradi.
3. **`DentaAiMode` nomi** — sahifa nomida hali "Denta" turibdi.

**Yechim.** Promptlarni bo'limga bog'lash (kardiolog uchun kardiologiya, laborant
uchun laboratoriya — `Department.type` allaqachon bor). `SUPER_ADMIN` va
`SubscriptionPlan` ni bosqichma-bosqich olib tashlash: avval UI dan, keyin
rollardan, oxirida sxemadan (migratsiya bilan).

**Hajm:** 1.5 kun. **Xavf:** past, lekin `SUPER_ADMIN` ni olib tashlash
`getScopedClinicId` ga tegadi — ehtiyot bo'lish kerak.

## 11.4. Lokalizatsiya

**Muammo.** `uz` va `ru` bor (`i18n/translations.ts`, 1481 qator), lekin **yangi
yozilgan ekranlar tarjimadan foydalanmaydi**. `components/BottomNav.tsx:22-30` da
`'Bosh Paneli'`, `'Bemorlar'` to'g'ridan-to'g'ri kodda. Reception,
VisitWorkspace, Inpatient, LabOrders, Diagnostics — deyarli butunlay qotib qolgan
uzbekcha.

Rus tilini tanlagan foydalanuvchi aralash interfeys ko'radi. O'zbekistonda bu
real muammo: ko'p shifokorlar rus tilida o'qigan.

**Yechim.** Qotib qolgan satrlarni yig'ib chiqish (oddiy skript bilan topiladi),
`translations.ts` ga ko'chirish, `ru` tarjimasini to'ldirish. Yangi ekranlar
uchun qoida: matn faqat `t()` orqali.

**Hajm:** 2 kun. **Xavf:** yo'q.

## 11.5. Interfeys sayqali

**Muammo.** Yuklanish holati deyarli yo'q — `isLoading` faqat `Settings` va
`SignIn` da. Qolgan sahifalar ma'lumot kelguncha bo'sh turadi va foydalanuvchi
dastur qotib qolgan deb o'ylaydi. 10.3 dan keyin (har sahifa o'zi yuklaydi) bu
sezilarli bo'ladi.

**Yechim.** `components/Common.tsx` ga `Skeleton` va `EmptyState`, har sahifada
qo'llash. Mobil zichlik: jadvallar telefonda karta ko'rinishiga o'tsin.

**Hajm:** 1.5 kun.

**RELIZ 11 JAMI: ~8 kun** (Bosqich B alohida hisoblanadi).

---

# Agar vaqt bo'lmasa — minimal variant

Klinikaga qo'yish sanasi yaqin bo'lsa, **5 kunlik** eng zarur to'plam:

| # | Ish | Kun | Nima beradi |
|---|---|---|---|
| 1 | 7.1 Avtomatik zaxira nusxa | 1.5 | Ma'lumot yo'qolmaydi |
| 2 | 7.3 To'lov tranzaksiyasi | 2 | Kassa mos keladi |
| 3 | 7.6 Kirish xavfsizligi | 1 | Ochiq eshik yopiladi |
| 4 | 8.1 Qidiruv serverga | 0.5 | Karta raqami bo'yicha topiladi |

Qolgani ishlayotgan klinikada, bosqichma-bosqich chiqarilishi mumkin — chunki
ularning hech biri ma'lumotni yo'qotmaydi.

---

# Rejadan tashqarida qoldirilgani

Ataylab kiritilmagan, chunki hozirgi bosqichda foyda bermaydi:

| Nima | Nega yo'q |
|---|---|
| Mikroservislarga bo'lish | Bitta klinika, bitta server. Faqat murakkablik qo'shadi |
| PostgreSQL ga o'tish | SQLite bu yuk uchun yetarli va offline talabga mos |
| Mobil ilova | Brauzer LAN orqali ishlaydi, PWA yetarli |
| To'liq test qoplami | Faqat hisob-kitoblar sinaladi (11.2). Qolganiga vaqt ketadi, foyda kam |
| `server.ts` ni bo'lish (6932 qator) | Xohish bor, lekin xavfi foydasidan katta. Yangi kod alohida fayllarga ketaveradi |
| DMED integratsiyasini tugatish | Endpointlar tasdiqlanmagan (`backend/dmedService.ts:29`). Rasmiy hujjatsiz ish qilish — vaqtni yo'qotish |

---

# Bajarish tartibi va bog'liqliklar

```
RELIZ 7  (P0, 7 kun)  ── mustaqil, birinchi ketadi
   |
   +-- RELIZ 8  (P1, 5 kun)   8.1 mustaqil, qolgani 7 dan keyin
   |      |
   |      +-- RELIZ 9  (P1, 6 kun)   9.3 uchun 7.3 kerak
   |
   +-- 11.1-B (pul turi)  <-- RELIZ 10 dan OLDIN qilinishi kerak
          |
          +-- RELIZ 10 (P2, 10 kun)  10.3 uchun 8.1 va 10.2 kerak
                 |                    10.4 va 10.3 birga ketadi
                 +-- RELIZ 11 (P3, 5 kun)  qolgan sifat ishlari
```

**Kalendar (haftada 5 kun):**

| Hafta | Nima |
|---|---|
| 1–2 | Reliz 7 to'liq + priyomka |
| 3 | Reliz 8 |
| 4 | Reliz 9 (1-qism: SSE) |
| 5 | Reliz 9 (2-qism) + 11.1-A + 11.1-B |
| 6–7 | Reliz 10 |
| 8 | Reliz 11 |

---

# Har reliz uchun priyomka qoidasi

1–6 relizlarda ishlagan tartib saqlanadi: reliz yopilishidan oldin ssenariylar
**boshidan oxirigacha, haqiqiy ma'lumot bilan** o'tkaziladi.

Reliz 7 uchun majburiy ssenariylar:

1. To'lov paytida serverni majburan o'chirish → bazada yarim yozuv yo'qligi.
2. Ikki brauzerdan bir vaqtda bitta qatorni to'lash → biri 409 oladi.
3. Nusxa olish → 5 bemor qo'shish → tiklash → o'sha 5 bemor yo'qligi.
4. 6 marta noto'g'ri parol → 429.
5. Yaxlitlik tekshiruvi 0 nomuvofiqlik ko'rsatadi.

Har ssenariy natijasi BUILD-SPEC ga yoziladi — topilgan xatolar bilan birga.
1–6 relizlarda shu tartib 12 ta xatoni topgan edi; bu ishlaydigan usul.

---

## Sarlavha (header) — foydalanuvchi ko'rsatgan uchta element (2026-08-28)

Foydalanuvchi boshqa dasturning sarlavhasini ko'rsatib, aynan uchtasini
nomladi: **logotip, qidiruv maydoni, AI tugmasi**. Uchalasi ham haqiqiy
farq bo'lib chiqdi — mening "dizayn bir xil" degan xulosam noto'g'ri edi.

| Element | Ilgari | Endi |
|---|---|---|
| Logotip | bitta rangdagi "XClinic" | "X" oq + "Clinic" ko'k — ikki rangli |
| Qidiruv | qo'shimcha ramkali quti ichida, tor (`w-72`), to'rtburchak | ramkasiz, keng (`flex-1 max-w-xl`), yumaloq (`rounded-full`) |
| AI | sarlavhada YO'Q — faqat bosh panel ichidagi tab | binafsha gradient tugma, har sahifadan bir bosishda |

**AI tugmasi qanday ulangan.** Tugma `/?tab=ai` ga o'tadi, `Dashboard`
esa `location.search` ni o'qib tabni ochadi. Tabni QO'LDA bosganda ham
manzil yangilanadi (`navigate(..., {replace:true})`) — busiz holat va
manzil ajralib qolib, tugma **ikkinchi marta bosilganda ishlamasdi**
(manzil o'zgarmagani uchun `useEffect` yonmasdi). Sinovda tekshirildi:
1-bosish → ochildi, "Hisobot" → yopildi, 2-bosish → yana ochildi.

Hamshira bosh panelni ko'rmaydi (moliya u yerda), shuning uchun unga
tugma ham chiqmaydi.

**Yo'l-yo'lakay topilgan ikkita xato:**

1. **Sana "2026 M08 28, Fri" deb chiqardi.** `toLocaleDateString('uz-UZ')`
   Chrome'da o'zbek oy nomlarini bilmaydi va texnik "M08" ni, hafta kunini
   esa inglizcha beradi. Oy va kun nomlari qo'lda yozildi; ruschasi
   `ru-RU` da to'g'ri ishlagani uchun o'sha qoldirildi. Endi: "28 avgust, juma".
2. **Buzuq emoji.** `рџ§Є DEMO MODE` — UTF-8 matn cp1251 sifatida
   o'qilganidan qolgan iz. 🧪 ga tuzatildi.

Qorong'i rejimda qidiruv maydoni ko'rinmay qolgani ham tuzatildi:
`dark:bg-gray-800/70` sarlavha foniga qo'shilib ketardi → `dark:bg-white/[0.07]`
va yengil ramka.

**Tekshirildi:** uchta typecheck toza, `npm run build` o'tdi (2753 modul),
brauzerda yorug'/qorong'i rejimda ko'rildi, qidiruv va AI tugmasi ishlatib
sinaldi. Sinov nusxa bazadagi alohida stendda (3011 → 3021) — foydalanuvchi
ishchi bazasiga tegilmadi.

### Sarlavhaning davomi — yana uchta farq (2026-08-28)

Foydalanuvchi ikkita ekranni yonma-yon qo'yib "farqni sezayapsanmi?" dedi.
Sezildi, va ikkitasi umuman dizayn masalasi emas — **xato** edi.

**1. «UZ UZ» va «RU RU».** Til almashtirgichda bayroq emojisi ishlatilgan
edi. Windows bayroq emojisini CHIZMAYDI: 🇺🇿 aslida ikkita "mintaqa
ko'rsatkichi" harfi va Windows ularni bitta rasmga birlashtirmaydi —
ekranda oddiy "UZ" harflari qoladi. Yonida "uz" yozuvi ham turgani uchun
foydalanuvchi «UZ UZ» ni ko'rardi. Bu Windows uchun mo'ljallangan
dasturda kutilgan xato, chunki ishlab chiquvchi uni ko'rmasligi mumkin —
brauzerda emoji shrifti bo'lsa to'g'ri chiziladi.

Yechim: `components/Flag.tsx` — soddalashtirilgan SVG bayroqlar. Shrift
yoki tashqi rasmga bog'liq emas, ya'ni qayerda ochilsa ham bir xil.

**2. Ekran tepasidan uchta qator ketardi.** Ilgari: (a) "Boshqaruv Paneli"
+ «Hisobot | AI yordamchi» tanlovi, (b) alohida qatorda DAVR va tugmalar.
Namunada esa ikkalasi BITTA qatorda. Birlashtirildi — ish maydonidan
qo'shimcha ~60px ochildi.

**3. AI ikki joyda turardi.** Tugmani sarlavhaga chiqargach, bosh
paneldagi «AI yordamchi» tanlovi o'sha ishni ikkinchi marta bajaradigan
bo'lib qoldi. Tanlov olib tashlandi; AI rejimida sarlavha "AI yordamchi"
ga o'zgaradi va yonida orqaga qaytish strelkasi turadi. Sinovda
tekshirildi: sarlavhadagi tugma → AI ochiladi, strelka → hisobotga qaytadi.

**Tekshirildi:** typecheck toza, build o'tdi, 35 ta birlik sinovi o'tdi,
brauzerda ko'rildi.

### Logotip — "X" (2026-08-28)

**Ilgari nima bo'lgan.** Dasturda uchta turli logotip yurar edi:

- sarlavha, mobil sarlavha, yon panel — `/logo-icon.png`, ya'ni **tish**
  surati (denta7 dan qolgan; XClinic esa umumiy klinika dasturi);
- login sahifasi — **tabassum** belgisi (`M14.828 14.828a4 4 0 01-5.656 0…`);
- brauzer yorlig'i — yana o'sha tish.

**Endi.** `components/Logo.tsx` — bitta SVG belgi, to'rt joyda ham o'sha:
ko'k–indigo gradientli yumaloq plitka va oq "X". "X" ikkita yumaloq uchli
chiziqdan; ko'taruvchi chiziq ostidan fon rangida qalinroq chiziq
o'tkazilgani uchun kesishmada kichik bo'shliq hosil bo'ladi va chiziqlar
bir-birining ustidan o'tgandek ko'rinadi.

Nega SVG, rasm emas: har o'lchamda tiniq (16px favikon ham, Retina ham),
alohida fayl yuklanmaydi — internetsiz kompyuterda kafolatlangan chiziladi.

Favikon `public/logo.svg` ga o'tdi, PNG eski brauzerlar uchun zaxira
sifatida qoldirildi. Login sahifasidagi yozuv ham sarlavhadagi kabi ikki
rangli qilindi.

`gradientUnits="userSpaceOnUse"` ATAYLAB: shundagina to'rtburchak ham,
kesishmadagi bo'shliq chizig'i ham gradientni bitta koordinata maydonidan
oladi va rang aynan mos tushadi. Gradient id lari komponent nusxasiga
qarab yasaladi — bitta sahifada bir nechta logotip bo'lsa, brauzer
birinchisining gradientini hammasiga qo'llab yubormasligi uchun.

### Yo'l-yo'lakay: sinov stendi bilan bog'liq ikki tuzoq

Nusxa baza ustidagi ikkinchi stendni ko'tarishda ikkita xato chiqdi.
Ikkalasi ham hujjatga tushmagan edi, keyingi safar vaqt yo'qotmaslik uchun:

1. **`.env` muhit o'zgaruvchilarini bosib ketadi.** `server.ts` uni
   `override: true` bilan yuklaydi, ya'ni `DATABASE_URL=… PORT=3021 npx
   ts-node server.ts` NUSXAGA emas, `.env` dagi asosiy bazaga ulanadi va
   3001-portni egallaydi. To'g'ri yo'li — `ELECTRON_USER_DATA_PATH` ni
   alohida papkaga qaratish: undagi `.env` oxirgi bo'lib yuklanadi va ustun
   chiqadi.
2. **Git Bash `/api` ni Windows yo'liga aylantiradi.** `VITE_API_URL=/api`
   frontendga `C:/Program Files/Git/api` bo'lib yetib bordi va barcha
   so'rovlar noto'g'ri manzilga ketdi. Oldi: `MSYS_NO_PATHCONV=1`.

Shu bilan birga `vite.config.ts` da backend porti `VITE_BACKEND_PORT`
orqali sozlanadigan qilindi: ilgari 3001 qattiq yozilgan edi va ikkinchi
stendga faqat CORS ga tiraladigan to'g'ridan-to'g'ri ulanish qolardi.
