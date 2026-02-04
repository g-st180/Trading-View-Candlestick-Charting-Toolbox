import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useDrawing } from './DrawingContext';

type ToolButton = {
	id: string;
	label: string;
	icon: JSX.Element;
};

function Icon({
	children,
	className = 'h-6 w-6',
	strokeWidth = 1.5,
}: {
	children: ReactNode;
	className?: string;
	strokeWidth?: number;
}) {
	return (
		<svg
			aria-hidden="true"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth={strokeWidth}
			strokeLinecap="round"
			strokeLinejoin="round"
			className={className}
		>
			{children}
		</svg>
	);
}

const topTools: ToolButton[] = [
	{
		id: 'crosshair',
		label: 'Crosshair',
		icon: (
			<Icon className="h-6 w-6" strokeWidth={1.2}>
				<path d="M12 3v6" />
				<path d="M12 15v6" />
				<path d="M3 12h6" />
				<path d="M15 12h6" />
			</Icon>
		),
	},
	{
		id: 'lines',
		label: 'Lines',
		icon: (
			<Icon>
				{/* draw line between bubble edges (prevents a "dot" inside the bubble from line endcaps) */}
				<path d="M6.5 17.5L17.5 6.5" />
				<circle cx="4" cy="20" r="2.5" fill="none" stroke="currentColor" strokeWidth={1.5} />
				<circle cx="20" cy="4" r="2.5" fill="none" stroke="currentColor" strokeWidth={1.5} />
			</Icon>
		),
	},
	{
		id: 'projection',
		label: 'Projection',
		icon: (
			<Icon>
				{/* RR box icon - rectangle with entry line */}
				<rect x="4" y="6" width="16" height="12" fill="none" stroke="currentColor" strokeWidth={1.5} />
				<path d="M4 12h16" stroke="currentColor" strokeWidth={1.5} strokeDasharray="2,2" />
			</Icon>
		),
	},
	{
		id: 'trendline',
		label: 'Trend line',
		icon: (
			<Icon>
				<path d="M4 16l6-6 4 4 6-6" />
				<circle cx="4" cy="16" r="1.5" />
				<circle cx="10" cy="10" r="1.5" />
				<circle cx="14" cy="14" r="1.5" />
				<circle cx="20" cy="8" r="1.5" />
			</Icon>
		),
	},
	{
		id: 'horizontal-line',
		label: 'Horizontal line',
		icon: (
			<Icon>
				{/* match Lines icon “box feel”: same default size + stroke; extend line closer to edges */}
				<path d="M2 12L22 12" />
				<circle cx="12" cy="12" r="2.5" fill="none" stroke="currentColor" strokeWidth={1.5} />
			</Icon>
		),
	},
	{
		id: 'fib',
		label: 'Fib tool',
		icon: (
			<Icon>
				<path d="M6 7l4 4 4-4 4 4" />
				<path d="M6 17l4-4 4 4 4-4" />
				<circle cx="6" cy="7" r="1.2" />
				<circle cx="10" cy="11" r="1.2" />
				<circle cx="14" cy="7" r="1.2" />
				<circle cx="18" cy="11" r="1.2" />
			</Icon>
		),
	},
	{
		id: 'brush',
		label: 'Brush',
		icon: (
			<Icon>
				<path d="M4 20c3 0 4-1 6-3" />
				<path d="M10 17l8-8a3 3 0 10-4-4l-8 8" />
			</Icon>
		),
	},
	{
		id: 'text',
		label: 'Text',
		icon: (
			<Icon>
				<path d="M4 5h16" />
				<path d="M12 5v14" />
				<path d="M7 19h10" />
			</Icon>
		),
	},
	{
		id: 'emoji',
		label: 'Emoji',
		icon: (
			<Icon>
				<circle cx="12" cy="12" r="9" />
				<path d="M8.5 10h.01" />
				<path d="M15.5 10h.01" />
				<path d="M8 15c1.2 1.5 2.6 2.3 4 2.3S14.8 16.5 16 15" />
			</Icon>
		),
	},
];

const midTools: ToolButton[] = [
	{
		id: 'ruler',
		label: 'Ruler',
		icon: (
			<Icon>
				<path d="M4 16l16-8" />
				<path d="M7 14l1 2" />
				<path d="M10 12l1 2" />
				<path d="M13 10l1 2" />
				<path d="M16 8l1 2" />
			</Icon>
		),
	},
	{
		id: 'zoom',
		label: 'Zoom',
		icon: (
			<Icon>
				<circle cx="11" cy="11" r="6" />
				<path d="M20 20l-3.5-3.5" />
				<path d="M11 8v6" />
				<path d="M8 11h6" />
			</Icon>
		),
	},
	{
		id: 'magnet',
		label: 'Magnet',
		icon: (
			<Icon>
				<path d="M7 7v6a5 5 0 0010 0V7" />
				<path d="M7 7h4" />
				<path d="M13 7h4" />
			</Icon>
		),
	},
];

const bottomTools: ToolButton[] = [
	{
		id: 'lock',
		label: 'Lock',
		icon: (
			<Icon>
				<rect x="6" y="11" width="12" height="9" rx="2" />
				<path d="M8 11V9a4 4 0 018 0v2" />
			</Icon>
		),
	},
	{
		id: 'eye',
		label: 'Visibility',
		icon: (
			<Icon>
				<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
				<circle cx="12" cy="12" r="2.5" />
			</Icon>
		),
	},
	{
		id: 'trash',
		label: 'Delete',
		icon: (
			<Icon>
				<path d="M3 6h18" />
				<path d="M8 6V4h8v2" />
				<path d="M6 6l1 16h10l1-16" />
			</Icon>
		),
	},
];

interface LeftToolbarProps {
	selectedCrosshairType: string;
	onCrosshairTypeChange: (type: string) => void;
}

export default function LeftToolbar({ selectedCrosshairType, onCrosshairTypeChange }: LeftToolbarProps) {
	const [activeToolId, setActiveToolId] = useState<string>('crosshair');
	const [showCrosshairMenu, setShowCrosshairMenu] = useState(false);
	const [hoveredItemId, setHoveredItemId] = useState<string | null>(null);
	const [showLinesMenu, setShowLinesMenu] = useState(false);
	const [hoveredLinesItemId, setHoveredLinesItemId] = useState<string | null>(null);
	const [selectedLinesType, setSelectedLinesType] = useState<'lines' | 'ray' | 'horizontal-line' | 'horizontal-ray' | 'parallel-channel'>('lines');
	const [showProjectionMenu, setShowProjectionMenu] = useState(false);
	const [hoveredProjectionItemId, setHoveredProjectionItemId] = useState<string | null>(null);
	const [selectedProjectionType, setSelectedProjectionType] = useState<'long-position'>('long-position');
	const { activeTool, setActiveTool, selectedDrawingId, drawings, removeDrawing, updateDrawing, setSelectedDrawingId, setSelectedHorizontalLineId, setSelectedHorizontalRayId, setSelectedLineId } =
		useDrawing();

	// Keep toolbar highlight in sync with the actual active drawing tool.
	// This makes the UI “snap back” to Cross immediately after tools like Horizontal Line auto-exit.
	useEffect(() => {
		if (activeTool === null) {
			setActiveToolId('crosshair');
			setShowLinesMenu(false);
			return;
		}

		if (activeTool === 'lines' || activeTool === 'ray' || activeTool === 'horizontal-line' || activeTool === 'horizontal-ray' || activeTool === 'parallel-channel') {
			setActiveToolId('lines');
		}
		if (activeTool === 'long-position') {
			setActiveToolId('projection');
		}
	}, [activeTool]);

	const crosshairMenuItems = [
		{ id: 'cross', label: 'Cross', icon: 'cross' },
		{ id: 'arrow', label: 'Arrow', icon: 'arrow' },
		{ id: 'demonstration', label: 'Demonstration', icon: 'demonstration' },
		{ id: 'eraser', label: 'Eraser', icon: 'eraser' },
	];

	const linesMenuItems = [
		{ id: 'lines', label: 'Trend line', icon: 'ray' },
		{ id: 'ray', label: 'Ray', icon: 'ray-line' },
		{ id: 'horizontal-line', label: 'Horizontal line', icon: 'hline' },
		{ id: 'horizontal-ray', label: 'Horizontal ray', icon: 'hray' },
	];

	const channelsMenuItems: Array<{ id: string; label: string; icon: string }> = [
		{ id: 'parallel-channel', label: 'Parallel channel', icon: 'parallel-channel' },
	];

	const projectionMenuItems: Array<{ id: string; label: string; icon: string }> = [
		{ id: 'long-position', label: 'Long Position', icon: 'long-position' },
	];

	const renderButton = (tool: ToolButton) => {
		// Bottom actions: lock / eye / trash operate on selected drawing
		if (tool.id === 'trash' || tool.id === 'eye' || tool.id === 'lock') {
		const selected = selectedDrawingId ? drawings.find((d) => d.id === selectedDrawingId) : null;
			const isDisabled = !selected;

			return (
				<button
					key={tool.id}
					type="button"
					aria-label={tool.label}
					title={
						isDisabled
							? `${tool.label} (select a drawing first)`
							: tool.id === 'eye'
								? selected?.hidden
									? 'Show'
									: 'Hide'
								: tool.label
					}
					disabled={isDisabled}
					className={[
						'h-10 w-10 grid place-items-center rounded-lg transition-colors',
						isDisabled ? 'text-slate-300 cursor-not-allowed' : 'text-slate-900 hover:bg-slate-100 active:bg-slate-200',
					].join(' ')}
					onClick={() => {
						if (!selectedDrawingId) return;

						if (tool.id === 'trash') {
							removeDrawing(selectedDrawingId);
							setSelectedDrawingId(null);
							setSelectedHorizontalLineId(null);
							setSelectedHorizontalRayId(null);
							setSelectedLineId(null);
							return;
						}

						if (tool.id === 'eye') {
							// Keep selection even when hidden so the same eye button can bring it back.
							updateDrawing(selectedDrawingId, (prev) => ({ ...prev, hidden: !prev.hidden }));
							return;
						}

						if (tool.id === 'lock') {
							updateDrawing(selectedDrawingId, (prev) => ({ ...prev, locked: !prev.locked }));
						}
					}}
				>
					{tool.id === 'eye' ? (
						selected?.hidden ? (
							<Icon>
								<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
								<circle cx="12" cy="12" r="2.5" />
								<path d="M4 20L20 4" />
							</Icon>
						) : (
							tool.icon
						)
					) : (
						tool.icon
					)}
				</button>
			);
		}

		if (tool.id === 'crosshair') {
			return (
				<div
					key={tool.id}
					className="relative"
					onMouseLeave={() => {
						// Keep menu open on click, close on mouse leave if not clicked
						if (!showCrosshairMenu) return;
					}}
				>
					<button
						type="button"
						aria-label={tool.label}
						title={tool.label}
						className={[
							'h-10 w-10 grid place-items-center rounded-lg transition-colors',
							tool.id === activeToolId
								? 'text-blue-600'
								: 'text-slate-900 hover:bg-slate-100 active:bg-slate-200',
						].join(' ')}
						onClick={() => {
							// Crosshair is a navigation/tool-mode switch, not a drawing tool
							setActiveToolId('crosshair');
							setActiveTool(null);
							setShowCrosshairMenu(!showCrosshairMenu);
						}}
					>
						{tool.icon}
					</button>

					{/* Dropdown menu */}
					{showCrosshairMenu && (
						<div
							className="absolute left-full ml-2 top-0 bg-white border border-slate-200 rounded-lg shadow-lg py-1 min-w-[180px] z-50"
							onMouseLeave={() => setShowCrosshairMenu(false)}
						>
							{crosshairMenuItems.map((item) => {
								const isSelected = selectedCrosshairType === item.id;
								const isHovered = hoveredItemId === item.id;
								
								return (
									<button
										key={item.id}
										type="button"
										onClick={() => {
											// Crosshair menu also hosts some tools (like horizontal line).
											// For tools: do NOT change the selected crosshair type; keep it on whatever
											// the user had (default: cross), so after placing a line you naturally go back to crosshair.
											setActiveToolId('crosshair');
											if (item.id === 'horizontal-line') {
												setActiveTool('horizontal-line' as any);
											} else {
												onCrosshairTypeChange(item.id);
												setActiveTool(null);
											}
											setShowCrosshairMenu(false);
										}}
										onMouseEnter={() => setHoveredItemId(item.id)}
										onMouseLeave={() => setHoveredItemId(null)}
										className={[
											'w-full px-3 py-2 text-left text-sm flex items-center justify-between transition-colors',
											isSelected
												? 'bg-slate-700 text-white'
												: 'text-slate-900 hover:bg-transparent',
										].join(' ')}
									>
										<span className="flex items-center gap-2">
											{item.icon === 'cross' && (
												<Icon className={`h-4 w-4 ${isSelected ? 'text-white' : 'text-slate-900'}`} strokeWidth={1.2}>
													<path d="M12 3v6" />
													<path d="M12 15v6" />
													<path d="M3 12h6" />
													<path d="M15 12h6" />
												</Icon>
											)}
											{item.icon === 'arrow' && (
												<Icon className={`h-4 w-4 ${isSelected ? 'text-white' : 'text-slate-900'}`} strokeWidth={2}>
													<path d="M5 12h14" />
													<path d="M12 5l7 7-7 7" />
												</Icon>
											)}
											{item.icon === 'hline' && (
												<Icon className={`h-4 w-4 ${isSelected ? 'text-white' : 'text-slate-900'}`} strokeWidth={2}>
													<path d="M4 12h16" />
												</Icon>
											)}
											{item.icon === 'demonstration' && (
												<Icon className={`h-4 w-4 ${isSelected ? 'text-white' : 'text-slate-900'}`} strokeWidth={2}>
													<circle cx="12" cy="12" r="10" />
													<path d="M8 8l8 4-8 4V8z" />
													<path d="M8 8l4 4" />
												</Icon>
											)}
											{item.icon === 'eraser' && (
												<Icon className={`h-4 w-4 ${isSelected ? 'text-white' : 'text-slate-900'}`} strokeWidth={2}>
													<path d="M7 18l-4-4 8-8 4 4-8 8z" />
													<path d="M11 10l4 4" />
												</Icon>
											)}
											{item.label}
										</span>
										{(isSelected || isHovered) && (
											<svg
												className={`h-4 w-4 ${isSelected ? 'text-blue-500' : 'text-slate-400'}`}
												fill="none"
												stroke="currentColor"
												viewBox="0 0 24 24"
												strokeWidth={2}
											>
												<path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
											</svg>
										)}
									</button>
								);
							})}
						</div>
					)}
				</div>
			);
		}

		if (tool.id === 'projection') {
			return (
				<div key={tool.id} className="relative">
					<button
						type="button"
						aria-label={tool.label}
						title={tool.label}
						className={[
							'h-10 w-10 grid place-items-center rounded-lg transition-colors',
							activeToolId === 'projection'
								? 'text-blue-600'
								: 'text-slate-900 hover:bg-slate-100 active:bg-slate-200',
						].join(' ')}
						onClick={() => {
							setActiveToolId('projection');
							setActiveTool(selectedProjectionType as any);
							setShowProjectionMenu((v) => !v);
						}}
					>
						{tool.icon}
					</button>

					{showProjectionMenu && (
						<div
							className="absolute left-full ml-2 top-0 bg-white border border-slate-200 rounded-lg shadow-lg py-1 min-w-[180px] z-50"
							onMouseLeave={() => setShowProjectionMenu(false)}
						>
							<div className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-100">
								Projection
							</div>
							{projectionMenuItems.map((item) => {
								const isSelected = selectedProjectionType === item.id;
								const isHovered = hoveredProjectionItemId === item.id;

								return (
									<button
										key={item.id}
										type="button"
										onClick={() => {
											setSelectedProjectionType(item.id as 'long-position');
											setActiveTool(item.id as any);
											setShowProjectionMenu(false);
										}}
										onMouseEnter={() => setHoveredProjectionItemId(item.id)}
										onMouseLeave={() => setHoveredProjectionItemId(null)}
										className={[
											'w-full px-3 py-2 text-left text-sm flex items-center justify-between transition-colors',
											isSelected
												? 'bg-slate-700 text-white'
												: 'text-slate-900 hover:bg-transparent',
										].join(' ')}
									>
										<span className="flex items-center gap-2">
											{item.icon === 'long-position' && (
												<Icon className={`h-4 w-4 ${isSelected ? 'text-white' : 'text-slate-900'}`} strokeWidth={1.5}>
													<rect x="4" y="6" width="16" height="12" fill="none" stroke="currentColor" />
													<path d="M4 12h16" stroke="currentColor" strokeDasharray="2,2" />
												</Icon>
											)}
											{item.label}
										</span>
										{(isSelected || isHovered) && (
											<svg
												className={`h-4 w-4 ${isSelected ? 'text-blue-500' : 'text-slate-400'}`}
												fill="none"
												stroke="currentColor"
												viewBox="0 0 24 24"
												strokeWidth={2}
											>
												<path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
											</svg>
										)}
									</button>
								);
							})}
						</div>
					)}
				</div>
			);
		}

		if (tool.id === 'lines') {
			return (
				<div key={tool.id} className="relative">
					<button
						type="button"
						aria-label={tool.label}
						title={tool.label}
						className={[
							'h-10 w-10 grid place-items-center rounded-lg transition-colors',
							activeToolId === 'lines'
								? 'text-blue-600'
								: 'text-slate-900 hover:bg-slate-100 active:bg-slate-200',
						].join(' ')}
						onClick={() => {
							// Lines button: activate the currently selected line-type immediately,
							// and also allow opening the selector menu.
							setActiveToolId('lines');
							setActiveTool(selectedLinesType as any);
							setShowLinesMenu((v) => !v);
						}}
					>
						{selectedLinesType === 'horizontal-line' ? (
							<Icon>
								<path d="M2 12L22 12" />
								<circle cx="12" cy="12" r="2.5" fill="none" stroke="currentColor" strokeWidth={1.5} />
							</Icon>
						) : selectedLinesType === 'horizontal-ray' ? (
							<Icon>
								<path d="M4 12L22 12" />
								<circle cx="4" cy="12" r="2.5" fill="none" stroke="currentColor" strokeWidth={1.5} />
							</Icon>
						) : selectedLinesType === 'ray' ? (
							<Icon>
								<path d="M6.5 17.5L17.5 6.5" />
								<circle cx="4" cy="20" r="2.5" fill="none" stroke="currentColor" strokeWidth={1.5} />
								<circle cx="12" cy="12" r="2.5" fill="none" stroke="currentColor" strokeWidth={1.5} />
							</Icon>
						) : selectedLinesType === 'parallel-channel' ? (
							<Icon>
								{/* Simplified parallel channel icon for toolbar */}
								<path d="M4 18L18 6" stroke="currentColor" strokeWidth={1.5} />
								<path d="M4 6L18 18" stroke="currentColor" strokeWidth={1.5} />
								<circle cx="4" cy="18" r="2" fill="none" stroke="currentColor" strokeWidth={1.5} />
								<circle cx="18" cy="6" r="2" fill="none" stroke="currentColor" strokeWidth={1.5} />
								<circle cx="4" cy="6" r="2" fill="none" stroke="currentColor" strokeWidth={1.5} />
								<circle cx="18" cy="18" r="2" fill="none" stroke="currentColor" strokeWidth={1.5} />
							</Icon>
						) : (
							tool.icon
						)}
					</button>

					{showLinesMenu && (
						<div
							className="absolute left-full ml-2 top-0 bg-white border border-slate-200 rounded-lg shadow-lg py-1 min-w-[180px] z-50"
							onMouseLeave={() => setShowLinesMenu(false)}
						>
							{/* Section Heading */}
							<div className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide border-b border-slate-100">
								Lines
							</div>
							{linesMenuItems.map((item) => {
								const isSelected = selectedLinesType === item.id;
								const isHovered = hoveredLinesItemId === item.id;

								return (
									<button
										key={item.id}
										type="button"
										onClick={() => {
											setSelectedLinesType(item.id as any);
											setActiveTool(item.id as any);
											setActiveToolId('lines');
											setShowLinesMenu(false);
										}}
										onMouseEnter={() => setHoveredLinesItemId(item.id)}
										onMouseLeave={() => setHoveredLinesItemId(null)}
										className={[
											'w-full px-3 py-2 text-left text-sm flex items-center justify-between transition-colors',
											isSelected
												? 'bg-slate-700 text-white'
												: 'text-slate-900 hover:bg-transparent',
										].join(' ')}
									>
										<span className="flex items-center gap-2">
											{item.icon === 'ray' && (
												<Icon className={`h-4 w-4 ${isSelected ? 'text-white' : 'text-slate-900'}`} strokeWidth={1.5}>
													<path d="M6.5 17.5L17.5 6.5" />
													<circle cx="4" cy="20" r="2.2" fill="none" stroke="currentColor" strokeWidth={1.5} />
													<circle cx="20" cy="4" r="2.2" fill="none" stroke="currentColor" strokeWidth={1.5} />
												</Icon>
											)}
											{item.icon === 'ray-line' && (
												<Icon className={`h-4 w-4 ${isSelected ? 'text-white' : 'text-slate-900'}`} strokeWidth={1.5}>
													<path d="M6.5 17.5L17.5 6.5" />
													<circle cx="4" cy="20" r="2.2" fill="none" stroke="currentColor" strokeWidth={1.5} />
													<circle cx="12" cy="12" r="2.2" fill="none" stroke="currentColor" strokeWidth={1.5} />
												</Icon>
											)}
											{item.icon === 'hline' && (
												<Icon className={`h-4 w-4 ${isSelected ? 'text-white' : 'text-slate-900'}`} strokeWidth={1.2}>
													<path d="M3 12L21 12" />
													<circle cx="12" cy="12" r="1.6" fill="none" stroke="currentColor" strokeWidth={1.5} />
												</Icon>
											)}
											{item.icon === 'hray' && (
												<Icon className={`h-4 w-4 ${isSelected ? 'text-white' : 'text-slate-900'}`} strokeWidth={1.5}>
													<path d="M4 12L21 12" />
													<circle cx="4" cy="12" r="2.2" fill="none" stroke="currentColor" strokeWidth={1.5} />
												</Icon>
											)}
											{item.label}
										</span>
										{(isSelected || isHovered) && (
											<svg
												className={`h-4 w-4 ${isSelected ? 'text-blue-500' : 'text-slate-400'}`}
												fill="none"
												stroke="currentColor"
												viewBox="0 0 24 24"
												strokeWidth={2}
											>
												<path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
											</svg>
										)}
									</button>
								);
							})}
							
							{/* Channels Section */}
							{channelsMenuItems.length > 0 && (
								<>
									<div className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide border-t border-slate-100 mt-1">
										Channels
									</div>
									{channelsMenuItems.map((item) => {
										const isSelected = selectedLinesType === item.id;
										const isHovered = hoveredLinesItemId === item.id;

										return (
											<button
												key={item.id}
												type="button"
												onClick={() => {
													setSelectedLinesType(item.id as any);
													setActiveTool(item.id as any);
													setActiveToolId('lines');
													setShowLinesMenu(false);
												}}
												onMouseEnter={() => setHoveredLinesItemId(item.id)}
												onMouseLeave={() => setHoveredLinesItemId(null)}
												className={[
													'w-full px-3 py-2 text-left text-sm flex items-center justify-between transition-colors',
													isSelected
														? 'bg-slate-700 text-white'
														: 'text-slate-900 hover:bg-transparent',
												].join(' ')}
											>
												<span className="flex items-center gap-2">
													{item.icon === 'parallel-channel' && (
														<Icon className={`h-4 w-4 ${isSelected ? 'text-white' : 'text-slate-900'}`} strokeWidth={1.5}>
															{/* Two parallel lines with shaded area */}
															<path d="M4 18L18 6" stroke="currentColor" />
															<path d="M4 6L18 18" stroke="currentColor" />
															<path d="M4 12L18 12" stroke="currentColor" strokeDasharray="2,2" />
															{/* Corner bubbles */}
															<circle cx="4" cy="18" r="2" fill="none" stroke="currentColor" />
															<circle cx="18" cy="6" r="2" fill="none" stroke="currentColor" />
															<circle cx="4" cy="6" r="2" fill="none" stroke="currentColor" />
															<circle cx="18" cy="18" r="2" fill="none" stroke="currentColor" />
															{/* Middle squares */}
															<rect x="10" y="11" width="3" height="3" fill="none" stroke="currentColor" />
															<rect x="11" y="5" width="3" height="3" fill="none" stroke="currentColor" />
														</Icon>
													)}
													{item.label}
												</span>
												{(isSelected || isHovered) && (
													<svg
														className={`h-4 w-4 ${isSelected ? 'text-blue-500' : 'text-slate-400'}`}
														fill="none"
														stroke="currentColor"
														viewBox="0 0 24 24"
														strokeWidth={2}
													>
														<path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
													</svg>
												)}
											</button>
										);
									})}
								</>
							)}
						</div>
					)}
				</div>
			);
		}

		return (
			<button
				key={tool.id}
				type="button"
				aria-label={tool.label}
				title={tool.label}
				className={[
					'h-10 w-10 grid place-items-center rounded-lg transition-colors',
					tool.id === activeToolId
						? 'text-blue-600'
						: 'text-slate-900 hover:bg-slate-100 active:bg-slate-200',
				].join(' ')}
				onClick={() => {
					setActiveToolId(tool.id);
					// Activate drawing tool if it's a drawing tool
					if (tool.id === 'lines' || tool.id === 'trendline' || tool.id === 'horizontal-line' || tool.id === 'fib' || tool.id === 'brush') {
						setActiveTool(tool.id as any);
					} else {
						setActiveTool(null);
					}
				}}
			>
				{tool.icon}
			</button>
		);
	};

	return (
		<aside
			data-left-toolbar="true"
			className="relative w-[60px] bg-white border-r border-slate-200 h-full flex flex-col items-center py-2"
			aria-label="Chart tools"
		>
			<div className="flex flex-col items-center gap-0.5 px-2">{topTools.map(renderButton)}</div>
			<div className="w-full px-3 py-2">
				<div className="h-px bg-slate-100" />
			</div>
			<div className="flex flex-col items-center gap-0.5 px-2">{midTools.map(renderButton)}</div>
			<div className="mt-auto w-full flex flex-col items-center gap-2">
				<div className="w-full px-3">
					<div className="h-px bg-slate-100" />
				</div>
				<div className="flex flex-col items-center gap-0.5 px-2 pb-2">{bottomTools.map(renderButton)}</div>
			</div>

			{/* Collapse handle placeholder */}
			<button
				type="button"
				aria-label="Collapse toolbar"
				title="Collapse toolbar"
				className="absolute right-0 top-[78%] translate-x-1/2 h-10 w-6 rounded-r-full bg-white border border-slate-200 shadow-sm text-slate-600 hover:text-slate-900 hover:bg-slate-50 grid place-items-center"
				onClick={() => {
					// Placeholder: collapse behavior will be added later
				}}
			>
				<svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
					<path d="M14 6l-6 6 6 6" />
				</svg>
			</button>
		</aside>
	);
}

