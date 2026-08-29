/* ─────────────────────────────────────────────────────────────────────────────
   MKB-10 SPRAVOCHNIGI — ambulator amaliyotda uchraydigan tashxislar (S2.2).

   MUAMMO. Qidiruv endpointi (`/api/icd10`), indeks va interfeys joyida edi,
   lekin `ICD10Code` jadvalida BOR-YO'G'I 1 TA QATOR bor edi. Ya'ni bu kod
   bugi emas, ma'lumot bugi: qidiruv to'g'ri ishlab, har doim bo'sh natija
   qaytarardi. Shuning uchun qabulga tashxis umuman kiritib bo'lmasdi —
   auditda B-02 «Kritik» deb belgilangan.

   NIMA UCHUN BU YERDA, MIGRATSIYADA EMAS. Migratsiya SQL — yetkazish
   mexanizmi, tahrirlash mexanizmi emas (`migrations/README.md`, 3-qoida:
   chiqarilgan fayl tahrirlanmaydi). Ro'yxat esa o'sib boradi. Shuning uchun
   MANBA shu yerda, SQL esa undan generatsiya qilinadi:

       cd backend && npx tsx scripts/genIcd10Migration.ts

   Yangi kod qo'shilsa — shu faylga yoziladi va YANGI migratsiya
   generatsiya qilinadi (0030 chiqarilgan, unga tegilmaydi).

   QAMROV. Bu to'liq MKB-10 emas — unda 14 mingdan ortiq kod bor va
   ularning katta qismi statsionar va statistika uchun. Bu yerda ko'p
   profilli AMBULATOR klinikada haqiqatan yoziladigan tashxislar:
   terapiya, kardiologiya, ginekologiya, pediatriya, xirurgiya,
   nevrologiya, LOR, teri, endokrinologiya, urologiya, oftalmologiya va
   profilaktik ko'riklar.

   TIL. Har kodda o'zbekcha va ruscha nom bor. Qidiruv ikkalasi bo'yicha
   ham ishlaydi: shifokor «gipert» yozsa ham, «гиперт» yozsa ham topadi.
   ───────────────────────────────────────────────────────────────────────── */

export interface Icd10Row {
    code: string;
    /** O'zbekcha nom — interfeysning asosiy tili */
    uz: string;
    /** Ruscha nom — qidiruv va RU rejim uchun */
    ru: string;
    /** Bo'lim (MKB-10 sinfi) — ro'yxatni guruhlash uchun */
    cat: string;
}

const INFEKSIYA = 'Yuqumli kasalliklar';
const OSMA = "O'smalar";
const QON = 'Qon kasalliklari';
const ENDOKRIN = 'Endokrinologiya';
const RUHIY = 'Ruhiy salomatlik';
const NERV = 'Nevrologiya';
const KOZ = 'Oftalmologiya';
const QULOQ = 'LOR';
const YURAK = 'Kardiologiya';
const NAFAS = 'Pulmonologiya';
const HAZM = 'Gastroenterologiya';
const TERI = 'Dermatologiya';
const SUYAK = 'Travmatologiya va ortopediya';
const SIYDIK = 'Urologiya va nefrologiya';
const AYOL = 'Ginekologiya';
const HOMILA = 'Homiladorlik va tug‘ruq';
const BOLA = 'Pediatriya';
const ALOMAT = 'Alomatlar va noaniq holatlar';
const JAROHAT = 'Jarohatlar va zaharlanishlar';
const PROFILAKTIKA = 'Profilaktika va ko‘riklar';

export const ICD10_ROWS: Icd10Row[] = [

    /* ─── A00–B99 · Yuqumli va parazitar kasalliklar ─────────────────────── */
    { code: 'A02.0', uz: 'Salmonellyoz enteriti', ru: 'Сальмонеллёзный энтерит', cat: INFEKSIYA },
    { code: 'A04.9', uz: 'Bakterial ichak infeksiyasi, aniqlanmagan', ru: 'Бактериальная кишечная инфекция неуточнённая', cat: INFEKSIYA },
    { code: 'A08.4', uz: 'Virusli ichak infeksiyasi, aniqlanmagan', ru: 'Вирусная кишечная инфекция неуточнённая', cat: INFEKSIYA },
    { code: 'A09', uz: 'Yuqumli deb taxmin qilingan diareya va gastroenterit', ru: 'Диарея и гастроэнтерит предположительно инфекционного происхождения', cat: INFEKSIYA },
    { code: 'A15.0', uz: 'O‘pka sili, bakteriologik tasdiqlangan', ru: 'Туберкулёз лёгких, подтверждённый бактериологически', cat: INFEKSIYA },
    { code: 'A16.2', uz: 'O‘pka sili, tasdiqlanmagan', ru: 'Туберкулёз лёгких без бактериологического подтверждения', cat: INFEKSIYA },
    { code: 'A46', uz: 'Roja (qizil shamol)', ru: 'Рожа', cat: INFEKSIYA },
    { code: 'A49.9', uz: 'Bakterial infeksiya, aniqlanmagan', ru: 'Бактериальная инфекция неуточнённая', cat: INFEKSIYA },
    { code: 'B00.1', uz: 'Gerpetik lab va yuz toshmasi', ru: 'Герпетический везикулярный дерматит', cat: INFEKSIYA },
    { code: 'B01.9', uz: 'Suvchechak, asoratsiz', ru: 'Ветряная оспа без осложнений', cat: INFEKSIYA },
    { code: 'B02.9', uz: 'O‘rab oluvchi temiratki, asoratsiz', ru: 'Опоясывающий лишай без осложнений', cat: INFEKSIYA },
    { code: 'B15.9', uz: 'A gepatiti, komasiz', ru: 'Гепатит A без печёночной комы', cat: INFEKSIYA },
    { code: 'B16.9', uz: 'O‘tkir B gepatiti', ru: 'Острый гепатит B', cat: INFEKSIYA },
    { code: 'B18.1', uz: 'Surunkali B gepatiti', ru: 'Хронический вирусный гепатит B', cat: INFEKSIYA },
    { code: 'B18.2', uz: 'Surunkali C gepatiti', ru: 'Хронический вирусный гепатит C', cat: INFEKSIYA },
    { code: 'B26.9', uz: 'Tepki (parotit), asoratsiz', ru: 'Эпидемический паротит без осложнений', cat: INFEKSIYA },
    { code: 'B34.9', uz: 'Virusli infeksiya, aniqlanmagan', ru: 'Вирусная инфекция неуточнённая', cat: INFEKSIYA },
    { code: 'B35.1', uz: 'Tirnoq mikozi (onixomikoz)', ru: 'Микоз ногтей', cat: INFEKSIYA },
    { code: 'B35.3', uz: 'Oyoq mikozi', ru: 'Микоз стоп', cat: INFEKSIYA },
    { code: 'B37.3', uz: 'Vulva va vaginaning kandidozi', ru: 'Кандидоз вульвы и вагины', cat: INFEKSIYA },
    { code: 'B37.9', uz: 'Kandidoz, aniqlanmagan', ru: 'Кандидоз неуточнённый', cat: INFEKSIYA },
    { code: 'B77.9', uz: 'Askaridoz', ru: 'Аскаридоз', cat: INFEKSIYA },
    { code: 'B80', uz: 'Enterobioz (gijja)', ru: 'Энтеробиоз', cat: INFEKSIYA },
    { code: 'B86', uz: 'Qo‘tir', ru: 'Чесотка', cat: INFEKSIYA },

    /* ─── C00–D48 · O'smalar ────────────────────────────────────────────── */
    { code: 'C50.9', uz: 'Sut bezi xavfli o‘smasi', ru: 'Злокачественное новообразование молочной железы', cat: OSMA },
    { code: 'C53.9', uz: 'Bachadon bo‘yni xavfli o‘smasi', ru: 'Злокачественное новообразование шейки матки', cat: OSMA },
    { code: 'C61', uz: 'Prostata bezi xavfli o‘smasi', ru: 'Злокачественное новообразование предстательной железы', cat: OSMA },
    { code: 'C73', uz: 'Qalqonsimon bez xavfli o‘smasi', ru: 'Злокачественное новообразование щитовидной железы', cat: OSMA },
    { code: 'D17.9', uz: 'Lipoma', ru: 'Липома', cat: OSMA },
    { code: 'D18.0', uz: 'Gemangioma', ru: 'Гемангиома', cat: OSMA },
    { code: 'D22.9', uz: 'Melanoformali nevus (xol)', ru: 'Меланоформный невус', cat: OSMA },
    { code: 'D24', uz: 'Sut bezining xavfsiz o‘smasi', ru: 'Доброкачественное новообразование молочной железы', cat: OSMA },
    { code: 'D25.9', uz: 'Bachadon miomasi', ru: 'Лейомиома матки', cat: OSMA },
    { code: 'D27', uz: 'Tuxumdonning xavfsiz o‘smasi', ru: 'Доброкачественное новообразование яичника', cat: OSMA },
    { code: 'D34', uz: 'Qalqonsimon bezning xavfsiz o‘smasi', ru: 'Доброкачественное новообразование щитовидной железы', cat: OSMA },
    { code: 'D36.9', uz: 'Xavfsiz o‘sma, aniqlanmagan', ru: 'Доброкачественное новообразование неуточнённой локализации', cat: OSMA },

    /* ─── D50–D89 · Qon kasalliklari ────────────────────────────────────── */
    { code: 'D50.0', uz: 'Surunkali qon yo‘qotishdan temir tanqisligi anemiyasi', ru: 'Железодефицитная анемия вследствие хронической кровопотери', cat: QON },
    { code: 'D50.9', uz: 'Temir tanqisligi anemiyasi', ru: 'Железодефицитная анемия неуточнённая', cat: QON },
    { code: 'D51.9', uz: 'B12-tanqisligi anemiyasi', ru: 'B12-дефицитная анемия неуточнённая', cat: QON },
    { code: 'D52.9', uz: 'Folat tanqisligi anemiyasi', ru: 'Фолиеводефицитная анемия неуточнённая', cat: QON },
    { code: 'D64.9', uz: 'Anemiya, aniqlanmagan', ru: 'Анемия неуточнённая', cat: QON },
    { code: 'D68.9', uz: 'Qon ivishining buzilishi', ru: 'Нарушение свёртываемости крови неуточнённое', cat: QON },
    { code: 'D69.6', uz: 'Trombotsitopeniya, aniqlanmagan', ru: 'Тромбоцитопения неуточнённая', cat: QON },

    /* ─── E00–E90 · Endokrinologiya va modda almashinuvi ────────────────── */
    { code: 'E01.0', uz: 'Yod tanqisligiga bog‘liq diffuz buqoq', ru: 'Диффузный зоб, связанный с йодной недостаточностью', cat: ENDOKRIN },
    { code: 'E03.9', uz: 'Gipotireoz, aniqlanmagan', ru: 'Гипотиреоз неуточнённый', cat: ENDOKRIN },
    { code: 'E04.1', uz: 'Bir tugunli buqoq', ru: 'Нетоксический одноузловой зоб', cat: ENDOKRIN },
    { code: 'E04.2', uz: 'Ko‘p tugunli buqoq', ru: 'Нетоксический многоузловой зоб', cat: ENDOKRIN },
    { code: 'E05.9', uz: 'Tireotoksikoz, aniqlanmagan', ru: 'Тиреотоксикоз неуточнённый', cat: ENDOKRIN },
    { code: 'E06.3', uz: 'Autoimmun tireoidit', ru: 'Аутоиммунный тиреоидит', cat: ENDOKRIN },
    { code: 'E10.9', uz: '1-tur qandli diabet, asoratsiz', ru: 'Сахарный диабет 1 типа без осложнений', cat: ENDOKRIN },
    { code: 'E11.9', uz: '2-tur qandli diabet, asoratsiz', ru: 'Сахарный диабет 2 типа без осложнений', cat: ENDOKRIN },
    { code: 'E11.7', uz: '2-tur qandli diabet, ko‘p asoratli', ru: 'Сахарный диабет 2 типа с множественными осложнениями', cat: ENDOKRIN },
    { code: 'E14.9', uz: 'Qandli diabet, aniqlanmagan', ru: 'Сахарный диабет неуточнённый', cat: ENDOKRIN },
    { code: 'E16.2', uz: 'Gipoglikemiya, aniqlanmagan', ru: 'Гипогликемия неуточнённая', cat: ENDOKRIN },
    { code: 'E28.2', uz: 'Polikistoz tuxumdon sindromi', ru: 'Синдром поликистозных яичников', cat: ENDOKRIN },
    { code: 'E29.1', uz: 'Moyak gipofunksiyasi', ru: 'Гипофункция яичек', cat: ENDOKRIN },
    { code: 'E55.9', uz: 'D vitamini tanqisligi', ru: 'Недостаточность витамина D неуточнённая', cat: ENDOKRIN },
    { code: 'E61.1', uz: 'Temir tanqisligi', ru: 'Недостаточность железа', cat: ENDOKRIN },
    { code: 'E66.0', uz: 'Ortiqcha ovqatlanishdan semizlik', ru: 'Ожирение, обусловленное избыточным поступлением энергии', cat: ENDOKRIN },
    { code: 'E66.9', uz: 'Semizlik, aniqlanmagan', ru: 'Ожирение неуточнённое', cat: ENDOKRIN },
    { code: 'E78.0', uz: 'Sof giperxolesterinemiya', ru: 'Чистая гиперхолестеринемия', cat: ENDOKRIN },
    { code: 'E78.5', uz: 'Giperlipidemiya, aniqlanmagan', ru: 'Гиперлипидемия неуточнённая', cat: ENDOKRIN },
    { code: 'E86', uz: 'Suyuqlik hajmining kamayishi (degidratatsiya)', ru: 'Уменьшение объёма жидкости', cat: ENDOKRIN },
    { code: 'E87.6', uz: 'Gipokaliemiya', ru: 'Гипокалиемия', cat: ENDOKRIN },

    /* ─── F00–F99 · Ruhiy salomatlik ────────────────────────────────────── */
    { code: 'F32.9', uz: 'Depressiv epizod, aniqlanmagan', ru: 'Депрессивный эпизод неуточнённый', cat: RUHIY },
    { code: 'F41.0', uz: 'Vahima (panik) buzilishi', ru: 'Паническое расстройство', cat: RUHIY },
    { code: 'F41.1', uz: 'Generallashgan xavotir buzilishi', ru: 'Генерализованное тревожное расстройство', cat: RUHIY },
    { code: 'F41.2', uz: 'Aralash xavotir va depressiv buzilish', ru: 'Смешанное тревожное и депрессивное расстройство', cat: RUHIY },
    { code: 'F43.2', uz: 'Adaptatsiya buzilishi', ru: 'Расстройство приспособительных реакций', cat: RUHIY },
    { code: 'F45.3', uz: 'Somatoform vegetativ disfunksiya', ru: 'Соматоформная дисфункция вегетативной нервной системы', cat: RUHIY },
    { code: 'F48.0', uz: 'Nevrasteniya', ru: 'Неврастения', cat: RUHIY },
    { code: 'F51.0', uz: 'Organik bo‘lmagan uyqusizlik', ru: 'Бессонница неорганической природы', cat: RUHIY },
    { code: 'F90.0', uz: 'Diqqat yetishmovchiligi va giperaktivlik', ru: 'Нарушение активности и внимания', cat: RUHIY },

    /* ─── G00–G99 · Nevrologiya ─────────────────────────────────────────── */
    { code: 'G40.9', uz: 'Epilepsiya, aniqlanmagan', ru: 'Эпилепсия неуточнённая', cat: NERV },
    { code: 'G43.9', uz: 'Migren, aniqlanmagan', ru: 'Мигрень неуточнённая', cat: NERV },
    { code: 'G44.2', uz: 'Zo‘riqish bosh og‘rig‘i', ru: 'Головная боль напряжённого типа', cat: NERV },
    { code: 'G45.9', uz: 'O‘tkinchi ishemik xuruj', ru: 'Транзиторная церебральная ишемическая атака', cat: NERV },
    { code: 'G47.0', uz: 'Uyquga ketish va uyquni saqlashning buzilishi', ru: 'Нарушения засыпания и поддержания сна', cat: NERV },
    { code: 'G50.0', uz: 'Uch shoxli nerv nevralgiyasi', ru: 'Невралгия тройничного нерва', cat: NERV },
    { code: 'G51.0', uz: 'Yuz nervi falaji (Bell)', ru: 'Паралич Белла', cat: NERV },
    { code: 'G54.1', uz: 'Bel-dumg‘aza chigalining shikastlanishi', ru: 'Поражения пояснично-крестцового сплетения', cat: NERV },
    { code: 'G56.0', uz: 'Bilak kanali sindromi', ru: 'Синдром запястного канала', cat: NERV },
    { code: 'G62.9', uz: 'Polinevropatiya, aniqlanmagan', ru: 'Полиневропатия неуточнённая', cat: NERV },
    { code: 'G90.9', uz: 'Vegetativ nerv sistemasi buzilishi', ru: 'Расстройство вегетативной нервной системы неуточнённое', cat: NERV },
    { code: 'G93.3', uz: 'Charchoq sindromi (virusdan keyingi)', ru: 'Синдром утомляемости после перенесённой вирусной болезни', cat: NERV },

    /* ─── H00–H59 · Oftalmologiya ───────────────────────────────────────── */
    { code: 'H00.0', uz: 'Gordeolum (arpacha)', ru: 'Гордеолум (ячмень)', cat: KOZ },
    { code: 'H10.9', uz: 'Konyunktivit, aniqlanmagan', ru: 'Конъюнктивит неуточнённый', cat: KOZ },
    { code: 'H16.9', uz: 'Keratit, aniqlanmagan', ru: 'Кератит неуточнённый', cat: KOZ },
    { code: 'H25.9', uz: 'Keksalik kataraktasi', ru: 'Старческая катаракта неуточнённая', cat: KOZ },
    { code: 'H40.9', uz: 'Glaukoma, aniqlanmagan', ru: 'Глаукома неуточнённая', cat: KOZ },
    { code: 'H52.0', uz: 'Uzoqni ko‘rish (gipermetropiya)', ru: 'Гиперметропия', cat: KOZ },
    { code: 'H52.1', uz: 'Yaqinni ko‘rish (miopiya)', ru: 'Миопия', cat: KOZ },
    { code: 'H52.2', uz: 'Astigmatizm', ru: 'Астигматизм', cat: KOZ },
    { code: 'H52.4', uz: 'Presbiopiya', ru: 'Пресбиопия', cat: KOZ },
    { code: 'H57.1', uz: 'Ko‘z og‘rig‘i', ru: 'Глазная боль', cat: KOZ },

    /* ─── H60–H95 · LOR ─────────────────────────────────────────────────── */
    { code: 'H60.9', uz: 'Tashqi otit, aniqlanmagan', ru: 'Наружный отит неуточнённый', cat: QULOQ },
    { code: 'H65.9', uz: 'Yiringsiz o‘rta otit', ru: 'Негнойный средний отит неуточнённый', cat: QULOQ },
    { code: 'H66.0', uz: 'O‘tkir yiringli o‘rta otit', ru: 'Острый гнойный средний отит', cat: QULOQ },
    { code: 'H66.9', uz: 'O‘rta otit, aniqlanmagan', ru: 'Средний отит неуточнённый', cat: QULOQ },
    { code: 'H81.1', uz: 'Yaxshi sifatli pozitsion vertigo', ru: 'Доброкачественное пароксизмальное головокружение', cat: QULOQ },
    { code: 'H81.3', uz: 'Boshqa periferik vertigo', ru: 'Другие периферические головокружения', cat: QULOQ },
    { code: 'H90.3', uz: 'Ikki tomonlama neyrosensor eshitish pasayishi', ru: 'Нейросенсорная потеря слуха двусторонняя', cat: QULOQ },
    { code: 'H92.0', uz: 'Quloq og‘rig‘i (otalgiya)', ru: 'Оталгия', cat: QULOQ },
    { code: 'H93.1', uz: 'Quloqda shovqin (tinnitus)', ru: 'Шум в ушах', cat: QULOQ },

    /* ─── I00–I99 · Kardiologiya va qon tomirlar ────────────────────────── */
    { code: 'I10', uz: 'Essensial (birlamchi) arterial gipertenziya', ru: 'Эссенциальная (первичная) гипертензия', cat: YURAK },
    { code: 'I11.9', uz: 'Gipertoniya kasalligi, yurak shikastlanishi bilan', ru: 'Гипертензивная болезнь сердца без сердечной недостаточности', cat: YURAK },
    { code: 'I15.9', uz: 'Ikkilamchi gipertenziya', ru: 'Вторичная гипертензия неуточнённая', cat: YURAK },
    { code: 'I20.0', uz: 'Beqaror stenokardiya', ru: 'Нестабильная стенокардия', cat: YURAK },
    { code: 'I20.8', uz: 'Stenokardiyaning boshqa shakllari', ru: 'Другие формы стенокардии', cat: YURAK },
    { code: 'I21.9', uz: 'O‘tkir miokard infarkti', ru: 'Острый инфаркт миокарда неуточнённый', cat: YURAK },
    { code: 'I25.1', uz: 'Aterosklerotik yurak kasalligi', ru: 'Атеросклеротическая болезнь сердца', cat: YURAK },
    { code: 'I25.9', uz: 'Surunkali ishemik yurak kasalligi', ru: 'Хроническая ишемическая болезнь сердца неуточнённая', cat: YURAK },
    { code: 'I34.0', uz: 'Mitral klapan yetishmovchiligi', ru: 'Митральная недостаточность', cat: YURAK },
    { code: 'I44.0', uz: 'Birinchi darajali atrioventrikulyar blokada', ru: 'Предсердно-желудочковая блокада первой степени', cat: YURAK },
    { code: 'I47.1', uz: 'Supraventrikulyar taxikardiya', ru: 'Наджелудочковая тахикардия', cat: YURAK },
    { code: 'I48', uz: 'Bo‘lmachalar fibrillyatsiyasi va titrashi', ru: 'Фибрилляция и трепетание предсердий', cat: YURAK },
    { code: 'I49.3', uz: 'Qorincha ekstrasistoliyasi', ru: 'Преждевременная деполяризация желудочков', cat: YURAK },
    { code: 'I49.9', uz: 'Yurak ritmi buzilishi, aniqlanmagan', ru: 'Нарушение сердечного ритма неуточнённое', cat: YURAK },
    { code: 'I50.0', uz: 'Dimlanish yurak yetishmovchiligi', ru: 'Застойная сердечная недостаточность', cat: YURAK },
    { code: 'I50.9', uz: 'Yurak yetishmovchiligi, aniqlanmagan', ru: 'Сердечная недостаточность неуточнённая', cat: YURAK },
    { code: 'I63.9', uz: 'Miya infarkti, aniqlanmagan', ru: 'Инфаркт мозга неуточнённый', cat: YURAK },
    { code: 'I67.8', uz: 'Miya qon aylanishining surunkali yetishmovchiligi', ru: 'Другие уточнённые поражения сосудов мозга', cat: YURAK },
    { code: 'I70.2', uz: 'Oyoq arteriyalari aterosklerozi', ru: 'Атеросклероз артерий конечностей', cat: YURAK },
    { code: 'I73.9', uz: 'Periferik qon tomir kasalligi', ru: 'Болезнь периферических сосудов неуточнённая', cat: YURAK },
    { code: 'I80.2', uz: 'Oyoq chuqur venalari flebiti va tromboflebiti', ru: 'Флебит и тромбофлебит глубоких сосудов конечностей', cat: YURAK },
    { code: 'I83.9', uz: 'Oyoq varikoz kengayishi, asoratsiz', ru: 'Варикозное расширение вен нижних конечностей без язвы', cat: YURAK },
    { code: 'I84.1', uz: 'Ichki bavosil, asorat bilan', ru: 'Внутренний геморрой с осложнением', cat: YURAK },
    { code: 'I84.9', uz: 'Bavosil, aniqlanmagan', ru: 'Геморрой неуточнённый', cat: YURAK },
    { code: 'I95.9', uz: 'Gipotenziya, aniqlanmagan', ru: 'Гипотензия неуточнённая', cat: YURAK },

    /* ─── J00–J99 · Nafas yo'llari ──────────────────────────────────────── */
    { code: 'J00', uz: 'O‘tkir nazofaringit (tumov)', ru: 'Острый назофарингит (насморк)', cat: NAFAS },
    { code: 'J01.0', uz: 'O‘tkir gaymorit', ru: 'Острый верхнечелюстной синусит', cat: NAFAS },
    { code: 'J01.9', uz: 'O‘tkir sinusit, aniqlanmagan', ru: 'Острый синусит неуточнённый', cat: NAFAS },
    { code: 'J02.9', uz: 'O‘tkir faringit', ru: 'Острый фарингит неуточнённый', cat: NAFAS },
    { code: 'J03.9', uz: 'O‘tkir tonzillit (angina)', ru: 'Острый тонзиллит неуточнённый', cat: NAFAS },
    { code: 'J04.0', uz: 'O‘tkir laringit', ru: 'Острый ларингит', cat: NAFAS },
    { code: 'J06.9', uz: 'O‘tkir yuqori nafas yo‘llari infeksiyasi (ORVI)', ru: 'Острая инфекция верхних дыхательных путей неуточнённая', cat: NAFAS },
    { code: 'J11.1', uz: 'Grip, virus aniqlanmagan', ru: 'Грипп, вирус не идентифицирован', cat: NAFAS },
    { code: 'J15.9', uz: 'Bakterial pnevmoniya, aniqlanmagan', ru: 'Бактериальная пневмония неуточнённая', cat: NAFAS },
    { code: 'J18.9', uz: 'Pnevmoniya, aniqlanmagan', ru: 'Пневмония неуточнённая', cat: NAFAS },
    { code: 'J20.9', uz: 'O‘tkir bronxit', ru: 'Острый бронхит неуточнённый', cat: NAFAS },
    { code: 'J30.1', uz: 'Gulchang allergik rinit', ru: 'Аллергический ринит, вызванный пыльцой', cat: NAFAS },
    { code: 'J30.4', uz: 'Allergik rinit, aniqlanmagan', ru: 'Аллергический ринит неуточнённый', cat: NAFAS },
    { code: 'J31.0', uz: 'Surunkali rinit', ru: 'Хронический ринит', cat: NAFAS },
    { code: 'J32.9', uz: 'Surunkali sinusit', ru: 'Хронический синусит неуточнённый', cat: NAFAS },
    { code: 'J34.2', uz: 'Burun to‘sig‘ining qiyshayishi', ru: 'Смещённая носовая перегородка', cat: NAFAS },
    { code: 'J35.0', uz: 'Surunkali tonzillit', ru: 'Хронический тонзиллит', cat: NAFAS },
    { code: 'J35.2', uz: 'Adenoidlar kattalashishi', ru: 'Гипертрофия аденоидов', cat: NAFAS },
    { code: 'J40', uz: 'Bronxit, o‘tkir yoki surunkaligi aniqlanmagan', ru: 'Бронхит, не уточнённый как острый или хронический', cat: NAFAS },
    { code: 'J42', uz: 'Surunkali bronxit', ru: 'Хронический бронхит неуточнённый', cat: NAFAS },
    { code: 'J44.9', uz: 'Surunkali obstruktiv o‘pka kasalligi', ru: 'Хроническая обструктивная лёгочная болезнь неуточнённая', cat: NAFAS },
    { code: 'J45.9', uz: 'Bronxial astma, aniqlanmagan', ru: 'Астма неуточнённая', cat: NAFAS },
    { code: 'J98.9', uz: 'Nafas buzilishi, aniqlanmagan', ru: 'Респираторное нарушение неуточнённое', cat: NAFAS },

    /* ─── K00–K93 · Gastroenterologiya ──────────────────────────────────── */
    { code: 'K02.9', uz: 'Tish kariyesi', ru: 'Кариес зубов неуточнённый', cat: HAZM },
    { code: 'K05.1', uz: 'Surunkali gingivit', ru: 'Хронический гингивит', cat: HAZM },
    { code: 'K12.0', uz: 'Og‘izdagi aftalar', ru: 'Рецидивирующие афты полости рта', cat: HAZM },
    { code: 'K21.0', uz: 'Gastroezofageal reflyuks, ezofagit bilan', ru: 'Гастроэзофагеальный рефлюкс с эзофагитом', cat: HAZM },
    { code: 'K21.9', uz: 'Gastroezofageal reflyuks, ezofagitsiz', ru: 'Гастроэзофагеальный рефлюкс без эзофагита', cat: HAZM },
    { code: 'K25.9', uz: 'Oshqozon yarasi', ru: 'Язва желудка неуточнённая', cat: HAZM },
    { code: 'K26.9', uz: 'O‘n ikki barmoq ichak yarasi', ru: 'Язва двенадцатиперстной кишки неуточнённая', cat: HAZM },
    { code: 'K29.1', uz: 'O‘tkir gastrit', ru: 'Другие острые гастриты', cat: HAZM },
    { code: 'K29.5', uz: 'Surunkali gastrit, aniqlanmagan', ru: 'Хронический гастрит неуточнённый', cat: HAZM },
    { code: 'K29.7', uz: 'Gastrit, aniqlanmagan', ru: 'Гастрит неуточнённый', cat: HAZM },
    { code: 'K30', uz: 'Funksional dispepsiya', ru: 'Функциональная диспепсия', cat: HAZM },
    { code: 'K35.8', uz: 'O‘tkir appenditsit', ru: 'Острый аппендицит неуточнённый', cat: HAZM },
    { code: 'K40.9', uz: 'Bir tomonlama chov churrasi', ru: 'Односторонняя паховая грыжа без непроходимости', cat: HAZM },
    { code: 'K42.9', uz: 'Kindik churrasi', ru: 'Пупочная грыжа без непроходимости', cat: HAZM },
    { code: 'K52.9', uz: 'Yuqumsiz gastroenterit va kolit', ru: 'Неинфекционный гастроэнтерит и колит неуточнённый', cat: HAZM },
    { code: 'K57.3', uz: 'Yo‘g‘on ichak divertikulyoz kasalligi', ru: 'Дивертикулярная болезнь толстой кишки', cat: HAZM },
    { code: 'K58.9', uz: 'Ta’sirchan ichak sindromi', ru: 'Синдром раздражённого кишечника без диареи', cat: HAZM },
    { code: 'K59.0', uz: 'Qabziyat', ru: 'Запор', cat: HAZM },
    { code: 'K60.2', uz: 'Anal yoriq, aniqlanmagan', ru: 'Анальная трещина неуточнённая', cat: HAZM },
    { code: 'K73.9', uz: 'Surunkali gepatit, aniqlanmagan', ru: 'Хронический гепатит неуточнённый', cat: HAZM },
    { code: 'K76.0', uz: 'Jigarning yog‘li distrofiyasi', ru: 'Жировая дегенерация печени', cat: HAZM },
    { code: 'K80.2', uz: 'O‘t pufagi toshi, xoletsistitsiz', ru: 'Камни жёлчного пузыря без холецистита', cat: HAZM },
    { code: 'K81.1', uz: 'Surunkali xoletsistit', ru: 'Хронический холецистит', cat: HAZM },
    { code: 'K82.8', uz: 'O‘t pufagining boshqa kasalliklari', ru: 'Другие уточнённые болезни жёлчного пузыря', cat: HAZM },
    { code: 'K85.9', uz: 'O‘tkir pankreatit', ru: 'Острый панкреатит неуточнённый', cat: HAZM },
    { code: 'K86.1', uz: 'Surunkali pankreatit', ru: 'Другие хронические панкреатиты', cat: HAZM },

    /* ─── L00–L99 · Dermatologiya ───────────────────────────────────────── */
    { code: 'L01.0', uz: 'Impetigo', ru: 'Импетиго', cat: TERI },
    { code: 'L02.9', uz: 'Teri absessi, chipqon', ru: 'Абсцесс кожи, фурункул и карбункул неуточнённой локализации', cat: TERI },
    { code: 'L03.9', uz: 'Flegmona, aniqlanmagan', ru: 'Флегмона неуточнённая', cat: TERI },
    { code: 'L20.9', uz: 'Atopik dermatit', ru: 'Атопический дерматит неуточнённый', cat: TERI },
    { code: 'L21.9', uz: 'Seboreyali dermatit', ru: 'Себорейный дерматит неуточнённый', cat: TERI },
    { code: 'L23.9', uz: 'Allergik kontakt dermatit', ru: 'Аллергический контактный дерматит неуточнённый', cat: TERI },
    { code: 'L25.9', uz: 'Kontakt dermatit, aniqlanmagan', ru: 'Контактный дерматит неуточнённый', cat: TERI },
    { code: 'L29.9', uz: 'Qichishish, aniqlanmagan', ru: 'Зуд неуточнённый', cat: TERI },
    { code: 'L30.9', uz: 'Dermatit, aniqlanmagan', ru: 'Дерматит неуточнённый', cat: TERI },
    { code: 'L40.9', uz: 'Psoriaz, aniqlanmagan', ru: 'Псориаз неуточнённый', cat: TERI },
    { code: 'L50.9', uz: 'Eshakem (krapivnitsa)', ru: 'Крапивница неуточнённая', cat: TERI },
    { code: 'L60.0', uz: 'Tirnoqning botib o‘sishi', ru: 'Вросший ноготь', cat: TERI },
    { code: 'L63.9', uz: 'Uyalab soch to‘kilishi', ru: 'Гнёздная алопеция неуточнённая', cat: TERI },
    { code: 'L64.9', uz: 'Androgen alopetsiya', ru: 'Андрогенная алопеция неуточнённая', cat: TERI },
    { code: 'L70.0', uz: 'Oddiy husnbuzar (akne)', ru: 'Угри обыкновенные', cat: TERI },
    { code: 'L71.9', uz: 'Rozatsea', ru: 'Розацеа неуточнённая', cat: TERI },
    { code: 'L81.4', uz: 'Melanin giperpigmentatsiyasi', ru: 'Другая меланиновая гиперпигментация', cat: TERI },
    { code: 'L84', uz: 'Qadoq va suyaklar', ru: 'Мозоли и омозолелости', cat: TERI },
    { code: 'L98.9', uz: 'Teri kasalligi, aniqlanmagan', ru: 'Поражение кожи неуточнённое', cat: TERI },

    /* ─── M00–M99 · Suyak-mushak sistemasi ──────────────────────────────── */
    { code: 'M05.9', uz: 'Seropozitiv revmatoid artrit', ru: 'Серопозитивный ревматоидный артрит неуточнённый', cat: SUYAK },
    { code: 'M10.9', uz: 'Podagra, aniqlanmagan', ru: 'Подагра неуточнённая', cat: SUYAK },
    { code: 'M13.9', uz: 'Artrit, aniqlanmagan', ru: 'Артрит неуточнённый', cat: SUYAK },
    { code: 'M15.9', uz: 'Poliartroz, aniqlanmagan', ru: 'Полиартроз неуточнённый', cat: SUYAK },
    { code: 'M16.9', uz: 'Chanoq-son bo‘g‘imi artrozi', ru: 'Коксартроз неуточнённый', cat: SUYAK },
    { code: 'M17.9', uz: 'Tizza bo‘g‘imi artrozi', ru: 'Гонартроз неуточнённый', cat: SUYAK },
    { code: 'M19.9', uz: 'Artroz, aniqlanmagan', ru: 'Артроз неуточнённый', cat: SUYAK },
    { code: 'M25.5', uz: 'Bo‘g‘im og‘rig‘i (artralgiya)', ru: 'Боль в суставе', cat: SUYAK },
    { code: 'M42.1', uz: 'Kattalarda osteoxondroz', ru: 'Остеохондроз позвоночника у взрослых', cat: SUYAK },
    { code: 'M47.9', uz: 'Spondilyoz, aniqlanmagan', ru: 'Спондилёз неуточнённый', cat: SUYAK },
    { code: 'M51.1', uz: 'Bel disklari radikulopatiya bilan', ru: 'Поражения межпозвоночных дисков с радикулопатией', cat: SUYAK },
    { code: 'M53.1', uz: 'Servikokranial sindrom', ru: 'Шейно-черепной синдром', cat: SUYAK },
    { code: 'M54.1', uz: 'Radikulopatiya', ru: 'Радикулопатия', cat: SUYAK },
    { code: 'M54.2', uz: 'Bo‘yin og‘rig‘i (servikalgiya)', ru: 'Цервикалгия', cat: SUYAK },
    { code: 'M54.4', uz: 'Bel-dumg‘aza og‘rig‘i (lyumboishialgiya)', ru: 'Люмбаго с ишиасом', cat: SUYAK },
    { code: 'M54.5', uz: 'Bel og‘rig‘i', ru: 'Боль внизу спины', cat: SUYAK },
    { code: 'M54.9', uz: 'Dorsalgiya, aniqlanmagan', ru: 'Дорсалгия неуточнённая', cat: SUYAK },
    { code: 'M65.9', uz: 'Sinovit va tenosinovit', ru: 'Синовит и теносиновит неуточнённый', cat: SUYAK },
    { code: 'M75.0', uz: 'Yelka adgeziv kapsuliti', ru: 'Адгезивный капсулит плеча', cat: SUYAK },
    { code: 'M77.1', uz: 'Lateral epikondilit (tennischi tirsagi)', ru: 'Латеральный эпикондилит', cat: SUYAK },
    { code: 'M79.1', uz: 'Mialgiya', ru: 'Миалгия', cat: SUYAK },
    { code: 'M79.6', uz: 'Oyoq-qo‘lda og‘riq', ru: 'Боль в конечности', cat: SUYAK },
    { code: 'M81.9', uz: 'Osteoporoz, aniqlanmagan', ru: 'Остеопороз неуточнённый', cat: SUYAK },
    { code: 'M99.1', uz: 'Umurtqa segmentar disfunksiyasi', ru: 'Подвывих (сегментарное нарушение)', cat: SUYAK },

    /* ─── N00–N99 · Urologiya, nefrologiya, ginekologiya ────────────────── */
    { code: 'N04.9', uz: 'Nefrotik sindrom', ru: 'Нефротический синдром неуточнённый', cat: SIYDIK },
    { code: 'N10', uz: 'O‘tkir tubulointerstitsial nefrit (pielonefrit)', ru: 'Острый тубулоинтерстициальный нефрит', cat: SIYDIK },
    { code: 'N11.9', uz: 'Surunkali pielonefrit', ru: 'Хронический тубулоинтерстициальный нефрит неуточнённый', cat: SIYDIK },
    { code: 'N18.9', uz: 'Surunkali buyrak kasalligi', ru: 'Хроническая болезнь почки неуточнённая', cat: SIYDIK },
    { code: 'N20.0', uz: 'Buyrak toshi', ru: 'Камни почки', cat: SIYDIK },
    { code: 'N20.1', uz: 'Siydik yo‘li toshi', ru: 'Камни мочеточника', cat: SIYDIK },
    { code: 'N23', uz: 'Buyrak sanchig‘i, aniqlanmagan', ru: 'Почечная колика неуточнённая', cat: SIYDIK },
    { code: 'N30.0', uz: 'O‘tkir sistit', ru: 'Острый цистит', cat: SIYDIK },
    { code: 'N30.9', uz: 'Sistit, aniqlanmagan', ru: 'Цистит неуточнённый', cat: SIYDIK },
    { code: 'N39.0', uz: 'Siydik yo‘llari infeksiyasi', ru: 'Инфекция мочевыводящих путей без установленной локализации', cat: SIYDIK },
    { code: 'N40', uz: 'Prostata bezining giperplaziyasi', ru: 'Гиперплазия предстательной железы', cat: SIYDIK },
    { code: 'N41.0', uz: 'O‘tkir prostatit', ru: 'Острый простатит', cat: SIYDIK },
    { code: 'N41.1', uz: 'Surunkali prostatit', ru: 'Хронический простатит', cat: SIYDIK },
    { code: 'N43.3', uz: 'Gidrotsele', ru: 'Гидроцеле неуточнённое', cat: SIYDIK },
    { code: 'N45.9', uz: 'Orxit va epididimit', ru: 'Орхит и эпидидимит', cat: SIYDIK },
    { code: 'N47', uz: 'Ortiqcha va tor qulfoq (fimoz)', ru: 'Избыточная крайняя плоть, фимоз и парафимоз', cat: SIYDIK },
    { code: 'N48.4', uz: 'Erektil disfunksiya', ru: 'Импотенция органического происхождения', cat: SIYDIK },
    { code: 'N50.8', uz: 'Erkak jinsiy a’zolarining boshqa kasalliklari', ru: 'Другие уточнённые болезни мужских половых органов', cat: SIYDIK },

    { code: 'N60.1', uz: 'Diffuz kistoz mastopatiya', ru: 'Диффузная кистозная мастопатия', cat: AYOL },
    { code: 'N61', uz: 'Mastit', ru: 'Воспалительные болезни молочной железы', cat: AYOL },
    { code: 'N63', uz: 'Sut bezidagi tugun, aniqlanmagan', ru: 'Образование в молочной железе неуточнённое', cat: AYOL },
    { code: 'N70.9', uz: 'Salpingit va ooforit', ru: 'Сальпингит и оофорит неуточнённые', cat: AYOL },
    { code: 'N71.9', uz: 'Bachadonning yallig‘lanish kasalligi', ru: 'Воспалительная болезнь матки неуточнённая', cat: AYOL },
    { code: 'N72', uz: 'Bachadon bo‘yni yallig‘lanishi (servitsit)', ru: 'Воспалительная болезнь шейки матки', cat: AYOL },
    { code: 'N73.9', uz: 'Kichik chanoq yallig‘lanish kasalligi', ru: 'Воспалительная болезнь женских тазовых органов неуточнённая', cat: AYOL },
    { code: 'N76.0', uz: 'O‘tkir vaginit', ru: 'Острый вагинит', cat: AYOL },
    { code: 'N76.1', uz: 'Surunkali vaginit', ru: 'Подострый и хронический вагинит', cat: AYOL },
    { code: 'N80.9', uz: 'Endometrioz, aniqlanmagan', ru: 'Эндометриоз неуточнённый', cat: AYOL },
    { code: 'N83.2', uz: 'Tuxumdon kistasi', ru: 'Другие и неуточнённые кисты яичника', cat: AYOL },
    { code: 'N84.1', uz: 'Bachadon bo‘yni polipi', ru: 'Полип шейки матки', cat: AYOL },
    { code: 'N85.0', uz: 'Endometriyning bezli giperplaziyasi', ru: 'Железистая гиперплазия эндометрия', cat: AYOL },
    { code: 'N86', uz: 'Bachadon bo‘yni eroziyasi va ektropioni', ru: 'Эрозия и эктропион шейки матки', cat: AYOL },
    { code: 'N87.9', uz: 'Bachadon bo‘yni displaziyasi', ru: 'Дисплазия шейки матки неуточнённая', cat: AYOL },
    { code: 'N91.2', uz: 'Amenoreya, aniqlanmagan', ru: 'Аменорея неуточнённая', cat: AYOL },
    { code: 'N92.0', uz: 'Ko‘p va tez-tez hayz ko‘rish', ru: 'Обильные и частые менструации при регулярном цикле', cat: AYOL },
    { code: 'N92.6', uz: 'Tartibsiz hayz, aniqlanmagan', ru: 'Нерегулярные менструации неуточнённые', cat: AYOL },
    { code: 'N94.6', uz: 'Dismenoreya, aniqlanmagan', ru: 'Дисменорея неуточнённая', cat: AYOL },
    { code: 'N95.1', uz: 'Klimakterik holat', ru: 'Менопаузное и климактерическое состояние у женщин', cat: AYOL },
    { code: 'N97.9', uz: 'Ayol bepushtligi, aniqlanmagan', ru: 'Женское бесплодие неуточнённое', cat: AYOL },

    /* ─── O00–O99 · Homiladorlik va tug'ruq ─────────────────────────────── */
    { code: 'O00.1', uz: 'Naycha homiladorligi', ru: 'Трубная беременность', cat: HOMILA },
    { code: 'O02.1', uz: 'To‘xtab qolgan homiladorlik', ru: 'Несостоявшийся выкидыш', cat: HOMILA },
    { code: 'O03.9', uz: 'O‘z-o‘zidan tushish', ru: 'Самопроизвольный аборт неуточнённый', cat: HOMILA },
    { code: 'O20.0', uz: 'Tushish xavfi', ru: 'Угрожающий аборт', cat: HOMILA },
    { code: 'O21.0', uz: 'Homiladorlarda yengil qusish', ru: 'Рвота беременных лёгкая', cat: HOMILA },
    { code: 'O23.4', uz: 'Homiladorlikda siydik yo‘llari infeksiyasi', ru: 'Инфекция мочевых путей при беременности неуточнённая', cat: HOMILA },
    { code: 'O24.4', uz: 'Homiladorlik diabeti', ru: 'Сахарный диабет, возникший во время беременности', cat: HOMILA },
    { code: 'O26.8', uz: 'Homiladorlikning boshqa holatlari', ru: 'Другие уточнённые состояния, связанные с беременностью', cat: HOMILA },
    { code: 'O47.9', uz: 'Soxta tug‘ruq faoliyati', ru: 'Ложные схватки неуточнённые', cat: HOMILA },
    { code: 'O80', uz: 'Bir homilali normal tug‘ruq', ru: 'Роды одноплодные, самопроизвольное родоразрешение', cat: HOMILA },
    { code: 'O99.0', uz: 'Homiladorlikni asoratlantiruvchi anemiya', ru: 'Анемия, осложняющая беременность', cat: HOMILA },
    { code: 'Z34.9', uz: 'Normal homiladorlik kuzatuvi', ru: 'Наблюдение за течением нормальной беременности', cat: HOMILA },
    { code: 'Z35.9', uz: 'Yuqori xavfli homiladorlik kuzatuvi', ru: 'Наблюдение за беременностью высокого риска', cat: HOMILA },

    /* ─── P00–P96, Q00–Q99 · Pediatriya ─────────────────────────────────── */
    { code: 'P07.3', uz: 'Muddatidan oldin tug‘ilgan chaqaloq', ru: 'Другие случаи недоношенности', cat: BOLA },
    { code: 'P59.9', uz: 'Yangi tug‘ilganlar sariqligi', ru: 'Неонатальная желтуха неуточнённая', cat: BOLA },
    { code: 'Q21.1', uz: 'Bo‘lmachalararo to‘siq nuqsoni', ru: 'Дефект предсердной перегородки', cat: BOLA },
    { code: 'Q53.9', uz: 'Moyak tushmasligi (kriptorxizm)', ru: 'Неуточнённое неопущение яичка', cat: BOLA },
    { code: 'Q65.9', uz: 'Chanoq-son bo‘g‘imi tug‘ma deformatsiyasi', ru: 'Врождённая деформация бедра неуточнённая', cat: BOLA },
    { code: 'Q66.0', uz: 'Tovon-oyoq varus deformatsiyasi', ru: 'Конско-варусная косолапость', cat: BOLA },
    { code: 'R62.8', uz: 'Jismoniy rivojlanishdan orqada qolish', ru: 'Другие виды задержки развития', cat: BOLA },
    { code: 'Z00.1', uz: 'Bolaning profilaktik ko‘rigi', ru: 'Обычный медицинский осмотр ребёнка', cat: BOLA },
    { code: 'Z23', uz: 'Emlash uchun murojaat', ru: 'Необходимость иммунизации', cat: BOLA },
    { code: 'Z27.9', uz: 'Kombinatsiyalangan emlash', ru: 'Необходимость комбинированной иммунизации', cat: BOLA },

    /* ─── R00–R99 · Alomatlar va noaniq holatlar ────────────────────────── */
    { code: 'R00.0', uz: 'Taxikardiya, aniqlanmagan', ru: 'Тахикардия неуточнённая', cat: ALOMAT },
    { code: 'R00.1', uz: 'Bradikardiya, aniqlanmagan', ru: 'Брадикардия неуточнённая', cat: ALOMAT },
    { code: 'R05', uz: 'Yo‘tal', ru: 'Кашель', cat: ALOMAT },
    { code: 'R06.0', uz: 'Hansirash', ru: 'Одышка', cat: ALOMAT },
    { code: 'R07.4', uz: 'Ko‘krak qafasidagi og‘riq', ru: 'Боль в груди неуточнённая', cat: ALOMAT },
    { code: 'R10.1', uz: 'Qorinning yuqori qismidagi og‘riq', ru: 'Боль, локализованная в верхней части живота', cat: ALOMAT },
    { code: 'R10.4', uz: 'Qorin og‘rig‘i, aniqlanmagan', ru: 'Другие и неуточнённые боли в области живота', cat: ALOMAT },
    { code: 'R11', uz: 'Ko‘ngil aynishi va qusish', ru: 'Тошнота и рвота', cat: ALOMAT },
    { code: 'R14', uz: 'Meteorizm', ru: 'Метеоризм и родственные состояния', cat: ALOMAT },
    { code: 'R19.7', uz: 'Diareya, aniqlanmagan', ru: 'Диарея неуточнённая', cat: ALOMAT },
    { code: 'R30.0', uz: 'Siyishda og‘riq (dizuriya)', ru: 'Дизурия', cat: ALOMAT },
    { code: 'R31', uz: 'Gematuriya, aniqlanmagan', ru: 'Неспецифическая гематурия', cat: ALOMAT },
    { code: 'R35', uz: 'Poliuriya', ru: 'Полиурия', cat: ALOMAT },
    { code: 'R42', uz: 'Bosh aylanishi', ru: 'Головокружение и нарушение устойчивости', cat: ALOMAT },
    { code: 'R50.9', uz: 'Isitma, aniqlanmagan', ru: 'Лихорадка неуточнённая', cat: ALOMAT },
    { code: 'R51', uz: 'Bosh og‘rig‘i', ru: 'Головная боль', cat: ALOMAT },
    { code: 'R53', uz: 'Holsizlik va charchoq', ru: 'Недомогание и утомляемость', cat: ALOMAT },
    { code: 'R55', uz: 'Hushdan ketish (sinkope)', ru: 'Обморок и коллапс', cat: ALOMAT },
    { code: 'R60.0', uz: 'Mahalliy shish', ru: 'Локализованный отёк', cat: ALOMAT },
    { code: 'R63.0', uz: 'Ishtaha yo‘qolishi', ru: 'Анорексия', cat: ALOMAT },
    { code: 'R63.5', uz: 'Ortiqcha vazn ortishi', ru: 'Ненормальная прибавка массы тела', cat: ALOMAT },
    { code: 'R73.9', uz: 'Giperglikemiya, aniqlanmagan', ru: 'Гипергликемия неуточнённая', cat: ALOMAT },
    { code: 'R79.8', uz: 'Qon biokimyosidagi boshqa o‘zgarishlar', ru: 'Другие уточнённые отклонения биохимии крови', cat: ALOMAT },
    { code: 'R94.3', uz: 'EKG dagi o‘zgarishlar', ru: 'Отклонения от нормы, выявленные при ЭКГ', cat: ALOMAT },

    /* ─── S00–T98 · Jarohatlar ──────────────────────────────────────────── */
    { code: 'S00.9', uz: 'Bosh yuzasining shikastlanishi', ru: 'Поверхностная травма головы неуточнённая', cat: JAROHAT },
    { code: 'S06.0', uz: 'Miya chayqalishi', ru: 'Сотрясение головного мозга', cat: JAROHAT },
    { code: 'S13.4', uz: 'Bo‘yin umurtqasi cho‘zilishi', ru: 'Растяжение связок шейного отдела позвоночника', cat: JAROHAT },
    { code: 'S22.3', uz: 'Qovurg‘a sinishi', ru: 'Перелом ребра', cat: JAROHAT },
    { code: 'S42.3', uz: 'Yelka suyagi tanasining sinishi', ru: 'Перелом тела плечевой кости', cat: JAROHAT },
    { code: 'S52.5', uz: 'Bilak suyagi pastki uchining sinishi', ru: 'Перелом нижнего конца лучевой кости', cat: JAROHAT },
    { code: 'S61.9', uz: 'Bilak va qo‘l ochiq yarasi', ru: 'Открытая рана неуточнённой части запястья и кисти', cat: JAROHAT },
    { code: 'S72.0', uz: 'Son suyagi bo‘yni sinishi', ru: 'Перелом шейки бедра', cat: JAROHAT },
    { code: 'S82.6', uz: 'Tashqi to‘piq sinishi', ru: 'Перелом наружной лодыжки', cat: JAROHAT },
    { code: 'S83.6', uz: 'Tizza bog‘lamlarining cho‘zilishi', ru: 'Растяжение связок коленного сустава', cat: JAROHAT },
    { code: 'S93.4', uz: 'Oyoq panjasi bog‘lamlarining cho‘zilishi', ru: 'Растяжение связок голеностопного сустава', cat: JAROHAT },
    { code: 'T14.0', uz: 'Yuzaki shikastlanish, joyi aniqlanmagan', ru: 'Поверхностная травма неуточнённой области тела', cat: JAROHAT },
    { code: 'T14.1', uz: 'Ochiq yara, joyi aniqlanmagan', ru: 'Открытая рана неуточнённой области тела', cat: JAROHAT },
    { code: 'T30.0', uz: 'Kuyish, darajasi aniqlanmagan', ru: 'Термический ожог неуточнённой степени', cat: JAROHAT },
    { code: 'T63.4', uz: 'Hasharot chaqishi zahari', ru: 'Яд других членистоногих', cat: JAROHAT },
    { code: 'T78.0', uz: 'Ovqatdan anafilaktik shok', ru: 'Анафилактический шок, вызванный пищей', cat: JAROHAT },
    { code: 'T78.3', uz: 'Angionevrotik shish (Kvinke)', ru: 'Ангионевротический отёк', cat: JAROHAT },
    { code: 'T78.4', uz: 'Allergiya, aniqlanmagan', ru: 'Аллергия неуточнённая', cat: JAROHAT },
    { code: 'T88.7', uz: 'Dorining nojo‘ya ta’siri', ru: 'Патологическая реакция на лекарственное средство', cat: JAROHAT },

    /* ─── Z00–Z99 · Profilaktika, ko'riklar, kuzatuv ────────────────────── */
    { code: 'Z00.0', uz: 'Umumiy tibbiy ko‘rik', ru: 'Общий медицинский осмотр', cat: PROFILAKTIKA },
    { code: 'Z01.0', uz: 'Ko‘z va ko‘rishni tekshirish', ru: 'Обследование глаз и зрения', cat: PROFILAKTIKA },
    { code: 'Z01.1', uz: 'Quloq va eshitishni tekshirish', ru: 'Обследование ушей и слуха', cat: PROFILAKTIKA },
    { code: 'Z01.4', uz: 'Ginekologik ko‘rik', ru: 'Гинекологическое обследование', cat: PROFILAKTIKA },
    { code: 'Z01.6', uz: 'Rentgenologik tekshiruv', ru: 'Радиологическое обследование', cat: PROFILAKTIKA },
    { code: 'Z02.0', uz: 'O‘quv muassasasiga kirish uchun ko‘rik', ru: 'Обследование для поступления в учебное заведение', cat: PROFILAKTIKA },
    { code: 'Z02.1', uz: 'Ishga kirish uchun tibbiy ko‘rik', ru: 'Предварительный медицинский осмотр при приёме на работу', cat: PROFILAKTIKA },
    { code: 'Z02.7', uz: 'Tibbiy ma’lumotnoma berish', ru: 'Выдача медицинского свидетельства', cat: PROFILAKTIKA },
    { code: 'Z03.9', uz: 'Kuzatuv, tashxis tasdiqlanmagan', ru: 'Наблюдение при подозрении на заболевание неуточнённое', cat: PROFILAKTIKA },
    { code: 'Z09.9', uz: 'Davolangandan keyingi kuzatuv', ru: 'Обследование после лечения неуточнённого состояния', cat: PROFILAKTIKA },
    { code: 'Z11.3', uz: 'Jinsiy yo‘l bilan yuqadigan infeksiyalarga tekshiruv', ru: 'Специальное скрининговое обследование на инфекции, передающиеся половым путём', cat: PROFILAKTIKA },
    { code: 'Z12.4', uz: 'Bachadon bo‘yni skriningi', ru: 'Специальное скрининговое обследование шейки матки', cat: PROFILAKTIKA },
    { code: 'Z13.1', uz: 'Qandli diabetga skrining', ru: 'Специальное скрининговое обследование на сахарный диабет', cat: PROFILAKTIKA },
    { code: 'Z30.0', uz: 'Kontratseptsiya bo‘yicha maslahat', ru: 'Общие советы и консультации по контрацепции', cat: PROFILAKTIKA },
    { code: 'Z30.1', uz: 'Ichki vosita (spiral) qo‘yish', ru: 'Введение внутриматочного противозачаточного средства', cat: PROFILAKTIKA },
    { code: 'Z48.0', uz: 'Jarrohlik chokini olish va bog‘lam', ru: 'Уход за хирургическими повязками и швами', cat: PROFILAKTIKA },
    { code: 'Z51.4', uz: 'Davolashdan oldingi tayyorgarlik', ru: 'Подготовительные процедуры для последующего лечения', cat: PROFILAKTIKA },
    { code: 'Z71.3', uz: 'Ovqatlanish bo‘yicha maslahat', ru: 'Консультирование и наблюдение по вопросам диеты', cat: PROFILAKTIKA },
    { code: 'Z76.0', uz: 'Retsept yozdirish uchun murojaat', ru: 'Выписка повторного рецепта', cat: PROFILAKTIKA },
];

/** Kod bo'yicha takror yo'qligini kafolatlaydi — `code` birlamchi kalit. */
export function findDuplicateCodes(): string[] {
    const seen = new Set<string>();
    const dupes: string[] = [];
    for (const r of ICD10_ROWS) {
        if (seen.has(r.code)) dupes.push(r.code);
        seen.add(r.code);
    }
    return dupes;
}
