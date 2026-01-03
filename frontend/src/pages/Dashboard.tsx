import CandlestickChart from '../CandlestickChart';
import Watchlist from '../components/Watchlist';

export default function Dashboard() {
	return (
		<div className="max-w-7xl mx-auto px-6 lg:px-8 py-8">
			<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
				<div className="lg:col-span-2">
					<div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden" style={{ height: '600px' }}>
						<CandlestickChart height={600} />
					</div>
				</div>
				<div className="lg:col-span-1">
					<Watchlist />
				</div>
			</div>
		</div>
	);
}

