import DashboardControls from '../components/DashboardControls';
import ExitReasonsPieChart from '../components/ExitReasonsPieChart';
import TradeDurationHistogram from '../components/TradeDurationHistogram';
import { useDashboardStore } from '../state/dashboardStore';
import PnlCurveChart from '../components/PnlCurveChart';
import InteractiveCandlesChart from '../components/InteractiveCandlesChart';
import OhlcvChartControls from '../components/OhlcvChartControls';
import TradeSlippageChart from '../components/TradeSlippageChart';
import Watchlist from '../components/Watchlist';
import TradeComparisonModal from '../components/TradeComparisonModal';
import TradeExperimentsMetricsModal from '../components/TradeExperimentsMetricsModal';
import { formatDuration } from '../utils/formatDuration';
import { useState } from 'react';
import ExperimentMetricModal from '../components/ExperimentMetricModal';
import ExperimentChartsModal from '../components/ExperimentChartsModal';

export default function DashboardPage() {
	const cardMetrics = useDashboardStore(s => s.cardMetrics);
	const riskCards = useDashboardStore(s => s.riskCards);
	const [metricModalOpen, setMetricModalOpen] = useState(false);
	const [metricKey, setMetricKey] = useState<'totalPnl' | 'winRate' | 'avgTradeDuration' | 'totalTrades' | 'totalInvestment'>('totalPnl');
	const [metricTitle, setMetricTitle] = useState('Total PNL');
	const [chartsModalOpen, setChartsModalOpen] = useState(false);
	const [chartsKind, setChartsKind] = useState<'exit_reasons' | 'slippage' | 'trade_duration'>('exit_reasons');
	const [chartsTitle, setChartsTitle] = useState('Exit Reasons');

	const getPnlColor = (value: number | undefined) => {
		if (value === undefined || value === null) return 'text-gray-500';
		return value >= 0 ? 'text-emerald-400' : 'text-red-500';
	};

	return (
		<div className="space-y-6 metallic-emerald-bg min-h-screen px-6 py-8">
			<div className="flex items-center justify-between">
				<DashboardControls />
			</div>

			{/* Metric Cards Header */}
			<div className="grid grid-cols-5 gap-4">
				<button
					type="button"
					onClick={() => { setMetricKey('totalPnl'); setMetricTitle('Total PNL'); setMetricModalOpen(true); }}
					className="metric-card-glow rounded-lg border border-cyan-500/20 bg-black/70 backdrop-blur-sm p-6 text-left hover:border-cyan-500/40 transition-all"
				>
					<h4 className="metallic-title text-xs font-medium uppercase tracking-wide mb-2">Total PNL</h4>
					<p className={`text-2xl font-bold font-mono ${getPnlColor(cardMetrics.totalPnl)}`}>
						${cardMetrics.totalPnl?.toFixed(2) ?? '-'}
					</p>
				</button>
				<button
					type="button"
					onClick={() => { setMetricKey('winRate'); setMetricTitle('Win Rate'); setMetricModalOpen(true); }}
					className="rounded-lg border border-cyan-500/20 bg-black/70 backdrop-blur-sm p-6 shadow-lg hover:border-cyan-500/40 transition-all text-left"
				>
					<h4 className="metallic-title text-xs font-medium uppercase tracking-wide mb-2">Win Rate</h4>
					<p className="text-2xl font-bold font-mono text-gray-200">
						{cardMetrics.winRate?.toFixed(2) ?? '-'}%
					</p>
				</button>
				<button
					type="button"
					onClick={() => { setMetricKey('avgTradeDuration'); setMetricTitle('Avg. Trade Duration'); setMetricModalOpen(true); }}
					className="rounded-lg border border-cyan-500/20 bg-black/70 backdrop-blur-sm p-6 shadow-lg hover:border-cyan-500/40 transition-all text-left"
				>
					<h4 className="metallic-title text-xs font-medium uppercase tracking-wide mb-2">Avg. Trade Duration</h4>
					<p className="text-2xl font-bold font-mono text-gray-200">
						{cardMetrics.avgTradeDuration ? formatDuration(cardMetrics.avgTradeDuration) : '-'}
					</p>
				</button>
				<button
					type="button"
					onClick={() => { setMetricKey('totalTrades'); setMetricTitle('Total Trades'); setMetricModalOpen(true); }}
					className="rounded-lg border border-cyan-500/20 bg-black/70 backdrop-blur-sm p-6 shadow-lg hover:border-cyan-500/40 transition-all text-left"
				>
					<h4 className="metallic-title text-xs font-medium uppercase tracking-wide mb-2">Total Trades</h4>
					<p className="text-2xl font-bold font-mono text-gray-200">
						{cardMetrics.totalTrades ?? '-'}
					</p>
				</button>
				<button
					type="button"
					onClick={() => { setMetricKey('totalInvestment'); setMetricTitle('Total Investment'); setMetricModalOpen(true); }}
					className="rounded-lg border border-cyan-500/20 bg-black/70 backdrop-blur-sm p-6 shadow-lg hover:border-cyan-500/40 transition-all text-left"
				>
					<h4 className="metallic-title text-xs font-medium uppercase tracking-wide mb-2">Total Investment</h4>
					<p className="text-2xl font-bold font-mono text-gray-200">
						${cardMetrics.totalInvestment?.toLocaleString(undefined, { maximumFractionDigits: 0 }) ?? '-'}
					</p>
				</button>
			</div>

		{/* PNL Curve with Watchlist on the right */}
		<div className="grid grid-cols-1 gap-6 md:grid-cols-[2fr_1fr]">
			{/* Left: PNL Curve */}
			<section>
				<PnlCurveChart />
			</section>

			{/* Right: Watchlist */}
			<section>
				<Watchlist />
			</section>
		</div>

		{/* Risk Cards Row */}
		<div className="grid grid-cols-2 md:grid-cols-5 gap-4">
			<div className="metric-card-glow rounded-lg border border-cyan-500/20 bg-black/70 backdrop-blur-sm p-6">
				<h4 className="metallic-title text-xs font-medium uppercase tracking-wide mb-2">Sharpe Ratio</h4>
				<p className="text-2xl font-bold font-mono text-gray-200">{riskCards.sharpe != null ? riskCards.sharpe.toFixed(2) : '-'}</p>
			</div>
			<div className="rounded-lg border border-cyan-500/20 bg-black/70 backdrop-blur-sm p-6 shadow-lg hover:border-cyan-500/40 transition-all">
				<h4 className="metallic-title text-xs font-medium uppercase tracking-wide mb-2">Max Drawdown</h4>
				<p className={`text-2xl font-bold font-mono ${riskCards.max_drawdown != null && riskCards.max_drawdown < 0 ? 'text-red-500' : 'text-gray-200'}`}>
					{riskCards.max_drawdown != null ? (riskCards.max_drawdown * 100).toFixed(1) + '%' : '-'}
				</p>
			</div>
			<div className="rounded-lg border border-cyan-500/20 bg-black/70 backdrop-blur-sm p-6 shadow-lg hover:border-cyan-500/40 transition-all">
				<h4 className="metallic-title text-xs font-medium uppercase tracking-wide mb-2">Annualized Return</h4>
				<p className={`text-2xl font-bold font-mono ${riskCards.annualized_return != null ? (riskCards.annualized_return >= 0 ? 'text-emerald-400' : 'text-red-500') : 'text-gray-200'}`}>
					{riskCards.annualized_return != null ? (riskCards.annualized_return * 100).toFixed(1) + '%' : '-'}
				</p>
			</div>
			<div className="rounded-lg border border-cyan-500/20 bg-black/70 backdrop-blur-sm p-6 shadow-lg hover:border-cyan-500/40 transition-all">
				<h4 className="metallic-title text-xs font-medium uppercase tracking-wide mb-2">Calmar Ratio</h4>
				<p className="text-2xl font-bold font-mono text-gray-200">{riskCards.calmar != null ? riskCards.calmar.toFixed(2) : '-'}</p>
			</div>
			<div className="rounded-lg border border-cyan-500/20 bg-black/70 backdrop-blur-sm p-6 shadow-lg hover:border-cyan-500/40 transition-all">
				<h4 className="metallic-title text-xs font-medium uppercase tracking-wide mb-2">Sortino Ratio</h4>
				<p className="text-2xl font-bold font-mono text-gray-200">{riskCards.sortino != null ? riskCards.sortino.toFixed(2) : '-'}</p>
			</div>
		</div>

		{/* Trade Duration, Exit Reasons, and Slippage */}
		<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
			<button
				type="button"
				className="text-left hover:opacity-95 transition-opacity"
				onClick={() => { setChartsKind('trade_duration'); setChartsTitle('PNL by Trade Duration (per experiment)'); setChartsModalOpen(true); }}
			>
				<TradeDurationHistogram />
			</button>
			<button
				type="button"
				className="text-left hover:opacity-95 transition-opacity"
				onClick={() => { setChartsKind('exit_reasons'); setChartsTitle('Exit Reasons (per experiment)'); setChartsModalOpen(true); }}
			>
				<ExitReasonsPieChart />
			</button>
			<button
				type="button"
				className="text-left hover:opacity-95 transition-opacity"
				onClick={() => { setChartsKind('slippage'); setChartsTitle('Slippage (per experiment)'); setChartsModalOpen(true); }}
			>
				<TradeSlippageChart />
			</button>
		</div>

		{/* Candlestick Chart Section */}
		<div className="space-y-4">
			<div className="flex items-center justify-between px-2">
				<OhlcvChartControls />
			</div>
			<section className="w-full">
				<InteractiveCandlesChart />
			</section>
		</div>

		{/* Trade Comparison Modal */}
		<TradeComparisonModal />
		<TradeExperimentsMetricsModal />
		<ExperimentMetricModal
			isOpen={metricModalOpen}
			onClose={() => setMetricModalOpen(false)}
			title={metricTitle}
			metricKey={metricKey}
		/>
		<ExperimentChartsModal
			isOpen={chartsModalOpen}
			onClose={() => setChartsModalOpen(false)}
			kind={chartsKind}
			title={chartsTitle}
		/>
	</div>
	);
}
