import React, { useState, useEffect } from 'react';
import {
    ComposedChart, Area, Line, BarChart, Bar, XAxis, YAxis,
    CartesianGrid, Tooltip, ResponsiveContainer, Cell, Legend,
} from 'recharts';
import { formatNumber } from '../utils/format';
import { doctorColor } from '../utils/chartColors';
import { api } from '../services/api';

/* ─────────────────────────────────────────────────────────────────────
   DAVOMAT HISOBOTI.

   «Qaysi kunlarda mijoz yaxshi kelyapti?» — klinika egasining jadval
   tuzishdagi asosiy savoli. Kam keladigan kunga ko'p shifokor qo'yish
   ham, gavjum kunga kam qo'yish ham zarar.

   Hisobot kalendarning ichida turadi (uchinchi ko'rinish), chunki savol
   aynan shu ekranga qarab tug'iladi.
   Grafiklar `recharts` da — loyihada allaqachon shu ishlatiladi
   (Boshqaruv paneli, Shifokorlar tahlili, Moliya hisoboti), ya'ni
   yangi kutubxona qo'shilmadi va uslub bir xil bo'lib qoldi.
   ───────────────────────────────────────────────────────────────── */
const StatTile: React.FC<{ label: string; value: string; hint?: string; tone?: 'ok' | 'warn' | 'plain' }> =
  ({ label, value, hint, tone = 'plain' }) => (
    <div className="bg-surface rounded-xl border border-line p-4">
      <div className="text-xs text-muted">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${
        tone === 'ok' ? 'text-emerald-600 dark:text-emerald-400'
        : tone === 'warn' ? 'text-amber-600 dark:text-amber-400'
        : 'text-ink'}`}>{value}</div>
      {hint && <div className="text-xs text-faint mt-0.5">{hint}</div>}
    </div>
  );

/* Grafiklar `recharts` da — loyihada allaqachon shu ishlatiladi
   (Boshqaruv paneli, Shifokorlar tahlili, Moliya hisoboti). Yangi
   kutubxona qo'shish kerak emas va uslub bir xil bo'lib qoladi. */
const AXIS = '#9ca3af';
const GRID = '#374151';

/* Grafik ustidagi izoh oynasi. Recharts ning o'zinikisi oq fonli va
   to'q mavzuda o'qilmaydi, shuning uchun o'zimizniki. */
const ChartTip: React.FC<any> = ({ active, payload, label, suffix }) => {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 shadow-lg text-xs">
      <div className="font-semibold text-ink mb-1">{label}</div>
      {payload.map((x: any) => (
        <div key={x.dataKey} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: x.color || x.fill }} />
          <span className="text-muted">{x.name}:</span>
          <span className="font-medium text-ink tabular-nums">
            {formatNumber(x.value)}{suffix || ''}
          </span>
        </div>
      ))}
    </div>
  );
};

const AttendanceReport: React.FC<{
  data: any; busy: boolean; days: number; onDays: (d: number) => void; error: string | null;
}> = ({ data, busy, days, onDays, error }) => {
  if (busy && !data) {
    return <div className="flex-1 grid place-items-center text-faint py-20">Hisobot yig'ilmoqda…</div>;
  }
  if (!data) {
    /* Sabab KO'RSATILADI. Ilgari bu yerda quruq «yuklab bo'lmadi»
       turardi va nima bo'lganini bilishning iloji yo'q edi — server
       eskimi, tarmoqmi, ruxsatmi, hech narsa aytilmasdi. */
    return (
      <div className="flex-1 grid place-items-center py-20 px-4">
        <div className="text-center max-w-md">
          <div className="text-muted mb-2">Hisobotni yuklab bo'lmadi.</div>
          {error && (
            <div className="text-xs font-mono text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2 mb-2">
              {error}
            </div>
          )}
          <div className="text-xs text-faint">
            Agar «404» yozilgan bo'lsa — server eski versiyada ishlayapti, uni qayta ishga tushirish kerak.
          </div>
        </div>
      </div>
    );
  }

  const t = data.totals || {};
  const wd = data.byWeekday || [];
  const docs = data.byDoctor || [];

  /* Kunlik qator. Sana «24.08» ko'rinishida — grafik o'qi ostida
     to'liq sana sig'maydi. */
  const daily = (data.byDay || []).map((d: any) => ({
    ...d,
    label: d.date.slice(8, 10) + '.' + d.date.slice(5, 7),
    revenueK: Math.round((d.revenue || 0) / 1000),
  }));

  const hours = (data.byHour || []).filter((h: any) => h.booked > 0)
    .map((h: any) => ({ ...h, label: h.hour + ':00', kelmagan: Math.max(0, h.booked - h.arrived) }));

  const wdChart = wd.map((w: any) => ({ ...w, short: w.name.slice(0, 3) }));
  const maxWd = Math.max(1, ...wd.map((w: any) => w.avgVisits || 0));

  return (
    <div className="flex-1 overflow-auto space-y-4 pb-4">

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted">Davr:</span>
        {[30, 90, 365].map(d => (
          <button key={d} type="button" onClick={() => onDays(d)}
            className={`px-3 py-1 text-xs font-medium rounded-full border transition-colors ${
              days === d
                ? 'border-primary-600 bg-primary-600 text-white'
                : 'border-line text-muted hover:bg-elevated'}`}>
            {d === 365 ? '1 yil' : `${d} kun`}
          </button>
        ))}
        <span className="text-xs text-faint ml-1">
          {data.range?.from} — {data.range?.to} · {data.range?.days} kunda yozuv bor
        </span>
        {busy && <span className="text-xs text-faint">yangilanmoqda…</span>}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <StatTile label="Yozilgan" value={formatNumber(t.booked)} hint="kalendardagi yozuvlar" />
        <StatTile label="Kelgan" value={formatNumber(t.arrived)} tone="ok" hint={`${t.arrivalRate}%`} />
        <StatTile label="Kelmagan" value={formatNumber(t.noShow)} tone={t.noShowRate > 15 ? 'warn' : 'plain'}
                  hint={`${t.noShowRate}% — ogohlantirmasdan`} />
        <StatTile label="Bekor qilingan" value={formatNumber(t.cancelled)} hint="oldindan aytgan" />
        <StatTile label="Tushum" value={formatNumber(t.revenue)} hint="so'm, shu davrda" />
      </div>

      {data.best && data.worst && data.best.name !== data.worst.name && (
        <div className="rounded-xl border border-line bg-surface p-4">
          <div className="text-sm text-muted">
            Eng gavjum kun — <b className="text-emerald-600 dark:text-emerald-400">{data.best.name}</b>,
            kuniga o'rtacha <b>{data.best.avgVisits}</b> ta qabul.
            Eng bo'shi — <b className="text-amber-600 dark:text-amber-400">{data.worst.name}</b>,
            <b> {data.worst.avgVisits}</b> ta.
            {data.worst.avgVisits > 0 && (
              <> Farqi <b>{Math.round((data.best.avgVisits / data.worst.avgVisits) * 10) / 10} barobar</b>.</>
            )}
          </div>
          <div className="text-xs text-faint mt-1">
            Shifokorlar jadvalini shu nisbatga qarab tuzish mumkin.
          </div>
        </div>
      )}

      {/* ── Kunlik dinamika ─────────────────────────────────────── */}
      <div className="rounded-xl border border-line bg-surface p-4">
        <h3 className="font-semibold text-ink">Kunma-kun</h3>
        <p className="text-xs text-faint mb-3">
          Ustunlar — yozilgan va kelgan; chiziq — tushum (ming so'm, o'ng o'q)
        </p>
        {daily.length === 0 ? (
          <div className="text-sm text-faint py-10 text-center">Bu davrda yozuv yo'q</div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={daily} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} opacity={0.15} vertical={false} />
              <XAxis dataKey="label" stroke={AXIS} fontSize={10} tickLine={false} interval="preserveStartEnd" minTickGap={18} />
              <YAxis yAxisId="l" stroke={AXIS} fontSize={10} tickLine={false} axisLine={false} width={32} />
              <YAxis yAxisId="r" orientation="right" stroke="#059669" fontSize={10} tickLine={false} axisLine={false} width={44} />
              <Tooltip content={<ChartTip />} cursor={{ fill: GRID, opacity: 0.1 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar yAxisId="l" dataKey="booked" name="Yozilgan" fill="#93B4F5" radius={[3, 3, 0, 0]} />
              <Bar yAxisId="l" dataKey="arrived" name="Kelgan" fill="#2563EB" radius={[3, 3, 0, 0]} />
              <Line yAxisId="r" type="monotone" dataKey="revenueK" name="Tushum (ming)" stroke="#059669" strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* ── Hafta kunlari ────────────────────────────────────── */}
        <div className="rounded-xl border border-line bg-surface p-4">
          <h3 className="font-semibold text-ink">Hafta kunlari</h3>
          <p className="text-xs text-faint mb-3">Kuniga o'rtacha nechta qabul</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={wdChart} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} opacity={0.15} vertical={false} />
              <XAxis dataKey="short" stroke={AXIS} fontSize={11} tickLine={false} />
              <YAxis stroke={AXIS} fontSize={10} tickLine={false} axisLine={false} width={28} />
              <Tooltip content={<ChartTip />} cursor={{ fill: GRID, opacity: 0.1 }} />
              <Bar dataKey="avgVisits" name="Kuniga o'rtacha" radius={[4, 4, 0, 0]}>
                {wdChart.map((w: any) => (
                  <Cell key={w.weekday}
                        fill={w.avgVisits >= maxWd * 0.85 ? '#059669'
                            : w.avgVisits <= maxWd * 0.45 ? '#D97706' : '#2563EB'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <p className="text-xs text-faint mt-1">
            Yashil — eng gavjum, sariq — eng bo'sh kunlar.
          </p>
        </div>

        {/* ── Soatlar ──────────────────────────────────────────── */}
        <div className="rounded-xl border border-line bg-surface p-4">
          <h3 className="font-semibold text-ink">Kun davomida</h3>
          <p className="text-xs text-faint mb-3">Qaysi soatda gavjum</p>
          {hours.length === 0 ? (
            <div className="text-sm text-faint py-16 text-center">Ma'lumot yo'q</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={hours} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} opacity={0.15} vertical={false} />
                <XAxis dataKey="label" stroke={AXIS} fontSize={10} tickLine={false} />
                <YAxis stroke={AXIS} fontSize={10} tickLine={false} axisLine={false} width={28} />
                <Tooltip content={<ChartTip />} cursor={{ fill: GRID, opacity: 0.1 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="arrived" name="Kelgan" stackId="h" fill="#2563EB" radius={[0, 0, 0, 0]} />
                <Bar dataKey="kelmagan" name="Kelmagan" stackId="h" fill="#94A3B8" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ── Shifokorlar ────────────────────────────────────────── */}
      <div className="rounded-xl border border-line bg-surface p-4">
        <h3 className="font-semibold text-ink">Shifokorlar bo'yicha</h3>
        <p className="text-xs text-faint mb-3">Yozuvlar soni va nechtasi kelgani</p>
        {docs.length === 0 ? (
          <div className="text-sm text-faint py-10 text-center">Ma'lumot yo'q</div>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(160, docs.length * 38)}>
            <BarChart data={docs} layout="vertical" margin={{ top: 5, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} opacity={0.15} horizontal={false} />
              <XAxis type="number" stroke={AXIS} fontSize={10} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="doctorName" stroke={AXIS} fontSize={11}
                     tickLine={false} axisLine={false} width={130} />
              <Tooltip content={<ChartTip />} cursor={{ fill: GRID, opacity: 0.1 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="arrived" name="Kelgan" stackId="d" fill="#2563EB" />
              <Bar dataKey="noShow" name="Kelmagan" stackId="d" fill="#D97706" radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ── Raqamli jadval ─────────────────────────────────────── */}
      <div className="rounded-xl border border-line bg-surface p-4">
        <h3 className="font-semibold text-ink mb-3">Hafta kunlari — raqamlar</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead>
              <tr className="text-xs text-muted">
                <th className="text-left font-normal pb-2">Kun</th>
                <th className="text-right font-normal pb-2">Kuniga o'rtacha</th>
                <th className="text-right font-normal pb-2">Yozilgan</th>
                <th className="text-right font-normal pb-2">Kelgan</th>
                <th className="text-right font-normal pb-2">Kelmagan</th>
                <th className="text-right font-normal pb-2">Kuniga tushum</th>
              </tr>
            </thead>
            <tbody>
              {wd.map((w: any) => (
                <tr key={w.weekday} className="border-t border-line-soft">
                  <td className="py-2 font-medium text-ink whitespace-nowrap">
                    {w.name}<span className="text-xs text-faint font-normal ml-1">{w.days} kun</span>
                  </td>
                  <td className="py-2 text-right tabular-nums font-semibold">{w.avgVisits}</td>
                  <td className="py-2 text-right tabular-nums">{formatNumber(w.booked)}</td>
                  <td className="py-2 text-right tabular-nums text-emerald-600 dark:text-emerald-400">{formatNumber(w.arrived)}</td>
                  <td className="py-2 text-right tabular-nums text-amber-600 dark:text-amber-400">{formatNumber(w.noShow)}</td>
                  <td className="py-2 text-right tabular-nums">{formatNumber(w.avgRevenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
};

/* Ma'lumotni komponentning O'ZI so'raydi.

   Ilgari so'rov kalendarning ichida edi va uning `view` holatiga
   bog'liq turardi. Hisobot boshqa ekranga ko'chgach, o'sha bog'liqlikni
   ham olib kelishning ma'nosi yo'q: bu komponent mustaqil. */
export const AttendanceTab: React.FC = () => {
    const [data, setData] = useState<any>(null);
    const [busy, setBusy] = useState(false);
    const [days, setDays] = useState(90);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let alive = true;
        setBusy(true);
        setError(null);
        const to = new Date();
        const from = new Date(to.getTime() - days * 86400000);
        const iso = (d: Date) => d.toISOString().split('T')[0];
        api.reports.attendance(iso(from), iso(to))
            .then(d => { if (alive) { setData(d); setError(null); } })
            .catch(e => {
                /* Sabab SAQLANADI va ekranda ko'rsatiladi. Quruq «yuklab
                   bo'lmadi» nima bo'lganini aytmaydi: server eskimi,
                   tarmoqmi, ruxsatmi — hammasi bir xil ko'rinardi. */
                if (alive) { setData(null); setError(e?.message || String(e)); }
            })
            .finally(() => { if (alive) setBusy(false); });
        return () => { alive = false; };
    }, [days]);

    return <AttendanceReport data={data} busy={busy} days={days} onDays={setDays} error={error} />;
};
