import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useDashboardStore } from '../state/dashboardStore';
import Skeleton from './Skeleton';
import { getApiBase } from '../utils/api';

interface ExitReasonData {
    exit_reason: string;
    live: number;
    validate: number;
}

export default function ExitReasonsComparisonChart() {
    const { selectedModel, technicalMetricsStart, technicalMetricsEnd, validationSelectedSymbols } = useDashboardStore();
    const [data, setData] = useState<ExitReasonData[]>([]);
    const [loading, setLoading] = useState(true);
    const API_BASE = getApiBase();

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                const params = new URLSearchParams();
                if (technicalMetricsStart) params.append('start_date', technicalMetricsStart);
                if (technicalMetricsEnd) params.append('end_date', technicalMetricsEnd);
                if (selectedModel) params.append('model_name', selectedModel);
                if (validationSelectedSymbols && validationSelectedSymbols.length > 0) {
                    params.append('symbols', validationSelectedSymbols.join(','));
                }

                const response = await fetch(`${API_BASE}/api/exit_reasons_comparison?${params}`);
                const result = await response.json();
                setData(Array.isArray(result) ? result : []);
            } catch (error) {
                setData([]);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [selectedModel, validationSelectedSymbols, technicalMetricsStart, technicalMetricsEnd]);

    return (
        <div className="rounded-lg border border-cyan-500/20 bg-black/80 backdrop-blur-sm shadow-lg">
            <div className="px-4 pt-4 pb-3 h-[52px] flex items-start">
                <h3 className="metallic-title text-sm font-semibold uppercase tracking-wide leading-tight line-clamp-2">Exit Reasons Comparison</h3>
            </div>
            <div className="aspect-[5/3] px-4 pb-4">
                {loading ? (
                    <div className="p-4">
                        <Skeleton className="h-full w-full" />
                    </div>
                ) : data.length === 0 ? (
                    <div className="p-4">
                        <Skeleton className="h-full w-full" />
                    </div>
                ) : (
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart 
                        data={data} 
                        layout="vertical"
                        margin={{ top: 5, right: 0, left: -16, bottom: 20 }}
                        barCategoryGap="20%"
                        barGap={4}
                    >
                        <CartesianGrid stroke="#06b6d4" strokeDasharray="3 3" opacity={0.15} />
                        <XAxis 
                            type="number" 
                            tick={{ fontSize: '0.7rem', fill: '#6b7280' }}
                            axisLine={{ stroke: '#06b6d4', opacity: 0.3 }}
                            tickLine={{ stroke: '#06b6d4', opacity: 0.3 }}
                        />
                        <YAxis 
                            type="category" 
                            dataKey="exit_reason" 
                            width={110}
                            tick={{ fontSize: '0.7rem', fill: '#6b7280' }}
                            axisLine={{ stroke: '#06b6d4', opacity: 0.3 }}
                            tickLine={{ stroke: '#06b6d4', opacity: 0.3 }}
                        />
                        <Tooltip 
                            contentStyle={{ 
                                backgroundColor: '#000000', 
                                border: '1px solid #06b6d4',
                                borderRadius: '0.375rem',
                                color: '#e5e7eb'
                            }}
                        />
                        <Legend wrapperStyle={{ fontSize: '0.7rem', color: '#6b7280' }} />
                        <Bar dataKey="live" name="Live Simulator" fill="#06b6d4" />
                        <Bar dataKey="validate" name="Validation Simulator" fill="#14b8a6" />
                    </BarChart>
                </ResponsiveContainer>
                )}
            </div>
        </div>
    );
}

