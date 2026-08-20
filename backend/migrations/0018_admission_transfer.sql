-- Bo'lim va palata almashinuvi — TARIXI bor voqea.
--
-- Nima uchun. Hozir koyka almashtirilganda `Admission.bedId` shunchaki
-- ustiga yozib yuboriladi (backend/multiprofile.ts, koyka biriktirish) va
-- bemor qayerda yotgani tarixi butunlay yo'qoladi (B52). Statsionarda bu
-- savol muhim: "reanimatsiyada qancha yotdi, palataga qachon o'tdi".
--
-- Bo'lim ham, koyka ham NULL bo'lishi mumkin: faqat koyka o'zgarishi
-- (bir palata ichida) yoki faqat bo'lim o'zgarishi (koyka hali
-- tanlanmagan) — ikkisi ham haqiqiy holat.

CREATE TABLE "AdmissionTransfer" (
    "id"                 TEXT PRIMARY KEY NOT NULL,
    "admissionId"        TEXT NOT NULL REFERENCES "Admission"("id"),
    "fromBedId"          TEXT REFERENCES "Bed"("id"),
    "toBedId"            TEXT REFERENCES "Bed"("id"),
    "fromDepartmentId"   TEXT REFERENCES "Department"("id"),
    "toDepartmentId"     TEXT REFERENCES "Department"("id"),
    "movedAt"            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "movedByName"        TEXT,
    "reason"             TEXT
);

CREATE INDEX "AdmissionTransfer_admissionId_movedAt_idx"
    ON "AdmissionTransfer"("admissionId", "movedAt");
