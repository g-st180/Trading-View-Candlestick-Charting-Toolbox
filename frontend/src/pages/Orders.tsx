export default function Orders() {
	// Placeholder orders data
	const orders = [
		{ id: 'ORD001', symbol: 'RELIANCE', type: 'BUY', quantity: 10, price: 2450.50, status: 'COMPLETE', time: '10:30 AM', date: '2024-01-15' },
		{ id: 'ORD002', symbol: 'TCS', type: 'BUY', quantity: 5, price: 3450.00, status: 'COMPLETE', time: '11:15 AM', date: '2024-01-15' },
		{ id: 'ORD003', symbol: 'NIFTY', type: 'SELL', quantity: 50, price: 19500.00, status: 'PENDING', time: '02:45 PM', date: '2024-01-15' },
		{ id: 'ORD004', symbol: 'INFY', type: 'BUY', quantity: 8, price: 1450.00, status: 'COMPLETE', time: '09:20 AM', date: '2024-01-14' },
		{ id: 'ORD005', symbol: 'HDFC BANK', type: 'SELL', quantity: 15, price: 1650.75, status: 'CANCELLED', time: '03:30 PM', date: '2024-01-14' },
	];

	const getStatusColor = (status: string) => {
		switch (status) {
			case 'COMPLETE':
				return 'bg-emerald-100 text-emerald-800';
			case 'PENDING':
				return 'bg-yellow-100 text-yellow-800';
			case 'CANCELLED':
				return 'bg-red-100 text-red-800';
			default:
				return 'bg-slate-100 text-slate-800';
		}
	};

	return (
		<div className="max-w-[1920px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
			<div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
				<div className="px-6 py-4 border-b border-slate-200">
					<h2 className="text-lg font-semibold text-slate-900">All Orders</h2>
				</div>
				<div className="overflow-x-auto">
					<table className="w-full">
						<thead className="bg-slate-50">
							<tr>
								<th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Order ID</th>
								<th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Symbol</th>
								<th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Type</th>
								<th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Quantity</th>
								<th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Price</th>
								<th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Total</th>
								<th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
								<th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Date & Time</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-slate-100">
							{orders.map((order, index) => (
								<tr key={index} className="hover:bg-slate-50">
									<td className="px-6 py-4 whitespace-nowrap">
										<div className="text-sm font-medium text-slate-900">{order.id}</div>
									</td>
									<td className="px-6 py-4 whitespace-nowrap">
										<div className="text-sm font-semibold text-slate-900">{order.symbol}</div>
									</td>
									<td className="px-6 py-4 whitespace-nowrap">
										<span className={`inline-flex px-2 py-1 text-xs font-medium rounded ${
											order.type === 'BUY' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
										}`}>
											{order.type}
										</span>
									</td>
									<td className="px-6 py-4 whitespace-nowrap text-right text-sm text-slate-900">{order.quantity}</td>
									<td className="px-6 py-4 whitespace-nowrap text-right text-sm text-slate-900">₹{order.price.toFixed(2)}</td>
									<td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium text-slate-900">
										₹{(order.quantity * order.price).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
									</td>
									<td className="px-6 py-4 whitespace-nowrap">
										<span className={`inline-flex px-2 py-1 text-xs font-medium rounded ${getStatusColor(order.status)}`}>
											{order.status}
										</span>
									</td>
									<td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
										{order.date} {order.time}
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
