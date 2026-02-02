import { useEffect, useState, useRef } from 'react';
import { useDashboardStore } from '../state/dashboardStore';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';

type TimeRange = '1h' | '24h' | '48h' | 'before' | 'after' | 'custom';

export default function PortfolioMetricsControls() {
	const {
		selectedExperimentId,
		experiments,
		portfolioStart,
		portfolioEnd,
		loadPortfolioData,
		loadTickers,
		loadExperiments,
		setters,
	} = useDashboardStore();

	const { setPortfolioStart, setPortfolioEnd } = setters;
	const [timeRange, setTimeRange] = useState<TimeRange>('24h');
	const [isTimeDropdownOpen, setIsTimeDropdownOpen] = useState(false);
	const timeDropdownRef = useRef<HTMLDivElement | null>(null);
	const [beforeDate, setBeforeDate] = useState<Date | null>(null);
	const [afterDate, setAfterDate] = useState<Date | null>(null);

	useEffect(() => {
		loadTickers()
			.then(() => loadExperiments(portfolioStart, portfolioEnd))
			.then(() => loadPortfolioData());
	}, [loadTickers, loadExperiments, loadPortfolioData, portfolioStart, portfolioEnd]);

	// Auto-refresh when dates change
	useEffect(() => {
		if (portfolioStart && portfolioEnd) {
			loadExperiments(portfolioStart, portfolioEnd);
			loadPortfolioData();
		}
	}, [selectedExperimentId, portfolioStart, portfolioEnd, loadPortfolioData, loadExperiments]);

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

		setPortfolioStart(start);
		setPortfolioEnd(end);
	}, [timeRange, setPortfolioStart, setPortfolioEnd]);

	// Handle "On or Before" date selection
	useEffect(() => {
		if (timeRange === 'before' && beforeDate) {
			const selectedDate = new Date(beforeDate);
			selectedDate.setHours(23, 59, 59, 999); // End of day
			const end = formatDate(selectedDate);
			// Set start to a very early date (e.g., 2020-01-01)
			const start = '2020-01-01T00:00';
			setPortfolioStart(start);
			setPortfolioEnd(end);
		}
	}, [timeRange, beforeDate, setPortfolioStart, setPortfolioEnd]);

	// Handle "On or After" date selection
	useEffect(() => {
		if (timeRange === 'after' && afterDate) {
			const selectedDate = new Date(afterDate);
			selectedDate.setHours(0, 0, 0, 0); // Start of day
			const start = formatDate(selectedDate);
			// Set end to now
			const now = new Date();
			const end = formatDate(now);
			setPortfolioStart(start);
			setPortfolioEnd(end);
		}
	}, [timeRange, afterDate, setPortfolioStart, setPortfolioEnd]);

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

	return (
		<div className="flex flex-wrap items-center gap-4">
			<div className="flex items-center gap-2">
				<label className="text-sm text-gray-400">Experiment</label>
				<select
					value={selectedExperimentId}
					onChange={(e) => setters.setSelectedExperimentId(e.target.value)}
					className="rounded border border-cyan-500/30 bg-black/50 px-3 py-1.5 text-sm text-gray-300 hover:border-cyan-500/50 hover:bg-black/70 transition-colors"
				>
					<option value="ALL">All</option>
					{(experiments || []).map((x) => (
						<option key={x} value={x}>{x}</option>
					))}
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
					selected={portfolioStart ? new Date(portfolioStart) : null}
					onChange={(date) => {
						if (date) {
													setTimeRange('custom');
													setPortfolioStart(formatDate(date));
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
					selected={portfolioEnd ? new Date(portfolioEnd) : null}
					onChange={(date) => {
						if (date) {
													setTimeRange('custom');
													setPortfolioEnd(formatDate(date));
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
	);
}
