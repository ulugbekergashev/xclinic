/* YOZUV TAFSILOTLARI — kalendarda blok bosilganda ochiladi.

   «KELDI» — asosiy tugma, eng tepada va to'liq kenglikda: bu oyna
   ochilishining 9 ta sababidan 8 tasi shu. Ilgari u beshta teng
   tugmaning oxirgisi edi va «Kelmadi» bilan yonma-yon turardi. */
import React from 'react';
import { Bell, CheckCircle, Clock, Edit2, FileText, Loader2, Send, User, XCircle } from 'lucide-react';
import type { Appointment } from '../../types';
import { Badge, Button, Modal } from '../Common';
import { confirmAction } from '../../services/confirm';
import { useLanguage } from '../../context/LanguageContext';

interface AppointmentDetailsModalProps {
    appt: Appointment;
    arriving: boolean;
    reminding: boolean;
    canDelete: boolean;
    onClose: () => void;
    onOpenPatient?: (patientId: string) => void;
    onEdit: (appt: Appointment) => void;
    onArrived: (appt: Appointment) => void;
    onRemind: (appt: Appointment) => void;
    onMessage: (appt: Appointment) => void;
    onStatus: (status: Appointment['status']) => void;
    onDelete: (id: string) => Promise<void> | void;
}

const secondaryBtn = 'inline-flex items-center justify-center gap-2 h-10 px-3 rounded-xl border border-line bg-surface text-[13px] font-medium text-muted hover:text-ink hover:bg-elevated transition-colors disabled:opacity-50';

export function AppointmentDetailsModal({
    appt, arriving, reminding, canDelete, onClose, onOpenPatient, onEdit,
    onArrived, onRemind, onMessage, onStatus, onDelete,
}: AppointmentDetailsModalProps) {
    const { t } = useLanguage();
    const open = appt.status === 'Pending' || appt.status === 'Confirmed' || appt.status === 'Checked-In';

    const handleCancel = async () => {
        if (await confirmAction({
            title: t('calendar.yozuv_bekor_qilinsinmi'),
            body: t('calendar.yozuv_tarixda_qoladi_ochirilmaydi'),
            confirmLabel: t('ui.bekor_qilish'),
        })) onStatus('Cancelled');
    };

    const handleDelete = async () => {
        if (!(await confirmAction({ title: t('calendar.haqiqatan_ham_bu_qabulni'), danger: true, confirmLabel: t('ui.ochirish_2') }))) return;
        try {
            await onDelete(appt.id);
            onClose();
        } catch {
            /* Xato xabarini `App.tsx` toast ko'rsatadi. Oyna ATAYLAB ochiq
               qoladi: o'chirilmagan yozuv oynasini yopish «bajarildi»
               degan taassurot beradi. */
        }
    };

    return (
        <Modal isOpen onClose={onClose} title={t('calendar.appointmentDetails')}>
            <div className="space-y-5">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <h2
                            className={`text-xl font-bold text-ink ${onOpenPatient ? 'cursor-pointer hover:text-primary-600 hover:underline transition-colors' : ''}`}
                            onClick={() => { if (onOpenPatient) { onOpenPatient(appt.patientId); onClose(); } }}
                            title={onOpenPatient ? t('calendar.bemor_profiliga_otish') : ''}
                        >
                            {appt.patientName}
                        </h2>
                        <p className="text-muted text-sm">{appt.type}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <button onClick={() => onEdit(appt)} title={t('calendar.qabulni_tahrirlash')} aria-label={t('calendar.qabulni_tahrirlash')}
                            className="p-1.5 text-muted hover:text-primary-600 hover:bg-elevated rounded-lg transition-colors">
                            <Edit2 className="w-5 h-5" />
                        </button>
                        <Badge status={appt.status} />
                    </div>
                </div>

                <div className="space-y-2.5 text-sm">
                    <div className="flex items-center gap-3 text-muted">
                        <Clock className="w-4.5 h-4.5 text-faint" />
                        <span className="tabular-nums">{appt.date}, {appt.time} ({appt.duration} {t('common.min')})</span>
                    </div>
                    <div className="flex items-center gap-3 text-muted">
                        <User className="w-4.5 h-4.5 text-faint" />
                        <span>{appt.doctorName}</span>
                    </div>
                    {appt.notes && (
                        <div className="flex items-start gap-3 text-muted">
                            <FileText className="w-4.5 h-4.5 text-faint mt-0.5" />
                            <p className="bg-elevated p-3 rounded-lg border border-line-soft w-full">{appt.notes}</p>
                        </div>
                    )}
                </div>

                <div className="border-t border-line pt-5">
                    {open ? (
                        <div className="space-y-2">
                            {/* «Keldi» — qabul ochiladi va bemor kartasiga o'tiladi.
                                «Yakunlash» bu yerda ATAYLAB yo'q: u qabulsiz «qabul
                                qilindi» degan yolg'on holat yasardi. */}
                            <button onClick={() => onArrived(appt)} disabled={arriving}
                                className="w-full inline-flex items-center justify-center gap-2 h-11 rounded-xl bg-success-600 hover:bg-success-700 text-white text-sm font-semibold transition-colors disabled:opacity-50">
                                {arriving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                                {t('calendar.arrived')}
                            </button>
                            <div className="grid grid-cols-2 gap-2">
                                <button onClick={() => onRemind(appt)} disabled={reminding}
                                    className={`${secondaryBtn} ${appt.reminderSent ? 'text-success border-success-500/30 bg-success-500/10' : ''}`}>
                                    {reminding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bell className="w-4 h-4" />}
                                    {appt.reminderSent ? t('calendar.eslatma_yuborilgan') : t('calendar.reminder')}
                                </button>
                                <button onClick={() => onMessage(appt)} className={secondaryBtn}>
                                    <Send className="w-4 h-4" />
                                    {t('calendar.sendMessage')}
                                </button>
                                <button onClick={() => onStatus('No-Show')} className={secondaryBtn}>
                                    <XCircle className="w-4 h-4 text-danger" />
                                    {t('calendar.noShow')}
                                </button>
                                {/* BEKOR QILISH — yozuv `Cancelled` bo'lib tarixda qoladi.
                                    Ilgari bu tugma yo'q edi: yo yolg'on «Kelmadi», yo
                                    tarixni o'chiradigan «O'chirish» qolardi. */}
                                <button onClick={handleCancel} className={secondaryBtn}>
                                    <XCircle className="w-4 h-4 text-faint" />
                                    {t('common.cancel')}
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="flex gap-2 justify-end">
                            <Button variant="secondary" onClick={onClose}>{t('common.close')}</Button>
                            {canDelete && (
                                <Button variant="ghost" className="text-danger hover:text-danger" onClick={handleDelete}>
                                    {t('common.delete')}
                                </Button>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </Modal>
    );
}
