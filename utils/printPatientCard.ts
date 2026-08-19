import { Patient, Clinic, Doctor, PatientDiagnosis, EncounterTemplate } from '../types';
import { todayISO } from './dateUtils';

/* ─────────────────────────────────────────────────────────────────────────────
   Bemor kartasi (vipiska) — chop etish uchun A4 blank.

   Ilgari bu sof stomatologik karta edi: FDI tish sxemasi, tishlar jadvali va
   "Схема зубов" bo'limi. Endi ko'p profilli: tish sxemasi o'rniga qabul bayoni
   (bo'lim shabloni bo'yicha to'ldirilgan maydonlar) chiqadi.
   ───────────────────────────────────────────────────────────────────────────── */

interface ProcedureInfo {
    serviceName: string;
    departmentName?: string;
}

interface EncounterInfo {
    data: Record<string, any>;
    template?: EncounterTemplate;
}

interface PrintCardParams {
    patient: Patient;
    clinic?: Clinic;
    doctor?: Doctor;
    encounter?: EncounterInfo;
    diagnoses: PatientDiagnosis[];
    procedures: ProcedureInfo[];
    complaints?: string;
    departmentName?: string;
}

const esc = (s: string | undefined | null): string =>
    String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

const fmtDate = (iso?: string): string => {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
};

const calcAge = (dob?: string): number | null => {
    if (!dob) return null;
    const d = new Date(dob);
    if (isNaN(d.getTime())) return null;
    const diff = Date.now() - d.getTime();
    return Math.floor(diff / (365.25 * 864e5));
};

/** Bayon maydonlarini guruhlab jadvalga chiqaradi — bo'sh maydonlar tushmaydi */
function encounterRows(encounter?: EncounterInfo): string {
    const fields = encounter?.template?.fields || [];
    const data = encounter?.data || {};
    const filled = fields.filter(f => {
        const v = data[f.key];
        return v !== undefined && v !== null && v !== '' && v !== false;
    });

    if (!filled.length) {
        return `<tr><td colspan="2" class="dcard-empty">Bayon to'ldirilmagan</td></tr>`;
    }

    return filled.map(f => {
        const raw = data[f.key];
        const val = typeof raw === 'boolean' ? 'Ha' : String(raw);
        return `<tr><td class="lbl">${esc(f.label)}</td><td>${esc(val)}${f.unit ? ' ' + esc(f.unit) : ''}</td></tr>`;
    }).join('');
}

export function printPatientCard({
    patient, clinic, doctor, encounter, diagnoses, procedures, complaints, departmentName,
}: PrintCardParams): void {
    const todayIso = todayISO();
    const age = calcAge(patient.dob);

    const activeDiagnoses = diagnoses
        .filter(d => d.status !== 'Resolved')
        .map(d => [d.code, d.icd10?.name].filter(Boolean).join(' — '))
        .join('; ');

    const treatment = procedures
        .slice(-8)
        .map(p => p.departmentName ? `${p.serviceName} (${p.departmentName})` : p.serviceName)
        .join('; ');

    const doctorName = doctor ? `${doctor.firstName} ${doctor.lastName}` : '';
    const contact = [patient.address, patient.phone].filter(Boolean).join(' / ');

    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Karta — ${esc(patient.lastName)} ${esc(patient.firstName)}</title>
<style>@page { size: A4; margin: 8mm; } body { background:#fff; margin:0; }
.dcard { font-family: 'Segoe UI', Arial, sans-serif; color: #000; background: #fff;
   width: 190mm; padding: 6mm 8mm; box-sizing: border-box; font-size: 10.5pt; line-height: 1.45; margin: 0 auto; }
.dcard * { box-sizing: border-box; }
.dcard-head { display: flex; align-items: flex-start; justify-content: space-between;
   border-bottom: 2px solid #000; padding-bottom: 3mm; margin-bottom: 4mm; }
.dcard-title { font-size: 15pt; font-weight: 800; text-transform: uppercase; letter-spacing: .4px; margin: 0; }
.dcard-sub { font-size: 9pt; color: #444; margin: 1mm 0 0; }
.dcard-clinic { font-size: 9.5pt; font-weight: 700; text-align: right; white-space: nowrap; }
.dcard-clinic span { display: block; font-weight: 400; color: #444; font-size: 8.5pt; }
.dcard-row { margin-bottom: 2.2mm; }
.dcard-lbl { font-weight: 700; }
.dcard-val { border-bottom: 1px solid #000; display: inline-block; min-width: 30mm; padding: 0 1.5mm; }
.dcard-val.wide { display: block; min-height: 5.2mm; }
.dcard-cols { display: flex; gap: 5mm; margin: 3mm 0; align-items: flex-start; }
.dcard-col { flex: 1; min-width: 0; }
.dcard-sect { font-weight: 700; margin-bottom: 1.5mm; }
.dcard-box { border: 1px solid #000; min-height: 18mm; padding: 1.5mm 2mm; white-space: pre-wrap; word-break: break-word; }
.dcard-table { width: 100%; border-collapse: collapse; margin-top: 1.5mm; }
.dcard-table th, .dcard-table td { border: 1px solid #000; padding: 1.2mm 2mm; font-size: 9.5pt; text-align: left; vertical-align: top; }
.dcard-table th { background: #f0f0f0; font-weight: 700; }
.dcard-table td.lbl { width: 55mm; font-weight: 600; }
.dcard-foot { display: flex; justify-content: space-between; gap: 8mm; margin-top: 5mm; padding-top: 3mm; border-top: 1px solid #000; }
.dcard-sign { flex: 1; }
.dcard-sign .line { border-bottom: 1px solid #000; height: 7mm; margin-top: 1mm; }
.dcard-sign .cap { font-size: 8pt; color: #444; margin-top: 1mm; }
.dcard-empty { color: #666; }
</style></head><body>
<div class="dcard">
 <div class="dcard-head">
  <div><h1 class="dcard-title">Bemor kartasi</h1>
   <p class="dcard-sub">Qabul vipiskasi${departmentName ? ' — ' + esc(departmentName) : ''}</p></div>
  <div class="dcard-clinic">${esc(clinic?.name) || 'Klinika'}<span>${esc(clinic?.phone)}</span></div>
 </div>
 <div class="dcard-row"><span class="dcard-lbl">1. F.I.Sh:</span> <span class="dcard-val" style="min-width:110mm">${esc(patient.lastName)} ${esc(patient.firstName)}</span></div>
 <div class="dcard-row"><span class="dcard-lbl">2. Tug'ilgan sana:</span> <span class="dcard-val">${fmtDate(patient.dob) || '&nbsp;'}</span> <span class="dcard-lbl">Yosh:</span> <span class="dcard-val" style="min-width:18mm">${age ?? '&nbsp;'}</span></div>
 <div class="dcard-row"><span class="dcard-lbl">3. Manzil / Telefon:</span> <span class="dcard-val" style="min-width:105mm">${esc(contact) || '&nbsp;'}</span></div>
 <div class="dcard-row"><span class="dcard-lbl">4. Qabul sanasi:</span> <span class="dcard-val">${fmtDate(todayIso)}</span></div>
 <div class="dcard-row"><span class="dcard-lbl">5. Shikoyatlar:</span><span class="dcard-val wide">${esc(complaints) || '&nbsp;'}</span></div>
 <div class="dcard-row"><span class="dcard-lbl">6. Anamnez:</span><span class="dcard-val wide">${esc(patient.medicalHistory) || '&nbsp;'}</span></div>

 <div class="dcard-sect">7. Qabul bayoni${encounter?.template ? ' — ' + esc(encounter.template.name) : ''}</div>
 <table class="dcard-table"><thead><tr><th style="width:55mm">Ko'rsatkich</th><th>Qiymat</th></tr></thead>
 <tbody>${encounterRows(encounter)}</tbody></table>

 <div class="dcard-cols">
  <div class="dcard-col"><div class="dcard-sect">8. Tashxis</div>
   <div class="dcard-box">${esc(activeDiagnoses)}</div></div>
  <div class="dcard-col"><div class="dcard-sect">9. Tayinlangan davolash</div>
   <div class="dcard-box">${esc(treatment)}</div></div>
 </div>

 <div class="dcard-foot">
  <div class="dcard-sign"><span class="dcard-lbl">Shifokor: ${esc(doctorName)}</span><div class="line"></div><div class="cap">Imzo</div></div>
  <div class="dcard-sign" style="max-width:55mm"><span class="dcard-lbl">Sana: ${fmtDate(todayIso)}</span><div class="line"></div><div class="cap">Bemor imzosi</div></div>
 </div>
</div>
<script>window.onload = function() { window.print(); };</script>
</body></html>`;

    const win = window.open('', '_blank', 'width=900,height=1100');
    if (!win) {
        alert("Chop etish oynasi ochilmadi. Brauzerda pop-up bloklangan bo'lishi mumkin.");
        return;
    }
    win.document.open();
    win.document.write(html);
    win.document.close();
}
