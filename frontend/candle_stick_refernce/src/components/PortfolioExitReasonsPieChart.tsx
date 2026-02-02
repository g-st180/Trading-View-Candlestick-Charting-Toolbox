import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { useDashboardStore } from '../state/dashboardStore';
import { useMemo } from 'react';
import Skeleton from './Skeleton';

const COLORS = ['#06b6d4', '#14b8a6', '#10b981', '#ef4444', '#a5f3fc', '#22d3ee', '#34d399', '#f87171'];

export default function PortfolioExitReasonsPieChart() {
	const rawData = useDashboardStore((s) => s.exitDist);
	const data = useMemo(() => rawData, [rawData]);
	return (
		<div className="rounded-lg border border-cyan-500/20 bg-black/80 backdrop-blur-sm shadow-lg">
			<h3 className="metallic-title px-6 pt-6 pb-4 text-sm font-semibold uppercase tracking-wide">Exit Reasons</h3>
			<div className="aspect-[5/2.43] px-6 -mb-6">
				{!data || data.length === 0 ? (
					<div className="p-6">
						<Skeleton className="h-[200px] w-full" />
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
								labelClassName="text-xs text-gray-200"
								wrapperClassName="rounded-md border border-cyan-500/20 bg-black/80 backdrop-blur-sm"
							/>
							<Legend 
								verticalAlign="bottom" 
								wrapperStyle={{ fontSize: '0.7rem', color: '#a3a3a3' }}
							/>
						</PieChart>
					</ResponsiveContainer>
				)}
			</div>
		</div>
	);
}
