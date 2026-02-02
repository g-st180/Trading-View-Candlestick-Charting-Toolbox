import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';

import ExperimentsMetricsComparisonTable from './ExperimentsMetricsComparisonTable';
import { useDashboardStore } from '../state/dashboardStore';
import { getApiBase } from '../utils/api';

type TimeRange = '1h' | '24h' | '48h' | 'before' | 'after' | 'custom';

type ExperimentsComparisonData = {
	experiments: string[];
	metrics: Array<{
		name: string;
		unit: string;
		values: Record<string, string | number | null>;
	}>;
};

function mean(nums: number[]): number | null {
	if (!nums.length) return null;
	return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function last<T>(arr: T[]): T | null {
	return arr.length ? arr[arr.length - 1] : null;
}

function normalizeExitDist(input: any): Array<{ name: string; value: number }> {
	if (!input) return [];
	if (Array.isArray(input)) {
		return input
			.map((it: any): { name: string; value: number } | null => {
				if (Array.isArray(it) && it.length >= 2) return { name: String(it[0]), value: Number(it[1]) };
				if (it && typeof it === 'object') return { name: String(it.name ?? it.reason ?? it.exit_reason ?? ''), value: Number(it.value ?? it.count ?? it.c ?? 0) };
				return null;
			})
			.filter((x): x is { name: string; value: number } => !!x && !!x.name && Number.isFinite(x.value))
			.sort((a: any, b: any) => b.value - a.value);
	}
	if (input && typeof input === 'object') {
		const out: Array<{ name: string; value: number }> = [];
		for (const [k, v] of Object.entries(input)) {
			const n = Number(v as any);
			if (isFinite(n)) out.push({ name: String(k), value: n });
		}
		return out.sort((a, b) => b.value - a.value);
	}
	return [];
}

const DURATION_BINS = [
	{ label: '0-1m', max: 60 },
	{ label: '1-5m', max: 300 },
	{ label: '5-15m', max: 900 },
	{ label: '15-60m', max: 3600 },
	{ label: '1-4h', max: 14400 },
	{ label: '>4h', max: Infinity },
];

function pnlByDurationBins(trades: Array<{ duration: number; pnl: number }>): Record<string, number> {
	const out: Record<string, number> = {};
	for (const b of DURATION_BINS) out[b.label] = 0;
	for (const t of trades || []) {
		const dur = Number(t.duration) || 0;
		const pnl = Number(t.pnl) || 0;
		for (const b of DURATION_BINS) {
			if (dur <= b.max) {
				out[b.label] += pnl;
				break;
			}
		}
	}
	return out;
}

export default function TradeExperimentsMetricsModal() {
	const [isOpen, setIsOpen] = useState(false);
	const [data, setData] = useState<ExperimentsComparisonData | null>(null);
	const [isLoading, setIsLoading] = useState(false);

	const [timeRange, setTimeRange] = useState<TimeRange>('24h');
	const [symbol, setSymbol] = useState<string>('ALL');
	const [direction, setDirection] = useState<string>('ALL');

	const { dashboardStart, dashboardEnd, symbols, experiments, loadTickers, loadExperiments } = useDashboardStore();
	const [startDate, setStartDate] = useState<string>(dashboardStart || '');
	const [endDate, setEndDate] = useState<string>(dashboardEnd || '');

	const [isTimeDropdownOpen, setIsTimeDropdownOpen] = useState(false);
	const timeDropdownRef = useRef<HTMLDivElement | null>(null);
	const [beforeDate, setBeforeDate] = useState<Date | null>(null);
	const [afterDate, setAfterDate] = useState<Date | null>(null);
	const abortRef = useRef<AbortController | null>(null);

	useEffect(() => {
		loadTickers();
	}, [loadTickers]);

	const experimentIds = useMemo(() => Array.from(new Set((experiments || []).filter(Boolean))), [experiments]);

	const formatDate = (date: Date) => {
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, '0');
		const day = String(date.getDate()).padStart(2, '0');
		const hours = String(date.getHours()).padStart(2, '0');
		const minutes = String(date.getMinutes()).padStart(2, '0');
		return `${year}-${month}-${day}T${hours}:${minutes}`;
	};

	const getTimeRangeLabel = (range: TimeRange): string => {
		switch (range) {
			case '1h': return 'In the last 1 hour';
			case '24h': return 'In the last 24 hours';
			case '48h': return 'In the last 48 hours';
			case 'before': return beforeDate ? `On or Before ${beforeDate.toLocaleDateString()}` : 'On or Before';
			case 'after': return afterDate ? `On or After ${afterDate.toLocaleDateString()}` : 'On or After';
			case 'custom': return 'Custom Range';
			default: return 'In the last 24 hours';
		}
	};

	// Close dropdown when clicking outside
	useEffect(() => {
		const onDown = (e: MouseEvent) => {
			if (!isTimeDropdownOpen) return;
			const el = timeDropdownRef.current;
			if (!el) return;
			if (el.contains(e.target as Node)) return;
			setIsTimeDropdownOpen(false);
		};
		document.addEventListener('mousedown', onDown);
		return () => document.removeEventListener('mousedown', onDown);
	}, [isTimeDropdownOpen]);

	// Set date range based on selected time range
	useEffect(() => {
		if (timeRange === 'custom' || timeRange === 'before' || timeRange === 'after') return;
		const now = new Date();
		const end = now.toISOString().slice(0, 16);
		let start: string;
		switch (timeRange) {
			case '1h':
				start = new Date(now.getTime() - 60 * 60 * 1000).toISOString().slice(0, 16);
				break;
			case '24h':
				start = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 16);
				break;
			case '48h':
				start = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString().slice(0, 16);
				break;
			default:
				return;
		}
		setStartDate(start);
		setEndDate(end);
	}, [timeRange]);

	useEffect(() => {
		if (timeRange === 'before' && beforeDate) {
			const selectedDate = new Date(beforeDate);
			selectedDate.setHours(23, 59, 59, 999);
			setStartDate('2020-01-01T00:00');
			setEndDate(formatDate(selectedDate));
		}
	}, [timeRange, beforeDate]);

	useEffect(() => {
		if (timeRange === 'after' && afterDate) {
			const selectedDate = new Date(afterDate);
			selectedDate.setHours(0, 0, 0, 0);
			setStartDate(formatDate(selectedDate));
			setEndDate(formatDate(new Date()));
		}
	}, [timeRange, afterDate]);

	const fetchExperimentSummary = useCallback(async (start: string, end: string, ticker: string, dir: string, experimentId: string | undefined, signal?: AbortSignal) => {
		const params = new URLSearchParams();
		if (start) params.set('start_date', start);
		if (end) params.set('end_date', end);
		if (ticker && ticker !== 'ALL') params.set('ticker', ticker);
		if (dir && dir !== 'ALL') params.set('direction', dir);
		if (experimentId) params.set('experiment_id', experimentId);

		const base = getApiBase();
		const [cardsRes, riskRes, pnlRes, slippageRes, durationsRes, exitsRes] = await Promise.all([
			fetch(`${base}/api/card_metrics?${params.toString()}`, { signal }),
			fetch(`${base}/api/risk_cards?${params.toString()}`, { signal }),
			fetch(`${base}/api/pnl_curve?${params.toString()}`, { signal }),
			fetch(`${base}/api/slippage?${params.toString()}`, { signal }),
			fetch(`${base}/api/trade_durations?${params.toString()}`, { signal }),
			fetch(`${base}/api/exit_reasons?${params.toString()}`, { signal }),
		]);

		const [cards, risk, pnlRaw, slippageRaw, durationsRaw, exitsRaw] = await Promise.all([
			cardsRes.json(),
			riskRes.json(),
			pnlRes.json(),
			slippageRes.json(),
			durationsRes.json(),
			exitsRes.json(),
		]);

		const pnlArr: any[] = Array.isArray(pnlRaw) ? pnlRaw : [];
		const slippageArr: any[] = Array.isArray(slippageRaw) ? slippageRaw : [];
		const durationsArr: any[] = Array.isArray(durationsRaw) ? durationsRaw : [];

		const pnlValues = pnlArr.map((p) => Number(p.value ?? p.pnl ?? p.y ?? 0)).filter((n) => isFinite(n));
		const pnlFinal = last(pnlValues) ?? null;

		const slipValues = slippageArr.map((p) => Number(p.slippage_pct ?? p.value ?? 0)).filter((n) => isFinite(n));
		const avgNetSlippage = mean(slipValues);
		const cumulativeSlippage = (() => {
			const lastRow = last(slippageArr);
			const n = Number((lastRow as any)?.cumulative_slippage_pct ?? (lastRow as any)?.cumulative);
			return isFinite(n) ? n : null;
		})();

		const durations = durationsArr.map((d) => ({ duration: Number(d.duration), pnl: Number(d.pnl) })).filter((d) => isFinite(d.duration) && isFinite(d.pnl));
		const durationBins = pnlByDurationBins(durations);
		const avgDuration = mean(durations.map((d) => d.duration).filter((n) => isFinite(n))) ?? null;

		const exitDist = normalizeExitDist(exitsRaw);
		const exitTotal = exitDist.reduce((acc, x) => acc + (Number(x.value) || 0), 0);
		const topExit = exitDist[0]?.name ? String(exitDist[0].name) : null;
		const topExitPct = exitTotal > 0 && exitDist[0] ? (Number(exitDist[0].value) / exitTotal) * 100 : null;

		return {
			cards: cards || {},
			risk: risk || {},
			pnlFinal,
			avgNetSlippage,
			cumulativeSlippage,
			avgDuration,
			durationBins,
			topExit,
			topExitPct,
		};
	}, []);

	const fetchData = useCallback(async (start: string, end: string, ticker: string, dir: string, ids: string[], signal?: AbortSignal) => {
		setIsLoading(true);
		try {
			if (!ids.length) {
				setData({ experiments: [], metrics: [] });
				return;
			}

			const [allSummary, ...summaries] = await Promise.all([
				fetchExperimentSummary(start, end, ticker, dir, undefined, signal),
				...ids.map((id) => fetchExperimentSummary(start, end, ticker, dir, id, signal)),
			]);

			const valuesByExperiment: Record<string, any> = {};
			ids.forEach((id, i) => { valuesByExperiment[id] = summaries[i]; });

			const metricDefs: Array<{ key: string; name: string; unit: string; get: (s: any) => any }> = [
				{ key: 'totalPnl', name: 'Total PNL', unit: 'currency', get: (s) => s.cards?.totalPnl ?? null },
				{ key: 'winRate', name: 'Win Rate', unit: 'percent', get: (s) => s.cards?.winRate ?? null },
				{ key: 'avgTradeDuration', name: 'Avg Trade Duration', unit: 'seconds', get: (s) => s.cards?.avgTradeDuration ?? null },
				{ key: 'totalTrades', name: 'Total Trades', unit: 'count', get: (s) => s.cards?.totalTrades ?? null },
				{ key: 'totalInvestment', name: 'Total Investment', unit: 'currency', get: (s) => s.cards?.totalInvestment ?? null },
				{ key: 'sharpe', name: 'Sharpe', unit: 'decimal', get: (s) => s.risk?.sharpe ?? null },
				{ key: 'max_drawdown', name: 'Max Drawdown', unit: 'percent', get: (s) => (s.risk?.max_drawdown != null ? Number(s.risk.max_drawdown) * 100 : null) },
				{ key: 'annualized_return', name: 'Annualized Return', unit: 'percent', get: (s) => (s.risk?.annualized_return != null ? Number(s.risk.annualized_return) * 100 : null) },
				{ key: 'calmar', name: 'Calmar', unit: 'decimal', get: (s) => s.risk?.calmar ?? null },
				{ key: 'sortino', name: 'Sortino', unit: 'decimal', get: (s) => s.risk?.sortino ?? null },
				{ key: 'pnl_final', name: 'PNL (Final)', unit: 'currency', get: (s) => s.pnlFinal ?? null },
				{ key: 'avg_net_slip', name: 'Avg Net Slippage', unit: 'percent', get: (s) => s.avgNetSlippage ?? null },
				{ key: 'cum_slip', name: 'Cumulative Slippage', unit: 'percent', get: (s) => s.cumulativeSlippage ?? null },
				{ key: 'avg_duration_sec', name: 'Avg Duration (sec)', unit: 'seconds', get: (s) => s.avgDuration ?? null },
				{ key: 'top_exit', name: 'Top Exit Reason', unit: 'text', get: (s) => s.topExit ?? null },
				{ key: 'top_exit_pct', name: 'Top Exit %', unit: 'percent', get: (s) => s.topExitPct ?? null },
				...DURATION_BINS.map((b) => ({
					key: `pnl_dur_${b.label}`,
					name: `PNL ${b.label}`,
					unit: 'currency',
					get: (s: any) => s.durationBins?.[b.label] ?? null,
				})),
			];

			const metrics = metricDefs.map((m) => {
				const values: Record<string, string | number | null> = {};
				for (const id of ids) values[id] = m.get(valuesByExperiment[id]);
				values['all'] = m.get(allSummary);
				return { name: m.name, unit: m.unit, values };
			});

			setData({ experiments: ids, metrics });
		} catch (e: any) {
			// Abort means a newer request replaced this one; don't clobber state.
			if (e?.name === 'AbortError') return;
			setData(null);
		} finally {
			setIsLoading(false);
		}
	}, [fetchExperimentSummary]);

	useEffect(() => {
		const handleOpen = () => {
			setIsOpen(true);
			setStartDate(dashboardStart || '');
			setEndDate(dashboardEnd || '');
		};
		window.addEventListener('openTradeExperimentsTable', handleOpen);
		return () => window.removeEventListener('openTradeExperimentsTable', handleOpen);
	}, [dashboardStart, dashboardEnd]);

	useEffect(() => {
		// Phase 1: load experiment ids for this time window (this updates the store).
		if (!isOpen || !startDate || !endDate) return;
		loadExperiments(startDate, endDate);
	}, [isOpen, startDate, endDate, loadExperiments]);

	useEffect(() => {
		// Phase 2: fetch all experiment summaries once experiment ids are stable.
		if (!isOpen || !startDate || !endDate) return;
		if (!experimentIds.length) {
			setData({ experiments: [], metrics: [] });
			return;
		}

		abortRef.current?.abort();
		const ac = new AbortController();
		abortRef.current = ac;

		fetchData(startDate, endDate, symbol, direction, experimentIds, ac.signal);
		return () => ac.abort();
	}, [isOpen, startDate, endDate, symbol, direction, experimentIds, fetchData]);

	if (!isOpen) return null;

	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center"
			onClick={(e) => {
				if (e.target === e.currentTarget) setIsOpen(false);
			}}
		>
			<div className="absolute inset-0 bg-black/60 backdrop-blur-md" />
			<div className="relative w-[95vw] h-[90vh] rounded-lg border border-cyan-500/30 bg-black/90 backdrop-blur-sm shadow-2xl">
				<div className="flex items-center justify-between border-b border-cyan-500/20 px-4 py-3">
					<h2 className="metallic-title text-lg font-semibold uppercase tracking-wide">Experiments Table</h2>
					<button
						onClick={() => setIsOpen(false)}
						className="text-gray-400 hover:text-cyan-300 transition-colors text-xl font-bold"
					>
						×
					</button>
				</div>

				<div className="flex flex-wrap items-center gap-4 px-4 py-3 border-b border-cyan-500/20">
					<div className="flex items-center gap-2">
						<label className="text-sm text-gray-400">Symbol</label>
						<select
							value={symbol}
							onChange={(e) => setSymbol(e.target.value)}
							className="rounded border border-cyan-500/30 bg-black/50 px-3 py-1.5 text-sm text-gray-300 hover:border-cyan-500/50 hover:bg-black/70 transition-colors"
						>
							<option value="ALL">All</option>
							{symbols.map((s) => (
								<option key={s} value={s}>{s}</option>
							))}
						</select>
					</div>

					<div className="flex items-center gap-2">
						<label className="text-sm text-gray-400">Direction</label>
						<select
							value={direction}
							onChange={(e) => setDirection(e.target.value)}
							className="rounded border border-cyan-500/30 bg-black/50 px-3 py-1.5 text-sm text-gray-300 hover:border-cyan-500/50 hover:bg-black/70 transition-colors"
						>
							<option value="ALL">All</option>
							<option value="LONG">Long</option>
							<option value="SHORT">Short</option>
						</select>
					</div>

					<div className="flex items-center gap-2 relative" ref={timeDropdownRef}>
						<label className="text-sm text-gray-400">Time Period</label>
						<div className="relative">
							<button
								type="button"
								onClick={() => setIsTimeDropdownOpen(v => !v)}
								className="rounded border border-cyan-500/30 bg-black/50 px-3 py-1.5 text-sm text-gray-300 hover:border-cyan-500/50 hover:bg-black/70 transition-colors min-w-[190px] text-left flex items-center justify-between"
							>
								<span>{getTimeRangeLabel(timeRange)}</span>
								<svg className={`w-4 h-4 transition-transform ${isTimeDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
								</svg>
							</button>

							{isTimeDropdownOpen && (
								<div className="absolute top-full left-0 mt-1 rounded-lg border border-cyan-500/20 bg-black/90 backdrop-blur-sm shadow-lg z-50">
									<div className="p-3 flex flex-col gap-2">
										{(['1h','24h','48h','before','after','custom'] as TimeRange[]).map((r) => (
											<button
												key={r}
												type="button"
												onClick={() => { setTimeRange(r); setIsTimeDropdownOpen(false); }}
												className={`px-3 py-1.5 text-sm rounded border transition-colors w-[320px] text-left ${
													timeRange === r
														? 'border-cyan-500 bg-cyan-500/20 text-cyan-400'
														: 'border-cyan-500/30 bg-black/50 text-gray-300 hover:border-cyan-500/50 hover:bg-black/70'
												}`}
											>
												{getTimeRangeLabel(r)}
											</button>
										))}
									</div>
									{timeRange === 'before' && (
										<div className="border-t border-cyan-500/20 px-3 py-3">
											<div className="flex flex-col gap-2">
												<label className="text-sm text-gray-400">Date</label>
												<DatePicker
													selected={beforeDate}
													onChange={(date) => setBeforeDate(date)}
													showTimeSelect
													dateFormat="MM/dd/yyyy h:mm aa"
													className="w-[320px] min-w-[320px] rounded border border-cyan-500/30 bg-black/50 px-3 py-1.5 text-sm text-gray-300 hover:border-cyan-500/50 hover:bg-black/70 transition-colors"
													popperPlacement="bottom-start"
												/>
											</div>
										</div>
									)}
									{timeRange === 'after' && (
										<div className="border-t border-cyan-500/20 px-3 py-3">
											<div className="flex flex-col gap-2">
												<label className="text-sm text-gray-400">Date</label>
												<DatePicker
													selected={afterDate}
													onChange={(date) => setAfterDate(date)}
													showTimeSelect
													dateFormat="MM/dd/yyyy h:mm aa"
													className="w-[320px] min-w-[320px] rounded border border-cyan-500/30 bg-black/50 px-3 py-1.5 text-sm text-gray-300 hover:border-cyan-500/50 hover:bg-black/70 transition-colors"
													popperPlacement="bottom-start"
												/>
											</div>
										</div>
									)}
								</div>
							)}
						</div>
					</div>
				</div>

				<div className="h-[calc(90vh-120px)] px-2 py-2">
					<ExperimentsMetricsComparisonTable data={data} isLoading={isLoading} />
				</div>
			</div>
		</div>
	);
}

