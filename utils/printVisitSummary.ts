/* ─────────────────────────────────────────────────────────────────────────────
   QABUL XULOSASI — bemor qo'liga beriladigan bitta varaq (2026-11-22).

   Ilgari qabul yakunlangach bemorga beradigan qog'oz yo'q edi: retsept
   alohida, tashxis esa faqat kartada qolardi. Bu varaqda bir qabulning
   hammasi: shikoyat, ko'rik, tashxis, buyurilgan tahlil va tekshiruvlar,
   qilingan xizmatlar va dorilar. Varaq O'ZI chiqmaydi — shifokor bosadi.
   ───────────────────────────────────────────────────────────────────────────── */

import { EncounterTemplate, MODALITY_LABELS, Patient, Visit } from '../types';
import {
    printDocument, clinicHeader, signatureBlock, letterheadFooter, esc, fmtDate, PrintClinic,
} from './printDocument';

const genderLabel = (g?: string | null) => (g === 'Male' ? 'Erkak' : g === 'Female' ? 'Ayol' : '—');

/** Ko'rik maydonlari: faqat to'ldirilgani, «Belgi: qiymat birlik» */
function examLines(raw: string | null | undefined, template?: EncounterTemplate): string[] {
    if (!raw) return [];
    let data: Record<string, unknown> = {};
    try { data = JSON.parse(raw) || {}; } catch { return []; }
    const fields = template?.fields || [];
    const filled = (v: unknown) => v !== undefined && v !== null && v !== '' && v !== false;
    if (!fields.length) {
        return Object.entries(data).filter(([, v]) => filled(v)).map(([k, v]) => `${k}: ${String(v)}`);
    }
    return fields
        .filter(f => filled(data[f.key]))
        .map(f => {
            const v = data[f.key];
            const val = typeof v === 'boolean' ? 'Ha' : String(v);
            return `${f.label}: ${val}${f.unit ? ` ${f.unit}` : ''}`;
        });
}

const list = (title: string, rows: string[]): string => (rows.length
    ? `<div class="box"><div class="box-title">${esc(title)}</div>${rows.map(r => `<div>${esc(r)}</div>`).join('')}</div>`
    : '');

export function printVisitSummary(
    visit: Visit, patient: Patient, opts: { clinic?: PrintClinic | null; template?: EncounterTemplate; departmentName?: string } = {},
): boolean {
    const diagnoses = [...new Map((visit.diagnoses || [])
        .map(d => [d.code, `${d.code}${d.icd10?.name ? ` — ${d.icd10.name}` : ''}${d.isChronic ? ' (surunkali)' : ''}`] as const)).values()];
    const labs = (visit.labOrders || []).filter(o => o.status !== 'Cancelled')
        .map(o => (o.items || []).map(i => i.testName).filter(Boolean).join(', '))
        .filter(Boolean);
    const studies = (visit.studies || []).filter(s => s.status !== 'Cancelled')
        .map(s => {
            const kind = MODALITY_LABELS[s.modality] || s.modality;
            const name = s.name.toLowerCase().includes(String(kind).toLowerCase()) ? s.name : `${kind} — ${s.name}`;
            return s.conclusion ? `${name}: ${s.conclusion}` : name;
        });
    const services = (visit.procedures || []).map(p => p.procedureName).filter(Boolean);
    const meds = (visit.prescriptions || []).flatMap(rx => (rx.items || []).map(i =>
        [i.name, i.dosage, i.frequency, i.durationDays ? `${i.durationDays} kun` : ''].filter(Boolean).join(' · ')));
    const exam = examLines(visit.examData, opts.template);

    const rows: [string, string][] = [
        ['Bemor', `${patient.lastName || ''} ${patient.firstName || ''}`.trim() || '—'],
        ['Tug\'ilgan sana', fmtDate(patient.dob)],
        ['Jinsi', genderLabel(patient.gender)],
        ...(opts.departmentName ? [['Bo\'lim', opts.departmentName] as [string, string]] : []),
        ...(visit.doctorName ? [['Shifokor', visit.doctorName] as [string, string]] : []),
    ];

    const body = `
    ${clinicHeader(opts.clinic)}
    <div class="title">Qabul xulosasi</div>
    <div class="subtitle">${esc(fmtDate(visit.date))}</div>
    <table class="rows">${rows.map(([k, v]) => `<tr><td class="k">${esc(k)}:</td><td>${esc(v)}</td></tr>`).join('')}</table>
    ${visit.complaints ? `<div class="box"><div class="box-title">Shikoyat</div>${esc(visit.complaints)}</div>` : ''}
    ${list('Ko\'rik', exam)}
    ${list('Tashxis', diagnoses)}
    ${visit.treatmentPlan ? `<div class="box"><div class="box-title">Xulosa va tavsiyalar</div><div style="white-space:pre-wrap">${esc(visit.treatmentPlan)}</div></div>` : ''}
    ${list('Tahlillar', labs)}
    ${list('Tekshiruvlar', studies)}
    ${list('Qilingan muolajalar', services)}
    ${list('Dorilar', meds)}
    ${signatureBlock('Shifokor', visit.doctorName)}
    ${letterheadFooter(opts.clinic)}`;

    return printDocument('Qabul xulosasi', body);
}
