import { useEffect, useMemo, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useDashboardStore } from '../state/dashboardStore';
import Skeleton from './Skeleton';
import { getApiBase } from '../utils/api';

interface PnlDataPoint {
    trade_number: number;
    time: string | null;
    cumulative_pnl_pct: number;
}

interface PnlComparisonData {
    live: PnlDataPoint[];
    validate: PnlDataPoint[];
}

interface PnlTimePoint {
    time: string | null;
    sum_pnl: number;
    cumulative_pnl_pct: number;
}

interface PnlComparisonByTimeData {
    live: PnlTimePoint[];
    validate: PnlTimePoint[];
}

export default function PnlComparisonChart() {
    const { selectedModel, technicalMetricsStart, technicalMetricsEnd, validationSelectedSymbols } = useDashboardStore();
    const [tradeData, setTradeData] = useState<PnlComparisonData>({ live: [], validate: [] });
    const [timeData, setTimeData] = useState<PnlComparisonByTimeData>({ live: [], validate: [] });
    const [loading, setLoading] = useState(true);
    const [mode, setMode] = useState<'trades' | 'time'>('trades');
    const API_BASE = getApiBase();

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                const params = new URLSearchParams();
                if (technicalMetricsStart) params.append('start_date', technicalMetricsStart);
                if (technicalMetricsEnd) params.append('end_date', technicalMetricsEnd);
                if (selectedModel) params.append('model_name', selectedModel);
                if (validationSelectedSymbols && validationSelectedSymbols.length > 0) {
                    params.append('symbols', validationSelectedSymbols.join(','));
                }
                const [tradeResp, timeResp] = await Promise.all([
                    fetch(`${API_BASE}/api/pnl_comparison?${params}`),
                    fetch(`${API_BASE}/api/pnl_comparison_by_time?${params}`)
                ]);
                const [tradeJson, timeJson] = await Promise.all([tradeResp.json(), timeResp.json()]);
                setTradeData({
                    live: Array.isArray(tradeJson?.live) ? tradeJson.live : [],
                    validate: Array.isArray(tradeJson?.validate) ? tradeJson.validate : [],
                });
                setTimeData({
                    live: Array.isArray(timeJson?.live) ? timeJson.live : [],
                    validate: Array.isArray(timeJson?.validate) ? timeJson.validate : [],
                });
            } catch (error) {
                setTradeData({ live: [], validate: [] });
                setTimeData({ live: [], validate: [] });
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [selectedModel, validationSelectedSymbols, technicalMetricsStart, technicalMetricsEnd]);

    const chartData = useMemo(() => {
        if (mode === 'trades') {
            const maxTrades = Math.max(tradeData.live.length, tradeData.validate.length);
            const rows: any[] = [];
            for (let i = 0; i < maxTrades; i++) {
                rows.push({
                    trade_number: i + 1,
                    live: tradeData.live[i]?.cumulative_pnl_pct ?? null,
                    validate: tradeData.validate[i]?.cumulative_pnl_pct ?? null
                });
            }
            return rows;
        }
        const times = new Set<string>();
        timeData.live.forEach(p => { if (p.time) times.add(p.time); });
        timeData.validate.forEach(p => { if (p.time) times.add(p.time); });
        const sorted = Array.from(times).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
        const liveIndex = new Map<string, number>(timeData.live.map(p => [p.time as string, p.cumulative_pnl_pct]));
        const valIndex = new Map<string, number>(timeData.validate.map(p => [p.time as string, p.cumulative_pnl_pct]));
        const rows: Array<{ time: string; live: number | null; validate: number | null }> = [];
        let lastLive: number | null = null;
        let lastVal: number | null = null;
        for (const t of sorted) {
            const lv: number | null = liveIndex.has(t) ? (liveIndex.get(t) ?? null) : lastLive;
            const vv: number | null = valIndex.has(t) ? (valIndex.get(t) ?? null) : lastVal;
            lastLive = lv ?? lastLive;
            lastVal = vv ?? lastVal;
            rows.push({
                time: t,
                live: lv ?? null,
                validate: vv ?? null
            });
        }
        return rows;
    }, [mode, tradeData, timeData]);

    return (
        <div className="rounded-lg border border-cyan-500/20 bg-black/80 backdrop-blur-sm shadow-lg">
            <div className="flex items-center justify-between px-4 pt-4 pb-3 h-[52px]">
                <h3 className="metallic-title text-sm font-semibold uppercase tracking-wide leading-tight line-clamp-2">Cumulative PNL Comparison</h3>
                <div className="inline-flex rounded-md" role="group">
                    <button
                        type="button"
                        onClick={() => setMode('trades')}
                        className={`px-2 py-1 text-xs border rounded-l ${mode === 'trades' ? 'border-cyan-500 bg-cyan-500/20 text-cyan-400' : 'border-cyan-500/30 bg-black/50 text-gray-300 hover:border-cyan-500/50 hover:bg-black/70'}`}
                    >
                        By Trades
                    </button>
                    <button
                        type="button"
                        onClick={() => setMode('time')}
                        className={`px-2 py-1 text-xs border rounded-r -ml-px ${mode === 'time' ? 'border-cyan-500 bg-cyan-500/20 text-cyan-400' : 'border-cyan-500/30 bg-black/50 text-gray-300 hover:border-cyan-500/50 hover:bg-black/70'}`}
                    >
                        By Entry Time
                    </button>
                </div>
            </div>
            <div className="aspect-[5/3] px-4 pb-4">
                {loading ? (
                    <div className="p-4">
                        <Skeleton className="h-full w-full" />
                    </div>
                ) : chartData.length === 0 ? (
                    <div className="p-4">
                        <Skeleton className="h-full w-full" />
                    </div>
                ) : (
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 5, right: 0, left: -16, bottom: 20 }}>
                        <CartesianGrid stroke="#06b6d4" strokeDasharray="3 3" opacity={0.15} />
                        {mode === 'trades' ? (
                            <XAxis 
                                dataKey="trade_number" 
                                tick={{ fontSize: '0.7rem', fill: '#6b7280' }}
                                axisLine={{ stroke: '#06b6d4', opacity: 0.3 }}
                                tickLine={{ stroke: '#06b6d4', opacity: 0.3 }}
                            />
                        ) : (
                            <XAxis 
                                dataKey="time" 
                                tick={{ fontSize: '0.7rem', fill: '#6b7280' }}
                                axisLine={{ stroke: '#06b6d4', opacity: 0.3 }}
                                tickLine={{ stroke: '#06b6d4', opacity: 0.3 }}
                                tickFormatter={(val: string) => {
                                    try { 
                                        return new Date(val).toLocaleTimeString('en-US', {
                                            timeZone: 'America/New_York',
                                            hour: '2-digit',
                                            minute: '2-digit',
                                            hour12: false
                                        });
                                    } catch { return val; }
                                }}
                            />
                        )}
                        <YAxis 
                            tick={{ fontSize: '0.7rem', fill: '#6b7280' }}
                            axisLine={{ stroke: '#06b6d4', opacity: 0.3 }}
                            tickLine={{ stroke: '#06b6d4', opacity: 0.3 }}
                            label={{ value: '% of Initial Portfolio', angle: -90, position: 'insideLeft', offset: 10, style: { fontSize: '0.7rem', fill: '#6b7280', textAnchor: 'middle' } }}
                        />
                        <Tooltip 
                            formatter={(value: any) => value != null ? [`${Number(value).toFixed(2)}%`, ''] : ['N/A', '']}
                            labelFormatter={(label) => mode === 'trades' ? `Trade #${label}` : `${new Date(String(label)).toLocaleString('en-US', { 
                                timeZone: 'America/New_York',
                                month: 'numeric',
                                day: 'numeric',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                                second: '2-digit',
                                hour12: false 
                            })}`}
                            labelClassName="text-xs font-bold text-gray-300"
                            contentStyle={{ 
                                backgroundColor: '#000000', 
                                border: '1px solid #06b6d4',
                                borderRadius: '0.375rem',
                                color: '#e5e7eb'
                            }}
                            isAnimationActive={false}
                        />
                        <Legend wrapperStyle={{ fontSize: '0.7rem', color: '#6b7280' }} />
                        <Line 
                            type="monotone" 
                            dataKey="live" 
                            name="Live Simulator" 
                            stroke="#06b6d4" 
                            strokeWidth={2}
                            dot={false}
                            connectNulls
                            isAnimationActive={false}
                        />
                        <Line 
                            type="monotone" 
                            dataKey="validate" 
                            name="Validation Simulator" 
                            stroke="#14b8a6" 
                            strokeWidth={2}
                            dot={false}
                            connectNulls
                            isAnimationActive={false}
                        />
                    </LineChart>
                </ResponsiveContainer>
                )}
            </div>
        </div>
    );
}

