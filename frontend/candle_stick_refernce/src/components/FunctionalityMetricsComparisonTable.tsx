import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDashboardStore } from '../state/dashboardStore';
import ExcelStyleFilter from './ExcelStyleFilter';

interface Metric {
    name: string;
    unit: string;
    values: Record<string, number>;
}

interface FunctionalityComparisonData {
    models: string[];
    metrics: Metric[];
    order_fulfillment: {
        overall: number;
        by_symbol: Record<string, number>;
    };
}

type ComparisonOperator = '>' | '<' | '>=' | '<=' | '=' | '!=' | 'between';

interface ThresholdFilter {
    operator: ComparisonOperator;
    value1: number;
    value2?: number;
    color: string; // Hex color for cell background
    // Percentile mode fields
    usePercentile?: boolean; // If true, value1 is treated as percentile threshold
    percentile?: number; // Percentile value (e.g., 95)
    days?: number; // Number of days for percentile calculation (e.g., 7)
    percentileValue?: number; // The actual percentile value fetched from backend
}

type TimeRange = '1h' | '24h' | '48h' | 'before' | 'after' | 'custom';

interface FunctionalityMetricsComparisonTableProps {
    data: FunctionalityComparisonData | null;
    isLoading: boolean;
    onModelClick?: () => void; // Callback to close modal when navigating
    startDate?: string; // Date range from master table
    endDate?: string; // Date range from master table
    timeRange?: TimeRange; // Time range selection from master table
    thresholdFilters?: Record<string, ThresholdFilter | null>; // Threshold filters from parent (persists across modal open/close)
    onThresholdFiltersChange?: (filters: Record<string, ThresholdFilter | null>) => void; // Callback to update threshold filters in parent
}

export default function FunctionalityMetricsComparisonTable({ 
    data, 
    isLoading, 
    onModelClick, 
    startDate, 
    endDate, 
    timeRange,
    thresholdFilters: externalThresholdFilters,
    onThresholdFiltersChange
}: FunctionalityMetricsComparisonTableProps) {
    const navigate = useNavigate();
    const { setters } = useDashboardStore();
    // Filter state: track which values are selected for each column
    const [filters, setFilters] = useState<Record<string, Set<string | number>>>({});
    // Threshold filter state: use external if provided, otherwise use local state (for backward compatibility)
    const [localThresholdFilters, setLocalThresholdFilters] = useState<Record<string, ThresholdFilter | null>>({});
    const thresholdFilters = externalThresholdFilters !== undefined ? externalThresholdFilters : localThresholdFilters;
    const setThresholdFilters = onThresholdFiltersChange || setLocalThresholdFilters;
    const [openFilter, setOpenFilter] = useState<string | null>(null);
    
    // Helper function to check if a value meets threshold condition
    const meetsThreshold = (value: number, threshold: ThresholdFilter | null): boolean => {
        if (!threshold || typeof value !== 'number') return false;
        
        // If using percentile mode, use the fetched percentile value
        let compareValue = threshold.value1;
        if (threshold.usePercentile && threshold.percentileValue !== undefined) {
            compareValue = threshold.percentileValue;
        }
        
        const { operator, value2 } = threshold;
        switch (operator) {
            case '>': return value > compareValue;
            case '<': return value < compareValue;
            case '>=': return value >= compareValue;
            case '<=': return value <= compareValue;
            case '=': return value === compareValue;
            case '!=': return value !== compareValue;
            case 'between':
                if (value2 === undefined) return false;
                return value >= compareValue && value <= value2;
            default: return false;
        }
    };

    const handleModelClick = (modelName: string) => {
        if (modelName === 'All Models') return; // Don't navigate for "All Models"
        setters.setSelectedModel(modelName);
        // Set the date range from master table
        if (startDate && endDate) {
            setters.setTechnicalMetricsStart(startDate);
            setters.setTechnicalMetricsEnd(endDate);
        }
        // Store time range in sessionStorage so it persists across navigation
        if (timeRange) {
            sessionStorage.setItem('technicalMetricsTimeRange', timeRange);
            // Also dispatch event for immediate update
            const event = new CustomEvent('setTechnicalMetricsTimeRange', { detail: { timeRange } });
            window.dispatchEvent(event);
        }
        if (onModelClick) {
            onModelClick(); // Close modal
        }
        navigate('/technical-metrics');
    };

    const tableData = useMemo(() => {
        if (!data || !data.models || !data.metrics) return null;

        // Transform: models as rows, metrics as columns
        const metricNames = data.metrics.map(m => m.name);
        const rows = data.models.map(model => {
            const row: Record<string, string | number> = { model };
            data.metrics.forEach(metric => {
                row[metric.name] = metric.values[model] ?? 0;
            });
            return row;
        });

        // Add "All Models" aggregate row
        const allRow: Record<string, string | number> = { model: 'All Models' };
        data.metrics.forEach(metric => {
            allRow[metric.name] = metric.values['all'] ?? 0;
        });
        rows.push(allRow);

        // Apply filters (only value-based; thresholds are for coloring, not filtering)
        let filteredRows = rows;
        
        // Apply value-based filters
        Object.entries(filters).forEach(([column, selectedValues]) => {
            if (selectedValues.size > 0) {
                filteredRows = filteredRows.filter(row => {
                    const value = row[column];
                    return selectedValues.has(value);
                });
            }
        });
        
        // Note: Threshold filters are NOT used for filtering rows, only for cell coloring

        // Get unique values for each column (for filters)
        const columnValues: Record<string, (string | number)[]> = {};
        columnValues['model'] = rows.map(r => r.model as string);
        metricNames.forEach(metricName => {
            columnValues[metricName] = rows.map(r => r[metricName] as number);
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

    const formatValue = (value: number | string, unit: string): string => {
        if (typeof value === 'string') return value;
        if (value === null || value === undefined || isNaN(value)) return '-';
        
        switch (unit) {
            case 'count':
                return value.toLocaleString();
            case 'decimal':
                return value.toFixed(4);
            case 'seconds':
                return value.toFixed(4);
            case 'milliseconds':
                return value.toFixed(2);
            case 'percent':
                return `${value.toFixed(2)}%`;
            default:
                return value.toString();
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
                                                       setThresholdFilters({ ...thresholdFilters, [metricName]: filter });
                                                   }}
                                                   isOpen={openFilter === metricName}
                                                   onToggle={() => setOpenFilter(openFilter === metricName ? null : metricName)}
                                                   metricName={metricName}
                                                   startDate={startDate}
                                                   endDate={endDate}
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
                                    <td 
                                        className={`px-2 py-2 font-medium text-center ${row.model === 'All Models' ? '' : 'cursor-pointer hover:text-cyan-400 transition-colors'}`}
                                        onClick={() => row.model !== 'All Models' && handleModelClick(row.model as string)}
                                    >
                                        {row.model}
                                    </td>
                                    {tableData.metricNames.map((metricName) => (
                                           <td 
                                               key={metricName} 
                                               className="px-2 py-2 text-center tabular-nums"
                                               style={{
                                                   backgroundColor: meetsThreshold(row[metricName] as number, thresholdFilters[metricName] || null)
                                                       ? (thresholdFilters[metricName]?.color || 'transparent')
                                                       : 'transparent'
                                               }}
                                           >
                                               {formatValue(row[metricName] as number, tableData.units[metricName])}
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

