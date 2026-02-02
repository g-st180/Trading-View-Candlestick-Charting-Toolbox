import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { BarChart, Bar, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, ReferenceLine } from 'recharts';
import { useDashboardStore } from '../state/dashboardStore';
import Skeleton from './Skeleton';

type ChartKind = 'exit_reasons' | 'slippage' | 'trade_duration';

const PIE_COLORS = ['#3b82f6', '#34d399', '#f87171', '#fbbf24', '#a78bfa', '#22d3ee', '#84cc16', '#f472b6'];

// Duration bins (seconds)
const DURATION_BINS = [
	{ label: '0-1m', max: 60 },
	{ label: '1-5m', max: 300 },
	{ label: '5-15m', max: 900 },
	{ label: '15-60m', max: 3600 },
	{ label: '1-4h', max: 14400 },
	{ label: '>4h', max: Infinity },
];

function toPieArray(input: any): Array<{ name: string; value: number }> {
	if (!input) return [];
	if (Array.isArray(input)) {
		return input
			.map((x: any) => ({ name: String(x?.name ?? x?.exit_reason ?? ''), value: Number(x?.value ?? x?.count ?? 0) }))
			.filter((x) => x.name && isFinite(x.value));
	}
	if (typeof input === 'object') {
		return Object.entries(input)
			.map(([k, v]) => ({ name: String(k), value: Number(v as any) }))
			.filter((x) => x.name && isFinite(x.value));
	}
	return [];
}

function normalizeSlippage(payload: any) {
	const rows = Array.isArray(payload) ? payload : [];
	return rows.map((r: any) => ({
		ts: (() => {
			const v = r.ts ?? r.timestamp ?? r.time;
			const d = new Date(v);
			const t = d.getTime();
			return isFinite(t) ? t : 0;
		})(),
		value: Number(r.value ?? r.slippage_pct ?? 0),
		cumulative: Number(r.cumulative ?? r.cumulative_slippage_pct ?? 0),
		trade_number: r.trade_number != null ? Number(r.trade_number) : undefined,
	})).filter((r: any) => isFinite(r.value) && isFinite(r.cumulative) && (r.trade_number == null || isFinite(r.trade_number)));
}

function processDurationHistogram(rows: any[]): Array<{ name: string; pnl: number }> {
	const bins = DURATION_BINS.map((b) => ({ name: b.label, pnl: 0 }));
	for (const r of rows || []) {
		const duration = Number((r as any)?.duration ?? 0);
		const pnl = Number((r as any)?.pnl ?? 0);
		if (!isFinite(duration) || !isFinite(pnl)) continue;
		for (let i = 0; i < DURATION_BINS.length; i++) {
			if (duration <= DURATION_BINS[i].max) {
				bins[i].pnl += pnl;
				break;
			}
		}
	}
	return bins;
}

export default function ExperimentChartsModal({
	isOpen,
	onClose,
	kind,
	title,
}: {
	isOpen: boolean;
	onClose: () => void;
	kind: ChartKind;
	title: string;
}) {
	const experiments = useDashboardStore((s) => s.experiments);
	const dashboardStart = useDashboardStore((s) => s.dashboardStart);
	const dashboardEnd = useDashboardStore((s) => s.dashboardEnd);
	const selectedSymbol = useDashboardStore((s) => s.selectedSymbol);
	const selectedDirection = useDashboardStore((s) => s.selectedDirection);

	const experimentIds = useMemo(() => Array.from(new Set((experiments || []).filter(Boolean))), [experiments]);
	const [isLoading, setIsLoading] = useState(false);
	const [byExperiment, setByExperiment] = useState<Record<string, any>>({});

	useEffect(() => {
		if (!isOpen) return;

		const paramsBase = new URLSearchParams();
		if (dashboardStart) paramsBase.set('start_date', dashboardStart);
		if (dashboardEnd) paramsBase.set('end_date', dashboardEnd);
		if (selectedSymbol && selectedSymbol !== 'ALL') paramsBase.set('ticker', selectedSymbol);
		if (selectedDirection && selectedDirection !== 'ALL') paramsBase.set('direction', selectedDirection);

		const endpoint =
			kind === 'exit_reasons' ? '/api/exit_reasons' :
			kind === 'slippage' ? '/api/slippage' :
			'/api/trade_durations';

		const fetchOne = async (expId: string) => {
			const params = new URLSearchParams(paramsBase);
			params.set('experiment_id', expId);
			const res = await fetch(`${endpoint}?${params.toString()}`, { cache: 'no-store' });
			const json = await res.json();
			return json;
		};

		let cancelled = false;
		setIsLoading(true);
		Promise.all(experimentIds.map(async (id) => [id, await fetchOne(id)] as const))
			.then((pairs) => {
				if (cancelled) return;
				const out: Record<string, any> = {};
				for (const [id, payload] of pairs) out[id] = payload;
				setByExperiment(out);
			})
			.catch(() => {
				if (cancelled) return;
				setByExperiment({});
			})
			.finally(() => {
				if (cancelled) return;
				setIsLoading(false);
			});

		return () => { cancelled = true; };
	}, [isOpen, kind, dashboardStart, dashboardEnd, selectedSymbol, selectedDirection, experimentIds]);

	if (!isOpen) return null;

	const modal = (
		<div
			// Use a very high z-index so the fade covers the entire app, including any sticky nav/header.
			className="fixed inset-0 z-[9999] flex items-center justify-center"
			onClick={(e) => {
				if (e.target === e.currentTarget) onClose();
			}}
		>
			{/* Light, immersive overlay (subtle fade + slight blur) */}
			<div className="absolute inset-0 bg-black/75 backdrop-blur-sm" />

			{/* No big opaque panel; just a floating header + tiles */}
			<div className="relative w-[95vw] h-[90vh] flex flex-col">
				<div className="flex items-center justify-between px-2 py-2">
					<div className="rounded-full border border-cyan-500/20 bg-black/40 backdrop-blur-sm px-4 py-2 shadow-lg">
						<h2 className="metallic-title text-sm font-semibold uppercase tracking-wide">{title}</h2>
					</div>
					<button
						onClick={onClose}
						className="rounded-full border border-cyan-500/20 bg-black/40 backdrop-blur-sm px-3 py-2 text-gray-200 hover:border-cyan-500/40 hover:bg-black/50 transition-colors shadow-lg"
						aria-label="Close"
					>
						<span className="text-xl font-bold leading-none">×</span>
					</button>
				</div>

				<div className="px-2 pb-2 flex-1 overflow-y-auto">
					{isLoading ? (
						<div className="rounded-lg border border-cyan-500/10 bg-black/30 backdrop-blur-sm p-4">
							<Skeleton className="h-full w-full" />
						</div>
					) : experimentIds.length === 0 ? (
						<div className="text-gray-400 text-sm">No experiments found.</div>
					) : (
						<div className="flex flex-wrap justify-center content-start gap-6">
							{experimentIds.map((expId) => {
								const payload = byExperiment[expId];
								const pieData = toPieArray(payload);
								const slippageData = normalizeSlippage(payload);
								const durationData = processDurationHistogram(Array.isArray(payload) ? payload : []);
								return (
									<div
										key={expId}
										// Dark panel behind the actual chart (keep outer overlay faded)
										className="rounded-lg border border-cyan-500/20 bg-black/85 shadow-xl w-[380px] max-w-[92vw]"
									>
										<div className="px-4 pt-4 pb-3 h-[52px] flex items-start justify-between">
											<h3 className="metallic-title text-sm font-semibold uppercase tracking-wide leading-tight line-clamp-2">
												{kind === 'exit_reasons' ? 'Exit Reasons' : kind === 'slippage' ? 'Slippage (%)' : 'PNL by Trade Duration'}
											</h3>
											<div className="text-xs text-gray-400 uppercase tracking-wide">{expId}</div>
										</div>
										<div className="aspect-[5/3] px-4 pb-4">
											{kind === 'exit_reasons' && (
												(!pieData || pieData.length === 0 ? (
													<div className="p-4">
														<Skeleton className="h-full w-full" />
													</div>
												) : (
													<div className="h-full w-full flex flex-col">
														<div className="flex-1 min-h-0">
															<ResponsiveContainer width="100%" height="100%">
																<PieChart margin={{ bottom: 0, top: 10, right: 10, left: 10 }}>
																	<Pie data={pieData} dataKey="value" nameKey="name" innerRadius={42} outerRadius={74}>
																		{pieData.map((_, i) => (
																			<Cell key={`c-${i}`} fill={PIE_COLORS[i % PIE_COLORS.length]} />
																		))}
																	</Pie>
																	<Tooltip
																		formatter={(v, n) => [String(v), String(n)]}
																		contentStyle={{
																			backgroundColor: '#000000',
																			border: '1px solid #06b6d4',
																			borderRadius: '0.375rem',
																			color: '#e5e7eb',
																		}}
																	/>
																</PieChart>
															</ResponsiveContainer>
														</div>

														{/* Compact legend below the pie (never overlaps the chart). */}
														<div className="mt-2 max-h-[72px] overflow-auto pr-1">
															<div className="grid grid-cols-2 gap-x-3 gap-y-1">
																{pieData.map((row, i) => (
																	<div key={`${row.name}-${i}`} className="flex items-center gap-2 min-w-0">
																		<span
																			className="inline-block h-2.5 w-2.5 rounded-sm flex-none"
																			style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }}
																		/>
																		<span className="text-[11px] text-gray-300 truncate" title={row.name}>
																			{row.name}
																		</span>
																	</div>
																))}
															</div>
														</div>
													</div>
												))
											)}

											{kind === 'slippage' && (
												(!slippageData || slippageData.length === 0 ? (
													<div className="p-4">
														<Skeleton className="h-full w-full" />
													</div>
												) : (
													<ResponsiveContainer width="100%" height="100%">
														<LineChart data={slippageData} margin={{ left: -16, right: 0, top: 5, bottom: 20 }}>
															<CartesianGrid stroke="#06b6d4" strokeDasharray="3 3" opacity={0.15} />
															<XAxis
																tick={{ fontSize: '0.7rem', fill: '#6b7280' }}
																axisLine={{ stroke: '#06b6d4', opacity: 0.3 }}
																tickLine={{ stroke: '#06b6d4', opacity: 0.3 }}
																dataKey={'trade_number'}
																type="number"
																domain={[1, 'dataMax']}
																tickCount={6}
																tickFormatter={(v) => `#${v}`}
																allowDecimals={false}
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
																formatter={(value: number, name: string) => [`${Number(value).toFixed(4)}%`, name === 'Cumulative' ? 'Cumulative Slippage' : 'Per-Trade Slippage']}
																labelFormatter={(label) => `Trade #${label}`}
																labelClassName="text-xs font-bold text-gray-300"
																contentStyle={{
																	backgroundColor: '#000000',
																	border: '1px solid #06b6d4',
																	borderRadius: '0.375rem',
																	color: '#e5e7eb',
																}}
															/>
															<Legend wrapperStyle={{ fontSize: '0.7rem', color: '#6b7280' }} />
															<Line name="Cumulative" type="monotone" dataKey="cumulative" stroke="#06b6d4" strokeWidth={2} dot={false} isAnimationActive={false} />
															<Line name="Per-Trade" type="monotone" dataKey="value" stroke="#14b8a6" strokeWidth={2} dot={false} isAnimationActive={false} />
														</LineChart>
													</ResponsiveContainer>
												))
											)}

											{kind === 'trade_duration' && (
												(!durationData || durationData.length === 0 ? (
													<div className="p-4">
														<Skeleton className="h-full w-full" />
													</div>
												) : (
													<ResponsiveContainer width="100%" height="100%">
														<BarChart data={durationData} margin={{ left: 20, right: 20, top: 10, bottom: 30 }}>
															<XAxis dataKey="name" tick={{ fontSize: '0.7rem', fill: '#6b7280' }} axisLine={{ stroke: '#06b6d4', opacity: 0.3 }} tickLine={{ stroke: '#06b6d4', opacity: 0.3 }} />
															<YAxis
																tick={{ fontSize: '0.7rem', fill: '#6b7280' }}
																axisLine={{ stroke: '#06b6d4', opacity: 0.3 }}
																tickLine={{ stroke: '#06b6d4', opacity: 0.3 }}
																tickFormatter={(v) => `$${Number(v).toLocaleString()}`}
																allowDecimals
															/>
															<Tooltip
																formatter={(value: number) => [`$${Number(value).toFixed(2)}`, 'Total PNL']}
																labelClassName="text-xs font-bold text-gray-300"
																contentStyle={{
																	backgroundColor: '#000000',
																	border: '1px solid #06b6d4',
																	borderRadius: '0.375rem',
																	color: '#e5e7eb',
																}}
															/>
															<ReferenceLine y={0} stroke="#06b6d4" strokeWidth={1.5} opacity={0.4} />
															<Bar dataKey="pnl">
																{durationData.map((entry, i) => (
																	<Cell key={`${expId}-c-${i}`} fill={entry.pnl >= 0 ? '#10b981' : '#ef4444'} />
																))}
															</Bar>
														</BarChart>
													</ResponsiveContainer>
												))
											)}
										</div>
									</div>
								);
							})}
						</div>
					)}
				</div>
			</div>
		</div>
	);

	// Portal to <body> so the overlay is truly page-level (covers sticky header/nav reliably).
	if (typeof document === 'undefined') return null;
	return createPortal(modal, document.body);
}

