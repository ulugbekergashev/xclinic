import React, { useRef } from 'react';
import { formatMoney } from '../utils/format';
import { Transaction, Clinic } from '../types';
import { Modal, Button } from './Common';
import { getPaymentMethodLabel } from '../utils/paymentMethods';
import { Printer } from 'lucide-react';
import { esc, fmtDate, fmtDateTime, resolvePrintClinic } from '../utils/printDocument';

import { useLanguage } from '../context/LanguageContext';
interface ReceiptModalProps {
   isOpen: boolean;
   onClose: () => void;
   transaction: Transaction | null;
   clinic: Clinic | undefined;
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({ isOpen, onClose, transaction, clinic }) => {
    const { t } = useLanguage();
   const printRef = useRef<HTMLDivElement>(null);

   const handlePrint = () => {
      const printContents = printRef.current?.innerHTML;
      if (!printContents) return;
      
      const printWindow = window.open('', '', 'width=350,height=600');
      if (!printWindow) return;
      /* Chek tanasi React chizgan DOM (u matnni o'zi qochiradi), sarlavha esa
         satr — klinika nomi `esc()` dan o'tadi. */

      printWindow.document.write(`
         <html>
            <head>
               <title>${esc(`${t('finance.cash.receipt')} - ${resolvePrintClinic(clinic)?.name || 'XClinic'}`)}</title>
               <style>
                  @page { margin: 0; }
                  body {
                     font-family: monospace;
                     font-size: 14px;
                     margin: 0;
                     padding: 10px;
                     width: 58mm; /* Standard POS printer size */
                     color: #000;
                  }
                  .text-center { text-align: center; }
                  .font-bold { font-weight: bold; }
                  .text-xl { font-size: 18px; }
                  .text-sm { font-size: 16px; }
                  .text-xs { font-size: 12px; }
                  .my-2 { margin-top: 8px; margin-bottom: 8px; }
                  .mt-1 { margin-top: 4px; }
                  .mt-2 { margin-top: 8px; }
                  .mt-4 { margin-top: 16px; }
                  .mb-1 { margin-bottom: 4px; }
                  .mb-2 { margin-bottom: 8px; }
                  .border-t { border-top: 1px dashed #000; }
                  .py-2 { padding-top: 8px; padding-bottom: 8px; }
                  .flex { display: flex; }
                  .justify-between { justify-content: space-between; }
               </style>
            </head>
            <body>
               ${printContents}
            </body>
         </html>
      `);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => {
         printWindow.print();
         printWindow.close();
      }, 250);
   };

   if (!transaction) return null;

   /* Chek nomi — klinikaning o'zi, hech qachon mutaxassislik emas */
   const printClinic = resolvePrintClinic(clinic);
   const clinicName = printClinic?.name || 'XClinic';
   // Aniq vaqt bo'lsa sana+soat, eski yozuvda faqat sana — ikkalasi dd.mm.yyyy
   const paidAt = transaction.createdAt ? fmtDateTime(transaction.createdAt) : fmtDate(transaction.date);
   /* Alohida chek raqami yo'q — id ning oxirgi 6 belgisi («demo-tx-…» dan
      «DEMO-T» chiqardi) */
   const receiptNo = String(transaction.id).replace(/[^a-z0-9]/gi, '').slice(-6).toUpperCase();

   return (
      <Modal isOpen={isOpen} onClose={onClose} title={t('receiptmodal.tolov_cheki')}>
         <div className="flex flex-col items-center">
            {/* Preview Block for Modal UI using Tailwind */}
            <div className="w-[320px] border border-gray-200 shadow-sm p-4 rounded bg-white text-gray-900 font-mono text-sm max-h-[60vh] overflow-y-auto no-scrollbar">
               <div ref={printRef}>
                  <div className="text-center font-bold text-xl mb-2">{clinicName}</div>
                  {printClinic?.phone && <div className="text-center mb-1 text-xs">Tel: {printClinic.phone}</div>}
                  {printClinic?.address && <div className="text-center mb-2 text-xs">{printClinic.address}</div>}

                  <div className="border-t my-2 py-2">
                     <div className="flex justify-between mb-1">
                        <span>{t('ui.sana')}:</span>
                        <span>{paidAt}</span>
                     </div>
                     <div className="flex justify-between mb-1">
                        <span>{t('receiptmodal.chek_raqami')}:</span>
                        <span>№ {receiptNo}</span>
                     </div>
                     <div className="flex justify-between mb-1">
                        <span>{t('receiptmodal.bemor')}</span>
                        <span>{transaction.patientName}</span>
                     </div>
                     {transaction.doctorName && (
                        <div className="flex justify-between mb-1">
                           <span>{t('ui.shifokor')}</span>
                           <span>{transaction.doctorName}</span>
                        </div>
                     )}
                  </div>

                  <div className="border-t my-2 py-2">
                     <div className="font-bold mb-1">{t('receiptmodal.xizmat')}</div>
                     <div className="flex justify-between mb-1">
                        <span style={{ maxWidth: '60%' }}>{transaction.service || t('receiptmodal.davolash')}</span>
                        <span>{formatMoney(transaction.amount)} UZS</span>
                     </div>
                  </div>

                  <div className="border-t my-2 py-2">
                     <div className="flex justify-between font-bold text-sm">
                        <span>{t('receiptmodal.jami_tolov')}</span>
                        <span>{formatMoney(transaction.amount)} UZS</span>
                     </div>
                     <div className="flex justify-between mt-1 text-xs">
                        <span>{t('receiptmodal.tolov_usuli')}</span>
                        <span>{getPaymentMethodLabel(transaction.type)}</span>
                     </div>
                  </div>

                  <div className="text-center mt-4 mb-2">
                     {clinic?.botToken && (
                        <div className="mt-2 text-xs select-none">
                           <p>{t('receiptmodal.klinikamiz_botiga_obuna_boling')}</p>
                        </div>
                     )}
                     <div className="mt-4 font-bold text-xs">{t('receiptmodal.thanks')}</div>
                  </div>
               </div>
            </div>

            <Button onClick={handlePrint} className="w-full mt-4 flex justify-center items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white shadow-lg">
               <Printer className="w-4 h-4" /> {t('receiptmodal.pos_printerda_chiqarish')}
            </Button>
         </div>
      </Modal>
   );
};
