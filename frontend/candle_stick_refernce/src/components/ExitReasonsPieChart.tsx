import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { useDashboardStore } from '../state/dashboardStore';
import { useMemo } from 'react';
import Skeleton from './Skeleton';

const COLORS = ['#3b82f6', '#34d399', '#f87171', '#fbbf24', '#a78bfa', '#22d3ee', '#84cc16', '#f472b6'];

export default function ExitReasonsPieChart() {
	const rawData = useDashboardStore((s) => s.exitDist);
	const data = useMemo(() => rawData, [rawData]);
	return (
		<div className="rounded-lg border border-cyan-500/20 bg-black/80 backdrop-blur-sm shadow-lg">
			<h3 className="metallic-title px-6 pt-6 pb-4 text-sm font-semibold uppercase tracking-wide">Exit Reasons</h3>
			<div className="aspect-[5/3.15] px-6 -mb-6">
				{!data || data.length === 0 ? (
					<div className="p-6">
						<Skeleton className="h-[220px] w-full" />
					</div>
				) : (
					<ResponsiveContainer width="100%" height="100%">
						<PieChart margin={{ bottom: 40, top: 10, right: 10, left: 10 }}>
							<Pie data={data} dataKey="value" nameKey="name" innerRadius={48} outerRadius={80}>
								{data.map((_, i) => (
									<Cell key={`c-${i}`} fill={COLORS[i % COLORS.length]} />
								))}
							</Pie>
							<Tooltip 
								formatter={(v, n) => [String(v), String(n)]}
								contentStyle={{ 
									backgroundColor: '#000000', 
									border: '1px solid #06b6d4',
									borderRadius: '0.375rem',
									color: '#e5e7eb'
								}}
							/>
							<Legend 
								verticalAlign="bottom" 
								wrapperStyle={{ fontSize: '0.7rem', color: '#6b7280' }}
							/>
						</PieChart>
					</ResponsiveContainer>
				)}
			</div>
		</div>
	);
}
