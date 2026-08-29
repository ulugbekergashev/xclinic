# XClinic

Ko'p profilli klinika uchun **offline** boshqaruv tizimi.

Kod bazasi `denta7` dan olingan, offline arxitektura esa `dentalocal` namunasida
qurilgan. **denta7 ning ma'lumotlar bazasi olinmagan** — XClinic butunlay
alohida bazada ishlaydi va denta7 ga hech qanday ta'sir ko'rsatmaydi.

---

## Ishga tushirish

```bash
# 1) Bog'liqliklar
npm install
cd backend && npm install && cd ..

# 2) Backend sozlamasi
cp backend/.env.example backend/.env
# JWT_SECRET ni o'zgartiring (yoki bo'sh qoldiring — birinchi ishga tushishda
# tasodifiy kalit avtomatik yaratilib, AppData ga saqlanadi)

# 3) Bazani yaratish (bo'sh sxema — hech qanday tayyor ma'lumotsiz)
cd backend && npx prisma db push && cd ..

# 4) Dev rejimda
cd backend && npm run dev     # 3001-port
npm run dev                   # 3000-port

# yoki Electron oynasi bilan birga
npm run electron:dev
```

### O'rnatuvchi (.exe) yasash

```bash
cd backend && npm run bundle && cd ..
npm run electron:build        # dist-electron/ ichida NSIS o'rnatuvchi
```

---

## Klinikaga sotish va o'rnatish

XClinic **bir marta sotiladi**. Obuna, tarif va muddat yo'q.
Nusxadan himoya — aktivatsiya kaliti orqali: u mashina
identifikatoridan hisoblanadi va faqat o'sha kompyuterda ishlaydi.

### Xaridor tomonida

1. O'rnatuvchini yurgizadi va dasturni ochadi
2. **Birinchi sozlash** ekrani chiqadi va unda **mashina identifikatori**
   ko'rinadi (masalan `HWID-D181C74D0481596B`)
3. Xaridor «nusxa olish» tugmasi bilan kodni oladi va sizga yuboradi
4. Sizdan kalit kelgach: klinika nomi, administrator logini va parolini
   kiritadi, kalitni qo'yadi va «Sozlashni yakunlash» ni bosadi
5. Tayyor — o'sha login bilan kiradi

Bo'lim, xizmat va narxlarni keyin Sozlamalardan o'zi kiritadi.

### Siz tomonda

```bash
cd backend
npx ts-node --transpile-only scripts/generateKey.ts <MASHINA-ID>
```

Admin parolini unutsa — alohida kalit:

```bash
npx ts-node --transpile-only scripts/generateKey.ts <MASHINA-ID> --recovery
```

Ikkalasi **boshqa-boshqa tuzdan** hisoblanadi: xaridordagi aktivatsiya
kaliti bilan admin parolini tiklab bo'lmaydi.

> **Tuzlar** `backend/licenseService.ts` da. Ular ochiq repozitoriyaga
> chiqsa himoya ma'nosini yo'qotadi.

### Nima qachon tekshiriladi

Aktivatsiya tekshiruvi **faqat paketlangan nusxada** yoqiladi — Electron
backendga `LICENSE_ENFORCE=1` beradi. Ishlab chiqishda va sinovlarda u
o'chiq, aks holda har o'zgarishdan keyin kalit kiritish kerak bo'lardi.
Qo'lda sinash uchun:

```bash
cd backend && LICENSE_ENFORCE=1 npx ts-node server.ts
```

Aktivlashtirilmagan nusxada `/api/*` marshrutlari `403 LICENSE_REQUIRED`
qaytaradi; sozlash, kirish va statik fayllar ochiq qoladi.

---

## Arxitektura

| Qatlam | Texnologiya |
|---|---|
| Frontend | React 19 + Vite 6 + TypeScript + Tailwind 4 + react-router 7 |
| Backend | Express 5 + Prisma 5 + **SQLite** |
| Desktop | Electron 41 + electron-builder (NSIS) |

Electron ishga tushganda `electron/main.ts` backendni alohida jarayon sifatida
ko'taradi, `/health` javob berguncha kutadi, so'ng oynani ochadi. 3001-port band
bo'lsa bo'sh port tanlanadi va frontendga `?port=` orqali uzatiladi.

### Ma'lumotlar qayerda saqlanadi

Hammasi `%APPDATA%\xclinic\` ichida:

```
xclinic.db        — SQLite bazasi
uploads/          — bemor fotolari, logo, ombor rasmlari
jwt.key           — avtomatik yaratilgan token kaliti
.env              — o'rnatilgandan keyingi sozlamalar
```

> `dentalocal` `%APPDATA%\dentalflow-crm\` ni ishlatadi. Papkalar boshqa —
> ikki dastur bitta kompyuterda yonma-yon ishlasa ham bazalari to'qnashmaydi.

### Tarmoqdan kirish

Backend qurilgan frontendni ham o'zi tarqatadi, shuning uchun klinikadagi boshqa
kompyuter yoki telefon hech narsa o'rnatmasdan `http://<server-ip>:3001` ga kirib
ishlay oladi. CORS xususiy tarmoqlarga (192.168.x.x, 10.x.x.x, 172.16–31.x.x)
ochiq, tashqi domenlarga yopiq.

---

## denta7 dan nima olindi, nima olinmadi

### Olingan

Bemorlar, kalendar/qabullar, moliya va kassa kitobi, shifokorlar va ular
analitikasi, ombor, onlayn navbat, lidlar, xabarlar (shablonlar, avtomatik
qoidalar, segment quruvchi), bo'lib to'lash, xizmatlar/kategoriyalar, ICD-10
tashxislar, sozlamalar va ruxsatlar tizimi, i18n tarjimalari, AI yordamchi.

### Olinmagan

- **Ma'lumotlar bazasi** — `dev.db`, `starter.db`, migratsiyalar, seed ma'lumotlari.
  Sxema (`schema.prisma`) olingan, ichidagi ma'lumotlar emas.
- **SaaS qatlami** — `SuperAdminDashboard`, `SalesDashboard`, `LandingPage`,
  landing komponentlari, `SubscriptionBlockModal`, obuna blokirovkasi mantig'i.
- **Bulut infratuzilmasi** — Vercel/Railway konfiglari, `.env` sirlari,
  Cloudinary, PWA service-worker.
- Ishlab chiqish chiqindilari — `check_*`, `test_*`, `debug_*`, `fix_*` skriptlari,
  `node_modules`, `dist`, `.git`.

### O'zgartirilgan

| Nima | denta7 | XClinic |
|---|---|---|
| Baza | PostgreSQL (Railway) | SQLite (`%APPDATA%\xclinic\`) |
| Fayllar | Cloudinary | mahalliy `uploads/` |
| API manzili | Railway URL | `localhost` / LAN / Electron porti |
| CORS | bulut domenlari | mahalliy tarmoq |
| Tailwind | `cdn.tailwindcss.com` | bundle ichida (`index.css`) |
| Router | `BrowserRouter` | `HashRouter` (`file://` uchun) |
| JWT kaliti | `.env` majburiy | birinchi ishga tushishda avtomatik |
| Sessiya kaliti | `dentalflow_auth` | `xclinic_auth` |

Uchta tuzatish alohida e'tiborga loyiq — bularsiz offline nusxa ishlamas edi:

1. **Tailwind CDN'dan yuklanardi.** Internetsiz kompyuterda dastur butunlay
   stilsiz ochilardi. Endi Tailwind bundle ichida, palitra `index.css` da.
2. **CORS mahalliy tarmoqni bloklardi.** `192.168.x.x` ro'yxatda yo'q edi —
   shifokorning telefoni yoki ikkinchi kompyuteri serverga ulana olmasdi.
3. **JWT_SECRET bo'lmasa server o'chib qolardi.** Klinika o'zi o'rnatadigan
   dasturda qo'lda kalit yozishni talab qilib bo'lmaydi.

---

## Ko'p profilli klinika

Stomatologiyaga bog'liqlik olib tashlandi. Tish kartasi (`TeethChart`, 600 qator),
`ToothData` modeli va `toothNumber` maydonlari o'chdi.

### Asosiy g'oya

`Visit` (qabul) — butun tizimning markazi. Har bir modul unga `visitId` orqali
ulanadi va narxi bitta `Transaction` oqimiga tushadi, shuning uchun kassa va
moliya mantig'i yangi bo'lim qo'shilganda o'zgarmaydi.

### Bo'limlar

`Department` modeli va uning `type` maydoni (CLINICAL / LAB / DIAGNOSTIC /
INPATIENT / PHARMACY) qaysi UI ko'rsatilishini hal qiladi. Shifokor, xizmat,
qabul va kalendar bo'limga bog'lanadi.

Seed 11 ta bo'lim yaratadi: terapiya, kardiologiya, nevrologiya, ginekologiya,
pediatriya, xirurgiya, LOR, laboratoriya, diagnostika, statsionar, dorixona.

### Qabul bayoni tish kartasi o'rniga

`EncounterTemplate` — bo'limga tegishli maydonlar to'plami (JSON). Kardiologga
EKG va arterial bosim, ginekologga hayz sikli, pediatrga emlash — bir xil
komponent, har xil shablon. Seed 7 ta shablon beradi.

### Laboratoriya

Tahlillar katalogi (`LabTest`) + ko'rsatkichlar va normalar
(`LabTestParameter`). **Norma jins va yoshga bog'liq**: gemoglobin 125 g/l
ayolda norma, erkakda past. Normani server tanlaydi, bahoni (`Normal`/`High`/
`Low`) hisoblab **saqlaydi** — norma keyin o'zgarsa eski natija o'z bahosini
yo'qotmaydi.

Seed 6 ta tahlil, 45 ta ko'rsatkich beradi: umumiy qon, umumiy siydik,
biokimyo, gormonlar, koagulogramma, qon guruhi.

### Diagnostika

UZI, EKG, rentgen, endoskopiya, MRT, KT. Natija — tavsif + xulosa + rasm.
Rasmlar mahalliy `uploads/` ga tushadi va backup'ga baza bilan birga kiradi.

### Statsionar

Palata, koyka, yotqizish, kunlik obxod, dori tayinlash, chiqarish. Koyka
bandligi serverda tekshiriladi — ikki bemor bitta koykaga tushmaydi (409).

### Dorixona

`InventoryBatch` — partiya va yaroqlilik muddati (FEFO). `Prescription` —
retsept; dori omborda bo'lmasa ham yozish mumkin.

---

## Baza va API

48 model (denta7 da 33 edi). Yangi endpointlar `backend/multiprofile.ts` da —
`server.ts` allaqachon 6000 qatordan oshgani uchun alohida fayl.

```
/api/departments          /api/visits            /api/studies
/api/encounter-templates  /api/lab-tests         /api/wards
/api/lab-orders/:id/results                      /api/admissions
/api/prescriptions        /api/inventory-expiring
```

Seed ishga tushirish:

```bash
cd backend && npx ts-node seed.ts
```

Birinchi ishga tushishda `admin` / `admin` logini yaratiladi —
**Sozlamalarda parolni albatta o'zgartiring**.

---

## Ish jarayoni (oqim)

Tizim ekranlar to'plami emas — bemorni bir qo'ldan ikkinchisiga uzatadigan
konveyer. Bemor **faqat registraturada** tanlanadi, qolgan hamma narsa qabul
ichidan bajariladi.

```
Registratura  bemor -> bo'lim -> shifokor -> QABUL ochiladi (navbat №, talon)
     |
Kassa         har buyurtma alohida hisob qatori: to'lanmagan -> to'langan
     |
Shifokor      "Mening navbatim" -> qabul ish stoli:
              bayon · tashxis · tahlilga · diagnostikaga · retsept · yakunlash
     |
Lab/Diag      shifokordan kelgan yo'llanmalar -> natija -> shifokorga qaytadi
```

### Moliya

Ikkita tab: **Kassa** (pul harakati, smena) va **Hisobot** (bo'limlar bo'yicha foyda).

Hisobot qaytadan qurilgan. denta7 dagisi bitta o'lchovda edi — shifokorlar.
Ko'p profilli klinikada asosiy savol boshqa: **qaysi bo'lim qancha keltiradi va
qanchasi foyda**. Endi hisobot bo'lim kesimida: tushum, olingan pul, qarz,
material tannarxi va marja foizi.

Daromad `VisitCharge` dan olinadi (haqiqiy tushum daftari), tannarx esa xizmat
retseptidan — shuning uchun marja o'ylab topilgan emas, hisoblangan raqam.

> **Laboratoriya endi xarajat emas.** denta7 da har tahlil `category: 'Lab'`
> xarajat yozardi — stomatologiyada to'g'ri edi, chunki protez tashqi
> laboratoriyaga buyurtma qilinardi. Bu yerda laboratoriya o'z bo'limimiz va
> daromad keltiradi; ikkalasi yozilsa bitta summa ikki marta hisoblanib sof
> natija nolga tushardi. Eski 'Lab' xarajatlari hisobotda alohida ogohlantirish
> bo'lib chiqadi va sof foydadan chegirilmaydi.

Shifokor buyurgan xizmatlarning to'lanmagan qatorlari Kassa tabidagi
mavjud **«To'lanmagan»** ro'yxatiga qo'shiladi — «Shifokor buyurgan» yorlig'i
bilan. Alohida to'lov ekrani **yo'q**: `CashBook` allaqachon to'lov qabul
qiladi va qarz yopadi.

### To'lov modeli

To'langanlik **qabulga emas, har bir xizmat qatoriga** tegishli (`VisitCharge`) —
bitta qabulda konsultatsiya to'langan, tahlil to'lanmagan bo'lishi mumkin.
Bemor har yangi yo'llanma bilan kassaga qaytadi, xuddi qog'oz bilan yurgandek.

- **Shifokorda blok yo'q** — faqat ogohlantirish. Shoshilinch holatda bemorni
  kassa uchun kutdirib bo'lmaydi; qarz qolib ketaveradi.
- **Laboratoriyada blok bor** — to'lovsiz natija kiritilmaydi (HTTP 402).
- Qisman to'lov: summa navbat bo'yicha taqsimlanadi, qolgani qarz bo'lib qoladi.

### Qabul holatlari

`Waiting → Called → In Progress → AwaitingResults → Completed`

**`AwaitingResults`** muhim: bemor tahlilga ketganda qabul navbatdan chiqadi,
lekin **yopilmaydi** — aks holda shifokor ro'yxati soxta band bo'lib turadi.

### Ombor

Qoldiq hech qachon qo'lda yozilmaydi — har o'zgarish `StockMovement` qatori,
qoldiq esa ularning yig'indisi. Chiqim **FEFO**: muddati eng yaqin partiyadan.

**Xizmat retsepti** (`ServiceRecipe`) — bitta xizmatga qancha material ketishi.
Xizmat qabulga qo'shilganda materiallar **avtomatik** chiqadi va tannarx
hisoblanadi. Bunsiz hech kim har shpritsni qo'lda yozmaydi va qoldiq yolg'on
bo'lib qoladi.

> Dorixona (sotuv) rejadan chiqarilgan — ombor faqat sarflanadigan materiallar
> uchun. Retsept shifokor yozadigan hujjat bo'lib qoladi.

### Navbat tablosi

Kutish zalidagi ekran uchun: `http://<server-ip>:3000/#/board/<clinicId>`

**Login talab qilmaydi** — tablo alohida televizorda turadi. Shuning uchun
u faqat navbat raqami va bo'limni ko'rsatadi: bemor ismi na ekranda, na
ovozda chiqmaydi.

Ovozli chaqirish brauzerning o'z sintezatori bilan ishlaydi — internet
kerak emas.

### Rol bo'yicha bosh sahifa

Registrator → Registratura · Shifokor → Mening navbatim · Laborant → Laboratoriya

---

## denta7 dan ajratilganlik

Tekshirilgan va tasdiqlangan:

| Nima | Holat |
|---|---|
| Git tarixi / remote | yo'q — `.git` umuman ko'chirilmagan |
| denta7 mijozlar bazasi | yo'q — bazada faqat seed va sinov yozuvlari |
| Postgres / Railway ulanishi | yo'q — faqat mahalliy SQLite |
| Cloudinary, Groq, Eskiz kalitlari | yo'q — `.env` da faqat mahalliy sozlamalar |
| dentacrm.uz / dentafull / railway / vercel | kodda ham, qurilgan nusxada ham 0 ta |
| AppData papkasi | `%APPDATA%\xclinic` — dentalocal `dentalflow-crm` dan boshqa |

Audit paytida topilgan va tuzatilgan bog'lanishlar:

1. **Litsenziya kaliti dentalocal bilan bir xil edi.** `SECRET_SALT` va
   `RECOVERY_SALT` aynan bir xil bo'lgani uchun dentalocal uchun berilgan
   aktivatsiya kaliti XClinic'ni ham ochib yuborardi. Kalitlar almashtirildi.

2. **SMS denta7 hisobidan yuborilardi.** `ESKIZ_NICK` standart qiymati `'4546'` —
   bu denta7 ning Eskiz kabinetida ro'yxatdan o'tgan jo'natuvchi nomi. Sozlanmagan
   nusxa boshqa klinikaning hisobidan SMS yuborardi. Standart qiymat olib
   tashlandi; nom kiritilmasa SMS umuman yuborilmaydi.

3. **Cloudflare tunneli `dentacrm-...` nomi bilan yaratilardi** -> `xclinic-...`.

4. **Demo lid endpointi `demo.dentacrm.uz`** ga ishora qilardi -> `localhost`.

5. **Bayroq rasmlari `flagcdn.com` dan yuklanardi** — offline mashinada
   ko'rinmasdi. Emoji bilan almashtirildi.

Ixtiyoriy integratsiyalar (AI, SMS, Telegram, Cloudflare tunnel, Facebook, DMED)
kod ichida qoldi, lekin ularning hech biri kalitsiz/sozlamasiz ishlamaydi —
ya'ni sukut bo'yicha hech qayerga so'rov yubormaydi.
