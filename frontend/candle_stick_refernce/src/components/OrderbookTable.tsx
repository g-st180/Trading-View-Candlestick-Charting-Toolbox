import { useEffect, useState } from 'react';
import { useDashboardStore } from '../state/dashboardStore';

export default function OrderbookTable() {
	const [rows, setRows] = useState<any[]>([]);
	const [loading, setLoading] = useState<boolean>(false);
	useDashboardStore();
	const [pageSize, setPageSize] = useState<number>(50);
	const [page, setPage] = useState<number>(0);

	async function load() {
		setLoading(true);
		try {
			// Fetch all trade logs, no pagination needed - we'll show recent trades
			const res = await fetch(`/api/trade_logs`);
			const data = await res.json();
			if (res.ok && Array.isArray(data)) {
				// Sort by entry time descending (most recent first)
				const sorted = data.sort((a: any, b: any) => {
					const timeA = new Date(a.entry_time).getTime();
					const timeB = new Date(b.entry_time).getTime();
					return timeB - timeA;
				});
				setRows(sorted);
			} else {
				setRows([]);
			}
		} catch (e) {
			setRows([]);
		} finally {
			setLoading(false);
		}
	}

	useEffect(() => { load(); }, []);

	// Reset to first page when page size changes
	useEffect(() => { setPage(0); }, [pageSize]);

	const formatDateTime = (dateStr: string) => {
		if (!dateStr) return '-';
		const date = new Date(dateStr);
		return date.toLocaleString('en-US', { 
			month: 'short', 
			day: 'numeric', 
			hour: '2-digit', 
			minute: '2-digit',
			second: '2-digit'
		});
	};

	const formatPrice = (price: any) => {
		if (!price) return '-';
		return `$${Number(price).toFixed(2)}`;
	};

	const formatTimeframe = (multiplier: any, timespan: any) => {
		if (!multiplier || !timespan) return '-';
		return `${multiplier}${timespan}`;
	};

	const total = rows.length;
	const totalPages = Math.max(1, Math.ceil(total / pageSize));
	const start = page * pageSize;
	const end = Math.min(start + pageSize, total);
	const visibleRows = rows.slice(start, end);

	return (
		<section className="rounded-lg border border-cyan-500/20 bg-black/80 backdrop-blur-sm shadow-lg">
			<header className="flex items-center justify-between border-b border-cyan-500/20 px-6 py-4">
				<h2 className="metallic-title text-sm font-semibold uppercase tracking-wide">Trade Logs</h2>
				<div className="flex items-center gap-3">
					<label className="text-xs text-gray-400">Rows per page</label>
					<select
						className="rounded border border-cyan-500/30 bg-black/50 px-2 py-1 text-xs text-gray-300 hover:border-cyan-500/50 hover:bg-black/70 transition-colors"
						value={pageSize}
						onChange={(e) => setPageSize(Number(e.target.value))}
					>
						<option value={10}>10</option>
						<option value={50}>50</option>
						<option value={100}>100</option>
						<option value={200}>200</option>
					</select>
					<button 
						className="rounded border border-cyan-500/30 bg-black/50 px-3 py-1 text-xs text-gray-300 hover:border-cyan-500/50 hover:bg-black/70 transition-colors disabled:opacity-50"
						onClick={load}
						disabled={loading}
					>
						{loading ? 'Loading...' : 'Refresh'}
					</button>
				</div>
			</header>
			<div className="max-h-[70vh] overflow-auto">
				<table className="min-w-full text-xs">
					<thead className="sticky top-0 bg-black text-gray-400">
						<tr>
							<th className="px-4 py-3 text-left font-medium uppercase tracking-wide text-xs">Ticker</th>
							<th className="px-4 py-3 text-left font-medium uppercase tracking-wide text-xs">Direction</th>
							<th className="px-4 py-3 text-left font-medium uppercase tracking-wide text-xs">Entry Time</th>
							<th className="px-4 py-3 text-right font-medium uppercase tracking-wide text-xs">Entry Price</th>
							<th className="px-4 py-3 text-right font-medium uppercase tracking-wide text-xs">Exit Price</th>
							<th className="px-4 py-3 text-left font-medium uppercase tracking-wide text-xs">Exit Time</th>
							<th className="px-4 py-3 text-right font-medium uppercase tracking-wide text-xs">Stop Loss</th>
							<th className="px-4 py-3 text-right font-medium uppercase tracking-wide text-xs">Take Profit</th>
							<th className="px-4 py-3 text-right font-medium uppercase tracking-wide text-xs">Quantity</th>
							<th className="px-4 py-3 text-left font-medium uppercase tracking-wide text-xs">Exit Reason</th>
							<th className="px-4 py-3 text-right font-medium uppercase tracking-wide text-xs">PNL %</th>
							<th className="px-4 py-3 text-right font-medium uppercase tracking-wide text-xs">Model Conf.</th>
							<th className="px-4 py-3 text-left font-medium uppercase tracking-wide text-xs">Timeframe</th>
						</tr>
					</thead>
					<tbody>
						{visibleRows.length === 0 ? (
							<tr>
								<td colSpan={13} className="px-4 py-4 text-center text-gray-500">
									{loading ? 'Loading...' : 'No trade logs available'}
								</td>
							</tr>
						) : (
							visibleRows.map((r) => (
								<tr key={r.id} className="border-b border-cyan-500/10 hover:bg-black/40 text-gray-200">
									<td className="px-4 py-3 font-medium">{r.ticker}</td>
								<td className="px-4 py-3">
									<span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${
										r.direction?.toLowerCase() === 'long' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
									}`}>
										{r.direction?.toUpperCase()}
									</span>
								</td>
									<td className="px-4 py-3">{formatDateTime(r.entry_time)}</td>
									<td className="px-4 py-3 text-right tabular-nums">{formatPrice(r.entry_price)}</td>
									<td className="px-4 py-3 text-right tabular-nums">{formatPrice(r.exit_price)}</td>
									<td className="px-4 py-3">{formatDateTime(r.exit_time)}</td>
									<td className="px-4 py-3 text-right tabular-nums">{formatPrice(r.stop_loss_price)}</td>
									<td className="px-4 py-3 text-right tabular-nums">{formatPrice(r.take_profit_price)}</td>
									<td className="px-4 py-3 text-right tabular-nums">{r.quantity ? Number(r.quantity).toFixed(2) : '-'}</td>
									<td className="px-4 py-3 text-xs text-gray-400">{r.exit_reason || '-'}</td>
									<td className={`px-4 py-3 text-right tabular-nums font-medium ${
										r.pnl_pct > 0 ? 'text-emerald-400' : r.pnl_pct < 0 ? 'text-red-500' : 'text-gray-400'
									}`}>
										{r.pnl_pct ? `${r.pnl_pct > 0 ? '+' : ''}${Number(r.pnl_pct).toFixed(2)}%` : '-'}
									</td>
									<td className="px-4 py-3 text-right tabular-nums">{r.model_confidence ? Number(r.model_confidence).toFixed(3) : '-'}</td>
									<td className="px-4 py-3">{formatTimeframe(r.timeframe_multiplier, r.timespan)}</td>
								</tr>
							))
						)}
					</tbody>
				</table>
			</div>
			<footer className="border-t border-cyan-500/20 px-6 py-4 text-xs text-gray-400">
				<div className="flex items-center justify-between">
					<div>Total: {total} trades</div>
					<div className="flex items-center gap-2">
						<button
							className="rounded border border-cyan-500/30 bg-black/50 px-2 py-1 text-gray-300 hover:border-cyan-500/50 hover:bg-black/70 transition-colors disabled:opacity-50"
							onClick={() => setPage((p) => Math.max(0, p - 1))}
							disabled={page === 0}
						>
							Prev
						</button>
						<span>Page {totalPages === 0 ? 0 : page + 1} of {totalPages}</span>
						<button
							className="rounded border border-cyan-500/30 bg-black/50 px-2 py-1 text-gray-300 hover:border-cyan-500/50 hover:bg-black/70 transition-colors disabled:opacity-50"
							onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
							disabled={page >= totalPages - 1}
						>
							Next
						</button>
					</div>
				</div>
			</footer>
		</section>
	);
}

