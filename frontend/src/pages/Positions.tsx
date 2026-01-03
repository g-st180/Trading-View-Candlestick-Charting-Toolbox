export default function Positions() {
	// Placeholder F&O positions data
	const positions = [
		{ symbol: 'NIFTY', type: 'FUT', quantity: 50, entryPrice: 19500.00, currentPrice: 19650.75, pnl: 7537.50, pnlPercent: 0.77 },
		{ symbol: 'BANKNIFTY', type: 'CE', quantity: 25, entryPrice: 450.00, currentPrice: 520.50, pnl: 1762.50, pnlPercent: 15.67 },
		{ symbol: 'RELIANCE', type: 'PE', quantity: 100, entryPrice: 120.00, currentPrice: 95.25, pnl: -2475.00, pnlPercent: -20.63 },
	];

	const totalPnl = positions.reduce((sum, p) => sum + p.pnl, 0);

	return (
		<div className="max-w-[1920px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
			{/* Summary */}
			<div className="bg-white rounded-lg border border-slate-200 p-6 mb-6">
				<div className="flex items-center justify-between">
					<div>
						<div className="text-sm text-slate-500 mb-1">Total P&L</div>
						<div className={`text-3xl font-bold ${totalPnl >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
							{totalPnl >= 0 ? '+' : ''}₹{totalPnl.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
						</div>
					</div>
					<div className="text-right">
						<div className="text-sm text-slate-500 mb-1">Active Positions</div>
						<div className="text-2xl font-semibold text-slate-900">{positions.length}</div>
					</div>
				</div>
			</div>

			{/* Positions Table */}
			<div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
				<div className="px-6 py-4 border-b border-slate-200">
					<h2 className="text-lg font-semibold text-slate-900">F&O Positions</h2>
				</div>
				<div className="overflow-x-auto">
					<table className="w-full">
						<thead className="bg-slate-50">
							<tr>
								<th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Symbol</th>
								<th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Type</th>
								<th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Quantity</th>
								<th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Entry Price</th>
								<th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Current Price</th>
								<th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">P&L</th>
								<th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">P&L %</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-slate-100">
							{positions.map((position, index) => (
								<tr key={index} className="hover:bg-slate-50">
									<td className="px-6 py-4 whitespace-nowrap">
										<div className="font-semibold text-slate-900">{position.symbol}</div>
									</td>
									<td className="px-6 py-4 whitespace-nowrap">
										<span className={`inline-flex px-2 py-1 text-xs font-medium rounded ${
											position.type === 'FUT' ? 'bg-blue-100 text-blue-800' :
											position.type === 'CE' ? 'bg-emerald-100 text-emerald-800' :
											'bg-red-100 text-red-800'
										}`}>
											{position.type}
										</span>
									</td>
									<td className="px-6 py-4 whitespace-nowrap text-right text-sm text-slate-900">{position.quantity}</td>
									<td className="px-6 py-4 whitespace-nowrap text-right text-sm text-slate-900">₹{position.entryPrice.toFixed(2)}</td>
									<td className="px-6 py-4 whitespace-nowrap text-right text-sm text-slate-900">₹{position.currentPrice.toFixed(2)}</td>
									<td className={`px-6 py-4 whitespace-nowrap text-right text-sm font-medium ${position.pnl >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
										{position.pnl >= 0 ? '+' : ''}₹{position.pnl.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
									</td>
									<td className={`px-6 py-4 whitespace-nowrap text-right text-sm font-medium ${position.pnlPercent >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
										{position.pnlPercent >= 0 ? '+' : ''}{position.pnlPercent.toFixed(2)}%
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
