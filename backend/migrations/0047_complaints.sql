-- Shikoyat va fikrlar (2026-11-26).
--
-- Baho (yulduz) — avvalgidek `Review` da, yagona joy. Shikoyat — alohida
-- ISH: kim mas'ul, hal qilindimi, qanday hal qilindi. Bot 1–3 yulduz bahosi
-- avtomatik shikoyat ochadi (`reviewId` orqali yulduzlar o'qiladi, nusxa
-- olinmaydi); registrator bemor kartasidan o'zi yozadi.
--
-- Nega `Review` kengaytirilmadi: unda `appointmentId` NOT NULL va UNIQUE —
-- yozuvsiz kelgan bemorning shikoyatini u yerga qo'yib bo'lmaydi, SQLite esa
-- ustunni jadvalni qayta qurmasdan nullable qila olmaydi.
--
-- `complaintAlert` — past baho kelganda egaga Telegram xabar; dastlab o'chiq.
CREATE TABLE "Complaint" (
    "id"             TEXT NOT NULL PRIMARY KEY,
    "clinicId"       TEXT NOT NULL REFERENCES "Clinic"("id"),
    "patientId"      TEXT NOT NULL REFERENCES "Patient"("id"),
    "reviewId"       TEXT REFERENCES "Review"("id") ON DELETE SET NULL,
    "appointmentId"  TEXT,
    "visitId"        TEXT,
    "doctorId"       TEXT,
    "doctorName"     TEXT,
    "source"         TEXT NOT NULL DEFAULT 'bot',
    "text"           TEXT,
    "status"         TEXT NOT NULL DEFAULT 'open',
    "assigneeKey"    TEXT,
    "assigneeName"   TEXT,
    "resolution"     TEXT,
    "resolvedAt"     DATETIME,
    "resolvedByName" TEXT,
    "createdByName"  TEXT,
    "createdAt"      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "Complaint_reviewId_key" ON "Complaint"("reviewId");
CREATE INDEX "Complaint_clinicId_status_idx" ON "Complaint"("clinicId", "status");
CREATE INDEX "Complaint_patientId_idx" ON "Complaint"("patientId");
ALTER TABLE "Clinic" ADD COLUMN "complaintAlert" BOOLEAN NOT NULL DEFAULT 0;
