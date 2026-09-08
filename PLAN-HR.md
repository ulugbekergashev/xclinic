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
