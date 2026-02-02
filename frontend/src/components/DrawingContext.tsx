import { createContext, useContext, useState, ReactNode } from 'react';

export type DrawingTool = 'lines' | 'trendline' | 'horizontal-line' | 'fib' | 'brush' | 'text' | null;

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
	style?: {
		color?: string;
		width?: number;
	};
	hidden?: boolean;
	locked?: boolean;
}

interface DrawingContextType {
	activeTool: DrawingTool;
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
}

const DrawingContext = createContext<DrawingContextType | undefined>(undefined);

export function DrawingProvider({ children }: { children: ReactNode }) {
	const [activeTool, setActiveTool] = useState<DrawingTool>(null);
	const [drawings, setDrawings] = useState<Drawing[]>([]);
	const [isDrawing, setIsDrawing] = useState(false);
	const [currentDrawing, setCurrentDrawing] = useState<Drawing | null>(null);
	const [hoveredHorizontalLineId, setHoveredHorizontalLineId] = useState<string | null>(null);
	const [hoveredHorizontalLineHandleId, setHoveredHorizontalLineHandleId] = useState<string | null>(null);
	const [selectedDrawingId, setSelectedDrawingId] = useState<string | null>(null);
	const [selectedHorizontalLineId, setSelectedHorizontalLineId] = useState<string | null>(null);

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
