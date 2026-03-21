/**
 * =============================================================================
 * DRAWING TYPES — Shared type definitions for the chart drawing system
 * =============================================================================
 *
 * All drawing tools, coordinate types, and drawing data structures live here.
 * Every component that works with drawings imports from this single source of
 * truth, which prevents circular dependencies and keeps types consistent.
 *
 * When adding a new drawing tool:
 *   1. Add the tool name to the DrawingTool union below
 *   2. Add any tool-specific fields to the Drawing interface
 *   3. The tool will then be available throughout the entire drawing pipeline
 */

/**
 * Union of all supported drawing tool identifiers.
 * `null` means no tool is active (navigation/crosshair mode).
 *
 * Categories:
 *   - Lines:      'lines' | 'ray' | 'info-line' | 'horizontal-line' | 'horizontal-ray' | 'parallel-channel'
 *   - Projection:  'long-position' | 'short-position'
 *   - Measurers:   'price-range' | 'date-range' | 'date-price-range'
 *   - Fibonacci:   'fib' | 'fibonacci-retracement' | 'gann-box'
 *   - Shapes:      'brush' | 'rectangle' | 'path' | 'circle' | 'curve'
 *   - Arrows:      'arrow' | 'arrow-marker' | 'arrow-markup' | 'arrow-markdown'
 *   - Annotation:  'text' | 'note' | 'price-note' | 'callout' | 'comment' | 'price-label' | 'signpost' | 'flagmark' | 'pin' | 'emoji'
 *   - Chart Patterns: 'xabcd' | 'cypher' | 'head-and-shoulders' | 'abcd'
 *   - Elliott Waves: 'elliott-impulse' | 'elliott-correction' | 'elliott-triangle' | 'elliott-double-combo' | 'elliott-triple-combo'
 *   - Utility:     'zoom'
 */
export type DrawingTool =
	| 'lines' | 'ray' | 'trendline' | 'info-line'
	| 'horizontal-line' | 'horizontal-ray' | 'parallel-channel'
	| 'long-position' | 'short-position'
	| 'price-range' | 'date-range' | 'date-price-range'
	| 'fib' | 'fibonacci-retracement' | 'gann-box'
	| 'brush' | 'rectangle' | 'path' | 'circle' | 'curve'
	| 'arrow' | 'arrow-marker' | 'arrow-markup' | 'arrow-markdown'
	| 'text' | 'note' | 'price-note' | 'callout' | 'comment' | 'price-label' | 'signpost' | 'flagmark' | 'pin' | 'emoji'
	| 'xabcd' | 'cypher' | 'head-and-shoulders' | 'abcd'
	| 'elliott-impulse' | 'elliott-correction' | 'elliott-triangle' | 'elliott-double-combo' | 'elliott-triple-combo'
	| 'zoom'
	| null;

/**
 * A point in chart-space (time + price).
 * These coordinates remain stable across zoom/pan operations because they
 * reference the actual data axes rather than pixel positions.
 */
export interface ChartPoint {
	/** UTC timestamp in seconds (matches lightweight-charts UTCTimestamp) */
	time: number;
	/** Price value on the Y axis */
	price: number;
}

/**
 * A point in screen-space (pixel coordinates relative to the chart container).
 * Used for temporary rendering during drawing and for legacy brush strokes.
 * Screen points shift when the user zooms or pans — prefer ChartPoint for persistence.
 */
export interface ScreenPoint {
	x: number;
	y: number;
}

/**
 * Core drawing data structure that represents any drawing on the chart.
 *
 * A single Drawing object can represent vastly different visual elements
 * (a simple trend line vs. a complex RR box) based on its `type` field.
 * Optional fields are used by specific tool types — see inline comments.
 */
export interface Drawing {
	/** Unique identifier (typically `drawing-<timestamp>`) */
	id: string;

	/** Which tool created this drawing; determines rendering + interaction behavior */
	type: DrawingTool;

	/**
	 * Screen-space points (legacy) — used by brush strokes that were drawn before
	 * chart-space conversion. New drawings should use `points` (chart-space) instead.
	 */
	screenPoints?: ScreenPoint[];

	/**
	 * Chart-space anchor points. The number of points depends on the tool type:
	 *   - Lines/Ray/Arrow/Info-line: 2 points (start, end)
	 *   - Curve: 3 points (start, control, end)
	 *   - Parallel channel: 4 points (line1-start, line1-end, line2-start, line2-end)
	 *   - Horizontal line/ray: 1 point (price anchor)
	 *   - Arrow markup/markdown: 1 point (tip position)
	 *   - Brush: N points (freehand path)
	 *   - Path: N points (polyline vertices)
	 */
	points?: ChartPoint[];

	// ---------- Long/Short Position (RR Box) fields ----------
	/** Entry price level for the position */
	entryPrice?: number;
	/** Stop-loss price level */
	stopLoss?: number;
	/** Take-profit price level */
	takeProfit?: number;

	// ---------- Shared time/price box fields ----------
	/** Left edge timestamp (used by RR box, price-range, date-range, rectangle, emoji, etc.) */
	startTime?: number;
	/** Right edge timestamp */
	endTime?: number;
	/** Top/bottom price for box-type drawings (price-range, rectangle, circle, etc.) */
	startPrice?: number;
	endPrice?: number;

	// ---------- Visual style ----------
	style?: {
		color?: string;
		width?: number;
	};

	/** When true, the drawing is hidden but not deleted (toggle via eye icon) */
	hidden?: boolean;
	/** When true, the drawing cannot be moved or resized */
	locked?: boolean;

	/** RR label hysteresis — tracks which side (green/red) the ratio label was last shown on */
	lastRRSide?: 'green' | 'red';

	/** Emoji character to render inside the emoji box */
	emojiChar?: string;

	/** User-provided text for the Text annotation tool (inside blue-bordered box) */
	textContent?: string;

	/** User-provided text label for info-line (shown center-aligned on the line) */
	label?: string;
}

/**
 * Candlestick bar data used by drawing renderers for bar-count calculations
 * and volume information display.
 */
export type CandleBar = {
	time: number;
	open: number;
	high: number;
	low: number;
	close: number;
	volume?: number;
};
