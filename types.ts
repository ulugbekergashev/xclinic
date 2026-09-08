import type { PaymentMethod } from './utils/paymentMethods';

export type { PaymentMethod };

export enum UserRole {
  /* SUPER_ADMIN OLIB TASHLANDI: XClinic bitta o'rnatma = bitta klinika
     (SaaS emas), ya'ni klinikalar ustidan turadigan rol keraksiz meros edi.
     U hech qachon kira olmagan ham — env o'zgaruvchilari sozlanmagan. */
  CLINIC_ADMIN = 'CLINIC_ADMIN',
  DOCTOR = 'DOCTOR',
  RECEPTIONIST = 'RECEPTIONIST',
  LAB_TECHNICIAN = 'LAB_TECHNICIAN',
  /* Hamshira (qaror V17, reliz 4). Backend bu rolni login'da qaytaradi va
     dori berish/vitals unga bog'langan, lekin bu ro'yxatda rol yo'q edi —
     menyu shu ro'yxat bo'yicha filtrlanadi, shuning uchun hamshira kirsa
     hech qanday bo'lim ko'rmasdi. */
  NURSE = 'NURSE',
  /* SALES_AGENT HAM OLIB TASHLANDI. U ko'p klinikali obuna sotish
     konturidan qolgan rol edi: serverdagi kirish yo'li allaqachon
     yopilgan (`server.ts`, «SOTUVCHI AGENT KIRISHI OLIB TASHLANDI»),
     lekin enum da qolgani uchun kodda hali ham tirik tushuncha bo'lib
     ko'rinardi. */
}

export interface Doctor {
  id: string;
  firstName: string;
  lastName: string;
  specialty: string;
  phone: string;
  email?: string;
  /* `Deleted` — YUMSHOQ O'CHIRISH. Backend shifokorni bazadan
     olib tashlamaydi, holatini shunga o'zgartiradi va login/parolni
     tozalaydi (`backend/inpatient.ts`), chunki uning nomi eski
     tashriflar va cheklarda qolishi kerak.

     Bu qiymat turda e'lon qilinmagan edi, ya'ni o'chirilgan
     shifokorni chetlab o'tuvchi filtrlar («status !== 'Deleted'»)
     tur nuqtai nazaridan MA'NOSIZ ko'rinardi va typecheck ularni
     xato deb belgilardi. */
  status: 'Active' | 'On Leave' | 'Deleted';
  clinicId: string;
  username?: string;
  password?: string;
  percentage?: number; // Revenue share percentage
  salaryType?: 'none' | 'fixed' | 'fixed_kpi' | 'kpi'; // Maosh turi
  fixedSalary?: number; // Fix maosh summasi (salaryType 'fixed'/'fixed_kpi' uchun)
  secondaryPhone?: string;
  color?: string;
  startHour?: number | null;
  endHour?: number | null;
  /** Kabinet raqami — talonda va navbat tablosida. Migratsiya 0004 */
  room?: string | null;
  /* Bazada bor va Registraturada shifokorlarni bo'lim bo'yicha
     filtrlashda ISHLATILADI, lekin bu yerda e'lon qilinmagan edi. */
  departmentId?: string | null;
}

export interface Receptionist {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  username: string;
  password?: string;
  status: 'Active' | 'Inactive';
  clinicId: string;
}

export interface Patient {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  dob: string; // YYYY-MM-DD
  lastVisit: string;
  status: 'Active' | 'Archived';
  gender: 'Male' | 'Female';
  medicalHistory: string;
  address?: string;
  clinicId: string;
  telegramChatId?: string;
  secondaryPhone?: string;
  doctorId?: string;    // Assigned doctor
  doctorName?: string;  // Cached doctor name
  avatarUrl?: string;
  portraitUrl?: string;
  balance?: number;
  pinfl?: string;
  /** Registratura aytadigan raqam (UUID emas). Migratsiya 0003 */
  cardNumber?: string | null;
}

export interface Appointment {
  id: string;
  patientId: string;
  patientName: string;
  doctorId: string;
  doctorName: string;
  type: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  duration: number; // minutes
  status: 'Confirmed' | 'Pending' | 'Completed' | 'Cancelled' | 'No-Show' | 'Checked-In';
  reminderSent?: boolean;
  notes?: string;
  clinicId: string;
  review?: Review;
  /* Sxemada (`model Appointment`) bor va Registratura «Keldi» da uni
     ISHLATADI, lekin bu yerda e'lon qilinmagani uchun kod `any` bilan
     ishlashga majbur edi — ya'ni typecheck xatoni ushlamasdi. */
  departmentId?: string | null;
  /* Qaysi xizmatga yozilgan. `type` — o'sha paytdagi NOM (snimok), bu esa
     bog'lam: prayslistda nom o'zgarsa ham bemor kelganda xizmat topiladi.
     Migratsiya 0034. */
  serviceId?: number | null;
  /** Serverdan yozuv bemor bilan birga so'ralganda keladi */
  patient?: Patient;
}

export interface Transaction {
  id: string;
  patientName: string;
  date: string;
  amount: number;
  type: PaymentMethod;
  service: string;
  status: 'Paid' | 'Pending' | 'Overdue';
  clinicId: string;
  doctorId?: string;      // Optional - for backward compatibility
  doctorName?: string;    // Optional - for backward compatibility
  patientId?: string;     // Optional - for backward compatibility
  createdAt?: string | null; // to'lov qabul qilingan aniq vaqt (eski yozuvlarda yo'q)
  receivedById?: string | null;   // pulni kim qabul qildi (server yozadi)
  receivedByName?: string | null;
  discountPercent?: number; // Chegirma foizi (0-100)
  discountAmount?: number;  // Chegirma summasi
  /** Chek xizmat qatorlariga (`VisitCharge`) bog'langanmi. Bunday chekni
   *  tahrirlash yoki o'chirish qatorning to'lov holatini buzadi, shuning
   *  uchun server uni rad etadi (409) — kassa ekrani tugmalarni o'chiradi. */
  linkedToCharges?: boolean;
}

export type ExpenseCategory = 'DoctorShare' | 'Salary' | 'Rent' | 'Utilities' | 'Inventory' | 'Lab' | 'Other';

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  DoctorShare: 'Shifokor ulushi',
  Salary: 'Oylik',
  Rent: 'Ijara',
  Utilities: 'Kommunal',
  Inventory: 'Ombor',
  Lab: 'Laboratoriya',
  Other: 'Boshqa',
};

export interface Expense {
  id: string;
  date: string;
  amount: number;
  category: ExpenseCategory;
  title: string;
  method?: PaymentMethod | null;
  note?: string | null;
  clinicId: string;
  doctorId?: string | null;      // 'DoctorShare' va shifokorga 'Salary' uchun
  receptionistId?: string | null; // reception xodimiga 'Salary' uchun
  labOrderId?: string | null;    // avtomatik Laboratoriya xarajati bog'lami
  inventoryItemId?: string | null; // avtomatik Ombor xarajati bog'lami
  /* Qaysi bo'limga tegishli. NULL — umumiy xarajat. Bazada 0022 dan beri
     bor edi, turda esa yo'q edi: kassa uni `as Omit<Expense,'id'>` kasti
     bilan yuborardi va kast boshqa xatolarni ham yashirardi. */
  departmentId?: string | null;
  createdAt?: string;
}

/**
 * Kassa kunini yopish yozuvi. Kun bo'yicha bitta bo'ladi (qayta yopilsa yangilanadi).
 * Yopish kunni qulflamaydi — kechroq kelgan to'lov baribir yoziladi, faqat Kassa
 * sahifasida "yopilgandan keyin o'zgardi" belgisi chiqadi.
 */
export interface CashRegisterDay {
  id: string;
  clinicId: string;
  date: string;
  shift: number;           // bitta smenali klinikada har doim 1
  shiftStart?: string | null;
  shiftEnd?: string | null;
  openingCash: number;     // smena boshidagi naqd qoldiq
  countedCash: number;     // kassir sanagan naqd
  expectedCash: number;    // yopilgan daqiqadagi hisob bo'yicha naqd
  difference: number;      // countedCash − expectedCash
  countedCard?: number | null;   // terminal Z-hisoboti (kiritilmasa solishtirilmaydi)
  expectedCard?: number | null;
  countedClick?: number | null;  // Click/Payme kabineti
  expectedClick?: number | null;
  note?: string | null;
  /** false — smena ochilgan, lekin hali sanalmagan (migratsiya 0012).
   *  Eski yozuvlarda maydon yo'q — u holda yopilgan deb qaraladi. */
  isClosed?: boolean;
  openedAt?: string | null;
  openedByName?: string | null;
  openedByRole?: string | null;
  closedByName?: string | null;
  closedByRole?: string | null;
  closedAt: string;
}

/**
 * Kassaga xizmat to'lovidan tashqari kirgan/chiqqan pul.
 * Xarajat emas — inkassatsiya va qaytarish klinikaning xarajati emas,
 * shuning uchun sof foydadan ayirilmaydi.
 */
export type CashMovementType = 'Encashment' | 'Refund' | 'CashIn';

export const CASH_MOVEMENT_LABELS: Record<CashMovementType, string> = {
  Encashment: 'Inkassatsiya (kassadan olindi)',
  Refund: 'Bemorga qaytarildi',
  CashIn: 'Kassaga solindi',
};

export interface CashMovement {
  id: string;
  clinicId: string;
  date: string;
  type: CashMovementType;
  amount: number;
  method: PaymentMethod;
  note?: string | null;
  patientId?: string | null;
  transactionId?: string | null;
  createdByName?: string | null;
  createdAt: string;
}

/** Kassa yozuvlariga qilingan o'zgarishlar izi */
export interface CashAuditLog {
  id: string;
  clinicId: string;
  date: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  summary: string;
  afterClose: boolean;
  byName?: string | null;
  byRole?: string | null;
  createdAt: string;
}

// ─── Xabarlar (yagona xabarlar tizimi) ───
// 'both' — ikkalasiga ham yuboradi (SMS uchun alohida pul ketadi).
// 'telegram_first' — Telegram bo'lsa faqat Telegram, bo'lmasa/xato bo'lsa SMS.
export type MessageChannel = 'sms' | 'telegram' | 'both' | 'telegram_first';
// Trigger ro'yxati backendda (backend/triggers.ts) va oddiy String ustunda
// saqlanadi — yangi trigger qo'shish uchun migratsiya kerak emas.
export type AutomationTrigger = string;

/** Backend qaytaradigan trigger tavsifi — forma shu asosda quriladi */
export interface TriggerDescriptor {
  id: string;
  label: string;
  respectCooldown: boolean;
  supportsDoctorFilter: boolean;
  /* Backend (`backend/triggers.ts`) bu ikki maydonni ham yuboradi va
     ular Xabarlar bo'limida ISHLATILADI — segment tanlash va jadval
     bo'yicha yuborish shu bayroqlarga qarab ko'rsatiladi. E'londa
     yo'q edi. */
  supportsSegment?: boolean;
  supportsSchedule?: boolean;
  /** Tinch soatlar — trigger faqat shu oraliqda yuboradi (Toshkent vaqti) */
  sendWindow?: { fromHour: number; toHour: number };
  offset?: {
    label: string;
    unit: 'hour' | 'day' | 'month';
    options: number[];
    default: number;
  };
}

export interface MessageTemplate {
  id: string;
  clinicId: string;
  name: string;
  text: string;
  eskizTemplateId?: number | null;
  eskizStatus?: string | null; // Eskiz moderatsiya holati: moderation/confirmed/declined/error/not_found
  eskizSubmittedAt?: string | null;
  createdAt?: string;
}

export interface AutomationRule {
  id: string;
  clinicId: string;
  name: string;
  templateId: string;
  trigger: AutomationTrigger;
  hoursBefore?: number | null;
  channel: MessageChannel;
  doctorId?: string | null;
  active: boolean;
  createdAt?: string;
  /**
   * Segment va jadval — API'da qoidaning oddiy maydonlari, lekin bazada
   * yon jadvalda saqlanadi (backend/ruleExtras.ts). Sabab: AutomationRule ga
   * ustun qo'shish migratsiya talab qiladi, deploy'da esa u yo'q.
   */
  segment?: AudienceSegment | null;
  schedule?: RuleSchedule | null;
}

export interface MessageLog {
  id: string;
  clinicId: string;
  patientId?: string | null;
  type: string;
  // 'Retried' — xato yozuv qayta yuborishga jo'natilgan, natijasi alohida logda
  // 'Skipped' — chastota chegarasi sababli ataylab yuborilmagan (xato emas)
  status: 'Sent' | 'Failed' | 'Retried' | 'Skipped';
  message?: string | null;
  error?: string | null;
  sentAt: string;
  channel: 'sms' | 'telegram';
  source: string; // 'manual' | 'auto' | 'bulk' | 'debt' | 'birthday' | 'noshow' | 'retry'
  ruleId?: string | null;
  refId?: string | null;
  recipient?: string | null;
  patient?: { id: string; firstName: string; lastName: string; phone?: string } | null;
}

/**
 * Bitta filtr sharti — yo maydon sharti, yo ichma-ich guruh.
 * Guruhda `conditions` bo'ladi; oddiy shartda `field`.
 * Shu tufayli eski tekis format ham o'qiladi (guruh — shunchaki ichki segment).
 */
export interface SegmentCondition {
  // Maydon sharti
  field?: string;
  op?: string;
  value?: any;
  // Guruh (qavs): "ayol VA (VIP YOKI implant)"
  match?: 'all' | 'any';
  conditions?: SegmentCondition[];
}

/**
 * Auditoriya segmenti — "kimga yuborish". Shartlar ro'yxati; qaysi maydonlar
 * mavjudligini backend/segmentFields.ts reyestri hal qiladi.
 * Eski maydonli format ham qabul qilinadi (saqlangan qoidalar uchun) va
 * server o'qishda avtomatik shartlarga aylantiradi.
 */
export interface AudienceSegment {
  match?: 'all' | 'any';
  conditions?: SegmentCondition[];

  // Eski format — faqat moslik uchun, yangi kodda ishlatilmaydi
  doctorId?: string | null;
  status?: 'Active' | 'All';
  inactiveMonths?: number | null;
  includeNeverVisited?: boolean;
  debtors?: boolean;
  birthdayToday?: boolean;
  birthdayMonth?: boolean;
}

/** Segment qurish uchun mavjud maydon (backenddan keladi) */
export interface SegmentFieldDescriptor {
  id: string;
  label: string;
  /* `enum_months` backendda BOR (`backend/segmentFields.ts`) va u
     yerda ishlatiladi («muolaja + necha oy o'tgan»). Bu yerda tushib
     qolgani uchun interfeysdagi mos shox o'lik kod deb baholanardi. */
  type: 'enum' | 'bool' | 'number' | 'months_ago' | 'days_ago' | 'text' | 'month_of_year' | 'enum_months';
  group: string;
  operators: { id: string; label: string; arity: 0 | 1 | 2 }[];
  options?: { value: string; label: string }[];
  unit?: string;
  defaultOp: string;
  defaultValue?: any;
}

/** Jadval bo'yicha yuborish qoidasi */
export interface RuleSchedule {
  kind: 'daily' | 'weekly' | 'monthly';
  /** 1=Dushanba ... 7=Yakshanba */
  weekday?: number;
  /** 1-28 */
  dayOfMonth?: number;
  /** Toshkent vaqti bo'yicha soat */
  hour: number;
}

/** Serverdan kelgan auditoriya hisobi */
export interface AudiencePreview {
  /** Xabar yetib boradigan bemorlar soni */
  total: number;
  /** Filtrga mos kelgan bemorlar (yetib bormaydiganlari bilan birga) */
  matched: number;
  unreachable: number;
  /** Kimga yetib bormaydi va nima uchun — klinika tuzata olishi uchun */
  unreachableList: { id: string; name: string; reason: string }[];
  /** Klinikadagi jami bemorlar (filtrlarsiz) */
  clinicTotal: number;
  /** Har bir shart YAKKA o'zi nechtaga mos — shart yonida ko'rsatiladi */
  conditionCounts: number[];
  conditions: SegmentCondition[];
  viaTelegram: number;
  viaSms: number;
  description: string;
  patientIds: string[];
  /** To'liq ro'yxat — kimga ketishini ko'rib chiqish uchun (500 tagacha) */
  recipients: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string;
    channel: 'sms' | 'telegram';
    debt: number;
  }[];
  recipientsTruncated: boolean;
  sample: { id: string; firstName: string; lastName: string; debt: number }[];
}

/** Saqlangan segment — bir marta yig'ilib, qayta ishlatiladi */
export interface SavedSegment {
  id: string;
  name: string;
  segment: AudienceSegment;
  createdAt: string;
}

// Fonda ketayotgan qo'lda (bulk) yuborish holati
export interface BulkSendStatus {
  active: boolean;
  total?: number;
  sent?: number;
  failed?: number;
  done?: boolean;
  startedAt?: number;
  error?: string;
}

export interface InstallmentPlan {
  id: string;
  patientId: string;
  clinicId: string;
  doctorId?: string;
  service: string;
  totalAmount: number;
  totalPaid: number;
  startDate: string;
  endDate: string;
  status: 'Active' | 'Completed' | 'Cancelled';
  createdAt?: string;
  items?: InstallmentItem[];

  /* Reja qaysi qatorlar ustiga qurilgan (0033). Qoldiq AYNAN shulardan
     hisoblanadi: bemor kassada to'g'ridan-to'g'ri to'lagan bo'lishi
     mumkin va u holda `totalPaid` ortda qoladi. */
  charges?: { id: string; name: string; total: number; paidAmount: number; status: string }[];
  /** Serverdagi hisob: qatorlarning qolgan qarzi */
  due?: number;
  /** Serverdagi hisob: qatorlar bo'yicha yig'ilgan summa */
  collected?: number;

  patient?: Patient;
  doctor?: Doctor;
}

export interface InstallmentItem {
  id: string;
  planId: string;
  expectedDate: string;
  amount: number;
  status: 'Pending' | 'Paid';
  paidDate?: string;
  transactionId?: string;
}

export interface Service {
  id?: number; // Optional because it might be auto-generated or missing in some contexts
  name: string;
  price: number;
  /* `cost` — MEROS ustun. U formadan qo'lda kiritilardi va HECH QAYERDA
     o'qilmasdi: hisobotdagi tannarx `ServiceRecipe` dan hisoblanadi
     (`backend/reports.ts`). Forma maydoni olib tashlandi; ustunni
     sxemadan olib tashlash SQLite da jadvalni qayta yozishni talab
     qiladi, shuning uchun u bo'sh turadi. */
  cost?: number;
  /** Kalendardagi slot uzunligi. Ilgari forma har doim 60 yozardi. */
  duration?: number;

  clinicId: string;
  categoryId?: string;
  category?: ServiceCategory;
  /* Bazada (`schema.prisma`, `model Service`) bu ustun bor va u
     Registratura, Qabul va «Xizmat qo'shish» oynasida ISHLATILADI —
     lekin bu yerda e'lon qilinmagan edi. Typecheck buni ko'rmasdi,
     chunki `@types/react` o'rnatilmagani uchun komponent proplari
     `any` bo'lib qolardi. */
  departmentId?: string | null;
}

export interface ServiceCategory {
  id: string;
  name: string;
  clinicId: string;
}


export interface NavItem {
  id: string;
  label: string;
  icon: any;
  roles: UserRole[];
}

// --- Super Admin Types ---

export interface SubscriptionPlan {
  id: string;
  name: string;
  price: number;
  maxDoctors: number;
  features: string[];
}

export interface Clinic {
  /* BOSMA BLANK REKVIZITLARI (migratsiya 0013). Chop etiladigan
     hujjatlarda ishlatiladi (`utils/printDocument.ts`): litsenziya raqami
     sarlavhada, izoh varaq pastida. Ilgari ularni kiritadigan joy yo'q
     edi — har bosma varaqda litsenziya bo'sh qolardi. */
  licenseNumber?: string | null;
  letterheadNote?: string | null;
  id: string;
  name: string;
  adminName: string;
  username: string;
  password?: string; // Only for display upon creation
  phone: string;
  address?: string; // New field
  email?: string; // New field
  ownerPhone?: string; // Dedicated phone for clinic owner to receive reports
  status: 'Active' | 'Blocked' | 'Pending';
  planId: string;
  subscriptionStartDate: string; // Added field
  expiryDate: string;
  monthlyRevenue: number; // For SaaS analytics
  botToken?: string; // Telegram bot token
  customPrice?: number; // Optional custom pricing for special offers
  subscriptionType: 'Paid' | 'Trial';
  startHour?: number;
  endHour?: number;
  enableReceipts?: boolean;
  notificationMode?: 'telegram_only' | 'sms_only' | 'both';
  /* Bazada bor (`model Clinic`, `telegramChatId`) va Sozlamalarda
     ishlatiladi, lekin e'lon qilinmagan edi. */
  telegramChatId?: string | null;
  eskizEmail?: string;
  hasPassword?: boolean;
  isConnected?: boolean;
  eskizTokenExpiry?: string;
  dmedEnabled?: boolean;
  dmedApiKey?: string;
  dmedApiSecret?: string;
  dmedClinicId?: string;
  dmedToken?: string;
  dmedTokenExpiry?: string;
  prepaymentEnabled?: boolean;
  prepaymentCardNumber?: string;
  prepaymentAmount?: number;
  salesAgentId?: string | null; // Biriktirilgan sotuvchi (reseller)
  accessControl?: string | AccessControl | null; // DB'da JSON string, frontendda parse qilinadi
  cashShiftsPerDay?: number; // kuniga nechta kassa smenasi (1 yoki 2)
  leadApiKey?: string | null;        // tashqi lid manbalari uchun kalit
  leadApiKeyCreatedAt?: string | null;
}

// Rol bo'yicha modul/ma'lumot ko'rish huquqlari (Sozlamalar → Ruxsatlar).
// Maydon yo'q bo'lsa — hozirgi (hammasi ochiq) xatti-harakat saqlanadi.
export interface RoleAccess {
  hiddenModules?: string[];   // yashirilgan modul id lari (nav id: 'finance', 'leads', ...)
  showFinance?: boolean;      // pul ko'rsatkichlari (dashboard KPI, tushum grafigi); default true
  showPatientPhone?: boolean; // bemor telefon raqamlari; default true
}

export interface AccessControl {
  doctor?: RoleAccess;
  receptionist?: RoleAccess;
  /* Laborant va hamshira ham cheklanadi. Ilgari ular ro'yxatda YO'Q edi:
     ruxsatlar ekrani ularni umuman ko'rsatmasdi va «hammasi ochiq»
     bo'lib qolardi. */
  labTechnician?: RoleAccess;
  nurse?: RoleAccess;
}

export interface ICD10Code {
  code: string;
  name: string;
  description?: string;
}

export interface PatientDiagnosis {
  id: string;
  patientId: string;
  code: string;
  icd10?: ICD10Code;
  date: string;
  notes?: string;
  status: 'Active' | 'Resolved' | 'Chronic';
  clinicId: string;
  /** Qaysi qabulda qo'yilgani — kartadagi «bu tashrifda nima topildi» */
  visitId?: string | null;
  /* Sxemada (`PatientDiagnosis.isChronic`) bor va server uni qabul
     qiladi, lekin bu yerda e'lon qilinmagani uchun front `as any` bilan
     ishlatishga majbur edi — ya'ni typecheck xatoni ushlamasdi. */
  isChronic?: boolean;
}

export interface PatientPhoto {
  id: string;
  patientId: string;
  url: string;
  description?: string;
  category: string;
  date: string;
  createdAt: string;
}

export interface InventoryItem {
  id: string;
  name: string;
  unit: string;
  quantity: number;
  minQuantity: number;
  clinicId: string;
  createdAt: string;
  updatedAt: string;
  // Quyidagilar bazada allaqachon bor edi (schema.prisma, InventoryItem), lekin
  // bu turda yo'q edi — shuning uchun frontend ularni "ko'rmasdi". Ixtiyoriy
  // qilib qo'shildi: eski kod buzilmaydi.
  /** Tannarx. Xizmat retsepti (ServiceRecipe) tannarxni shu narxdan hisoblaydi */
  price?: number;
  /** Dori — partiya va yaroqlilik muddati nazorat qilinadi */
  isMedication?: boolean;
  /** Muddati O'TGAN partiyalardagi qoldiq (S2.5). Serverda sanaladi.
   *  «Qoldiqlar» ro'yxatida belgi ko'rsatish uchun: ilgari muddat faqat
   *  «Partiya va muddat» tabida ko'rinardi (audit B-25). */
  expiredQuantity?: number;
  /** Eng yaqin YARAMLI partiyaning muddati, `YYYY-MM-DD`. */
  nextExpiry?: string | null;
  /** Xizmat ko'rsatilganda retsept bo'yicha avtomatik hisobdan chiqadi */
  isConsumable?: boolean;
  form?: string | null;
  activeIngredient?: string | null;
  departmentId?: string | null;
}

/**
 * Ombor sarfi qatori.
 *
 * 0028 dan keyin manba — `StockMovement`, eski `InventoryLog` jadvali emas.
 * Shakl ataylab saqlab qolindi (`change`, `date`), lekin `id` endi HARAKAT
 * identifikatori: uni `api.stock.reverse()` ga berish mumkin.
 */
export interface InventoryLog {
  id: string;
  itemId: string;
  change: number;
  type: 'IN' | 'OUT';
  note?: string;
  date: string;
  userName: string;
  patientId?: string;
  patientName?: string;
  /** Chiqim bekor qilingan — teskari harakat yozilgan */
  reversed?: boolean;
  item?: { name: string; unit: string };
}

export interface SMSCampaign {
  id: string;
  name: string;
  message: string;
  audience: 'all' | 'male' | 'female' | 'debtors';
  sentCount: number;
  status: 'Draft' | 'Sent' | 'Failed';
  date: string;
  clinicId: string;
}

// Workflow System Types
export interface Visit {
  id: string;
  patientId: string;
  appointmentId?: string; // Optional link to appointment
  date: string; // YYYY-MM-DD
  checkInTime: string; // ISO DateTime
  checkOutTime?: string; // ISO DateTime
  /** To'liq zanjir: registratura ochadi -> chaqiriladi -> qabulda ->
   *  tahlilga ketsa AwaitingResults -> qaytib yakunlanadi */
  status: 'Waiting' | 'Called' | 'In Progress' | 'AwaitingResults' | 'Completed' | 'Cancelled';
  complaints?: string; // Chief complaint
  vitalSigns?: string; // JSON string
  notes?: string; // General visit notes
  clinicId: string;
  departmentId?: string;
  doctorId?: string;
  doctorName?: string;
  templateId?: string;
  /** Kunlik navbat raqami — registratura beradi */
  queueNumber?: number | null;
  calledAt?: string | null;
  /** Natija kutila boshlangan vaqt */
  awaitingSince?: string | null;
  /** Bo'lim shabloni bo'yicha to'ldirilgan ko'rik maydonlari (JSON matn) */
  examData?: string;
  diagnosis?: string;
  treatmentPlan?: string;

  // Serverdan to'liq qabul so'ralganda birga keladi
  patient?: Patient;
  department?: Department;
  template?: EncounterTemplate;
  diagnoses?: PatientDiagnosis[];
  procedures?: TreatmentProcedure[];
  transactions?: Transaction[];
  labOrders?: LabOrder[];
  studies?: DiagnosticStudy[];
  prescriptions?: Prescription[];
}

export interface TreatmentProcedure {
  id: string;
  visitId: string;
  procedureName: string;
  serviceId?: number;
  departmentId?: string;
  status: 'Planned' | 'In Progress' | 'Completed' | 'Cancelled';
  basePrice: number;
  discount: number;
  finalPrice: number;
  materialsUsed?: string; // JSON array of materials
  notes?: string;
  duration?: number; // in minutes
  doctorId: string;
  doctorName: string;
  createdAt: string; // ISO DateTime
  completedAt?: string; // ISO DateTime
}

export interface Review {
  id: string;
  appointmentId: string;
  rating: number;
  comment?: string;
  createdAt: string;
  appointment?: Appointment;
}

export interface Lead {
  id: string;
  name: string;
  phone: string;
  service?: string;
  source?: string;
  notes?: string;
  address?: string;        // tashqi manbadan kelsa, bemorga aylantirishda ko'chiriladi
  dob?: string;            // tug'ilgan sana (kelgan bo'lsa)
  raw?: string;            // tashqi payload'ning asl nusxasi (JSON matn)
  status: 'New' | 'Contacted' | 'Thinking' | 'Booked' | 'Cancelled';
  createdAt: string;
  updatedAt: string;
  clinicId: string;
}

// Tashqi lid manbalari (yuboraman.uz va h.k.) uchun integratsiya ma'lumotlari.
export interface LeadApiKeyInfo {
  apiKey: string | null;
  createdAt: string | null;
  endpoint: string;
}

export interface SalesAgent {
  id: string;
  name: string;
  username: string;
  password?: string;
  phone: string;
  status: 'Active' | 'Blocked';
  clinicCount?: number;
  createdAt: string;
}

export interface LabTechnician {
  id: string;
  firstName: string;
  lastName: string;
  specialty: string;
  phone: string;
  status: 'Active' | 'Inactive' | 'Deleted';
  clinicId: string;
  username?: string;
  password?: string;
}

export type LabOrderStatus = 'Ordered' | 'Collected' | 'InProgress' | 'Completed' | 'Cancelled';

/** Tahlil yo'llanmasi */
export interface LabOrder {
  id: string;
  clinicId: string;
  patientId?: string;
  patientName: string;
  visitId?: string;
  doctorId?: string;
  doctorName: string;
  technicianId?: string;
  technicianName?: string;
  status: LabOrderStatus;
  priority: 'Normal' | 'Urgent';
  orderedAt: string;
  sampleCollectedAt?: string;
  completedAt?: string;
  deadline?: string;
  totalPrice: number;
  clinicianNotes?: string;
  technicianNotes?: string;
  items?: LabOrderItem[];
  /** Shifokor natijani ochib ko'rgan payt. null — hali ko'rilmagan
   *  (navbatdagi "Natija tayyor" belgisi shunga qaraydi). Migratsiya 0009. */
  seenByDoctorAt?: string | null;
}

export interface LabOrderItem {
  id: string;
  orderId: string;
  testId: string;
  testName: string;
  price: number;
  status: 'Pending' | 'Completed';
  /** Natija ekranida bemorga moslangan normalar bilan keladi */
  parameters?: LabResultRow[];
}

export type LabFlag = 'Normal' | 'High' | 'Low';

/** Natija qatori — ko'rsatkich + bemorga mos norma + kiritilgan qiymat */
export interface LabResultRow {
  parameterId: string;
  name: string;
  unit?: string | null;
  refLow?: number | null;
  refHigh?: number | null;
  refText?: string | null;
  value: string;
  valueNum?: number | null;
  flag?: LabFlag | null;
  note?: string | null;
}

/** Tahlil katalogi */
export interface LabTest {
  id: string;
  clinicId: string;
  departmentId?: string | null;
  name: string;
  code: string;
  sampleType: string;
  price: number;
  cost: number;
  turnaroundHours: number;
  isActive: boolean;
  sortOrder: number;
  parameters?: LabTestParameter[];
}

export interface LabTestParameter {
  id: string;
  testId: string;
  name: string;
  unit?: string | null;
  refLow?: number | null;
  refHigh?: number | null;
  refText?: string | null;
  /** null = hammaga; aks holda shu jinsdagi bemorga */
  sex?: 'Male' | 'Female' | null;
  ageMin?: number | null;
  ageMax?: number | null;
  sortOrder: number;
}


// ═══════════════════════════════════════════════════════════════════════════
//  KO'P PROFILLI KLINIKA
// ═══════════════════════════════════════════════════════════════════════════

export type DepartmentType = 'CLINICAL' | 'LAB' | 'DIAGNOSTIC' | 'INPATIENT' | 'PHARMACY';

export const DEPARTMENT_TYPE_LABELS: Record<DepartmentType, string> = {
  CLINICAL: 'Klinik qabul',
  LAB: 'Laboratoriya',
  DIAGNOSTIC: 'Diagnostika',
  INPATIENT: 'Statsionar',
  PHARMACY: 'Dorixona',
};

/** Bo'lim — ko'p profilli klinikaning asosiy o'lchovi */
export interface Department {
  id: string;
  clinicId: string;
  name: string;
  code: string;
  type: DepartmentType;
  color?: string | null;
  sortOrder: number;
  isActive: boolean;
}

export type EncounterFieldType = 'text' | 'textarea' | 'number' | 'select' | 'checkbox';

/** Qabul bayoni shablonidagi bitta maydon */
export interface EncounterField {
  key: string;
  label: string;
  type: EncounterFieldType;
  unit?: string;
  options?: string[];
  group?: string;
}

/** Bo'limga tegishli qabul bayoni shabloni (tish kartasi o'rniga) */
export interface EncounterTemplate {
  id: string;
  clinicId: string;
  departmentId: string;
  /** Kimga mos: 'Male' | 'Female' | null (hammaga). Migratsiya 0031.
   *  Erkak bemorda ginekologiya shabloni ochilib qolgan edi (audit B-09). */
  gender?: 'Male' | 'Female' | null;
  /** Yosh chegarasi, to'liq yil. null — chegara yo'q. */
  minAge?: number | null;
  maxAge?: number | null;
  name: string;
  fields: EncounterField[];
  isDefault: boolean;
}

// ─── Diagnostika ───────────────────────────────────────────────────────────

export type Modality = 'UZI' | 'EKG' | 'RENTGEN' | 'ENDOSKOPIYA' | 'MRT' | 'KT';

export const MODALITY_LABELS: Record<Modality, string> = {
  UZI: 'UZI',
  EKG: 'EKG',
  RENTGEN: 'Rentgen',
  ENDOSKOPIYA: 'Endoskopiya',
  MRT: 'MRT',
  KT: 'KT',
};

export interface DiagnosticStudy {
  id: string;
  clinicId: string;
  patientId: string;
  patientName: string;
  visitId?: string | null;
  departmentId?: string | null;
  serviceId?: number | null;
  modality: Modality;
  name: string;
  status: 'Ordered' | 'InProgress' | 'Completed' | 'Cancelled';
  orderedById?: string | null;
  orderedByName?: string | null;
  performedById?: string | null;
  performedByName?: string | null;
  orderedAt: string;
  performedAt?: string | null;
  findings?: string | null;
  conclusion?: string | null;
  price: number;
  files?: DiagnosticFile[];
  /** Shifokor natijani ochib ko'rgan payt. Migratsiya 0009. */
  seenByDoctorAt?: string | null;
  /* TO'LOV HOLATI — serverdan, hisob qatoridan hisoblanadi
     (`billing.ts`, `payStateBySource`). Bazada bunday maydon YO'Q va
     bo'lmasligi ham kerak: pul holati bitta joyda — qatorda.
     `null` — qator topilmadi (eski yozuv), holat noma'lum. */
  paid?: boolean | null;
  due?: number | null;
}

export interface DiagnosticFile {
  id: string;
  studyId: string;
  url: string;
  kind: string;
  caption?: string | null;
}

// ─── Statsionar ────────────────────────────────────────────────────────────

export interface Ward {
  id: string;
  clinicId: string;
  departmentId?: string | null;
  name: string;
  floor?: string | null;
  kind: string;
  dailyRate: number;
  isActive: boolean;
  beds?: Bed[];
}

export interface Bed {
  id: string;
  wardId: string;
  label: string;
  status: 'Free' | 'Occupied' | 'Cleaning' | 'Blocked';
  admissions?: { id: string; patientId: string; patientName: string; admittedAt: string }[];
  ward?: Ward;
}

export interface Admission {
  id: string;
  clinicId: string;
  patientId: string;
  patientName: string;
  departmentId?: string | null;
  doctorId?: string | null;
  doctorName?: string | null;
  bedId?: string | null;
  admittedAt: string;
  dischargedAt?: string | null;
  status: 'Active' | 'Discharged';
  reason?: string | null;
  diagnosis?: string | null;
  dischargeSummary?: string | null;
  dailyRate: number;
  totalCharges: number;
  bed?: Bed;
  rounds?: InpatientRound[];
  medicationOrders?: MedicationOrder[];
}

export interface InpatientRound {
  id: string;
  admissionId: string;
  date: string;
  doctorId?: string | null;
  doctorName?: string | null;
  vitalSigns?: string | null;
  notes?: string | null;
  plan?: string | null;
}

export interface MedicationOrder {
  id: string;
  admissionId: string;
  medicationId?: string | null;
  name: string;
  dosage?: string | null;
  route?: string | null;
  frequency?: string | null;
  startDate: string;
  endDate?: string | null;
  status: string;
}

// ─── Dorixona ──────────────────────────────────────────────────────────────

export interface Prescription {
  id: string;
  clinicId: string;
  patientId: string;
  patientName: string;
  visitId?: string | null;
  doctorId?: string | null;
  doctorName?: string | null;
  date: string;
  status: string;
  notes?: string | null;
  /* Yaratishda qatorda hali `id` va `prescriptionId` bo'lmaydi —
     ularni server beradi. Shuning uchun qisman element ham qabul
     qilinadi. */
  items?: (PrescriptionItem | Partial<PrescriptionItem>)[];
}

export interface PrescriptionItem {
  id: string;
  prescriptionId: string;
  medicationId?: string | null;
  name: string;
  dosage?: string | null;
  frequency?: string | null;
  durationDays?: number | null;
  instructions?: string | null;
}

export interface InventoryBatch {
  id: string;
  itemId: string;
  batchNumber?: string | null;
  expiryDate?: string | null;
  quantity: number;
  cost: number;
  receivedAt: string;
  /** /api/inventory-expiring javobida keladi */
  item?: InventoryItem;
  expired?: boolean;
}


// ─── Pul: hisob qatori ─────────────────────────────────────────────────────

export type ChargeSource = 'Service' | 'Lab' | 'Study' | 'Medication' | 'Bed' | 'Other';
export type ChargeStatus = 'Unpaid' | 'Paid' | 'Cancelled';

/** Hisob qatori — qo'ldagi qog'ozning o'rni. To'langanlik shu yerda, qabulda emas. */
export interface VisitCharge {
  id: string;
  clinicId: string;
  visitId?: string | null;
  patientId?: string | null;
  patientName: string;
  source: ChargeSource;
  sourceId?: string | null;
  name: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  total: number;
  status: ChargeStatus;
  /** Qisman to'lov qo'llab-quvvatlanadi */
  paidAmount: number;
  paidAt?: string | null;
  transactionId?: string | null;
  createdAt: string;
  createdByName?: string | null;
  /* Sxemada (`model VisitCharge`) bor va shifokor ulushi aynan shu
     ustunlardan hisoblanadi (migratsiya 0007), lekin bu yerda e'lon
     qilinmagan edi. */
  doctorId?: string | null;
  doctorName?: string | null;
  admissionId?: string | null;
  /** Qator bo'lib to'lash rejasiga kiritilgan. Migratsiya 0033. */
  installmentPlanId?: string | null;
  visit?: { id: string; date: string; queueNumber?: number | null; departmentId?: string | null };
}

export interface ChargeSummary {
  total: number;
  paid: number;
  due: number;
  unpaidCount: number;
}

/** Kassa ekranidagi bemor bo'yicha guruh */
export interface PendingPatient {
  patientId?: string | null;
  patientName: string;
  due: number;
  items: VisitCharge[];
}


// ─── Ombor harakatlari va xizmat retsepti ──────────────────────────────────

export interface StockMovement {
  id: string;
  clinicId: string;
  itemId: string;
  batchId?: string | null;
  type: 'In' | 'Out' | 'Adjust' | 'Writeoff';
  /** Musbat — kirim, manfiy — chiqim */
  quantity: number;
  reason: string;
  visitId?: string | null;
  serviceId?: number | null;
  note?: string | null;
  userName?: string | null;
  createdAt: string;
  item?: { name: string; unit: string };
  batch?: { batchNumber?: string | null; expiryDate?: string | null };
}

/** Xizmat retsepti qatori — bitta xizmatga qancha material */
export interface ServiceRecipeLine {
  id: string;
  serviceId: number;
  itemId: string;
  quantity: number;
  note?: string | null;
  item?: { id: string; name: string; unit: string; price: number };
}

export interface ServiceCost {
  serviceId: number;
  price: number;
  cost: number;
  margin: number;
  marginPercent: number;
  lines: number;
}

export interface InventoryAlerts {
  expiring: (InventoryBatch & { expired?: boolean })[];
  lowStock: { id: string; name: string; unit: string; quantity: number; minQuantity: number }[];
}

/* Avtomatik zaxira nusxa sozlamasi. Bazada emas, `%APPDATA%\xclinic\
   backup-config.json` da saqlanadi: bu o'rnatmaning sozlamasi, klinikaniki
   emas, va migratsiya talab qilmaydi. */
export interface BackupConfig {
  enabled: boolean;
  /** Toshkent bo'yicha soat (0-23) va daqiqa (0-59) */
  hour: number;
  minute: number;
  /** Oxirgi N kunning nusxalari — hammasi saqlanadi */
  keepDaily: number;
  /** Undan oldingi N oy — har oydan eng yangisi */
  keepMonthly: number;
  /** Ikkinchi manzil: flesh yoki tarmoq diski */
  extraDir: string | null;
}
