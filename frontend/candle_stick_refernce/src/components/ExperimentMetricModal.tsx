import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useDashboardStore } from '../state/dashboardStore';
import Skeleton from './Skeleton';

type MetricKey = 'totalPnl' | 'winRate' | 'avgTradeDuration' | 'totalTrades' | 'totalInvestment';

function formatDuration(seconds: number): string {
	// lightweight local formatter (avoid importing util into modal)
	if (!isFinite(seconds) || seconds <= 0) return '-';
	const s = Math.floor(seconds);
	if (s < 60) return `${s}s`;
	const m = Math.floor(s / 60);
	if (m < 60) return `${m}m`;
	const h = Math.floor(m / 60);
	return `${h}h`;
}

function formatValue(metricKey: MetricKey, v: any): string {
	if (v == null || v === '' || (typeof v === 'number' && !isFinite(v))) return '-';
	const n = Number(v);
	switch (metricKey) {
		case 'totalPnl':
			return isFinite(n) ? `$${n.toFixed(2)}` : '-';
		case 'winRate':
			return isFinite(n) ? `${n.toFixed(2)}%` : '-';
		case 'avgTradeDuration':
			return isFinite(n) ? formatDuration(n) : '-';
		case 'totalTrades':
			return isFinite(n) ? `${Math.trunc(n)}` : '-';
		case 'totalInvestment':
			return isFinite(n) ? `$${Math.round(n).toLocaleString()}` : '-';
		default:
			return String(v);
	}
}

export default function ExperimentMetricModal({
	isOpen,
	onClose,
	title,
	metricKey,
}: {
	isOpen: boolean;
	onClose: () => void;
	title: string;
	metricKey: MetricKey;
}) {
	const experiments = useDashboardStore((s) => s.experiments);
	const dashboardStart = useDashboardStore((s) => s.dashboardStart);
	const dashboardEnd = useDashboardStore((s) => s.dashboardEnd);
	const selectedSymbol = useDashboardStore((s) => s.selectedSymbol);
	const selectedDirection = useDashboardStore((s) => s.selectedDirection);

	const [isLoading, setIsLoading] = useState(false);
	const [rows, setRows] = useState<Array<{ experiment_id: string; value: string }>>([]);

	const experimentIds = useMemo(() => {
		const uniq = Array.from(new Set((experiments || []).filter(Boolean)));
		// Show ALL row first, then each experiment id.
		return ['ALL', ...uniq];
	}, [experiments]);

	useEffect(() => {
		if (!isOpen) return;

		const paramsBase = new URLSearchParams();
		if (dashboardStart) paramsBase.set('start_date', dashboardStart);
		if (dashboardEnd) paramsBase.set('end_date', dashboardEnd);
		if (selectedSymbol && selectedSymbol !== 'ALL') paramsBase.set('ticker', selectedSymbol);
		if (selectedDirection && selectedDirection !== 'ALL') paramsBase.set('direction', selectedDirection);

		const fetchOne = async (experiment_id: string) => {
			const params = new URLSearchParams(paramsBase);
			if (experiment_id !== 'ALL') params.set('experiment_id', experiment_id);
			const res = await fetch(`/api/card_metrics?${params.toString()}`, { cache: 'no-store' });
			const json = await res.json();
			const raw = (json && typeof json === 'object') ? (json as any)[metricKey] : null;
			return { experiment_id, value: formatValue(metricKey, raw) };
		};

		let cancelled = false;
		setIsLoading(true);
		Promise.all(experimentIds.map(fetchOne))
			.then((out) => {
				if (cancelled) return;
				setRows(out);
			})
			.catch(() => {
				if (cancelled) return;
				setRows([]);
			})
			.finally(() => {
				if (cancelled) return;
				setIsLoading(false);
			});

		return () => {
			cancelled = true;
		};
	}, [isOpen, metricKey, dashboardStart, dashboardEnd, selectedSymbol, selectedDirection, experimentIds]);

	if (!isOpen) return null;

	const modal = (
		<div
			// Use a very high z-index so the fade covers the entire app, including any sticky nav/header.
			className="fixed inset-0 z-[9999] flex items-center justify-center"
			onClick={(e) => {
				if (e.target === e.currentTarget) onClose();
			}}
		>
			{/* Light, immersive overlay */}
			<div className="absolute inset-0 bg-black/75 backdrop-blur-sm" />

			<div className="relative w-[720px] max-w-[92vw] rounded-2xl border border-cyan-500/20 bg-black/55 backdrop-blur-sm shadow-2xl">
				<div className="flex items-center justify-between px-4 py-3">
					<h2 className="metallic-title text-sm font-semibold uppercase tracking-wide">{title}</h2>
					<button
						onClick={onClose}
						className="rounded-full border border-cyan-500/20 bg-black/40 backdrop-blur-sm px-3 py-2 text-gray-200 hover:border-cyan-500/40 hover:bg-black/50 transition-colors"
						aria-label="Close"
					>
						<span className="text-xl font-bold leading-none">×</span>
					</button>
				</div>

				<div className="p-4">
					{isLoading ? (
						<Skeleton className="h-[180px] w-full" />
					) : (
						<div className="overflow-hidden rounded-xl border border-cyan-500/15 bg-black/30 backdrop-blur-sm">
							<table className="min-w-full text-sm">
								<thead className="bg-black/40 text-gray-400">
									<tr>
										<th className="px-4 py-3 text-left font-medium uppercase tracking-wide text-xs">Experiment</th>
										<th className="px-4 py-3 text-right font-medium uppercase tracking-wide text-xs">Value</th>
									</tr>
								</thead>
								<tbody>
									{rows.length === 0 ? (
										<tr>
											<td className="px-4 py-4 text-gray-500" colSpan={2}>
												<div className="text-center">No data</div>
											</td>
										</tr>
									) : (
										rows.map((r) => (
											<tr key={r.experiment_id} className="border-t border-cyan-500/10">
												<td className="px-4 py-3 text-gray-200">
													{r.experiment_id === 'ALL' ? 'ALL (combined)' : r.experiment_id}
												</td>
												<td className="px-4 py-3 text-right font-mono text-gray-200">{r.value}</td>
											</tr>
										))
									)}
								</tbody>
							</table>
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

