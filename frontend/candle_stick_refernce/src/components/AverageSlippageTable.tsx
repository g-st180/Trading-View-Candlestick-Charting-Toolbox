import { useEffect, useMemo, useState } from 'react';
import { useDashboardStore } from '../state/dashboardStore';
import { getApiBase } from '../utils/api';

interface SlippageRow {
    symbol: string;
    avg_entry_slippage_pct: number;
    avg_exit_slippage_pct: number;
    trade_count: number;
}

export default function AverageSlippageTable() {
    useDashboardStore();
    const [rows, setRows] = useState<SlippageRow[]>([]);
    const [loading, setLoading] = useState<boolean>(true);

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                const API_BASE = getApiBase();
                const resp = await fetch(`${API_BASE}/api/average_slippage_by_symbol`);
                const data = await resp.json();
                setRows(Array.isArray(data) ? data : []);
            } catch (e) {
                setRows([]);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    const merged = useMemo(() => {
        return rows.map(r => ({
            symbol: r.symbol,
            avg_entry_slippage_pct: Number(r.avg_entry_slippage_pct || 0),
            avg_exit_slippage_pct: Number(r.avg_exit_slippage_pct || 0),
            avg_slippage_pct: (Number(r.avg_entry_slippage_pct || 0) + Number(r.avg_exit_slippage_pct || 0)) / 2,
            trade_count: r.trade_count
        }));
    }, [rows]);

    return (
        <div className="rounded-lg border border-cyan-500/20 bg-black/80 backdrop-blur-sm shadow-lg">
            <div className="flex items-center justify-between border-b border-cyan-500/20 px-6 py-4">
                <h3 className="metallic-title text-sm font-semibold uppercase tracking-wide">30-Day Avg Slippage by Symbol</h3>
            </div>
            {loading ? (
                <div className="h-48 flex items-center justify-center">
                    <p className="text-gray-400">Loading...</p>
                </div>
            ) : merged.length === 0 ? (
                <div className="h-48 flex items-center justify-center">
                    <p className="text-gray-400">No data available</p>
                </div>
            ) : (
                <div className="overflow-auto">
                    <table className="min-w-full text-sm">
                        <thead>
                            <tr className="bg-black text-gray-400">
                                <th className="px-6 py-4 text-left font-medium uppercase tracking-wide text-xs">Symbol</th>
                                <th className="px-6 py-4 text-left font-medium uppercase tracking-wide text-xs">Avg Entry Slippage %</th>
                                <th className="px-6 py-4 text-left font-medium uppercase tracking-wide text-xs">Avg Exit Slippage %</th>
                                <th className="px-6 py-4 text-left font-medium uppercase tracking-wide text-xs">Combined Avg %</th>
                                <th className="px-6 py-4 text-left font-medium uppercase tracking-wide text-xs">Trades</th>
                            </tr>
                        </thead>
                        <tbody>
                            {merged.map((r) => (
                                <tr key={r.symbol} className="border-b border-cyan-500/10 hover:bg-black/40 text-gray-200">
                                    <td className="px-6 py-3 font-medium">{r.symbol}</td>
                                    <td className="px-6 py-3">{r.avg_entry_slippage_pct.toFixed(3)}%</td>
                                    <td className="px-6 py-3">{r.avg_exit_slippage_pct.toFixed(3)}%</td>
                                    <td className="px-6 py-3">{Number(r.avg_slippage_pct).toFixed(3)}%</td>
                                    <td className="px-6 py-3 text-gray-400">{r.trade_count}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}


