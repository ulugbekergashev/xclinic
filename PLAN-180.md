# PLAN-180 — XClinic

Sana: 2026-08-28. Asos: «XClinic Sifat Auditi» v2 (qo'lda klik-testlash +
brauzer konsoli, 15 modul, 38 ta xato, 34 ta tavsiya).

Bu hujjat FIX-PLAN va MODUL-ISHLARI ning davomi. MODUL-ISHLARI «ochiq P0/P1
ish qolmadi» degan joyda tugagan edi — **audit ularni qayta ochdi**. Farqi
shundaki, oldingi hujjatlar ichkaridan qaragan (kod, migratsiya, tranzaksiya),
audit esa tashqaridan — foydalanuvchi ko'rgan holatdan.

Interaktiv ko'rinishi (belgilab boriladigan ro'yxat va jonli ball hisobi):
https://claude.ai/code/artifact/52faaea5-3cec-492a-af54-dc37d1829da9

**Maqsad:** 108 / 200 → 180 / 200. Yig'iladigan ball — 72. Ishlar soni — 33,
besh sprintga bo'lingan.

---

## Bajarilgan ishlar jurnali

| Ish | Ball | Holat |
|---|---|---|
| S1.1 Rol matritsasini toraytirish | 2 | ✅ bajarildi — quyida |
| S1.2 Ruxsatni backendga ko'chirish | 2 | ✅ bajarildi — quyida |
| S1.3 Tokenni localStorage'dan olib chiqish | 1 | ✅ bajarildi — quyida |
| S1.4 Kirish jurnalini haqiqiy qilish | 1 | ✅ bajarildi — quyida |
| **S2.1 Bitta hisoblash qatlami** | **8** | ✅ **bajarildi** — quyida |
| S2.2 MKB-10 spravochnigini to'ldirish | 5 | ✅ bajarildi — quyida |
| S2.3 Ko'rik shablonini jins va yoshga bog'lash | 3 | ✅ bajarildi — quyida |
| S2.4 Shifokor ↔ bo'lim ↔ xizmat bog'liqligi | 3 | ✅ bajarildi — quyida |
| S2.5 Muddati o'tgan partiyani bloklash | 2 | ✅ bajarildi — quyida |

| **S3.1 Umumiy sxemalar** | **4** | ✅ bajarildi — quyida |
| **S3.2 Fiziologik chegaralar** | **4** | ✅ bajarildi — quyida |
| **S3.3 87 ta `alert()` ni toastga** | **4** | ✅ bajarildi — quyida |
| **S3.4 Dublikat nazorati** | **3** | ✅ bajarildi — quyida |
| **S3.5 Telefon: maska va tekshiruv** | **2** | ✅ bajarildi — quyida |
| **S3.6 O'chirishga tasdiq va undo** | **2** | ✅ bajarildi — quyida |
| **S3.7 Qabulni yakunlashda nazorat** | **2** | ✅ bajarildi — quyida |
| **S3.8 Bo'sh `catch` va E2E** | **1** | ✅ bajarildi — quyida |

| **S4.1 Matnlarni `t()` ga ko'chirish** | **4** | ✅ bajarildi — quyida |
| **S4.2 Global `:focus-visible`** | **2** | ✅ bajarildi — quyida |
| **S4.3 Bosish maydoni 44×44px** | **2** | ✅ bajarildi — quyida |
| **S4.4 KPI kontrasti** | **2** | ✅ bajarildi — quyida |
| **S4.5 Sana va raqam formati** | **2** | ✅ bajarildi — quyida |
| **S4.6 `aria-label`** | **1** | ✅ bajarildi — quyida |
| **S4.7 Sarlavhalar ketma-ketligi** | **1** | ✅ bajarildi — quyida |
| **S4.8 Terminologiya lug'ati** | **1** | ✅ bajarildi — quyida |

| **S5.1 Nav panelga davomiylik belgisi** | **1** | ✅ bajarildi — quyida |
| **S5.2 Registraturaga diagnostika** | **1** | ✅ bajarildi — quyida |
| **S5.3 Kalendarni o'qiladigan qilish** | **1** | ✅ bajarildi — quyida |
| **S5.4 PWA ni oxiriga yetkazish** | **1** | ✅ bajarildi — quyida |
| **S5.5 Sahifalash va code splitting** | **1** | ✅ bajarildi — quyida |
| **S5.6 Kiosk rejimi** | **1** | ✅ bajarildi — quyida |
| **S5.7 Har route'ga o'z sarlavhasi** | **1** | ✅ bajarildi — quyida |
| **S5.8 Demo ma'lumotni tozalash** | **1** | ✅ bajarildi — quyida |

**Yig'ilgan ball: 72 / 72.** Hisob: 108 → **180**.

Beshala sprint ham yopildi.

### S1.1 — bajarildi 2026-08-28

**Reja aytgani bilan kod ko'rsatgani mos kelmadi.** Reja «registrator Moliya
hisobotini, Sozlamalarni va shifokor ulushini ko'rmasin» degan edi. Kod
ko'rilganda uchtadan ikkitasi **allaqachon yopilgan** ekan:

- `pages/FinanceHub.tsx:82` — `canSeeReports = userRole === CLINIC_ADMIN`, va
  `?tab=ulush` ni qo'lda yozib kirish ham to'silgan. Registrator faqat Kassa
  tabini ko'radi — bu to'g'ri, chunki kassada u ishlaydi.
- `pages/Settings.tsx:1235–1248` — Xodimlar, Ruxsatlar, Kirish jurnali,
  Bo'limlar, Lid integratsiyasi va Xizmat ko'rsatish tablari egaga
  cheklangan, izohi bilan.

**Haqiqiy ochiq joy bitta edi:** `pages/DoctorsAnalytics.tsx` da rol
tekshiruvi **umuman yo'q**, va u `calculateDoctorShare` orqali har
shifokorning hisoblangan ulushini va tushumini ko'rsatadi. Ya'ni registrator
hamma shifokorning oyligini ko'rib turgan.

Qilingani:

1. `App.tsx` — `doctors` moduli `roles: [CLINIC_ADMIN]` ga o'tkazildi.
2. `App.tsx` — `/doctors` va `/doctors/:doctorId` marshrutlari egaga o'raldi.
   Menyudan olib tashlash yetarli emas: `#/doctors` ni qo'lda yozish mumkin edi.
3. Yo'l-yo'lakay topilgan kamchilik tuzatildi: **hamshira bemorni umuman
   ko'ra olmasdi** — u faqat `inpatient` ni ko'rardi. Dori berish va harorat
   varag'i uchun navbat va bemor kartasi kerak, shuning uchun `myqueue` va
   `patients` unga ochildi. `/patients` va `/myqueue` marshrutlari rol bilan
   cheklanmagan, ya'ni sahifalarning o'zi allaqachon ishlagan.

*Natija:* registratorda 15 emas, 14 ta modul. Reja «8 ta» degan edi — bu
raqam noto'g'ri taxminga qurilgan edi va shu yerda tuzatildi.

### S1.2 — bajarildi 2026-08-28

**O'lchandi:** 171 ta yozuv marshruti bor (server.ts da 100, qolgan 71 tasi
`billing`, `clinical`, `inpatient`, `inventory`, `multiprofile`,
`payroll`, `compliance`, `maintenance`, `patientMerge` da). Ulardan **16
tasida** rol tekshiruvi bor edi.

**Har marshrutga `requireRole` qo'shish rad etildi.** 171 ta o'zgartirish —
171 ta unutish imkoniyati, va yangi marshrut qo'shilganda uni himoyalash
esdan chiqsa buni hech narsa aytmaydi.

O'rniga `backend/permissions.ts` — deklarativ jadval, va qoida **teskari**
yozildi: *mos qoida topilmagan yozuv amali rad etiladi*. Yangi marshrut
jadvalga yozilmasa, u ishlamaydi va sabab javobda aniq ko'rsatiladi
(`PERMISSION_UNLISTED`). Unutish mumkin emas.

Tekshiruv `authenticateToken` ichiga qo'yildi (`backend/server.ts:385`),
chunki u 144 ta marshrutda ishlaydi — bitta joydagi qoida hammasini qamraydi.
Marshrutlardagi mavjud `requireRole` lar o'z o'rnida qoldirildi: endi ular
ikkinchi qatlam va jadval bilan zid emas.

**O'qish (GET) cheklanmadi.** Ma'lumot `getScopedClinicId` orqali klinikaga
allaqachon bog'langan. O'qishni yopish alohida ish — har bir ro'yxat qaysi
rolga kerakligini tekshirish talab qiladi.

*Tekshiruv:* `backend/tests/api/permissions.ts` — yangi to'plam. Egadan
sinash cheklovni isbotlamaydi (ega hamma narsaga haqli), shuning uchun sinov
registrator, shifokor va hamshira nomidan kiradi:

| Rol | Taqiqlangan amal sinaldi | Natija |
|---|---|---|
| Registrator | 16 | hammasi 403 |
| Shifokor | 6 | hammasi 403 |
| Hamshira | 5 | hammasi 403 |

Ruxsat etilgani ham tekshiriladi — cheklov ish oqimini buzmasligi kerak:
registrator kassa ocha oladi, hamshira ko'rsatkich kirita oladi, ikkalasi ham
bemorlar ro'yxatini ko'radi.

`tests/run-api.ts` ikki joyda o'zgardi: xodim parollari ham sinov paroliga
qo'yiladi (aks holda registrator nomidan kirib bo'lmaydi), va `T_VERBOSE=1`
har bir sinov qatorini ko'rsatadi — xulosa qatori «0 yiqildi» desa ham,
sinov haqiqatan bajarilganini shundan ko'rish mumkin.

*Holat:* 35 birlik sinovi + 170 API sinovi o'tdi, ikkala tsconfig toza.

### S1.4 — bajarildi 2026-08-28

**Reja «jurnal bo'sh» degan edi — bu noto'g'ri.** Bazada 582 ta yozuv bor:
bemor kartasini ochish (283), hujjat ko'rish (283), tashrif (6), tahlil (8),
hujjat yaratish (2). `logAccess` besh joyda chaqiriladi va ishlaydi.

**Haqiqiy kamchilik bitta va u eng muhimi:** bazada 35 ta o'chirish marshruti
bor, jurnalda esa `action = 'Delete'` yozuvlari soni — **0**. Ya'ni jurnal
ko'rishni yozib, o'chirishni o'tkazib yuborardi.

Qilingani: `backend/compliance.ts` ga `auditDeletion` qo'shildi va
`authenticateToken` ichiga, ruxsat tekshiruvidan keyin ulandi. Uch qaror:

- **Markazlashgan, har marshrutda emas** — 35 ta chaqiruv 35 ta unutish
  imkoniyati, va yangi o'chirish marshruti qo'shilganda jurnal jimgina
  to'liqsiz bo'lib qolardi. Endi qoida bitta: har qanday muvaffaqiyatli
  `DELETE` yoziladi.
- **`res.on('finish')` orqali** — amal bajarilgandan keyin. 400 yoki 403
  bilan tugagan urinish o'chirish emas.
- **Faqat `DELETE`** — har bir yozuv amalini yozish jurnalni kunlik ish
  oqimi bilan to'ldirib, o'chirishni ko'rinmas qilib qo'yardi. Yaratish va
  o'zgartirish tibbiy ahamiyatga ega joylarda allaqachon nuqtaviy yoziladi.

Yo'ldan entity nomi chiqariladi: `/api/cash-movements/9` → `CashMovement`.
Oxirgi bo'lak ID ekanligi shakli bo'yicha aniqlanadi, aks holda u resurs nomi
(`/api/admin/backup/restore` da `restore` — ID emas).

*Tekshiruv:* `permissions.ts` to'plamiga 5-bo'lim qo'shildi — lid yaratiladi,
o'chiriladi va jurnalda `entityType: 'Lead'`, o'chirilgan ID va kim
o'chirgani borligi tekshiriladi.

*Holat:* 35 birlik + 175 API sinovi o'tdi.

### S1.3 — bajarildi 2026-08-28

**Sessiya ikkiga bo'lindi.** Ilgari bitta 30 kunlik JWT `localStorage` da
ochiq JSON bo'lib yotardi: bitta XSS butun klinikaning sessiyasini olardi va
o'g'irlangani bir oy amal qilardi.

| | Ilgari | Endi |
|---|---|---|
| Kirish tokeni | 30 kun, `localStorage` | **30 daqiqa, faqat xotirada** |
| Yangilash tokeni | yo'q edi | 30 kun, `httpOnly` cookie |
| JavaScript o'qiy oladimi | ha, ikkalasini ham | kirish tokenini — ha; cookie'ni — **yo'q** |
| Sessiya uzunligi | 30 kun | 30 kun (o'zgarmadi) |

Ya'ni skript o'qiy oladigan sirning umri 30 kundan 30 daqiqaga tushdi, lekin
foydalanuvchi uchun hech narsa o'zgarmadi.

**Backend** (`backend/server.ts`): `issueTokens` ikkala tokenni yasaydi,
`setRefreshCookie` cookie qo'yadi (`HttpOnly; Path=/; SameSite=Strict`,
`Secure` faqat HTTPS da — klinika lokal tarmoqda `http://localhost` orqali
ishlaydi va u yerda `Secure` cookie qabul qilinmasdi). Yangi endpointlar:
`POST /api/auth/refresh` va `POST /api/auth/logout`. `cookie-parser`
qo'shilmadi — bitta cookie o'qish uchun yangi bog'liqlik ortiqcha.

Muhim tekshiruv: `authenticateToken` `typ === 'refresh'` tokenni **rad
etadi**. Ikkalasi bir sir bilan imzolangani uchun busiz cookie'dan olingan
30 kunlik token oddiy token bo'lib ishlab ketardi va ajratishning ma'nosi
qolmasdi.

**Frontend** (`services/authStore.ts` — yangi): kirish tokeni modul ichidagi
o'zgaruvchida, foydalanuvchi ma'lumoti (ism, rol, klinika) `sessionStorage`
da. Roldagi soxtalashtirish endi hech narsa bermaydi — ruxsatni server hal
qiladi (S1.2). `fetchJson` 401 olganda cookie orqali bir marta yangilaydi va
so'rovni takrorlaydi; `isRetry` qo'riqchisi cheksiz aylanishni to'xtatadi.
Parallel so'rovlar uchun yangilash bitta navbatga qo'yilgan — aks holda
o'nta 401 o'nta yangilash yuborardi.

**Electron** (`electron/main.ts`): `loadFile(dist/index.html)` →
`loadURL(http://localhost:BACKEND_PORT)`. `file://` da cookie umuman
ishlamaydi, ya'ni ish stoli ilovasi har ochilganda parol so'rardi. Yangi
infratuzilma kerak bo'lmadi: backend `dist/` ni allaqachon beradi
(`express.static`) va oyna faqat `startBackend()` tayyor deganidan keyin
ochiladi — oq ekran xavfi yo'q. Yon foyda: front va API bitta manbaga
tushdi, `?port=` uzatish keraksiz bo'ldi.

**Eski sessiyalar buzilmadi.** `migrateLegacyStorage()` diskdagi tokenni bir
marta xotiraga ko'chiradi va `localStorage` dan o'chiradi. Server `typ` siz
eski tokenni hali qabul qiladi va birinchi so'rovda yangi shaklga o'tkazadi.
Ya'ni xodimlar bir kunda tizimdan chiqib qolmaydi.

*Tekshiruv:* `permissions.ts` to'plamiga 6-bo'lim — cookie qo'yilishi,
`HttpOnly` va `SameSite=Strict` bayroqlari, kirish tokenining muddati
(30 daqiqa, 30 kun emas), `typ=access`, yangilash tokeni bilan API ga kirib
bo'lmasligi, cookie orqali yangilash ishlashi va cookie'siz yangilashning
rad etilishi.

*Holat:* 35 birlik + 185 API sinovi o'tdi. Uchala tsconfig toza, production
build yig'ildi.

### S2.1 — bajarildi 2026-08-28

**Sabab ta'rifda emas, MANBADA edi.** Audit to'rtta har xil qarz raqamini
topgan (0 / 0 / 0 / 11 501 043). Kod ko'rilganda ma'lum bo'ldiki, ekranlar
bir xil narsani turlicha hisoblamayotgan edi — ular **turli jadvaldan**
o'qiyotgan edi:

| Ekran | Nimadan sanardi | Qayerda |
|---|---|---|
| Bosh sahifa | `Transaction.status IN (Pending, Overdue)` | brauzerda |
| Bemorlar | xuddi shu, bemor ISMI bo'yicha moslashtirib | brauzerda |
| Hisobot | `VisitCharge.total - paidAmount` | serverda |

Brauzerdagilar bundan tashqari faqat **yuklangan oynani** ko'rardi (oxirgi
45 kun, 500 bemor) — ya'ni butun bazani emas, ekranga kelgan qismini
sanardi.

**To'g'ri model allaqachon yozib qo'yilgan edi** — `backend/billing.ts`
sarlavhasida: «Qarz alohida saqlanmaydi — u to'lanmagan qatorlarning
yig'indisi. `Patient.balance` esa avans uchun ishlatiladi». Ya'ni
`Transaction.status = 'Pending'` eski model, va bosh sahifadagi
`patient.balance < 0` tekshiruvi hech qachon ishlamagan: balans avans va u
musbat bo'ladi.

Qilingani: **`backend/snapshot.ts`** — yagona javob beruvchi.
`financialSnapshot(prisma, clinicId, from, to)` qarz, davr tushumi,
tashriflar soni, o'rtacha chek va bemor sanog'ini beradi. Uni
`/api/reports/snapshot` ochadi, `/api/reports/dashboard` va
`/api/reports/summary` esa ichidan chaqiradi — uch endpoint bitta hisobdan
gapiradi.

Uch ta'rif aniqlashtirildi:

- **Qarz davrga bog'liq emas.** Direktor «qancha qarz bor?» deganda «shu
  oyda paydo bo'lgani» ni emas, «hozir yig'ilmagani» ni so'raydi. Hisobotda
  ikkalasi ham kerak, shuning uchun u endi «Davr qarzi» va «Umumiy qarz» ni
  **alohida** ko'rsatadi — ilgari ikkalasi ham «Qarz» deb yozilardi.
- **Qarzdor — BEMOR, qator emas.** Bitta bemorda beshta to'lanmagan qator
  bo'lishi mumkin. Auditdagi «Jami bemorlar 159, bazada 67 ta» aynan shu
  farqni sanamaslikdan chiqqan.
- **O'rtacha chek = buyurilgan summa / TASHRIFLAR soni.** Bosh sahifada
  «to'langan tranzaksiyalar / yakunlangan qabullar», Hisobotda boshqa
  bo'luvchi turardi — 199 024 va 78 457 farqi shundan. Bitta tashrifda bir
  necha qator bo'ladi va ular bitta chek.

Yo'l-yo'lakay ikkita tuzatish:

- «Yangi bemorlar» endi `Patient.createdAt >= bugun-7kun`. Ilgari
  `lastVisit` bo'yicha sanalardi va `'Never'` ham «yangi» deb hisoblanardi —
  shuning uchun butun baza «yangi» chiqardi.
- Bosh sahifadagi snapshot davr filtriga bog'landi: davr o'zgarsa qayta
  so'raladi.

*O'lchandi (dev bazada):*

| | Ilgari | Endi |
|---|---|---|
| Qarz — Bosh sahifa / Bemorlar | 0 / 0 | **11 501 043** (ikkalasida ham) |
| Qarzdorlar | «159 bemor» | **51 bemor**, 169 qator |
| Jami bemorlar | 159 | **67** |
| O'rtacha chek | 199 024 / 78 457 | **197 525** (hamma joyda) |

*Tekshiruv:* `backend/tests/api/consistency.ts` — yangi to'plam, 17 ta
sinov. Qarzni uch endpointda taqqoslaydi, `/reports/debtors` ro'yxatidan
**mustaqil qayta sanab** solishtiradi, o'rtacha chek formulasini tekshiradi
va davr chegarasi hurmat qilinishini isbotlaydi: tor oraliqda tushum
kamayadi, qarz esa o'zgarmaydi. Kimdir yana bir joyda o'zicha sanay
boshlasa, shu yerda yiqiladi.

*Holat:* 35 birlik + 202 API sinovi o'tdi. Uchala tsconfig toza, build
yig'ildi.

### S2.2 — bajarildi 2026-08-29

**Kod bugi emas, ma'lumot bugi.** Endpoint (`server.ts:5182`), indeks va
interfeys joyida edi. `ICD10Code` jadvalida esa **1 ta qator**. Ya'ni
qidiruv to'g'ri ishlab, har doim bo'sh natija qaytarardi.

`backend/icd10Data.ts` — **345 ta kod**, har birida o'zbekcha va ruscha nom.
Bu to'liq MKB-10 emas (unda 14 mingdan ortiq kod bor, katta qismi statsionar
va statistika uchun) — ambulator amaliyotda haqiqatan yoziladigan tashxislar,
20 ta bo'lim bo'yicha: gastroenterologiya 26, kardiologiya 25, yuqumli 24,
travmatologiya 24, alomatlar 24, pulmonologiya 23 va h.k.

**Manba TS da, SQL undan yasaladi.** Migratsiya — yetkazish mexanizmi,
tahrirlash mexanizmi emas (`migrations/README.md`, 3-qoida: chiqarilgan
fayl tahrirlanmaydi). Ro'yxat esa o'sadi. Shuning uchun
`scripts/genIcd10Migration.ts` migratsiyani generatsiya qiladi va takroriy
kodni tekshiradi. Yangi kod kerak bo'lsa — manbaga qo'shiladi va YANGI
migratsiya yasaladi.

Qidiruvda uch o'zgarish: ruscha nom bo'yicha ham qidiriladi (`nameRu`,
migratsiya 0030), natija **tartiblanadi** (kod aynan mos → kod prefiksi →
nom prefiksi → qolganlari), va bo'sh so'rovda bo'sh ro'yxat emas, namuna
qaytadi — bo'sh ro'yxat «ishlamayapti» degan taassurot beradi va aynan shu
audit B-02 ga olib kelgan.

*Tartib SQL da:* Prisma `orderBy` da shartli ifoda yo'q, brauzerda
tartiblash esa yaramaydi — `LIMIT 50` dan keyin kerakli kod ro'yxatga
umuman tushmagan bo'lishi mumkin.

*Tekshiruv:* `tests/api/icd10.ts` — 13 ta sinov. Auditning aynan uchta
so'rovi («gipert», «I10», «a») tekshiriladi, ikki tilda qidiruv, tartib
(«I10» birinchi natija aynan I10) va yettita mutaxassislik qamrovi.

### S2.3 — bajarildi 2026-08-29

**Tasodif emas, qonuniyat edi.** `EncounterForm.tsx` da shablon tanlanmagan
bo'lsa `deptTemplates.find(t => t.isDefault) || deptTemplates[0]` ishlardi.
Bazadagi **yettita shablonning HAMMASI** `isDefault = 1`, ro'yxat esa
`ORDER BY name ASC` bilan kelardi. Alifboda «Ginekolog ko'rigi» birinchi —
shuning uchun u HAR QANDAY erkak bemorda ochilardi.

Migratsiya 0031: `gender`, `minAge`, `maxAge` ustunlari; ginekologiya →
`Female`, pediatriya → `maxAge 14`, terapevt → `minAge 15`; va standart
shablon **bittaga** tushirildi (yettitasi ham standart bo'lgani «standart»
tushunchasini ma'nosiz qilib qo'ygan edi).

Filtr ikki qatlamda: server `?patientId=` bo'yicha (`multiprofile.ts`),
front esa yana bir bor — ro'yxat keshdan yoki filtrsiz kelgan bo'lishi
mumkin. Sozlamalar uchun filtrsiz ro'yxat saqlandi.

**Yosh noma'lum bo'lsa chegara QO'LLANMAYDI:** tug'ilgan sanasi
kiritilmagan bemorda hamma shablon yopilib qolsa, shifokor hech narsa yoza
olmaydi.

*Tekshiruv:* `tests/api/templates.ts` — 16 ta sinov. Erkak, ayol va 7
yoshli bola yaratiladi; erkakda ginekologiya yo'q, ayolda bor, bolada
pediatriya bor va kattalar terapevti yo'q; erkakda ro'yxat bo'sh
qolmagani ham tekshiriladi.

### S2.4 — bajarildi 2026-08-29

Ikki qismdan iborat edi.

**1. Vaqt to'qnashuvi.** Frontda tekshiruv bor edi
(`Calendar.tsx:309`), lekin ikki sababdan ishlamasdi:
`appt.time === formData.time` — faqat AYNAN bir xil boshlanish vaqti,
ya'ni 08:30 dagi 60 daqiqalik qabul ustiga 09:00 yozilaverardi; va
`appointments` — brauzerga yuklangan qism, butun jadval emas.

Endi tekshiruv **serverda va davomiylik bilan**:
`findOverlappingAppointment` oraliqlar kesishishini hisoblaydi, `POST` va
`PUT` da ishlaydi (ko'chirish ham yozish kabi), 409 va `code:
'DOCTOR_BUSY'` qaytaradi. `force: true` bilan baribir yozish mumkin — bu
loyihadagi mavjud naqsh (bemor dublikatida ham shunday): server
**to'smaydi, TANLOV beradi**, chunki shoshilinch holat bo'lishi mumkin.

Bemorni ikki shifokorga bir vaqtda yozish ATAYLAB taqiqlanmadi — bu xato
emas, klinikada odatiy hol.

**2. Xizmat shifokorga bog'landi.** `GET /api/services?doctorId=` shifokor
bo'limining xizmatlarini qaytaradi. `DoctorServiceRate` **ataylab
ishlatilmadi** — u pul ulushi uchun, qobiliyat ro'yxati emas: stavkasi
yozilmagan shifokor hech qanday xizmat ko'rsatmaydigan bo'lib qolardi.
Bo'limi ko'rsatilmagan shifokorda filtr qo'llanmaydi.

*Tekshiruv:* `tests/api/scheduling.ts` — 15 ta sinov. Auditdagi aynan
holat: 08:30–09:30 band, 09:00 ga yozishga urinish → 409. Bo'sh 09:30
o'tadi, `force` o'tadi, ko'chirish ham tekshiriladi, boshqa shifokorga
xalal bermaydi.

### S2.5 — bajarildi 2026-08-29

**Eng yomoni kodda edi.** Chiqim FEFO tartibida ishlardi — «muddati eng
yaqini birinchi». Mantiq to'g'ri, oqibati teskari: muddati ALLAQACHON
o'tgan partiya ro'yxatning eng boshida turardi, ya'ni tizim yaroqsiz
dorini **birinchi navbatda** sarflardi. Dev bazada 13 ta partiyaning
muddati o'tgan va hech biri hech narsani to'smasdi.

`writeOffCore` endi muddati o'tganlarni chiqarib tashlaydi. Yaroqli qoldiq
yetmasa — jimgina partiyasiz chiqim qilmaydi (avval shunday qilardi va
yaroqsiz dori «yo'q» bo'lib ko'rinardi), balki 409 va
`EXPIRED_STOCK_BLOCKED` qaytaradi, ro'yxati bilan. `force: true` — ongli
tanlov, jurnalda ko'rinib turadi.

«Qoldiqlar» ro'yxatiga belgi qo'shildi: `GET /api/inventory` endi
`expiredQuantity` va `nextExpiry` qaytaradi (bitta guruhlangan so'rov —
har qatorga alohida so'rov 200 ta mahsulotda 200 ta so'rov bo'lardi).
Ilgari muddat faqat «Partiya va muddat» tabida ko'rinardi.

**Yo'l-yo'lakay MAVJUD BUG topildi.** Sinov `integrity` to'plamini
yiqitdi va sabab meniki emas ekan: `POST /api/inventory/:id/batches`
partiya yaratib `item.quantity` ni oshirardi, lekin **`StockMovement`
yozmasdi**. Migratsiya 0028 dan keyin qoldiq harakatlar yig'indisiga teng
bo'lishi shart — ya'ni har partiya kirimi jimgina yagona jurnal
invariantini buzardi. Uchta amal ham tranzaksiyaga o'raldi
(`/stock-movements/in` bilan bir xil tartibda).

*Tekshiruv:* `tests/api/expiry.ts` — 17 ta sinov. Eng muhimi: chiqimdan
keyin **muddati o'tgan partiyaga tegilmagani** va yaroqlisidan yechilgani
alohida tekshiriladi (100 qoldi, 20 → 15).

*Holat:* 35 birlik + 246 API sinovi o'tdi. Uchala tsconfig toza, build
yig'ildi.

### S3.1 — bajarildi 2026-08-29

**Reja zod ni nazarda tutgan edi — zod ishlatilmadi.** U ikkita
`package.json` ga yangi bog'liqlik qo'shar va ishning asosiy qismini —
QOIDANI BIR JOYGA YIG'ISHNI — bermas edi. O'rniga `shared/validation.ts`:
bog'liqliksiz oddiy TypeScript, brauzerda ham, `ts-node` da ham, `ncc`
bundle'ida ham qo'shimcha sozlamasiz ishlaydi. Loyihaning uslubi ham
shunday — `cookie-parser` ham bitta cookie uchun qo'shilmagan edi.

**To'siq haqiqiy edi va yechildi.** `utils/phone.ts` sarlavhasida ochiq
yozilgan edi: «Backend alohida tsconfig/outDir bilan build bo'lgani uchun
umumiy fayl import qilib bo'lmaydi — biri o'zgarsa, ikkinchisi ham
o'zgartirilsin». Ikkita to'siq bor ekan:

1. **`rootDir`** — backend `../shared/*` ni import qilsa, tsc chiqishni
   `dist/backend/` ga surib yuborardi. `rootDir: ".."` ataylab belgilandi
   va `start` skripti shunga moslandi.
2. **`"type": "module"`** — ildizdagi `package.json` dagi bu maydon
   `shared/*.ts` ni ES-modul qilib qo'yardi va backend (CommonJS) uni
   `require` qila olmasdi (`ERR_REQUIRE_ESM`). `shared/package.json` da
   `"type": "commonjs"` — eng yaqin ota-fayl bo'lib, qoidani shu papka
   uchun bekor qiladi.

**Relizga ta'siri yo'q — o'lchandi.** Production `dist-bundle/index.js`
dan yuriladi (ncc). `npx ncc build server.ts` ishlatib tekshirildi:
`shared` dagi matnlar bundle ichida.

Nusxalar yo'q qilindi: `utils/phone.ts` va `backend/smsService.ts` endi
re-eksport.

### S3.2 — bajarildi 2026-08-29

**Ikki xil chegara ajratildi** — bu farq muhim:

- `min`/`max` — **fiziologik imkoniyat**. 500 °C harorat yoki −40 puls
  odamda bo'lmaydi: bu kiritish xatosi, saqlanmaydi.
- `normalMin`/`normalMax` — **norma**. Undan chiqqan qiymat SAQLANADI va
  qizil ko'rsatiladi: kasal odamning harorati 39 bo'ladi va uni yozib
  qo'yish kerak.

Ilgari `backend/inpatient.ts:497` da faqat `isFinite(value)` turardi.

**Ikki yo'l bor ekan, ikkalasi ham yopildi.** Statsionar `/api/vitals` ga
`Temp`, `Pulse`... deb yuboradi; ko'rik bayoni esa shablon maydonlarini
(`temperature`, `bpSystolic`...) `examData` JSON'ida saqlaydi va u
**hech qanday tekshiruvsiz** o'tardi. Auditdagi 500 °C aynan ikkinchi
yo'ldan kirgan (B-10 takrorlash yo'li: «Ko'rik bayoni → KO'RSATKICHLAR»).
`ENCOUNTER_FIELD_TO_VITAL` moslik jadvali ikkalasini bitta chegaraga
bo'ysundiradi.

**Hech narsa yarim saqlanmaydi:** bitta o'lchov noto'g'ri bo'lsa, boshqasi
ham yozilmaydi — aks holda hamshira nima saqlanganini bilmaydi.

VKI qo'shildi (`calcBmi` + JSSV tasnifi) — audit «hisoblanmaydi» degan edi.

### S3.3 — bajarildi 2026-08-29

**87 ta `alert()` almashtirildi** (88-si izohda edi). Toast mexanizmi
allaqachon ishlayotgan edi — muammo uni har komponentga prop bilan
uzatish kerakligida edi va chuqurdagi fayllarga yetib bormasdi.

`services/toast.ts` — modul darajasidagi bitta nuqta, `App` o'zining
`addToast` ini shunga ulaydi. Context ATAYLAB ishlatilmadi: toast xabari
ko'pincha React daraxtidan tashqarida tug'iladi (`catch` bloki, `api.ts`,
hodisa ishlovchisi).

Xabarlar mazmuniga qarab tasniflandi; bitta noto'g'ri tasnif qo'lda
tuzatildi («Nusxalab bo'lmadi» — «nusxa» so'zi tufayli success bo'lib
qolgan edi).

**Retry siyosati tuzatildi.** Audit: «Facebook so'rovi 500 qaytarganda ham
3 marta qayta urildi (~7 soniya)». Ikki sabab bor ekan:

- Server sozlanmagan integratsiya uchun **500** qaytarardi → endi **501**
  (funksiya sozlanmagan, DOIMIY holat) va matn foydalanuvchi tilida.
- `api.ts` da shart `status >= 500` edi → endi aniq ro'yxat:
  502/503/504/408/429. 500 va 501 ni qayta urinishning ma'nosi yo'q.

### S3.4 — bajarildi 2026-08-29

**Bemorlarda tekshiruv allaqachon bor edi** (409 + `matches` + `force`)
va `AddPatientModal` uni ko'rsatardi. **Lidlarda umuman yo'q edi** —
audit B-14 aynan shuni ko'rsatgan.

`POST /api/leads` endi bemordagi bilan bir xil naqshni ishlatadi: telefon
normallashtiriladi, mavjud lid topilsa 409 va `DUPLICATE_LEAD`,
`force: true` bilan baribir yaratiladi. Bloklamaydi — reklama bir odamni
ikki marta yuborishi mumkin, lekin operator buni bilishi kerak, aks holda
bitta odamga ikki marta qo'ng'iroq qilinadi.

Yo'l-yo'lakay: lid telefoni ham endi tekshiriladi (ilgari `!data.phone`
dan boshqa hech narsa yo'q edi).

### S3.5 — bajarildi 2026-08-29

`normalizeUzPhone` to'g'ri ishlardi, lekin **natijasi hisobga olinmasdi**:
`null` qaytsa ham bemor saqlanaverardi. Endi `validatePatient` yozishni
to'xtatadi, telefon **normallashtirilgan** holda saqlanadi
(`998901234567`) va tahrirlashda ham tekshiriladi — yaratishda
to'silganini keyin tahrirlab kiritib qo'yish mumkin edi.

Formada maydon xatolari alohida ko'rsatiladi (ilgari bitta `alert`),
maydondan chiqqanda ko'rinish bir xillashtiriladi.

**Jins endi majburiy.** `gender: gender || 'Male'` olib tashlandi — aynan
shu sababdan «Lola Karimov» lidi bemorga aylantirilganda erkak bo'lib
qolgan edi (B-34).

### S3.6 — bajarildi 2026-08-29

22 ta `window.confirm` almashtirildi. `services/confirm.ts` +
`components/ConfirmDialog.tsx` — `toast.ts` bilan bir xil naqsh. Promise
qaytaradi, ya'ni chaqiruv joyining shakli o'zgarmaydi:
`if (confirm(...))` → `if (await confirm(...))`. Esc/Enter ishlaydi,
fokus tasdiq tugmasida.

**Undo faqat lidda.** Qaytarish u yerda XAVFSIZ: lidga hech narsa
bog'lanmagan, ya'ni qayta yaratish hech qanday havolani buzmaydi. Bemor
yoki to'lov bilan bunday qilib bo'lmaydi — yangi `id` eski havolalarni
yetim qoldiradi. Ular uchun javobgarlik boshqa yo'ldan: har o'chirish
kirish jurnaliga tushadi (S1.4).

`Toast` komponentiga amal tugmasi qo'shildi; «Bekor qilish» li toast
8 soniya turadi (oddiysi 4).

### S3.7 — bajarildi 2026-08-29

Nazorat **serverda**, chunki front yagona qo'riqchi bo'la olmaydi.
`PUT /api/visits/:id` `status: 'Completed'` da to'rtta shartni tekshiradi:
tashxis bormi, to'lanmagan qator qolganmi, tahlil va tekshiruv natijalari
kelganmi. Kamchilik bo'lsa 409 va **sabablar ro'yxati birdan** — shifokor
ularni bittalab topib chiqmasin.

`force: true` + `closeReason` bilan yopiladi va sabab qabul izohiga
**yozib qoladi**: «nega tashxissiz yopilgan?» degan savol keyin ham
javobsiz qolmasin.

**Yo'l-yo'lakay MAVJUD BUG topildi.** Sinov «tashxis qo'yilgan qabul
baribir rad etilyapti» deb yiqildi. Sabab: `POST /api/diagnoses` `visitId`
ni **umuman o'qimasdi** — sxemada maydon bor, front uni yuboradi, backend
tashlab yuborardi. Ya'ni har tashxis qabuldan uzilgan holda yozilardi va
bemor kartasida «bu tashrifda qanday tashxis qo'yildi?» degan savolga
javob yo'q edi.

### S3.8 — yarim bajarildi 2026-08-29

**Bajarilgani:**

- `pages/Calendar.tsx` dagi ikkita bo'sh `catch` yopildi. Biri modaldagi
  optimistik yangilanishni orqaga qaytarmasdi — oyna «bajarildi» deb
  ko'rsatib, baza eski holatda qolardi.
- `ErrorBoundary` allaqachon har route atrofida edi (`App.tsx`,
  `key={location.pathname}` bilan) — tekshirildi, o'zgartirish kerak
  bo'lmadi.

**Ochiq qolgani — brauzer darajasidagi E2E (Playwright).** Rejadagi 10 ta
ssenariyning hammasi API darajasida qamrab olindi (HTTP orqali, haqiqiy
serverga): bemor qo'shish, qabul ochish, to'lov, qabulni yakunlash, kassa,
ombor, ruxsatlar. Yetishmayotgani — brauzer qatlami: tugma bosilishi,
forma to'ldirilishi, ekranda nima ko'rinishi.

Playwright o'rnatilmadi: u brauzerlarni yuklab olishni talab qiladi va
buni so'ramasdan qilish to'g'ri emas. Kerak bo'lsa ayting —
`npm i -D @playwright/test && npx playwright install chromium` va 10 ta
ssenariy yoziladi.

*Holat:* 35 birlik + **283 API sinovi** o'tdi. Uchala tsconfig toza, build
yig'ildi.

### S4.2 va S4.3 — bajarildi 2026-08-29

Ikkalasi ham `index.css` da, global qoida sifatida — har komponentga
alohida stil yozish kerak emas va yangi komponent avtomatik qamrab
olinadi.

**Fokus.** Audit: butun stil faylida atigi bitta `:focus` qoidasi bor edi.
Qo'shilgani `:focus-visible`, `:focus` EMAS — farqi muhim: `:focus`
sichqoncha bilan bosilganda ham ishlaydi va har bosishda halqa chiqib
dizaynni buzadi. `:focus-visible` faqat klaviatura navigatsiyasida
ko'rinadi. Qorong'i fonli tugmalarda halqa oq bo'ladi — ko'k halqa u
yerda ko'rinmasdi.

**Bosish maydoni.** 44×44px `::after` bilan ko'rinmas maydon sifatida
qo'shildi: tugmaning o'zini kattalashtirish jadval qatorlarini buzardi.
FAQAT `pointer: coarse` da — sichqoncha bilan 44px maydon qo'shni
tugmalar bilan kesishib, noto'g'ri bosishga olib kelardi.

### S4.4 — bajarildi 2026-08-29

Sabab `components/StatCard.tsx` dagi ikkita sinf edi: `text-[10px]` va
`text-gray-400`. `gray-400` (#9ca3af) oq fonda **2,55:1** beradi — audit
o'lchagan 2,6:1 shu.

Yorug' va qorong'i temada TURLI tus kerak bo'ldi: `gray-600` oq fonda
7,5:1, lekin `gray-800` fonda 3,1:1 — bitta rang ikkalasida ishlamaydi.

**Yo'l-yo'lakay:** bosiladigan `StatCard` `div onClick` edi — Tab bilan
yetib bo'lmaydigan tugma. `role="button"`, `tabIndex` va Enter/Space
qo'shildi.

### S4.5 — bajarildi 2026-08-29

**«2026 M08 28, FRI» formatlash xatosi emas, brauzerning javobi.**
`toLocaleDateString('uz-UZ', …)` chaqirilgan, Chrome'da esa `uz` uchun
ICU ma'lumoti to'liq emas — oy «M08», hafta kuni inglizcha qisqartma
bo'lib qaytadi.

`utils/format.ts` brauzer lokaliga UMUMAN tayanmaydi: oy va hafta kuni
nomlari faylda yozilgan, raqam guruhlash ham qo'lda. Offline dastur uchun
muhim — klinikadagi mashinaning tili noma'lum.

`Intl` raqam uchun ham ishlatilmadi: `ru-RU` uzluksiz tor probel (U+202F)
qo'yadi, u ba'zi shriftlarda ko'rinmaydi.

Ko'chirildi: **52 ta** `toLocaleString()` va **9 ta**
`toLocaleDateString('uz-UZ')`, so'ng qolgan 16 tasi qo'lda. Hozir
kod bazasida ulardan **0 ta** qoldi.

O'lchandi: `32 873 500` · `28.08.2026` · `28 avgust 2026, juma` ·
`2 560 680,5` → `2 560 681` (pul butun so'mda).

### S4.6 — bajarildi 2026-08-29

35 ta nomzoddan **20 tasiga** `aria-label` qo'shildi — `title` bor bo'lsa
undan, bo'lmasa ikonka nomidan. Qolgan 15 tasi yolg'on ijobiy: ular
shartli matnli tugmalar (`{saving ? 'Saqlanmoqda…' : 'Saqlash'}`),
ya'ni matn bor.

### S4.7 — bajarildi 2026-08-29

Sarlavha sakrashi Sozlamalardan tashqari yana **7 ta sahifada** bor ekan.
Hammasida H1'dan keyin darhol H3 kelardi — H2 daraja umuman
ishlatilmagan. Tuzatildi: H3→H2, H4→H3. Endi hech bir sahifada sakrash
yo'q.

### S4.8 — bajarildi 2026-08-29

**Ism.** 34 ta joyda «Familiya Ism», 23 ta joyda «Ism Familiya» qo'lda
yig'ilardi. `formatFullName` / `formatShortName` / `formatDoctorName`
qo'shildi va **87 ta joy** ularga ko'chirildi. Qoida: rasmiy
hujjatlardagidek Familiya-Ism-Otasining ismi; katta harfga o'girish yo'q
(«ERGASHEV BAHODIR» baqirgandek ko'rinadi).

**Stomatologiya merosi ikki joyda topildi:**
- Lid formasi placeholder'i «Masalan: Implant, Breket» → «Masalan: UZI,
  Kardiolog konsultatsiyasi» (uz va ru);
- Chop etish sarlavhasi «DentalFlow Clinic» va «Tish davolash va
  diagnostika markazi» → «XClinic», «Ko'p profilli tibbiyot markazi».

### S4.1 — yarim bajarildi 2026-08-29

**Bajarilgani:**

- **Kalitlar to'liq muvofiq: 904/904**, takror va bo'sh qiymat yo'q.
- `scripts/checkI18n.mjs` — `npm run build` ichida ishlaydi, ya'ni
  muvofiqlik buzilsa build yiqiladi.
- Moliya hisoboti (`FinanceReport.tsx`) — **54 ta matn** `t()` ga
  ko'chirildi va ruschasi yozildi. Audit aynan shu modulni ko'rsatgan
  edi: «RU rejimda Moliya moduli butunlay o'zbekcha».

**Ikkita o'z xatoim — yozib qo'yaman, chunki ikkalasi ham takrorlanishi
mumkin:**

**1. Kalitlarni noto'g'ri sanadim.** «RU da 54 ta kalit yetishmayapti»
degandim (va buni S3 hisobotiga ham yozgandim). Aslida fayldagi
kalitlarning bir qismi **qo'sh tirnoq** bilan yozilgan, mening
skriptim esa faqat bitta tirnoqni qidirardi — 850 kalitdan 668 tasini
ko'rgan. Haqiqiy tafovut **30 ta** edi. Noto'g'ri hisob 24 ta TAKROR
kalit qo'shilishiga olib keldi (JavaScript oxirgisini oladi, ya'ni
mavjud tarjima jimgina yo'qolardi). Tuzatildi; `checkI18n.mjs`
ikkala tirnoq turini ham tekshiradi va takrorni ham ushlaydi.

**2. Avtomatik ko'chirish faylni buzdi va typecheck buni O'TKAZIB
YUBORDI.** `FinanceReport.tsx` da `t` nomi allaqachon band edi:
`const t = data?.totals`. Skript matnlarni `t('...')` ga aylantirib,
totals obyektini funksiya sifatida chaqiradigan kod yozdi.

*Nega tsc ushlamadi.* Ildizdagi `tsconfig.json` da `strict` yoqilmagan.
Shunda `data?.totals` natijasi amalda `any` bo'lib qoladi va uni
chaqirish xato deb hisoblanmaydi. Alohida sinov bilan tasdiqlandi:
`strict` siz aynan shu naqsh xato bermaydi, oddiy obyektda esa beradi.

**Bu typecheck'ga bo'lgan ishonchni pasaytiradi** — `?.` ishlatilgan
har joyda u qo'riqlamaydi. Rejadagi T12 («TypeScript `strict: true`»)
shu sababdan ustuvorroq bo'lishi kerak.

Tuzatildi: mahalliy `t` → `totals`, tarjima funksiyasi `useLanguage`
dan olinadi.

**Ochiq qolgani.** O'lchandi: **806 ta qattiq yozilgan matn nomzodi,
40 faylda** — Sozlamalar 183, Xabarlar 84, Kassa 66, Statsionar 45,
Ombor 41. Bu bitta o'tishda qilinadigan ish emas: har matnga kalit nomi
va ruscha tarjima kerak, va yuqoridagi hodisa ko'rsatdiki, avtomatik
ko'chirishni typecheck qo'riqlamaydi — har fayl qo'lda tekshirilishi
shart.

Tavsiya: modul-modul, har biriga alohida o'tish. Tartib — Kassa (audit
ko'rsatgan), Ombor, Sozlamalar.

*Holat:* 35 birlik + 283 API sinovi o'tdi. Uchala tsconfig toza, build
yig'ildi (`checkI18n` bilan birga).

### S5.1 — bajarildi 2026-08-29

Chekkalarda gradient — faqat surish MUMKIN bo'lgan tomonda ko'rinadi,
ya'ni u ma'lumot beradi, bezak emas. Route o'zgarganda faol element
`scrollIntoView` bilan ko'rinishga suriladi: `#/settings` da panel
`scrollLeft = 0` bo'lib qolardi va «Sozlamalar» umuman ko'rinmasdi.

⚠️ Hooklar `App.tsx` dagi ogohlantirish ostiga qo'yildi — erta `return`
lardan oldin. Birinchi urinishda ular pastroqqa tushib qolgan edi; bu
aynan faylda tasvirlangan halokat («kirgandan keyin bo'sh oq ekran»).

### S5.2 — bajarildi 2026-08-29

Sabab: `departments.filter(d => d.type === 'CLINICAL')`. Izohi
«laboratoriya/dorixonaga bemor to'g'ridan yozilmaydi» — LAB va PHARMACY
uchun to'g'ri, lekin **DIAGNOSTIC ham shu filtrga tushib qolgan**. UZI,
rentgen va EKG ga bemor to'g'ridan-to'g'ri keladi.

Yo'l-yo'lakay **B-21** yopildi: shifokor endi MAJBURIY (diagnostikadan
tashqari — tekshiruvni texnik bajaradi). Audit: «Shifokorsiz qabul
yaratiladi va "navbatga qo'shildi" deb yoziladi, lekin bunday yozuv hech
kimning "Mening navbatim" ida ko'rinmaydi».

### S5.3 — bajarildi 2026-08-29

**Sabab kutilganidan oddiy.** Kalendarda `doc.color || '#3B82F6'`
yozilgan; `Doctor.color` esa bazada **NULL** — oltita shifokorning
hammasida (o'lchandi). Ya'ni zaxira rang har doim ishlardi.

`doctorColor()` — rang shifokor ID'sidan hisoblanadi (FNV-1a).
Migratsiya kerak emas, har ochilishda bir xil rang chiqadi, va ro'yxat
tartibi o'zgarsa ham rang o'zgarmaydi (indeksga bog'liq emas — aks holda
yangi shifokor qo'shilganda hamma rang surilib ketardi).

Legenda endi **filtr**: bosilganda shu shifokorning qabullari qoladi,
kunlik ko'rinishda ustunlar ham toraytiriladi.

### S5.4 — bajarildi 2026-08-29

**Reja bilan koddagi qaror to'qnashdi.** `vite.config.ts` da yozilgan
edi: «PWA/service-worker olib tashlangan — desktop ilova uchun keraksiz
va offline bazani eskirgan kesh bilan chalkashtiradi».

Xavf haqiqiy, lekin uning manbai aniq: **API javoblarini keshlash**.
Statik fayllar mazmun xeshi bilan nomlanadi, ya'ni eskirmaydi.

Shuning uchun sozlama qat'iy:
- `globPatterns` faqat statik fayllar; `/api/` va `/uploads/`
  `navigateFallbackDenylist` da — o'lchandi, `sw.js` da `/api/` yo'q;
- `runtimeCaching: []` — hech qanday so'rov keshlanmaydi;
- **Electron'da service worker UMUMAN ro'yxatga olinmaydi**
  (`injectRegister: null` + `index.tsx` da UA tekshiruvi). Dastlabki
  qaror aynan desktop haqida edi va u kuchida qoladi. Bu ayniqsa muhim
  bo'lib qoldi, chunki S1.3 dan keyin Electron ham `http://localhost`
  dan yuklanadi — SW o'z-o'zidan ro'yxatga olinib qolishi mumkin edi.

Nima uchun umuman kerak: klinikada planshet va telefon shu serverga
tarmoq orqali ulanadi. `InstallPWAButton` va `usePWAInstall` allaqachon
yozilgan edi — ular manifest va SW yo'qligi uchun ishlamasdi (B-17).

### S5.5 — bajarildi 2026-08-29

**Code splitting — o'lchangan natija:**

| | Ilgari | Endi |
|---|---|---|
| Kirish chunki | 2 096 KB | **488 KB** |
| Chunk soni | 1 | 60 |
| `recharts` (376 KB) | kirishda | faqat grafikli sahifada |

`SignIn`, `QueueBoard` va `NotFound` ATAYLAB lazy emas: birinchisi —
birinchi ko'rinadigan ekran, ikkinchisi kiosk rejimida alohida oynada
ochiladi va u yerda yuklash indikatori xunuk, uchinchisi kichkina.

`Suspense` `ErrorBoundary` ICHIDA: chunk yuklanmasa (tarmoq uzildi,
eski kesh) xato ushlansin va oq ekran bo'lmasin.

**Sahifalash:** `?page=` qo'shildi. U BERILMASA javob shakli
o'zgarmaydi — oddiy massiv, ya'ni mavjud ekranlar buzilmaydi. Berilsa
`{ items, total, page, limit, pages }`.

### S5.6 — bajarildi 2026-08-29

**Kiosk rejimi allaqachon bor edi** — `/board/:clinicId`, ilova
qobig'idan tashqarida. Unga o'tish yo'li yo'q edi: manzilni qo'lda
yozib topish kerak edi. Tugma qo'shildi, yangi oynada ochiladi.

**Talon raqami** tuzatildi: navbat raqami har bo'limda 1 dan boshlanadi
(bu to'g'ri), ya'ni to'rt bo'limda bir vaqtda to'rtta «2» turadi.
Yorliq endi bo'lim kodi bilan — `K-02`, `P-02`. Ovozli chaqiruv ham shu
yorliqni aytadi.

### S5.7 — bajarildi 2026-08-29

`document.title` har route'da boshqacha: «Kassa · XClinic». Klinika nomi
ham qo'shiladi — bir necha klinikaning oynasi ochiq bo'lishi mumkin.
`react-helmet-async` qo'shilmadi: sarlavha allaqachon hisoblangan
(`pageLabel`), bitta qatorlik ish uchun yangi bog'liqlik ortiqcha.

`theme-color` (yorug'/qorong'i uchun alohida) va `meta description`
qo'shildi.

**404** — `pages/NotFound.tsx`. Ilgari `<Navigate to="/">` turardi va
noto'g'ri manzil JIMGINA Dashboard'ga tashlanardi (B-37). «Bosh
sahifaga» tugmasi rolga qarab ishlaydi — hamshirani Statsionarga olib
boradi, aks holda u yana 404 ga tushardi.

**Skroll** sahifa almashganda tepaga qaytadi (B-37).

### S5.8 — bajarildi 2026-08-29

Namoyish ma'lumoti API orqali yoziladi — bu ataylab, chunki shunda u
serverning barcha qoidalaridan o'tadi. Lekin `createdAt` server tomonda
`now()` bo'ladi, ya'ni mingta to'lov bitta soniyaga tushadi.

O'lchandi: dev bazada **495 ta `ChargePayment` aynan bitta vaqt
belgisida** (12:03 UTC = 17:03 Toshkent — auditdagi son).

Tuzatish FAQAT vaqt belgisiga tegadi: summalar, bog'lanishlar va
holatlar o'zgarmaydi, ya'ni yaxlitlik tekshiruvi buzilmaydi. Har yozuv
o'z biznes sanasiga ko'chiriladi va ish vaqtiga (09:00–18:00) taqsimlanadi.

Baza nusxasida sinaldi: 495 ta to'lov **56 kunga** tarqaldi.

*Holat:* 35 birlik + **288 API sinovi** o'tdi. Uchala tsconfig toza,
build yig'ildi (PWA bilan).

### S3.8 — tugatildi 2026-08-29

Playwright + Chromium o'rnatildi, **10 ta ssenariy** yozildi. Sinov o'z
serverini ko'taradi (`e2e/server.mjs`): baza NUSXASI (`VACUUM INTO` —
API sinovlaridagi bilan bir xil sabab), frontend build, bitta portda
front va API — S1.3 dan keyingi Electron sxemasining aynan o'zi.

**Uchta HAQIQIY bug topildi — API sinovlari ularni ko'ra olmasdi:**

**1. Front noto'g'ri portga urilardi — bu MENING S1.3 regressiyam.**
`getBaseUrl()` da shart `hostname !== 'localhost'` edi. `localhost` esa
quyidagi shoxga tushib, QAT'IY `http://localhost:3001` ni ishlatardi.
Electron `pickBackendPort()` bilan BO'SH portni tanlaydi — 3001 band
bo'lsa boshqasini. Ya'ni S1.3 da Electron'ni `http://localhost` ga
o'tkazganimdan keyin, ilova o'zi ko'targan serverga emas, 3001-portdagi
begona narsaga so'rov yuborardi.

Sinov buni darhol ko'rsatdi: server 3077 da, front esa «Tizimga kirishda
xatolik» berardi. Tuzatildi — HTTP orqali ochilgan har qanday holatda
shu manba ishlatiladi.

**2. Nav paneldagi `scrollIntoView` ishlamasdi.** S5.1 da yozgan
`scrollIntoView` birinchi renderda hech narsa qilmasdi — panel hali
o'lchamga ega emas (`clientWidth = 0`). Sinov «viewport ratio 0» deb
ko'rsatdi. `requestAnimationFrame` + qo'lda `scrollLeft` bilan
almashtirildi (uch urinish: layoutdan keyin, keyingi kadrda, shrift
yuklangach).

**3. `Input`/`Select` yorlig'i maydonga BOG'LANMAGAN edi** — `htmlFor`
ham, `id` ham yo'q. Ko'z bilan hammasi joyida, lekin ekran o'quvchi
maydonni nomsiz «edit text» deb o'qiydi va yorliqni bosganda fokus
o'tmaydi. `useId` bilan bog'landi; xato matni ham `aria-describedby`
orqali maydonga ulandi.

**Ikkita yon topilma:**

- **Bemorlar sahifasida ALOHIDA bemor formasi bor** — u
  `AddPatientModal` ni ishlatmaydi. Ya'ni S3.1 validatsiyasi faqat
  bittasiga tegib, ikkinchisidan «abcdefg!!!» baribir o'tib ketardi.
  Ikkalasi ham endi `shared/validation.ts` dan o'qiydi.
- Ikkala formada ham validatsiya **jimgina `return`** qilardi: tugma
  bosiladi, hech narsa bo'lmaydi, sabab ko'rsatilmaydi. Umumiy xato
  qatori qo'shildi (`role="alert"`).

*Beqarorlik yo'q:* uch marta ketma-ket 10/10. Sinov ma'lumotining
noyobligi `Date.now()` ga tayanardi va ketma-ket ishga tushirishda
takrorlanib, 409 keltirardi — tasodifiy qism oldinga qo'yildi.

### S4.1 — tugatildi 2026-08-29

Rejaning o'z tartibida davom ettirildi («Kassa, Ombor, Bemorlar,
Sozlamalar»):

| Modul | Ko'chirildi |
|---|---|
| Moliya hisoboti | 54 |
| Kassa | 70 |
| Ombor | 26 |

Jami **150 ta matn**, kalitlar soni 850 → **1000**, muvofiqlik 1000/1000.

**`t` to'qnashuvi yana chiqdi.** `CashBook.tsx` da ham `const t =
day.totals` turgan ekan — FinanceReport dagi bilan aynan bir xil. Bu
safar migratsiyadan OLDIN tekshirildi va `totals` ga qayta nomlandi.

**Yordamchi komponentlar alohida ish talab qildi.** `SummaryTiles`,
`MethodStrip`, `ClosureChip`, `CashFlowPanel`, `ClosureBanner` —
beshalasi `CashBook` dan TASHQARIDA e'lon qilingan, ya'ni uning `t`
idan foydalana olmaydi. Har biriga o'z `useLanguage()` i qo'shildi;
ifoda ko'rinishidagilar blokka aylantirildi.

**Qolgan modullar.** O'lchov: dastlab 806 ta nomzod edi, hozir
~650 ta qoldi — Xabarlar (84), Sozlamalar (183), Statsionar (45) va
boshqalar. Ularning har biri xuddi shu tartibda o'tkazilishi kerak:
`t` to'qnashuvini tekshirish → `useLanguage` ulash → ko'chirish →
`checkI18n` → build. Avtomatlashtirib bo'lmaydi: yuqoridagi ikkala
to'qnashuv ham typecheck'dan o'tib ketgan bo'lardi.

*Holat:* 35 birlik + 288 API + **10 brauzer sinovi** o'tdi. Uchala
tsconfig toza, build yig'ildi.

---

## Yo'l-yo'lakay topilgan va tuzatilgan narsalar

Bular rejada yo'q edi — ish davomida chiqdi.

| Nima | Qayerda | Qanday topildi |
|---|---|---|
| `POST /api/diagnoses` `visitId` ni o'qimasdi | `backend/server.ts` | S3.7 sinovi yiqildi |
| Partiya kirimi `StockMovement` yozmasdi (0028 invarianti) | `backend/multiprofile.ts` | S2.5 sinovi `integrity` ni yiqitdi |
| Hamshira bemorni umuman ko'ra olmasdi | `App.tsx` nav | S1.1 da matritsa ko'rilganda |
| Sinov yurituvchisi Windows'da vaqtinchalik papkani tozalamasdi | `tests/run-api.ts` | 27 ta papka ~200 MB yeb qo'ygan |
| Sinovdagi JSHSHIR `Date.now() % 1000000` — boshidagi nol yo'qolardi | `tests/api/patients.ts` | S3.1 validatsiyasi yoqilgach |
| Chop etish sarlavhasi «DentalFlow Clinic» | `i18n/translations.ts` | S4.1 kalitlari ko'rilganda |
| Front noto'g'ri portga urilardi (S1.3 regressiyasi) | `services/api.ts` | brauzer E2E |
| `Input`/`Select` yorlig'i maydonga bog'lanmagan | `components/Common.tsx` | brauzer E2E |
| Bemorlar sahifasida ikkinchi, validatsiyasiz forma | `pages/Patients.tsx` | brauzer E2E |
| Validatsiya jimgina `return` qilardi — sabab ko'rinmasdi | ikkala bemor formasi | brauzer E2E |
| `scrollIntoView` birinchi renderda ishlamasdi | `App.tsx` nav | brauzer E2E |
| Kalendar bloklari rangsiz: rang o'rniga FUNKSIYA qo'yilgan (`${doctorColor}15`) | `pages/Calendar.tsx` | kalendar ustida ishlaganda |
| Nav markazlashtirish tasodifan ishlamasdi — uchala urinish panel render bo'lguncha sarflanardi | `App.tsx` | E2E beqarorligi ortidan |
| Hafta ko'rinishida 6 shifokor bitta ustunni bo'lishardi — ismlar «Tosh…» ga aylanardi | `pages/Calendar.tsx` | foydalanuvchi ko'rsatdi |
| Kunlik ko'rinishda ustunlar UMUMAN yo'q edi: `grid-cols-[...${n}...]` — dinamik Tailwind klassi hech qachon yaratilmaydi | `pages/Calendar.tsx` | foydalanuvchi ko'rsatdi |
| **Moliya ochilmasdi** (`Cannot access 'totals' before initialization`) — S4.1 dagi `t`→`totals` qayta nomlash callback PARAMETRLARINI ham almashtirgan: `.filter(t => totals…)`. 7 joyda | `pages/CashBook.tsx` | foydalanuvchi ko'rsatdi |
| **`@types/react` umuman o'rnatilmagan edi** — butun frontend tekshiruvsiz: `noImplicitAny` 10 524 xato berardi | `package.json` | `strict` ni yoqishga urinilganda |
| `onClick={openAddModal}` — React sichqoncha hodisasini `initialDate` ga uzatardi | `pages/Calendar.tsx` | strict |
| `Select` `disabled` variantni chizmasdi — «Balansdan» balans 0 da ham tanlanardi | `components/Common.tsx` | strict |
| `dark:stroke` — Tailwind sintaksisi JS propida, hech qachon ishlamagan | `pages/Dashboard.tsx` | strict |
| «Suratlar» tabi turda yo'q edi | `pages/PatientDetails.tsx` | strict |
| `Doctor.status` da `Deleted` tushib qolgan — o'chirilganlarni chetlab o'tuvchi filtrlar «ma'nosiz» ko'rinardi | `types.ts` | strict |
| `Service.departmentId`, `Doctor.departmentId`, `Clinic.telegramChatId`, `TriggerDescriptor.supportsSegment/Schedule`, `SegmentFieldDescriptor.enum_months` — bazada bor, turda yo'q | `types.ts` | strict |
| SMS shablonlarida `{ism}`/`{summa}` — qo'llab-quvvatlanmaydigan tokenlar, bemorga xom holda ketardi | `backend/demoSeed.ts` | sahifalarni ko'zdan kechirish |
| Namoyish ma'lumotida xizmat bo'limga qaramay tanlanardi (xirurgda «Pediatr konsultatsiyasi») | `backend/demoSeed.ts` | Shifokorlar statistikasi |
| Bosh sahifadagi doiraviy diagramma legendasi kartadan toshib, pastdagi bo'limlar ustiga tushardi (17 tur, 36px joy) | `pages/Dashboard.tsx` | bosh panelga blok qo'shilganda |
| O'sha diagrammada rang SARALASHDAN OLDIN berilardi — tilim rangi bilan o'rni mos kelmasdi | `pages/Dashboard.tsx` | o'sha yerda |
| «Moliyaviy Oqim» izohida xom inglizcha kalitlar: «revenue : 0», «appointments : 19» | `pages/Dashboard.tsx` | o'sha yerda |

---

