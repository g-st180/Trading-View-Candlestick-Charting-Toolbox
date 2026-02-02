import { useState, useRef, useEffect } from 'react';
import { getApiBase } from '../utils/api';

type FilterMode = 'values' | 'threshold';
type ComparisonOperator = '>' | '<' | '>=' | '<=' | '=' | '!=' | 'between';

interface ThresholdFilter {
    operator: ComparisonOperator;
    value1: number;
    value2?: number; // For 'between' operator
    color: string; // Hex color for cell background
    // Percentile mode fields
    usePercentile?: boolean; // If true, value1 is treated as percentile threshold
    percentile?: number; // Percentile value (e.g., 95)
    days?: number; // Number of days for percentile calculation (e.g., 7)
    percentileValue?: number; // The actual percentile value fetched from backend
}

// Legacy interface for backward compatibility
interface ComparisonFilter {
    operator: ComparisonOperator;
    value1: number;
    value2?: number;
}

interface ExcelStyleFilterProps {
    columnName: string;
    values: (string | number)[];
    selectedValues: Set<string | number>;
    onFilterChange: (selected: Set<string | number>) => void;
    comparisonFilter: ComparisonFilter | null;
    onComparisonFilterChange: (filter: ComparisonFilter | null) => void;
    thresholdFilter?: ThresholdFilter | null; // New threshold filter with color
    onThresholdFilterChange?: (filter: ThresholdFilter | null) => void; // New callback
    isOpen: boolean;
    onToggle: () => void;
    metricName?: string; // Metric name for percentile fetching
    startDate?: string; // Start date for percentile calculation
    endDate?: string; // End date for percentile calculation
}

// Mapping from metric names to percentile API keys
const METRIC_TO_PERCENTILE_KEY: Record<string, string> = {
    'Avg FE time per Iter. (s)': 'feat_calc_time',
    'Avg Prediction Time per Iter. (s)': 'prediction_time',
    'Average time per Iter. (s)': 'total_seconds',
    'Avg Polygon Network time per Iter. (s)': 'api_candle_fetch_time',
    'Avg Confidence': 'model_confidence',
};

export default function ExcelStyleFilter({
    columnName,
    values,
    selectedValues,
    onFilterChange,
    comparisonFilter,
    onComparisonFilterChange,
    thresholdFilter,
    onThresholdFilterChange,
    isOpen,
    onToggle,
    metricName,
}: ExcelStyleFilterProps) {
    const [searchTerm, setSearchTerm] = useState('');
    const [filterMode, setFilterMode] = useState<FilterMode>('values');
    const [operator, setOperator] = useState<ComparisonOperator>('>');
    const [comparisonValue1, setComparisonValue1] = useState<string>('');
    const [comparisonValue2, setComparisonValue2] = useState<string>('');
    const [thresholdColor, setThresholdColor] = useState<string>('#ef4444'); // Default red
    const [usePercentile, setUsePercentile] = useState<boolean>(false);
    const [percentile, setPercentile] = useState<string>('95');
    const [days, setDays] = useState<string>('7');
    const [percentileValue, setPercentileValue] = useState<number | null>(null);
    const [isLoadingPercentile, setIsLoadingPercentile] = useState<boolean>(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    
    // Use threshold filter if available, otherwise fall back to comparison filter
    const activeThreshold = thresholdFilter || (comparisonFilter ? {
        ...comparisonFilter,
        color: thresholdColor
    } : null);
    const handleThresholdChange = onThresholdFilterChange || ((filter: any) => {
        // If no threshold handler, try to convert to comparison filter for backward compatibility
        if (onComparisonFilterChange && filter) {
            const { color, ...comparisonFilter } = filter;
            onComparisonFilterChange(comparisonFilter);
        } else if (onComparisonFilterChange) {
            onComparisonFilterChange(null);
        }
    });

    // Check if column is numeric
    const isNumeric = values.length > 0 && typeof values[0] === 'number';
    
    // Check if this metric supports percentile mode
    const supportsPercentile = Boolean(metricName && METRIC_TO_PERCENTILE_KEY[metricName] !== undefined);
    
    // Fetch percentile value when percentile mode is enabled
    useEffect(() => {
        if (usePercentile && supportsPercentile && metricName && isOpen) {
            const fetchPercentile = async () => {
                setIsLoadingPercentile(true);
                try {
                    const percentileKey = METRIC_TO_PERCENTILE_KEY[metricName];
                    const API_BASE = getApiBase();
                    
                    const percentileNum = parseFloat(percentile);
                    const daysNum = parseFloat(days);
                    
                    // Validate inputs
                    if (isNaN(percentileNum) || isNaN(daysNum) || percentileNum < 0 || percentileNum > 100 || daysNum < 1) {
                        setPercentileValue(null);
                        setIsLoadingPercentile(false);
                        return;
                    }
                    
                    const params = new URLSearchParams({
                        percentile: percentileNum.toString(),
                        days: daysNum.toString(),
                    });
                    const response = await fetch(`${API_BASE}/api/metrics_percentile?${params.toString()}`);
                    if (response.ok) {
                        const data = await response.json();
                        const value = data[percentileKey];
                        if (value !== null && value !== undefined) {
                            setPercentileValue(value);
                        } else {
                            setPercentileValue(null);
                        }
                    } else {
                        setPercentileValue(null);
                    }
                } catch (error) {
                    setPercentileValue(null);
                } finally {
                    setIsLoadingPercentile(false);
                }
            };
            
            fetchPercentile();
        } else if (!usePercentile) {
            setPercentileValue(null);
        }
    }, [usePercentile, supportsPercentile, metricName, isOpen, percentile, days]);

    // Get unique values
    const uniqueValues = Array.from(new Set(values)).sort((a, b) => {
        if (typeof a === 'number' && typeof b === 'number') return a - b;
        return String(a).localeCompare(String(b));
    });

    // Filter values by search term
    const filteredValues = uniqueValues.filter(val =>
        String(val).toLowerCase().includes(searchTerm.toLowerCase())
    );

    // Check if all visible values are selected
    const allVisibleSelected = filteredValues.length > 0 && 
        filteredValues.every(val => selectedValues.has(val));

    // Handle select all / deselect all
    const handleSelectAll = () => {
        if (allVisibleSelected) {
            // Deselect all visible
            const newSelected = new Set(selectedValues);
            filteredValues.forEach(val => newSelected.delete(val));
            onFilterChange(newSelected);
        } else {
            // Select all visible
            const newSelected = new Set(selectedValues);
            filteredValues.forEach(val => newSelected.add(val));
            onFilterChange(newSelected);
        }
    };

    // Toggle individual value
    const toggleValue = (value: string | number) => {
        const newSelected = new Set(selectedValues);
        if (newSelected.has(value)) {
            newSelected.delete(value);
        } else {
            newSelected.add(value);
        }
        onFilterChange(newSelected);
    };

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                if (isOpen) {
                    onToggle();
                }
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isOpen, onToggle]);

    const selectedCount = selectedValues.size;
    const totalCount = uniqueValues.length;
    const isValueFiltered = selectedCount < totalCount && selectedCount > 0;
    const isThresholdActive = activeThreshold !== null;
    const isFiltered = isValueFiltered || isThresholdActive;

    // Apply threshold filter
    const handleApplyThreshold = () => {
        let val1: number;
        
        if (usePercentile && percentileValue !== null) {
            // Use the fetched percentile value
            val1 = percentileValue;
        } else {
            // Use manual value
            val1 = parseFloat(comparisonValue1);
            if (isNaN(val1)) {
                return; // Invalid input
            }
        }
        
        const val2 = comparisonValue2 ? parseFloat(comparisonValue2) : undefined;
        
        if (operator === 'between' && (val2 === undefined || isNaN(val2))) {
            return; // Invalid input for between operator
        }

        const threshold: ThresholdFilter = {
            operator,
            value1: usePercentile ? (percentileValue || 0) : val1,
            value2: operator === 'between' ? val2 : undefined,
            color: thresholdColor,
            usePercentile: usePercentile && supportsPercentile,
            percentile: usePercentile ? parseFloat(percentile) : undefined,
            days: usePercentile ? parseFloat(days) : undefined,
            percentileValue: usePercentile && percentileValue != null ? percentileValue : undefined,
        };
        
        if (handleThresholdChange) {
            handleThresholdChange(threshold);
        }
        // Don't clear value-based filter - thresholds are for coloring, not filtering
        setSearchTerm(''); // Clear search
    };

    const handleClearThreshold = () => {
        if (handleThresholdChange) {
            handleThresholdChange(null);
        }
        setComparisonValue1('');
        setComparisonValue2('');
        setUsePercentile(false);
        setPercentile('95');
        setDays('7');
        setPercentileValue(null);
    };

    // Handle mode switch - don't clear filters when switching to threshold (coloring doesn't filter)
    const handleModeSwitch = (newMode: FilterMode) => {
        if (newMode === 'threshold' && activeThreshold) {
            // Pre-populate form with existing threshold
            setOperator(activeThreshold.operator);
            setComparisonValue1(String(activeThreshold.value1));
            setComparisonValue2(activeThreshold.value2 !== undefined ? String(activeThreshold.value2) : '');
            setThresholdColor(activeThreshold.color);
            setUsePercentile(activeThreshold.usePercentile || false);
            setPercentile(activeThreshold.percentile ? String(activeThreshold.percentile) : '95');
            setDays(activeThreshold.days ? String(activeThreshold.days) : '7');
            setPercentileValue(activeThreshold.percentileValue || null);
        } else if (newMode === 'values' && activeThreshold) {
            // Keep threshold active but switch to values mode
        }
        setFilterMode(newMode);
    };

    return (
        <div className="relative inline-block" ref={dropdownRef}>
            <button
                onClick={onToggle}
                className={`flex items-center gap-1 px-1 py-0.5 rounded hover:bg-black/40 ${
                    isFiltered ? 'text-cyan-400' : 'text-gray-400'
                }`}
                title="Filter"
            >
                <svg
                    className="w-3 h-3"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
                    />
                </svg>
                {isFiltered && (
                    <span className="text-xs font-medium">
                        {isThresholdActive ? '✓' : selectedCount}
                    </span>
                )}
            </button>

            {isOpen && (
                <div className="absolute top-full left-0 mt-1 w-72 bg-black/90 border border-cyan-500/30 rounded shadow-lg z-50 backdrop-blur-sm">
                    {/* Header */}
                    <div className="border-b border-cyan-500/20 px-3 py-2 bg-black/70">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-medium text-gray-300">{columnName}</span>
                            {(isValueFiltered || isThresholdActive) && (
                                <button
                                    onClick={() => {
                                        onFilterChange(new Set(uniqueValues));
                                        handleClearThreshold();
                                    }}
                                    className="text-xs text-cyan-400 hover:text-cyan-300"
                                >
                                    Clear All
                                </button>
                            )}
                        </div>
                        
                        {/* Mode toggle for numeric columns */}
                        {isNumeric && (
                            <div className="flex gap-1 mb-2">
                                <button
                                    onClick={() => handleModeSwitch('values')}
                                    className={`flex-1 px-2 py-1 text-xs rounded ${
                                        filterMode === 'values' 
                                            ? 'bg-cyan-500 text-white' 
                                            : 'bg-black/50 text-gray-300 hover:bg-black/70 border border-cyan-500/30'
                                    }`}
                                >
                                    Values
                                </button>
                                <button
                                    onClick={() => handleModeSwitch('threshold')}
                                    className={`flex-1 px-2 py-1 text-xs rounded ${
                                        filterMode === 'threshold' 
                                            ? 'bg-cyan-500 text-white' 
                                            : 'bg-black/50 text-gray-300 hover:bg-black/70 border border-cyan-500/30'
                                    }`}
                                >
                                    Threshold
                                </button>
                            </div>
                        )}
                        
                        {/* Search box (only for values mode) */}
                        {filterMode === 'values' && (
                            <input
                                type="text"
                                placeholder="Search..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full px-2 py-1 text-xs border border-cyan-500/30 bg-black/50 text-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-cyan-500"
                                autoFocus
                            />
                        )}
                    </div>

                    {filterMode === 'values' ? (
                        <>
                            {/* Select All checkbox */}
                            <div className="border-b border-cyan-500/20 px-3 py-1.5 bg-black/50">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={allVisibleSelected}
                                        onChange={handleSelectAll}
                                        className="rounded border-cyan-500/30 text-cyan-400 focus:ring-cyan-500 bg-black/50"
                                    />
                                    <span className="text-xs font-medium text-gray-300">
                                        Select All ({filteredValues.length})
                                    </span>
                                </label>
                            </div>

                            {/* Values list */}
                            <div className="max-h-60 overflow-y-auto">
                                {filteredValues.length === 0 ? (
                                    <div className="px-3 py-2 text-xs text-gray-400 text-center">
                                        No values found
                                    </div>
                                ) : (
                                    filteredValues.map((value) => {
                                        const isSelected = selectedValues.has(value);
                                        return (
                                            <label
                                                key={String(value)}
                                                className="flex items-center gap-2 px-3 py-1.5 hover:bg-black/40 cursor-pointer border-b border-cyan-500/10 last:border-b-0"
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={isSelected}
                                                    onChange={() => toggleValue(value)}
                                                    className="rounded border-cyan-500/30 text-cyan-400 focus:ring-cyan-500 bg-black/50"
                                                />
                                                <span className="text-xs text-gray-300 flex-1">
                                                    {typeof value === 'number' 
                                                        ? value.toLocaleString() 
                                                        : value}
                                                </span>
                                                {isSelected && (
                                                    <svg
                                                        className="w-3 h-3 text-cyan-400"
                                                        fill="currentColor"
                                                        viewBox="0 0 20 20"
                                                    >
                                                        <path
                                                            fillRule="evenodd"
                                                            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                                            clipRule="evenodd"
                                                        />
                                                    </svg>
                                                )}
                                            </label>
                                        );
                                    })
                                )}
                            </div>

                            {/* Footer with count */}
                            <div className="border-t border-cyan-500/20 px-3 py-2 bg-black/50 text-xs text-gray-400">
                                {selectedCount} of {totalCount} selected
                            </div>
                        </>
                    ) : (
                        <>
                            {/* Threshold filter UI */}
                            <div className="px-3 py-3 space-y-3">
                                {/* Percentile mode toggle (only for supported metrics) */}
                                {supportsPercentile && (
                                    <div>
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={usePercentile}
                                                onChange={(e) => {
                                                    setUsePercentile(e.target.checked);
                                                    if (e.target.checked) {
                                                        setOperator('>'); // Default to > for percentile
                                                    }
                                                }}
                                                className="rounded border-cyan-500/30 text-cyan-400 focus:ring-cyan-500 bg-black/50"
                                            />
                                            <span className="text-xs font-medium text-gray-300">
                                                Use Percentile Threshold
                                            </span>
                                        </label>
                                    </div>
                                )}
                                
                                {usePercentile && supportsPercentile ? (
                                    <>
                                        <div className="grid grid-cols-2 gap-2">
                                            <div>
                                                <label className="text-xs font-medium text-gray-300 mb-1 block">
                                                    Percentile
                                                </label>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    max="100"
                                                    step="1"
                                                    value={percentile}
                                                    onChange={(e) => setPercentile(e.target.value)}
                                                    placeholder="95"
                                                    className="w-full px-2 py-1 text-xs border border-cyan-500/30 bg-black/50 text-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-cyan-500"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-xs font-medium text-gray-300 mb-1 block">
                                                    Days
                                                </label>
                                                <input
                                                    type="number"
                                                    min="1"
                                                    step="1"
                                                    value={days}
                                                    onChange={(e) => setDays(e.target.value)}
                                                    placeholder="7"
                                                    className="w-full px-2 py-1 text-xs border border-cyan-500/30 bg-black/50 text-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-cyan-500"
                                                />
                                            </div>
                                        </div>
                                        {isLoadingPercentile ? (
                                            <div className="text-xs text-gray-400 text-center py-2">
                                                Loading percentile...
                                            </div>
                                        ) : percentileValue !== null ? (
                                            <div className="text-xs text-gray-300 bg-cyan-500/10 border border-cyan-500/20 px-2 py-1 rounded">
                                                {percentile}th percentile ({days} days): {percentileValue.toFixed(4)}
                                            </div>
                                        ) : (
                                            <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 px-2 py-1 rounded">
                                                Could not fetch percentile value
                                            </div>
                                        )}
                                        <div>
                                            <label className="text-xs font-medium text-gray-300 mb-1 block">
                                                Operator
                                            </label>
                                            <select
                                                value={operator}
                                                onChange={(e) => setOperator(e.target.value as ComparisonOperator)}
                                                className="w-full px-2 py-1 text-xs border border-cyan-500/30 bg-black/50 text-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-cyan-500"
                                            >
                                                <option value=">">Greater Than (&gt;)</option>
                                                <option value="<">Less Than (&lt;)</option>
                                                <option value=">=">Greater Than or Equal (&gt;=)</option>
                                                <option value="<=">Less Than or Equal (&lt;=)</option>
                                            </select>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <div>
                                            <label className="text-xs font-medium text-gray-300 mb-1 block">
                                                Operator
                                            </label>
                                            <select
                                                value={operator}
                                                onChange={(e) => setOperator(e.target.value as ComparisonOperator)}
                                                className="w-full px-2 py-1 text-xs border border-cyan-500/30 bg-black/50 text-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-cyan-500"
                                            >
                                                <option value=">">Greater Than (&gt;)</option>
                                                <option value="<">Less Than (&lt;)</option>
                                                <option value=">=">Greater Than or Equal (&gt;=)</option>
                                                <option value="<=">Less Than or Equal (&lt;=)</option>
                                                <option value="=">Equal To (=)</option>
                                                <option value="!=">Not Equal To (!=)</option>
                                                <option value="between">Between</option>
                                            </select>
                                        </div>
                                        
                                        <div>
                                            <label className="text-xs font-medium text-gray-300 mb-1 block">
                                                Value {operator === 'between' ? '1 (Min)' : ''}
                                            </label>
                                            <input
                                                type="number"
                                                step="any"
                                                value={comparisonValue1}
                                                onChange={(e) => setComparisonValue1(e.target.value)}
                                                placeholder="Enter value"
                                                className="w-full px-2 py-1 text-xs border border-cyan-500/30 bg-black/50 text-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-cyan-500"
                                            />
                                        </div>
                                    </>
                                )}

                                {operator === 'between' && (
                                    <div>
                                        <label className="text-xs font-medium text-gray-300 mb-1 block">
                                            Value 2 (Max)
                                        </label>
                                        <input
                                            type="number"
                                            step="any"
                                            value={comparisonValue2}
                                            onChange={(e) => setComparisonValue2(e.target.value)}
                                            placeholder="Enter value"
                                            className="w-full px-2 py-1 text-xs border border-cyan-500/30 bg-black/50 text-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-cyan-500"
                                        />
                                    </div>
                                )}

                                <div>
                                    <label className="text-xs font-medium text-gray-300 mb-1 block">
                                        Color
                                    </label>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="color"
                                            value={thresholdColor}
                                            onChange={(e) => setThresholdColor(e.target.value)}
                                            className="h-8 w-16 border rounded cursor-pointer"
                                        />
                                        <input
                                            type="text"
                                            value={thresholdColor}
                                            onChange={(e) => setThresholdColor(e.target.value)}
                                            placeholder="#3b82f6"
                                            className="flex-1 px-2 py-1 text-xs border rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                                        />
                                    </div>
                                </div>

                                <div className="flex gap-2">
                                    <button
                                        onClick={handleApplyThreshold}
                                        className="flex-1 px-3 py-1.5 text-xs bg-cyan-500 text-white rounded hover:bg-cyan-600"
                                    >
                                        Apply
                                    </button>
                                    {isThresholdActive && (
                                        <button
                                            onClick={handleClearThreshold}
                                            className="px-3 py-1.5 text-xs bg-black/50 text-gray-300 rounded hover:bg-black/70 border border-cyan-500/30"
                                        >
                                            Clear
                                        </button>
                                    )}
                                </div>

                                {isThresholdActive && activeThreshold && (
                                    <div className="text-xs text-gray-300 bg-cyan-500/10 border border-cyan-500/20 px-2 py-1 rounded flex items-center gap-2">
                                        <span>
                                            Active: {activeThreshold.operator} {
                                                activeThreshold.usePercentile && activeThreshold.percentileValue !== undefined
                                                    ? `${activeThreshold.percentile}th percentile (${activeThreshold.percentileValue.toFixed(4)})`
                                                    : activeThreshold.value1
                                            }
                                        </span>
                                        {activeThreshold.operator === 'between' && activeThreshold.value2 !== undefined
                                            ? ` and ${activeThreshold.value2}`
                                            : ''}
                                        <div 
                                            className="w-4 h-4 rounded border border-gray-300" 
                                            style={{ backgroundColor: activeThreshold.color }}
                                        />
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}

