/**
 * =============================================================================
 * DRAWING CONTEXT — Global state management for the chart drawing system
 * =============================================================================
 *
 * Provides a React context that holds all drawing-related state:
 *   - Active tool selection
 *   - Drawing collection (CRUD operations)
 *   - Hover and selection states for every drawing type
 *   - In-progress drawing state
 *
 * The context is consumed by:
 *   - CandlestickChart.tsx  — tool placement, hit-testing, drag logic
 *   - DrawingOverlay.tsx    — rendering drawings on the canvas overlay
 *   - LeftToolbar.tsx       — tool selection UI
 *   - FullscreenChart.tsx   — wraps everything in <DrawingProvider>
 *
 * RE-EXPORTS: Types are defined in `types/drawing.ts` and re-exported here
 * for backward compatibility, so existing imports continue to work.
 */
import { createContext, useContext, useState, useRef, useCallback, ReactNode } from 'react';

// Re-export shared types so existing imports from './DrawingContext' still work
export type { DrawingTool, ChartPoint, ScreenPoint, Drawing, CandleBar } from '../types/drawing';
import type { DrawingTool, Drawing } from '../types/drawing';

// ─── Context Shape ──────────────────────────────────────────────────────────

interface DrawingContextType {
	/** Currently active drawing tool (null = navigation mode / crosshair) */
	activeTool: DrawingTool;
	/** Mutable ref that updates synchronously when setActiveTool is called,
	 *  so pointer event handlers always see the latest tool without stale closure issues */
	activeToolRef: React.MutableRefObject<DrawingTool>;
	setActiveTool: (tool: DrawingTool) => void;

	/** All committed drawings on the chart */
	drawings: Drawing[];
	addDrawing: (drawing: Drawing) => void;
	updateDrawing: (id: string, updater: (prev: Drawing) => Drawing) => void;
	removeDrawing: (id: string) => void;
	clearDrawings: () => void;

	/** Whether the user is currently placing a drawing (first click done, awaiting completion) */
	isDrawing: boolean;
	setIsDrawing: (drawing: boolean) => void;

	/** The in-progress drawing being previewed before it's committed */
	currentDrawing: Drawing | null;
	setCurrentDrawing: (drawing: Drawing | null) => void;

	// ── Horizontal Line hover/selection ──
	hoveredHorizontalLineId: string | null;
	setHoveredHorizontalLineId: (id: string | null) => void;
	hoveredHorizontalLineHandleId: string | null;
	setHoveredHorizontalLineHandleId: (id: string | null) => void;
	selectedHorizontalLineId: string | null;
	setSelectedHorizontalLineId: (id: string | null) => void;

	// ── Horizontal Ray hover/selection ──
	hoveredHorizontalRayId: string | null;
	setHoveredHorizontalRayId: (id: string | null) => void;
	hoveredHorizontalRayHandleId: string | null;
	setHoveredHorizontalRayHandleId: (id: string | null) => void;
	selectedHorizontalRayId: string | null;
	setSelectedHorizontalRayId: (id: string | null) => void;

	// ── Generic line/shape hover/selection (covers lines, ray, info-line, arrows, etc.) ──
	hoveredLineId: string | null;
	setHoveredLineId: (id: string | null) => void;
	hoveredLineHandleId: string | null;
	setHoveredLineHandleId: (id: string | null) => void;
	selectedLineId: string | null;
	setSelectedLineId: (id: string | null) => void;

	/** Global "selected drawing" ID — the one affected by lock/hide/delete actions */
	selectedDrawingId: string | null;
	setSelectedDrawingId: (id: string | null) => void;

	/** Currently selected emoji character for the emoji placement tool */
	selectedEmoji: string | null;
	setSelectedEmoji: (emoji: string | null) => void;
}

// ─── Context & Provider ─────────────────────────────────────────────────────

const DrawingContext = createContext<DrawingContextType | undefined>(undefined);

/**
 * Wraps the chart area and provides drawing state to all child components.
 * Should be placed above CandlestickChart, DrawingOverlay, and LeftToolbar in the tree.
 */
export function DrawingProvider({ children }: { children: ReactNode }) {
	// Active tool with synchronous ref for pointer event handlers
	const [activeTool, setActiveToolState] = useState<DrawingTool>(null);
	const activeToolRef = useRef<DrawingTool>(null);
	const setActiveTool = (tool: DrawingTool) => {
		activeToolRef.current = tool;
		setActiveToolState(tool);
	};

	// Drawing collection
	const [drawings, setDrawings] = useState<Drawing[]>([]);
	const [isDrawing, setIsDrawing] = useState(false);
	const [currentDrawing, setCurrentDrawing] = useState<Drawing | null>(null);

	// Horizontal line interaction state
	const [hoveredHorizontalLineId, setHoveredHorizontalLineId] = useState<string | null>(null);
	const [hoveredHorizontalLineHandleId, setHoveredHorizontalLineHandleId] = useState<string | null>(null);
	const [selectedHorizontalLineId, setSelectedHorizontalLineId] = useState<string | null>(null);

	// Global drawing selection
	const [selectedDrawingId, setSelectedDrawingId] = useState<string | null>(null);

	// Horizontal ray interaction state
	const [hoveredHorizontalRayId, setHoveredHorizontalRayId] = useState<string | null>(null);
	const [hoveredHorizontalRayHandleId, setHoveredHorizontalRayHandleId] = useState<string | null>(null);
	const [selectedHorizontalRayId, setSelectedHorizontalRayId] = useState<string | null>(null);

	// Generic line/shape interaction state
	const [hoveredLineId, setHoveredLineId] = useState<string | null>(null);
	const [hoveredLineHandleId, setHoveredLineHandleId] = useState<string | null>(null);
	const [selectedLineId, setSelectedLineId] = useState<string | null>(null);

	// Emoji tool state
	const [selectedEmoji, setSelectedEmoji] = useState<string | null>(null);

	// ── Drawing CRUD ──
	const addDrawing = (drawing: Drawing) => {
		setDrawings((prev) => [...prev, drawing]);
	};

	/** Stable identity + skips setState when the updater returns the same drawing reference (avoids render loops). */
	const updateDrawing = useCallback((id: string, updater: (prev: Drawing) => Drawing) => {
		setDrawings((prev) => {
			const idx = prev.findIndex((d) => d.id === id);
			if (idx === -1) return prev;
			const next = updater(prev[idx]);
			if (next === prev[idx]) return prev;
			const copy = [...prev];
			copy[idx] = next;
			return copy;
		});
	}, []);

	const removeDrawing = (id: string) => {
		setDrawings((prev) => prev.filter((d) => d.id !== id));
	};

	const clearDrawings = () => {
		setDrawings([]);
	};

	return (
		<DrawingContext.Provider
			value={{
				activeTool,
				activeToolRef,
				setActiveTool,
				drawings,
				addDrawing,
				updateDrawing,
				removeDrawing,
				clearDrawings,
				isDrawing,
				setIsDrawing,
				currentDrawing,
				setCurrentDrawing,
				hoveredHorizontalLineId,
				setHoveredHorizontalLineId,
				hoveredHorizontalLineHandleId,
				setHoveredHorizontalLineHandleId,
				selectedDrawingId,
				setSelectedDrawingId,
				selectedHorizontalLineId,
				setSelectedHorizontalLineId,
				hoveredHorizontalRayId,
				setHoveredHorizontalRayId,
				hoveredHorizontalRayHandleId,
				setHoveredHorizontalRayHandleId,
				selectedHorizontalRayId,
				setSelectedHorizontalRayId,
				hoveredLineId,
				setHoveredLineId,
				hoveredLineHandleId,
				setHoveredLineHandleId,
				selectedLineId,
				setSelectedLineId,
				selectedEmoji,
				setSelectedEmoji,
			}}
		>
			{children}
		</DrawingContext.Provider>
	);
}

/**
 * Hook to access drawing context. Must be used within a <DrawingProvider>.
 * Throws a descriptive error if used outside the provider tree.
 */
export function useDrawing() {
	const context = useContext(DrawingContext);
	if (context === undefined) {
		throw new Error('useDrawing must be used within a DrawingProvider');
	}
	return context;
}
