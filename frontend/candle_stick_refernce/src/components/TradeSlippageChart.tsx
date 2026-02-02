import { useMemo, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { useDashboardStore } from '../state/dashboardStore';
import Skeleton from './Skeleton';

function formatTick(ts: number) {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit' });
}

function formatFull(ts: number) {
    const d = new Date(ts);
    return d.toLocaleString('en-US', { 
        timeZone: 'America/New_York',
        month: 'numeric',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false 
    });
}

export default function TradeSlippageChart() {
    const slippageSeries = useDashboardStore((s) => s.slippageSeries);
    const [xAxisMode, setXAxisMode] = useState<'time' | 'trade'>('trade');
    const legendItems = useMemo(() => ([
        { label: 'Cumulative', color: '#06b6d4' },
        { label: 'Per-Trade', color: '#14b8a6' },
    ]), []);

    const data = useMemo(() => {
        if (xAxisMode === 'trade') {
            return slippageSeries;
        }
        
        // MARKET HOURS FILTER - Comment out the filter below to show all data points including weekends and after-hours
        return slippageSeries.filter((point) => {
            const date = new Date(point.ts);
            const day = date.getUTCDay(); // 0 = Sunday, 6 = Saturday
            const hours = date.getUTCHours();
            const minutes = date.getUTCMinutes();
            
            // Filter out weekends
            if (day === 0 || day === 6) {
                return false;
            }
            
            // Filter out non-market hours (US market: 9:30 AM - 4:00 PM ET = 13:30 - 20:00 UTC)
            const timeInMinutes = hours * 60 + minutes;
            const marketOpen = 13 * 60 + 30; // 13:30 UTC (9:30 AM ET)
            const marketClose = 20 * 60; // 20:00 UTC (4:00 PM ET)
            
            return timeInMinutes >= marketOpen && timeInMinutes < marketClose;
        });
        // END MARKET HOURS FILTER - To disable filtering, replace the filter above with: return slippageSeries;
    }, [slippageSeries, xAxisMode]);

    return (
        <div className="rounded-lg border border-cyan-500/20 bg-black/80 backdrop-blur-sm shadow-lg">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-6 pt-6 pb-3">
                <h3 className="metallic-title text-sm font-semibold uppercase tracking-wide leading-tight line-clamp-2">Slippage (%)</h3>
                <div className="flex items-center gap-x-4 gap-y-2 w-full sm:w-auto sm:flex-1 sm:justify-end">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-300 sm:mr-2">
                        {legendItems.map((it) => (
                            <div key={it.label} className="flex items-center gap-2">
                                <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: it.color }} />
                                <span className="uppercase tracking-wide text-gray-300">{it.label}</span>
                            </div>
                        ))}
                    </div>
                    <select
                        className="ml-auto sm:ml-0 rounded border border-cyan-500/30 bg-black/50 text-gray-300 px-2 py-1 text-xs hover:border-cyan-500/50 hover:bg-black/70 transition-colors"
                        value={xAxisMode}
                        onChange={(e) => setXAxisMode(e.target.value as 'time' | 'trade')}
                    >
                        <option value="trade" className="bg-black">By Trade #</option>
                        <option value="time" className="bg-black">By Time</option>
                    </select>
                </div>
            </div>
            <div className="aspect-[5/3.15] px-6 -mb-6">
                {(!slippageSeries || slippageSeries.length === 0) ? (
                    <div className="p-6">
                        <Skeleton className="h-[220px] w-full" />
                    </div>
                ) : (
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data} margin={{ left: -16, right: 0, top: 5, bottom: 20 }}>
                        <CartesianGrid stroke="#06b6d4" strokeDasharray="3 3" opacity={0.15} />
                        <XAxis
                            tick={{ fontSize: '0.7rem', fill: '#6b7280' }}
                            axisLine={{ stroke: '#06b6d4', opacity: 0.3 }}
                            tickLine={{ stroke: '#06b6d4', opacity: 0.3 }}
                            dataKey={xAxisMode === 'time' ? 'ts' : 'trade_number'}
                            type="number"
                            domain={xAxisMode === 'time' ? ["dataMin", "dataMax"] : [1, 'dataMax']}
                            tickCount={xAxisMode === 'time' ? 4 : 6}
                            tickFormatter={(v) => xAxisMode === 'time' ? formatTick(Number(v)) : `#${v}`}
                            allowDecimals={xAxisMode === 'trade' ? false : true}
                        />
                        <YAxis
                            tick={{ fontSize: '0.7rem', fill: '#6b7280' }}
                            axisLine={{ stroke: '#06b6d4', opacity: 0.3 }}
                            tickLine={{ stroke: '#06b6d4', opacity: 0.3 }}
                            tickCount={5}
                            allowDecimals
                            tickFormatter={(v) => {
                                const n = Number(v);
                                if (!isFinite(n)) return '';
                                return `${n.toFixed(2)}%`;
                            }}
                        />
                        <Tooltip
                            formatter={(value: number, name: string) => [`${value.toFixed(4)}%`, name === 'Cumulative' ? 'Cumulative Slippage' : 'Per-Trade Slippage']}
                            labelFormatter={(label) => {
                                if (xAxisMode === 'time') {
                                    return formatFull(Number(label));
                                } else {
                                    return `Trade #${label}`;
                                }
                            }}
                            labelClassName="text-xs font-bold text-gray-300"
                            contentStyle={{ 
                                backgroundColor: '#000000', 
                                border: '1px solid #06b6d4',
                                borderRadius: '0.375rem',
                                color: '#e5e7eb'
                            }}
                        />
                        <Line name="Cumulative" type="monotone" dataKey="cumulative" stroke="#06b6d4" strokeWidth={2} dot={false} isAnimationActive={false} />
                        <Line name="Per-Trade" type="monotone" dataKey="value" stroke="#14b8a6" strokeWidth={2} dot={false} isAnimationActive={false} />
                    </LineChart>
                </ResponsiveContainer>
                )}
            </div>
        </div>
    );
}

