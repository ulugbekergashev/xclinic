# PLAN-HR — Xodimlar moduli

Sana: 2026-09-09. Holat: **bajarildi**. `PLAN-HOMES.md` ning davomi.

Asos: foydalanuvchi bergan reference (SARIOSIYO CRM, o'quv markazi uchun
HR moduli). Reference'ning ~90% i klinikaga to'g'ri keldi; qolgani —
«guruh», «dars» va «ustoz» tushunchalari — klinika tiliga o'girildi.

---

## 0. Nima qilindi

**Xodimlar endi alohida modul** (`/staff`), menyu punkti bilan. Ilgari u
Sozlamalar ichidagi vkladka edi, ulush va vedomost esa Moliyada. Ya'ni
«bu odam qancha oladi va qancha ishladi?» degan BITTA savolga javob
izlayotgan odam ikkita bo'limni kezib chiqishi kerak edi.

| Nima | Qayerda edi | Endi qayerda |
|---|---|---|
| Xodimlar ro'yxati | Sozlamalar → Xodimlar | **Xodimlar** (menyu) |
| Xodim kartasi | modal oyna | alohida sahifa `/staff/:rol/:id` |
| Stavkalar (ulush foizi) | Moliya → Ulush + modal | karta → Stavkalar |
| Vedomost | Moliya → Ulush | Xodimlar → Ulush va vedomost |
| Oylik, bonus, jarima | **hech qayerda** | karta → Maosh |
| Ish grafigi (hafta kunlari) | **hech qayerda** | karta → Ish grafigi |
| Xodim davomati | **hech qayerda** | karta → Ish grafigi |

Moliyada uchta vkladka qoldi: Kassa, Hisobot, Davomat.

---

## 1. Nima topildi — uchta narsa bazada ham, kodda ham yo'q edi

**1. Oylik faqat shifokorda bor edi.** `Doctor` da `salaryType`,
`fixedSalary` va `percentage` turadi, qolgan uch jadvalda esa umuman yo'q.
Ya'ni registrator, laborant va hamshiraning oyligini dasturga yozib
bo'lmaydi — u daftarda yoki Excel da qoladi. Klinikada ular xodimlarning
yarmidan ko'pi.

**2. Bonus va jarima yozadigan joy yo'q edi.** Ular «Boshqa xarajat»
bo'lib yoziladi va kimga tegishli ekani yo'qoladi: yil oxirida «bu odamga
qancha bonus berdik» degan savolga baza javob bermaydi.

**3. Ish grafigi yarim edi.** `startHour`/`endHour` — kunning SOATI, lekin
HAFTANING qaysi kunlari ishlashi hech qayerda yo'q. Shu sababli
«yuklama» degan tushunchani ham hisoblab bo'lmasdi.

**Yo'l-yo'lakay topilgan bug.** `PUT /api/doctors/:id` **bo'limni qabul
qilmasdi**: yaratishda `departmentId` o'tardi, tahrirlashda esa maydonlar
ro'yxatiga umuman kiritilmagan edi. Ya'ni bir marta noto'g'ri qo'yilgan
bo'limni tuzatib bo'lmasdi — forma yuboradi, server jimgina tashlab
yuboradi, ekran esa «saqlandi» deydi. «Bugun», bemor kartasi va kalendar
shifokorlarni aynan bo'lim bo'yicha filtrlaydi. Endi to'rt rol ham bitta
yo'ldan o'tadi (`staffCommonFields`).

---

## 2. Eng muhim qaror — pul ikki marta berilmasligi

Vedomost (`payroll.ts`) shifokorga **ikkalasini ham** hisoblaydi: ulushni
ham, FIX MAOSHNI ham (`computePayroll` ichidagi «FIX MAOSH» bo'limi,
migratsiya 0033 dan keyin). Bu darrov ko'zga tashlanmaydi, chunki vedomost
qatorida ular bitta summa bo'lib chiqadi.

Agar xodim kartasi ham asosiy oylikni to'laganda, bitta pul ikki marta
berilardi va buni faqat oy oxirida, kassa farq qilganda sezilardi.

Shuning uchun:

| Rol | Asosiy oylik | Ulush | Bonus / jarima |
|---|---|---|---|
| Shifokor | **vedomost** | **vedomost** | karta |
| Registrator, laborant, hamshira | karta | — (yo'q) | karta |

Kartada shifokorning «Asosiy» qatori **0** turadi va yonida sabab
yozilgan; «Maosh to'lash» tugmasi esa «Bonusni to'lash» deb ataladi.
Server ham shunday ishlaydi: bonussiz shifokorga to'lov **400** qaytaradi
va xabarida vedomostga yo'naltiradi.

**Foiz (KPI) qolgan uch rolga QO'SHILMADI.** Ulush to'langan xizmatdan
hisoblanadi va uni faqat shifokor bajaradi. Registratorga «KPI foizi»
maydonini qo'yish — hech qachon pul chiqarmaydigan maydon ko'rsatish
bo'lardi. Reference'da u bor, lekin u yerda ham nol turadi.

---

## 3. Boshqa qarorlar

**Davomat oylikdan avtomatik ushlamaydi.** Kelmagan kun uchun qancha
ushlash — direktorning qarori va summasi har xil bo'ladi. Dastur o'zi
ushlasa, hech kim so'ramagan pul ushlanib qoladi. Kelmagan kun ko'rinadi,
ushlash esa jarima orqali qo'lda yoziladi.

**Har xodimga har oy uchun bitta to'lov.** Buni baza kafolatlaydi
(`StaffSalaryPayment` dagi unikal indeks), server esa tushunarli **409**
qaytaradi. To'langandan keyin oy **qotadi**: bonus ham qo'shilmaydi,
jarima ham o'chirilmaydi — hujjat keyin o'zgarmasligi kerak.

**Summa har doim serverda hisoblanadi.** Brauzerdan kelgan `amount`
e'tiborga olinmaydi (sinovda ataylab 999 999 999 yuboriladi va server
o'zining 2 200 000 ini yozadi).

**Pul xarajat bo'lib chiqadi.** Har to'lov `Expense` (kategoriya `Salary`)
yaratadi va ikkalasi bitta tranzaksiyada yoziladi. Aks holda pul kassada
ham, hisobotda ham ko'rinmasdi.

**Haftalik yuklama ish grafigidan hisoblanadi:**

```
yuklama = shu hafta band qilingan daqiqalar ÷ (ish kunlari × kunlik soat × 60)
```

Grafik belgilanmagan bo'lsa yuklama **ko'rsatilmaydi** — reference'dagi
«24 dars/hafta = to'liq stavka» kabi o'ylab topilgan me'yor bilan foiz
chiqarish, aslida hech narsa anglatmaydigan raqam ko'rsatish bo'lardi.
Ekranda buning o'rniga sabab yoziladi.

---

## 4. Baza — migratsiya 0036

```
Doctor, Receptionist, LabTechnician, Nurse   + workDays
Receptionist, LabTechnician, Nurse           + fixedSalary, email
Receptionist                                 + specialty
StaffAdjustment      bonus va jarima (oy kesimida)
StaffAttendance      kunlik davomat, bir kun = bir yozuv (unikal indeks)
StaffSalaryPayment   oylik to'lovi, bir oy = bir to'lov (unikal indeks)
```

To'rtta xodim jadvali **birlashtirilmadi** — ularga tizimga kirish va
qabullar, yozuvlar, tahlillar bilan bog'lam osilgan. Shu sababli yangi
jadvallar `staffRole` + `staffId` juftligi bilan bog'lanadi.

---

## 5. Sinovlar

| Nima | Soni |
|---|---|
| `backend/tests/api/hr.ts` — yangi to'plam | 53 |
| `e2e/staff.spec.ts` — qayta yozildi (modul, karta, grafik) | 6 |
| `e2e/payroll.spec.ts` — yangi manzilga ko'chirildi | 3 |

Yangi to'plam tekshiradigan asosiy va'dalar: oylik ikki marta
to'lanmaydi · shifokorning asosiy oyligi kartadan chiqmaydi · pul xarajat
bo'lib chiqadi · to'langan oy qotadi · summa serverda hisoblanadi ·
kelajakdagi kunga davomat yozilmaydi · modul faqat klinika egasiga ochiq.

---

## 6. Nima qilinmadi

- **Xodimning o'z kabineti** (shifokor o'z oyligini ko'rishi). Avval
  raqamga ishonch kerak — vedomost bilan ham shu qoida edi.
- **Ta'til va bemorlik varaqasi.** Holat (`status`) darajasida bor
  («Ta'tilda»), lekin kun hisobi yo'q.
- **Oylikni bo'lib to'lash.** Bir oy — bitta to'lov. Bo'lib to'lash kerak
  bo'lsa, u alohida ish: to'lov jadvali va qoldiq hisobi qo'shiladi.
- **Davomatni turniket yoki bot orqali avtomatik yig'ish.** Hozir qo'lda
  belgilanadi.

---

## 7. Eganing tasmasi — «Bugun hal qilinsin»

Ikkinchi bosqich (2026-09-09, o'sha kuni). Foydalanuvchi bergan
reference'dagi bosh sahifadan olingan.

**Muammo.** Klinika egasi kirganda birinchi ko'radigan ekran «Bugun»,
ya'ni REGISTRATORNING ish stoli. Eganing savoli boshqa: «bugun nimaga
aralashishim kerak?» Javob olti ekranga tarqalgan edi — yopilmagan smena
Kassada, muddati o'tgan dori Omborda, natijasiz tahlil Laboratoriyada,
vedomost Xodimlarda. Har biriga kirib ko'rmaguncha, muammo borligi
bilinmasdi.

**Yechim — alohida sahifa emas, «Bugun» tepasidagi tasma.** Faqat egaga
ko'rinadi. Menyu endigina 15 dan 10 ga tushgan, yana bitta punkt qo'shish
o'sha ishni orqaga qaytarardi.

Tasmada to'rtta raqam (bugun kassaga · qarz · bugungi qabullar · bemorlar)
va **«Bugun hal qilinsin»** ro'yxati. Ro'yxat bandlari:

| Band | Manba |
|---|---|
| N ta bemor 30+ kun to'lamagan | `VisitCharge` (qabul sanasi bo'yicha yoshi) |
| Kassa smenasi yopilmagan | harakat bor, `CashRegisterDay` yo'q kun |
| Muddati o'tgan / 30 kunda tugaydigan partiya | `InventoryBatch` |
| Minimumdan past mahsulot | `InventoryItem.minQuantity` |
| Natijasi kiritilmagan tahlil / diagnostika | `status = 'Ordered'`, 1 kundan ortiq |
| O'tgan yozuv yopilmagan | `Appointment` `Pending`/`Confirmed` |
| Bu oyga vedomost tuzilmagan | `PayrollRun` |
| Oyligi kiritilmagan xodim | to'rt jadval bo'ylab |

**Ikkita qoida.** Nol bo'lgan band ro'yxatga **umuman tushmaydi** —
«0 ta muddati o'tgan dori» degan qator bezak, va u orasida haqiqiy muammo
ko'rinmay qoladi. Har band bosilganda aynan o'sha ish bajariladigan
ekranga olib boradi: raqamning o'zi hech narsani hal qilmaydi.

**`/api/reports/dashboard` tirildi.** U bor edi, ishlardi, sinovdan
o'tardi — lekin uni **hech kim chaqirmasdi**: eski bosh sahifa
o'chirilgan, `App.tsx:316` dagi izoh esa hali ham «bosh sahifadagi
raqamlar shundan keladi» deb turardi. Endi chaqiriladi va ustiga **qarz
yoshi** qo'shildi: umumiy summa qaror chiqarmaydi, «107 ta bemor 30 kundan
oshgan» esa qo'ng'iroq qilinadigan ro'yxat.

### Reference'dan yana nima olindi

**Xodimlar davomati ro'yxati + CSV** — Xodimlar moduliga uchinchi vkladka.
Karta ichidagi davomat bitta odam haqida; «bu oy kim qancha ishladi»
degan savolga javob berish uchun har kartani ochib chiqish kerak edi.

Foiz **belgilangan kunlardan** hisoblanadi, kalendar kunlaridan emas:
oyning o'rtasida ishga olingan odam aks holda 50% ko'rsatardi. Kechikkan
kun KELGAN deb sanaladi — odam ishga chiqqan; u alohida ustunda ko'rinadi.
Belgilanmagan xodimda foiz o'rniga «—» turadi, nol emas: nol «kelmagan»
degani, holbuki uni hech kim belgilamagan.

### Reference'dan ATAYLAB olinmagani

1. **ROI ko'rsatkichi.** Reference'da u −83.2% turibdi: tushum tanlangan
   davrniki, xarajat esa boshqa davrniki. Ikki xil oynadan olingan
   raqamlarning nisbati — ma'nosiz son. XClinic da foyda bo'lim kesimida
   va bitta davr ichida hisoblanadi (Moliya → Hisobot).

2. **Bosh sahifadagi tushum grafigi.** U Moliya → Hisobotda bor. Ikki
   joyda bitta raqam — «har narsaning bitta joyi» qoidasining buzilishi.
   Endpointga qo'shilgan olti oylik qator shu sababli **olib tashlandi**,
   o'lik kod qolmasin.

3. **«Hisobotlar tizimi» — beshta vkladkali markaz.** Reference'da bosh
   sahifada ham, hisobot markazida ham bir xil ko'rsatkichlar bor va ular
   MOS KELMAYDI: bosh sahifada «Faol o'quvchilar 268», hisobotda «Jami
   talabalar 9». Ikkinchisi boshqa qamrovni sanaydi. XClinic da hisobot
   bitta joyda qoladi.

**Kelgusi uchun** (hozir qilinmadi): reference'dagi **Jadval xaritasi** —
kabinet bandligi jadvali (xona × vaqt). Klinikada ma'nosi bor: kabinet
`Doctor.room` da, qabul uzunligi `Appointment.duration` da allaqachon bor.
Alohida ish sifatida qaralsin.

### Sinovlar

`hr` to'plami 53 dan **71** ga chiqdi: davomat yig'masi (7) va eganing
tasmasi (11). Yo'l-yo'lakay sinov haqiqiy xatoni topdi — `LabOrder` va
`DiagnosticStudy` da maydon `createdAt` emas, `orderedAt`; noto'g'ri nom
Prisma da tushunarsiz 500 berardi (BUILD-SPEC dagi 27 va 33-xatolar aynan
shu tur).
