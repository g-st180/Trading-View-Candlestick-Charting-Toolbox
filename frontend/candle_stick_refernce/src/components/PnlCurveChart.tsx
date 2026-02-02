import { useEffect, useMemo, useState } from 'react';
import { useDashboardStore } from '../state/dashboardStore';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import Skeleton from './Skeleton';

export default function PnlCurveChart() {
	const pnlSeries = useDashboardStore(s => s.pnlSeries);
	const selectedSymbol = useDashboardStore(s => s.selectedSymbol);
	const dashboardStart = useDashboardStore(s => s.dashboardStart);
	const dashboardEnd = useDashboardStore(s => s.dashboardEnd);
	const selectedDirection = useDashboardStore(s => s.selectedDirection);
	const experiments = useDashboardStore(s => s.experiments);
	const selectedExperimentId = useDashboardStore(s => s.selectedExperimentId);

	const [perExperiment, setPerExperiment] = useState<Record<string, any[]>>({});
	const [perExperimentLoading, setPerExperimentLoading] = useState(false);

	const experimentIds = useMemo(() => {
		const uniq = Array.from(new Set((experiments || []).filter(Boolean)));
		return uniq;
	}, [experiments]);

	useEffect(() => {
		// When "ALL" is selected, draw a line per experiment (A/B/...) instead of a combined curve.
		if (selectedExperimentId !== 'ALL') {
			setPerExperiment({});
			setPerExperimentLoading(false);
			return;
		}
		if (!dashboardStart || !dashboardEnd) return;
		if (!experimentIds || experimentIds.length === 0) return;

		const paramsBase = new URLSearchParams();
		if (dashboardStart) paramsBase.set('start_date', dashboardStart);
		if (dashboardEnd) paramsBase.set('end_date', dashboardEnd);
		if (selectedSymbol && selectedSymbol !== 'ALL') paramsBase.set('ticker', selectedSymbol);
		if (selectedDirection && selectedDirection !== 'ALL') paramsBase.set('direction', selectedDirection);

		const fetchOne = async (expId: string) => {
			const params = new URLSearchParams(paramsBase);
			params.set('experiment_id', expId);
			const res = await fetch(`/api/pnl_curve?${params.toString()}`, { cache: 'no-store' });
			const json = await res.json();
			return Array.isArray(json) ? json : [];
		};

		let cancelled = false;
		setPerExperimentLoading(true);
		Promise.all(experimentIds.map(async (id) => [id, await fetchOne(id)] as const))
			.then((pairs) => {
				if (cancelled) return;
				const out: Record<string, any[]> = {};
				for (const [id, arr] of pairs) out[id] = arr;
				setPerExperiment(out);
			})
			.catch(() => {
				if (cancelled) return;
				setPerExperiment({});
			})
			.finally(() => {
				if (cancelled) return;
				setPerExperimentLoading(false);
			});

		return () => { cancelled = true; };
	}, [selectedExperimentId, experimentIds, dashboardStart, dashboardEnd, selectedSymbol, selectedDirection]);

	const chartData = useMemo(() => {
		if (selectedExperimentId !== 'ALL' || experimentIds.length === 0) {
			return pnlSeries.map((pt, idx) => ({
				tradeNumber: idx + 1,
				timestamp: pt.ts,
				pnl: pt.value ?? 0,
			}));
		}

		const maxN = Math.max(0, ...experimentIds.map((id) => (perExperiment[id]?.length ?? 0)));
		const rows: any[] = [];
		for (let i = 0; i < maxN; i++) {
			const row: any = { tradeNumber: i + 1 };
			for (const id of experimentIds) row[`pnl_${id}`] = perExperiment[id]?.[i]?.value ?? null;
			rows.push(row);
		}
		return rows;
	}, [pnlSeries, selectedExperimentId, experimentIds, perExperiment]);

	const yAxisFormatter = (value: any) => {
		const n = Number(value);
		if (isNaN(n)) return '';
		if (Math.abs(n) > 1000) return `${(n / 1000).toFixed(1)}k`;
		return n.toFixed(0);
	};

	const colors = useMemo(
		() => ['#a5f3fc', '#14b8a6', '#fbbf24', '#a78bfa', '#f472b6', '#34d399', '#f87171', '#22d3ee'],
		[]
	);

	return (
		<section className="rounded-lg border border-cyan-500/20 bg-black/80 backdrop-blur-sm p-6 shadow-lg">
			<div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-2 mb-3">
				<h3 className="metallic-title text-sm font-semibold uppercase tracking-wide">
					PNL Curve {selectedSymbol ? `- ${selectedSymbol}` : ''}
				</h3>
				{selectedExperimentId === 'ALL' && experimentIds.length > 0 && (
					<div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-[11px] text-gray-300">
						{experimentIds.map((id, i) => (
							<div key={id} className="flex items-center gap-2">
								<span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: colors[i % colors.length] }} />
								<span className="uppercase tracking-wide text-gray-300">{id}</span>
							</div>
						))}
					</div>
				)}
			</div>
			{(selectedExperimentId === 'ALL' && perExperimentLoading) ? (
				<Skeleton className="h-[440px] w-full" />
			) : chartData.length === 0 ? (
				<Skeleton className="h-[440px] w-full" />
			) : (
				<ResponsiveContainer width="100%" height={440}>
					<LineChart data={chartData} margin={{ left: 20, right: 40, top: 20, bottom: 30 }}>
						<CartesianGrid strokeDasharray="3 3" stroke="#06b6d4" opacity={0.15} />
						<XAxis
							tick={{ fontSize: '0.7rem', fill: '#6b7280' }}
							axisLine={{ stroke: '#06b6d4', opacity: 0.3 }}
							tickLine={{ stroke: '#06b6d4', opacity: 0.3 }}
							dataKey="tradeNumber"
							type="number"
							domain={[1, 'dataMax']}
							allowDecimals={false}
							label={{ value: 'Trade #', position: 'insideBottom', offset: -10, fontSize: '0.75rem', fill: '#6b7280' }}
						/>
						<YAxis
							tick={{ fontSize: '0.7rem', fill: '#6b7280' }}
							tickCount={5}
							domain={['auto', 'auto']}
							allowDecimals={false}
							tickFormatter={yAxisFormatter}
							axisLine={{ stroke: '#06b6d4', opacity: 0.3 }}
							tickLine={{ stroke: '#06b6d4', opacity: 0.3 }}
							unit="$"
						/>
						<Tooltip
							labelFormatter={(label) => `Trade #${label}`}
							formatter={(value, name) => [`$${Number(value).toFixed(2)}`, name]}
							labelClassName="text-xs font-bold text-gray-300"
							contentStyle={{ 
								backgroundColor: '#000000', 
								border: '1px solid #06b6d4',
								borderRadius: '0.375rem',
								color: '#e5e7eb'
							}}
							wrapperClassName="rounded-md border border-cyan-500/50 bg-black shadow-xl"
						/>
						{(selectedExperimentId !== 'ALL' || experimentIds.length === 0) ? (
							<Line 
								type="monotone" 
								dataKey="pnl" 
								stroke="#a5f3fc" 
								strokeWidth={2.5} 
								dot={false} 
								name="Cumulative PNL"
								isAnimationActive={false}
							/>
						) : (
							<>
								{experimentIds.map((id, i) => {
									return (
										<Line
											key={id}
											type="monotone"
											dataKey={`pnl_${id}`}
											stroke={colors[i % colors.length]}
											strokeWidth={2.5}
											dot={false}
											name={`Experiment ${id}`}
											isAnimationActive={false}
										/>
									);
								})}
							</>
						)}
					</LineChart>
				</ResponsiveContainer>
			)}
		</section>
	);
}
