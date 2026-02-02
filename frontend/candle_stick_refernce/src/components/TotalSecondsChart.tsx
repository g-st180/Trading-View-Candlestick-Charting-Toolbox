import { useEffect, useState } from 'react';
import MetricLineChart from './MetricLineChart';
import { useDashboardStore } from '../state/dashboardStore';
import { getApiBase } from '../utils/api';

export default function TotalSecondsChart() {
	const series = useDashboardStore((s) => s.totalSeries);
	const { selectedModel } = useDashboardStore();
	const [percentile95, setPercentile95] = useState<number | null>(null);
	const API_BASE = getApiBase();

	useEffect(() => {
		const fetchPercentile = async () => {
			try {
				const params = new URLSearchParams();
				if (selectedModel) params.append('model_name', selectedModel);
				const response = await fetch(`${API_BASE}/api/metrics_percentile?${params}`);
				const data = await response.json();
				const value = data.total_seconds;
				if (value !== null && value !== undefined && !isNaN(value)) {
					setPercentile95(Number(value));
				} else {
					setPercentile95(null);
				}
			} catch (error) {
				setPercentile95(null);
			}
		};
		fetchPercentile();
	}, [selectedModel, API_BASE]);

	return <MetricLineChart title="Average time per iteration" series={series} color="#06b6d4" percentile95={percentile95} />;
}
