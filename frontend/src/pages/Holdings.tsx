export default function Holdings() {
	// Placeholder data
	const holdings = [
		{ symbol: 'RELIANCE', quantity: 10, avgPrice: 2450.50, currentPrice: 2580.75, pnl: 1302.50, pnlPercent: 5.31 },
		{ symbol: 'TCS', quantity: 5, avgPrice: 3450.00, currentPrice: 3620.25, pnl: 851.25, pnlPercent: 4.93 },
		{ symbol: 'HDFC BANK', quantity: 15, avgPrice: 1650.75, currentPrice: 1720.50, pnl: 1046.25, pnlPercent: 4.22 },
		{ symbol: 'INFY', quantity: 8, avgPrice: 1450.00, currentPrice: 1520.75, pnl: 566.00, pnlPercent: 4.88 },
	];

	const totalInvested = holdings.reduce((sum, h) => sum + (h.quantity * h.avgPrice), 0);
	const totalCurrent = holdings.reduce((sum, h) => sum + (h.quantity * h.currentPrice), 0);
	const totalPnl = totalCurrent - totalInvested;
	const totalPnlPercent = (totalPnl / totalInvested) * 100;

	return (
		<div className="max-w-[1920px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
			{/* Summary Cards */}
			<div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
				<div className="bg-white rounded-lg border border-slate-200 p-4">
					<div className="text-sm text-slate-500 mb-1">Total Invested</div>
					<div className="text-xl font-semibold text-slate-900">₹{totalInvested.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
				</div>
				<div className="bg-white rounded-lg border border-slate-200 p-4">
					<div className="text-sm text-slate-500 mb-1">Current Value</div>
					<div className="text-xl font-semibold text-slate-900">₹{totalCurrent.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
				</div>
				<div className="bg-white rounded-lg border border-slate-200 p-4">
					<div className="text-sm text-slate-500 mb-1">Total P&L</div>
					<div className={`text-xl font-semibold ${totalPnl >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
						{totalPnl >= 0 ? '+' : ''}₹{totalPnl.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
					</div>
				</div>
				<div className="bg-white rounded-lg border border-slate-200 p-4">
					<div className="text-sm text-slate-500 mb-1">Total P&L %</div>
					<div className={`text-xl font-semibold ${totalPnlPercent >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
						{totalPnlPercent >= 0 ? '+' : ''}{totalPnlPercent.toFixed(2)}%
					</div>
				</div>
			</div>

			{/* Holdings Table */}
			<div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
				<div className="px-6 py-4 border-b border-slate-200">
					<h2 className="text-lg font-semibold text-slate-900">Your Holdings</h2>
				</div>
				<div className="overflow-x-auto">
					<table className="w-full">
						<thead className="bg-slate-50">
							<tr>
								<th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Symbol</th>
								<th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Quantity</th>
								<th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Avg Price</th>
								<th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Current Price</th>
								<th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Invested</th>
								<th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Current Value</th>
								<th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">P&L</th>
								<th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">P&L %</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-slate-100">
							{holdings.map((holding, index) => (
								<tr key={index} className="hover:bg-slate-50">
									<td className="px-6 py-4 whitespace-nowrap">
										<div className="font-semibold text-slate-900">{holding.symbol}</div>
									</td>
									<td className="px-6 py-4 whitespace-nowrap text-right text-sm text-slate-900">{holding.quantity}</td>
									<td className="px-6 py-4 whitespace-nowrap text-right text-sm text-slate-900">₹{holding.avgPrice.toFixed(2)}</td>
									<td className="px-6 py-4 whitespace-nowrap text-right text-sm text-slate-900">₹{holding.currentPrice.toFixed(2)}</td>
									<td className="px-6 py-4 whitespace-nowrap text-right text-sm text-slate-900">₹{(holding.quantity * holding.avgPrice).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
									<td className="px-6 py-4 whitespace-nowrap text-right text-sm text-slate-900">₹{(holding.quantity * holding.currentPrice).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
									<td className={`px-6 py-4 whitespace-nowrap text-right text-sm font-medium ${holding.pnl >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
										{holding.pnl >= 0 ? '+' : ''}₹{holding.pnl.toFixed(2)}
									</td>
									<td className={`px-6 py-4 whitespace-nowrap text-right text-sm font-medium ${holding.pnlPercent >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
										{holding.pnlPercent >= 0 ? '+' : ''}{holding.pnlPercent.toFixed(2)}%
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</div>
		</div>
	);
}
