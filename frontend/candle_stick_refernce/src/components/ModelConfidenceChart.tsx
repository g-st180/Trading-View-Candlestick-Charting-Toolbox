import MetricLineChart from './MetricLineChart';
import { useDashboardStore } from '../state/dashboardStore';

const ModelConfidenceChart = () => {
  const data = useDashboardStore((state) => state.modelConfidenceSeries);

  // The 'value' from the API is between 0 and 1. The tooltip formatter in MetricLineChart
  // assumes the value is in seconds. We need a custom formatter here.
  const yAxisFormatter = (value: any) => {
    const n = Number(value);
    if (isNaN(n)) return '';
    // Format as percentage
    return `${(n * 100).toFixed(0)}%`;
  };

  const tooltipFormatter = (value: any) => {
    const n = Number(value);
    if (isNaN(n)) return '';
    return `${(n * 100).toFixed(2)}%`;
  };

  return (
    <MetricLineChart
      series={data}
      title="Average model confidence per iteration (%)"
      color="#06b6d4"
      yAxisTickFormatter={yAxisFormatter}
      tooltipValueFormatter={tooltipFormatter}
    />
  );
};

export default ModelConfidenceChart;
