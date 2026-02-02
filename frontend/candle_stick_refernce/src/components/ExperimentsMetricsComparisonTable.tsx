import { useMemo, useState } from 'react';
import ExcelStyleFilter from './ExcelStyleFilter';

type ComparisonOperator = '>' | '<' | '>=' | '<=' | '=' | '!=' | 'between';

interface ThresholdFilter {
	operator: ComparisonOperator;
	value1: number;
	value2?: number;
	color: string;
}

interface Metric {
	name: string;
	unit: string;
	values: Record<string, string | number | null>;
}

interface ExperimentsComparisonData {
	experiments: string[];
	metrics: Metric[];
}

interface Props {
	data: ExperimentsComparisonData | null;
	isLoading: boolean;
}

export default function ExperimentsMetricsComparisonTable({ data, isLoading }: Props) {
	const [filters, setFilters] = useState<Record<string, Set<string | number>>>({});
	const [thresholdFilters, setThresholdFilters] = useState<Record<string, ThresholdFilter | null>>({});
	const [openFilter, setOpenFilter] = useState<string | null>(null);

	const meetsThreshold = (value: unknown, threshold: ThresholdFilter | null): boolean => {
		if (!threshold) return false;
		if (value == null) return false;
		const n = typeof value === 'number' ? value : Number(value);
		if (!isFinite(n)) return false;
		const { operator, value1, value2 } = threshold;
		switch (operator) {
			case '>': return n > value1;
			case '<': return n < value1;
			case '>=': return n >= value1;
			case '<=': return n <= value1;
			case '=': return n === value1;
			case '!=': return n !== value1;
			case 'between':
				if (value2 === undefined) return false;
				return n >= value1 && n <= value2;
			default:
				return false;
		}
	};

	const tableData = useMemo(() => {
		if (!data || !data.experiments || !data.metrics) return null;

		const metricNames = data.metrics.map(m => m.name);
		const rows = data.experiments.map(experiment => {
			const row: Record<string, string | number | null> = { experiment };
			data.metrics.forEach(metric => {
				row[metric.name] = metric.values[experiment] ?? null;
			});
			return row;
		});

		const allRow: Record<string, string | number | null> = { experiment: 'All Experiments' };
		data.metrics.forEach(metric => {
			allRow[metric.name] = metric.values['all'] ?? null;
		});
		rows.push(allRow);

		let filteredRows = rows;
		Object.entries(filters).forEach(([column, selectedValues]) => {
			if (selectedValues.size > 0) {
				filteredRows = filteredRows.filter(row => selectedValues.has(row[column] as any));
			}
		});

		const columnValues: Record<string, (string | number)[]> = {};
		columnValues['experiment'] = rows.map(r => r.experiment as string);
		metricNames.forEach(metricName => {
			const vals = rows.map(r => r[metricName]).filter(v => v !== null) as Array<string | number>;
			columnValues[metricName] = vals;
		});

		return {
			rows: filteredRows,
			allRows: rows,
			metricNames,
			columnValues,
			units: data.metrics.reduce((acc, m) => {
				acc[m.name] = m.unit;
				return acc;
			}, {} as Record<string, string>),
		};
	}, [data, filters]);

	const formatValue = (value: string | number | null, unit: string): string => {
		if (typeof value === 'string') return value;
		if (value === null || value === undefined || isNaN(value as number)) return '-';
		const numValue = value as number;
		switch (unit) {
			case 'count':
				return numValue.toLocaleString();
			case 'decimal':
				return numValue.toFixed(4);
			case 'seconds':
				return numValue.toFixed(0);
			case 'percent':
				return `${numValue.toFixed(2)}%`;
			case 'currency':
				return `$${numValue.toFixed(2)}`;
			default:
				return numValue.toString();
		}
	};

	if (isLoading) {
		return (
			<div className="h-full flex items-center justify-center">
				<div className="animate-pulse text-gray-400">Loading...</div>
			</div>
		);
	}

	if (!tableData) {
		return (
			<div className="h-full flex items-center justify-center">
				<p className="text-gray-400 text-center">No data available. Please adjust your filters.</p>
			</div>
		);
	}

	return (
		<div className="h-full flex flex-col">
			<div className="flex-1 overflow-auto">
				<table className="min-w-full text-xs">
					<thead className="sticky top-0 bg-black text-gray-400 z-10">
						<tr>
							<th className="px-2 py-2 text-center border-b border-cyan-500/20">
								<div className="flex flex-col items-center justify-center gap-1">
									<span className="metallic-title text-xs font-semibold uppercase tracking-wide">Experiment</span>
									<ExcelStyleFilter
										columnName="Experiment"
										values={tableData.columnValues['experiment'] || []}
										selectedValues={filters['experiment'] || new Set()}
										onFilterChange={(selected) => setFilters(prev => ({ ...prev, experiment: selected }))}
										comparisonFilter={null}
										onComparisonFilterChange={() => {}}
										thresholdFilter={null}
										onThresholdFilterChange={() => {}}
										isOpen={openFilter === 'experiment'}
										onToggle={() => setOpenFilter(openFilter === 'experiment' ? null : 'experiment')}
									/>
								</div>
							</th>
							{tableData.metricNames.map((metricName) => (
								<th key={metricName} className="px-2 py-2 text-center border-b border-cyan-500/20">
									<div className="flex flex-col items-center justify-center gap-1">
										<span className="metallic-title text-xs font-semibold uppercase tracking-wide">{metricName}</span>
										<ExcelStyleFilter
											columnName={metricName}
											values={tableData.columnValues[metricName] || []}
											selectedValues={filters[metricName] || new Set()}
											onFilterChange={(selected) => setFilters(prev => ({ ...prev, [metricName]: selected }))}
											comparisonFilter={null}
											onComparisonFilterChange={() => {}}
											thresholdFilter={thresholdFilters[metricName] || null}
											onThresholdFilterChange={(filter) => setThresholdFilters(prev => ({ ...prev, [metricName]: filter }))}
											isOpen={openFilter === metricName}
											onToggle={() => setOpenFilter(openFilter === metricName ? null : metricName)}
										/>
									</div>
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{tableData.rows.length === 0 ? (
							<tr>
								<td colSpan={tableData.metricNames.length + 1} className="px-2 py-8 text-center text-gray-400">
									No rows match the selected filters.
								</td>
							</tr>
						) : (
							tableData.rows.map((row) => (
								<tr
									key={row.experiment as string}
									className={`border-b border-cyan-500/10 hover:bg-black/40 ${row.experiment === 'All Experiments' ? 'bg-black/60 font-semibold' : 'text-gray-300'}`}
								>
									<td className="px-2 py-2 font-medium text-center">{row.experiment}</td>
									{tableData.metricNames.map((metricName) => (
										<td
											key={metricName}
											className="px-2 py-2 text-center tabular-nums"
											style={{
												backgroundColor: meetsThreshold(row[metricName], thresholdFilters[metricName] || null)
													? (thresholdFilters[metricName]?.color || 'transparent')
													: 'transparent',
											}}
										>
											{formatValue(row[metricName] as any, tableData.units[metricName])}
										</td>
									))}
								</tr>
							))
						)}
					</tbody>
				</table>
			</div>
		</div>
	);
}

