import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useDrawing } from './DrawingContext';

type ToolButton = {
	id: string;
	label: string;
	icon: JSX.Element;
};

function Icon({
	children,
	className = 'h-7 w-7',
	strokeWidth = 1,
}: {
	children: ReactNode;
	className?: string;
	strokeWidth?: number;
}) {
	return (
		<svg
			aria-hidden="true"
			viewBox="0 0 24 24"
			preserveAspectRatio="xMidYMid meet"
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
			<Icon className="h-7 w-7" strokeWidth={0.95}>
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
				<path d="M5 19L19 5" />
				<circle cx="4" cy="20" r="1.6" fill="white" stroke="currentColor" strokeWidth={1} />
				<circle cx="20" cy="4" r="1.6" fill="white" stroke="currentColor" strokeWidth={1} />
			</Icon>
		),
	},
	{
		id: 'projection',
		label: 'Projection',
		icon: (
			<Icon>
				{/* RR box icon - rectangle with entry line; full 4-20 bounds */}
				<rect x="4" y="4" width="16" height="16" fill="none" stroke="currentColor" strokeWidth={1} />
				<path d="M4 12h16" stroke="currentColor" strokeWidth={1} strokeDasharray="2,2" />
			</Icon>
		),
	},
	{
		id: 'shapes',
		label: 'Shapes',
		icon: (
			<Icon>
				<path d="M4 20c3 0 4-1 6-3" />
				<path d="M10 17l8-8a3 3 0 10-4-4l-8 8" />
			</Icon>
		),
	},
	{
		id: 'horizontal-line',
		label: 'Horizontal line',
		icon: (
			<Icon>
				{/* match Lines icon “box feel”: same default size + stroke; extend line closer to edges */}
				<path d="M4 12L20 12" />
				<circle cx="12" cy="12" r="1.6" fill="white" stroke="currentColor" strokeWidth={1} />
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
				<circle cx="6" cy="7" r="1.0" />
				<circle cx="10" cy="11" r="1.0" />
				<circle cx="14" cy="7" r="1.0" />
				<circle cx="18" cy="11" r="1.0" />
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
	const toolbarRef = useRef<HTMLElement | null>(null);
	const [activeToolId, setActiveToolId] = useState<string>('crosshair');
	const [showCrosshairMenu, setShowCrosshairMenu] = useState(false);
	const [hoveredItemId, setHoveredItemId] = useState<string | null>(null);
	const [showLinesMenu, setShowLinesMenu] = useState(false);
	const [hoveredLinesItemId, setHoveredLinesItemId] = useState<string | null>(null);
	const [selectedLinesType, setSelectedLinesType] = useState<'lines' | 'ray' | 'horizontal-line' | 'horizontal-ray' | 'parallel-channel'>('lines');
	const [showProjectionMenu, setShowProjectionMenu] = useState(false);
	const [hoveredProjectionItemId, setHoveredProjectionItemId] = useState<string | null>(null);
	const [selectedProjectionType, setSelectedProjectionType] = useState<'long-position' | 'short-position' | 'price-range' | 'date-range'>('long-position');
	const [showShapesMenu, setShowShapesMenu] = useState(false);
	const [hoveredShapesItemId, setHoveredShapesItemId] = useState<string | null>(null);
	const [selectedShapesType, setSelectedShapesType] = useState<'brush' | 'rectangle' | 'path' | 'circle'>('brush');
	const { activeTool, setActiveTool, selectedDrawingId, drawings, removeDrawing, updateDrawing, setSelectedDrawingId, setSelectedHorizontalLineId, setSelectedHorizontalRayId, setSelectedLineId } =
		useDrawing();

	const closeAllMenus = () => {
		setShowCrosshairMenu(false);
		setShowProjectionMenu(false);
		setShowShapesMenu(false);
		setShowLinesMenu(false);
	};

	// Close menus when clicking outside the toolbar
	useEffect(() => {
		const handleClickOutside = (e: MouseEvent) => {
			if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
				closeAllMenus();
			}
		};
		document.addEventListener('mousedown', handleClickOutside);
		return () => document.removeEventListener('mousedown', handleClickOutside);
	}, []);

	// Keep toolbar highlight in sync with the actual active drawing tool.
	// This makes the UI “snap back” to Cross immediately after tools like Horizontal Line auto-exit.
	useEffect(() => {
		if (activeTool === null) {
			setActiveToolId('crosshair');
			setShowLinesMenu(false);
			setShowShapesMenu(false);
			return;
		}

		if (activeTool === 'lines' || activeTool === 'ray' || activeTool === 'horizontal-line' || activeTool === 'horizontal-ray' || activeTool === 'parallel-channel') {
			setActiveToolId('lines');
		}
		if (activeTool === 'long-position' || activeTool === 'short-position' || activeTool === 'price-range' || activeTool === 'date-range') {
			setActiveToolId('projection');
		}
		if (activeTool === 'brush' || activeTool === 'rectangle' || activeTool === 'path' || activeTool === 'circle') {
			setActiveToolId('shapes');
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
		{ id: 'short-position', label: 'Short Position', icon: 'short-position' },
	];
	const measurerMenuItems: Array<{ id: string; label: string; icon: string }> = [
		{ id: 'price-range', label: 'Price range', icon: 'price-range' },
		{ id: 'date-range', label: 'Date range', icon: 'date-range' },
	];

	const brushesMenuItems: Array<{ id: string; label: string; icon: string }> = [
		{ id: 'brush', label: 'Brush tool', icon: 'brush' },
	];
	const shapesSubMenuItems: Array<{ id: string; label: string; icon: string }> = [
		{ id: 'rectangle', label: 'Rectangle', icon: 'rectangle' },
		{ id: 'path', label: 'Path', icon: 'path' },
		{ id: 'circle', label: 'Circle', icon: 'circle' },
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
							setShowProjectionMenu(false);
							setShowShapesMenu(false);
							setShowLinesMenu(false);
							setActiveToolId('crosshair');
							setActiveTool(null);
							setShowCrosshairMenu((v) => !v);
						}}
					>
						{tool.icon}
					</button>

					{/* Dropdown menu */}
					{showCrosshairMenu && (
						<div
							className="absolute left-full ml-2 top-0 bg-white border border-slate-200 rounded-lg shadow-lg py-1 min-w-[225px] z-50"
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
												<Icon className={`h-7 w-7 ${isSelected ? 'text-white' : 'text-slate-900'}`} strokeWidth={1.05}>
													<path d="M12 3v6" />
													<path d="M12 15v6" />
													<path d="M3 12h6" />
													<path d="M15 12h6" />
												</Icon>
											)}
											{item.icon === 'arrow' && (
												<Icon className={`h-7 w-7 ${isSelected ? 'text-white' : 'text-slate-900'}`} strokeWidth={1.2}>
													<path d="M5 12h14" />
													<path d="M12 5l7 7-7 7" />
												</Icon>
											)}
											{item.icon === 'hline' && (
												<Icon className={`h-7 w-7 ${isSelected ? 'text-white' : 'text-slate-900'}`} strokeWidth={1.2}>
													<path d="M4 12h16" />
												</Icon>
											)}
											{item.icon === 'demonstration' && (
												<Icon className={`h-7 w-7 ${isSelected ? 'text-white' : 'text-slate-900'}`} strokeWidth={1.2}>
													<circle cx="12" cy="12" r="10" />
													<path d="M8 8l8 4-8 4V8z" />
													<path d="M8 8l4 4" />
												</Icon>
											)}
											{item.icon === 'eraser' && (
												<Icon className={`h-7 w-7 ${isSelected ? 'text-white' : 'text-slate-900'}`} strokeWidth={1.2}>
													<path d="M7 18l-4-4 8-8 4 4-8 8z" />
													<path d="M11 10l4 4" />
												</Icon>
											)}
											{item.label}
										</span>
										{(isSelected || isHovered) && (
											<svg
												className={`h-7 w-7 ${isSelected ? 'text-blue-500' : 'text-slate-400'}`}
												fill="none"
												stroke="currentColor"
												viewBox="0 0 24 24"
												strokeWidth={1.2}
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
							setShowCrosshairMenu(false);
							setShowShapesMenu(false);
							setShowLinesMenu(false);
							setActiveToolId('projection');
							setActiveTool(selectedProjectionType as any);
							setShowProjectionMenu((v) => !v);
						}}
					>
						{selectedProjectionType === 'long-position' ? (
							<Icon className="h-7 w-7" strokeWidth={1.15}>
								<path d="M4 4H20" stroke="currentColor" strokeLinecap="round" />
								<path d="M4 14H20" stroke="currentColor" strokeLinecap="round" />
								<path d="M4 20H20" stroke="currentColor" strokeLinecap="round" />
								<path d="M4 14L20 4" stroke="currentColor" strokeDasharray="1.2 2.4" strokeLinecap="round" />
								<circle cx="4" cy="14" r="1.5" fill="white" stroke="currentColor" strokeWidth={1.15} />
								<circle cx="20" cy="14" r="1.5" fill="white" stroke="currentColor" strokeWidth={1.15} />
								<circle cx="4" cy="4" r="1.5" fill="white" stroke="currentColor" strokeWidth={1.15} />
								<circle cx="4" cy="20" r="1.5" fill="white" stroke="currentColor" strokeWidth={1.15} />
							</Icon>
						) : selectedProjectionType === 'short-position' ? (
							<Icon className="h-7 w-7" strokeWidth={1.15}>
								<path d="M4 4H20" stroke="currentColor" strokeLinecap="round" />
								<path d="M4 10H20" stroke="currentColor" strokeLinecap="round" />
								<path d="M4 20H20" stroke="currentColor" strokeLinecap="round" />
								<path d="M4 10L20 20" stroke="currentColor" strokeDasharray="1.2 2.4" strokeLinecap="round" />
								<circle cx="4" cy="10" r="1.5" fill="white" stroke="currentColor" strokeWidth={1.15} />
								<circle cx="20" cy="10" r="1.5" fill="white" stroke="currentColor" strokeWidth={1.15} />
								<circle cx="4" cy="20" r="1.5" fill="white" stroke="currentColor" strokeWidth={1.15} />
								<circle cx="4" cy="4" r="1.5" fill="white" stroke="currentColor" strokeWidth={1.15} />
							</Icon>
						) : selectedProjectionType === 'price-range' ? (
							<Icon className="h-7 w-7" strokeWidth={1}>
								<path d="M4 4h16" stroke="currentColor" strokeLinecap="round" />
								<path d="M4 20h16" stroke="currentColor" strokeLinecap="round" />
								<path d="M12 4v16" stroke="currentColor" strokeLinecap="round" />
								<path d="M12 4l-1.2 1.5M12 4l1.2 1.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
								<circle cx="18" cy="4" r="1.6" fill="white" stroke="currentColor" strokeWidth={1} />
								<circle cx="6" cy="20" r="1.6" fill="white" stroke="currentColor" strokeWidth={1} />
							</Icon>
						) : selectedProjectionType === 'date-range' ? (
							<Icon className="h-7 w-7" strokeWidth={1}>
								<path d="M4 4v16" stroke="currentColor" strokeLinecap="round" />
								<path d="M20 4v16" stroke="currentColor" strokeLinecap="round" />
								<path d="M4 12h16" stroke="currentColor" strokeLinecap="round" />
								<path d="M20 12l-1.5 1.2M20 12l-1.5 -1.2" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
								<circle cx="4" cy="6" r="1.6" fill="white" stroke="currentColor" strokeWidth={1} />
								<circle cx="20" cy="18" r="1.6" fill="white" stroke="currentColor" strokeWidth={1} />
							</Icon>
						) : (
							tool.icon
						)}
					</button>

					{showProjectionMenu && (
						<div
							className="absolute left-full ml-2 top-0 bg-white border border-slate-200 rounded-lg shadow-lg py-1 min-w-[225px] z-50"
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
											setSelectedProjectionType(item.id as 'long-position' | 'short-position' | 'price-range' | 'date-range');
											setActiveTool(item.id as any);
											setShowProjectionMenu(false);
										}}
										onMouseEnter={() => setHoveredProjectionItemId(item.id)}
										onMouseLeave={() => setHoveredProjectionItemId(null)}
										className={[
											'w-full px-3 py-2 text-left text-sm flex items-center justify-between transition-colors',
											isSelected ? 'bg-slate-700 text-white' : 'text-slate-900 hover:bg-transparent',
										].join(' ')}
									>
										<span className="flex items-center gap-2">
											{item.icon === 'long-position' && (
												<Icon className={`h-7 w-7 ${isSelected ? 'text-white' : 'text-slate-900'}`} strokeWidth={1.15}>
													<path d="M4 4H20" stroke="currentColor" strokeLinecap="round" />
													<path d="M4 14H20" stroke="currentColor" strokeLinecap="round" />
													<path d="M4 20H20" stroke="currentColor" strokeLinecap="round" />
													<path d="M4 14L20 4" stroke="currentColor" strokeDasharray="1.2 2.4" strokeLinecap="round" />
													<circle cx="4" cy="14" r="1.5" fill="white" stroke="currentColor" strokeWidth={1.15} />
													<circle cx="20" cy="14" r="1.5" fill="white" stroke="currentColor" strokeWidth={1.15} />
													<circle cx="4" cy="4" r="1.5" fill="white" stroke="currentColor" strokeWidth={1.15} />
													<circle cx="4" cy="20" r="1.5" fill="white" stroke="currentColor" strokeWidth={1.15} />
												</Icon>
											)}
											{item.icon === 'short-position' && (
												<Icon className={`h-7 w-7 ${isSelected ? 'text-white' : 'text-slate-900'}`} strokeWidth={1.15}>
													<path d="M4 4H20" stroke="currentColor" strokeLinecap="round" />
													<path d="M4 10H20" stroke="currentColor" strokeLinecap="round" />
													<path d="M4 20H20" stroke="currentColor" strokeLinecap="round" />
													<path d="M4 10L20 20" stroke="currentColor" strokeDasharray="1.2 2.4" strokeLinecap="round" />
													<circle cx="4" cy="10" r="1.5" fill="white" stroke="currentColor" strokeWidth={1.15} />
													<circle cx="20" cy="10" r="1.5" fill="white" stroke="currentColor" strokeWidth={1.15} />
													<circle cx="4" cy="20" r="1.5" fill="white" stroke="currentColor" strokeWidth={1.15} />
													<circle cx="4" cy="4" r="1.5" fill="white" stroke="currentColor" strokeWidth={1.15} />
												</Icon>
											)}
											{item.label}
										</span>
										{(isSelected || isHovered) && (
											<svg className={`h-7 w-7 ${isSelected ? 'text-blue-500' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.2}>
												<path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
											</svg>
										)}
									</button>
								);
							})}
							<div className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider border-t border-slate-100 mt-1 pt-2">
								Measurer
							</div>
							{measurerMenuItems.map((item) => {
								const isSelected = selectedProjectionType === item.id;
								const isHovered = hoveredProjectionItemId === item.id;
								return (
									<button
										key={item.id}
										type="button"
										onClick={() => {
											setSelectedProjectionType(item.id as 'long-position' | 'short-position' | 'price-range' | 'date-range');
											setActiveTool(item.id as any);
											setShowProjectionMenu(false);
										}}
										onMouseEnter={() => setHoveredProjectionItemId(item.id)}
										onMouseLeave={() => setHoveredProjectionItemId(null)}
										className={[
											'w-full px-3 py-2 text-left text-sm flex items-center justify-between transition-colors',
											isSelected ? 'bg-slate-700 text-white' : 'text-slate-900 hover:bg-transparent',
										].join(' ')}
									>
										<span className="flex items-center gap-2">
											{item.icon === 'price-range' && (
												<Icon className={`h-7 w-7 ${isSelected ? 'text-white' : 'text-slate-900'}`} strokeWidth={1}>
													<path d="M4 4h16" stroke="currentColor" strokeLinecap="round" />
													<path d="M4 20h16" stroke="currentColor" strokeLinecap="round" />
													<path d="M12 4v16" stroke="currentColor" strokeLinecap="round" />
													<path d="M12 4l-1.2 1.5M12 4l1.2 1.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
													<circle cx="18" cy="4" r="1.6" fill="white" stroke="currentColor" strokeWidth={1} />
													<circle cx="6" cy="20" r="1.6" fill="white" stroke="currentColor" strokeWidth={1} />
												</Icon>
											)}
											{item.icon === 'date-range' && (
												<Icon className={`h-7 w-7 ${isSelected ? 'text-white' : 'text-slate-900'}`} strokeWidth={1}>
													<path d="M4 4v16" stroke="currentColor" strokeLinecap="round" />
													<path d="M20 4v16" stroke="currentColor" strokeLinecap="round" />
													<path d="M4 12h16" stroke="currentColor" strokeLinecap="round" />
													<path d="M20 12l-1.5 1.2M20 12l-1.5 -1.2" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
													<circle cx="4" cy="6" r="1.6" fill="white" stroke="currentColor" strokeWidth={1} />
													<circle cx="20" cy="18" r="1.6" fill="white" stroke="currentColor" strokeWidth={1} />
												</Icon>
											)}
											{item.label}
										</span>
										{(isSelected || isHovered) && (
											<svg className={`h-7 w-7 ${isSelected ? 'text-blue-500' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.2}>
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

		if (tool.id === 'shapes') {
			return (
				<div key={tool.id} className="relative">
					<button
						type="button"
						aria-label={tool.label}
						title={tool.label}
						className={[
							'h-10 w-10 grid place-items-center rounded-lg transition-colors',
							activeToolId === 'shapes'
								? 'text-blue-600'
								: 'text-slate-900 hover:bg-slate-100 active:bg-slate-200',
						].join(' ')}
						onClick={() => {
							setShowCrosshairMenu(false);
							setShowProjectionMenu(false);
							setShowLinesMenu(false);
							setActiveToolId('shapes');
							setActiveTool(selectedShapesType as any);
							setShowShapesMenu((v) => !v);
						}}
					>
						{selectedShapesType === 'brush' ? (
							<Icon className="h-7 w-7" strokeWidth={1.05}>
								<path d="M16.5 3.5a2.121 2.121 0 013 3L8 18l-4 1 1-4 11.5-11.5z" />
								<line x1="14.5" y1="5.5" x2="18.5" y2="9.5" />
							</Icon>
						) : selectedShapesType === 'rectangle' ? (
							<Icon className="h-7 w-7" strokeWidth={1}>
								<rect x="4" y="4" width="16" height="16" rx="1" fill="none" stroke="currentColor" />
								<circle cx="4" cy="4" r="1.6" fill="white" stroke="currentColor" />
								<circle cx="20" cy="4" r="1.6" fill="white" stroke="currentColor" />
								<circle cx="4" cy="20" r="1.6" fill="white" stroke="currentColor" />
								<circle cx="20" cy="20" r="1.6" fill="white" stroke="currentColor" />
							</Icon>
						) : selectedShapesType === 'path' ? (
							<Icon className="h-7 w-7" strokeWidth={1}>
								<path d="M4 12L20 12" />
								<circle cx="4" cy="12" r="1.6" fill="white" stroke="currentColor" />
								<path d="M18 10.8L20 12L18 13.2" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
							</Icon>
						) : selectedShapesType === 'circle' ? (
							<Icon className="h-7 w-7" strokeWidth={1}>
								<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" />
								<circle cx="12" cy="12" r="1.6" fill="white" stroke="currentColor" />
								<circle cx="20" cy="12" r="1.6" fill="white" stroke="currentColor" />
							</Icon>
						) : (
							tool.icon
						)}
					</button>

					{showShapesMenu && (
						<div
							className="absolute left-full ml-2 top-0 bg-white border border-slate-200 rounded-lg shadow-lg py-1 min-w-[225px] z-50"
						>
							<div className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-100">
								Shapes
							</div>
							<div className="px-3 py-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider pt-2">
								Brushes
							</div>
							{brushesMenuItems.map((item) => {
								const isSelected = selectedShapesType === item.id;
								const isHovered = hoveredShapesItemId === item.id;
								return (
									<button
										key={item.id}
										type="button"
										onClick={() => {
											setSelectedShapesType(item.id as 'brush' | 'rectangle' | 'path' | 'circle');
											setActiveTool(item.id as any);
											setShowShapesMenu(false);
										}}
										onMouseEnter={() => setHoveredShapesItemId(item.id)}
										onMouseLeave={() => setHoveredShapesItemId(null)}
										className={[
											'w-full px-3 py-2 text-left text-sm flex items-center justify-between transition-colors',
											isSelected ? 'bg-slate-700 text-white' : 'text-slate-900 hover:bg-transparent',
										].join(' ')}
									>
										<span className="flex items-center gap-2">
											{item.icon === 'brush' && (
												<Icon className={`h-7 w-7 ${isSelected ? 'text-white' : 'text-slate-900'}`} strokeWidth={1.05}>
													<path d="M16.5 3.5a2.121 2.121 0 013 3L8 18l-4 1 1-4 11.5-11.5z" />
													<line x1="14.5" y1="5.5" x2="18.5" y2="9.5" />
												</Icon>
											)}
											{item.label}
										</span>
										{(isSelected || isHovered) && (
											<svg className={`h-7 w-7 ${isSelected ? 'text-blue-500' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.2}>
												<path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
											</svg>
										)}
									</button>
								);
							})}
							<div className="px-3 py-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider pt-2">
								Shapes
							</div>
							{shapesSubMenuItems.map((item) => {
								const isSelected = selectedShapesType === item.id;
								const isHovered = hoveredShapesItemId === item.id;
								return (
									<button
										key={item.id}
										type="button"
										onClick={() => {
											setSelectedShapesType(item.id as 'brush' | 'rectangle' | 'path' | 'circle');
											setActiveTool(item.id as any);
											setShowShapesMenu(false);
										}}
										onMouseEnter={() => setHoveredShapesItemId(item.id)}
										onMouseLeave={() => setHoveredShapesItemId(null)}
										className={[
											'w-full px-3 py-2 text-left text-sm flex items-center justify-between transition-colors',
											isSelected ? 'bg-slate-700 text-white' : 'text-slate-900 hover:bg-transparent',
										].join(' ')}
									>
										<span className="flex items-center gap-2">
											{item.icon === 'rectangle' && (
												<Icon className={`h-7 w-7 ${isSelected ? 'text-white' : 'text-slate-900'}`} strokeWidth={1}>
													<rect x="4" y="4" width="16" height="16" rx="1" fill="none" stroke="currentColor" />
													<circle cx="4" cy="4" r="1.6" fill="white" stroke="currentColor" />
													<circle cx="20" cy="4" r="1.6" fill="white" stroke="currentColor" />
													<circle cx="4" cy="20" r="1.6" fill="white" stroke="currentColor" />
													<circle cx="20" cy="20" r="1.6" fill="white" stroke="currentColor" />
												</Icon>
											)}
											{item.icon === 'path' && (
												<Icon className={`h-7 w-7 ${isSelected ? 'text-white' : 'text-slate-900'}`} strokeWidth={1}>
													<path d="M4 12L20 12" />
													<circle cx="4" cy="12" r="1.6" fill="white" stroke="currentColor" />
													<path d="M18 10.8L20 12L18 13.2" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
												</Icon>
											)}
											{item.icon === 'circle' && (
												<Icon className={`h-7 w-7 ${isSelected ? 'text-white' : 'text-slate-900'}`} strokeWidth={1}>
													<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" />
													<circle cx="12" cy="12" r="1.6" fill="white" stroke="currentColor" />
													<circle cx="20" cy="12" r="1.6" fill="white" stroke="currentColor" />
												</Icon>
											)}
											{item.label}
										</span>
										{(isSelected || isHovered) && (
											<svg className={`h-7 w-7 ${isSelected ? 'text-blue-500' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.2}>
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
							setShowCrosshairMenu(false);
							setShowProjectionMenu(false);
							setShowShapesMenu(false);
							setActiveToolId('lines');
							setActiveTool(selectedLinesType as any);
							setShowLinesMenu((v) => !v);
						}}
					>
						{selectedLinesType === 'horizontal-line' ? (
							<Icon>
								<path d="M4 12L20 12" />
								<circle cx="12" cy="12" r="1.6" fill="white" stroke="currentColor" strokeWidth={1} />
							</Icon>
						) : selectedLinesType === 'horizontal-ray' ? (
							<Icon>
								<path d="M4 12L20 12" />
								<circle cx="4" cy="12" r="1.6" fill="white" stroke="currentColor" strokeWidth={1} />
							</Icon>
						) : selectedLinesType === 'ray' ? (
							<Icon>
								<path d="M5 19L19 5" />
								<circle cx="4" cy="20" r="1.6" fill="white" stroke="currentColor" strokeWidth={1} />
								<circle cx="12" cy="12" r="1.6" fill="white" stroke="currentColor" strokeWidth={1} />
							</Icon>
						) : selectedLinesType === 'parallel-channel' ? (
							<Icon>
								<path d="M4 18L20 6" stroke="currentColor" strokeWidth={1} />
								<path d="M6 17L18 7" stroke="currentColor" strokeWidth={1} />
								<circle cx="12" cy="12" r="1.6" fill="white" stroke="currentColor" strokeWidth={1} />
							</Icon>
						) : (
							tool.icon
						)}
					</button>

					{showLinesMenu && (
						<div
							className="absolute left-full ml-2 top-0 bg-white border border-slate-200 rounded-lg shadow-lg py-1 min-w-[225px] z-50"
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
												<Icon className={`h-7 w-7 ${isSelected ? 'text-white' : 'text-slate-900'}`} strokeWidth={1}>
													<path d="M5 19L19 5" />
													<circle cx="4" cy="20" r="1.6" fill="white" stroke="currentColor" strokeWidth={1} />
													<circle cx="20" cy="4" r="1.6" fill="white" stroke="currentColor" strokeWidth={1} />
												</Icon>
											)}
											{item.icon === 'ray-line' && (
												<Icon className={`h-7 w-7 ${isSelected ? 'text-white' : 'text-slate-900'}`} strokeWidth={1}>
													<path d="M5 19L19 5" />
													<circle cx="4" cy="20" r="1.6" fill="white" stroke="currentColor" strokeWidth={1} />
													<circle cx="12" cy="12" r="1.6" fill="white" stroke="currentColor" strokeWidth={1} />
												</Icon>
											)}
											{item.icon === 'hline' && (
												<Icon className={`h-7 w-7 ${isSelected ? 'text-white' : 'text-slate-900'}`} strokeWidth={1}>
													<path d="M4 12L20 12" />
													<circle cx="12" cy="12" r="1.6" fill="white" stroke="currentColor" strokeWidth={1} />
												</Icon>
											)}
											{item.icon === 'hray' && (
												<Icon className={`h-7 w-7 ${isSelected ? 'text-white' : 'text-slate-900'}`} strokeWidth={1}>
													<path d="M4 12L20 12" />
													<circle cx="4" cy="12" r="1.6" fill="white" stroke="currentColor" strokeWidth={1} />
												</Icon>
											)}
											{item.label}
										</span>
										{(isSelected || isHovered) && (
											<svg
												className={`h-7 w-7 ${isSelected ? 'text-blue-500' : 'text-slate-400'}`}
												fill="none"
												stroke="currentColor"
												viewBox="0 0 24 24"
												strokeWidth={1.2}
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
														<Icon className={`h-7 w-7 ${isSelected ? 'text-white' : 'text-slate-900'}`} strokeWidth={1}>
															<path d="M4 19L20 5" stroke="currentColor" />
															<path d="M5 19L19 5" stroke="currentColor" />
															<circle cx="12" cy="12" r="1.6" fill="white" stroke="currentColor" strokeWidth={1} />
														</Icon>
													)}
													{item.label}
												</span>
												{(isSelected || isHovered) && (
													<svg
														className={`h-7 w-7 ${isSelected ? 'text-blue-500' : 'text-slate-400'}`}
														fill="none"
														stroke="currentColor"
														viewBox="0 0 24 24"
														strokeWidth={1.2}
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
					if (tool.id === 'lines' || tool.id === 'horizontal-line' || tool.id === 'fib') {
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
			ref={toolbarRef}
			data-left-toolbar="true"
			className="relative w-[60px] bg-white border-r border-slate-200 h-full flex flex-col items-center py-2"
			aria-label="Chart tools"
		>
			<div className="flex flex-col items-center gap-1 px-1.5">{topTools.map(renderButton)}</div>
			<div className="w-full px-3 py-2">
				<div className="h-px bg-slate-100" />
			</div>
			<div className="flex flex-col items-center gap-1 px-1.5">{midTools.map(renderButton)}</div>
			<div className="mt-auto w-full flex flex-col items-center gap-2">
				<div className="w-full px-3">
					<div className="h-px bg-slate-100" />
				</div>
				<div className="flex flex-col items-center gap-1 px-1.5 pb-2">{bottomTools.map(renderButton)}</div>
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
				<svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7">
					<path d="M14 6l-6 6 6 6" />
				</svg>
			</button>
		</aside>
	);
}

