import { useEffect, useState } from 'react';
import { useDashboardStore } from '../state/dashboardStore';
import { getApiBase } from '../utils/api';

type WatchlistItem = {
	symbol: string;
	pnl_30d: number;
    pnl_pct_30d?: number;
};

export default function Watchlist() {
	const selectedSymbol = useDashboardStore(s => s.selectedSymbol);
	const setSelectedSymbol = useDashboardStore(s => s.setters.setSelectedSymbol);
	const [watchlistData, setWatchlistData] = useState<WatchlistItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

	const loadWatchlist = async () => {
		setLoading(true);
		try {
			const API_BASE = getApiBase();
			const res = await fetch(`${API_BASE}/api/watchlist`);
			
			if (!res.ok) {
				throw new Error(`HTTP error! status: ${res.status}`);
			}
			
			const data = await res.json();
			
			if (!Array.isArray(data)) {
				setWatchlistData([]);
				return;
			}
			
			// Normalize data to ensure pnl_30d is a number
            const normalizedData = data.map((item: any) => ({
                symbol: item.symbol,
                pnl_30d: typeof item.pnl_30d === 'string' ? parseFloat(item.pnl_30d) : item.pnl_30d,
                pnl_pct_30d: item.pnl_pct_30d != null ? (typeof item.pnl_pct_30d === 'string' ? parseFloat(item.pnl_pct_30d) : item.pnl_pct_30d) : undefined,
            }));
            setWatchlistData(normalizedData);
		} catch (err) {
			setWatchlistData([]);
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		loadWatchlist();
	}, []);

    const formatPnl = (pnl: number) => {
		const sign = pnl >= 0 ? '+' : '';
		return `${sign}$${pnl.toFixed(2)}`;
	};

    const dataToRender = (() => {
        const arr = [...watchlistData];
        arr.sort((a, b) => sortOrder === 'asc' ? (a.pnl_30d - b.pnl_30d) : (b.pnl_30d - a.pnl_30d));
        return arr;
    })();

    return (
        <section className="rounded-lg border border-cyan-500/20 bg-black/80 backdrop-blur-sm p-6 shadow-lg">
            <div className="mb-4 flex items-center justify-between px-2">
                <h3 className="metallic-title text-sm font-semibold uppercase tracking-wide">Watchlist</h3>
                <div className="flex gap-2">
                    <button
                        className="text-xs px-3 py-1 rounded border border-cyan-500/30 bg-black/50 text-gray-300 hover:border-cyan-500/50 hover:bg-black/70 transition-colors"
                        onClick={loadWatchlist}
                        title="Manual refresh - watchlist used to auto-refresh every 30 seconds"
                    >
                        🔄 Refresh
                    </button>
                    <button
                        className="text-xs px-3 py-1 rounded border border-cyan-500/30 bg-black/50 text-gray-300 hover:border-cyan-500/50 hover:bg-black/70 transition-colors"
                        onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                        title="Toggle sort by 30d PNL"
                    >
                        {sortOrder === 'asc' ? 'Asc' : 'Desc'}
                    </button>
                </div>
            </div>
			
            <div className="overflow-y-auto overflow-x-hidden -mx-6" style={{ height: '430px' }}>
				<table className="w-full text-sm">
					<thead className="bg-black sticky top-0 z-10 border-b border-cyan-500/20">
						<tr>
							<th className="px-6 py-4 text-left font-semibold text-gray-400 uppercase text-xs tracking-wide">Symbol</th>
                            <th className="px-6 py-4 text-right font-semibold text-gray-400 uppercase text-xs tracking-wide">30d PNL</th>
                            <th className="px-6 py-4 text-right font-semibold text-gray-400 uppercase text-xs tracking-wide">30d % PNL</th>
						</tr>
					</thead>
					<tbody>
						{loading && watchlistData.length === 0 ? (
							<tr>
								<td colSpan={3} className="px-6 py-4 text-center text-gray-500">Loading...</td>
							</tr>
						) : watchlistData.length === 0 ? (
							<tr>
								<td colSpan={3} className="px-6 py-4 text-center text-gray-500">No data available</td>
							</tr>
						) : (
                            dataToRender.map((item) => (
                                <tr
									key={item.symbol}
									onClick={() => setSelectedSymbol(item.symbol)}
									className={`cursor-pointer transition-colors ${
										selectedSymbol === item.symbol 
											? 'bg-black/70 border-l-2 border-l-cyan-400' 
											: 'hover:bg-black/40 even:bg-black/30'
									}`}
								>
									<td className="px-6 py-4 font-semibold text-gray-200 font-mono">{item.symbol}</td>
									<td className={`px-6 py-4 text-right font-bold font-mono ${
										item.pnl_30d >= 0 ? 'text-emerald-400' : 'text-red-500'
									}`}>
										{formatPnl(item.pnl_30d)}
									</td>
                                    <td className={`px-6 py-4 text-right font-bold font-mono ${
                                        (item.pnl_pct_30d ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-500'
                                    }`}>
                                        {item.pnl_pct_30d != null ? `${(item.pnl_pct_30d).toFixed(2)}%` : '-'}
                                    </td>
								</tr>
							))
						)}
					</tbody>
				</table>
			</div>
		</section>
	);
}

