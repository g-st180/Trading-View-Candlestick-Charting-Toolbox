import { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from 'recharts';
import { TimeSeriesPoint } from '../state/dashboardStore';
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

export default function MetricLineChart({ 
	title, 
	series, 
	color = '#2563eb',
	yAxisTickFormatter,
	tooltipValueFormatter,
	percentile95,
}: { 
	title: string; 
	series: TimeSeriesPoint[]; 
	color?: string;
	yAxisTickFormatter?: (value: any) => string;
	tooltipValueFormatter?: (value: any) => string;
	percentile95?: number | null;
}) {
	const data = useMemo(() => series, [series]);
	
	// Calculate Y-axis domain to include percentile if it exists
	const yAxisDomain = useMemo(() => {
		if (!data || data.length === 0) {
			return [ 'dataMin - 0.1', 'dataMax + 0.1' ];
		}
		
		const values = data.map(d => Number(d.value)).filter(v => isFinite(v));
		if (values.length === 0) {
			return [ 'dataMin - 0.1', 'dataMax + 0.1' ];
		}
		
		let min = Math.min(...values);
		let max = Math.max(...values);
		
		// Include percentile in the domain if it exists
		if (percentile95 != null && typeof percentile95 === 'number' && isFinite(percentile95)) {
			max = Math.max(max, percentile95);
			min = Math.min(min, percentile95);
		}
		
		// Add padding
		const range = max - min;
		const padding = range * 0.1 || 0.1;
		
		return [min - padding, max + padding];
	}, [data, percentile95]);
	
	const defaultYAxisTickFormatter = (v: any) => {
		const n = Number(v);
		if (!isFinite(n)) return '';
		return n < 1 ? n.toFixed(3) : n.toFixed(1);
	};

	const defaultTooltipValueFormatter = (v: any) => `${Number(v).toFixed(3)} s`;

	return (
		<div className="rounded-lg border border-cyan-500/20 bg-black/80 backdrop-blur-sm shadow-lg">
			<div className="px-4 pt-4 pb-3 h-[52px] flex items-start">
				<h3 className="metallic-title text-sm font-semibold uppercase tracking-wide leading-tight line-clamp-2">{title}</h3>
			</div>
			<div className="aspect-[5/3] px-4 pb-4">
				{(!data || data.length === 0) ? (
					<div className="p-4">
						<Skeleton className="h-full w-full" />
					</div>
				) : (
				<ResponsiveContainer width="100%" height="100%">
					<LineChart data={data} margin={{ left: -16, right: 0, top: 5, bottom: 20 }}>
						<CartesianGrid stroke="#06b6d4" strokeDasharray="3 3" opacity={0.15} />
						<XAxis
							tick={{ fontSize: '0.7rem', fill: '#6b7280' }}
							axisLine={{ stroke: '#06b6d4', opacity: 0.3 }}
							tickLine={{ stroke: '#06b6d4', opacity: 0.3 }}
							dataKey="ts"
							type="number"
							domain={["dataMin", "dataMax"]}
							tickCount={4}
							tickFormatter={(v) => formatTick(Number(v))}
						/>
						<YAxis
							tick={{ fontSize: '0.7rem', fill: '#6b7280' }}
							axisLine={{ stroke: '#06b6d4', opacity: 0.3 }}
							tickLine={{ stroke: '#06b6d4', opacity: 0.3 }}
							tickCount={5}
							domain={yAxisDomain}
							allowDecimals
							tickFormatter={yAxisTickFormatter || defaultYAxisTickFormatter}
						/>
						<Tooltip
							formatter={tooltipValueFormatter || defaultTooltipValueFormatter}
							labelFormatter={(label) => formatFull(Number(label))}
							labelClassName="text-xs font-bold text-gray-300"
							contentStyle={{ 
								backgroundColor: '#000000', 
								border: '1px solid #06b6d4',
								borderRadius: '0.375rem',
								color: '#e5e7eb'
							}}
						/>
						{percentile95 != null && typeof percentile95 === 'number' && isFinite(percentile95) && (
							<ReferenceLine 
								y={percentile95} 
								stroke="#ef4444" 
								strokeDasharray="5 5" 
								strokeWidth={1}
								label={{ value: "95th %ile (7d)", position: "right", fill: "#ef4444", fontSize: 10 }}
							/>
						)}
						<Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={false} isAnimationActive={false} />
					</LineChart>
				</ResponsiveContainer>
				)}
			</div>
		</div>
	);
}
