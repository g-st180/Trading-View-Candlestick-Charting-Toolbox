/**
 * =============================================================================
 * LEFT TOOLBAR — Drawing tool selection sidebar
 * =============================================================================
 *
 * Renders the vertical toolbar on the left side of the chart with tool icons
 * organized into groups: top tools (crosshair, lines, projection, shapes, etc.),
 * mid tools (ruler, zoom), and bottom tools (lock, visibility, delete).
 *
 * Each tool button can open a flyout dropdown menu with sub-tools.
 * The toolbar syncs with DrawingContext to reflect the currently active tool
 * and automatically returns to crosshair mode when a tool finishes.
 *
 * Tool categories and their sub-tools:
 *   - Crosshair: cross, arrow, eraser
 *   - Lines: trend line, info line, ray, horizontal line/ray, parallel channel
 *   - Projection: long position, short position, price/date/date-price range
 *   - Shapes: brush, arrows (4 types), rectangle, path, circle, curve
 *   - Fibonacci: fibonacci retracement, gann box
 *   - Annotation: Text in flyout (same T icon); Emoji separate with picker; Ruler; Zoom
 *   - Bottom: lock, eye (visibility), trash (delete selected)
 */
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import EmojiPicker, { Theme } from 'emoji-picker-react';
import type { EmojiClickData } from 'emoji-picker-react';
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

// ── Tool Button Definitions ──

const ICON_SW = 1.05;
const BUBBLE_SW = 0.95;
const BUBBLE_R = 1.6; // match trend-line / fib-style endpoint dots in 24×24 icons
const CYPHER_C_FONT = 5.5 * 1.15; // "C" under middle bubble (chart pattern icon)
const CHEVRON_SW = 1.05;

/** Three peaks, center highest — head & shoulders; shoulders up; corner bubbles below y=17 anchors. */
function HeadShouldersPatternIcon({
	className = 'h-7 w-7',
	strokeWidth = ICON_SW,
}: {
	className?: string;
	strokeWidth?: number;
}) {
	// Corner bubbles at y=20; inner anchors at y=17; top head y=5 → span 15 (same as Fib icon).
	const neckY = 17;
	return (
		<Icon className={className} strokeWidth={strokeWidth}>
			<polyline
				points={`3,20 3,${neckY} 6,9 8.5,16 12,5 15.5,16 18,9 21,${neckY} 21,20`}
				fill="none"
				strokeLinejoin="round"
				strokeLinecap="round"
			/>
			<circle cx="3" cy="20" r={BUBBLE_R} fill="white" stroke="currentColor" strokeWidth={BUBBLE_SW} />
			<circle cx="6" cy="9" r={BUBBLE_R} fill="white" stroke="currentColor" strokeWidth={BUBBLE_SW} />
			<circle cx="8.5" cy="16" r={BUBBLE_R} fill="white" stroke="currentColor" strokeWidth={BUBBLE_SW} />
			<circle cx="12" cy="5" r={BUBBLE_R} fill="white" stroke="currentColor" strokeWidth={BUBBLE_SW} />
			<circle cx="15.5" cy="16" r={BUBBLE_R} fill="white" stroke="currentColor" strokeWidth={BUBBLE_SW} />
			<circle cx="18" cy="9" r={BUBBLE_R} fill="white" stroke="currentColor" strokeWidth={BUBBLE_SW} />
			<circle cx="21" cy="20" r={BUBBLE_R} fill="white" stroke="currentColor" strokeWidth={BUBBLE_SW} />
		</Icon>
	);
}

/** ABCD measured move: slanted parallelogram (four corners A→B→C→D), distinct from harmonic zigzag. */
function AbcdPatternIcon({
	className = 'h-7 w-7',
	strokeWidth = ICON_SW,
}: {
	className?: string;
	strokeWidth?: number;
}) {
	return (
		<Icon className={className} strokeWidth={strokeWidth}>
			<polygon
				points="3,19 18.5,19 21,5.5 5.5,5.5"
				fill="none"
				strokeLinejoin="round"
				strokeLinecap="round"
			/>
			<path d="M3 19L21 5.5" />
			<circle cx="3" cy="19" r={BUBBLE_R} fill="white" stroke="currentColor" strokeWidth={BUBBLE_SW} />
			<circle cx="18.5" cy="19" r={BUBBLE_R} fill="white" stroke="currentColor" strokeWidth={BUBBLE_SW} />
			<circle cx="21" cy="5.5" r={BUBBLE_R} fill="white" stroke="currentColor" strokeWidth={BUBBLE_SW} />
			<circle cx="5.5" cy="5.5" r={BUBBLE_R} fill="white" stroke="currentColor" strokeWidth={BUBBLE_SW} />
		</Icon>
	);
}

/** Elliott impulse (1-2-3-4-5) icon with smoother, clearer wave shape. */
function ElliottImpulseIcon({
	className = 'h-7 w-7',
	strokeWidth = ICON_SW,
}: {
	className?: string;
	strokeWidth?: number;
}) {
	return (
		<Icon className={className} strokeWidth={strokeWidth}>
			<polyline
				points="2.8,17.2 8.2,8.7 15.6,17.2 21.2,8.7"
				fill="none"
				stroke="currentColor"
				strokeWidth="1.05"
				strokeLinejoin="round"
				strokeLinecap="round"
			/>
			<circle cx="2.8" cy="17.2" r={BUBBLE_R} fill="white" stroke="currentColor" strokeWidth={BUBBLE_SW} />
			<circle cx="8.2" cy="8.7" r={BUBBLE_R} fill="white" stroke="currentColor" strokeWidth={BUBBLE_SW} />
			<circle cx="15.6" cy="17.2" r={BUBBLE_R} fill="white" stroke="currentColor" strokeWidth={BUBBLE_SW} />
			<circle cx="21.2" cy="8.7" r={BUBBLE_R} fill="white" stroke="currentColor" strokeWidth={BUBBLE_SW} />
			<text x="8.2" y="4.2" textAnchor="middle" fill="currentColor" stroke="none" fontSize="6.4" fontWeight="700" fontFamily="system-ui, -apple-system, sans-serif">1</text>
			<text x="21.2" y="4.2" textAnchor="middle" fill="currentColor" stroke="none" fontSize="6.4" fontWeight="700" fontFamily="system-ui, -apple-system, sans-serif">5</text>
		</Icon>
	);
}

/** Elliott correction (A-B-C) icon: simple 3-leg corrective zigzag. */
function ElliottCorrectionIcon({
	className = 'h-7 w-7',
	strokeWidth = ICON_SW,
}: {
	className?: string;
	strokeWidth?: number;
}) {
	return (
		<Icon className={className} strokeWidth={strokeWidth}>
			<polyline
				points="2.8,17.2 8.2,8.7 15.6,17.2 21.2,8.7"
				fill="none"
				stroke="currentColor"
				strokeWidth="1.05"
				strokeLinejoin="round"
				strokeLinecap="round"
			/>
			<circle cx="2.8" cy="17.2" r={BUBBLE_R} fill="white" stroke="currentColor" strokeWidth={BUBBLE_SW} />
			<circle cx="8.2" cy="8.7" r={BUBBLE_R} fill="white" stroke="currentColor" strokeWidth={BUBBLE_SW} />
			<circle cx="15.6" cy="17.2" r={BUBBLE_R} fill="white" stroke="currentColor" strokeWidth={BUBBLE_SW} />
			<circle cx="21.2" cy="8.7" r={BUBBLE_R} fill="white" stroke="currentColor" strokeWidth={BUBBLE_SW} />
			<text x="8.2" y="4.2" textAnchor="middle" fill="currentColor" stroke="none" fontSize="6.2" fontWeight="700" fontFamily="system-ui, -apple-system, sans-serif">A</text>
			<text x="21.2" y="4.2" textAnchor="middle" fill="currentColor" stroke="none" fontSize="6.2" fontWeight="700" fontFamily="system-ui, -apple-system, sans-serif">C</text>
		</Icon>
	);
}

/** Elliott triangle icon: same geometry as impulse icon, with A and E labels on peaks. */
function ElliottTriangleIcon({
	className = 'h-7 w-7',
	strokeWidth = ICON_SW,
}: {
	className?: string;
	strokeWidth?: number;
}) {
	return (
		<Icon className={className} strokeWidth={strokeWidth}>
			<polyline
				points="2.8,17.2 8.2,8.7 15.6,17.2 21.2,8.7"
				fill="none"
				stroke="currentColor"
				strokeWidth="1.05"
				strokeLinejoin="round"
				strokeLinecap="round"
			/>
			<circle cx="2.8" cy="17.2" r={BUBBLE_R} fill="white" stroke="currentColor" strokeWidth={BUBBLE_SW} />
			<circle cx="8.2" cy="8.7" r={BUBBLE_R} fill="white" stroke="currentColor" strokeWidth={BUBBLE_SW} />
			<circle cx="15.6" cy="17.2" r={BUBBLE_R} fill="white" stroke="currentColor" strokeWidth={BUBBLE_SW} />
			<circle cx="21.2" cy="8.7" r={BUBBLE_R} fill="white" stroke="currentColor" strokeWidth={BUBBLE_SW} />
			<text x="8.2" y="4.2" textAnchor="middle" fill="currentColor" stroke="none" fontSize="6.4" fontWeight="700" fontFamily="system-ui, -apple-system, sans-serif">A</text>
			<text x="21.2" y="4.2" textAnchor="middle" fill="currentColor" stroke="none" fontSize="6.4" fontWeight="700" fontFamily="system-ui, -apple-system, sans-serif">E</text>
		</Icon>
	);
}

/** Elliott double combo icon: correction-style wave with W and Y peak labels. */
function ElliottDoubleComboIcon({
	className = 'h-7 w-7',
	strokeWidth = ICON_SW,
}: {
	className?: string;
	strokeWidth?: number;
}) {
	return (
		<Icon className={className} strokeWidth={strokeWidth}>
			<polyline
				points="2.8,17.2 8.2,8.7 15.6,17.2 21.2,8.7"
				fill="none"
				stroke="currentColor"
				strokeWidth="1.05"
				strokeLinejoin="round"
				strokeLinecap="round"
			/>
			<circle cx="2.8" cy="17.2" r={BUBBLE_R} fill="white" stroke="currentColor" strokeWidth={BUBBLE_SW} />
			<circle cx="8.2" cy="8.7" r={BUBBLE_R} fill="white" stroke="currentColor" strokeWidth={BUBBLE_SW} />
			<circle cx="15.6" cy="17.2" r={BUBBLE_R} fill="white" stroke="currentColor" strokeWidth={BUBBLE_SW} />
			<circle cx="21.2" cy="8.7" r={BUBBLE_R} fill="white" stroke="currentColor" strokeWidth={BUBBLE_SW} />
			<text x="8.2" y="4.2" textAnchor="middle" fill="currentColor" stroke="none" fontSize="6.4" fontWeight="700" fontFamily="system-ui, -apple-system, sans-serif">W</text>
			<text x="21.2" y="4.2" textAnchor="middle" fill="currentColor" stroke="none" fontSize="6.4" fontWeight="700" fontFamily="system-ui, -apple-system, sans-serif">Y</text>
		</Icon>
	);
}

/** Elliott triple combo icon: correction-style wave with W and Z peak labels. */
function ElliottTripleComboIcon({
	className = 'h-7 w-7',
	strokeWidth = ICON_SW,
}: {
	className?: string;
	strokeWidth?: number;
}) {
	return (
		<Icon className={className} strokeWidth={strokeWidth}>
			<polyline
				points="2.8,17.2 8.2,8.7 15.6,17.2 21.2,8.7"
				fill="none"
				stroke="currentColor"
				strokeWidth="1.05"
				strokeLinejoin="round"
				strokeLinecap="round"
			/>
			<circle cx="2.8" cy="17.2" r={BUBBLE_R} fill="white" stroke="currentColor" strokeWidth={BUBBLE_SW} />
			<circle cx="8.2" cy="8.7" r={BUBBLE_R} fill="white" stroke="currentColor" strokeWidth={BUBBLE_SW} />
			<circle cx="15.6" cy="17.2" r={BUBBLE_R} fill="white" stroke="currentColor" strokeWidth={BUBBLE_SW} />
			<circle cx="21.2" cy="8.7" r={BUBBLE_R} fill="white" stroke="currentColor" strokeWidth={BUBBLE_SW} />
			<text x="8.2" y="4.2" textAnchor="middle" fill="currentColor" stroke="none" fontSize="6.4" fontWeight="700" fontFamily="system-ui, -apple-system, sans-serif">W</text>
			<text x="21.2" y="4.2" textAnchor="middle" fill="currentColor" stroke="none" fontSize="6.4" fontWeight="700" fontFamily="system-ui, -apple-system, sans-serif">Z</text>
		</Icon>
	);
}

const topTools: ToolButton[] = [
	{
		id: 'crosshair',
		label: 'Crosshair',
		icon: (
			<Icon strokeWidth={ICON_SW}>
				<path d="M12 3v7" />
				<path d="M12 14v7" />
				<path d="M3 12h7" />
				<path d="M14 12h7" />
			</Icon>
		),
	},
	{
		id: 'lines',
		label: 'Trend Line Tools',
		icon: (
			<Icon strokeWidth={ICON_SW}>
				{/* Same diagonal extent + bubble placement as trend line / info line in flyout */}
				<path d="M4 20L20 4" />
				<circle cx="4" cy="20" r={BUBBLE_R} fill="white" stroke="currentColor" strokeWidth={BUBBLE_SW} />
				<circle cx="20" cy="4" r={BUBBLE_R} fill="white" stroke="currentColor" strokeWidth={BUBBLE_SW} />
			</Icon>
		),
	},
	{
		id: 'fibonacci',
		label: 'Fib Retracement',
		icon: (
			<Icon strokeWidth={ICON_SW}>
				<path d="M4 5h16" />
				<path d="M4 10h16" />
				<path d="M4 15h16" />
				<path d="M4 20h16" />
				<path d="M4 20L20 5" strokeDasharray="3 2" strokeWidth={0.75} />
				<circle cx="4" cy="20" r={BUBBLE_R} fill="white" stroke="currentColor" strokeWidth={BUBBLE_SW} />
				<circle cx="20" cy="5" r={BUBBLE_R} fill="white" stroke="currentColor" strokeWidth={BUBBLE_SW} />
			</Icon>
		),
	},
	{
		id: 'shapes',
		label: 'Shapes & Brushes',
		icon: (
			<Icon strokeWidth={ICON_SW}>
				<path d="M17 3a2.83 2.83 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
			</Icon>
		),
	},
	{
		id: 'patterns',
		label: 'Patterns',
		icon: (
			<Icon strokeWidth={ICON_SW}>
				{/* Bottom corners at y=20: vertical gap 5 from middle (y=15), same as Fibonacci line spacing */}
				<path d="M3 20L11 15M21 20L11 15" fill="none" />
				<polyline points="3,20 7,8 11,15 15,5 21,20" fill="none" strokeLinejoin="round" strokeLinecap="round" />
				<circle cx="3" cy="20" r={BUBBLE_R} fill="white" stroke="currentColor" strokeWidth={BUBBLE_SW} />
				<circle cx="7" cy="8" r={BUBBLE_R} fill="white" stroke="currentColor" strokeWidth={BUBBLE_SW} />
				<circle cx="11" cy="15" r={BUBBLE_R} fill="white" stroke="currentColor" strokeWidth={BUBBLE_SW} />
				<circle cx="15" cy="5" r={BUBBLE_R} fill="white" stroke="currentColor" strokeWidth={BUBBLE_SW} />
				<circle cx="21" cy="20" r={BUBBLE_R} fill="white" stroke="currentColor" strokeWidth={BUBBLE_SW} />
			</Icon>
		),
	},
	{
		id: 'projection',
		label: 'Forecasting',
		icon: (
			<Icon strokeWidth={ICON_SW}>
				<rect x="3" y="5" width="18" height="14" rx="1" fill="none" />
				<path d="M3 12h18" strokeDasharray="2 2" strokeWidth={0.85} />
				<path d="M3 8.5h18" strokeWidth={0.45} opacity={0.4} />
				<path d="M3 15.5h18" strokeWidth={0.45} opacity={0.4} />
			</Icon>
		),
	},
	{
		id: 'annotation',
		label: 'Text & Notes',
		icon: (
			<Icon strokeWidth={ICON_SW}>
				<path d="M4 7V4h16v3" />
				<path d="M12 4v16" />
				<path d="M8 20h8" />
			</Icon>
		),
	},
	{
		id: 'emoji',
		label: 'Emoji',
		icon: (
			<Icon strokeWidth={ICON_SW}>
				<circle cx="12" cy="12" r="9" />
				<path d="M9 9h.01" strokeWidth={1.9} strokeLinecap="round" />
				<path d="M15 9h.01" strokeWidth={1.9} strokeLinecap="round" />
				<path d="M8 14s1.5 2 4 2 4-2 4-2" />
			</Icon>
		),
	},
];

const midTools: ToolButton[] = [
	{
		id: 'ruler',
		label: 'Measure',
		icon: (
			<Icon strokeWidth={ICON_SW}>
				<g transform="rotate(-45, 12, 12)">
					<rect x="2" y="10" width="20" height="4" rx="0.5" fill="none" />
					<line x1="5" y1="10" x2="5" y2="12.5" />
					<line x1="8" y1="10" x2="8" y2="12" />
					<line x1="11" y1="10" x2="11" y2="12.5" />
					<line x1="14" y1="10" x2="14" y2="12" />
					<line x1="17" y1="10" x2="17" y2="12.5" />
				</g>
			</Icon>
		),
	},
	{
		id: 'zoom',
		label: 'Zoom In',
		icon: (
			<Icon strokeWidth={ICON_SW}>
				<circle cx="11" cy="11" r="7" />
				<path d="M21 21l-4.35-4.35" />
				<path d="M11 8v6" />
				<path d="M8 11h6" />
			</Icon>
		),
	},
];

const bottomTools: ToolButton[] = [
	{
		id: 'lock',
		label: 'Lock',
		icon: (
			<Icon strokeWidth={ICON_SW}>
				<rect x="6" y="11" width="12" height="9" rx="2" />
				<path d="M8 11V9a4 4 0 018 0v2" />
			</Icon>
		),
	},
	{
		id: 'eye',
		label: 'Visibility',
		icon: (
			<Icon strokeWidth={ICON_SW}>
				<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
				<circle cx="12" cy="12" r="2.5" />
			</Icon>
		),
	},
	{
		id: 'trash',
		label: 'Delete',
		icon: (
			<Icon strokeWidth={ICON_SW}>
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

// ── Component ──

export default function LeftToolbar({ selectedCrosshairType, onCrosshairTypeChange }: LeftToolbarProps) {
	const toolbarRef = useRef<HTMLElement | null>(null);
	const [activeToolId, setActiveToolId] = useState<string>('crosshair');
	const [showCrosshairMenu, setShowCrosshairMenu] = useState(false);
	const [hoveredItemId, setHoveredItemId] = useState<string | null>(null);
	const [showLinesMenu, setShowLinesMenu] = useState(false);
	const [hoveredLinesItemId, setHoveredLinesItemId] = useState<string | null>(null);
	const [selectedLinesType, setSelectedLinesType] = useState<'lines' | 'ray' | 'info-line' | 'horizontal-line' | 'horizontal-ray' | 'parallel-channel'>('lines');
	const [showProjectionMenu, setShowProjectionMenu] = useState(false);
	const [hoveredProjectionItemId, setHoveredProjectionItemId] = useState<string | null>(null);
	const [selectedProjectionType, setSelectedProjectionType] = useState<'long-position' | 'short-position' | 'price-range' | 'date-range' | 'date-price-range'>('long-position');
	const [showShapesMenu, setShowShapesMenu] = useState(false);
	const [hoveredShapesItemId, setHoveredShapesItemId] = useState<string | null>(null);
	const [selectedShapesType, setSelectedShapesType] = useState<'brush' | 'arrow' | 'arrow-marker' | 'arrow-markup' | 'arrow-markdown' | 'rectangle' | 'path' | 'circle' | 'curve'>('brush');
	const [showPatternsMenu, setShowPatternsMenu] = useState(false);
	const [hoveredPatternsItemId, setHoveredPatternsItemId] = useState<string | null>(null);
	const [selectedPatternsType, setSelectedPatternsType] = useState<'xabcd' | 'cypher' | 'head-and-shoulders' | 'abcd' | 'elliott-impulse' | 'elliott-correction' | 'elliott-triangle' | 'elliott-double-combo' | 'elliott-triple-combo'>('xabcd');
	const [showFibonacciMenu, setShowFibonacciMenu] = useState(false);
	const [hoveredFibonacciItemId, setHoveredFibonacciItemId] = useState<string | null>(null);
	const [selectedFibonacciType, setSelectedFibonacciType] = useState<'fibonacci-retracement' | 'gann-box'>('fibonacci-retracement');
	const [showAnnotationMenu, setShowAnnotationMenu] = useState(false);
	const [hoveredAnnotationItemId, setHoveredAnnotationItemId] = useState<string | null>(null);
	const [selectedAnnotationType, setSelectedAnnotationType] = useState<'text' | 'note' | 'price-note' | 'callout' | 'comment' | 'price-label' | 'signpost' | 'flagmark' | 'pin'>('text');
	const { activeTool, setActiveTool, selectedDrawingId, drawings, removeDrawing, updateDrawing, setSelectedDrawingId, setSelectedHorizontalLineId, setSelectedHorizontalRayId, setSelectedLineId, selectedEmoji, setSelectedEmoji } =
		useDrawing();

	const [showEmojiPicker, setShowEmojiPicker] = useState(false);

	// ── Menu State Management ──

	const closeAllMenus = () => {
		setShowCrosshairMenu(false);
		setShowProjectionMenu(false);
		setShowShapesMenu(false);
		setShowLinesMenu(false);
		setShowPatternsMenu(false);
		setShowFibonacciMenu(false);
		setShowAnnotationMenu(false);
		setShowEmojiPicker(false);
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
			setShowPatternsMenu(false);
			setShowAnnotationMenu(false);
			return;
		}

		if (activeTool === 'lines' || activeTool === 'ray' || activeTool === 'horizontal-line' || activeTool === 'horizontal-ray' || activeTool === 'parallel-channel') {
			setActiveToolId('lines');
		}
		if (activeTool === 'long-position' || activeTool === 'short-position' || activeTool === 'price-range' || activeTool === 'date-range') {
			setActiveToolId('projection');
		}
		if (activeTool === 'date-price-range') {
			setActiveToolId('ruler');
		}
		if (activeTool === 'brush' || activeTool === 'arrow' || activeTool === 'arrow-marker' || activeTool === 'rectangle' || activeTool === 'path' || activeTool === 'circle') {
			setActiveToolId('shapes');
			if (activeTool === 'arrow-marker' || activeTool === 'arrow') setSelectedShapesType(activeTool);
		}
		if (activeTool === 'xabcd' || activeTool === 'cypher' || activeTool === 'head-and-shoulders' || activeTool === 'abcd' || activeTool === 'elliott-impulse' || activeTool === 'elliott-correction' || activeTool === 'elliott-triangle' || activeTool === 'elliott-double-combo' || activeTool === 'elliott-triple-combo') {
			setActiveToolId('patterns');
			setSelectedPatternsType(activeTool as any);
		}
		if (activeTool === 'fibonacci-retracement' || activeTool === 'gann-box') {
			setActiveToolId('fibonacci');
			setSelectedFibonacciType(activeTool === 'gann-box' ? 'gann-box' : 'fibonacci-retracement');
		}
		if (activeTool === 'text' || activeTool === 'note' || activeTool === 'price-note' || activeTool === 'callout' || activeTool === 'comment' || activeTool === 'price-label' || activeTool === 'signpost' || activeTool === 'flagmark' || activeTool === 'pin') {
			setActiveToolId('annotation');
			setSelectedAnnotationType(activeTool as any);
		}
		if (activeTool === 'emoji') {
			setActiveToolId('emoji');
		}
	}, [activeTool]);

	// ── Menu Item Definitions ──

	const crosshairMenuItems = [
		{ id: 'cross', label: 'Cross', icon: 'cross' },
		{ id: 'arrow', label: 'Arrow', icon: 'arrow' },
		{ id: 'eraser', label: 'Eraser', icon: 'eraser' },
	];

	const linesMenuItems = [
		{ id: 'lines', label: 'Trend line', icon: 'ray' },
		{ id: 'info-line', label: 'Info line', icon: 'info-line' },
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
		{ id: 'date-price-range', label: 'Date and price range', icon: 'date-price-range' },
	];

	const brushesMenuItems: Array<{ id: string; label: string; icon: string }> = [
		{ id: 'brush', label: 'Brush tool', icon: 'brush' },
	];
	const arrowsMenuItems: Array<{ id: string; label: string; icon: string }> = [
		{ id: 'arrow', label: 'Arrow', icon: 'arrow' },
		{ id: 'arrow-marker', label: 'Arrow marker', icon: 'arrow-marker' },
		{ id: 'arrow-markup', label: 'Arrow Mark Up', icon: 'arrow-markup' },
		{ id: 'arrow-markdown', label: 'Arrow Mark Down', icon: 'arrow-markdown' },
	];
	const shapesSubMenuItems: Array<{ id: string; label: string; icon: string }> = [
		{ id: 'rectangle', label: 'Rectangle', icon: 'rectangle' },
		{ id: 'path', label: 'Path', icon: 'path' },
		{ id: 'circle', label: 'Circle', icon: 'circle' },
		{ id: 'curve', label: 'Curve', icon: 'curve' },
	];

	const chartPatternsMenuItems: Array<{ id: string; label: string }> = [
		{ id: 'xabcd', label: 'XABCD Pattern' },
		{ id: 'cypher', label: 'Cypher Pattern' },
		{ id: 'head-and-shoulders', label: 'Head and Shoulders' },
		{ id: 'abcd', label: 'ABCD Pattern' },
	];
	const elliottWavesMenuItems: Array<{ id: string; label: string }> = [
		{ id: 'elliott-impulse', label: 'Elliott Impulse Wave (1·2·3·4·5)' },
		{ id: 'elliott-correction', label: 'Elliott Correction Wave (A·B·C)' },
		{ id: 'elliott-triangle', label: 'Elliott Triangle Wave (A·B·C·D·E)' },
		{ id: 'elliott-double-combo', label: 'Elliott Double Combo Wave (W·X·Y)' },
		{ id: 'elliott-triple-combo', label: 'Elliott Triple Combo Wave (W·X·Y·X\'·Z)' },
	];

	const fibonacciMenuItems: Array<{ id: 'fibonacci-retracement' | 'gann-box'; label: string; icon: string }> = [
		{ id: 'fibonacci-retracement', label: 'Fibonacci Retracement', icon: 'fibonacci-retracement' },
		{ id: 'gann-box', label: 'Gann box', icon: 'gann-box' },
	];

	const annotationMenuItems: Array<{ id: string; label: string }> = [
		{ id: 'text', label: 'Text' },
		{ id: 'note', label: 'Note' },
		{ id: 'price-note', label: 'Price Note' },
		{ id: 'callout', label: 'Callout' },
		{ id: 'comment', label: 'Comment' },
		{ id: 'price-label', label: 'Price Label' },
		{ id: 'signpost', label: 'Signpost' },
		{ id: 'flagmark', label: 'Flag Mark' },
		{ id: 'pin', label: 'Pin' },
	];

	// ── Button Renderer ──

	const renderButton = (tool: ToolButton) => {
		// Bottom action buttons: lock, visibility toggle, and delete for the selected drawing
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

		// Crosshair button with flyout for cross, arrow, eraser
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
							setShowPatternsMenu(false);
							setShowFibonacciMenu(false);
							setShowAnnotationMenu(false);
							setShowEmojiPicker(false);
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
							className="absolute left-full ml-2 top-0 bg-white border border-slate-200 rounded-lg shadow-lg py-1 min-w-[280px] z-50"
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
										<span className="flex items-center gap-2 whitespace-nowrap">
											{item.icon === 'cross' && (
												<Icon className={`h-7 w-7 ${isSelected ? 'text-white' : 'text-slate-900'}`} strokeWidth={ICON_SW}>
													<path d="M12 3v7" />
													<path d="M12 14v7" />
													<path d="M3 12h7" />
													<path d="M14 12h7" />
												</Icon>
											)}
											{item.icon === 'arrow' && (
												<Icon className={`h-7 w-7 ${isSelected ? 'text-white' : 'text-slate-900'}`} strokeWidth={ICON_SW}>
													<path d="M5 12h14" />
													<path d="M12 5l7 7-7 7" />
												</Icon>
											)}
											{item.icon === 'hline' && (
												<Icon className={`h-7 w-7 ${isSelected ? 'text-white' : 'text-slate-900'}`} strokeWidth={ICON_SW}>
													<path d="M4 12h16" />
												</Icon>
											)}
											{item.icon === 'eraser' && (
												<Icon className={`h-7 w-7 ${isSelected ? 'text-white' : 'text-slate-900'}`} strokeWidth={ICON_SW}>
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
												strokeWidth={CHEVRON_SW}
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

		// Projection button with flyout for long/short position and measurer tools
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
							setShowPatternsMenu(false);
							setShowFibonacciMenu(false);
							setShowAnnotationMenu(false);
							setShowEmojiPicker(false);
							setActiveToolId('projection');
							setActiveTool(selectedProjectionType as any);
							setShowProjectionMenu((v) => !v);
						}}
					>
						{selectedProjectionType === 'long-position' ? (
							<Icon className="h-7 w-7" strokeWidth={ICON_SW}>
								<path d="M4 4H20" stroke="currentColor" strokeLinecap="round" />
								<path d="M4 14H20" stroke="currentColor" strokeLinecap="round" />
								<path d="M4 20H20" stroke="currentColor" strokeLinecap="round" />
								<path d="M4 14L20 4" stroke="currentColor" strokeDasharray="1.2 2.4" strokeLinecap="round" />
								<circle cx="4" cy="14" r={BUBBLE_R} fill="white" stroke="currentColor" strokeWidth={BUBBLE_SW} />
								<circle cx="20" cy="14" r={BUBBLE_R} fill="white" stroke="currentColor" strokeWidth={BUBBLE_SW} />
								<circle cx="4" cy="4" r={BUBBLE_R} fill="white" stroke="currentColor" strokeWidth={BUBBLE_SW} />
								<circle cx="4" cy="20" r={BUBBLE_R} fill="white" stroke="currentColor" strokeWidth={BUBBLE_SW} />
							</Icon>
						) : selectedProjectionType === 'short-position' ? (
							<Icon className="h-7 w-7" strokeWidth={ICON_SW}>
								<path d="M4 4H20" stroke="currentColor" strokeLinecap="round" />
								<path d="M4 10H20" stroke="currentColor" strokeLinecap="round" />
								<path d="M4 20H20" stroke="currentColor" strokeLinecap="round" />
								<path d="M4 10L20 20" stroke="currentColor" strokeDasharray="1.2 2.4" strokeLinecap="round" />
								<circle cx="4" cy="10" r={BUBBLE_R} fill="white" stroke="currentColor" strokeWidth={BUBBLE_SW} />
								<circle cx="20" cy="10" r={BUBBLE_R} fill="white" stroke="currentColor" strokeWidth={BUBBLE_SW} />
								<circle cx="4" cy="20" r={BUBBLE_R} fill="white" stroke="currentColor" strokeWidth={BUBBLE_SW} />
								<circle cx="4" cy="4" r={BUBBLE_R} fill="white" stroke="currentColor" strokeWidth={BUBBLE_SW} />
							</Icon>
						) : selectedProjectionType === 'price-range' ? (
							<Icon className="h-7 w-7" strokeWidth={ICON_SW}>
								<path d="M4 4h16" stroke="currentColor" strokeLinecap="round" />
								<path d="M4 20h16" stroke="currentColor" strokeLinecap="round" />
								<path d="M12 5.5v11" stroke="currentColor" strokeLinecap="round" />
								<path d="M12 5.5l-1.2 1.5M12 5.5l1.2 1.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
								<circle cx="18" cy="4" r="1.6" fill="white" stroke="currentColor" strokeWidth={BUBBLE_SW} />
								<circle cx="6" cy="20" r="1.6" fill="white" stroke="currentColor" strokeWidth={BUBBLE_SW} />
							</Icon>
						) : selectedProjectionType === 'date-range' ? (
							<Icon className="h-7 w-7" strokeWidth={ICON_SW}>
								<path d="M4 4v16" stroke="currentColor" strokeLinecap="round" />
								<path d="M20 4v16" stroke="currentColor" strokeLinecap="round" />
								<path d="M5.5 12h11" stroke="currentColor" strokeLinecap="round" />
								<path d="M18.5 12l-1.5 1.2M18.5 12l-1.5 -1.2" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
								<circle cx="4" cy="6" r="1.6" fill="white" stroke="currentColor" strokeWidth={BUBBLE_SW} />
								<circle cx="20" cy="18" r="1.6" fill="white" stroke="currentColor" strokeWidth={BUBBLE_SW} />
							</Icon>
						) : selectedProjectionType === 'date-price-range' ? (
							<Icon className="h-7 w-7" strokeWidth={ICON_SW}>
								<path d="M4 4h16" stroke="currentColor" strokeLinecap="round" />
								<path d="M4 20h16" stroke="currentColor" strokeLinecap="round" />
								<path d="M4 4v16" stroke="currentColor" strokeLinecap="round" />
								<path d="M20 4v16" stroke="currentColor" strokeLinecap="round" />
								<path d="M12 5.5v11" stroke="currentColor" strokeLinecap="round" />
								<path d="M12 5.5l-1.2 1.5M12 5.5l1.2 1.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
								<path d="M5.5 12h11" stroke="currentColor" strokeLinecap="round" />
								<path d="M18.5 12l-1.5 1.2M18.5 12l-1.5 -1.2" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
								<circle cx="3" cy="3" r="1.6" fill="white" stroke="currentColor" strokeWidth={BUBBLE_SW} />
								<circle cx="21" cy="21" r="1.6" fill="white" stroke="currentColor" strokeWidth={BUBBLE_SW} />
							</Icon>
						) : (
							tool.icon
						)}
					</button>

					{showProjectionMenu && (
						<div
							className="absolute left-full ml-2 top-0 bg-white border border-slate-200 rounded-lg shadow-lg py-1 min-w-[280px] z-50"
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
											setSelectedProjectionType(item.id as 'long-position' | 'short-position' | 'price-range' | 'date-range' | 'date-price-range');
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
										<span className="flex items-center gap-2 whitespace-nowrap">
											{item.icon === 'long-position' && (
												<Icon className={`h-7 w-7 ${isSelected ? 'text-white' : 'text-slate-900'}`} strokeWidth={ICON_SW}>
													<path d="M4 4H20" stroke="currentColor" strokeLinecap="round" />
													<path d="M4 14H20" stroke="currentColor" strokeLinecap="round" />
													<path d="M4 20H20" stroke="currentColor" strokeLinecap="round" />
													<path d="M4 14L20 4" stroke="currentColor" strokeDasharray="1.2 2.4" strokeLinecap="round" />
													<circle cx="4" cy="14" r={BUBBLE_R} fill="white" stroke="currentColor" strokeWidth={BUBBLE_SW} />
													<circle cx="20" cy="14" r={BUBBLE_R} fill="white" stroke="currentColor" strokeWidth={BUBBLE_SW} />
													<circle cx="4" cy="4" r={BUBBLE_R} fill="white" stroke="currentColor" strokeWidth={BUBBLE_SW} />
													<circle cx="4" cy="20" r={BUBBLE_R} fill="white" stroke="currentColor" strokeWidth={BUBBLE_SW} />
												</Icon>
											)}
											{item.icon === 'short-position' && (
												<Icon className={`h-7 w-7 ${isSelected ? 'text-white' : 'text-slate-900'}`} strokeWidth={ICON_SW}>
													<path d="M4 4H20" stroke="currentColor" strokeLinecap="round" />
													<path d="M4 10H20" stroke="currentColor" strokeLinecap="round" />
													<path d="M4 20H20" stroke="currentColor" strokeLinecap="round" />
													<path d="M4 10L20 20" stroke="currentColor" strokeDasharray="1.2 2.4" strokeLinecap="round" />
													<circle cx="4" cy="10" r={BUBBLE_R} fill="white" stroke="currentColor" strokeWidth={BUBBLE_SW} />
													<circle cx="20" cy="10" r={BUBBLE_R} fill="white" stroke="currentColor" strokeWidth={BUBBLE_SW} />
													<circle cx="4" cy="20" r={BUBBLE_R} fill="white" stroke="currentColor" strokeWidth={BUBBLE_SW} />
													<circle cx="4" cy="4" r={BUBBLE_R} fill="white" stroke="currentColor" strokeWidth={BUBBLE_SW} />
												</Icon>
											)}
											{item.label}
										</span>
										{(isSelected || isHovered) && (
											<svg className={`h-7 w-7 ${isSelected ? 'text-blue-500' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={CHEVRON_SW}>
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
											setSelectedProjectionType(item.id as 'long-position' | 'short-position' | 'price-range' | 'date-range' | 'date-price-range');
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
										<span className="flex items-center gap-2 whitespace-nowrap">
											{item.icon === 'price-range' && (
												<Icon className={`h-7 w-7 ${isSelected ? 'text-white' : 'text-slate-900'}`} strokeWidth={ICON_SW}>
													<path d="M4 4h16" stroke="currentColor" strokeLinecap="round" />
													<path d="M4 20h16" stroke="currentColor" strokeLinecap="round" />
													<path d="M12 5.5v11" stroke="currentColor" strokeLinecap="round" />
													<path d="M12 5.5l-1.2 1.5M12 5.5l1.2 1.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
													<circle cx="18" cy="4" r="1.6" fill="white" stroke="currentColor" strokeWidth={BUBBLE_SW} />
													<circle cx="6" cy="20" r="1.6" fill="white" stroke="currentColor" strokeWidth={BUBBLE_SW} />
												</Icon>
											)}
											{item.icon === 'date-range' && (
												<Icon className={`h-7 w-7 ${isSelected ? 'text-white' : 'text-slate-900'}`} strokeWidth={ICON_SW}>
													<path d="M4 4v16" stroke="currentColor" strokeLinecap="round" />
													<path d="M20 4v16" stroke="currentColor" strokeLinecap="round" />
													<path d="M5.5 12h11" stroke="currentColor" strokeLinecap="round" />
													<path d="M18.5 12l-1.5 1.2M18.5 12l-1.5 -1.2" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
													<circle cx="4" cy="6" r="1.6" fill="white" stroke="currentColor" strokeWidth={BUBBLE_SW} />
													<circle cx="20" cy="18" r="1.6" fill="white" stroke="currentColor" strokeWidth={BUBBLE_SW} />
												</Icon>
											)}
											{item.icon === 'date-price-range' && (
												<Icon className={`h-7 w-7 ${isSelected ? 'text-white' : 'text-slate-900'}`} strokeWidth={ICON_SW}>
													<path d="M4 4h16" stroke="currentColor" strokeLinecap="round" />
													<path d="M4 20h16" stroke="currentColor" strokeLinecap="round" />
													<path d="M4 4v16" stroke="currentColor" strokeLinecap="round" />
													<path d="M20 4v16" stroke="currentColor" strokeLinecap="round" />
													<path d="M12 5.5v11" stroke="currentColor" strokeLinecap="round" />
													<path d="M12 5.5l-1.2 1.5M12 5.5l1.2 1.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
													<path d="M5.5 12h11" stroke="currentColor" strokeLinecap="round" />
													<path d="M18.5 12l-1.5 1.2M18.5 12l-1.5 -1.2" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
													<circle cx="3" cy="3" r="1.6" fill="white" stroke="currentColor" strokeWidth={BUBBLE_SW} />
													<circle cx="21" cy="21" r="1.6" fill="white" stroke="currentColor" strokeWidth={BUBBLE_SW} />
												</Icon>
											)}
											{item.label}
										</span>
										{(isSelected || isHovered) && (
											<svg className={`h-7 w-7 ${isSelected ? 'text-blue-500' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={CHEVRON_SW}>
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

		// Chart Patterns button with flyout for XABCD etc.
		if (tool.id === 'patterns') {
			return (
				<div key={tool.id} className="relative">
					<button
						type="button"
						aria-label={tool.label}
						title={tool.label}
						className={[
							'h-10 w-10 grid place-items-center rounded-lg transition-colors',
							activeToolId === 'patterns'
								? 'text-blue-600'
								: 'text-slate-900 hover:bg-slate-100 active:bg-slate-200',
						].join(' ')}
						onClick={() => {
							setShowCrosshairMenu(false);
							setShowProjectionMenu(false);
							setShowShapesMenu(false);
							setShowLinesMenu(false);
							setShowFibonacciMenu(false);
							setShowAnnotationMenu(false);
							setShowEmojiPicker(false);
							setActiveToolId('patterns');
							setActiveTool(selectedPatternsType as any);
							setShowPatternsMenu((v) => !v);
						}}
					>
						{selectedPatternsType === 'cypher' ? (
							<Icon strokeWidth={ICON_SW}>
								<path d="M3 20L11 15M21 20L11 15" fill="none" />
								<polyline points="3,20 7,8 11,15 15,5 21,20" fill="none" strokeLinejoin="round" strokeLinecap="round" />
								<circle cx="3" cy="20" r={BUBBLE_R} fill="white" stroke="currentColor" strokeWidth={BUBBLE_SW} />
								<circle cx="7" cy="8" r={BUBBLE_R} fill="white" stroke="currentColor" strokeWidth={BUBBLE_SW} />
								<circle cx="11" cy="15" r={BUBBLE_R} fill="white" stroke="currentColor" strokeWidth={BUBBLE_SW} />
								<circle cx="15" cy="5" r={BUBBLE_R} fill="white" stroke="currentColor" strokeWidth={BUBBLE_SW} />
								<circle cx="21" cy="20" r={BUBBLE_R} fill="white" stroke="currentColor" strokeWidth={BUBBLE_SW} />
								<text
									x="11"
									y="17.65"
									dominantBaseline="hanging"
									textAnchor="middle"
									fill="currentColor"
									stroke="none"
									fontSize={CYPHER_C_FONT}
									fontWeight="700"
									fontFamily="system-ui, -apple-system, sans-serif"
								>
									C
								</text>
							</Icon>
						) : selectedPatternsType === 'head-and-shoulders' ? (
							<HeadShouldersPatternIcon className="h-7 w-7" strokeWidth={ICON_SW} />
						) : selectedPatternsType === 'abcd' ? (
							<AbcdPatternIcon className="h-7 w-7" strokeWidth={ICON_SW} />
						) : selectedPatternsType === 'elliott-impulse' ? (
							<ElliottImpulseIcon className="h-7 w-7" strokeWidth={ICON_SW} />
						) : selectedPatternsType === 'elliott-correction' ? (
							<ElliottCorrectionIcon className="h-7 w-7" strokeWidth={ICON_SW} />
						) : selectedPatternsType === 'elliott-triangle' ? (
							<ElliottTriangleIcon className="h-7 w-7" strokeWidth={ICON_SW} />
						) : selectedPatternsType === 'elliott-double-combo' ? (
							<ElliottDoubleComboIcon className="h-7 w-7" strokeWidth={ICON_SW} />
						) : selectedPatternsType === 'elliott-triple-combo' ? (
							<ElliottTripleComboIcon className="h-7 w-7" strokeWidth={ICON_SW} />
						) : (
							tool.icon
						)}
					</button>
					{showPatternsMenu && (
						<div className="absolute left-full ml-2 top-0 bg-white border border-slate-200 rounded-lg shadow-lg py-1 min-w-[300px] z-50 max-h-[80vh] overflow-y-auto">
							<div className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-100">
								Chart Patterns
							</div>
							{chartPatternsMenuItems.map((item) => {
								const isSelected = selectedPatternsType === item.id;
								const isHovered = hoveredPatternsItemId === item.id;
								return (
									<button
										key={item.id}
										type="button"
										onClick={() => {
											setSelectedPatternsType(item.id as any);
											setActiveTool(item.id as any);
											setShowPatternsMenu(false);
										}}
										onMouseEnter={() => setHoveredPatternsItemId(item.id)}
										onMouseLeave={() => setHoveredPatternsItemId(null)}
										className={[
											'w-full px-3 py-2 text-left text-sm flex items-center justify-between transition-colors',
											isSelected ? 'bg-slate-700 text-white' : 'text-slate-900 hover:bg-transparent',
										].join(' ')}
									>
										<span className="flex items-center gap-2 whitespace-nowrap">
											{item.id === 'head-and-shoulders' ? (
												<HeadShouldersPatternIcon
													className={`h-7 w-7 ${isSelected ? 'text-white' : 'text-slate-900'}`}
													strokeWidth={ICON_SW}
												/>
											) : item.id === 'abcd' ? (
												<AbcdPatternIcon
													className={`h-7 w-7 ${isSelected ? 'text-white' : 'text-slate-900'}`}
													strokeWidth={ICON_SW}
												/>
											) : (
												<Icon className={`h-7 w-7 ${isSelected ? 'text-white' : 'text-slate-900'}`} strokeWidth={ICON_SW}>
													<path d="M3 20L11 15M19 20L11 15" fill="none" />
													<polyline points="3,20 7,8 11,15 15,6 19,20" fill="none" stroke="currentColor" strokeWidth="1.05" strokeLinejoin="round" strokeLinecap="round" />
													<circle cx="3" cy="20" r={BUBBLE_R} fill="white" stroke="currentColor" strokeWidth={BUBBLE_SW} />
													<circle cx="7" cy="8" r={BUBBLE_R} fill="white" stroke="currentColor" strokeWidth={BUBBLE_SW} />
													<circle cx="11" cy="15" r={BUBBLE_R} fill="white" stroke="currentColor" strokeWidth={BUBBLE_SW} />
													<circle cx="15" cy="6" r={BUBBLE_R} fill="white" stroke="currentColor" strokeWidth={BUBBLE_SW} />
													<circle cx="19" cy="20" r={BUBBLE_R} fill="white" stroke="currentColor" strokeWidth={BUBBLE_SW} />
													{item.id === 'cypher' && (
														<text
															x="11"
															y="17.65"
															dominantBaseline="hanging"
															textAnchor="middle"
															fill="currentColor"
															stroke="none"
															fontSize={CYPHER_C_FONT}
															fontWeight="700"
															fontFamily="system-ui, -apple-system, sans-serif"
														>
															C
														</text>
													)}
												</Icon>
											)}
											{item.label}
										</span>
										{(isSelected || isHovered) && (
											<svg className={`h-7 w-7 ${isSelected ? 'text-blue-500' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={CHEVRON_SW}>
												<path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
											</svg>
										)}
									</button>
								);
							})}
							<div className="px-3 py-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider pt-2 border-t border-slate-100 mt-1">
								Elliott Waves
							</div>
							{elliottWavesMenuItems.map((item) => {
								const isSelected = selectedPatternsType === item.id;
								const isHovered = hoveredPatternsItemId === item.id;
								return (
									<button
										key={item.id}
										type="button"
										onClick={() => {
											setSelectedPatternsType(item.id as any);
											setActiveTool(item.id as any);
											setShowPatternsMenu(false);
										}}
										onMouseEnter={() => setHoveredPatternsItemId(item.id)}
										onMouseLeave={() => setHoveredPatternsItemId(null)}
										className={[
											'w-full px-3 py-2 text-left text-sm flex items-center justify-between transition-colors',
											isSelected ? 'bg-slate-700 text-white' : 'text-slate-900 hover:bg-transparent',
										].join(' ')}
									>
										<span className="flex items-center gap-2 whitespace-nowrap">
											{item.id === 'elliott-impulse' ? (
												<ElliottImpulseIcon className={`h-7 w-7 ${isSelected ? 'text-white' : 'text-slate-900'}`} strokeWidth={ICON_SW} />
											) : item.id === 'elliott-correction' ? (
												<ElliottCorrectionIcon className={`h-7 w-7 ${isSelected ? 'text-white' : 'text-slate-900'}`} strokeWidth={ICON_SW} />
											) : item.id === 'elliott-triangle' ? (
												<ElliottTriangleIcon className={`h-7 w-7 ${isSelected ? 'text-white' : 'text-slate-900'}`} strokeWidth={ICON_SW} />
											) : item.id === 'elliott-double-combo' ? (
												<ElliottDoubleComboIcon className={`h-7 w-7 ${isSelected ? 'text-white' : 'text-slate-900'}`} strokeWidth={ICON_SW} />
											) : item.id === 'elliott-triple-combo' ? (
												<ElliottTripleComboIcon className={`h-7 w-7 ${isSelected ? 'text-white' : 'text-slate-900'}`} strokeWidth={ICON_SW} />
											) : (
												<Icon className={`h-7 w-7 ${isSelected ? 'text-white' : 'text-slate-900'}`} strokeWidth={ICON_SW}>
													<polyline points="3,20 6,8 9,14 14,4 17,12 21,6" fill="none" stroke="currentColor" strokeWidth="1.05" strokeLinejoin="round" strokeLinecap="round" />
												</Icon>
											)}
											{item.label}
										</span>
										{(isSelected || isHovered) && (
											<svg className={`h-7 w-7 ${isSelected ? 'text-blue-500' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={CHEVRON_SW}>
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

		// Fibonacci button with flyout for fibonacci retracement and gann box
		if (tool.id === 'fibonacci') {
			return (
				<div key={tool.id} className="relative">
					<button
						type="button"
						aria-label={tool.label}
						title={tool.label}
						className={[
							'h-10 w-10 grid place-items-center rounded-lg transition-colors',
							activeToolId === 'fibonacci'
								? 'text-blue-600'
								: 'text-slate-900 hover:bg-slate-100 active:bg-slate-200',
						].join(' ')}
						onClick={() => {
							setShowCrosshairMenu(false);
							setShowProjectionMenu(false);
							setShowShapesMenu(false);
							setShowLinesMenu(false);
							setShowPatternsMenu(false);
							setShowAnnotationMenu(false);
							setShowEmojiPicker(false);
							setActiveToolId('fibonacci');
							setActiveTool(selectedFibonacciType as any);
							setShowFibonacciMenu((v) => !v);
						}}
					>
						{selectedFibonacciType === 'gann-box' ? (
							<Icon className="h-7 w-7" strokeWidth={ICON_SW}>
								<rect x="4" y="4" width="16" height="16" fill="currentColor" opacity={0.25} stroke="currentColor" strokeWidth="1.05" />
								<circle cx="4" cy="4" r="1.4" fill="white" stroke="currentColor" />
								<circle cx="20" cy="4" r="1.4" fill="white" stroke="currentColor" />
								<circle cx="4" cy="20" r="1.4" fill="white" stroke="currentColor" />
								<circle cx="20" cy="20" r="1.4" fill="white" stroke="currentColor" />
							</Icon>
						) : (
							tool.icon
						)}
					</button>
					{showFibonacciMenu && (
						<div className="absolute left-full ml-2 top-0 bg-white border border-slate-200 rounded-lg shadow-lg py-1 min-w-[280px] z-50">
							<div className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-100">
								Fibonacci
							</div>
							{fibonacciMenuItems.map((item) => {
								const isSelected = selectedFibonacciType === item.id;
								const isHovered = hoveredFibonacciItemId === item.id;
								return (
									<button
										key={item.id}
										type="button"
										onClick={() => {
											setSelectedFibonacciType(item.id);
											setActiveTool(item.id as any);
											setShowFibonacciMenu(false);
										}}
										onMouseEnter={() => setHoveredFibonacciItemId(item.id)}
										onMouseLeave={() => setHoveredFibonacciItemId(null)}
										className={[
											'w-full px-3 py-2 text-left text-sm flex items-center justify-between transition-colors',
											isSelected ? 'bg-slate-700 text-white' : 'text-slate-900 hover:bg-transparent',
										].join(' ')}
									>
										<span className="flex items-center gap-2 whitespace-nowrap">
											{item.icon === 'gann-box' ? (
												<Icon className={`h-7 w-7 ${isSelected ? 'text-white' : 'text-slate-900'}`} strokeWidth={ICON_SW}>
													<rect x="4" y="4" width="16" height="16" fill="currentColor" opacity={0.25} stroke="currentColor" strokeWidth="1.05" />
													<circle cx="4" cy="4" r="1.4" fill="white" stroke="currentColor" />
													<circle cx="20" cy="4" r="1.4" fill="white" stroke="currentColor" />
													<circle cx="4" cy="20" r="1.4" fill="white" stroke="currentColor" />
													<circle cx="20" cy="20" r="1.4" fill="white" stroke="currentColor" />
												</Icon>
											) : (
												<Icon className={`h-7 w-7 ${isSelected ? 'text-white' : 'text-slate-900'}`} strokeWidth={ICON_SW}>
													<path d="M4 5h16" stroke="currentColor" strokeWidth="1.05" />
													<path d="M4 10h16" stroke="currentColor" strokeWidth="1.05" />
													<path d="M4 15h16" stroke="currentColor" strokeWidth="1.05" />
													<path d="M4 20h16" stroke="currentColor" strokeWidth="1.05" />
													<circle cx="4" cy="20" r="1.4" fill="white" stroke="currentColor" />
													<circle cx="20" cy="5" r="1.4" fill="white" stroke="currentColor" />
												</Icon>
											)}
											{item.label}
										</span>
										{(isSelected || isHovered) && (
											<svg className={`h-7 w-7 ${isSelected ? 'text-blue-500' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={CHEVRON_SW}>
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

		// Shapes button with flyout for brushes, arrows, and geometric shapes
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
							setShowPatternsMenu(false);
							setShowFibonacciMenu(false);
							setShowAnnotationMenu(false);
							setShowEmojiPicker(false);
							setActiveToolId('shapes');
							setActiveTool(selectedShapesType as any);
							setShowShapesMenu((v) => !v);
						}}
					>
						{selectedShapesType === 'brush' ? (
							<Icon className="h-7 w-7" strokeWidth={ICON_SW}>
								<path d="M16.5 3.5a2.121 2.121 0 013 3L8 18l-4 1 1-4 11.5-11.5z" />
								<line x1="14.5" y1="5.5" x2="18.5" y2="9.5" />
							</Icon>
						) : selectedShapesType === 'arrow' ? (
							<Icon className="h-7 w-7" strokeWidth={ICON_SW}>
								<path d="M4 20 L20 4" stroke="currentColor" fill="none" strokeLinecap="round" />
								<path d="M20 4 L15 7 M20 4 L17 9" stroke="currentColor" fill="none" strokeLinecap="round" strokeLinejoin="round" />
								<circle cx="20" cy="4" r="1.6" fill="white" stroke="currentColor" />
							</Icon>
						) : selectedShapesType === 'arrow-marker' ? (
							<Icon className="h-7 w-7" strokeWidth={0}>
								<path
									d="M20 3 L13 7 L15 9 L5 19 L1 23 L10 17 L17 10 L19 12 Z"
									fill="currentColor"
								/>
							</Icon>
						) : selectedShapesType === 'arrow-markup' ? (
							<Icon className="h-7 w-7" strokeWidth={0}>
								<path d="M12 5 L7 10 L10 10 L10 18 L14 18 L14 10 L17 10 Z" fill="none" stroke="currentColor" strokeWidth="1.05" strokeLinejoin="miter" />
							</Icon>
						) : selectedShapesType === 'arrow-markdown' ? (
							<Icon className="h-7 w-7" strokeWidth={0}>
								<path d="M12 19 L7 14 L10 14 L10 6 L14 6 L14 14 L17 14 Z" fill="none" stroke="currentColor" strokeWidth="1.05" strokeLinejoin="miter" />
							</Icon>
						) : selectedShapesType === 'rectangle' ? (
							<Icon className="h-7 w-7" strokeWidth={ICON_SW}>
								<rect x="4" y="4" width="16" height="16" rx="1" fill="none" stroke="currentColor" />
								<circle cx="4" cy="4" r="1.6" fill="white" stroke="currentColor" />
								<circle cx="20" cy="4" r="1.6" fill="white" stroke="currentColor" />
								<circle cx="4" cy="20" r="1.6" fill="white" stroke="currentColor" />
								<circle cx="20" cy="20" r="1.6" fill="white" stroke="currentColor" />
							</Icon>
						) : selectedShapesType === 'path' ? (
							<Icon className="h-7 w-7" strokeWidth={ICON_SW}>
								<path d="M4 12L20 12" />
								<circle cx="4" cy="12" r="1.6" fill="white" stroke="currentColor" />
								<path d="M18 10.8L20 12L18 13.2" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
							</Icon>
						) : selectedShapesType === 'circle' ? (
							<Icon className="h-7 w-7" strokeWidth={ICON_SW}>
								<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" />
								<circle cx="12" cy="12" r="1.6" fill="white" stroke="currentColor" />
								<circle cx="20" cy="12" r="1.6" fill="white" stroke="currentColor" />
							</Icon>
						) : selectedShapesType === 'curve' ? (
							<Icon className="h-7 w-7" strokeWidth={ICON_SW}>
								<path d="M4 18 Q12 6 20 18" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
								<circle cx="4" cy="18" r="1.6" fill="white" stroke="currentColor" />
								<circle cx="12" cy="6" r="1.6" fill="white" stroke="currentColor" />
								<circle cx="20" cy="18" r="1.6" fill="white" stroke="currentColor" />
							</Icon>
						) : (
							tool.icon
						)}
					</button>

					{showShapesMenu && (
						<div
							className="absolute left-full ml-2 top-0 bg-white border border-slate-200 rounded-lg shadow-lg py-1 min-w-[280px] z-50"
						>
							<div className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-100">
								Shapes
							</div>
							<div className="px-3 py-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider pt-2 flex items-center justify-between">
								<span>Brushes</span>
								<span className="flex items-center gap-0.5">
									<svg className="h-3.5 w-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
										<path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
									</svg>
									<svg className="h-3.5 w-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
										<path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
									</svg>
								</span>
							</div>
							{brushesMenuItems.map((item) => {
								const isSelected = selectedShapesType === item.id;
								const isHovered = hoveredShapesItemId === item.id;
								return (
									<button
										key={item.id}
										type="button"
										onClick={() => {
											setSelectedShapesType(item.id as 'brush' | 'arrow' | 'arrow-marker' | 'arrow-markup' | 'arrow-markdown' | 'rectangle' | 'path' | 'circle' | 'curve');
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
										<span className="flex items-center gap-2 whitespace-nowrap">
											{item.icon === 'brush' && (
												<Icon className={`h-7 w-7 ${isSelected ? 'text-white' : 'text-slate-900'}`} strokeWidth={ICON_SW}>
													<path d="M16.5 3.5a2.121 2.121 0 013 3L8 18l-4 1 1-4 11.5-11.5z" />
													<line x1="14.5" y1="5.5" x2="18.5" y2="9.5" />
												</Icon>
											)}
											{item.label}
										</span>
										{(isSelected || isHovered) && (
											<svg className={`h-7 w-7 ${isSelected ? 'text-blue-500' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={CHEVRON_SW}>
												<path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
											</svg>
										)}
									</button>
								);
							})}
							<div className="px-3 py-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider pt-2">
								Arrows
							</div>
							{arrowsMenuItems.map((item) => {
								const isSelected = selectedShapesType === item.id;
								const isHovered = hoveredShapesItemId === item.id;
								return (
									<button
										key={item.id}
										type="button"
										onClick={() => {
											setSelectedShapesType(item.id as 'brush' | 'arrow' | 'arrow-marker' | 'arrow-markup' | 'arrow-markdown' | 'rectangle' | 'path' | 'circle' | 'curve');
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
										<span className="flex items-center gap-2 whitespace-nowrap">
											{item.icon === 'arrow' && (
												<Icon className={`h-7 w-7 ${isSelected ? 'text-white' : 'text-slate-900'}`} strokeWidth={ICON_SW}>
													<path d="M4 20 L20 4" stroke="currentColor" fill="none" strokeLinecap="round" />
													<path d="M20 4 L15 7 M20 4 L17 9" stroke="currentColor" fill="none" strokeLinecap="round" strokeLinejoin="round" />
													<circle cx="20" cy="4" r="1.6" fill="white" stroke="currentColor" />
												</Icon>
											)}
											{item.icon === 'arrow-marker' && (
												<Icon className={`h-7 w-7 ${isSelected ? 'text-white' : 'text-slate-900'}`} strokeWidth={0}>
													<path d="M20 3 L13 7 L15 9 L5 19 L1 23 L10 17 L17 10 L19 12 Z" fill="currentColor" />
												</Icon>
											)}
											{item.icon === 'arrow-markup' && (
												<Icon className="h-7 w-7" strokeWidth={0}>
													<path d="M12 5 L7 10 L10 10 L10 18 L14 18 L14 10 L17 10 Z" fill="none" stroke="currentColor" strokeWidth="1.05" strokeLinejoin="miter" />
												</Icon>
											)}
											{item.icon === 'arrow-markdown' && (
												<Icon className="h-7 w-7" strokeWidth={0}>
													<path d="M12 19 L7 14 L10 14 L10 6 L14 6 L14 14 L17 14 Z" fill="none" stroke="currentColor" strokeWidth="1.05" strokeLinejoin="miter" />
												</Icon>
											)}
											{item.label}
										</span>
										{(isSelected || isHovered) && (
											<svg className={`h-7 w-7 ${isSelected ? 'text-blue-500' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={CHEVRON_SW}>
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
											setSelectedShapesType(item.id as 'brush' | 'arrow' | 'arrow-marker' | 'arrow-markup' | 'arrow-markdown' | 'rectangle' | 'path' | 'circle' | 'curve');
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
										<span className="flex items-center gap-2 whitespace-nowrap">
											{item.icon === 'rectangle' && (
												<Icon className={`h-7 w-7 ${isSelected ? 'text-white' : 'text-slate-900'}`} strokeWidth={ICON_SW}>
													<rect x="4" y="4" width="16" height="16" rx="1" fill="none" stroke="currentColor" />
													<circle cx="4" cy="4" r="1.6" fill="white" stroke="currentColor" />
													<circle cx="20" cy="4" r="1.6" fill="white" stroke="currentColor" />
													<circle cx="4" cy="20" r="1.6" fill="white" stroke="currentColor" />
													<circle cx="20" cy="20" r="1.6" fill="white" stroke="currentColor" />
												</Icon>
											)}
											{item.icon === 'path' && (
												<Icon className={`h-7 w-7 ${isSelected ? 'text-white' : 'text-slate-900'}`} strokeWidth={ICON_SW}>
													<path d="M4 12L20 12" />
													<circle cx="4" cy="12" r="1.6" fill="white" stroke="currentColor" />
													<path d="M18 10.8L20 12L18 13.2" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
												</Icon>
											)}
											{item.icon === 'circle' && (
												<Icon className={`h-7 w-7 ${isSelected ? 'text-white' : 'text-slate-900'}`} strokeWidth={ICON_SW}>
													<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" />
													<circle cx="12" cy="12" r="1.6" fill="white" stroke="currentColor" />
													<circle cx="20" cy="12" r="1.6" fill="white" stroke="currentColor" />
												</Icon>
											)}
											{item.icon === 'curve' && (
												<Icon className={`h-7 w-7 ${isSelected ? 'text-white' : 'text-slate-900'}`} strokeWidth={ICON_SW}>
													<path d="M4 18 Q12 6 20 18" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
													<circle cx="4" cy="18" r="1.6" fill="white" stroke="currentColor" />
													<circle cx="12" cy="6" r="1.6" fill="white" stroke="currentColor" />
													<circle cx="20" cy="18" r="1.6" fill="white" stroke="currentColor" />
												</Icon>
											)}
											{item.label}
										</span>
										{(isSelected || isHovered) && (
											<svg className={`h-7 w-7 ${isSelected ? 'text-blue-500' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={CHEVRON_SW}>
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

		// Lines button with flyout for trend line, ray, horizontal line/ray, and channels
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
							setShowPatternsMenu(false);
							setShowFibonacciMenu(false);
							setShowAnnotationMenu(false);
							setShowEmojiPicker(false);
							setActiveToolId('lines');
							setActiveTool(selectedLinesType as any);
							setShowLinesMenu((v) => !v);
						}}
					>
						{selectedLinesType === 'horizontal-line' ? (
							<Icon>
								<path d="M4 12L20 12" />
								<circle cx="12" cy="12" r="1.6" fill="white" stroke="currentColor" strokeWidth={BUBBLE_SW} />
							</Icon>
						) : selectedLinesType === 'horizontal-ray' ? (
							<Icon>
								<path d="M4 12L20 12" />
								<circle cx="4" cy="12" r="1.6" fill="white" stroke="currentColor" strokeWidth={BUBBLE_SW} />
							</Icon>
						) : selectedLinesType === 'ray' ? (
							<Icon>
								<path d="M4 20L20 4" />
								<circle cx="4" cy="20" r="1.6" fill="white" stroke="currentColor" strokeWidth={BUBBLE_SW} />
								<circle cx="12" cy="12" r="1.6" fill="white" stroke="currentColor" strokeWidth={BUBBLE_SW} />
							</Icon>
						) : selectedLinesType === 'parallel-channel' ? (
							<Icon>
								<path d="M4 18L20 6" stroke="currentColor" strokeWidth={BUBBLE_SW} />
								<path d="M6 17L18 7" stroke="currentColor" strokeWidth={BUBBLE_SW} />
								<circle cx="12" cy="12" r="1.6" fill="white" stroke="currentColor" strokeWidth={BUBBLE_SW} />
							</Icon>
						) : selectedLinesType === 'info-line' ? (
							<Icon>
								<path d="M4 20L20 4" />
								<circle cx="4" cy="20" r="1.6" fill="white" stroke="currentColor" strokeWidth={BUBBLE_SW} />
								<circle cx="20" cy="4" r="1.6" fill="white" stroke="currentColor" strokeWidth={BUBBLE_SW} />
								<rect x="8" y="10" width="8" height="5" rx="1" fill="currentColor" opacity={0.25} stroke="currentColor" strokeWidth={0.8} />
							</Icon>
						) : (
							tool.icon
						)}
					</button>

					{showLinesMenu && (
						<div
							className="absolute left-full ml-2 top-0 bg-white border border-slate-200 rounded-lg shadow-lg py-1 min-w-[280px] z-50"
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
										<span className="flex items-center gap-2 whitespace-nowrap">
											{item.icon === 'ray' && (
												<Icon className={`h-7 w-7 ${isSelected ? 'text-white' : 'text-slate-900'}`} strokeWidth={ICON_SW}>
													<path d="M4 20L20 4" />
													<circle cx="4" cy="20" r="1.6" fill="white" stroke="currentColor" strokeWidth={BUBBLE_SW} />
													<circle cx="20" cy="4" r="1.6" fill="white" stroke="currentColor" strokeWidth={BUBBLE_SW} />
												</Icon>
											)}
											{item.icon === 'info-line' && (
												<Icon className={`h-7 w-7 ${isSelected ? 'text-white' : 'text-slate-900'}`} strokeWidth={ICON_SW}>
													<path d="M4 20L20 4" />
													<circle cx="4" cy="20" r="1.6" fill="white" stroke="currentColor" strokeWidth={BUBBLE_SW} />
													<circle cx="20" cy="4" r="1.6" fill="white" stroke="currentColor" strokeWidth={BUBBLE_SW} />
													<rect x="8" y="10" width="8" height="5" rx="1" fill="currentColor" opacity={0.25} stroke="currentColor" strokeWidth={0.8} />
												</Icon>
											)}
											{item.icon === 'ray-line' && (
												<Icon className={`h-7 w-7 ${isSelected ? 'text-white' : 'text-slate-900'}`} strokeWidth={ICON_SW}>
													<path d="M4 20L20 4" />
													<circle cx="4" cy="20" r="1.6" fill="white" stroke="currentColor" strokeWidth={BUBBLE_SW} />
													<circle cx="12" cy="12" r="1.6" fill="white" stroke="currentColor" strokeWidth={BUBBLE_SW} />
												</Icon>
											)}
											{item.icon === 'hline' && (
												<Icon className={`h-7 w-7 ${isSelected ? 'text-white' : 'text-slate-900'}`} strokeWidth={ICON_SW}>
													<path d="M4 12L20 12" />
													<circle cx="12" cy="12" r="1.6" fill="white" stroke="currentColor" strokeWidth={BUBBLE_SW} />
												</Icon>
											)}
											{item.icon === 'hray' && (
												<Icon className={`h-7 w-7 ${isSelected ? 'text-white' : 'text-slate-900'}`} strokeWidth={ICON_SW}>
													<path d="M4 12L20 12" />
													<circle cx="4" cy="12" r="1.6" fill="white" stroke="currentColor" strokeWidth={BUBBLE_SW} />
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
												strokeWidth={CHEVRON_SW}
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
												<span className="flex items-center gap-2 whitespace-nowrap">
													{item.icon === 'parallel-channel' && (
														<Icon className={`h-7 w-7 ${isSelected ? 'text-white' : 'text-slate-900'}`} strokeWidth={ICON_SW}>
															<path d="M4 19L20 5" stroke="currentColor" />
															<path d="M5 19L19 5" stroke="currentColor" />
															<circle cx="12" cy="12" r="1.6" fill="white" stroke="currentColor" strokeWidth={BUBBLE_SW} />
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
														strokeWidth={CHEVRON_SW}
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

		// Annotation: flyout lists Text only (same T icon as toolbar). Emoji is a separate tool below.
		if (tool.id === 'annotation') {
			const renderAnnotationIcon = (iconId: string, isSelected: boolean) => {
				const cls = `h-7 w-7 ${isSelected ? 'text-white' : 'text-slate-900'}`;
				const sw = 1.2;
				switch (iconId) {
					case 'text': return <Icon className={cls} strokeWidth={sw}><path d="M4 7V4h16v3" /><path d="M12 4v16" /><path d="M8 20h8" /></Icon>;
					case 'note': return <Icon className={cls} strokeWidth={sw}><rect x="3" y="3" width="18" height="18" rx="2" fill="none" /><path d="M7 8h10" /><path d="M7 12h6" /></Icon>;
					case 'price-note': return <Icon className={cls} strokeWidth={sw}><rect x="3" y="3" width="18" height="18" rx="2" fill="none" /><path d="M7 8h10" /><path d="M7 12h4" /><path d="M7 16h3" /></Icon>;
					case 'callout': return <Icon className={cls} strokeWidth={sw}><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" /></Icon>;
					case 'comment': return <Icon className={cls} strokeWidth={sw}><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></Icon>;
					case 'price-label': return <Icon className={cls} strokeWidth={sw}><path d="M4 7h12l4 5-4 5H4V7z" fill="none" /><path d="M8 12h6" /></Icon>;
					case 'signpost': return <Icon className={cls} strokeWidth={sw}><path d="M12 3v18" /><path d="M6 7h12l-2 3 2 3H6V7z" fill="none" /></Icon>;
					case 'flagmark': return <Icon className={cls} strokeWidth={sw}><path d="M4 3v18" /><path d="M4 3h12l-3 5 3 5H4" fill="none" /></Icon>;
					case 'pin': return <Icon className={cls} strokeWidth={sw}><path d="M12 21l0-8" /><path d="M9 13h6" /><circle cx="12" cy="8" r="4" fill="none" /></Icon>;
					default: return null;
				}
			};
			return (
				<div key={tool.id} className="relative">
					<button
						type="button"
						aria-label={tool.label}
						title={tool.label}
						className={[
							'h-10 w-10 grid place-items-center rounded-lg transition-colors',
							activeToolId === 'annotation'
								? 'text-blue-600'
								: 'text-slate-900 hover:bg-slate-100 active:bg-slate-200',
						].join(' ')}
						onClick={() => {
							setShowCrosshairMenu(false);
							setShowProjectionMenu(false);
							setShowShapesMenu(false);
							setShowLinesMenu(false);
							setShowPatternsMenu(false);
							setShowFibonacciMenu(false);
							setShowEmojiPicker(false);
							setActiveToolId('annotation');
							setActiveTool(selectedAnnotationType as any);
							setShowAnnotationMenu((v) => !v);
						}}
					>
						{tool.icon}
					</button>
					{showAnnotationMenu && (
						<div className="absolute left-full ml-2 top-0 bg-white border border-slate-200 rounded-lg shadow-lg py-1 min-w-[280px] z-50 font-sans">
							<div className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-100 font-sans">
								Annotation
							</div>
							{annotationMenuItems.map((item) => {
								const isSelected = selectedAnnotationType === item.id;
								const isHovered = hoveredAnnotationItemId === item.id;
								return (
									<button
										key={item.id}
										type="button"
										onClick={() => {
											setActiveTool(item.id as any);
											setActiveToolId('annotation');
											setSelectedAnnotationType(item.id as any);
											setShowAnnotationMenu(false);
											setShowEmojiPicker(false);
										}}
										onMouseEnter={() => setHoveredAnnotationItemId(item.id)}
										onMouseLeave={() => setHoveredAnnotationItemId(null)}
										className={[
											'w-full px-3 py-2 text-left text-sm font-sans flex items-center justify-between transition-colors',
											isSelected ? 'bg-slate-700 text-white' : 'text-slate-900 hover:bg-transparent',
										].join(' ')}
									>
										<span className="flex items-center gap-2 whitespace-nowrap">
											{renderAnnotationIcon(item.id, isSelected)}
											{item.label}
										</span>
										{(isSelected || isHovered) && (
											<svg className={`h-7 w-7 ${isSelected ? 'text-blue-500' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={CHEVRON_SW}>
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

		// Emoji: separate tool with emoji picker (not part of Annotation menu)
		if (tool.id === 'emoji') {
			return (
				<div key={tool.id} className="relative">
					<button
						type="button"
						aria-label={tool.label}
						title={tool.label}
						className={[
							'h-10 w-10 grid place-items-center rounded-lg transition-colors',
							activeToolId === 'emoji'
								? 'text-blue-600'
								: 'text-slate-900 hover:bg-slate-100 active:bg-slate-200',
						].join(' ')}
						onClick={() => {
							closeAllMenus();
							setShowEmojiPicker((v) => !v);
							if (!showEmojiPicker) {
								setActiveToolId('emoji');
								if (selectedEmoji) setActiveTool('emoji' as any);
							} else {
								setActiveTool(null);
							}
						}}
					>
						{tool.icon}
					</button>
					{showEmojiPicker && (
						<div className="absolute left-full ml-2 top-0 z-50 rounded-lg shadow-lg overflow-hidden border border-slate-200">
							<EmojiPicker
								theme={Theme.LIGHT}
								width={320}
								height={400}
								onEmojiClick={(data: EmojiClickData) => {
									setSelectedEmoji(data.emoji);
									setActiveTool('emoji' as any);
									setActiveToolId('emoji');
									setShowEmojiPicker(false);
								}}
							/>
						</div>
					)}
				</div>
			);
		}

		// Ruler (Scale): one-click activates date and price range tool; icon always stays ruler
		if (tool.id === 'ruler') {
			const isRulerActive = activeToolId === 'ruler';
			return (
				<button
					key={tool.id}
					type="button"
					aria-label={tool.label}
					title="Date and price range"
					className={[
						'h-10 w-10 grid place-items-center rounded-lg transition-colors',
						isRulerActive ? 'text-blue-600' : 'text-slate-900 hover:bg-slate-100 active:bg-slate-200',
					].join(' ')}
					onClick={() => {
						setShowCrosshairMenu(false);
						setShowProjectionMenu(false);
						setShowShapesMenu(false);
						setShowLinesMenu(false);
						setShowPatternsMenu(false);
						setShowFibonacciMenu(false);
						setShowAnnotationMenu(false);
						setShowEmojiPicker(false);
						setActiveToolId('ruler');
						setActiveTool('date-price-range' as any);
					}}
				>
					{tool.icon}
				</button>
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
					setShowCrosshairMenu(false);
					setShowProjectionMenu(false);
					setShowShapesMenu(false);
					setShowLinesMenu(false);
					setShowPatternsMenu(false);
					setShowFibonacciMenu(false);
					setShowAnnotationMenu(false);
					setShowEmojiPicker(false);
					setActiveToolId(tool.id);
					if (tool.id === 'lines' || tool.id === 'fib') {
						setActiveTool(tool.id as any);
					} else if (tool.id === 'zoom') {
						setActiveTool('zoom' as any);
					} else {
						setActiveTool(null);
					}
				}}
			>
				{tool.icon}
			</button>
		);
	};

	// ── Toolbar Layout ──

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

