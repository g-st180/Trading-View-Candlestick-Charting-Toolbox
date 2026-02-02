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

export default function PortfolioTradeDurationHistogram() {
    const tradeDurations = useDashboardStore((s) => s.tradeDurations);
    const data = useMemo(() => processDataForHistogram(tradeDurations), [tradeDurations]);

    const [minY, maxY] = useMemo(() => {
        if (!data.length) return [0, 1];
        const vals = data.map(d => d.pnl);
        const maxVal = Math.max(...vals);
        const minVal = Math.min(...vals);

        // Always use symmetric domain around 0 so 0 is always visible as the baseline
        const maxAbs = Math.max(Math.abs(minVal), Math.abs(maxVal));
        const pad = maxAbs * 0.1;

        // If all values are zero, show a small symmetric range
        if (maxVal === 0 && minVal === 0) return [-1, 1];
        
        // Use symmetric domain: extend equally above and below 0
        const range = maxAbs + pad;
        return [-range, range];
    }, [data]);

    return (
        <div className="rounded-lg border border-cyan-500/20 bg-black/80 backdrop-blur-sm shadow-lg">
            <h3 className="metallic-title px-6 pt-6 pb-4 text-sm font-semibold uppercase tracking-wide">PNL by Trade Duration</h3>
            <div className="aspect-[5/2.43] px-6 -mb-6">
                {(!tradeDurations || tradeDurations.length === 0) ? (
                    <div className="p-6">
                        <Skeleton className="h-[200px] w-full" />
                    </div>
                ) : (
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data} margin={{ left: 20, right: 20, top: 10, bottom: 30 }}>
                        <XAxis 
                            dataKey="name" 
                            tick={{ fontSize: '0.7rem', fill: '#a3a3a3' }} 
                            axisLine={{ stroke: '#06b6d4', opacity: 0.3 }} 
                            tickLine={{ stroke: '#06b6d4', opacity: 0.3 }} 
                        />
                        <YAxis 
                            tick={{ fontSize: '0.7rem', fill: '#a3a3a3' }} 
                            axisLine={{ stroke: '#06b6d4', opacity: 0.3 }}
                            tickLine={{ stroke: '#06b6d4', opacity: 0.3 }}
                            tickFormatter={(v) => {
                                const num = Number(v);
                                if (num === 0) return '$0';
                                return `$${num.toLocaleString()}`;
                            }}
                            domain={[minY, maxY]}
                            allowDecimals
                            ticks={[minY, 0, maxY].filter((v, i, arr) => arr.indexOf(v) === i).sort((a, b) => a - b)}
                        />
                        <Tooltip
                            formatter={(value: number) => [`$${value.toFixed(2)}`, 'Total PNL']}
                            labelClassName="text-xs text-gray-200"
                            wrapperClassName="rounded-md border border-cyan-500/20 bg-black/80 backdrop-blur-sm"
                        />
                        <ReferenceLine y={0} stroke="#6b7280" strokeWidth={1.5} opacity={0.4} />
                        <Bar dataKey="pnl" barSize={30}>
                            {data.map((entry, index) => (
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
