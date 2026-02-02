import { useEffect, useRef } from 'react';
import { useDrawing, Drawing, ChartPoint } from './DrawingContext';
import { IChartApi, ISeriesApi, Time } from 'lightweight-charts';

interface DrawingOverlayProps {
	chart: IChartApi | null;
	series: ISeriesApi<'Candlestick'> | null;
	containerRef: React.RefObject<HTMLDivElement>;
}

export default function DrawingOverlay({ chart, series, containerRef }: DrawingOverlayProps) {
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const { drawings, currentDrawing, selectedHorizontalLineId, hoveredHorizontalLineId, hoveredHorizontalLineHandleId } = useDrawing();
	const drawingsRef = useRef<Drawing[]>([]);
	const currentDrawingRef = useRef<Drawing | null>(null);
	const selectedHorizontalLineIdRef = useRef<string | null>(null);
	const hoveredHorizontalLineIdRef = useRef<string | null>(null);
	const hoveredHorizontalLineHandleIdRef = useRef<string | null>(null);
	const scheduleRedrawRef = useRef<(() => void) | null>(null);

	useEffect(() => {
		drawingsRef.current = drawings;
		currentDrawingRef.current = currentDrawing;
		selectedHorizontalLineIdRef.current = selectedHorizontalLineId;
		hoveredHorizontalLineIdRef.current = hoveredHorizontalLineId;
		hoveredHorizontalLineHandleIdRef.current = hoveredHorizontalLineHandleId;
		// Trigger a repaint whenever drawings change (this is the main "make it draw" hook).
		scheduleRedrawRef.current?.();
	}, [drawings, currentDrawing, selectedHorizontalLineId, hoveredHorizontalLineId, hoveredHorizontalLineHandleId]);

	useEffect(() => {
		if (!canvasRef.current || !containerRef.current) return;

		const canvas = canvasRef.current;
		const container = containerRef.current;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		let rafId: number | null = null;
		const scheduleRedraw = () => {
			if (rafId != null) return;
			rafId = window.requestAnimationFrame(() => {
				rafId = null;
				redraw();
			});
		};
		scheduleRedrawRef.current = scheduleRedraw;

		// Set canvas size to match container
		const resizeCanvas = () => {
			const rect = container.getBoundingClientRect();
			const dpr = window.devicePixelRatio || 1;
			canvas.style.width = `${rect.width}px`;
			canvas.style.height = `${rect.height}px`;
			canvas.width = Math.round(rect.width * dpr);
			canvas.height = Math.round(rect.height * dpr);
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
			scheduleRedraw();
		};

		// Convert chart coordinates to screen coordinates (only for chart-space drawings)
		const chartToScreen = (point: ChartPoint): { x: number; y: number } | null => {
			try {
				if (!chart || !series) return null;
				const x = chart.timeScale().timeToCoordinate(point.time as Time);
				if (x === null) return null;

				// Reference approach: use series to convert price -> y coordinate
				const y = series.priceToCoordinate(point.price);
				if (y == null) return null;
				
				return { x, y };
			} catch (e) {
				console.error('Error converting chart to screen:', e);
				return null;
			}
		};

		// Redraw all drawings
		const redraw = () => {
			ctx.clearRect(0, 0, canvas.width, canvas.height);

			// Draw completed drawings
			drawingsRef.current.forEach((drawing) => {
				if (drawing.hidden) return;
				drawDrawing(ctx, drawing, container, chartToScreen);
			});

			// Draw current drawing in progress
			if (currentDrawingRef.current) {
				if (!currentDrawingRef.current.hidden) {
				drawDrawing(ctx, currentDrawingRef.current, container, chartToScreen);
				}
			}
		};

		resizeCanvas();

		// Subscribe to chart events for responsive updates (when chart exists).
		const timeScale = chart ? chart.timeScale() : null;
		const onVisibleTimeRangeChange = () => scheduleRedraw();
		if (chart && timeScale) {
			timeScale.subscribeVisibleTimeRangeChange(onVisibleTimeRangeChange);
		}

		// Price scale changes (vertical zoom) – use reference pattern (optional API).
		const ps: any = series ? series.priceScale() : null;
		const onVisiblePriceRangeChange = () => scheduleRedraw();
		if (ps && typeof ps.subscribeVisiblePriceRangeChange === 'function') {
			ps.subscribeVisiblePriceRangeChange(onVisiblePriceRangeChange);
		}

		// Wheel zoom / scale drag should also trigger redraw.
		const onWheel = () => scheduleRedraw();
		container.addEventListener('wheel', onWheel, { passive: true });

		// Dragging/panning often doesn't emit wheel; redraw while pointer is down.
		let isPointerDown = false;
		const onPointerDown = () => {
			isPointerDown = true;
			scheduleRedraw();
		};
		const onPointerMove = () => {
			if (isPointerDown) scheduleRedraw();
		};
		const onPointerUp = () => {
			isPointerDown = false;
			scheduleRedraw();
		};
		container.addEventListener('pointerdown', onPointerDown);
		container.addEventListener('pointermove', onPointerMove);
		container.addEventListener('pointerup', onPointerUp);
		container.addEventListener('pointerleave', onPointerUp);

		window.addEventListener('resize', resizeCanvas);

		return () => {
			window.removeEventListener('resize', resizeCanvas);
			container.removeEventListener('wheel', onWheel);
			container.removeEventListener('pointerdown', onPointerDown);
			container.removeEventListener('pointermove', onPointerMove);
			container.removeEventListener('pointerup', onPointerUp);
			container.removeEventListener('pointerleave', onPointerUp);
			if (chart && timeScale) {
				timeScale.unsubscribeVisibleTimeRangeChange(onVisibleTimeRangeChange);
			}
			if (ps && typeof ps.unsubscribeVisiblePriceRangeChange === 'function') {
				ps.unsubscribeVisiblePriceRangeChange(onVisiblePriceRangeChange);
			}
			if (rafId != null) {
				window.cancelAnimationFrame(rafId);
				rafId = null;
			}
			if (scheduleRedrawRef.current === scheduleRedraw) {
				scheduleRedrawRef.current = null;
			}
		};
	}, [chart, series, containerRef]);

	// Helper function to draw rounded rectangle (for browser compatibility)
	const drawRoundedRect = (
		ctx: CanvasRenderingContext2D,
		x: number,
		y: number,
		width: number,
		height: number,
		radius: number
	) => {
		if (ctx.roundRect) {
			ctx.roundRect(x, y, width, height, radius);
		} else {
			// Fallback for browsers without roundRect support
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
	};

	const drawDrawing = (
		ctx: CanvasRenderingContext2D,
		drawing: Drawing,
		container: HTMLDivElement,
		chartToScreen: (point: ChartPoint) => { x: number; y: number } | null
	) => {
		// Compute drawable plot width (exclude right price scale if present)
		const rightScaleWidth =
			chart && typeof (chart.priceScale('right') as any)?.width === 'function'
				? Number((chart.priceScale('right') as any).width())
				: 0;
		const plotWidth = Math.max(0, Math.floor(container.getBoundingClientRect().width - rightScaleWidth));

		// MVP: screen-space drawing (works immediately, no chart mapping)
		if (drawing.screenPoints && drawing.screenPoints.length >= 1) {
			const pts = drawing.screenPoints;
			ctx.save();
			// Clip so we don’t draw over the axis area
			ctx.beginPath();
			ctx.rect(0, 0, plotWidth || container.getBoundingClientRect().width, container.getBoundingClientRect().height);
			ctx.clip();

			ctx.strokeStyle = drawing.style?.color || '#3b82f6';
			ctx.lineWidth = drawing.style?.width || 3;
			ctx.lineCap = 'round';
			ctx.lineJoin = 'round';

			// If it's a "line" tool for now: just draw segment start->end
			const start = pts[0];
			// Lines tool: show first bubble immediately on click (even before drag)
			if (drawing.type === 'lines' && pts.length === 1) {
				const r = 5;
				ctx.save();
				ctx.lineWidth = Math.max(1.5, (drawing.style?.width || 3) * 0.6);
				ctx.strokeStyle = drawing.style?.color || '#3b82f6';
				ctx.fillStyle = '#ffffff';
				ctx.beginPath();
				ctx.arc(start.x, start.y, r, 0, 2 * Math.PI);
				ctx.fill();
				ctx.stroke();
				ctx.restore();
				ctx.restore();
				return;
			}

			const end = pts[pts.length - 1];
			// Horizontal line tool: stretch across full width but stop before square
			if (drawing.type === 'horizontal-line') {
				ctx.beginPath();
				ctx.moveTo(start.x, start.y);
				const lineY = start.y;
				const containerWidth = plotWidth || container.getBoundingClientRect().width;
				
				// Only show square when hovered OR selected
				const shouldShowSquare =
					selectedHorizontalLineIdRef.current === drawing.id ||
					hoveredHorizontalLineIdRef.current === drawing.id;

				// Square dimensions (slightly smaller)
				const squareSize = 11;
				const squareX = containerWidth - squareSize - 28; // move further left (avoid y-axis collision)
				const squareY = lineY - squareSize / 2; // Center vertically on the line
				const borderRadius = 3;

				// Draw line:
				// - If square is visible: draw two segments so the line doesn't appear inside the hollow square
				// - Otherwise: draw full width to the axis
				ctx.beginPath();
				ctx.moveTo(0, lineY);
				if (shouldShowSquare) {
					ctx.lineTo(squareX, lineY);
					ctx.moveTo(squareX + squareSize, lineY);
					ctx.lineTo(containerWidth, lineY);
				} else {
					ctx.lineTo(containerWidth, lineY);
				}
				ctx.stroke();

				// Draw hollow rounded corner square on the right border (only if hovered/selected)
				if (shouldShowSquare) {
					const isHandleHovered = hoveredHorizontalLineHandleIdRef.current === drawing.id;
					ctx.save();
					ctx.strokeStyle = drawing.style?.color || '#3b82f6';
					ctx.lineWidth = 1.5;
					if (isHandleHovered) {
						ctx.shadowColor = 'rgba(59, 130, 246, 0.9)';
						ctx.shadowBlur = 8;
					}
					// Important: start a new path so we don't re-stroke the line with shadow
					ctx.beginPath();
					drawRoundedRect(ctx, squareX, squareY, squareSize, squareSize, borderRadius);
					ctx.stroke();
					ctx.restore();
				}
			} else if (drawing.type === 'lines') {
				// Segment tool: draw only between the two bubbles (no extension)
				ctx.beginPath();
				ctx.moveTo(start.x, start.y);
				ctx.lineTo(end.x, end.y);
				ctx.stroke();

				// Draw hollow bubbles at both ends (start and end)
				const r = 5;
				ctx.save();
				ctx.lineWidth = Math.max(1.5, (drawing.style?.width || 3) * 0.6);
				ctx.strokeStyle = drawing.style?.color || '#3b82f6';
				ctx.fillStyle = '#ffffff';

				ctx.beginPath();
				ctx.arc(start.x, start.y, r, 0, 2 * Math.PI);
				ctx.fill();
				ctx.stroke();

				ctx.beginPath();
				ctx.arc(end.x, end.y, r, 0, 2 * Math.PI);
				ctx.fill();
				ctx.stroke();

				ctx.restore();
			} else {
				// Fallback: segment
				ctx.beginPath();
				ctx.moveTo(start.x, start.y);
				ctx.lineTo(end.x, end.y);
				ctx.stroke();
			}

			ctx.restore();
			return;
		}

		// Chart-space horizontal line: anchored by price, independent of time
		if (drawing.type === 'horizontal-line' && drawing.points && drawing.points.length >= 1) {
			const price = drawing.points[0].price;
			const y = series ? series.priceToCoordinate(price) : null;
			if (y == null) return;

			ctx.save();
			ctx.beginPath();
			ctx.rect(0, 0, plotWidth || container.getBoundingClientRect().width, container.getBoundingClientRect().height);
			ctx.clip();
			ctx.strokeStyle = drawing.style?.color || '#3b82f6';
			ctx.lineWidth = drawing.style?.width || 2;
			ctx.lineCap = 'round';
			
			const containerWidth = plotWidth || container.getBoundingClientRect().width;

			// Only show square when hovered OR selected
			const shouldShowSquare =
				selectedHorizontalLineIdRef.current === drawing.id ||
				hoveredHorizontalLineIdRef.current === drawing.id;
			
			// Square dimensions (slightly smaller)
			const squareSize = 11;
			const squareX = containerWidth - squareSize - 28; // move further left (avoid y-axis collision)
			const squareY = y - squareSize / 2; // Center vertically on the line
			const borderRadius = 3;

			// Draw line:
			// - If square is visible: draw two segments so the line doesn't appear inside the hollow square
			// - Otherwise: draw full width to the axis
			ctx.beginPath();
			ctx.moveTo(0, y);
			if (shouldShowSquare) {
				ctx.lineTo(squareX, y);
				ctx.moveTo(squareX + squareSize, y);
				ctx.lineTo(containerWidth, y);
			} else {
				ctx.lineTo(containerWidth, y);
			}
			ctx.stroke();

			// Draw hollow rounded corner square on the right border (only if hovered/selected)
			if (shouldShowSquare) {
				const isHandleHovered = hoveredHorizontalLineHandleIdRef.current === drawing.id;
				ctx.save();
				ctx.strokeStyle = drawing.style?.color || '#3b82f6';
				ctx.lineWidth = 1.5;
				if (isHandleHovered) {
					ctx.shadowColor = 'rgba(59, 130, 246, 0.9)';
					ctx.shadowBlur = 8;
				}
				// Important: start a new path so we don't re-stroke the line with shadow
				ctx.beginPath();
				drawRoundedRect(ctx, squareX, squareY, squareSize, squareSize, borderRadius);
				ctx.stroke();
				ctx.restore();
			}

			ctx.restore();
			return;
		}

		// Chart-space Lines tool: show first bubble immediately (before second click)
		if (drawing.type === 'lines' && drawing.points && drawing.points.length === 1) {
			const p = chartToScreen(drawing.points[0]);
			if (!p) return;
			ctx.save();
			ctx.fillStyle = '#ffffff';
			ctx.strokeStyle = drawing.style?.color || '#3b82f6';
			ctx.lineWidth = Math.max(1.5, (drawing.style?.width || 3) * 0.6);
			ctx.beginPath();
			ctx.arc(p.x, p.y, 5, 0, 2 * Math.PI);
			ctx.fill();
			ctx.stroke();
			ctx.restore();
			return;
		}

		if (!drawing.points || drawing.points.length < 2) return;

		// Convert chart coordinates to screen coordinates
		const screenPoints = drawing.points
			.map(chartToScreen)
			.filter((p): p is { x: number; y: number } => p !== null);

		if (screenPoints.length < 2) return;

		ctx.save();
		ctx.strokeStyle = drawing.style?.color || '#3b82f6';
		const lineWidth = drawing.type === 'lines' ? (drawing.style?.width || 3) : (drawing.style?.width || 2);
		ctx.lineWidth = lineWidth;
		ctx.lineCap = 'round';
		ctx.lineJoin = 'round';

		// Generalized drawing renderer - works for different drawing types
		if (drawing.type === 'lines' && screenPoints.length >= 2) {
			const start = screenPoints[0];
			const end = screenPoints[screenPoints.length - 1];

			// Segment-only renderer (chart-space): bubble -> bubble, no extension
			const plotW = plotWidth || container.getBoundingClientRect().width;
			ctx.save();
			ctx.beginPath();
			ctx.rect(0, 0, plotW, container.getBoundingClientRect().height);
			ctx.clip();

			ctx.beginPath();
			ctx.moveTo(start.x, start.y);
			ctx.lineTo(end.x, end.y);
			ctx.stroke();

			const r = 5;
			ctx.fillStyle = '#ffffff';
			ctx.strokeStyle = drawing.style?.color || '#3b82f6';
			ctx.lineWidth = Math.max(1.5, (drawing.style?.width || 3) * 0.6);

			ctx.beginPath();
			ctx.arc(start.x, start.y, r, 0, 2 * Math.PI);
			ctx.fill();
			ctx.stroke();

			ctx.beginPath();
			ctx.arc(end.x, end.y, r, 0, 2 * Math.PI);
			ctx.fill();
			ctx.stroke();

			ctx.restore();
			ctx.restore();
			return;

			// Calculate direction vector
			const dx = end.x - start.x;
			const dy = end.y - start.y;
			const length = Math.sqrt(dx * dx + dy * dy);

			if (length > 0) {
				const unitX = dx / length;
				const unitY = dy / length;

				// Extend line to canvas edges
				const rect = container.getBoundingClientRect();
				let extendX = unitX * rect.width * 2;
				let extendY = unitY * rect.height * 2;

				// Find intersection with canvas edges
				let finalX = end.x + extendX;
				let finalY = end.y + extendY;

				// Clamp to canvas bounds
				if (finalX < 0) {
					finalY = start.y + (start.y - end.y) * (start.x / (start.x - end.x));
					finalX = 0;
				} else if (finalX > rect.width) {
					finalY = start.y + (start.y - end.y) * ((rect.width - start.x) / (end.x - start.x));
					finalX = rect.width;
				}

				if (finalY < 0) {
					finalX = start.x + (start.x - end.x) * (start.y / (start.y - end.y));
					finalY = 0;
				} else if (finalY > rect.height) {
					finalX = start.x + (start.x - end.x) * ((rect.height - start.y) / (end.y - start.y));
					finalY = rect.height;
				}

				// Draw the ray
				ctx.beginPath();
				ctx.moveTo(start.x, start.y);
				ctx.lineTo(finalX, finalY);
				ctx.stroke();

				// Draw dots at both ends
				ctx.fillStyle = drawing.style?.color || '#3b82f6';
				ctx.beginPath();
				ctx.arc(start.x, start.y, 6, 0, 2 * Math.PI);
				ctx.fill();

				ctx.beginPath();
				ctx.arc(end.x, end.y, 6, 0, 2 * Math.PI);
				ctx.fill();
			}
		}
		// Future drawing types can be added here with their own rendering logic
		// else if (drawing.type === 'rectangle' && screenPoints.length >= 2) { ... }
		// else if (drawing.type === 'fib' && screenPoints.length >= 2) { ... }

		ctx.restore();
	};

	return (
		<canvas
			ref={canvasRef}
			className="absolute inset-0 pointer-events-none z-40"
			style={{ 
				position: 'absolute', 
				top: 0, 
				left: 0, 
				width: '100%', 
				height: '100%',
				pointerEvents: 'none'
			}}
		/>
	);
}
