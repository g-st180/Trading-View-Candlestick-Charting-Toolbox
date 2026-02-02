import { useEffect } from 'react';
import { useDashboardStore } from '../state/dashboardStore';

const TIMEFRAMES = ['1Min','5Min','15Min','30Min','1Hour','1Day'];

export default function OhlcvChartControls() {
	const {
		ohlcvTimeframe,
		loadTickers,
		setters,
	} = useDashboardStore();

	const {
		setOhlcvTimeframe,
	} = setters;

	useEffect(() => {
		loadTickers();
	}, [loadTickers]);

	return (
		<div className="flex flex-wrap items-center gap-4">
			<div className="flex items-center gap-2">
				<label className="text-sm text-gray-600">Timeframe</label>
				<select
					className="rounded border px-2 py-1 text-sm"
					value={ohlcvTimeframe}
					onChange={(e) => setOhlcvTimeframe(e.target.value)}
				>
					{TIMEFRAMES.map(tf => (
						<option key={tf} value={tf}>{tf}</option>
					))}
				</select>
			</div>
		</div>
	);
}
