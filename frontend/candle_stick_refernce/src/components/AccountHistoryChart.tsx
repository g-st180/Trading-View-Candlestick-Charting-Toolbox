import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from 'recharts';
import { useDashboardStore } from '../state/dashboardStore';
import Skeleton from './Skeleton';

function formatTick(ts: number) {
	const d = new Date(ts);
	return d.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit' });
}

function formatFull(ts: number) {
	const d = new Date(ts);
	return d.toLocaleString('en-US', { 
		timeZone: 'America/New_York',
		month: 'numeric',
		day: 'numeric',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
		hour12: false 
	});
}

export default function AccountHistoryChart() {
	const data = useDashboardStore(s => s.accountHistory);

	const yAxisFormatter = (value: any) => {
		const n = Number(value);
		if (isNaN(n)) return '';
		if (n > 1000) return `${(n / 1000).toFixed(1)}k`;
		return n.toFixed(0);
	};

	return (
		<div className="rounded-lg border border-cyan-500/20 bg-black/80 backdrop-blur-sm p-6 shadow-lg h-full flex flex-col">
			<h3 className="metallic-title mb-4 text-sm font-semibold uppercase tracking-wide">Account History</h3>
			<div className="flex-1">
				{!data || data.length === 0 ? (
					<Skeleton className="h-full w-full" />
				) : (
					<ResponsiveContainer width="100%" height="100%">
						<LineChart data={data} margin={{ left: 20, right: 40, top: 20, bottom: 30 }}>
							<CartesianGrid strokeDasharray="3 3" stroke="#06b6d4" opacity={0.15} />
							<XAxis
								tick={{ fontSize: '0.7rem', fill: '#a3a3a3' }}
								axisLine={{ stroke: '#06b6d4', opacity: 0.3 }}
								tickLine={{ stroke: '#06b6d4', opacity: 0.3 }}
								dataKey="timestamp"
								type="number"
								domain={["dataMin", "dataMax"]}
								tickCount={5}
								tickFormatter={(v) => formatTick(Number(v))}
							/>
							<YAxis
								tick={{ fontSize: '0.7rem', fill: '#a3a3a3' }}
								axisLine={{ stroke: '#06b6d4', opacity: 0.3 }}
								tickLine={{ stroke: '#06b6d4', opacity: 0.3 }}
								tickCount={5}
								domain={[ 'dataMin - 100', 'dataMax + 100' ]}
								allowDecimals={false}
								tickFormatter={yAxisFormatter}
								unit="$"
							/>
							<Tooltip
								labelFormatter={(label) => formatFull(Number(label))}
								formatter={(value, name) => [`$${Number(value).toFixed(2)}`, name]}
								labelClassName="text-xs font-bold text-gray-200"
								wrapperClassName="rounded-md border border-cyan-500/20 bg-black/80 backdrop-blur-sm"
							/>
							<Legend wrapperStyle={{ fontSize: '0.7rem', color: '#a3a3a3' }} />
							<Line type="monotone" dataKey="portfolio" name="Portfolio" stroke="#a5f3fc" dot={false} isAnimationActive={false} />
						</LineChart>
					</ResponsiveContainer>
				)}
			</div>
		</div>
	);
}
