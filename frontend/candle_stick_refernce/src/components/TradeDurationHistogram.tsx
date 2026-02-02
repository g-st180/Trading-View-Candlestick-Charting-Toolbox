import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from 'recharts';
import { useDashboardStore } from '../state/dashboardStore';
import { TradeDurationPoint } from '../state/dashboardStore';
import Skeleton from './Skeleton';

// Define the buckets for trade durations in seconds
const DURATION_BINS = [
    { label: '0-1m', max: 60 },
    { label: '1-5m', max: 300 },
    { label: '5-15m', max: 900 },
    { label: '15-60m', max: 3600 },
    { label: '1-4h', max: 14400 },
    { label: '>4h', max: Infinity },
];

function processDataForHistogram(data: TradeDurationPoint[]) {
    const bins = DURATION_BINS.map(bin => ({ name: bin.label, pnl: 0 }));

    data.forEach(trade => {
        const duration = trade.duration;
        const pnl = Number(trade.pnl) || 0;
        
        for (let i = 0; i < DURATION_BINS.length; i++) {
            if (duration <= DURATION_BINS[i].max) {
                bins[i].pnl += pnl;
                return;
            }
        }
    });

    return bins;
}

export default function TradeDurationHistogram() {
    const tradeDurations = useDashboardStore((s) => s.tradeDurations);
    const data = useMemo(() => processDataForHistogram(tradeDurations), [tradeDurations]);

    const [minY, maxY] = useMemo(() => {
        if (!data.length) return [0, 0];
        const vals = data.map((d: any) => d.pnl);
        const minVal = Math.min(...vals);
        const maxVal = Math.max(...vals);
        // pad by 10% to avoid bars touching axis
        const pad = (v: number) => Math.abs(v) * 0.1;
        const lo = Math.min(0, minVal - pad(minVal));
        const hi = Math.max(0, maxVal + pad(maxVal));
        // handle flat zero case
        if (lo === 0 && hi === 0) return [-1, 1];
        return [lo, hi];
    }, [data]);

    return (
        <div className="rounded-lg border border-cyan-500/20 bg-black/80 backdrop-blur-sm shadow-lg">
            <h3 className="metallic-title px-6 pt-6 pb-4 text-sm font-semibold uppercase tracking-wide">PNL by Trade Duration</h3>
            <div className="aspect-[5/3.15] px-6 -mb-6">
                {(!tradeDurations || tradeDurations.length === 0) ? (
                    <div className="p-6">
                        <Skeleton className="h-[220px] w-full" />
                    </div>
                ) : (
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data} margin={{ left: 20, right: 20, top: 10, bottom: 30 }}>
                        <XAxis dataKey="name" tick={{ fontSize: '0.7rem', fill: '#6b7280' }} axisLine={{ stroke: '#06b6d4', opacity: 0.3 }} tickLine={{ stroke: '#06b6d4', opacity: 0.3 }} />
                        <YAxis 
                            tick={{ fontSize: '0.7rem', fill: '#6b7280' }}
                            axisLine={{ stroke: '#06b6d4', opacity: 0.3 }}
                            tickLine={{ stroke: '#06b6d4', opacity: 0.3 }} 
                            tickFormatter={(v) => `$${Number(v).toLocaleString()}`}
                            domain={[minY, maxY]}
                            allowDecimals
                        />
                        <Tooltip
                            formatter={(value: number) => [`$${value.toFixed(2)}`, 'Total PNL']}
                            labelClassName="text-xs font-bold text-gray-300"
                            contentStyle={{ 
                                backgroundColor: '#000000', 
                                border: '1px solid #06b6d4',
                                borderRadius: '0.375rem',
                                color: '#e5e7eb'
                            }}
                        />
                        <ReferenceLine y={0} stroke="#06b6d4" strokeWidth={1.5} opacity={0.4} />
                        <Bar dataKey="pnl">
                            {data.map((entry: any, index: number) => (
                                <Cell key={`cell-${index}`} fill={entry.pnl >= 0 ? '#10b981' : '#ef4444'} />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
                )}
            </div>
        </div>
    );
}
