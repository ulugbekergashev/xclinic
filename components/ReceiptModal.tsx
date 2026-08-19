import React, { useRef } from 'react';
import { Transaction, Clinic } from '../types';
import { Modal, Button } from './Common';
import { getPaymentMethodLabel } from '../utils/paymentMethods';
import { Printer } from 'lucide-react';

interface ReceiptModalProps {
   isOpen: boolean;
   onClose: () => void;
   transaction: Transaction | null;
   clinic: Clinic | undefined;
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({ isOpen, onClose, transaction, clinic }) => {
   const printRef = useRef<HTMLDivElement>(null);

   const handlePrint = () => {
      const printContents = printRef.current?.innerHTML;
      if (!printContents) return;
      
      const printWindow = window.open('', '', 'width=350,height=600');
      if (!printWindow) return;

      printWindow.document.write(`
         <html>
            <head>
               <title>Chek - ${clinic?.name || 'Klinika'}</title>
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

   return (
      <Modal isOpen={isOpen} onClose={onClose} title="To'lov Cheki">
         <div className="flex flex-col items-center">
            {/* Preview Block for Modal UI using Tailwind */}
            <div className="w-[320px] border border-gray-200 shadow-sm p-4 rounded bg-white text-gray-900 font-mono text-sm max-h-[60vh] overflow-y-auto no-scrollbar">
               <div ref={printRef}>
                  <div className="text-center font-bold text-xl mb-2">{clinic?.name || 'Stomatologiya'}</div>
                  {clinic?.phone && <div className="text-center mb-1 text-xs">Tel: {clinic.phone}</div>}
                  {clinic?.address && <div className="text-center mb-2 text-xs">{clinic.address}</div>}
                  
                  <div className="border-t my-2 py-2">
                     <div className="flex justify-between mb-1">
                        <span>Sana:</span>
                        <span>{transaction.date}</span>
                     </div>
                     <div className="flex justify-between mb-1">
                        <span>Chek raqami:</span>
                        <span>#{transaction.id.slice(0, 6).toUpperCase()}</span>
                     </div>
                     <div className="flex justify-between mb-1">
                        <span>Bemor:</span>
                        <span>{transaction.patientName}</span>
                     </div>
                     {transaction.doctorName && (
                        <div className="flex justify-between mb-1">
                           <span>Shifokor:</span>
                           <span>{transaction.doctorName}</span>
                        </div>
                     )}
                  </div>

                  <div className="border-t my-2 py-2">
                     <div className="font-bold mb-1">Xizmat:</div>
                     <div className="flex justify-between mb-1">
                        <span style={{ maxWidth: '60%' }}>{transaction.service || 'Davolash'}</span>
                        <span>{transaction.amount.toLocaleString()} UZS</span>
                     </div>
                  </div>

                  <div className="border-t my-2 py-2">
                     <div className="flex justify-between font-bold text-sm">
                        <span>JAMI TO'LOV:</span>
                        <span>{transaction.amount.toLocaleString()} UZS</span>
                     </div>
                     <div className="flex justify-between mt-1 text-xs">
                        <span>To'lov usuli:</span>
                        <span>{getPaymentMethodLabel(transaction.type)}</span>
                     </div>
                  </div>

                  <div className="text-center mt-4 mb-2">
                     {clinic?.botToken && (
                        <div className="mt-2 text-xs select-none">
                           <p>Klinikamiz botiga obuna bo'ling!</p>
                        </div>
                     )}
                     <div className="mt-4 font-bold text-xs">Xizmatingizdan mamunmiz!</div>
                  </div>
               </div>
            </div>

            <Button onClick={handlePrint} className="w-full mt-4 flex justify-center items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white shadow-lg">
               <Printer className="w-4 h-4" /> POS Printerda chiqarish
            </Button>
         </div>
      </Modal>
   );
};
