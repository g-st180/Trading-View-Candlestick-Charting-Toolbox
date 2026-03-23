/**
 * =============================================================================
 * DRAWING HELPERS — Pure utility functions for the drawing system
 * =============================================================================
 *
 * All functions in this file are pure (no React state, no side effects).
 * They handle geometry, smoothing, hit-testing, and canvas drawing primitives
 * shared between DrawingOverlay, CandlestickChart, and DrawingsUnderlayPrimitive.
 */

// ─── Gann Box Visual Helpers ────────────────────────────────────────────────

/** Gann box grid divisions along each axis (standard Fibonacci levels) */
export const GANN_FRACTIONS = [0, 0.25, 0.382, 0.5, 0.618, 0.75, 1] as const;

/** Returns the fill color for a Gann box cell based on its grid position */
export function gannCellColor(row: number, col: number, opacity: number): string {
	const idx = row * 6 + col;
	const hue = 45 + (idx / 36) * 75;
	return `hsla(${hue}, 58%, 72%, ${opacity})`;
}

/** Returns the label color for a Gann box level marker */
export function gannLabelColor(index: number): string {
	const hue = 45 + (index / 6) * 75;
	return `hsl(${hue}, 52%, 32%)`;
}

/** Returns the border color for a specific side of the Gann box */
export function gannBorderColor(side: 'top' | 'right' | 'bottom' | 'left'): string {
	const hues = { top: 52, right: 75, bottom: 98, left: 118 };
	return `hsl(${hues[side]}, 55%, 38%)`;
}

// ─── Brush Smoothing ────────────────────────────────────────────────────────

/**
 * Applies a moving-average filter to smooth freehand brush strokes.
 * Rounds off per-candle steps without losing the overall shape.
 *
 * @param pts - Raw freehand points
 * @param radius - Smoothing window radius (higher = smoother)
 */
export function smoothPoints(pts: { x: number; y: number }[], radius: number): { x: number; y: number }[] {
	if (pts.length <= 2) return pts;
	const out: { x: number; y: number }[] = [];
	for (let i = 0; i < pts.length; i++) {
		let sumX = 0, sumY = 0, count = 0;
		for (let j = Math.max(0, i - radius); j <= Math.min(pts.length - 1, i + radius); j++) {
			sumX += pts[j].x;
			sumY += pts[j].y;
			count++;
		}
		out.push({ x: sumX / count, y: sumY / count });
	}
	return out;
}

/**
 * Determines if a segment is approximately horizontal.
 * Used by brush rendering to decide between straight-line and curve segments.
 */
export function isHorizontal(dx: number, dy: number, slopeMax: number): boolean {
	const d = Math.abs(dx) + 1e-6;
	return Math.abs(dy) <= slopeMax * d;
}

/**
 * Determines if a segment is approximately vertical.
 * Used by brush rendering to decide between straight-line and curve segments.
 */
export function isVertical(dx: number, dy: number, slopeMax: number): boolean {
	const d = Math.abs(dy) + 1e-6;
	return Math.abs(dx) <= slopeMax * d;
}

/**
 * Draws a Catmull-Rom spline through the given points using canvas bezier curves.
 * Used for smooth turn transitions in brush strokes.
 *
 * @param ctx - Canvas 2D context (must already be positioned at points[0])
 * @param points - Curve waypoints
 * @param tension - Spline tension (0.65 is a good default for natural curves)
 */
export function drawCurveThrough(
	ctx: CanvasRenderingContext2D,
	points: { x: number; y: number }[],
	tension: number
): void {
	if (points.length < 2) return;
	if (points.length === 2) {
		ctx.lineTo(points[1].x, points[1].y);
		return;
	}
	const n = points.length;
	for (let i = 1; i < n; i++) {
		const p0 = points[Math.max(0, i - 2)];
		const p1 = points[i - 1];
		const p2 = points[i];
		const p3 = points[Math.min(n - 1, i + 1)];
		const cp1x = p1.x + (p2.x - p0.x) * tension;
		const cp1y = p1.y + (p2.y - p0.y) * tension;
		const cp2x = p2.x - (p3.x - p1.x) * tension;
		const cp2y = p2.y - (p3.y - p1.y) * tension;
		ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
	}
}

/**
 * Renders a complete brush stroke on the canvas.
 * Automatically switches between straight segments and smooth curves at turns,
 * creating a natural "pen on paper" feel.
 *
 * @param ctx - Canvas context with stroke style already set
 * @param pts - Freehand path points
 */
export function strokeSmoothCurve(ctx: CanvasRenderingContext2D, pts: { x: number; y: number }[]): void {
	if (pts.length < 2) return;
	const radius = 4;
	const smoothed = pts.length > 5
		? smoothPoints(smoothPoints(pts, radius), radius)
		: pts.length > 3 ? smoothPoints(pts, radius) : pts;
	if (smoothed.length < 2) return;

	const slopeMax = 0.5;
	const n = smoothed.length;
	ctx.moveTo(smoothed[0].x, smoothed[0].y);

	if (n === 2) {
		ctx.lineTo(smoothed[1].x, smoothed[1].y);
		return;
	}

	let i = 1;
	while (i < n) {
		const dx = smoothed[i].x - smoothed[i - 1].x;
		const dy = smoothed[i].y - smoothed[i - 1].y;
		const straight = isHorizontal(dx, dy, slopeMax) || isVertical(dx, dy, slopeMax);
		if (straight) {
			ctx.lineTo(smoothed[i].x, smoothed[i].y);
			i++;
			continue;
		}
		let j = i;
		while (j < n - 1) {
			const ndx = smoothed[j + 1].x - smoothed[j].x;
			const ndy = smoothed[j + 1].y - smoothed[j].y;
			if (isHorizontal(ndx, ndy, slopeMax) || isVertical(ndx, ndy, slopeMax)) break;
			j++;
		}
		const turnPts = smoothed.slice(i - 1, j + 1);
		drawCurveThrough(ctx, turnPts, 0.65);
		i = j + 1;
	}
}

// ─── Canvas Drawing Primitives ──────────────────────────────────────────────

/**
 * Draws a rounded rectangle on the canvas with cross-browser support.
 * Falls back to manual quadraticCurveTo paths for browsers without ctx.roundRect.
 */
export function drawRoundedRect(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	width: number,
	height: number,
	radius: number
): void {
	if (ctx.roundRect) {
		ctx.roundRect(x, y, width, height, radius);
	} else {
		ctx.beginPath();
		ctx.moveTo(x + radius, y);
		ctx.lineTo(x + width - radius, y);
		ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
		ctx.lineTo(x + width, y + height - radius);
		ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
		ctx.lineTo(x + radius, y + height);
		ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
		ctx.lineTo(x, y + radius);
		ctx.quadraticCurveTo(x, y, x + radius, y);
		ctx.closePath();
	}
}

/** Rounded badge + white text (default blue; pass badgeFill for other accents e.g. green). */
export function drawBlueWhiteBadgeLabel(
	ctx: CanvasRenderingContext2D,
	text: string,
	centerX: number,
	centerY: number,
	options?: {
		font?: string;
		isHidden?: boolean;
		borderRadius?: number;
		textLineHeight?: number;
		padding?: number;
		/** Solid fill when visible (default `#2563eb`) */
		badgeFill?: string;
		/** Fill when drawing is hidden (default blue translucent) */
		badgeFillHidden?: string;
	}
): void {
	const font = options?.font ?? '12px system-ui, sans-serif';
	const isHidden = options?.isHidden ?? false;
	const borderRadius = options?.borderRadius ?? 6;
	const textLineHeight = options?.textLineHeight ?? 13;
	const padding = options?.padding ?? 5;
	const fillVisible = options?.badgeFill ?? '#2563eb';
	const fillHidden = options?.badgeFillHidden ?? 'rgba(37, 99, 235, 0.55)';
	ctx.save();
	ctx.font = font;
	const textWidth = ctx.measureText(text).width;
	const rectWidth = textWidth + padding * 2;
	const rectHeight = textLineHeight + padding * 2;
	const rectX = centerX - rectWidth / 2;
	const rectY = centerY - rectHeight / 2;
	ctx.fillStyle = isHidden ? fillHidden : fillVisible;
	ctx.beginPath();
	drawRoundedRect(ctx, rectX, rectY, rectWidth, rectHeight, borderRadius);
	ctx.fill();
	ctx.strokeStyle = '#ffffff';
	ctx.lineWidth = 1.5;
	ctx.beginPath();
	drawRoundedRect(ctx, rectX, rectY, rectWidth, rectHeight, borderRadius);
	ctx.stroke();
	ctx.fillStyle = '#ffffff';
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillText(text, centerX, centerY);
	ctx.restore();
}

// ─── Geometry & Hit-Testing ─────────────────────────────────────────────────

/**
 * Calculates the perpendicular distance from a point to a line segment.
 * Used for hit-testing hover/click proximity to lines, paths, and brush strokes.
 *
 * @returns Distance in pixels from the point to the nearest point on the segment
 */
export function pointToSegmentDistance(
	px: number, py: number,
	x1: number, y1: number,
	x2: number, y2: number
): number {
	const dx = x2 - x1, dy = y2 - y1;
	const lenSq = dx * dx + dy * dy;
	if (lenSq === 0) return Math.hypot(px - x1, py - y1);
	const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
	return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

/**
 * Tests whether a point falls inside an axis-aligned rectangle.
 * Handles coordinates in any order (min/max are computed internally).
 */
export function isPointInRect(
	px: number, py: number,
	x1: number, y1: number,
	x2: number, y2: number
): boolean {
	const minX = Math.min(x1, x2);
	const maxX = Math.max(x1, x2);
	const minY = Math.min(y1, y2);
	const maxY = Math.max(y1, y2);
	return px >= minX && px <= maxX && py >= minY && py <= maxY;
}

/**
 * Tests whether a screen coordinate is valid and finite.
 * Used to guard against null/NaN/Infinity values from chartToScreen conversions
 * (which can occur when chart points are off-screen).
 */
export function isValidScreenPoint(s: { x: number; y: number } | null): s is { x: number; y: number } {
	return s != null && Number.isFinite(s.x) && Number.isFinite(s.y);
}

/**
 * When a curve's control point is off-screen (chartToScreen returns null),
 * we extrapolate its screen position linearly from the known start/end points.
 * This allows curves to render and remain interactive even when deeply bent.
 *
 * @param s0 - Screen position of curve start
 * @param s2 - Screen position of curve end
 * @param p0 - Chart-space start point
 * @param p1 - Chart-space control point (the one we're extrapolating)
 * @param p2 - Chart-space end point
 */
export function extrapolateControlPoint(
	s0: { x: number; y: number },
	s2: { x: number; y: number },
	p0: { time: number; price: number },
	p1: { time: number; price: number },
	p2: { time: number; price: number }
): { x: number; y: number } {
	const timeSpan = (p2.time as number) - (p0.time as number);
	const priceSpan = p2.price - p0.price;
	return {
		x: timeSpan !== 0
			? s0.x + (s2.x - s0.x) * ((p1.time as number) - (p0.time as number)) / timeSpan
			: (s0.x + s2.x) / 2,
		y: priceSpan !== 0
			? s0.y + (s2.y - s0.y) * (p1.price - p0.price) / priceSpan
			: (s0.y + s2.y) / 2,
	};
}

// ─── Chart Interaction Helpers ──────────────────────────────────────────────

/**
 * Temporarily disables pointer events on the chart's internal canvas element.
 * This prevents lightweight-charts from receiving drag events while we're
 * handling drawing drag operations (which would otherwise cause chart panning).
 *
 * Call `enableChartPanning` to restore the original state.
 */
export function disableChartPanning(chart: any, container: HTMLElement): void {
	const chartContainer = chart?.chartElement?.parentElement || container;
	if (chartContainer) {
		const canvas = chartContainer.querySelector('canvas');
		if (canvas) {
			(canvas as any).__originalPointerEvents = canvas.style.pointerEvents;
			canvas.style.pointerEvents = 'none';
		}
	}
}

/**
 * Restores pointer events on the chart's internal canvas after a drag operation.
 * Safe to call even if disableChartPanning was never called.
 */
export function enableChartPanning(chart: any, container: HTMLElement): void {
	const chartContainer = chart?.chartElement?.parentElement || container;
	if (chartContainer) {
		const canvas = chartContainer.querySelector('canvas');
		if (canvas && (canvas as any).__originalPointerEvents !== undefined) {
			canvas.style.pointerEvents = (canvas as any).__originalPointerEvents || '';
			delete (canvas as any).__originalPointerEvents;
		}
	}
}
