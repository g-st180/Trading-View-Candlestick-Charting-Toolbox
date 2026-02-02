import { useEffect, useState } from 'react';
import TechnicalMetricsControls from '../components/TechnicalMetricsControls';
import AvgTpChart from '../components/AvgTpChart';
import TotalSecondsChart from '../components/TotalSecondsChart';
import FeatCalcTimeChart from '../components/FeatCalcTimeChart';
import ApiCandleFetchTimeChart from '../components/ApiCandleFetchTimeChart';
import PredictionTimeChart from '../components/PredictionTimeChart';
import ModelConfidenceChart from '../components/ModelConfidenceChart';
import ExitReasonsComparisonChart from '../components/ExitReasonsComparisonChart';
import PnlComparisonChart from '../components/PnlComparisonChart';
import TpSlDiffComparisonChart from '../components/TpSlDiffComparisonChart';
import AverageSlippageTable from '../components/AverageSlippageTable';
import MasterTableModal from '../components/MasterTableModal';
import { useDashboardStore } from '../state/dashboardStore';
import { getApiBase } from '../utils/api';

interface ValidationMetrics {
    portfolio_accuracy: string;
    total_trades: string;
    avg_duration_comparison: string;
    validation_time: string;
    win_rate_comparison: string;
}

interface OrderFulfillmentRate {
    fulfillment_rate: number;
    total_orders: number;
    filled_orders: number;
}

export default function TechnicalMetricsPage() {
    const { 
        selectedModel, 
        technicalMetricsStart, 
        technicalMetricsEnd, 
        validationSelectedSymbols,
        isValidationRunning,
        runValidation,
        loadTechnicalMetricsData,
        loadModels,
        symbols,
        setters
    } = useDashboardStore();
    
    const [showSymbolDropdown, setShowSymbolDropdown] = useState(false);
    
    const [validationMetrics, setValidationMetrics] = useState<ValidationMetrics>({
        portfolio_accuracy: '-',
        total_trades: '-',
        avg_duration_comparison: '-',
        validation_time: '-',
        win_rate_comparison: '-'
    });
    
    const [orderFulfillmentRate, setOrderFulfillmentRate] = useState<OrderFulfillmentRate>({
        fulfillment_rate: 0,
        total_orders: 0,
        filled_orders: 0
    });

    const fetchValidationMetrics = async () => {
        try {
            const params = new URLSearchParams();
            if (technicalMetricsStart) params.append('start_date', technicalMetricsStart);
            if (technicalMetricsEnd) params.append('end_date', technicalMetricsEnd);
            if (selectedModel) params.append('model_name', selectedModel);
            if (validationSelectedSymbols && validationSelectedSymbols.length > 0) {
                params.append('symbols', validationSelectedSymbols.join(','));
            }

            const API_BASE = getApiBase();
            const response = await fetch(`${API_BASE}/api/validation_metrics?${params}`);
            const data = await response.json();
            setValidationMetrics(data);
        } catch (error) {
            // ignore
        }
    };
    
    const fetchOrderFulfillmentRate = async () => {
        try {
            const params = new URLSearchParams();
            if (technicalMetricsStart) params.append('start_date', technicalMetricsStart);
            if (technicalMetricsEnd) params.append('end_date', technicalMetricsEnd);
            // Note: symbol filter could be added if needed, but order_attempts uses 'symbol' not 'ticker'

            const API_BASE = getApiBase();
            const response = await fetch(`${API_BASE}/api/order_fulfillment_rate?${params}`);
            const data = await response.json();
            setOrderFulfillmentRate(data);
        } catch (error) {
            setOrderFulfillmentRate({ fulfillment_rate: 0, total_orders: 0, filled_orders: 0 });
        }
    };

    const handleValidate = async () => {
        await runValidation();
        // After validation completes, reload all data (charts and validation metrics)
        await Promise.all([
            loadTechnicalMetricsData(),
            fetchValidationMetrics(),
            fetchOrderFulfillmentRate()
        ]);
    };

    // Load models on mount and when dates change
    useEffect(() => {
        if (technicalMetricsStart && technicalMetricsEnd) {
            loadModels(technicalMetricsStart, technicalMetricsEnd);
        } else {
            loadModels();
        }
    }, [technicalMetricsStart, technicalMetricsEnd, loadModels]);

    useEffect(() => {
        fetchValidationMetrics();
        fetchOrderFulfillmentRate();
    }, [selectedModel, validationSelectedSymbols, technicalMetricsStart, technicalMetricsEnd]);

    const toggleSymbol = (symbol: string) => {
        const current = validationSelectedSymbols;
        if (current.includes(symbol)) {
            setters.setValidationSelectedSymbols(current.filter(s => s !== symbol));
        } else {
            setters.setValidationSelectedSymbols([...current, symbol]);
        }
    };

    const selectAll = () => {
        setters.setValidationSelectedSymbols(symbols);
    };

    const deselectAll = () => {
        setters.setValidationSelectedSymbols([]);
    };

    return (
        <div className="space-y-6 metallic-emerald-bg min-h-screen px-6 py-8">
            <div className="flex items-center justify-between">
                <TechnicalMetricsControls />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <TotalSecondsChart />
                <ApiCandleFetchTimeChart />
                <FeatCalcTimeChart />
                <PredictionTimeChart />
                <ModelConfidenceChart />
                <AvgTpChart />
            </div>

            {/* Validate Button and Symbols Selector */}
            <div className="flex justify-start items-center gap-4">
                <button
                    className="rounded border border-cyan-500/30 bg-black/50 px-3 py-1.5 text-sm text-gray-300 hover:border-cyan-500/50 hover:bg-black/70 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                    onClick={handleValidate}
                    disabled={isValidationRunning}
                >
                    {isValidationRunning ? 'Running Validation...' : 'Validate'}
                </button>
                
                <div className="flex items-center gap-2 relative">
                    <label className="text-sm text-gray-400">Symbols</label>
                    <button
                        onClick={() => setShowSymbolDropdown(!showSymbolDropdown)}
                        className="rounded border border-cyan-500/30 bg-black/50 px-3 py-1.5 text-sm text-gray-300 hover:border-cyan-500/50 hover:bg-black/70 transition-colors text-left min-w-[150px]"
                    >
                        {validationSelectedSymbols.length === 0 
                            ? 'All Symbols' 
                            : validationSelectedSymbols.length === symbols.length
                            ? 'All Symbols'
                            : `${validationSelectedSymbols.length} selected`
                        }
                    </button>
                    {showSymbolDropdown && (
                        <div className="absolute top-full left-0 mt-1 rounded border border-cyan-500/30 bg-black/90 backdrop-blur-sm shadow-lg z-50 max-h-60 overflow-auto min-w-[200px]">
                            <div className="sticky top-0 bg-black/90 border-b border-cyan-500/20 p-2 flex gap-2">
                                <button 
                                    onClick={selectAll}
                                    className="text-xs px-2 py-1 bg-cyan-500/20 text-cyan-400 rounded hover:bg-cyan-500/30 border border-cyan-500/30"
                                >
                                    Select All
                                </button>
                                <button 
                                    onClick={deselectAll}
                                    className="text-xs px-2 py-1 bg-black/50 text-gray-300 rounded hover:bg-black/70 border border-cyan-500/30"
                                >
                                    Deselect All
                                </button>
                            </div>
                            {symbols.map((symbol) => (
                                <label key={symbol} className="flex items-center px-3 py-2 hover:bg-black/40 cursor-pointer text-gray-300">
                                    <input
                                        type="checkbox"
                                        checked={validationSelectedSymbols.includes(symbol)}
                                        onChange={() => toggleSymbol(symbol)}
                                        className="mr-2"
                                    />
                                    <span className="text-sm">{symbol}</span>
                                </label>
                            ))}
                        </div>
                    )}
                </div>
                
                {isValidationRunning && (
                    <div className="flex-1 h-1 rounded bg-gradient-to-r from-cyan-500 via-teal-500 to-emerald-500 progress-pulse" />
                )}
            </div>

            {/* Metric Cards Header */}
            <div className="grid grid-cols-5 gap-4">
                <div className="metric-card-glow rounded-lg border border-cyan-500/20 bg-black/70 backdrop-blur-sm p-6">
                    <h4 className="metallic-title text-xs font-medium uppercase tracking-wide mb-2">Portfolio Accuracy</h4>
                    <p className="text-2xl font-bold font-mono text-gray-200">{validationMetrics.portfolio_accuracy}</p>
                </div>
                <div className="metric-card-glow rounded-lg border border-cyan-500/20 bg-black/70 backdrop-blur-sm p-6">
                    <h4 className="metallic-title text-xs font-medium uppercase tracking-wide mb-2">Total Trades (L / V)</h4>
                    <p className="text-2xl font-bold font-mono text-gray-200">{validationMetrics.total_trades}</p>
                </div>
                <div className="metric-card-glow rounded-lg border border-cyan-500/20 bg-black/70 backdrop-blur-sm p-6">
                    <h4 className="metallic-title text-xs font-medium uppercase tracking-wide mb-2">Avg Duration (L / V)</h4>
                    <p className="text-2xl font-bold font-mono text-gray-200">{validationMetrics.avg_duration_comparison}</p>
                </div>
                <div className="metric-card-glow rounded-lg border border-cyan-500/20 bg-black/70 backdrop-blur-sm p-6">
                    <h4 className="metallic-title text-xs font-medium uppercase tracking-wide mb-2">Win Rate (L / V)</h4>
                    <p className="text-2xl font-bold font-mono text-gray-200">{validationMetrics.win_rate_comparison}</p>
                </div>
                <div className="metric-card-glow rounded-lg border border-cyan-500/20 bg-black/70 backdrop-blur-sm p-6">
                    <h4 className="metallic-title text-xs font-medium uppercase tracking-wide mb-2">Order Fulfillment Rate</h4>
                    <p className="text-2xl font-bold font-mono text-gray-200">
                        {orderFulfillmentRate.total_orders > 0 
                            ? `${orderFulfillmentRate.fulfillment_rate.toFixed(2)}%` 
                            : '-'}
                    </p>
                </div>
            </div>

            {/* Additional Charts */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <ExitReasonsComparisonChart />
                <PnlComparisonChart />
                <TpSlDiffComparisonChart />
            </div>

            {/* Full-width table at the end, like Orderbook */}
            <div className="grid grid-cols-1 gap-6">
                <AverageSlippageTable />
            </div>

            {/* Master Table Modal */}
            <MasterTableModal />
        </div>
    );
}
