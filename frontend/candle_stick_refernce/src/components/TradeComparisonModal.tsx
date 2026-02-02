import { useState, useEffect, useCallback, useRef } from 'react';
import TradingMetricsComparisonTable from './TradingMetricsComparisonTable';
import { useDashboardStore } from '../state/dashboardStore';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { getApiBase } from '../utils/api';

type TimeRange = '1h' | '24h' | '48h' | 'before' | 'after' | 'custom';

interface TradingComparisonData {
    models: string[];
    metrics: Array<{
        name: string;
        unit: string;
        values: Record<string, number | null>;
    }>;
}

export default function TradeComparisonModal() {
    const [isOpen, setIsOpen] = useState(false);
    const [data, setData] = useState<TradingComparisonData | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [timeRange, setTimeRange] = useState<TimeRange>('24h');
    const [symbol, setSymbol] = useState<string>('ALL');
    const [direction, setDirection] = useState<string>('ALL');
    const { dashboardStart, dashboardEnd, symbols, loadTickers } = useDashboardStore();
    const [startDate, setStartDate] = useState<string>(dashboardStart || '');
    const [endDate, setEndDate] = useState<string>(dashboardEnd || '');
    const [isTimeDropdownOpen, setIsTimeDropdownOpen] = useState(false);
    const timeDropdownRef = useRef<HTMLDivElement | null>(null);
    const [beforeDate, setBeforeDate] = useState<Date | null>(null);
    const [afterDate, setAfterDate] = useState<Date | null>(null);

    useEffect(() => {
        loadTickers();
    }, [loadTickers]);

    const fetchData = useCallback(async (startDate: string, endDate: string, symbol: string, direction: string) => {
        setIsLoading(true);
        try {
            const params = new URLSearchParams();
            if (startDate) params.append('start_date', startDate);
            if (endDate) params.append('end_date', endDate);
            if (symbol && symbol !== 'ALL') params.append('symbol', symbol);
            if (direction && direction !== 'ALL') params.append('direction', direction);

            const API_BASE = getApiBase();
            const response = await fetch(`${API_BASE}/api/trades/model_comparison?${params.toString()}`);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const result = await response.json();
            setData(result);
        } catch (error) {
            setData(null);
        } finally {
            setIsLoading(false);
        }
    }, []);

    // Set date range based on selected time range
    useEffect(() => {
        if (timeRange === 'custom' || timeRange === 'before' || timeRange === 'after') return;

        const now = new Date();
        const end = now.toISOString().slice(0, 16);
        let start: string;

        switch (timeRange) {
            case '1h':
                start = new Date(now.getTime() - 60 * 60 * 1000).toISOString().slice(0, 16);
                break;
            case '24h':
                start = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 16);
                break;
            case '48h':
                start = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString().slice(0, 16);
                break;
            default:
                return;
        }

        setStartDate(start);
        setEndDate(end);
    }, [timeRange]);

    // Handle "On or Before" date selection
    useEffect(() => {
        if (timeRange === 'before' && beforeDate) {
            const selectedDate = new Date(beforeDate);
            selectedDate.setHours(23, 59, 59, 999); // End of day
            const end = formatDate(selectedDate);
            // Set start to a very early date (e.g., 2020-01-01)
            const start = '2020-01-01T00:00';
            setStartDate(start);
            setEndDate(end);
        }
    }, [timeRange, beforeDate]);

    // Handle "On or After" date selection
    useEffect(() => {
        if (timeRange === 'after' && afterDate) {
            const selectedDate = new Date(afterDate);
            selectedDate.setHours(0, 0, 0, 0); // Start of day
            const start = formatDate(selectedDate);
            // Set end to now
            const now = new Date();
            const end = formatDate(now);
            setStartDate(start);
            setEndDate(end);
        }
    }, [timeRange, afterDate]);

    // Close dropdown when clicking outside
    useEffect(() => {
        const onDown = (e: MouseEvent) => {
            if (!isTimeDropdownOpen) return;
            const el = timeDropdownRef.current;
            if (!el) return;
            if (el.contains(e.target as Node)) return;
            setIsTimeDropdownOpen(false);
        };
        document.addEventListener('mousedown', onDown);
        return () => document.removeEventListener('mousedown', onDown);
    }, [isTimeDropdownOpen]);

    useEffect(() => {
        if (isOpen && startDate && endDate) {
            fetchData(startDate, endDate, symbol, direction);
        }
    }, [isOpen, startDate, endDate, symbol, direction, fetchData]);

    useEffect(() => {
        const handleOpen = () => {
            setIsOpen(true);
            setStartDate(dashboardStart || '');
            setEndDate(dashboardEnd || '');
            if (dashboardStart && dashboardEnd) {
                fetchData(dashboardStart, dashboardEnd, symbol, direction);
            }
        };

        window.addEventListener('openTradeComparison', handleOpen);
        return () => window.removeEventListener('openTradeComparison', handleOpen);
    }, [dashboardStart, dashboardEnd, symbol, direction, fetchData]);

    const formatDate = (date: Date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return `${year}-${month}-${day}T${hours}:${minutes}`;
    };

    const getTimeRangeLabel = (range: TimeRange): string => {
        switch (range) {
            case '1h': return 'In the last 1 hour';
            case '24h': return 'In the last 24 hours';
            case '48h': return 'In the last 48 hours';
            case 'before': return beforeDate ? `On or Before ${beforeDate.toLocaleDateString()}` : 'On or Before';
            case 'after': return afterDate ? `On or After ${afterDate.toLocaleDateString()}` : 'On or After';
            case 'custom': return 'Custom Range';
            default: return 'In the last 24 hours';
        }
    };

    if (!isOpen) return null;

    return (
        <div 
            className="fixed inset-0 z-50 flex items-center justify-center"
            onClick={(e) => {
                if (e.target === e.currentTarget) {
                    setIsOpen(false);
                }
            }}
        >
            {/* Blurred background overlay */}
            <div className="absolute inset-0 bg-black/60 backdrop-blur-md" />
            
            {/* Floating table container */}
            <div className="relative w-[95vw] h-[90vh] rounded-lg border border-cyan-500/30 bg-black/90 backdrop-blur-sm shadow-2xl">
                <div className="flex items-center justify-between border-b border-cyan-500/20 px-4 py-3">
                    <h2 className="metallic-title text-lg font-semibold uppercase tracking-wide">Trade Comparison</h2>
                    <button
                        onClick={() => setIsOpen(false)}
                        className="text-gray-400 hover:text-cyan-300 transition-colors text-xl font-bold"
                    >
                        ×
                    </button>
                </div>
                
                {/* Filters and time range buttons */}
                <div className="flex flex-wrap items-center gap-4 px-4 py-3 border-b border-cyan-500/20">
                    <div className="flex items-center gap-2">
                        <label className="text-sm text-gray-400">Symbol</label>
                        <select
                            value={symbol}
                            onChange={(e) => setSymbol(e.target.value)}
                            className="rounded border border-cyan-500/30 bg-black/50 px-3 py-1.5 text-sm text-gray-300 hover:border-cyan-500/50 hover:bg-black/70 transition-colors"
                        >
                            <option value="ALL">All</option>
                            {symbols.map((s) => (
                                <option key={s} value={s}>
                                    {s}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="flex items-center gap-2">
                        <label className="text-sm text-gray-400">Direction</label>
                        <select
                            value={direction}
                            onChange={(e) => setDirection(e.target.value)}
                            className="rounded border border-cyan-500/30 bg-black/50 px-3 py-1.5 text-sm text-gray-300 hover:border-cyan-500/50 hover:bg-black/70 transition-colors"
                        >
                            <option value="ALL">All</option>
                            <option value="LONG">Long</option>
                            <option value="SHORT">Short</option>
                        </select>
                    </div>

                    <div className="flex items-center gap-2 relative" ref={timeDropdownRef}>
                        <label className="text-sm text-gray-400">Time Period</label>
                        <div className="relative">
                            <button
                                type="button"
                                onClick={() => setIsTimeDropdownOpen(v => !v)}
                                className="rounded border border-cyan-500/30 bg-black/50 px-3 py-1.5 text-sm text-gray-300 hover:border-cyan-500/50 hover:bg-black/70 transition-colors min-w-[190px] text-left flex items-center justify-between"
                            >
                                <span>{getTimeRangeLabel(timeRange)}</span>
                                <svg className={`w-4 h-4 transition-transform ${isTimeDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                            </button>

                            {isTimeDropdownOpen && (
                                <div className="absolute top-full left-0 mt-1 rounded-lg border border-cyan-500/20 bg-black/90 backdrop-blur-sm shadow-lg z-50">
                                    <div className="p-3 flex flex-col gap-2">
                                        <button
                                            type="button"
                                            onClick={() => { setTimeRange('1h'); setIsTimeDropdownOpen(false); }}
                                            className={`px-3 py-1.5 text-sm rounded border transition-colors w-[320px] text-left ${
                                                timeRange === '1h'
                                                    ? 'border-cyan-500 bg-cyan-500/20 text-cyan-400'
                                                    : 'border-cyan-500/30 bg-black/50 text-gray-300 hover:border-cyan-500/50 hover:bg-black/70'
                                            }`}
                                        >
                                            In the last 1 hour
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => { setTimeRange('24h'); setIsTimeDropdownOpen(false); }}
                                            className={`px-3 py-1.5 text-sm rounded border transition-colors w-[320px] text-left ${
                                                timeRange === '24h'
                                                    ? 'border-cyan-500 bg-cyan-500/20 text-cyan-400'
                                                    : 'border-cyan-500/30 bg-black/50 text-gray-300 hover:border-cyan-500/50 hover:bg-black/70'
                                            }`}
                                        >
                                            In the last 24 hours
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => { setTimeRange('48h'); setIsTimeDropdownOpen(false); }}
                                            className={`px-3 py-1.5 text-sm rounded border transition-colors w-[320px] text-left ${
                                                timeRange === '48h'
                                                    ? 'border-cyan-500 bg-cyan-500/20 text-cyan-400'
                                                    : 'border-cyan-500/30 bg-black/50 text-gray-300 hover:border-cyan-500/50 hover:bg-black/70'
                                            }`}
                                        >
                                            In the last 48 hours
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => { setTimeRange('before'); }}
                                            className={`px-3 py-1.5 text-sm rounded border transition-colors w-[320px] text-left ${
                                                timeRange === 'before'
                                                    ? 'border-cyan-500 bg-cyan-500/20 text-cyan-400'
                                                    : 'border-cyan-500/30 bg-black/50 text-gray-300 hover:border-cyan-500/50 hover:bg-black/70'
                                            }`}
                                        >
                                            On or Before
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => { setTimeRange('after'); }}
                                            className={`px-3 py-1.5 text-sm rounded border transition-colors w-[320px] text-left ${
                                                timeRange === 'after'
                                                    ? 'border-cyan-500 bg-cyan-500/20 text-cyan-400'
                                                    : 'border-cyan-500/30 bg-black/50 text-gray-300 hover:border-cyan-500/50 hover:bg-black/70'
                                            }`}
                                        >
                                            On or After
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => { setTimeRange('custom'); }}
                                            className={`px-3 py-1.5 text-sm rounded border transition-colors w-[320px] text-left ${
                                                timeRange === 'custom'
                                                    ? 'border-cyan-500 bg-cyan-500/20 text-cyan-400'
                                                    : 'border-cyan-500/30 bg-black/50 text-gray-300 hover:border-cyan-500/50 hover:bg-black/70'
                                            }`}
                                        >
                                            Custom Range
                                        </button>
                                    </div>

                                    {timeRange === 'before' && (
                                        <div className="border-t border-cyan-500/20 px-3 py-3">
                                            <div className="flex flex-col gap-2">
                                                <label className="text-sm text-gray-400">Date</label>
                                                <DatePicker
                                                    selected={beforeDate}
                                                    onChange={(date) => {
                                                        setBeforeDate(date);
                                                        if (date) {
                                                            setTimeRange('before');
                                                        }
                                                    }}
                                                    showTimeSelect
                                                    dateFormat="MM/dd/yyyy h:mm aa"
                                                    className="rounded border border-cyan-500/30 bg-black/50 px-3 py-1.5 text-sm text-gray-300 hover:border-cyan-500/50 hover:bg-black/70 transition-colors"
                                                    wrapperClassName="w-[320px] min-w-[320px]"
                                                    popperPlacement="bottom-start"
                                                />
                                            </div>
                                        </div>
                                    )}
                                    {timeRange === 'after' && (
                                        <div className="border-t border-cyan-500/20 px-3 py-3">
                                            <div className="flex flex-col gap-2">
                                                <label className="text-sm text-gray-400">Date</label>
                                                <DatePicker
                                                    selected={afterDate}
                                                    onChange={(date) => {
                                                        setAfterDate(date);
                                                        if (date) {
                                                            setTimeRange('after');
                                                        }
                                                    }}
                                                    showTimeSelect
                                                    dateFormat="MM/dd/yyyy h:mm aa"
                                                    className="rounded border border-cyan-500/30 bg-black/50 px-3 py-1.5 text-sm text-gray-300 hover:border-cyan-500/50 hover:bg-black/70 transition-colors"
                                                    wrapperClassName="w-[320px] min-w-[320px]"
                                                    popperPlacement="bottom-start"
                                                />
                                            </div>
                                        </div>
                                    )}
                                    {timeRange === 'custom' && (
                                        <div className="border-t border-cyan-500/20 px-3 py-3 space-y-4">
                                            <div className="flex flex-col gap-2">
                                                <label className="text-sm text-gray-400">Start</label>
                                                <DatePicker
                                                    selected={startDate ? new Date(startDate) : null}
                                                    onChange={(date) => {
                                                        if (date) {
                                                            setTimeRange('custom');
                                                            setStartDate(formatDate(date));
                                                        }
                                                    }}
                                                    showTimeSelect
                                                    dateFormat="MM/dd/yyyy h:mm aa"
                                                    className="rounded border border-cyan-500/30 bg-black/50 px-3 py-1.5 text-sm text-gray-300 hover:border-cyan-500/50 hover:bg-black/70 transition-colors"
                                                    wrapperClassName="w-[320px] min-w-[320px]"
                                                    popperPlacement="bottom-start"
                                                />
                                            </div>
                                            <div className="flex flex-col gap-2">
                                                <label className="text-sm text-gray-400">End</label>
                                                <DatePicker
                                                    selected={endDate ? new Date(endDate) : null}
                                                    onChange={(date) => {
                                                        if (date) {
                                                            setTimeRange('custom');
                                                            setEndDate(formatDate(date));
                                                        }
                                                    }}
                                                    showTimeSelect
                                                    dateFormat="MM/dd/yyyy h:mm aa"
                                                    className="rounded border border-cyan-500/30 bg-black/50 px-3 py-1.5 text-sm text-gray-300 hover:border-cyan-500/50 hover:bg-black/70 transition-colors"
                                                    wrapperClassName="w-[320px] min-w-[320px]"
                                                    popperPlacement="bottom-start"
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
                
                <div className="h-[calc(100%-120px)] overflow-hidden">
                    <TradingMetricsComparisonTable 
                        data={data} 
                        isLoading={isLoading}
                    />
                </div>
            </div>
        </div>
    );
}

