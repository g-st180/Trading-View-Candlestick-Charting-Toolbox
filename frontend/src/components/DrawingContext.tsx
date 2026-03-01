import { createContext, useContext, useState, useRef, ReactNode } from 'react';

export type DrawingTool = 'lines' | 'ray' | 'trendline' | 'horizontal-line' | 'horizontal-ray' | 'parallel-channel' | 'long-position' | 'short-position' | 'fib' | 'brush' | 'text' | null;

// Chart coordinates (time, price) - these stay constant regardless of zoom/pan
export interface ChartPoint {
	time: number; // UTC timestamp
	price: number;
}

// Screen coordinates (x, y) - for temporary rendering / MVP drawing
export interface ScreenPoint {
	x: number;
	y: number;
}

export interface Drawing {
	id: string;
	type: DrawingTool;
	// For now we support screen-space drawing so you can "draw something" reliably.
	// Later we'll migrate lines/tools to chart-space (ChartPoint) for pan/zoom persistence.
	screenPoints?: ScreenPoint[];
	points?: ChartPoint[];
	// For long-position (RR box)
	entryPrice?: number;
	stopLoss?: number;
	takeProfit?: number;
	startTime?: number;
	endTime?: number;
	style?: {
		color?: string;
		width?: number;
	};
	hidden?: boolean;
	locked?: boolean;
	// For RR ratio label positioning (hysteresis)
	lastRRSide?: 'green' | 'red'; // Track which side the label was last on
}

interface DrawingContextType {
	activeTool: DrawingTool;
	/** Ref updated synchronously when setActiveTool is called so chart handlers see the new tool immediately */
	activeToolRef: React.MutableRefObject<DrawingTool>;
	setActiveTool: (tool: DrawingTool) => void;
	drawings: Drawing[];
	addDrawing: (drawing: Drawing) => void;
	updateDrawing: (id: string, updater: (prev: Drawing) => Drawing) => void;
	removeDrawing: (id: string) => void;
	clearDrawings: () => void;
	isDrawing: boolean;
	setIsDrawing: (drawing: boolean) => void;
	currentDrawing: Drawing | null;
	setCurrentDrawing: (drawing: Drawing | null) => void;
	hoveredHorizontalLineId: string | null;
	setHoveredHorizontalLineId: (id: string | null) => void;
	hoveredHorizontalLineHandleId: string | null;
	setHoveredHorizontalLineHandleId: (id: string | null) => void;
	selectedDrawingId: string | null;
	setSelectedDrawingId: (id: string | null) => void;
	selectedHorizontalLineId: string | null;
	setSelectedHorizontalLineId: (id: string | null) => void;
	// Horizontal Ray tool hover/selection (similar to horizontal line)
	hoveredHorizontalRayId: string | null;
	setHoveredHorizontalRayId: (id: string | null) => void;
	hoveredHorizontalRayHandleId: string | null;
	setHoveredHorizontalRayHandleId: (id: string | null) => void;
	selectedHorizontalRayId: string | null;
	setSelectedHorizontalRayId: (id: string | null) => void;
	// Lines tool hover/selection (generic pattern for future tools)
	hoveredLineId: string | null;
	setHoveredLineId: (id: string | null) => void;
	hoveredLineHandleId: string | null;
	setHoveredLineHandleId: (id: string | null) => void;
	selectedLineId: string | null;
	setSelectedLineId: (id: string | null) => void;
}

const DrawingContext = createContext<DrawingContextType | undefined>(undefined);

export function DrawingProvider({ children }: { children: ReactNode }) {
	const [activeTool, setActiveToolState] = useState<DrawingTool>(null);
	const activeToolRef = useRef<DrawingTool>(null);
	const setActiveTool = (tool: DrawingTool) => {
		activeToolRef.current = tool;
		setActiveToolState(tool);
	};
	const [drawings, setDrawings] = useState<Drawing[]>([]);
	const [isDrawing, setIsDrawing] = useState(false);
	const [currentDrawing, setCurrentDrawing] = useState<Drawing | null>(null);
	const [hoveredHorizontalLineId, setHoveredHorizontalLineId] = useState<string | null>(null);
	const [hoveredHorizontalLineHandleId, setHoveredHorizontalLineHandleId] = useState<string | null>(null);
	const [selectedDrawingId, setSelectedDrawingId] = useState<string | null>(null);
	const [selectedHorizontalLineId, setSelectedHorizontalLineId] = useState<string | null>(null);
	const [hoveredHorizontalRayId, setHoveredHorizontalRayId] = useState<string | null>(null);
	const [hoveredHorizontalRayHandleId, setHoveredHorizontalRayHandleId] = useState<string | null>(null);
	const [selectedHorizontalRayId, setSelectedHorizontalRayId] = useState<string | null>(null);
	const [hoveredLineId, setHoveredLineId] = useState<string | null>(null);
	const [hoveredLineHandleId, setHoveredLineHandleId] = useState<string | null>(null);
	const [selectedLineId, setSelectedLineId] = useState<string | null>(null);

	const addDrawing = (drawing: Drawing) => {
		setDrawings((prev) => [...prev, drawing]);
	};

	const updateDrawing = (id: string, updater: (prev: Drawing) => Drawing) => {
		setDrawings((prev) => prev.map((d) => (d.id === id ? updater(d) : d)));
	};

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
			}}
		>
			{children}
		</DrawingContext.Provider>
	);
}

export function useDrawing() {
	const context = useContext(DrawingContext);
	if (context === undefined) {
		throw new Error('useDrawing must be used within a DrawingProvider');
	}
	return context;
}
