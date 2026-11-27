/* ALLERGIYA ↔ DORI — dori bazasisiz moslik (2026-11-26).

   Bemor kartasida allergiya erkin matn: «Penitsillin», «Пенициллин»,
   «penicillin», «Aspirin», «Yod». Dori nomi ham erkin matn: «Amoksitsillin
   500 mg», «Augmentin», «Ko'k yod». Bu yerda ikkalasi bir xil shaklga
   keltiriladi va ikki yo'l bilan solishtiriladi:

   1. TO'G'RIDAN — allergiya so'zi dori nomida (yoki aksincha), bir-ikki
      harf xato bilan ham.
   2. GURUH — eng xavfli o'zaro reaksiya guruhlari (penitsillinlar,
      sefalosporinlar, sulfanilamidlar, NYaQV/aspirin, metamizol, yod).
      «Penitsillin» allergiyasi bor bemorga «Augmentin» yozilsa ham ushlanadi.

   Ogohlantiradi, TO'XTATMAYDI: dori bazasi yo'q, noto'g'ri ogohlantirish
   davolashni to'xtatib qo'ymasin (shifokor va xavfsizlik maslahatchisi
   fikri). Shifokor «Baribir yozish» ni bosadi — bu jurnalga yoziladi.

   Front ham, backend ham shu faylni o'qiydi (`shared/README.md`). */

export type AllergyLevel = 'direct' | 'class' | 'related';

/** Shifokor ogohlantirishni o'tkazganda retsept izohiga yoziladigan ichki
 *  qayd shu so'z bilan boshlanadi. Bemorga ketadigan PDF bu qatorni
 *  TASHLAB YUBORADI (backend/patientPdf.ts) — u klinikaning ichki yozuvi. */
export const ALLERGY_OVERRIDE_PREFIX = "Allergiya ogohlantirishi o'tkazildi:";

export interface AllergyHit {
    /** Kartadagi allergiya matni, o'zgarishsiz */
    allergy: string;
    severity: string;
    /** direct — o'sha modda; class — o'sha guruh; related — qisman o'zaro reaksiya */
    level: AllergyLevel;
    /** Guruh nomi (o'zbekcha), `direct` da bo'sh */
    group?: string;
}

export interface AllergyLike { substance: string; severity?: string | null; isActive?: boolean | null }

/* ── Normallashtirish ───────────────────────────────────────────────────
   Kirill → lotin, keyin fonetik yig'ish: «пенициллин», «penitsillin» va
   «penicillin» uchalasi ham «penisilin» bo'ladi. */
const CYR: Record<string, string> = {
    а: 'a', б: 'b', в: 'v', г: 'g', ғ: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'j', з: 'z', и: 'i', й: 'y',
    к: 'k', қ: 'k', л: 'l', м: 'm', н: 'n', о: 'o', ў: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u',
    ф: 'f', х: 'h', ҳ: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sh', ъ: '', ы: 'i', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

/** Doza va birliklar — nomdan olib tashlanadi */
const UNIT_RE = /\b\d+([.,]\d+)?\s*(mg|мг|g|г|ml|мл|mkg|мкг|me|ед|%|tab|таб|tabletka|таблетка|kaps|капс)\b/g;

export function normalizeDrugText(s: string): string {
    let t = String(s || '').normalize('NFKC').toLowerCase();
    t = t.replace(UNIT_RE, ' ');
    t = Array.from(t).map(ch => (CYR[ch] !== undefined ? CYR[ch] : ch)).join('');
    t = t.replace(/[ʻʼ'`’‘"]/g, '').replace(/[^a-z0-9\s-]/g, ' ');
    return t
        .replace(/ts/g, 's')
        .replace(/c(?=[eiy])/g, 's')
        .replace(/ph/g, 'f')
        .replace(/c/g, 'k')
        .replace(/q/g, 'k')
        .replace(/x/g, 'ks')
        .replace(/z/g, 's')
        .replace(/y/g, 'i')
        .replace(/([a-z])\1+/g, '$1')
        .replace(/\s+/g, ' ')
        .trim();
}

const words = (s: string) => normalizeDrugText(s).split(/[\s-]+/).filter(w => w.length >= 3);

/* ── Guruhlar ───────────────────────────────────────────────────────────
   `stems` — so'z BOSHI shu bilan boshlansa (normallashtirilgan shaklda).
   `allergyWords` — allergiya matnida guruhni bildiradigan so'zlar
   («antibiotik» juda keng — u faqat penitsillin va sefalosporinga qo'yiladi). */
interface Group {
    id: string;
    name: string;
    stems: string[];
    allergyWords?: string[];
    /** Qisman o'zaro reaksiya: bu guruh allergiyasida shu guruh dorilari `related` */
    related?: string[];
    /** Bu so'zlar bilan boshlansa — guruhga KIRMAYDI («magniy sulfat») */
    exclude?: string[];
    /** So'z OXIRI shu bilan tugasa ham guruhda: hamma penitsillinlar
        «-silin» (fenoksimetilpenitsillin, kloksatsillin, flukloksatsillin) */
    suffixes?: string[];
}

const GROUPS: Group[] = [
    {
        id: 'penicillin', name: 'penitsillinlar',
        stems: ['penisilin', 'benzilpenisilin', 'bisilin', 'ekstensilin', 'amoksisilin', 'amoksiklav', 'amoks',
            'ampisilin', 'oksasilin', 'ampioks', 'piperasilin', 'tasosin', 'sultamisilin', 'unasin', 'augmentin',
            'flemoksin', 'flemoklav', 'ospamoks', 'panklav', 'klavulan'],
        allergyWords: ['penisilin', 'betalaktam', 'beta-laktam'],
        suffixes: ['silin'],
        related: ['cephalosporin'],
    },
    {
        id: 'cephalosporin', name: 'sefalosporinlar',
        stems: ['sef', 'sinat', 'supraks', 'sulperason'],
        allergyWords: ['sefalosporin', 'betalaktam'],
        related: ['penicillin'],
    },
    {
        id: 'sulfonamide', name: 'sulfanilamidlar',
        /* «Ko-trimoksazol» tire bilan yoziladi — so'zlar tire bo'yicha
           bo'linadi, shuning uchun «trimoksasol» ham alohida */
        stems: ['sulfa', 'sulfanil', 'kotrimoksasol', 'trimoksasol', 'biseptol', 'baktrim', 'sulfasil', 'albusid',
            'sulfasalasin', 'sulfargin', 'streptosid'],
        allergyWords: ['sulfanilamid', 'sulfa', 'biseptol'],
        exclude: ['sulfat'],
    },
    {
        id: 'nsaid', name: 'aspirin va yallig\'lanishga qarshi (NYaQV)',
        stems: ['aspirin', 'asetilsalisil', 'kardiomagnil', 'trombo', 'sitramon', 'ibuprofen', 'nurofen', 'ibuklin',
            'diklofenak', 'voltaren', 'ortofen', 'ketorolak', 'ketorol', 'ketanov', 'ketoprofen', 'naproksen',
            'nimesulid', 'nais', 'nimesil', 'meloksikam', 'movalis'],
        allergyWords: ['aspirin', 'npvs', 'nias', 'nsaid', 'diklofenak', 'ibuprofen'],
    },
    {
        id: 'metamizole', name: 'metamizol (analgin)',
        stems: ['metamisol', 'analgin', 'baralgin', 'pentalgin', 'tempalgin', 'spasmalgon'],
        allergyWords: ['analgin', 'metamisol', 'baralgin'],
    },
    {
        id: 'iodine', name: 'yod va kontrast moddalar',
        stems: ['iod', 'iodinol', 'povidon', 'betadin', 'liugol', 'iodomarin', 'omnipak', 'ultravist', 'visipak', 'iopamidol', 'ioheksol', 'iopromid'],
        allergyWords: ['iod', 'kontrast'],
    },
];

const startsWithAny = (w: string, list: string[]) => list.some(s => w.startsWith(normalizeDrugText(s)));

function groupsOfDrug(drug: string): Set<string> {
    const out = new Set<string>();
    for (const w of words(drug)) {
        for (const g of GROUPS) {
            if (g.exclude && startsWithAny(w, g.exclude)) continue;
            if (startsWithAny(w, g.stems)) out.add(g.id);
            else if (g.suffixes && w.length >= 7 && g.suffixes.some(sfx => w.endsWith(normalizeDrugText(sfx)))) out.add(g.id);
        }
    }
    return out;
}

function groupsOfAllergy(allergy: string): Set<string> {
    const out = groupsOfDrug(allergy);
    const ws = words(allergy);
    for (const g of GROUPS) {
        if (g.allergyWords && ws.some(w => startsWithAny(w, g.allergyWords!))) out.add(g.id);
    }
    /* «Antibiotik» — eng xavfli ehtimol: beta-laktamlar */
    if (ws.some(w => w.startsWith('antibiotik'))) { out.add('penicillin'); out.add('cephalosporin'); }
    return out;
}

/** Levenshtein, kichik so'zlar uchun yetarli */
function distance(a: string, b: string): number {
    if (a === b) return 0;
    const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
        let diag = prev[0];
        prev[0] = i;
        for (let j = 1; j <= b.length; j++) {
            const tmp = prev[j];
            prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
            diag = tmp;
        }
    }
    return prev[b.length];
}

/** 'exact' — o'sha so'z (yoki uning boshi); 'fuzzy' — 1–2 harf farq (xato yozilgan) */
function directMatch(drug: string, allergy: string): 'exact' | 'fuzzy' | null {
    const dw = words(drug);
    const aw = words(allergy);
    if (!dw.length || !aw.length) return null;
    const exact = aw.some(a => dw.some(d => d === a || (a.length >= 5 && (d.startsWith(a) || (a.startsWith(d) && d.length >= 5)))));
    if (exact) return 'exact';
    const fuzzy = aw.some(a => dw.some(d => a.length >= 6 && d.length >= 6 && distance(a, d) <= 2));
    return fuzzy ? 'fuzzy' : null;
}

const LEVEL_ORDER: Record<AllergyLevel, number> = { direct: 0, class: 1, related: 2 };

/**
 * Dori bemorning faol allergiyalaridan biriga mos keladimi.
 * Eng jiddiy moslik birinchi (to'g'ridan → guruh → qisman).
 */
export function checkDrugAllergy(drugName: string, allergies: AllergyLike[], activeIngredient?: string | null): AllergyHit[] {
    const drug = [drugName, activeIngredient].filter(Boolean).join(' ');
    if (!drug.trim()) return [];
    const drugGroups = groupsOfDrug(drug);
    const hits: AllergyHit[] = [];
    for (const a of allergies || []) {
        if (!a || a.isActive === false || !String(a.substance || '').trim()) continue;
        const severity = a.severity || 'Unknown';
        const direct = directMatch(drug, a.substance);
        if (direct === 'exact') { hits.push({ allergy: a.substance, severity, level: 'direct' }); continue; }
        const ag = groupsOfAllergy(a.substance);
        const same = GROUPS.find(g => ag.has(g.id) && drugGroups.has(g.id));
        if (same) { hits.push({ allergy: a.substance, severity, level: 'class', group: same.name }); continue; }
        /* Guruhga tushmagan, lekin 1–2 harf farq — ehtimol xato yozilgan o'sha modda */
        if (direct === 'fuzzy') { hits.push({ allergy: a.substance, severity, level: 'direct' }); continue; }
        const rel = GROUPS.find(g => drugGroups.has(g.id) && (g.related || []).some(r => ag.has(r)));
        if (rel) hits.push({ allergy: a.substance, severity, level: 'related', group: rel.name });
    }
    return hits.sort((x, y) => LEVEL_ORDER[x.level] - LEVEL_ORDER[y.level]);
}

/** Allergiya matni hech bir guruhga tushmadi — faqat to'g'ridan solishtiriladi */
export function isRecognizedAllergy(substance: string): boolean {
    return groupsOfAllergy(substance).size > 0;
}
