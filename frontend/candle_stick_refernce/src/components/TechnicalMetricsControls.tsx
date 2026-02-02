import { useEffect, useState, useRef } from 'react';
import { useDashboardStore } from '../state/dashboardStore';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';

type TimeRange = '1h' | '24h' | '48h' | 'before' | 'after' | 'custom';

const TechnicalMetricsControls = () => {
	const {
		selectedExperimentId,
		experiments,
		technicalMetricsStart,
		technicalMetricsEnd,
		selectedModel,
		models,
		setters,
		loadTechnicalMetricsData,
		loadModels,
		loadExperiments,
		loadTickers,
	} = useDashboardStore();

	// Initialize timeRange from sessionStorage if available (from master table navigation)
	const [timeRange, setTimeRange] = useState<TimeRange>(() => {
		const stored = sessionStorage.getItem('technicalMetricsTimeRange');
		if (stored && (stored === '1h' || stored === '24h' || stored === '48h' || stored === 'before' || stored === 'after' || stored === 'custom')) {
			sessionStorage.removeItem('technicalMetricsTimeRange'); // Clear after reading
			return stored as TimeRange;
		}
		return '24h';
	});
	const loadingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const timeRangeFromEventRef = useRef<TimeRange | null>(null);
	const isSettingDatesProgrammaticallyRef = useRef(false);
	const currentTimeRangeRef = useRef<TimeRange>(timeRange);
	const [isTimeDropdownOpen, setIsTimeDropdownOpen] = useState(false);
	const timeDropdownRef = useRef<HTMLDivElement | null>(null);
	const [beforeDate, setBeforeDate] = useState<Date | null>(null);
	const [afterDate, setAfterDate] = useState<Date | null>(null);
	
	// Keep ref in sync with state
	useEffect(() => {
		currentTimeRangeRef.current = timeRange;
	}, [timeRange]);

	// Listen for time range updates from master table navigation
	useEffect(() => {
		const handleTimeRangeUpdate = (event: CustomEvent<{ timeRange: TimeRange }>) => {
			const newTimeRange = event.detail.timeRange;
			timeRangeFromEventRef.current = newTimeRange;
			setTimeRange(newTimeRange);
		};

		window.addEventListener('setTechnicalMetricsTimeRange', handleTimeRangeUpdate as EventListener);
		return () => {
			window.removeEventListener('setTechnicalMetricsTimeRange', handleTimeRangeUpdate as EventListener);
		};
	}, []);

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
		loadTickers();
		// Load models on initial mount
		if (technicalMetricsStart && technicalMetricsEnd) {
			loadModels(technicalMetricsStart, technicalMetricsEnd);
			loadExperiments(technicalMetricsStart, technicalMetricsEnd);
		} else {
			loadModels();
			loadExperiments();
		}
	}, []); // Only run on mount
	
	// Reload models when date range changes (debounced to prevent rapid calls)
	useEffect(() => {
		if (loadingTimeoutRef.current) {
			clearTimeout(loadingTimeoutRef.current);
		}
		
		loadingTimeoutRef.current = setTimeout(() => {
			if (technicalMetricsStart && technicalMetricsEnd) {
				loadModels(technicalMetricsStart, technicalMetricsEnd);
				loadExperiments(technicalMetricsStart, technicalMetricsEnd);
			} else {
				loadModels();
				loadExperiments();
			}
		}, 300);

		return () => {
			if (loadingTimeoutRef.current) {
				clearTimeout(loadingTimeoutRef.current);
			}
		};
	}, [technicalMetricsStart, technicalMetricsEnd, loadModels, loadExperiments]);

	// Auto-refresh when model or dates change (debounced to prevent rapid calls)
	useEffect(() => {
		if (loadingTimeoutRef.current) {
			clearTimeout(loadingTimeoutRef.current);
		}

		loadingTimeoutRef.current = setTimeout(() => {
		if (technicalMetricsStart && technicalMetricsEnd) {
			loadTechnicalMetricsData();
		}
		}, 300);

		return () => {
			if (loadingTimeoutRef.current) {
				clearTimeout(loadingTimeoutRef.current);
			}
		};
	}, [selectedExperimentId, selectedModel, technicalMetricsStart, technicalMetricsEnd, loadTechnicalMetricsData]);

	// Detect if dates match a preset range and update timeRange accordingly
	// Only if we haven't received an explicit timeRange from a custom event
	useEffect(() => {
		if (!technicalMetricsStart || !technicalMetricsEnd) return;
		
		// Skip detection if we're programmatically setting dates
		if (isSettingDatesProgrammaticallyRef.current) {
			return;
		}
		
		// If we just received a timeRange from an event, use it and clear the ref
		if (timeRangeFromEventRef.current) {
			const eventTimeRange = timeRangeFromEventRef.current;
			timeRangeFromEventRef.current = null; // Clear after using
			setTimeRange(eventTimeRange);
			return;
		}

		const now = new Date();
		const end = new Date(technicalMetricsEnd);
		const start = new Date(technicalMetricsStart);
		
		// Check if end date is close to now (within 1 minute tolerance)
		const endDiff = Math.abs(now.getTime() - end.getTime());
		if (endDiff > 60 * 1000) {
			// End date is not close to now, could be custom, before, or after
			// Check if start is very early (before mode)
			const veryEarly = new Date('2020-01-01T00:00');
			if (Math.abs(start.getTime() - veryEarly.getTime()) < 60 * 1000) {
				// This looks like "before" mode
				setTimeRange('before');
				setBeforeDate(end);
				return;
			}
			// Check if end is close to now (after mode)
			if (endDiff < 5 * 60 * 1000) { // 5 minute tolerance for "after" mode
				setTimeRange('after');
				setAfterDate(start);
				return;
			}
			// Only set to custom if current timeRange is not already a preset
			const currentRange = currentTimeRangeRef.current;
			if (currentRange !== '1h' && currentRange !== '24h' && currentRange !== '48h' && currentRange !== 'before' && currentRange !== 'after') {
				setTimeRange('custom');
			}
			return;
		}

		// Calculate the difference between start and end
		const diff = end.getTime() - start.getTime();
		const oneHour = 60 * 60 * 1000;
		const twentyFourHours = 24 * 60 * 60 * 1000;
		const fortyEightHours = 48 * 60 * 60 * 1000;
		const tolerance = 60 * 1000; // 1 minute tolerance

		const currentRange = currentTimeRangeRef.current;
		
		// Only update timeRange if dates match a preset and current timeRange doesn't match
		if (Math.abs(diff - oneHour) < tolerance) {
			if (currentRange !== '1h') setTimeRange('1h');
		} else if (Math.abs(diff - twentyFourHours) < tolerance) {
			if (currentRange !== '24h') setTimeRange('24h');
		} else if (Math.abs(diff - fortyEightHours) < tolerance) {
			if (currentRange !== '48h') setTimeRange('48h');
		} else {
			// Only set to custom if current timeRange is not already a preset
			if (currentRange !== '1h' && currentRange !== '24h' && currentRange !== '48h' && currentRange !== 'before' && currentRange !== 'after') {
				setTimeRange('custom');
			}
		}
	}, [technicalMetricsStart, technicalMetricsEnd]);

	// Set date range based on selected time range
	useEffect(() => {
		if (timeRange === 'custom' || timeRange === 'before' || timeRange === 'after') {
			isSettingDatesProgrammaticallyRef.current = false;
			return;
		}

		isSettingDatesProgrammaticallyRef.current = true;
		
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
				isSettingDatesProgrammaticallyRef.current = false;
				return;
		}

		setters.setTechnicalMetricsStart(start);
		setters.setTechnicalMetricsEnd(end);
		
		// Clear the flag after a short delay to ensure detection useEffect has run
		setTimeout(() => {
			isSettingDatesProgrammaticallyRef.current = false;
		}, 100);
	}, [timeRange, setters]);

	// Handle "On or Before" date selection
	useEffect(() => {
		if (timeRange === 'before' && beforeDate) {
			isSettingDatesProgrammaticallyRef.current = true;
			const selectedDate = new Date(beforeDate);
			selectedDate.setHours(23, 59, 59, 999); // End of day
			const end = formatDate(selectedDate);
			// Set start to a very early date (e.g., 2020-01-01)
			const start = '2020-01-01T00:00';
			setters.setTechnicalMetricsStart(start);
			setters.setTechnicalMetricsEnd(end);
			setTimeout(() => {
				isSettingDatesProgrammaticallyRef.current = false;
			}, 100);
		} else if (timeRange === 'before') {
			isSettingDatesProgrammaticallyRef.current = false;
		}
	}, [timeRange, beforeDate, setters]);

	// Handle "On or After" date selection
	useEffect(() => {
		if (timeRange === 'after' && afterDate) {
			isSettingDatesProgrammaticallyRef.current = true;
			const selectedDate = new Date(afterDate);
			selectedDate.setHours(0, 0, 0, 0); // Start of day
			const start = formatDate(selectedDate);
			// Set end to now
			const now = new Date();
			const end = formatDate(now);
			setters.setTechnicalMetricsStart(start);
			setters.setTechnicalMetricsEnd(end);
			setTimeout(() => {
				isSettingDatesProgrammaticallyRef.current = false;
			}, 100);
		} else if (timeRange === 'after') {
			isSettingDatesProgrammaticallyRef.current = false;
		}
	}, [timeRange, afterDate, setters]);

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
		<div className="flex flex-wrap items-center justify-between gap-4">
			<div className="flex flex-wrap items-center gap-4">
				<div className="flex items-center gap-2">
					<label className="text-sm text-gray-400">Experiment</label>
					<select
						value={selectedExperimentId}
						onChange={(e) => setters.setSelectedExperimentId(e.target.value)}
						className="rounded border border-cyan-500/30 bg-black/50 px-3 py-1.5 text-sm text-gray-300 hover:border-cyan-500/50 hover:bg-black/70 transition-colors w-[150px]"
						style={{ width: '150px' }}
					>
						<option value="ALL">All</option>
						{(experiments || []).map((x) => (
							<option key={x} value={x}>
								{x}
							</option>
						))}
					</select>
				</div>
				<div className="flex items-center gap-2">
					<label className="text-sm text-gray-400">Model</label>
					<select
						value={selectedModel ?? ''}
						onChange={(e) => setters.setSelectedModel(e.target.value || null)}
						className="rounded border border-cyan-500/30 bg-black/50 px-3 py-1.5 text-sm text-gray-300 hover:border-cyan-500/50 hover:bg-black/70 transition-colors w-[150px]"
						style={{ width: '150px' }}
					>
						<option value="">All Models</option>
						{models.map((m) => (
							<option key={m} value={m}>
								{m}
							</option>
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
						selected={technicalMetricsStart ? new Date(technicalMetricsStart) : null}
						onChange={(date) => {
							if (date) {
														setTimeRange('custom');
														isSettingDatesProgrammaticallyRef.current = false; // Allow detection for manual custom range changes
														setters.setTechnicalMetricsStart(formatDate(date));
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
						selected={technicalMetricsEnd ? new Date(technicalMetricsEnd) : null}
						onChange={(date) => {
							if (date) {
														setTimeRange('custom');
														isSettingDatesProgrammaticallyRef.current = false; // Allow detection for manual custom range changes
														setters.setTechnicalMetricsEnd(formatDate(date));
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

			<button
				onClick={() => {
					const event = new CustomEvent('openMasterTable');
					window.dispatchEvent(event);
				}}
				className="rounded border border-cyan-500/30 bg-black/50 px-3 py-1.5 text-sm text-gray-300 hover:border-cyan-500/50 hover:bg-black/70 transition-colors"
			>
				Master Table
			</button>
			</div>
		);
};

export default TechnicalMetricsControls;
