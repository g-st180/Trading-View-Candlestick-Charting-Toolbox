export default function Watchlist() {
	// Placeholder data - Indian stocks matching Groww style
	const watchlistItems = [
		{ symbol: 'RELIANCE', price: 2580.75, change: 45.25, changePercent: 1.78 },
		{ symbol: 'TCS', price: 3620.25, change: -28.50, changePercent: -0.78 },
		{ symbol: 'HDFC BANK', price: 1720.50, change: 32.75, changePercent: 1.94 },
		{ symbol: 'INFY', price: 1520.75, change: -15.25, changePercent: -0.99 },
		{ symbol: 'ICICI BANK', price: 1125.50, change: 18.75, changePercent: 1.69 },
		{ symbol: 'HINDUNILVR', price: 2650.00, change: 12.50, changePercent: 0.47 },
	];

	return (
		<div className="rounded-xl border border-slate-200 bg-white shadow-sm">
			<div className="px-6 py-4 border-b border-slate-200">
				<h2 className="text-lg font-semibold text-slate-900">Watchlist</h2>
			</div>
			<div className="divide-y divide-slate-100">
				{watchlistItems.map((item, index) => (
					<div key={index} className="px-6 py-4 hover:bg-slate-50 transition-colors cursor-pointer">
						<div className="flex items-center justify-between">
							<div>
								<div className="font-semibold text-slate-900">{item.symbol}</div>
								<div className="text-sm text-slate-500 mt-0.5">₹{item.price.toFixed(2)}</div>
							</div>
							<div className="text-right">
								<div className={`font-medium ${item.change >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
									{item.change >= 0 ? '+' : ''}{item.change.toFixed(2)}
								</div>
								<div className={`text-sm ${item.changePercent >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
									{item.changePercent >= 0 ? '+' : ''}{item.changePercent.toFixed(2)}%
								</div>
							</div>
						</div>
					</div>
				))}
			</div>
		</div>
	);
}

