import PortfolioMetricsControls from '../components/PortfolioMetricsControls';
import PortfolioExitReasonsPieChart from '../components/PortfolioExitReasonsPieChart';
import PortfolioTradeDurationHistogram from '../components/PortfolioTradeDurationHistogram';
import { useDashboardStore } from '../state/dashboardStore';
import AccountHistoryChart from '../components/AccountHistoryChart';
import OrderbookTable from '../components/OrderbookTable';
import { formatDuration } from '../utils/formatDuration';

export default function PortfolioMetricsPage() {
	const portfolioCardMetrics = useDashboardStore(s => s.portfolioCardMetrics);
	const portfolioRiskCards = useDashboardStore(s => s.portfolioRiskCards);

	const getPnlColor = (value: number | undefined) => {
		if (value === undefined || value === null) return 'text-gray-500';
		return value >= 0 ? 'text-emerald-400' : 'text-red-500';
	};

	return (
		<div className="space-y-6 metallic-emerald-bg min-h-screen px-6 py-8">
			<div className="flex items-center justify-between">
				<PortfolioMetricsControls />
			</div>

			{/* Metric Cards Header */}
			<div className="grid grid-cols-5 gap-4">
				<div className="metric-card-glow rounded-lg border border-cyan-500/20 bg-black/70 backdrop-blur-sm p-6">
					<h4 className="metallic-title text-xs font-medium uppercase tracking-wide mb-2">Total PNL</h4>
					<p className={`text-2xl font-bold font-mono ${getPnlColor(portfolioCardMetrics.totalPnl)}`}>
						${portfolioCardMetrics.totalPnl?.toFixed(2) ?? '-'}
					</p>
				</div>
				<div className="metric-card-glow rounded-lg border border-cyan-500/20 bg-black/70 backdrop-blur-sm p-6">
					<h4 className="metallic-title text-xs font-medium uppercase tracking-wide mb-2">Win Rate</h4>
					<p className="text-2xl font-bold font-mono text-gray-200">
						{portfolioCardMetrics.winRate?.toFixed(2) ?? '-'}%
					</p>
				</div>
				<div className="metric-card-glow rounded-lg border border-cyan-500/20 bg-black/70 backdrop-blur-sm p-6">
					<h4 className="metallic-title text-xs font-medium uppercase tracking-wide mb-2">Avg. Trade Duration</h4>
					<p className="text-2xl font-bold font-mono text-gray-200">
						{portfolioCardMetrics.avgTradeDuration ? formatDuration(portfolioCardMetrics.avgTradeDuration) : '-'}
					</p>
				</div>
				<div className="metric-card-glow rounded-lg border border-cyan-500/20 bg-black/70 backdrop-blur-sm p-6">
					<h4 className="metallic-title text-xs font-medium uppercase tracking-wide mb-2">Total Trades</h4>
					<p className="text-2xl font-bold font-mono text-gray-200">
						{portfolioCardMetrics.totalTrades ?? '-'}
					</p>
				</div>
				<div className="metric-card-glow rounded-lg border border-cyan-500/20 bg-black/70 backdrop-blur-sm p-6">
					<h4 className="metallic-title text-xs font-medium uppercase tracking-wide mb-2">Total Investment</h4>
					<p className="text-2xl font-bold font-mono text-gray-200">
						${portfolioCardMetrics.totalInvestment?.toLocaleString(undefined, { maximumFractionDigits: 0 }) ?? '-'}
					</p>
				</div>
			</div>

			{/* Account History Chart with Pie and Bar charts on the right */}
			<div className="grid grid-cols-1 gap-6 md:grid-cols-[64fr_36fr]">
				{/* Left: Account History Chart (64% width) */}
				<section>
					<AccountHistoryChart />
				</section>

				{/* Right: Stacked Pie and Bar charts (36% width) */}
				<section className="grid grid-cols-1 gap-6">
					<PortfolioTradeDurationHistogram />
					<PortfolioExitReasonsPieChart />
				</section>
			</div>

			{/* Risk Cards Row */}
			<div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
				<div className="metric-card-glow rounded-lg border border-cyan-500/20 bg-black/70 backdrop-blur-sm p-6">
					<h4 className="metallic-title text-xs font-medium uppercase tracking-wide mb-2">Sharpe Ratio</h4>
					<p className="text-2xl font-bold font-mono text-gray-200">{portfolioRiskCards.sharpe != null ? portfolioRiskCards.sharpe.toFixed(2) : '-'}</p>
				</div>
				<div className="metric-card-glow rounded-lg border border-cyan-500/20 bg-black/70 backdrop-blur-sm p-6">
					<h4 className="metallic-title text-xs font-medium uppercase tracking-wide mb-2">Max Drawdown</h4>
					<p className={`text-2xl font-bold font-mono ${portfolioRiskCards.max_drawdown != null && portfolioRiskCards.max_drawdown < 0 ? 'text-red-500' : 'text-gray-200'}`}>
						{portfolioRiskCards.max_drawdown != null ? (portfolioRiskCards.max_drawdown * 100).toFixed(1) + '%' : '-'}
					</p>
				</div>
				<div className="metric-card-glow rounded-lg border border-cyan-500/20 bg-black/70 backdrop-blur-sm p-6">
					<h4 className="metallic-title text-xs font-medium uppercase tracking-wide mb-2">Annualized Return</h4>
					<p className={`text-2xl font-bold font-mono ${portfolioRiskCards.annualized_return != null ? (portfolioRiskCards.annualized_return >= 0 ? 'text-emerald-400' : 'text-red-500') : 'text-gray-200'}`}>
						{portfolioRiskCards.annualized_return != null ? (portfolioRiskCards.annualized_return * 100).toFixed(1) + '%' : '-'}
					</p>
				</div>
				<div className="metric-card-glow rounded-lg border border-cyan-500/20 bg-black/70 backdrop-blur-sm p-6">
					<h4 className="metallic-title text-xs font-medium uppercase tracking-wide mb-2">Calmar Ratio</h4>
					<p className="text-2xl font-bold font-mono text-gray-200">{portfolioRiskCards.calmar != null ? portfolioRiskCards.calmar.toFixed(2) : '-'}</p>
				</div>
				<div className="metric-card-glow rounded-lg border border-cyan-500/20 bg-black/70 backdrop-blur-sm p-6">
					<h4 className="metallic-title text-xs font-medium uppercase tracking-wide mb-2">Sortino Ratio</h4>
					<p className="text-2xl font-bold font-mono text-gray-200">{portfolioRiskCards.sortino != null ? portfolioRiskCards.sortino.toFixed(2) : '-'}</p>
				</div>
				<div className="metric-card-glow rounded-lg border border-cyan-500/20 bg-black/70 backdrop-blur-sm p-6">
					<h4 className="metallic-title text-xs font-medium uppercase tracking-wide mb-2">Total Return</h4>
					<p className={`text-2xl font-bold font-mono ${portfolioRiskCards.total_return != null ? (portfolioRiskCards.total_return >= 0 ? 'text-emerald-400' : 'text-red-500') : 'text-gray-200'}`}>
						{portfolioRiskCards.total_return != null ? (portfolioRiskCards.total_return * 100).toFixed(1) + '%' : '-'}
					</p>
				</div>
			</div>

			{/* Open Positions Table */}
			<section className="rounded-lg border border-cyan-500/20 bg-black/80 backdrop-blur-sm shadow-lg">
				<header className="border-b border-cyan-500/20 px-6 py-4">
					<h2 className="metallic-title text-sm font-semibold uppercase tracking-wide">Open Positions</h2>
				</header>
				<div className="overflow-x-auto">
					<table className="min-w-full text-sm">
						<thead className="bg-black text-gray-400">
							<tr>
								<th className="px-6 py-4 text-left font-medium uppercase tracking-wide text-xs">Asset</th>
								<th className="px-6 py-4 text-left font-medium uppercase tracking-wide text-xs">Price</th>
								<th className="px-6 py-4 text-left font-medium uppercase tracking-wide text-xs">Qty</th>
								<th className="px-6 py-4 text-left font-medium uppercase tracking-wide text-xs">Market Value</th>
								<th className="px-6 py-4 text-left font-medium uppercase tracking-wide text-xs">Total PNL</th>
							</tr>
						</thead>
						<tbody>
							<tr>
								<td className="px-6 py-4 text-gray-500" colSpan={5}>
									<div className="text-center">No open positions</div>
								</td>
							</tr>
						</tbody>
					</table>
				</div>
			</section>

			{/* Trade Logs Table */}
			<OrderbookTable />
		</div>
	);
}
