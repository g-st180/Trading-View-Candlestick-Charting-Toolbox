import { useMemo, useState } from 'react';
import ExcelStyleFilter from './ExcelStyleFilter';

interface Metric {
    name: string;
    unit: string;
    values: Record<string, number | null>;
}

interface TradingComparisonData {
    models: string[];
    metrics: Metric[];
}

type ComparisonOperator = '>' | '<' | '>=' | '<=' | '=' | '!=' | 'between';

interface ThresholdFilter {
    operator: ComparisonOperator;
    value1: number;
    value2?: number;
    color: string; // Hex color for cell background
}

interface TradingMetricsComparisonTableProps {
    data: TradingComparisonData | null;
    isLoading: boolean;
}

export default function TradingMetricsComparisonTable({ data, isLoading }: TradingMetricsComparisonTableProps) {
    // Filter state: track which values are selected for each column
    const [filters, setFilters] = useState<Record<string, Set<string | number>>>({});
    // Threshold filter state: track threshold operators and colors for numeric columns (for cell coloring, not filtering)
    const [thresholdFilters, setThresholdFilters] = useState<Record<string, ThresholdFilter | null>>({});
    const [openFilter, setOpenFilter] = useState<string | null>(null);
    
    // Helper function to check if a value meets threshold condition
    const meetsThreshold = (value: number | null, threshold: ThresholdFilter | null): boolean => {
        if (!threshold || value === null || typeof value !== 'number') return false;
        const { operator, value1, value2 } = threshold;
        switch (operator) {
            case '>': return value > value1;
            case '<': return value < value1;
            case '>=': return value >= value1;
            case '<=': return value <= value1;
            case '=': return value === value1;
            case '!=': return value !== value1;
            case 'between':
                if (value2 === undefined) return false;
                return value >= value1 && value <= value2;
            default: return false;
        }
    };

    const tableData = useMemo(() => {
        if (!data || !data.models || !data.metrics) return null;

        // Transform: models as rows, metrics as columns
        const metricNames = data.metrics.map(m => m.name);
        const rows = data.models.map(model => {
            const row: Record<string, string | number | null> = { model };
            data.metrics.forEach(metric => {
                row[metric.name] = metric.values[model] ?? null;
            });
            return row;
        });

        // Add "All Models" aggregate row
        const allRow: Record<string, string | number | null> = { model: 'All Models' };
        data.metrics.forEach(metric => {
            allRow[metric.name] = metric.values['all'] ?? null;
        });
        rows.push(allRow);

        // Apply filters (only value-based; thresholds are for coloring, not filtering)
        let filteredRows = rows;
        
        // Apply value-based filters
        Object.entries(filters).forEach(([column, selectedValues]) => {
            if (selectedValues.size > 0) {
                filteredRows = filteredRows.filter(row => {
                    const value = row[column];
                    return selectedValues.has(value as string | number);
                });
            }
        });
        
        // Note: Threshold filters are NOT used for filtering rows, only for cell coloring

        // Get unique values for each column (for filters)
        const columnValues: Record<string, (string | number)[]> = {};
        columnValues['model'] = rows.map(r => r.model as string);
        metricNames.forEach(metricName => {
            const values = rows.map(r => r[metricName]).filter(v => v !== null) as number[];
            columnValues[metricName] = values;
        });

               return {
                   rows: filteredRows,
                   allRows: rows, // Keep original for filter options
                   metricNames,
                   columnValues,
                   units: data.metrics.reduce((acc, m) => {
                       acc[m.name] = m.unit;
                       return acc;
                   }, {} as Record<string, string>)
               };
           }, [data, filters]);

    const formatValue = (value: number | string | null, unit: string): string => {
        if (typeof value === 'string') return value;
        if (value === null || value === undefined || isNaN(value as number)) return '-';
        
        const numValue = value as number;
        
        switch (unit) {
            case 'count':
                return numValue.toLocaleString();
            case 'decimal':
                return numValue.toFixed(4);
            case 'seconds':
                return numValue.toFixed(4);
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
                                    <span className="metallic-title text-xs font-semibold uppercase tracking-wide">Model</span>
                                    <ExcelStyleFilter
                                        columnName="Model"
                                        values={tableData.columnValues['model'] || []}
                                        selectedValues={filters['model'] || new Set()}
                                        onFilterChange={(selected) => {
                                            setFilters(prev => ({ ...prev, model: selected }));
                                        }}
                                        comparisonFilter={null}
                                        onComparisonFilterChange={() => {}}
                                        thresholdFilter={null}
                                        onThresholdFilterChange={() => {}}
                                        isOpen={openFilter === 'model'}
                                        onToggle={() => setOpenFilter(openFilter === 'model' ? null : 'model')}
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
                                            onFilterChange={(selected) => {
                                                setFilters(prev => ({ ...prev, [metricName]: selected }));
                                            }}
                                            comparisonFilter={null}
                                            onComparisonFilterChange={() => {}}
                                            thresholdFilter={thresholdFilters[metricName] || null}
                                            onThresholdFilterChange={(filter) => {
                                                setThresholdFilters(prev => ({ ...prev, [metricName]: filter }));
                                            }}
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
                                    key={row.model as string} 
                                    className={`border-b border-cyan-500/10 hover:bg-black/40 ${row.model === 'All Models' ? 'bg-black/60 font-semibold' : 'text-gray-300'}`}
                                >
                                    <td className="px-2 py-2 font-medium text-center">{row.model}</td>
                                    {tableData.metricNames.map((metricName) => (
                                        <td 
                                            key={metricName} 
                                            className="px-2 py-2 text-center tabular-nums"
                                            style={{
                                                backgroundColor: meetsThreshold(row[metricName] as number | null, thresholdFilters[metricName] || null)
                                                    ? (thresholdFilters[metricName]?.color || 'transparent')
                                                    : 'transparent'
                                            }}
                                        >
                                            {formatValue(row[metricName] as number | null, tableData.units[metricName])}
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

