import React, { useEffect, useState } from 'react';

const pad2 = (n: number) => String(n).padStart(2, '0');

/**
 * Qancha vaqt o'tgani ("12:34", soatdan oshsa "1:02:10"). Soniya sayin faqat
 * o'zi yangilanadi — uni o'rab turgan katta ro'yxat har soniyada qayta chizilmaydi.
 */
export const LiveTimer: React.FC<{ since: number; className?: string }> = ({ since, className }) => {
    const [, tick] = useState(0);
    useEffect(() => {
        const id = setInterval(() => tick(x => x + 1), 1000);
        return () => clearInterval(id);
    }, []);
    const s = Math.max(0, Math.floor((Date.now() - since) / 1000));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return <span className={className}>{h > 0 ? `${h}:${pad2(m)}:${pad2(s % 60)}` : `${pad2(m)}:${pad2(s % 60)}`}</span>;
};
