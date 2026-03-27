/**
 * =============================================================================
 * DRAWING OVERLAY — Canvas-based rendering layer for all chart drawings
 * =============================================================================
 *
 * This component renders an HTML5 canvas overlay on top of the lightweight-charts
 * instance. It draws all visual elements that aren't handled by the underlay
 * primitive (DrawingsUnderlayPrimitive.ts), including:
 *
 *   - Drawing handles (bubbles, squares) for selection and repositioning
 *   - Labels, text annotations, and info boxes
 *   - In-progress drawing previews (current tool placement)
 *   - Shapes: brush strokes, arrows, emoji boxes, circles, paths, curves
 *   - Zoom selection rectangle
 *
 * The overlay redraws on every animation frame when drawings change, the chart
 * is panned/zoomed, or pointer events occur. It uses requestAnimationFrame for
 * smooth, jank-free rendering.
 *
 * Architecture:
 *   - chartToScreen() converts chart-space (time, price) to screen pixels
 *   - drawDrawing() dispatches to type-specific rendering based on drawing.type
 *   - The canvas sits above the chart with pointer-events: none
 *   - All interaction (hover, click, drag) is handled by CandlestickChart.tsx
 */

import { useEffect, useRef } from 'react';
import { useDrawing } from './DrawingContext';
import type { Drawing, ChartPoint, CandleBar } from '../types/drawing';
import { IChartApi, ISeriesApi, Time } from 'lightweight-charts';
import {
	GANN_FRACTIONS,
	gannCellColor,
	gannLabelColor,
	gannBorderColor,
	strokeSmoothCurve,
	drawRoundedRect,
	drawBlueWhiteBadgeLabel,
} from '../utils/drawingHelpers';
import { TEXT_ANNOTATION_FONT, TEXT_PAD_PX, textBoxWidthPx } from '../utils/textAnnotation';
import { isPatternTool, getPatternConfig } from '../utils/patternTools';
import { TOOL_DOTTED_LINE_DASH } from '../utils/drawingLineStyle';

export type { CandleBar } from '../types/drawing';

export interface DrawingOverlayProps {
	chart: IChartApi | null;
	series: ISeriesApi<'Candlestick'> | null;
	containerRef: React.RefObject<HTMLDivElement>;
	/** When true, RR box and parallel channel are drawn by a series primitive (above grid, behind candles); overlay only draws handles/labels */
	underlayIsPrimitive?: boolean;
	candlestickDataRef?: React.RefObject<Array<{ time: number; open: number; high: number; low: number; close: number; volume?: number }>>;
	candlestickDataVersion?: number;
	/** Price-range: in-progress drawing id for smooth live preview */
	priceRangeInProgressIdRef?: React.RefObject<string | null>;
	priceRangeLiveEndPriceRef?: React.RefObject<number | null>;
	priceRangeLiveEndTimeRef?: React.RefObject<number | null>;
	priceRangeLiveTick?: number;
	/** Date-range: in-progress drawing id for smooth live preview */
	dateRangeInProgressIdRef?: React.RefObject<string | null>;
	dateRangeLiveEndTimeRef?: React.RefObject<number | null>;
	dateRangeLiveEndPriceRef?: React.RefObject<number | null>;
	dateRangeLiveTick?: number;
	/** Date and price range (combined): in-progress drawing id for smooth live preview */
	datePriceRangeInProgressIdRef?: React.RefObject<string | null>;
	datePriceRangeLiveEndTimeRef?: React.RefObject<number | null>;
	datePriceRangeLiveEndPriceRef?: React.RefObject<number | null>;
	datePriceRangeLiveTick?: number;
	/** Rectangle: in-progress drawing id for live preview (click then drag) */
	rectangleInProgressIdRef?: React.RefObject<string | null>;
	rectangleLiveTick?: number;
	/** Path: in-progress drawing id + live end for arrow preview */
	pathInProgressIdRef?: React.RefObject<string | null>;
	pathLiveEndTimeRef?: React.RefObject<number | null>;
	pathLiveEndPriceRef?: React.RefObject<number | null>;
	pathLiveTick?: number;
	/** Circle: in-progress drawing id + live radius point for preview */
	circleInProgressIdRef?: React.RefObject<string | null>;
	circleLiveEndTimeRef?: React.RefObject<number | null>;
	circleLiveEndPriceRef?: React.RefObject<number | null>;
	circleLiveTick?: number;
	/** Fibonacci Retracement: in-progress drawing id + live end for preview */
	fibRetracementInProgressIdRef?: React.RefObject<string | null>;
	fibRetracementLiveEndTimeRef?: React.RefObject<number | null>;
	fibRetracementLiveEndPriceRef?: React.RefObject<number | null>;
	fibRetracementLiveTick?: number;
	/** Gann box: in-progress drawing id for live preview */
	gannBoxInProgressIdRef?: React.RefObject<string | null>;
	gannBoxLiveTick?: number;
	/** Multi-point pattern tools: in-progress + live end for preview */
	patternInProgressIdRef?: React.RefObject<string | null>;
	patternLiveEndTimeRef?: React.RefObject<number | null>;
	patternLiveEndPriceRef?: React.RefObject<number | null>;
	patternLiveTick?: number;
	/** Zoom tool: drag rect (start/end in container pixels) for live preview */
	zoomRectStartRef?: React.RefObject<{ x: number; y: number } | null>;
	zoomRectEndRef?: React.RefObject<{ x: number; y: number } | null>;
	zoomLiveTick?: number;
	/** Text tool: while this drawing id is being edited, canvas skips painting that box (inline input in CandlestickChart) */
	editingTextDrawingId?: string | null;
}

export default function DrawingOverlay({ chart, series, containerRef, underlayIsPrimitive = false, candlestickDataRef, candlestickDataVersion = 0, priceRangeInProgressIdRef, priceRangeLiveEndPriceRef, priceRangeLiveEndTimeRef, priceRangeLiveTick = 0, dateRangeInProgressIdRef, dateRangeLiveEndTimeRef, dateRangeLiveEndPriceRef, dateRangeLiveTick = 0, datePriceRangeInProgressIdRef, datePriceRangeLiveEndTimeRef, datePriceRangeLiveEndPriceRef, datePriceRangeLiveTick = 0, rectangleInProgressIdRef, rectangleLiveTick = 0, pathInProgressIdRef, pathLiveEndTimeRef, pathLiveEndPriceRef, pathLiveTick = 0, circleInProgressIdRef, circleLiveEndTimeRef, circleLiveEndPriceRef, circleLiveTick = 0, fibRetracementInProgressIdRef, fibRetracementLiveEndTimeRef, fibRetracementLiveEndPriceRef, fibRetracementLiveTick = 0, gannBoxInProgressIdRef, gannBoxLiveTick = 0, patternInProgressIdRef, patternLiveEndTimeRef, patternLiveEndPriceRef, patternLiveTick = 0, zoomRectStartRef, zoomRectEndRef, zoomLiveTick = 0, editingTextDrawingId = null }: DrawingOverlayProps) {
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const { drawings, currentDrawing, selectedHorizontalLineId, hoveredHorizontalLineId, hoveredHorizontalLineHandleId, selectedHorizontalRayId, hoveredHorizontalRayId, hoveredHorizontalRayHandleId, selectedLineId, hoveredLineId, hoveredLineHandleId, updateDrawing } = useDrawing();
	const drawingsRef = useRef<Drawing[]>([]);
	const currentDrawingRef = useRef<Drawing | null>(null);
	const selectedHorizontalLineIdRef = useRef<string | null>(null);
	const hoveredHorizontalLineIdRef = useRef<string | null>(null);
	const hoveredHorizontalLineHandleIdRef = useRef<string | null>(null);
	const selectedHorizontalRayIdRef = useRef<string | null>(null);
	const hoveredHorizontalRayIdRef = useRef<string | null>(null);
	const hoveredHorizontalRayHandleIdRef = useRef<string | null>(null);
	const selectedLineIdRef = useRef<string | null>(null);
	const hoveredLineIdRef = useRef<string | null>(null);
	const hoveredLineHandleIdRef = useRef<string | null>(null);
	const scheduleRedrawRef = useRef<(() => void) | null>(null);
	const updateDrawingRef = useRef(updateDrawing);
	
	useEffect(() => {
		updateDrawingRef.current = updateDrawing;
	}, [updateDrawing]);

	useEffect(() => {
		drawingsRef.current = drawings;
		currentDrawingRef.current = currentDrawing;
		selectedHorizontalLineIdRef.current = selectedHorizontalLineId;
		hoveredHorizontalLineIdRef.current = hoveredHorizontalLineId;
		hoveredHorizontalLineHandleIdRef.current = hoveredHorizontalLineHandleId;
		selectedHorizontalRayIdRef.current = selectedHorizontalRayId;
		hoveredHorizontalRayIdRef.current = hoveredHorizontalRayId;
		hoveredHorizontalRayHandleIdRef.current = hoveredHorizontalRayHandleId;
		selectedLineIdRef.current = selectedLineId;
		hoveredLineIdRef.current = hoveredLineId;
		hoveredLineHandleIdRef.current = hoveredLineHandleId;
		// Trigger a repaint whenever drawings or candle data change (for RR outcome dotted line).
		// priceRangeLiveTick drives smooth price-range live preview.
		scheduleRedrawRef.current?.();
	}, [drawings, currentDrawing, selectedHorizontalLineId, hoveredHorizontalLineId, hoveredHorizontalLineHandleId, selectedHorizontalRayId, hoveredHorizontalRayId, hoveredHorizontalRayHandleId, selectedLineId, hoveredLineId, hoveredLineHandleId, candlestickDataVersion, priceRangeLiveTick, dateRangeLiveTick, datePriceRangeLiveTick, rectangleLiveTick, pathLiveTick, circleLiveTick, fibRetracementLiveTick, gannBoxLiveTick, patternLiveTick, zoomLiveTick]);

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

		// Redraw all drawings (underlay drawn by series primitive when underlayIsPrimitive; overlay draws handles/labels)
		const redraw = () => {
			ctx.clearRect(0, 0, canvas.width, canvas.height);

			drawingsRef.current.forEach((drawing) => {
				if (drawing.hidden) return;
				drawDrawing(ctx, drawing, container, chartToScreen, 'overlay');
			});

			if (currentDrawingRef.current) {
				if (!currentDrawingRef.current.hidden) {
					drawDrawing(ctx, currentDrawingRef.current, container, chartToScreen, 'overlay');
				}
			}

			// Zoom tool: draw selection rectangle while dragging
			const zStart = zoomRectStartRef?.current;
			const zEnd = zoomRectEndRef?.current;
			if (zStart && zEnd) {
				const minX = Math.min(zStart.x, zEnd.x);
				const maxX = Math.max(zStart.x, zEnd.x);
				const minY = Math.min(zStart.y, zEnd.y);
				const maxY = Math.max(zStart.y, zEnd.y);
				ctx.save();
				ctx.fillStyle = 'rgba(59, 130, 246, 0.12)';
				ctx.fillRect(minX, minY, maxX - minX, maxY - minY);
				ctx.strokeStyle = 'rgba(59, 130, 246, 0.6)';
				ctx.lineWidth = 1.5;
				ctx.strokeRect(minX, minY, maxX - minX, maxY - minY);
				ctx.restore();
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
	}, [chart, series, containerRef, editingTextDrawingId]);

	const drawDrawing = (
		ctx: CanvasRenderingContext2D,
		drawing: Drawing,
		container: HTMLDivElement,
		chartToScreen: (point: ChartPoint) => { x: number; y: number } | null,
		drawLayer: 'overlay' | 'underlay' = 'overlay'
	) => {
		// Compute drawable plot width (exclude right price scale if present)
		const rightScaleWidth =
			chart && typeof (chart.priceScale('right') as any)?.width === 'function'
				? Number((chart.priceScale('right') as any).width())
				: 0;
		const plotWidth = Math.max(0, Math.floor(container.getBoundingClientRect().width - rightScaleWidth));

		/** Draws a white handle circle at the given position. */
		const drawHandle = (hx: number, hy: number, r = 5, fill = '#ffffff', stroke = '#000000') => {
			ctx.fillStyle = fill;
			ctx.strokeStyle = stroke;
			ctx.lineWidth = 1.5;
			ctx.beginPath();
			ctx.arc(hx, hy, r, 0, 2 * Math.PI);
			ctx.fill();
			ctx.stroke();
		};

		/** Draws a white rounded info block with centered text lines. */
		const drawInfoBlock = (cx: number, top: number, lines: string[], pad = 6, radius = 4) => {
			ctx.font = '12px sans-serif';
			const lineH = 14;
			const maxW = Math.max(...lines.map(l => ctx.measureText(l).width));
			const bw = maxW + pad * 2;
			const bh = lineH * lines.length + pad * 2;
			const bx = cx - bw / 2;
			ctx.fillStyle = '#ffffff';
			ctx.strokeStyle = 'rgba(0,0,0,0.2)';
			ctx.lineWidth = 1;
			ctx.beginPath();
			drawRoundedRect(ctx, bx, top, bw, bh, radius);
			ctx.fill();
			ctx.stroke();
			ctx.fillStyle = '#1e293b';
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			lines.forEach((line, i) => {
				ctx.fillText(line, cx, top + pad + lineH * (i + 0.5));
			});
		};

		/** Whether this drawing's handles should currently be visible. */
		const isInteractive = selectedLineIdRef.current === drawing.id || hoveredLineIdRef.current === drawing.id;

		// ============================================================================
		// LONG / SHORT POSITION (RR BOX) RENDERING
		// ============================================================================
		if ((drawing.type === 'long-position' || drawing.type === 'short-position') && drawing.entryPrice != null && drawing.stopLoss != null && drawing.takeProfit != null && drawing.startTime != null && drawing.endTime != null) {
			const isShort = drawing.type === 'short-position';
			ctx.save();
			if (!chart || !series) {
				ctx.restore();
				return;
			}

			const isHidden = drawing.hidden || false;
			const ts = chart.timeScale();

			// Convert chart coordinates to screen; if time is outside visible range, use proportional width so box doesn't span to last future timestamp
			let startX = ts.timeToCoordinate(drawing.startTime as any);
			let endX = ts.timeToCoordinate(drawing.endTime as any);
			const visible = ts.getVisibleRange();
			if (visible && typeof visible.from === 'number' && typeof visible.to === 'number') {
				const leftX = ts.timeToCoordinate(visible.from as any);
				const rightX = ts.timeToCoordinate(visible.to as any);
				const visibleTimeSpan = visible.to - visible.from;
				const visiblePixelSpan = (rightX != null && leftX != null) ? rightX - leftX : 0;
				if (visibleTimeSpan > 0 && visiblePixelSpan > 0) {
					// Keep intended time width in pixels when a coordinate is null
					const timeWidth = drawing.endTime - drawing.startTime;
					if (startX == null) startX = leftX;
					if (endX == null) {
						const base = startX ?? leftX;
						endX = (base != null ? Number(base) + (timeWidth / visibleTimeSpan) * visiblePixelSpan : rightX) as any;
					}
				} else if (startX == null || endX == null) {
					if (startX == null) startX = leftX;
					if (endX == null) endX = rightX;
				}
			}
			const entryY = series.priceToCoordinate(drawing.entryPrice);
			const stopLossY = series.priceToCoordinate(drawing.stopLoss);
			const takeProfitY = series.priceToCoordinate(drawing.takeProfit);

			if (startX == null || endX == null || entryY == null || stopLossY == null || takeProfitY == null) {
				ctx.restore();
				return;
			}

			const boxX = Math.min(startX, endX);
			const boxWidth = Math.abs(endX - startX);

			// Clip to plot area
			ctx.beginPath();
			ctx.rect(0, 0, plotWidth || container.getBoundingClientRect().width, container.getBoundingClientRect().height);
			ctx.clip();

			// Outcome for dotted line (used on underlay; outcome vars needed for underlay-only path)
			const bars = candlestickDataRef?.current ?? [];
			const startTime = drawing.startTime;
			const endTime = drawing.endTime;
			const entryPrice = drawing.entryPrice;
			const takeProfit = drawing.takeProfit;
			const stopLoss = drawing.stopLoss;
			const barsInRange = bars
				.filter((b) => (b.time as number) >= startTime && (b.time as number) <= endTime)
				.sort((a, b) => (a.time as number) - (b.time as number));
			// First bar that breaches the middle (entry) line: candle range crosses entry price
			const firstBreachBar = barsInRange.find((b) => b.low <= entryPrice && b.high >= entryPrice);
			const dotStartTime = firstBreachBar != null ? (firstBreachBar.time as number) : startTime;
			const dotStartX = ts.timeToCoordinate(dotStartTime as any);
			const dotStartY = entryY;

			// Only consider bars at or after the breach (dotted line always left-to-right: exits after entry)
			const barsAfterBreach = barsInRange.filter((b) => (b.time as number) >= dotStartTime);

			let outcomeEndTime: number = endTime;
			let outcomeEndPrice: number = entryPrice;
			for (const bar of barsAfterBreach) {
				const t = bar.time as number;
				const high = bar.high;
				const low = bar.low;
				// Long: TP above entry (high >= TP), SL below (low <= SL). Short: TP below (low <= TP), SL above (high >= SL).
				const hitTP = isShort ? low <= takeProfit : high >= takeProfit;
				const hitSL = isShort ? high >= stopLoss : low <= stopLoss;
				if (hitTP && hitSL) {
					const outcome = bar.close > bar.open ? 'tp' : 'sl';
					outcomeEndTime = t;
					outcomeEndPrice = outcome === 'tp' ? takeProfit : stopLoss;
					break;
				}
				if (hitTP) {
					outcomeEndTime = t;
					outcomeEndPrice = takeProfit;
					break;
				}
				if (hitSL) {
					outcomeEndTime = t;
					outcomeEndPrice = stopLoss;
					break;
				}
			}
			if (barsAfterBreach.length > 0 && outcomeEndTime === endTime && outcomeEndPrice === entryPrice) {
				const lastBar = barsAfterBreach[barsAfterBreach.length - 1];
				outcomeEndTime = lastBar.time as number;
				outcomeEndPrice = lastBar.close;
			}
			const dotEndX = ts.timeToCoordinate(outcomeEndTime as any);
			const dotEndY = series.priceToCoordinate(outcomeEndPrice);
			const hasBreach = firstBreachBar != null;

			const riskTop = Math.min(entryY, stopLossY);
			const riskBottom = Math.max(entryY, stopLossY);
			const rewardTop = Math.min(entryY, takeProfitY);
			const rewardBottom = Math.max(entryY, takeProfitY);

			// Underlay: draw full RR box (fills + black line + dotted line) behind candles
			if (drawLayer === 'underlay') {
				ctx.save();
				ctx.fillStyle = isHidden ? 'rgba(239, 68, 68, 0.1)' : 'rgba(239, 68, 68, 0.2)';
				ctx.fillRect(boxX, riskTop, boxWidth, riskBottom - riskTop);
				ctx.restore();
				ctx.save();
				ctx.fillStyle = isHidden ? 'rgba(34, 197, 94, 0.1)' : 'rgba(34, 197, 94, 0.2)';
				ctx.fillRect(boxX, rewardTop, boxWidth, rewardBottom - rewardTop);
				ctx.restore();
				ctx.save();
				ctx.strokeStyle = isHidden ? 'rgba(0, 0, 0, 0.5)' : '#000000';
				ctx.lineWidth = 0.35;
				ctx.beginPath();
				ctx.moveTo(boxX, entryY);
				ctx.lineTo(boxX + boxWidth, entryY);
				ctx.stroke();
				ctx.restore();
				if (hasBreach && dotEndX != null && dotEndY != null) {
					const dotStartXVal = dotStartX != null ? dotStartX : boxX;
					// Darkened rectangle from first breach of middle line to outcome point (dotted line endpoints)
					ctx.save();
					const rectLeft = Math.min(dotStartXVal, dotEndX);
					const rectRight = Math.max(dotStartXVal, dotEndX);
					const rectTop = Math.min(dotStartY, dotEndY);
					const rectBottom = Math.max(dotStartY, dotEndY);
					ctx.fillStyle = isHidden ? 'rgba(0, 0, 0, 0.04)' : 'rgba(0, 0, 0, 0.07)';
					ctx.fillRect(rectLeft, rectTop, rectRight - rectLeft, rectBottom - rectTop);
					ctx.restore();
					ctx.save();
					ctx.lineCap = 'round';
					ctx.setLineDash(TOOL_DOTTED_LINE_DASH);
					ctx.lineWidth = 0.8;
					ctx.strokeStyle = isHidden ? 'rgba(0, 0, 0, 0.5)' : '#000000';
					ctx.beginPath();
					ctx.moveTo(dotStartXVal, dotStartY);
					ctx.lineTo(dotEndX, dotEndY);
					ctx.stroke();
					ctx.setLineDash([]);
					ctx.lineCap = 'butt';
					ctx.restore();
				}
				ctx.restore();
				return;
			}

			// Overlay: when underlay is drawn by primitive, only labels + handles; otherwise draw box + labels + handles
			if (!underlayIsPrimitive) {
				ctx.save();
				ctx.fillStyle = isHidden ? 'rgba(239, 68, 68, 0.1)' : 'rgba(239, 68, 68, 0.2)';
				ctx.fillRect(boxX, riskTop, boxWidth, riskBottom - riskTop);
				ctx.restore();
				ctx.save();
				ctx.fillStyle = isHidden ? 'rgba(34, 197, 94, 0.1)' : 'rgba(34, 197, 94, 0.2)';
				ctx.fillRect(boxX, rewardTop, boxWidth, rewardBottom - rewardTop);
				ctx.restore();
				ctx.save();
				ctx.strokeStyle = isHidden ? 'rgba(0, 0, 0, 0.5)' : '#000000';
				ctx.lineWidth = 0.35;
				ctx.beginPath();
				ctx.moveTo(boxX, entryY);
				ctx.lineTo(boxX + boxWidth, entryY);
				ctx.stroke();
				ctx.restore();
				if (hasBreach && dotEndX != null && dotEndY != null) {
					const dotStartXVal = dotStartX != null ? dotStartX : boxX;
					// Darkened rectangle from first breach of middle line to outcome point (dotted line endpoints)
					ctx.save();
					const rectLeft = Math.min(dotStartXVal, dotEndX);
					const rectRight = Math.max(dotStartXVal, dotEndX);
					const rectTop = Math.min(dotStartY, dotEndY);
					const rectBottom = Math.max(dotStartY, dotEndY);
					ctx.fillStyle = isHidden ? 'rgba(0, 0, 0, 0.04)' : 'rgba(0, 0, 0, 0.07)';
					ctx.fillRect(rectLeft, rectTop, rectRight - rectLeft, rectBottom - rectTop);
					ctx.restore();
					ctx.save();
					ctx.lineCap = 'round';
					ctx.setLineDash(TOOL_DOTTED_LINE_DASH);
					ctx.lineWidth = 0.8;
					ctx.strokeStyle = isHidden ? 'rgba(0, 0, 0, 0.5)' : '#000000';
					ctx.beginPath();
					ctx.moveTo(dotStartXVal, dotStartY);
					ctx.lineTo(dotEndX, dotEndY);
					ctx.stroke();
					ctx.setLineDash([]);
					ctx.lineCap = 'butt';
					ctx.restore();
				}
			}

			// Labels and handles only when hovered or selected (same condition)
			const shouldShowHandles = !isHidden && (selectedHorizontalLineIdRef.current === drawing.id || selectedLineIdRef.current === drawing.id || hoveredLineIdRef.current === drawing.id);

			if (shouldShowHandles) {
			// Calculate Risk/Reward ratio
			const riskHeight = Math.abs(entryY - stopLossY);
			const rewardHeight = Math.abs(takeProfitY - entryY);
			const rrRatio = riskHeight > 0 ? (rewardHeight / riskHeight) : 0;
			const rrRatioText = `Risk/Reward Ratio: ${rrRatio.toFixed(2)}`;

			// Determine which side to show the label on (with hysteresis to prevent flickering)
			const HYSTERESIS_THRESHOLD_HIGH = 1.0;
			const HYSTERESIS_THRESHOLD_LOW = 0.9;
			const lastSide = drawing.lastRRSide;
			
			let currentSide: 'green' | 'red';
			if (lastSide === 'green') {
				currentSide = rrRatio >= HYSTERESIS_THRESHOLD_LOW ? 'green' : 'red';
			} else if (lastSide === 'red') {
				currentSide = rrRatio >= HYSTERESIS_THRESHOLD_HIGH ? 'green' : 'red';
			} else {
				currentSide = rrRatio >= HYSTERESIS_THRESHOLD_HIGH ? 'green' : 'red';
			}

			if (currentSide !== lastSide && updateDrawingRef.current) {
				updateDrawingRef.current(drawing.id, (prev: any) => ({ ...prev, lastRRSide: currentSide }));
			}

			const textX = boxX + boxWidth / 2;
			const offsetFromLine = 15;
			const textY = currentSide === 'green' ? entryY - offsetFromLine : entryY + offsetFromLine;

			ctx.save();
			ctx.font = '12px sans-serif';
			const textMetrics = ctx.measureText(rrRatioText);
			const textWidth = textMetrics.width;
			const textHeight = 13;
			const padding = 5;
			const rectWidth = textWidth + padding * 2;
			const rectHeight = textHeight + padding * 2;
			const rectX = textX - rectWidth / 2;
			const rectY = textY - rectHeight / 2;

			ctx.fillStyle = isHidden ? 'rgba(212, 77, 77, 0.7)' : '#d44d4d';
			ctx.beginPath();
			const borderRadius = 6;
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
			ctx.font = '12px sans-serif';
			ctx.fillText(rrRatioText, textX, textY);
			ctx.restore();

			// Target label (above green for long, below green for short)
			const targetPercent = ((drawing.takeProfit - drawing.entryPrice) / drawing.entryPrice) * 100;
			const stopLossPercent = ((drawing.entryPrice - drawing.stopLoss) / drawing.entryPrice) * 100;
			const targetText = `Target: ${drawing.takeProfit.toFixed(2)} (${targetPercent >= 0 ? '+' : ''}${targetPercent.toFixed(2)}%)`;
			const targetTextX = boxX + boxWidth / 2;
			const targetTextY = isShort ? takeProfitY + 15 : takeProfitY - 15;

			ctx.save();
			ctx.font = '12px sans-serif';
			const targetTextMetrics = ctx.measureText(targetText);
			const targetTextWidth = targetTextMetrics.width;
			const targetTextHeight = 13;
			const targetPadding = 5;
			const targetRectWidth = targetTextWidth + targetPadding * 2;
			const targetRectHeight = targetTextHeight + targetPadding * 2;
			const targetRectX = targetTextX - targetRectWidth / 2;
			const targetRectY = targetTextY - targetRectHeight / 2;

			ctx.fillStyle = isHidden ? 'rgba(60, 174, 60, 0.7)' : '#3cae3c';
			ctx.beginPath();
			drawRoundedRect(ctx, targetRectX, targetRectY, targetRectWidth, targetRectHeight, 6);
			ctx.fill();

			ctx.strokeStyle = '#ffffff';
			ctx.lineWidth = 1.5;
			ctx.beginPath();
			drawRoundedRect(ctx, targetRectX, targetRectY, targetRectWidth, targetRectHeight, 6);
			ctx.stroke();

			ctx.fillStyle = '#ffffff';
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.font = '12px sans-serif';
			ctx.fillText(targetText, targetTextX, targetTextY);
			ctx.restore();

			// Stop Loss label (below red for long, above red for short)
			const stopLossText = `Stop Loss: ${drawing.stopLoss.toFixed(2)} (${stopLossPercent >= 0 ? '+' : ''}${stopLossPercent.toFixed(2)}%)`;
			const stopLossTextX = boxX + boxWidth / 2;
			const stopLossTextY = isShort ? stopLossY - 15 : stopLossY + 15;

			ctx.save();
			ctx.font = '12px sans-serif';
			const stopLossTextMetrics = ctx.measureText(stopLossText);
			const stopLossTextWidth = stopLossTextMetrics.width;
			const stopLossTextHeight = 13;
			const stopLossPadding = 5;
			const stopLossRectWidth = stopLossTextWidth + stopLossPadding * 2;
			const stopLossRectHeight = stopLossTextHeight + stopLossPadding * 2;
			const stopLossRectX = stopLossTextX - stopLossRectWidth / 2;
			const stopLossRectY = stopLossTextY - stopLossRectHeight / 2;

			ctx.fillStyle = isHidden ? 'rgba(212, 77, 77, 0.7)' : '#d44d4d';
			ctx.beginPath();
			drawRoundedRect(ctx, stopLossRectX, stopLossRectY, stopLossRectWidth, stopLossRectHeight, 6);
			ctx.fill();

			ctx.strokeStyle = '#ffffff';
			ctx.lineWidth = 1.5;
			ctx.beginPath();
			drawRoundedRect(ctx, stopLossRectX, stopLossRectY, stopLossRectWidth, stopLossRectHeight, 6);
			ctx.stroke();

			ctx.fillStyle = '#ffffff';
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.font = '12px sans-serif';
			ctx.fillText(stopLossText, stopLossTextX, stopLossTextY);
			ctx.restore();
			}

			// Draw 3 square handles and 1 bubble when hovered/selected
			if (shouldShowHandles) {
				const squareSize = 11;
				const borderRadius = 3;
				const bubbleRadius = 5;
				const hoveredHandle = hoveredLineHandleIdRef.current;
				const isTopLeftHovered = hoveredHandle === `${drawing.id}:top-left`;
				const isBottomLeftHovered = hoveredHandle === `${drawing.id}:bottom-left`;
				const isRightMiddleHovered = hoveredHandle === `${drawing.id}:right-middle`;
				const isLeftMiddleHovered = hoveredHandle === `${drawing.id}:left-middle`;

				// Left-middle bubble (for moving left border and entry line)
				const leftMiddleX = boxX;
				ctx.save();
				if (isLeftMiddleHovered) {
					ctx.shadowColor = 'rgba(59, 130, 246, 0.9)';
					ctx.shadowBlur = 8;
				}
				ctx.fillStyle = '#ffffff';
				ctx.strokeStyle = '#000000';
				ctx.lineWidth = 1.5;
				ctx.beginPath();
				ctx.arc(leftMiddleX, entryY, bubbleRadius, 0, 2 * Math.PI);
				ctx.fill();
				ctx.stroke();
				ctx.restore();

				// Top-left square (top of box: green for long, red for short)
				const topLeftY = Math.min(takeProfitY, stopLossY);
				ctx.save();
				if (isTopLeftHovered) {
					ctx.shadowColor = 'rgba(59, 130, 246, 0.9)';
					ctx.shadowBlur = 8;
				}
				ctx.fillStyle = '#ffffff';
				ctx.strokeStyle = '#000000';
				ctx.lineWidth = 1.5;
				ctx.beginPath();
				drawRoundedRect(ctx, boxX - squareSize / 2, topLeftY - squareSize / 2, squareSize, squareSize, borderRadius);
				ctx.fill();
				ctx.stroke();
				ctx.restore();

				// Bottom-left square (bottom of box: red for long, green for short)
				const bottomLeftY = Math.max(takeProfitY, stopLossY);
				ctx.save();
				if (isBottomLeftHovered) {
					ctx.shadowColor = 'rgba(59, 130, 246, 0.9)';
					ctx.shadowBlur = 8;
				}
				ctx.fillStyle = '#ffffff';
				ctx.strokeStyle = '#000000';
				ctx.lineWidth = 1.5;
				ctx.beginPath();
				drawRoundedRect(ctx, boxX - squareSize / 2, bottomLeftY - squareSize / 2, squareSize, squareSize, borderRadius);
				ctx.fill();
				ctx.stroke();
				ctx.restore();

				// Right-middle square (for width adjustment)
				const rightMiddleX = boxX + boxWidth;
				ctx.save();
				if (isRightMiddleHovered) {
					ctx.shadowColor = 'rgba(59, 130, 246, 0.9)';
					ctx.shadowBlur = 8;
				}
				ctx.fillStyle = '#ffffff';
				ctx.strokeStyle = '#000000';
				ctx.lineWidth = 1.5;
				ctx.beginPath();
				drawRoundedRect(ctx, rightMiddleX - squareSize / 2, entryY - squareSize / 2, squareSize, squareSize, borderRadius);
				ctx.fill();
				ctx.stroke();
				ctx.restore();
			}

			ctx.restore();
			return;
		}

		// ============================================================================
		// PRICE RANGE (measurer: dynamic rect in time+price, line arrow, two corner handles)
		// Underlay (band, borders, arrow) drawn by primitive when underlayIsPrimitive; overlay does label + handles. When in progress, overlay draws full underlay for live preview.
		// ============================================================================
		if (drawing.type === 'price-range' && drawing.startTime != null && drawing.startPrice != null && chart && series) {
			ctx.save();
			const ts = chart.timeScale();
			const isInProgress = priceRangeInProgressIdRef?.current === drawing.id;
			const liveEndTime = isInProgress ? priceRangeLiveEndTimeRef?.current : null;
			const liveEndPrice = isInProgress ? priceRangeLiveEndPriceRef?.current : null;
			const endTime = liveEndTime ?? drawing.endTime ?? drawing.startTime;
			const endPrice = liveEndPrice ?? drawing.endPrice ?? drawing.startPrice;
			const startX = ts.timeToCoordinate(drawing.startTime as any);
			const startY = series.priceToCoordinate(drawing.startPrice);
			const endX = ts.timeToCoordinate(endTime as any);
			const endY = series.priceToCoordinate(endPrice);
			if (startX == null || startY == null || endX == null || endY == null) {
				ctx.restore();
				return;
			}
			const minX = Math.min(Number(startX), Number(endX));
			const maxX = Math.max(Number(startX), Number(endX));
			const minY = Math.min(startY, endY);
			const maxY = Math.max(startY, endY);
			const points = endPrice - drawing.startPrice;
			const pct = drawing.startPrice !== 0 ? (points / drawing.startPrice) * 100 : 0;
			const labelText = points === 0 && pct === 0
				? '0.0 (0.00%)'
				: `${points >= 0 ? '+' : ''}${points.toFixed(1)} (${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%)`;

			ctx.beginPath();
			ctx.rect(0, 0, plotWidth || container.getBoundingClientRect().width, container.getBoundingClientRect().height);
			ctx.clip();

			// Draw band + borders + arrow on overlay only when not using primitive, or when in progress (live preview)
			const drawUnderlayOnOverlay = !underlayIsPrimitive || isInProgress;
			const borderWidth = 1.5;
			const arrowWidth = 2;
			const arrowLen = 7;
			// Same perceived look when drawing and when done: use slightly lighter fill when in progress (overlay on top) so it doesn’t look dark
			// In progress: only overlay draws (underlay skips it); use faded opacity to match final look
			const fillOpacity = isInProgress ? 0.10 : 0.25;
			const strokeColor = '#3b82f6';
			if (drawUnderlayOnOverlay) {
				ctx.fillStyle = `rgba(59, 130, 246, ${fillOpacity})`;
				ctx.fillRect(minX, minY, maxX - minX, maxY - minY);
				ctx.strokeStyle = strokeColor;
				ctx.lineWidth = borderWidth;
				ctx.lineCap = 'round';
				ctx.beginPath();
				ctx.moveTo(minX, minY);
				ctx.lineTo(maxX, minY);
				ctx.stroke();
				ctx.beginPath();
				ctx.moveTo(minX, maxY);
				ctx.lineTo(maxX, maxY);
				ctx.stroke();
				// Only draw arrow when band has enough height; full height from top to bottom border
				const bandHeight = maxY - minY;
				const minHeightForArrow = 24;
				if (bandHeight >= minHeightForArrow) {
					const midX = (minX + maxX) / 2;
					ctx.strokeStyle = strokeColor;
					ctx.lineWidth = arrowWidth;
					ctx.beginPath();
					ctx.moveTo(midX, maxY);
					ctx.lineTo(midX, minY);
					ctx.stroke();
					const endIsAbove = endY < startY;
					if (endIsAbove) {
						ctx.beginPath();
						ctx.moveTo(midX, minY);
						ctx.lineTo(midX - arrowLen * 0.6, minY + arrowLen);
						ctx.moveTo(midX, minY);
						ctx.lineTo(midX + arrowLen * 0.6, minY + arrowLen);
						ctx.stroke();
					} else {
						ctx.beginPath();
						ctx.moveTo(midX, maxY);
						ctx.lineTo(midX - arrowLen * 0.6, maxY - arrowLen);
						ctx.moveTo(midX, maxY);
						ctx.lineTo(midX + arrowLen * 0.6, maxY - arrowLen);
						ctx.stroke();
					}
				}
			}

			drawInfoBlock((minX + maxX) / 2, maxY + 8, [labelText]);

			if (isInteractive) {
				drawHandle(Number(startX), startY);
				drawHandle(Number(endX), endY);
			}
			ctx.restore();
			return;
		}

		// ============================================================================
		// FIBONACCI RETRACEMENT (rainbow bands from level 1 to 0, labels with prices, handles at left of 1 and right of 0, dotted line on 0)
		// ============================================================================
		if (drawing.type === 'fibonacci-retracement' && drawing.startTime != null && drawing.startPrice != null && drawing.endTime != null && drawing.endPrice != null && chart && series) {
			ctx.save();
			const ts = chart.timeScale();
			const isInProgress = fibRetracementInProgressIdRef?.current === drawing.id;
			const liveEndTime = isInProgress ? fibRetracementLiveEndTimeRef?.current : null;
			const liveEndPrice = isInProgress ? fibRetracementLiveEndPriceRef?.current : null;
			const endTime = liveEndTime ?? drawing.endTime;
			const endPrice = liveEndPrice ?? drawing.endPrice;
			const startPrice = drawing.startPrice;
			const startX = ts.timeToCoordinate(drawing.startTime as any);
			const startY = series.priceToCoordinate(startPrice);
			const endX = ts.timeToCoordinate(endTime as any);
			const endY = series.priceToCoordinate(endPrice);
			if (startX == null || startY == null || endX == null || endY == null) {
				ctx.restore();
				return;
			}
			const leftX = Math.min(Number(startX), Number(endX));
			const rightX = Math.max(Number(startX), Number(endX));
			const width = rightX - leftX;
			const range = startPrice - endPrice;
			// Retracement: 0, 0.236, 0.382, 0.5, 0.618, 0.786, 1. Price(L) = endPrice + range * L
			const retraceLevels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1] as const;
			const retracePrices = retraceLevels.map((L) => endPrice + range * L);
			// Extension below 1: 1.618, 2.618, 3.618, 4.236. Price(E) = startPrice + range * (E - 1)
			const extLevels = [1.618, 2.618, 3.618, 4.236] as const;
			const extPrices = extLevels.map((E) => startPrice + range * (E - 1));
			const allLevels = [...retraceLevels, ...extLevels];
			const allPrices = [...retracePrices, ...extPrices];
			const allYCoords = allPrices.map((p) => series.priceToCoordinate(p));
			if (allYCoords.some((y) => y == null)) {
				ctx.restore();
				return;
			}
			const allYs = allYCoords as number[];
			const strokeColors = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6'];
			const extStrokeColors = ['#c084fc', '#a78bfa', '#818cf8', '#6366f1'];

			ctx.beginPath();
			ctx.rect(0, 0, plotWidth || container.getBoundingClientRect().width, container.getBoundingClientRect().height);
			ctx.clip();

			const drawBandsOnOverlay = !underlayIsPrimitive || isInProgress;
			const bandFillOpacity = isInProgress ? 0.2 : 0.35;
			if (drawBandsOnOverlay) {
				// Retracement bands (0 to 1): 6 bands
				for (let i = 0; i < 6; i++) {
					const yTop = Math.min(allYs[i], allYs[i + 1]);
					const yBottom = Math.max(allYs[i], allYs[i + 1]);
					const h = yBottom - yTop;
					if (h < 0.5) continue;
					const [r, g, b] = [[239, 68, 68], [249, 115, 22], [234, 179, 8], [34, 197, 94], [59, 130, 246], [139, 92, 246]][i];
					ctx.fillStyle = `rgba(${r},${g},${b},${bandFillOpacity})`;
					ctx.fillRect(leftX, yTop, width, h);
					ctx.strokeStyle = strokeColors[i];
					ctx.lineWidth = 1.5;
					ctx.beginPath();
					ctx.moveTo(leftX, yTop);
					ctx.lineTo(rightX, yTop);
					ctx.stroke();
				}
				ctx.strokeStyle = '#8b5cf6';
				ctx.lineWidth = 1.5;
				ctx.beginPath();
				ctx.moveTo(leftX, allYs[6]);
				ctx.lineTo(rightX, allYs[6]);
				ctx.stroke();
				// Extension bands (1 to 1.618, 1.618 to 2.618, 2.618 to 3.618, 3.618 to 4.236): 4 bands
				for (let i = 0; i < 4; i++) {
					const yTop = Math.min(allYs[6 + i], allYs[7 + i]);
					const yBottom = Math.max(allYs[6 + i], allYs[7 + i]);
					const h = yBottom - yTop;
					if (h < 0.5) continue;
					const [r, g, b] = [[192, 132, 252], [167, 139, 250], [129, 140, 248], [99, 102, 241]][i];
					ctx.fillStyle = `rgba(${r},${g},${b},${bandFillOpacity})`;
					ctx.fillRect(leftX, yTop, width, h);
					ctx.strokeStyle = extStrokeColors[i];
					ctx.lineWidth = 1.5;
					ctx.beginPath();
					ctx.moveTo(leftX, yTop);
					ctx.lineTo(rightX, yTop);
					ctx.stroke();
				}
				ctx.strokeStyle = '#6366f1';
				ctx.lineWidth = 1.5;
				ctx.beginPath();
				ctx.moveTo(leftX, allYs[10]);
				ctx.lineTo(rightX, allYs[10]);
				ctx.stroke();
			}

			// Level labels with price in brackets (left side); text color matches the respective block
			ctx.font = '11px sans-serif';
			ctx.textAlign = 'right';
			ctx.textBaseline = 'middle';
			const labelGapFromEdge = 22;
			const labelColors = [...strokeColors, strokeColors[5], ...extStrokeColors];
			for (let i = 0; i < allLevels.length; i++) {
				const label = allLevels[i] === 1 ? '1' : allLevels[i] === 0 ? '0' : String(allLevels[i]);
				const priceStr = allPrices[i].toFixed(2);
				const text = `${label} (${priceStr})`;
				ctx.fillStyle = labelColors[i] ?? '#1e293b';
				ctx.fillText(text, leftX - labelGapFromEdge, allYs[i]);
			}

			// Dotted line from 1 to 0 (diagonal: left corner of level 1 to right corner of level 0, no arrows)
			ctx.lineCap = 'round';
			ctx.setLineDash(TOOL_DOTTED_LINE_DASH);
			ctx.strokeStyle = 'rgba(0,0,0,0.4)';
			ctx.lineWidth = 1.5;
			ctx.beginPath();
			ctx.moveTo(leftX, startY);
			ctx.lineTo(rightX, endY);
			ctx.stroke();
			ctx.setLineDash([]);
			ctx.lineCap = 'butt';

			if (isInteractive) {
				drawHandle(leftX, startY);
				drawHandle(rightX, endY);
			}
			ctx.restore();
			return;
		}

		// ============================================================================
		// DATE RANGE (horizontal measurer: dynamic rect in time+price, horizontal arrow, label: bars + duration Vol)
		// ============================================================================
		if (drawing.type === 'date-range' && drawing.startTime != null && drawing.startPrice != null && chart && series) {
			ctx.save();
			const ts = chart.timeScale();
			const isInProgress = dateRangeInProgressIdRef?.current === drawing.id;
			const liveEndTime = isInProgress ? dateRangeLiveEndTimeRef?.current : null;
			const liveEndPrice = isInProgress ? dateRangeLiveEndPriceRef?.current : null;
			const endTime = liveEndTime ?? drawing.endTime ?? drawing.startTime;
			const endPrice = liveEndPrice ?? drawing.endPrice ?? drawing.startPrice;
			const startX = ts.timeToCoordinate(drawing.startTime as any);
			const startY = series.priceToCoordinate(drawing.startPrice);
			const endX = ts.timeToCoordinate(endTime as any);
			const endY = series.priceToCoordinate(endPrice);
			if (startX == null || startY == null || endX == null || endY == null) {
				ctx.restore();
				return;
			}
			const minX = Math.min(Number(startX), Number(endX));
			const maxX = Math.max(Number(startX), Number(endX));
			const minY = Math.min(startY, endY);
			const maxY = Math.max(startY, endY);

			// Bar count: 1-minute timeframe
			const barIntervalSeconds = 60;
			const timeSpanSec = Math.max(0, (endTime as number) - (drawing.startTime as number));
			const bars = Math.round(timeSpanSec / barIntervalSeconds);
			const barsText = `${bars} bars`;

			// Duration label: 1m..59m, then 1h, 1h 1m..1h 59m, 2h..23h 59m, then 1d, 1d 1m, etc.
			const totalMinutes = Math.floor(timeSpanSec / 60);
			let durationStr: string;
			if (totalMinutes < 60) {
				durationStr = totalMinutes <= 0 ? '0m' : `${totalMinutes}m`;
			} else if (totalMinutes < 24 * 60) {
				const hours = Math.floor(totalMinutes / 60);
				const mins = totalMinutes % 60;
				durationStr = mins === 0 ? `${hours}h` : `${hours}h ${mins}m`;
			} else {
				const days = Math.floor(totalMinutes / (24 * 60));
				const rem = totalMinutes % (24 * 60);
				const hours = Math.floor(rem / 60);
				const mins = rem % 60;
				const parts = [`${days}d`];
				if (hours > 0) parts.push(`${hours}h`);
				if (mins > 0) parts.push(`${mins}m`);
				durationStr = parts.join(' ');
			}

			// Volume: sum of candles in range
			const barsData = candlestickDataRef?.current ?? [];
			let totalVol = 0;
			const t0 = Math.min(drawing.startTime as number, endTime as number);
			const t1 = Math.max(drawing.startTime as number, endTime as number);
			for (const b of barsData) {
				const t = b.time as number;
				if (t >= t0 && t <= t1) totalVol += (b as CandleBar).volume ?? 0;
			}
			const volStr = totalVol >= 1000 ? `${(totalVol / 1000).toFixed(0)}k` : String(totalVol);
			const volText = `${durationStr} Vol ${volStr}`;

			ctx.beginPath();
			ctx.rect(0, 0, plotWidth || container.getBoundingClientRect().width, container.getBoundingClientRect().height);
			ctx.clip();

			const drawUnderlayOnOverlay = !underlayIsPrimitive || isInProgress;
			const borderWidth = 1.5;
			const arrowWidth = 2;
			const arrowLen = 7;
			// Same as date-price-range: overlay in front looks darker; use 0.10 when in progress so fade matches underlay (0.14) when done
			const fillOpacity = isInProgress ? 0.10 : 0.25;
			const strokeColor = '#3b82f6';
			if (drawUnderlayOnOverlay) {
				ctx.fillStyle = `rgba(59, 130, 246, ${fillOpacity})`;
				ctx.fillRect(minX, minY, maxX - minX, maxY - minY);
				ctx.strokeStyle = strokeColor;
				ctx.lineWidth = borderWidth;
				ctx.lineCap = 'round';
				ctx.beginPath();
				ctx.moveTo(minX, minY);
				ctx.lineTo(minX, maxY);
				ctx.stroke();
				ctx.beginPath();
				ctx.moveTo(maxX, minY);
				ctx.lineTo(maxX, maxY);
				ctx.stroke();
				const bandWidth = maxX - minX;
				const minWidthForArrow = 24;
				if (bandWidth >= minWidthForArrow) {
					const midY = (minY + maxY) / 2;
					ctx.strokeStyle = strokeColor;
					ctx.lineWidth = arrowWidth;
					ctx.beginPath();
					ctx.moveTo(minX, midY);
					ctx.lineTo(maxX, midY);
					ctx.stroke();
					const endIsRight = (endTime as number) > (drawing.startTime as number);
					if (endIsRight) {
						ctx.beginPath();
						ctx.moveTo(maxX, midY);
						ctx.lineTo(maxX - arrowLen, midY - arrowLen * 0.6);
						ctx.moveTo(maxX, midY);
						ctx.lineTo(maxX - arrowLen, midY + arrowLen * 0.6);
						ctx.stroke();
					} else {
						ctx.beginPath();
						ctx.moveTo(minX, midY);
						ctx.lineTo(minX + arrowLen, midY - arrowLen * 0.6);
						ctx.moveTo(minX, midY);
						ctx.lineTo(minX + arrowLen, midY + arrowLen * 0.6);
						ctx.stroke();
					}
				}
			}

			drawInfoBlock((minX + maxX) / 2, maxY + 8, [barsText, volText]);

			if (isInteractive) {
				drawHandle(Number(startX), startY);
				drawHandle(Number(endX), endY);
			}
			ctx.restore();
			return;
		}

		// ============================================================================
		// DATE AND PRICE RANGE (combined: rect, vertical + horizontal arrows, price label + date label, two handles)
		// ============================================================================
		if (drawing.type === 'date-price-range' && drawing.startTime != null && drawing.startPrice != null && chart && series) {
			const isInProgress = datePriceRangeInProgressIdRef?.current === drawing.id;
			// When not in progress, we need end to draw; when in progress we use live refs or start as end
			if (!isInProgress && (drawing.endTime == null || drawing.endPrice == null)) return;
			ctx.save();
			const ts = chart.timeScale();
			const liveEndTime = isInProgress ? datePriceRangeLiveEndTimeRef?.current : null;
			const liveEndPrice = isInProgress ? datePriceRangeLiveEndPriceRef?.current : null;
			const endTime = liveEndTime ?? drawing.endTime ?? drawing.startTime;
			const endPrice = liveEndPrice ?? drawing.endPrice ?? drawing.startPrice;
			const startX = ts.timeToCoordinate(drawing.startTime as any);
			const startY = series.priceToCoordinate(drawing.startPrice);
			const endX = ts.timeToCoordinate(endTime as any);
			const endY = series.priceToCoordinate(endPrice);
			if (startX == null || startY == null || endX == null || endY == null) {
				ctx.restore();
				return;
			}
			const minX = Math.min(Number(startX), Number(endX));
			const maxX = Math.max(Number(startX), Number(endX));
			const minY = Math.min(startY, endY);
			const maxY = Math.max(startY, endY);

			// Price label (like price-range)
			const points = endPrice - drawing.startPrice;
			const pct = drawing.startPrice !== 0 ? (points / drawing.startPrice) * 100 : 0;
			const priceLabelText = points === 0 && pct === 0
				? '0.0 (0.00%)'
				: `${points >= 0 ? '+' : ''}${points.toFixed(1)} (${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%)`;

			// Date label (like date-range): bars + duration Vol
			const barIntervalSeconds = 60;
			const timeSpanSec = Math.max(0, (endTime as number) - (drawing.startTime as number));
			const bars = Math.round(timeSpanSec / barIntervalSeconds);
			const barsText = `${bars} bars`;
			const totalMinutes = Math.floor(timeSpanSec / 60);
			let durationStr: string;
			if (totalMinutes < 60) {
				durationStr = totalMinutes <= 0 ? '0m' : `${totalMinutes}m`;
			} else if (totalMinutes < 24 * 60) {
				const hours = Math.floor(totalMinutes / 60);
				const mins = totalMinutes % 60;
				durationStr = mins === 0 ? `${hours}h` : `${hours}h ${mins}m`;
			} else {
				const days = Math.floor(totalMinutes / (24 * 60));
				const rem = totalMinutes % (24 * 60);
				const hours = Math.floor(rem / 60);
				const mins = rem % 60;
				const parts = [`${days}d`];
				if (hours > 0) parts.push(`${hours}h`);
				if (mins > 0) parts.push(`${mins}m`);
				durationStr = parts.join(' ');
			}
			const barsData = candlestickDataRef?.current ?? [];
			let totalVol = 0;
			const t0 = Math.min(drawing.startTime as number, endTime as number);
			const t1 = Math.max(drawing.startTime as number, endTime as number);
			for (const b of barsData) {
				const t = b.time as number;
				if (t >= t0 && t <= t1) totalVol += (b as CandleBar).volume ?? 0;
			}
			const volStr = totalVol >= 1000 ? `${(totalVol / 1000).toFixed(0)}k` : String(totalVol);
			const volText = `${durationStr} Vol ${volStr}`;

			ctx.beginPath();
			ctx.rect(0, 0, plotWidth || container.getBoundingClientRect().width, container.getBoundingClientRect().height);
			ctx.clip();

			// When primitive is used, overlay must never draw the band for completed date-price-range (underlay draws it). Only draw band when: not using primitive, OR (in progress and drawing not yet complete).
			const hasEnd = drawing.endTime != null && drawing.endPrice != null;
			const drawBandOnOverlay = underlayIsPrimitive ? (isInProgress && !hasEnd) : true;
			const arrowWidth = 2;
			const arrowLen = 7;
			const fillOpacity = isInProgress ? 0.14 : 0.25;
			const strokeColor = '#3b82f6';
			if (drawBandOnOverlay) {
				ctx.fillStyle = `rgba(59, 130, 246, ${fillOpacity})`;
				ctx.fillRect(minX, minY, maxX - minX, maxY - minY);
				// Vertical arrow (price) at center X
				const bandHeight = maxY - minY;
				const minHeightForArrow = 24;
				if (bandHeight >= minHeightForArrow) {
					const midX = (minX + maxX) / 2;
					ctx.strokeStyle = strokeColor;
					ctx.lineWidth = arrowWidth;
					ctx.beginPath();
					ctx.moveTo(midX, maxY);
					ctx.lineTo(midX, minY);
					ctx.stroke();
					const endIsAbove = endY < startY;
					if (endIsAbove) {
						ctx.beginPath();
						ctx.moveTo(midX, minY);
						ctx.lineTo(midX - arrowLen * 0.6, minY + arrowLen);
						ctx.moveTo(midX, minY);
						ctx.lineTo(midX + arrowLen * 0.6, minY + arrowLen);
						ctx.stroke();
					} else {
						ctx.beginPath();
						ctx.moveTo(midX, maxY);
						ctx.lineTo(midX - arrowLen * 0.6, maxY - arrowLen);
						ctx.moveTo(midX, maxY);
						ctx.lineTo(midX + arrowLen * 0.6, maxY - arrowLen);
						ctx.stroke();
					}
				}
				// Horizontal arrow (date) at center Y
				const bandWidth = maxX - minX;
				const minWidthForArrow = 24;
				if (bandWidth >= minWidthForArrow) {
					const midY = (minY + maxY) / 2;
					ctx.strokeStyle = strokeColor;
					ctx.lineWidth = arrowWidth;
					ctx.beginPath();
					ctx.moveTo(minX, midY);
					ctx.lineTo(maxX, midY);
					ctx.stroke();
					const endIsRight = (endTime as number) > (drawing.startTime as number);
					if (endIsRight) {
						ctx.beginPath();
						ctx.moveTo(maxX, midY);
						ctx.lineTo(maxX - arrowLen, midY - arrowLen * 0.6);
						ctx.moveTo(maxX, midY);
						ctx.lineTo(maxX - arrowLen, midY + arrowLen * 0.6);
						ctx.stroke();
					} else {
						ctx.beginPath();
						ctx.moveTo(minX, midY);
						ctx.lineTo(minX + arrowLen, midY - arrowLen * 0.6);
						ctx.moveTo(minX, midY);
						ctx.lineTo(minX + arrowLen, midY + arrowLen * 0.6);
						ctx.stroke();
					}
				}
			}

			drawInfoBlock((minX + maxX) / 2, maxY + 8, [priceLabelText, barsText, volText]);

			if (isInteractive) {
				drawHandle(Number(startX), startY);
				drawHandle(Number(endX), endY);
			}
			ctx.restore();
			return;
		}

		// ============================================================================
		// RECTANGLE: chart-space rect; 4 corner bubbles + 4 square edge handles when selected or in progress
		// ============================================================================
		if (drawing.type === 'rectangle' && chart && series && drawing.startTime != null && drawing.startPrice != null) {
			const endT = drawing.endTime ?? drawing.startTime;
			const endP = drawing.endPrice ?? drawing.startPrice;
			const ts = chart.timeScale();
			const minT = Math.min(drawing.startTime, endT);
			const maxT = Math.max(drawing.startTime, endT);
			const minP = Math.min(drawing.startPrice, endP);
			const maxP = Math.max(drawing.startPrice, endP);
			const minX = Number(ts.timeToCoordinate(minT as any));
			const maxX = Number(ts.timeToCoordinate(maxT as any));
			const topY = series.priceToCoordinate(maxP);
			const bottomY = series.priceToCoordinate(minP);
			if (minX == null || maxX == null || topY == null || bottomY == null) return;
			const left = Math.min(minX, maxX);
			const right = Math.max(minX, maxX);
			const top = Math.min(topY, bottomY);
			const bottom = Math.max(topY, bottomY);
			const isInProgress = rectangleInProgressIdRef?.current === drawing.id;
			const selected = selectedLineIdRef.current === drawing.id || hoveredLineIdRef.current === drawing.id;
			const showHandles = selected || isInProgress;
			ctx.save();
			ctx.beginPath();
			ctx.rect(0, 0, plotWidth || container.getBoundingClientRect().width, container.getBoundingClientRect().height);
			ctx.clip();
			ctx.strokeStyle = drawing.style?.color || '#3b82f6';
			ctx.lineWidth = drawing.style?.width || 2;
			const w = right - left;
			const h = bottom - top;
			if (w >= 1 && h >= 1) {
				const fillOpacity = isInProgress ? 0.18 : 0.25;
				ctx.fillStyle = `rgba(59, 130, 246, ${fillOpacity})`;
				ctx.fillRect(left, top, w, h);
				ctx.strokeRect(left, top, w, h);
			} else {
				// Degenerate or first click: draw at least one bubble so user sees something
				const r = 5;
				ctx.fillStyle = '#ffffff';
				ctx.strokeStyle = drawing.style?.color || '#3b82f6';
				ctx.lineWidth = 1.5;
				ctx.beginPath();
				ctx.arc(left, top, r, 0, 2 * Math.PI);
				ctx.fill();
				ctx.stroke();
			}
			if (showHandles) {
				const handleRadius = 5;
				const squareSize = 11;
				const borderRadius = 3;
				const midX = (left + right) / 2;
				const midY = (top + bottom) / 2;
				const hoveredHandle = hoveredLineHandleIdRef.current;
				const sq2 = squareSize / 2;
				ctx.fillStyle = '#ffffff';
				ctx.strokeStyle = drawing.style?.color || '#3b82f6';
				ctx.lineWidth = 1.5;
				// 4 corner circles (reposition)
				ctx.beginPath();
				ctx.arc(left, top, handleRadius, 0, 2 * Math.PI);
				ctx.fill();
				ctx.stroke();
				ctx.beginPath();
				ctx.arc(right, top, handleRadius, 0, 2 * Math.PI);
				ctx.fill();
				ctx.stroke();
				ctx.beginPath();
				ctx.arc(left, bottom, handleRadius, 0, 2 * Math.PI);
				ctx.fill();
				ctx.stroke();
				ctx.beginPath();
				ctx.arc(right, bottom, handleRadius, 0, 2 * Math.PI);
				ctx.fill();
				ctx.stroke();
				// 4 edge-center squares (resize width/height) – blue boundary
				ctx.fillStyle = '#ffffff';
				ctx.strokeStyle = drawing.style?.color || '#3b82f6';
				ctx.lineWidth = 1.5;
				const drawRectEdgeSquare = (x: number, y: number, handleId: string) => {
					ctx.save();
					if (hoveredHandle === `${drawing.id}:${handleId}`) {
						ctx.shadowColor = 'rgba(59, 130, 246, 0.9)';
						ctx.shadowBlur = 8;
					}
					ctx.beginPath();
					drawRoundedRect(ctx, x - sq2, y - sq2, squareSize, squareSize, borderRadius);
					ctx.fill();
					ctx.stroke();
					ctx.restore();
				};
				drawRectEdgeSquare(left, midY, 'rect-edge-left');
				drawRectEdgeSquare(right, midY, 'rect-edge-right');
				drawRectEdgeSquare(midX, top, 'rect-edge-top');
				drawRectEdgeSquare(midX, bottom, 'rect-edge-bottom');
			}
			ctx.restore();
			return;
		}

		// ============================================================================
		// GANN BOX: filled closed box (like Fib), 4 reposition bubbles at corners only
		// ============================================================================
		if (drawing.type === 'gann-box' && chart && series && drawing.startTime != null && drawing.startPrice != null) {
			const endT = drawing.endTime ?? drawing.startTime;
			const endP = drawing.endPrice ?? drawing.startPrice;
			const ts = chart.timeScale();
			const minT = Math.min(drawing.startTime, endT);
			const maxT = Math.max(drawing.startTime, endT);
			const minP = Math.min(drawing.startPrice, endP);
			const maxP = Math.max(drawing.startPrice, endP);
			const minX = Number(ts.timeToCoordinate(minT as any));
			const maxX = Number(ts.timeToCoordinate(maxT as any));
			const topY = series.priceToCoordinate(maxP);
			const bottomY = series.priceToCoordinate(minP);
			if (minX == null || maxX == null || topY == null || bottomY == null) return;
			const left = Math.min(minX, maxX);
			const right = Math.max(minX, maxX);
			const top = Math.min(topY, bottomY);
			const bottom = Math.max(topY, bottomY);
			const isInProgress = gannBoxInProgressIdRef?.current === drawing.id;
			const selected = selectedLineIdRef.current === drawing.id || hoveredLineIdRef.current === drawing.id;
			const showHandles = selected || isInProgress;
			const drawBoxOnOverlay = !underlayIsPrimitive || isInProgress;
			ctx.save();
			ctx.beginPath();
			ctx.rect(0, 0, plotWidth || container.getBoundingClientRect().width, container.getBoundingClientRect().height);
			ctx.clip();
			ctx.strokeStyle = drawing.style?.color || '#6366f1';
			ctx.lineWidth = drawing.style?.width || 2;
			const w = right - left;
			const h = bottom - top;
			if (drawBoxOnOverlay) {
				if (w >= 1 && h >= 1) {
					const cellOpacity = isInProgress ? 0.35 : 0.55;
					for (let row = 0; row < 6; row++) {
						const y0 = GANN_FRACTIONS[row];
						const y1 = GANN_FRACTIONS[row + 1];
						const cellTop = bottom + (top - bottom) * y1;
						const cellBottom = bottom + (top - bottom) * y0;
						const cellH = cellBottom - cellTop;
						for (let col = 0; col < 6; col++) {
							const x0 = GANN_FRACTIONS[col];
							const x1 = GANN_FRACTIONS[col + 1];
							const cellLeft = left + w * x0;
							const cellRight = left + w * x1;
							const cellW = cellRight - cellLeft;
							ctx.fillStyle = gannCellColor(row, col, cellOpacity);
							ctx.fillRect(cellLeft, cellTop, cellW, cellH);
						}
					}
					ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
					ctx.lineWidth = 1;
					for (let i = 0; i < GANN_FRACTIONS.length; i++) {
						const t = GANN_FRACTIONS[i];
						const x = left + w * t;
						ctx.beginPath();
						ctx.moveTo(x, top);
						ctx.lineTo(x, bottom);
						ctx.stroke();
						const y = bottom + (top - bottom) * t;
						ctx.beginPath();
						ctx.moveTo(left, y);
						ctx.lineTo(right, y);
						ctx.stroke();
					}
					const gannBorderW = drawing.style?.width ?? 2;
					ctx.lineWidth = gannBorderW;
					ctx.strokeStyle = gannBorderColor('top');
					ctx.beginPath();
					ctx.moveTo(left, top);
					ctx.lineTo(right, top);
					ctx.stroke();
					ctx.strokeStyle = gannBorderColor('right');
					ctx.beginPath();
					ctx.moveTo(right, top);
					ctx.lineTo(right, bottom);
					ctx.stroke();
					ctx.strokeStyle = gannBorderColor('bottom');
					ctx.beginPath();
					ctx.moveTo(right, bottom);
					ctx.lineTo(left, bottom);
					ctx.stroke();
					ctx.strokeStyle = gannBorderColor('left');
					ctx.beginPath();
					ctx.moveTo(left, bottom);
					ctx.lineTo(left, top);
					ctx.stroke();
					// Labels on all four sides – colored like boxes, 12px, more padding
					ctx.font = '12px sans-serif';
					const gannPad = 10;
					const fracLabels = ['0', '0.25', '0.382', '0.5', '0.618', '0.75', '1'];
					for (let i = 0; i < GANN_FRACTIONS.length; i++) {
						const t = GANN_FRACTIONS[i];
						const x = left + w * t;
						const y = bottom + (top - bottom) * t;
						ctx.fillStyle = gannLabelColor(i);
						ctx.textAlign = 'center';
						ctx.textBaseline = 'top';
						ctx.fillText(fracLabels[i], x, bottom + gannPad);
						ctx.textBaseline = 'bottom';
						ctx.fillText(fracLabels[i], x, top - gannPad);
						ctx.textAlign = 'right';
						ctx.textBaseline = 'middle';
						ctx.fillText(fracLabels[i], left - gannPad, y);
						ctx.textAlign = 'left';
						ctx.fillText(fracLabels[i], right + gannPad, y);
					}
				} else {
					const r = 5;
					ctx.fillStyle = '#ffffff';
					ctx.strokeStyle = gannBorderColor('top');
					ctx.lineWidth = 1.5;
					ctx.beginPath();
					ctx.arc(left, top, r, 0, 2 * Math.PI);
					ctx.fill();
					ctx.stroke();
				}
			}
			if (showHandles) {
				const handleRadius = 5;
				ctx.fillStyle = '#ffffff';
				ctx.strokeStyle = gannBorderColor('left');
				ctx.lineWidth = 1.5;
				ctx.beginPath();
				ctx.arc(left, top, handleRadius, 0, 2 * Math.PI);
				ctx.fill();
				ctx.stroke();
				ctx.beginPath();
				ctx.arc(right, top, handleRadius, 0, 2 * Math.PI);
				ctx.fill();
				ctx.stroke();
				ctx.beginPath();
				ctx.arc(left, bottom, handleRadius, 0, 2 * Math.PI);
				ctx.fill();
				ctx.stroke();
				ctx.beginPath();
				ctx.arc(right, bottom, handleRadius, 0, 2 * Math.PI);
				ctx.fill();
				ctx.stroke();
			}
			ctx.restore();
			return;
		}

		// ============================================================================
		// EMOJI: character in a box; imaginary boundary square + 4 corner handles when selected/hovered
		// ============================================================================
		if (drawing.type === 'emoji' && chart && series && drawing.emojiChar && drawing.startTime != null && drawing.startPrice != null && drawing.endTime != null && drawing.endPrice != null) {
			const ts = chart.timeScale();
			const minT = Math.min(drawing.startTime, drawing.endTime);
			const maxT = Math.max(drawing.startTime, drawing.endTime);
			const minP = Math.min(drawing.startPrice, drawing.endPrice);
			const maxP = Math.max(drawing.startPrice, drawing.endPrice);
			const minX = Number(ts.timeToCoordinate(minT as any));
			const maxX = Number(ts.timeToCoordinate(maxT as any));
			const topY = series.priceToCoordinate(maxP);
			const bottomY = series.priceToCoordinate(minP);
			if (minX == null || maxX == null || topY == null || bottomY == null) return;
			const left = Math.min(minX, maxX);
			const right = Math.max(minX, maxX);
			const top = Math.min(topY, bottomY);
			const bottom = Math.max(topY, bottomY);
			const w = right - left;
			const h = bottom - top;
			const selected = selectedLineIdRef.current === drawing.id || hoveredLineIdRef.current === drawing.id;
			ctx.save();
			ctx.beginPath();
			ctx.rect(0, 0, plotWidth || container.getBoundingClientRect().width, container.getBoundingClientRect().height);
			ctx.clip();
			// Draw emoji character centered in box (font size from box height)
			const fontSize = Math.max(12, Math.min(h * 0.85, w * 0.85));
			ctx.font = `${fontSize}px sans-serif`;
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.fillStyle = '#000000';
			ctx.fillText(drawing.emojiChar, (left + right) / 2, (top + bottom) / 2);
			// When selected/hovered: draw boundary square + 4 corner handles
			if (selected && w >= 1 && h >= 1) {
				ctx.strokeStyle = drawing.style?.color || '#3b82f6';
				ctx.lineWidth = (drawing.style?.width || 2) * 0.8;
				ctx.lineCap = 'round';
				ctx.setLineDash(TOOL_DOTTED_LINE_DASH);
				ctx.strokeRect(left, top, w, h);
				ctx.setLineDash([]);
				ctx.lineCap = 'butt';
				const handleRadius = 5;
				ctx.fillStyle = '#ffffff';
				ctx.strokeStyle = drawing.style?.color || '#3b82f6';
				ctx.lineWidth = 1.5;
				const hoveredHandle = hoveredLineHandleIdRef.current;
				[['rect-corner-tl', left, top], ['rect-corner-tr', right, top], ['rect-corner-bl', left, bottom], ['rect-corner-br', right, bottom]].forEach(([handleId, x, y]) => {
					ctx.save();
					if (hoveredHandle === `${drawing.id}:${handleId}`) {
						ctx.shadowColor = 'rgba(59, 130, 246, 0.9)';
						ctx.shadowBlur = 8;
					}
					ctx.beginPath();
					ctx.arc(x as number, y as number, handleRadius, 0, 2 * Math.PI);
					ctx.fill();
					ctx.stroke();
					ctx.restore();
				});
			}
			ctx.restore();
			return;
		}

		// ============================================================================
		// TEXT / ANNOTATION: single-line label. Box auto-sized from text content.
		// Covers: text, note, price-note, callout, comment, price-label, signpost, flagmark, pin
		// ============================================================================
		const ANNOTATION_TYPES = new Set(['text', 'note', 'price-note', 'callout', 'comment', 'price-label', 'signpost', 'flagmark', 'pin']);
		if (ANNOTATION_TYPES.has(drawing.type as string) && chart && series && drawing.startTime != null && drawing.startPrice != null && drawing.endPrice != null) {
			if (editingTextDrawingId === drawing.id) return;
			const ts = chart.timeScale();
			const leftT = Math.min(Number(drawing.startTime), Number(drawing.endTime ?? drawing.startTime));
			const minP = Math.min(drawing.startPrice, drawing.endPrice);
			const maxP = Math.max(drawing.startPrice, drawing.endPrice);
			const leftX = Number(ts.timeToCoordinate(leftT as any));
			const topY = series.priceToCoordinate(maxP);
			const bottomY = series.priceToCoordinate(minP);
			if (leftX == null || topY == null || bottomY == null) return;
			const rawH = Math.abs(bottomY - topY);
			const h = Math.max(rawH * 0.9, 20);
			const top = Math.min(topY, bottomY) + rawH * 0.05;
			const raw = (drawing.textContent ?? '').replace(/\r?\n/g, ' ').trim();
			const w = textBoxWidthPx(raw);
			const borderColor = drawing.style?.color || '#2563eb';
			const selectedOrHovered = selectedLineIdRef.current === drawing.id || hoveredLineIdRef.current === drawing.id;
			const aType = drawing.type as string;
			ctx.save();
			ctx.beginPath();
			ctx.rect(0, 0, plotWidth || container.getBoundingClientRect().width, container.getBoundingClientRect().height);
			ctx.clip();
			ctx.font = TEXT_ANNOTATION_FONT;
			const displayText = raw.length ? raw : ' ';
			const textW = ctx.measureText(displayText).width;
			const boxW = Math.max(w, textW + TEXT_PAD_PX * 2 + 10);

			if (aType === 'text') {
				if (selectedOrHovered && w >= 1 && h >= 1) {
					ctx.strokeStyle = borderColor;
					ctx.lineWidth = drawing.style?.width ?? 2;
					ctx.setLineDash([]);
					ctx.strokeRect(leftX, top, w, h);
				}
				ctx.fillStyle = '#0f172a';
				ctx.textAlign = 'left';
				ctx.textBaseline = 'middle';
				ctx.fillText(displayText, leftX + TEXT_PAD_PX + 2, top + h / 2);

			} else if (aType === 'note') {
				ctx.fillStyle = '#fffde7';
				ctx.fillRect(leftX, top, boxW, h);
				ctx.strokeStyle = '#e6c300';
				ctx.lineWidth = 1;
				ctx.strokeRect(leftX, top, boxW, h);
				ctx.fillStyle = borderColor;
				ctx.fillRect(leftX, top, 4, h);
				ctx.fillStyle = '#0f172a';
				ctx.textAlign = 'left';
				ctx.textBaseline = 'middle';
				ctx.fillText(displayText, leftX + 10, top + h / 2);

			} else if (aType === 'price-note') {
				ctx.fillStyle = '#f0f9ff';
				ctx.fillRect(leftX, top, boxW, h);
				ctx.strokeStyle = borderColor;
				ctx.lineWidth = 1;
				ctx.strokeRect(leftX, top, boxW, h);
				ctx.strokeStyle = borderColor;
				ctx.lineWidth = 1.5;
				ctx.lineCap = 'round';
				ctx.setLineDash(TOOL_DOTTED_LINE_DASH);
				ctx.beginPath();
				ctx.moveTo(leftX + boxW, top + h / 2);
				ctx.lineTo(leftX + boxW + 40, top + h / 2);
				ctx.stroke();
				ctx.setLineDash([]);
				ctx.lineCap = 'butt';
				const priceStr = drawing.startPrice != null ? drawing.startPrice.toFixed(2) : '';
				ctx.fillStyle = borderColor;
				ctx.fillRect(leftX + boxW + 40, top + h / 2 - 9, ctx.measureText(priceStr).width + 8, 18);
				ctx.fillStyle = '#fff';
				ctx.textAlign = 'left';
				ctx.textBaseline = 'middle';
				ctx.fillText(priceStr, leftX + boxW + 44, top + h / 2);
				ctx.fillStyle = '#0f172a';
				ctx.fillText(displayText, leftX + TEXT_PAD_PX + 4, top + h / 2);

			} else if (aType === 'callout') {
				const bubbleX = leftX + 30;
				const bubbleY = top - h - 10;
				const bubbleW = boxW;
				const bubbleH = h;
				drawRoundedRect(ctx, bubbleX, bubbleY, bubbleW, bubbleH, 6);
				ctx.fillStyle = '#f8fafc';
				ctx.fill();
				ctx.strokeStyle = borderColor;
				ctx.lineWidth = 1.5;
				ctx.stroke();
				ctx.beginPath();
				ctx.moveTo(leftX, top);
				ctx.lineTo(bubbleX + 10, bubbleY + bubbleH);
				ctx.lineTo(bubbleX + 20, bubbleY + bubbleH);
				ctx.strokeStyle = borderColor;
				ctx.lineWidth = 1.5;
				ctx.stroke();
				ctx.fillStyle = borderColor;
				ctx.beginPath();
				ctx.arc(leftX, top, 3, 0, Math.PI * 2);
				ctx.fill();
				ctx.fillStyle = '#0f172a';
				ctx.textAlign = 'left';
				ctx.textBaseline = 'middle';
				ctx.fillText(displayText, bubbleX + TEXT_PAD_PX + 4, bubbleY + bubbleH / 2);

			} else if (aType === 'comment') {
				drawRoundedRect(ctx, leftX, top, boxW, h, 6);
				ctx.fillStyle = '#f1f5f9';
				ctx.fill();
				ctx.strokeStyle = borderColor;
				ctx.lineWidth = 1.5;
				ctx.stroke();
				ctx.beginPath();
				ctx.moveTo(leftX + 8, top + h);
				ctx.lineTo(leftX + 2, top + h + 10);
				ctx.lineTo(leftX + 18, top + h);
				ctx.fillStyle = '#f1f5f9';
				ctx.fill();
				ctx.strokeStyle = borderColor;
				ctx.lineWidth = 1.5;
				ctx.stroke();
				ctx.fillStyle = '#f1f5f9';
				ctx.fillRect(leftX + 9, top + h - 1, 8, 2);
				ctx.fillStyle = '#0f172a';
				ctx.textAlign = 'left';
				ctx.textBaseline = 'middle';
				ctx.fillText(displayText, leftX + TEXT_PAD_PX + 4, top + h / 2);

			} else if (aType === 'price-label') {
				const arrowTip = 8;
				ctx.beginPath();
				ctx.moveTo(leftX, top);
				ctx.lineTo(leftX + boxW, top);
				ctx.lineTo(leftX + boxW + arrowTip, top + h / 2);
				ctx.lineTo(leftX + boxW, top + h);
				ctx.lineTo(leftX, top + h);
				ctx.closePath();
				ctx.fillStyle = borderColor;
				ctx.fill();
				ctx.fillStyle = '#fff';
				ctx.textAlign = 'left';
				ctx.textBaseline = 'middle';
				ctx.fillText(displayText, leftX + TEXT_PAD_PX + 4, top + h / 2);

			} else if (aType === 'signpost') {
				ctx.strokeStyle = borderColor;
				ctx.lineWidth = 2;
				ctx.beginPath();
				ctx.moveTo(leftX, top - 5);
				ctx.lineTo(leftX, top + h + 15);
				ctx.stroke();
				const signW = boxW;
				const signH = h * 0.75;
				const signTop = top;
				const arrowTip = 8;
				ctx.beginPath();
				ctx.moveTo(leftX, signTop);
				ctx.lineTo(leftX + signW, signTop);
				ctx.lineTo(leftX + signW + arrowTip, signTop + signH / 2);
				ctx.lineTo(leftX + signW, signTop + signH);
				ctx.lineTo(leftX, signTop + signH);
				ctx.closePath();
				ctx.fillStyle = borderColor;
				ctx.globalAlpha = 0.15;
				ctx.fill();
				ctx.globalAlpha = 1;
				ctx.strokeStyle = borderColor;
				ctx.lineWidth = 1;
				ctx.stroke();
				ctx.fillStyle = '#0f172a';
				ctx.textAlign = 'left';
				ctx.textBaseline = 'middle';
				ctx.fillText(displayText, leftX + TEXT_PAD_PX + 4, signTop + signH / 2);

			} else if (aType === 'flagmark') {
				ctx.strokeStyle = borderColor;
				ctx.lineWidth = 2;
				ctx.beginPath();
				ctx.moveTo(leftX, top - 5);
				ctx.lineTo(leftX, top + h + 15);
				ctx.stroke();
				const flagW = boxW;
				const flagH = h * 0.65;
				ctx.beginPath();
				ctx.moveTo(leftX, top);
				ctx.lineTo(leftX + flagW, top);
				ctx.lineTo(leftX + flagW - 6, top + flagH / 2);
				ctx.lineTo(leftX + flagW, top + flagH);
				ctx.lineTo(leftX, top + flagH);
				ctx.closePath();
				ctx.fillStyle = borderColor;
				ctx.globalAlpha = 0.2;
				ctx.fill();
				ctx.globalAlpha = 1;
				ctx.strokeStyle = borderColor;
				ctx.lineWidth = 1;
				ctx.stroke();
				ctx.fillStyle = '#0f172a';
				ctx.textAlign = 'left';
				ctx.textBaseline = 'middle';
				ctx.fillText(displayText, leftX + TEXT_PAD_PX + 4, top + flagH / 2);

			} else if (aType === 'pin') {
				const pinR = 8;
				const cx = leftX + pinR;
				const cy = top + pinR;
				ctx.fillStyle = borderColor;
				ctx.beginPath();
				ctx.arc(cx, cy, pinR, 0, Math.PI * 2);
				ctx.fill();
				ctx.strokeStyle = borderColor;
				ctx.lineWidth = 2;
				ctx.beginPath();
				ctx.moveTo(cx, cy + pinR);
				ctx.lineTo(cx, top + h + 10);
				ctx.stroke();
				ctx.beginPath();
				ctx.arc(cx, cy, pinR - 2, 0, Math.PI * 2);
				ctx.fillStyle = '#fff';
				ctx.fill();
				ctx.beginPath();
				ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
				ctx.fillStyle = borderColor;
				ctx.fill();
				if (raw.length) {
					ctx.fillStyle = '#0f172a';
					ctx.textAlign = 'left';
					ctx.textBaseline = 'middle';
					ctx.fillText(displayText, leftX + pinR * 2 + 6, top + h / 2);
				}
			}

			if (selectedOrHovered && aType !== 'text') {
				ctx.strokeStyle = borderColor;
				ctx.lineWidth = 1;
				ctx.lineCap = 'round';
				ctx.setLineDash(TOOL_DOTTED_LINE_DASH);
				ctx.strokeRect(leftX - 2, top - 2, boxW + 4, h + 4);
				ctx.setLineDash([]);
				ctx.lineCap = 'butt';
			}
			ctx.restore();
			return;
		}

		// ============================================================================
		// PATTERN TOOLS: multi-point zigzag (XABCD, Cypher, ABCD, Head & Shoulders, Elliott Waves)
		// ============================================================================
		if (isPatternTool(drawing.type as string) && chart && series && drawing.points?.length) {
			const cfg = getPatternConfig(drawing.type as string);
			if (!cfg) return;
			const ts = chart.timeScale();
			const pts = drawing.points;
			const isInProgress = patternInProgressIdRef?.current === drawing.id;
			const screenPts: { x: number; y: number }[] = [];
			for (const p of pts) {
				const sx = ts.timeToCoordinate(p.time as any);
				const sy = series.priceToCoordinate(p.price);
				if (sx == null || sy == null) return;
				screenPts.push({ x: Number(sx), y: sy });
			}
			if (isInProgress && patternLiveEndTimeRef?.current != null && patternLiveEndPriceRef?.current != null) {
				const lx = ts.timeToCoordinate(patternLiveEndTimeRef.current as any);
				const ly = series.priceToCoordinate(patternLiveEndPriceRef.current);
				if (lx != null && ly != null) screenPts.push({ x: Number(lx), y: ly });
			}
			if (screenPts.length < 1) return;
			const isHidden = !!drawing.hidden;
			const isHeadShoulders = drawing.type === 'head-and-shoulders';
			const isGreenPattern = isHeadShoulders || drawing.type === 'abcd';
			const color = drawing.style?.color || (isGreenPattern ? '#16a34a' : '#2563eb');
			const lw = drawing.style?.width || 2;
			const badgeOpts = isGreenPattern
				? { badgeFill: '#16a34a' as const, badgeFillHidden: 'rgba(22, 163, 74, 0.55)' as const }
				: {};
			ctx.save();
			ctx.beginPath();
			ctx.rect(0, 0, plotWidth || container.getBoundingClientRect().width, container.getBoundingClientRect().height);
			ctx.clip();

			// Solid zigzag lines
			ctx.strokeStyle = color;
			ctx.lineWidth = lw;
			ctx.setLineDash([]);
			ctx.beginPath();
			ctx.moveTo(screenPts[0].x, screenPts[0].y);
			for (let i = 1; i < screenPts.length; i++) ctx.lineTo(screenPts[i].x, screenPts[i].y);
			ctx.stroke();

			// Dashed diagonals (dense dots). For head-and-shoulders, extend the neckline across the full pane.
			if (cfg.diagonals) {
				ctx.save();
				ctx.lineCap = 'round';
				ctx.setLineDash(TOOL_DOTTED_LINE_DASH);
				ctx.lineWidth = 1;
				ctx.globalAlpha = 0.5;
				for (const [a, b] of cfg.diagonals) {
					if (a < screenPts.length && b < screenPts.length) {
						const pa = screenPts[a];
						const pb = screenPts[b];
						ctx.beginPath();
						if (isHeadShoulders && a === 2 && b === 4) {
							const paneW = plotWidth || container.getBoundingClientRect().width;
							const paneH = container.getBoundingClientRect().height;
							const dx = pb.x - pa.x;
							const dy = pb.y - pa.y;
							if (Math.abs(dx) < 0.0001) {
								ctx.moveTo(pa.x, 0);
								ctx.lineTo(pa.x, paneH);
							} else {
								const yAt = (x: number) => pa.y + ((x - pa.x) * dy) / dx;
								ctx.moveTo(0, yAt(0));
								ctx.lineTo(paneW, yAt(paneW));
							}
						} else {
							ctx.moveTo(pa.x, pa.y);
							ctx.lineTo(pb.x, pb.y);
						}
						ctx.stroke();
					}
				}
				ctx.restore();
			}

			// Head-and-shoulders: fade triangle = shoulder-top + middle neckline bubble + crossing corner bubble.
			if (isHeadShoulders && screenPts.length >= 6) {
				const p2 = screenPts[2];
				const p4 = screenPts[4];
				const dx = p4.x - p2.x;
				const dy = p4.y - p2.y;
				if (Math.abs(dx) > 0.0001) {
					const yOnNeckline = (x: number) => p2.y + ((x - p2.x) * dy) / dx;
					const fillOpacity = isInProgress ? 0.18 : 0.25;
					const [r, g, b] = isGreenPattern ? [22, 163, 74] : [59, 130, 246];
					ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${fillOpacity})`;
					const shoulderTriangles: Array<{ corner: { x: number; y: number }; middle: { x: number; y: number }; top: { x: number; y: number } }> = [
						// Left side: crossing corner=0, middle neckline=2, shoulder top=1.
						{ corner: screenPts[0], middle: screenPts[2], top: screenPts[1] },
						// Right side: crossing corner=6, middle neckline=4, shoulder top=5.
						{ corner: screenPts[6], middle: screenPts[4], top: screenPts[5] },
					];
					for (const { corner, middle, top } of shoulderTriangles) {
						const yLine = yOnNeckline(corner.x);
						// Trigger when corner crosses downward below neckline (canvas Y grows downward).
						if (corner.y > yLine + 0.5) {
							// Use the true intersection of (top -> corner) with extended neckline.
							// This keeps the fade inside the same wedge instead of sliding outward with corner x drift.
							const r = { x: corner.x - top.x, y: corner.y - top.y };
							const s = { x: p4.x - p2.x, y: p4.y - p2.y };
							const denom = r.x * s.y - r.y * s.x;
							if (Math.abs(denom) < 0.0001) continue;
							const qp = { x: p2.x - top.x, y: p2.y - top.y };
							const t = (qp.x * s.y - qp.y * s.x) / denom;
							const cut = { x: top.x + t * r.x, y: top.y + t * r.y };

							ctx.beginPath();
							ctx.moveTo(top.x, top.y);
							ctx.lineTo(middle.x, middle.y);
							// Stop fade at the shoulder-edge/neckline cut point.
							ctx.lineTo(cut.x, cut.y);
							ctx.closePath();
							ctx.fill();
						}
					}
				}
			}

			// Filled region when complete — same blue + opacity as rectangle tool (59,130,246; 0.18 in progress / 0.25 done)
			if (cfg.fill && screenPts.length >= cfg.points) {
				const fillOpacity = isInProgress ? 0.18 : 0.25;
				ctx.fillStyle = `rgba(59, 130, 246, ${fillOpacity})`;
				if (cfg.fillTriangles && cfg.fillTriangles.length > 0) {
					for (const tri of cfg.fillTriangles) {
						const [i0, i1, i2] = tri;
						if (i0 < screenPts.length && i1 < screenPts.length && i2 < screenPts.length) {
							ctx.beginPath();
							ctx.moveTo(screenPts[i0].x, screenPts[i0].y);
							ctx.lineTo(screenPts[i1].x, screenPts[i1].y);
							ctx.lineTo(screenPts[i2].x, screenPts[i2].y);
							ctx.closePath();
							ctx.fill();
						}
					}
				} else {
					ctx.beginPath();
					ctx.moveTo(screenPts[0].x, screenPts[0].y);
					for (let i = 1; i < cfg.points; i++) ctx.lineTo(screenPts[i].x, screenPts[i].y);
					ctx.closePath();
					ctx.fill();
				}
			}

			// Labels — badge + white text (green theme for head-and-shoulders + ABCD)
			for (let i = 0; i < Math.min(screenPts.length, cfg.labels.length); i++) {
				const lab = cfg.labels[i]?.trim();
				if (!lab) continue;
				const above = i % 2 === 1;
				const lx = screenPts[i].x;
				const ly = screenPts[i].y + (above ? -14 : 14);
				drawBlueWhiteBadgeLabel(ctx, lab, lx, ly, {
					font: '12px system-ui, sans-serif',
					isHidden,
					...badgeOpts,
				});
			}

			// Fibonacci ratios on diagonals (only for harmonic patterns with diagonals)
			if (!isHeadShoulders && cfg.diagonals && screenPts.length >= 3) {
				for (const [a, b] of cfg.diagonals) {
					if (a >= screenPts.length || b >= screenPts.length) continue;
					const refA = a === 0 && screenPts.length > 1 ? 1 : (a > 0 ? a - 1 : 0);
					const move = Math.abs(screenPts[b].y - screenPts[a].y);
					const base = Math.abs(screenPts[refA].y - screenPts[a].y);
					if (base > 0) {
						const ratio = (move / base).toFixed(3);
						const mx = (screenPts[a].x + screenPts[b].x) / 2;
						const my = (screenPts[a].y + screenPts[b].y) / 2;
						drawBlueWhiteBadgeLabel(ctx, ratio, mx, my, {
							font: '11px system-ui, sans-serif',
							isHidden,
							textLineHeight: 12,
							...badgeOpts,
						});
					}
				}
			}

			// Reposition bubbles — always visible (during drawing and after)
			for (let i = 0; i < Math.min(screenPts.length, cfg.points); i++) {
				if (isInProgress && i === screenPts.length - 1) continue;
				ctx.beginPath();
				ctx.arc(screenPts[i].x, screenPts[i].y, 5, 0, Math.PI * 2);
				ctx.fillStyle = '#fff';
				ctx.fill();
				ctx.strokeStyle = color;
				ctx.lineWidth = 2;
				ctx.stroke();
			}
			ctx.restore();
			return;
		}

		// ============================================================================
		// CIRCLE: center (start) + radius point (end); two reposition bubbles (center + on circumference)
		// ============================================================================
		if (drawing.type === 'circle' && chart && series && drawing.startTime != null && drawing.startPrice != null && drawing.endTime != null && drawing.endPrice != null) {
			const ts = chart.timeScale();
			const cx = Number(ts.timeToCoordinate(drawing.startTime as any));
			const cy = series.priceToCoordinate(drawing.startPrice);
			let rx = Number(ts.timeToCoordinate(drawing.endTime as any));
			let ry = series.priceToCoordinate(drawing.endPrice);
			const isInProgress = circleInProgressIdRef?.current === drawing.id;
			if (isInProgress && circleLiveEndTimeRef?.current != null && circleLiveEndPriceRef?.current != null) {
				rx = Number(ts.timeToCoordinate(circleLiveEndTimeRef.current as any));
				ry = series.priceToCoordinate(circleLiveEndPriceRef.current);
			}
			if (cx == null || cy == null || rx == null || ry == null) return;
			const R = Math.hypot(rx - cx, ry - cy);
			const strokeColor = drawing.style?.color || '#3b82f6';
			ctx.save();
			ctx.beginPath();
			ctx.rect(0, 0, plotWidth || container.getBoundingClientRect().width, container.getBoundingClientRect().height);
			ctx.clip();
			ctx.strokeStyle = strokeColor;
			ctx.lineWidth = drawing.style?.width || 2;
			if (R >= 1) {
				const fillOpacity = isInProgress ? 0.18 : 0.25;
				ctx.fillStyle = `rgba(59, 130, 246, ${fillOpacity})`;
				ctx.beginPath();
				ctx.arc(cx, cy, R, 0, 2 * Math.PI);
				ctx.fill();
				ctx.stroke();
			} else {
				const r = 5;
				ctx.fillStyle = '#ffffff';
				ctx.strokeStyle = strokeColor;
				ctx.lineWidth = 1.5;
				ctx.beginPath();
				ctx.arc(cx, cy, r, 0, 2 * Math.PI);
				ctx.fill();
				ctx.stroke();
			}
			const selected = selectedLineIdRef.current === drawing.id || hoveredLineIdRef.current === drawing.id;
			const showHandles = selected || isInProgress;
			if (showHandles) {
				const handleRadius = 5;
				ctx.fillStyle = '#ffffff';
				ctx.strokeStyle = strokeColor;
				ctx.lineWidth = 1.5;
				ctx.beginPath();
				ctx.arc(cx, cy, handleRadius, 0, 2 * Math.PI);
				ctx.fill();
				ctx.stroke();
				ctx.beginPath();
				ctx.arc(rx, ry, handleRadius, 0, 2 * Math.PI);
				ctx.fill();
				ctx.stroke();
			}
			ctx.restore();
			return;
		}

		// ============================================================================
		// PATH: chart-space polyline; click to add vertices, arrow preview from last vertex, reposition bubbles at each vertex
		// ============================================================================
		const pathPoints = drawing.type === 'path' ? drawing.points : undefined;
		if (drawing.type === 'path' && chart && series && pathPoints && pathPoints.length >= 1) {
			ctx.save();
			ctx.beginPath();
			ctx.rect(0, 0, plotWidth || container.getBoundingClientRect().width, container.getBoundingClientRect().height);
			ctx.clip();

			const ts = chart.timeScale();
			const screenPts: { x: number; y: number }[] = [];
			for (const p of pathPoints) {
				const sx = ts.timeToCoordinate(p.time as any);
				const sy = series.priceToCoordinate(p.price);
				if (sx != null && sy != null) screenPts.push({ x: Number(sx), y: sy });
			}
			if (screenPts.length < 1) {
				ctx.restore();
				return;
			}

			const isInProgress = pathInProgressIdRef?.current === drawing.id;
			const liveEndTime = isInProgress ? pathLiveEndTimeRef?.current : null;
			const liveEndPrice = isInProgress ? pathLiveEndPriceRef?.current : null;
			const strokeColor = drawing.style?.color || '#3b82f6';
			ctx.strokeStyle = strokeColor;
			ctx.lineWidth = drawing.style?.width || 2;
			ctx.lineCap = 'round';
			ctx.lineJoin = 'round';

			// Segments between consecutive vertices
			if (screenPts.length >= 2) {
				ctx.beginPath();
				ctx.moveTo(screenPts[0].x, screenPts[0].y);
				for (let i = 1; i < screenPts.length; i++) {
					ctx.lineTo(screenPts[i].x, screenPts[i].y);
				}
				ctx.stroke();
			}

			// Live preview: line from last vertex to pointer + arrow at pointer
			if (isInProgress && liveEndTime != null && liveEndPrice != null) {
				const endX = Number(ts.timeToCoordinate(liveEndTime as any));
				const endY = series.priceToCoordinate(liveEndPrice);
				if (endX != null && endY != null) {
					const last = screenPts[screenPts.length - 1];
					ctx.beginPath();
					ctx.moveTo(last.x, last.y);
					ctx.lineTo(endX, endY);
					ctx.stroke();
					// Arrow at end (small chevron)
					const dx = endX - last.x;
					const dy = endY - last.y;
					const len = Math.hypot(dx, dy);
					if (len >= 4) {
						const ux = dx / len;
						const uy = dy / len;
						const arrowLen = 8;
						const arrowW = 5;
						ctx.beginPath();
						ctx.moveTo(endX, endY);
						ctx.lineTo(endX - ux * arrowLen - uy * arrowW, endY - uy * arrowLen + ux * arrowW);
						ctx.lineTo(endX - ux * arrowLen * 0.7, endY - uy * arrowLen * 0.7);
						ctx.lineTo(endX - ux * arrowLen + uy * arrowW, endY - uy * arrowLen - ux * arrowW);
						ctx.closePath();
						ctx.fillStyle = strokeColor;
						ctx.fill();
						ctx.stroke();
					}
				}
			}

			const selected = selectedLineIdRef.current === drawing.id || hoveredLineIdRef.current === drawing.id;
			const showBubbles = selected || isInProgress;
			if (showBubbles) {
				const r = 5;
				ctx.fillStyle = '#ffffff';
				ctx.strokeStyle = strokeColor;
				ctx.lineWidth = 1.5;
				for (let i = 0; i < screenPts.length; i++) {
					ctx.beginPath();
					ctx.arc(screenPts[i].x, screenPts[i].y, r, 0, 2 * Math.PI);
					ctx.fill();
					ctx.stroke();
				}
			}
			ctx.restore();
			return;
		}

		// ============================================================================
		// BRUSH: chart-space path (sticks to candles); two visual-only bubbles at ends when selected
		// ============================================================================
		if (drawing.type === 'brush' && chart && series) {
			ctx.save();
			ctx.beginPath();
			ctx.rect(0, 0, plotWidth || container.getBoundingClientRect().width, container.getBoundingClientRect().height);
			ctx.clip();

			let screenPts: { x: number; y: number }[];
			if (drawing.points && drawing.points.length >= 2) {
				screenPts = [];
				const ts = chart.timeScale();
				for (const p of drawing.points) {
					const sx = ts.timeToCoordinate(p.time as any);
					const sy = series.priceToCoordinate(p.price);
					if (sx != null && sy != null) screenPts.push({ x: Number(sx), y: sy });
				}
			} else if (drawing.screenPoints && drawing.screenPoints.length >= 2) {
				screenPts = drawing.screenPoints;
			} else {
				ctx.restore();
				return;
			}
			if (screenPts.length < 2) {
				ctx.restore();
				return;
			}

			ctx.strokeStyle = drawing.style?.color || '#3b82f6';
			ctx.lineWidth = drawing.style?.width || 2;
			ctx.lineCap = 'round';
			ctx.lineJoin = 'round';
			ctx.beginPath();
			strokeSmoothCurve(ctx, screenPts);
			ctx.stroke();

			// Two reposition bubbles at both ends when selected (visual only, not draggable)
			const selected = selectedLineIdRef.current === drawing.id;
			if (selected) {
				const r = 5;
				ctx.fillStyle = '#ffffff';
				ctx.strokeStyle = drawing.style?.color || '#3b82f6';
				ctx.lineWidth = 1.5;
				ctx.beginPath();
				ctx.arc(screenPts[0].x, screenPts[0].y, r, 0, 2 * Math.PI);
				ctx.fill();
				ctx.stroke();
				ctx.beginPath();
				ctx.arc(screenPts[screenPts.length - 1].x, screenPts[screenPts.length - 1].y, r, 0, 2 * Math.PI);
				ctx.fill();
				ctx.stroke();
			}
			ctx.restore();
			return;
		}

		// MVP: screen-space drawing (works immediately, no chart mapping)
		// Skip this for parallel-channel as it has its own rendering logic. Brush is handled above.
		if (drawing.screenPoints && drawing.screenPoints.length >= 1 && (drawing.type as string) !== 'parallel-channel' && drawing.type !== 'brush' && drawing.type !== 'rectangle' && drawing.type !== 'path' && drawing.type !== 'circle') {
			const pts = drawing.screenPoints;
			ctx.save();
			// Clip so we don't draw over the axis area
			ctx.beginPath();
			ctx.rect(0, 0, plotWidth || container.getBoundingClientRect().width, container.getBoundingClientRect().height);
			ctx.clip();

			ctx.strokeStyle = drawing.style?.color || '#3b82f6';
			ctx.lineWidth = drawing.style?.width || 2;
			ctx.lineCap = 'round';
			ctx.lineJoin = 'round';

			// If it's a "line" tool for now: just draw segment start->end
			const start = pts[0];
			// Lines/Ray tool: show first bubble immediately on click (even before drag)
			if ((drawing.type === 'lines' || drawing.type === 'ray' || drawing.type === 'arrow-marker' || drawing.type === 'arrow') && pts.length === 1) {
				const r = 5;
				ctx.save();
				ctx.lineWidth = Math.max(1.5, (drawing.style?.width || 2) * 0.6);
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
			} else if (drawing.type === 'lines' || drawing.type === 'parallel-channel') {
				// Segment tool: draw only between the two bubbles (no extension)
				ctx.beginPath();
				ctx.moveTo(start.x, start.y);
				ctx.lineTo(end.x, end.y);
				ctx.stroke();

				// Show bubbles when:
				// 1. It's the currentDrawing (live preview while drawing)
				// 2. OR line is hovered or selected (completed drawings)
				const isCurrentDrawing = currentDrawingRef.current?.id === drawing.id;
				const isHovered = hoveredLineIdRef.current === drawing.id;
				const isSelected = selectedLineIdRef.current === drawing.id;
				const shouldShowBubbles = isCurrentDrawing || isHovered || isSelected;

				if (shouldShowBubbles) {
					const r = 5;
					ctx.save();
					ctx.lineWidth = Math.max(1.5, (drawing.style?.width || 2) * 0.6);
					ctx.strokeStyle = drawing.style?.color || '#3b82f6';
					ctx.fillStyle = '#ffffff';

					// Check which handle is hovered for glow effect (only for completed drawings)
					const hoveredHandle = hoveredLineHandleIdRef.current;
					const isStartHovered = hoveredHandle === `${drawing.id}:start`;
					const isEndHovered = hoveredHandle === `${drawing.id}:end`;

					// Draw start bubble
					ctx.save();
					if (isStartHovered) {
						ctx.shadowColor = 'rgba(59, 130, 246, 0.9)';
						ctx.shadowBlur = 8;
					}
					ctx.beginPath();
					ctx.arc(start.x, start.y, r, 0, 2 * Math.PI);
					ctx.fill();
					ctx.stroke();
					ctx.restore();

					// Draw end bubble
					ctx.save();
					if (isEndHovered) {
						ctx.shadowColor = 'rgba(59, 130, 246, 0.9)';
						ctx.shadowBlur = 8;
					}
					ctx.beginPath();
					ctx.arc(end.x, end.y, r, 0, 2 * Math.PI);
					ctx.fill();
					ctx.stroke();
					ctx.restore();
					ctx.restore();
				}
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

			const containerWidth = plotWidth || container.getBoundingClientRect().width;
			const isCurrentDrawing = currentDrawingRef.current?.id === drawing.id;
			const isSelected = selectedHorizontalLineIdRef.current === drawing.id;
			const isHidden = !!drawing.hidden;
			const lineColor = isHidden ? 'rgba(148, 163, 184, 0.9)' : isSelected ? '#2563eb' : '#3b82f6';
			const lineWidth = isHidden ? 1 : isSelected ? 2 : (drawing.style?.width || 2);

			const shouldShowSquare =
				selectedHorizontalLineIdRef.current === drawing.id ||
				hoveredHorizontalLineIdRef.current === drawing.id;
			const drawStrokeOnOverlay = !underlayIsPrimitive || isCurrentDrawing;

			const squareSize = 11;
			const squareX = containerWidth - squareSize - 28;
			const squareY = y - squareSize / 2;
			const borderRadius = 3;

			if (drawStrokeOnOverlay) {
				ctx.save();
				ctx.beginPath();
				ctx.rect(0, 0, plotWidth || container.getBoundingClientRect().width, container.getBoundingClientRect().height);
				ctx.clip();
				ctx.strokeStyle = lineColor;
				ctx.lineWidth = lineWidth;
				ctx.lineCap = 'round';
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
				ctx.restore();
			}

			// Draw rounded corner square on the right border (only if hovered/selected) – opaque white fill so line doesn't show through
			if (shouldShowSquare) {
				const isHandleHovered = hoveredHorizontalLineHandleIdRef.current === drawing.id;
				ctx.save();
				ctx.fillStyle = '#ffffff';
				ctx.strokeStyle = lineColor;
				ctx.lineWidth = 1.5;
				if (isHandleHovered) {
					ctx.shadowColor = 'rgba(59, 130, 246, 0.9)';
					ctx.shadowBlur = 8;
				}
				ctx.beginPath();
				drawRoundedRect(ctx, squareX, squareY, squareSize, squareSize, borderRadius);
				ctx.fill();
				ctx.stroke();
				ctx.restore();
			}

			ctx.restore();
			return;
		}

		// Chart-space Lines/Ray/Info-line tool: show first bubble immediately (before second click)
		if ((drawing.type === 'lines' || drawing.type === 'ray' || drawing.type === 'info-line' || drawing.type === 'arrow-marker' || drawing.type === 'arrow') && drawing.points && drawing.points.length === 1) {
			const p = chartToScreen(drawing.points[0]);
			if (!p) return;
			ctx.save();
			ctx.fillStyle = '#ffffff';
			ctx.strokeStyle = drawing.style?.color || '#3b82f6';
			ctx.lineWidth = Math.max(1.5, (drawing.style?.width || 2) * 0.6);
			ctx.beginPath();
			ctx.arc(p.x, p.y, 5, 0, 2 * Math.PI);
			ctx.fill();
			ctx.stroke();
			ctx.restore();
			return;
		}

		// Chart-space horizontal ray: anchored by time and price, extends to right edge
		if (drawing.type === 'horizontal-ray' && drawing.points && drawing.points.length >= 1) {
			const point = drawing.points[0];
			const startX = chart ? chart.timeScale().timeToCoordinate(point.time as any) : null;
			const y = series ? series.priceToCoordinate(point.price) : null;
			if (startX == null || y == null) return;

			const containerWidth = plotWidth || container.getBoundingClientRect().width;
			const isCurrentDrawing = currentDrawingRef.current?.id === drawing.id;
			const isSelected = selectedHorizontalRayIdRef.current === drawing.id;
			const isHidden = !!drawing.hidden;
			const lineColor = isHidden ? 'rgba(148, 163, 184, 0.9)' : isSelected ? '#2563eb' : '#3b82f6';
			const lineWidth = isHidden ? 1 : isSelected ? 2 : (drawing.style?.width || 2);

			const shouldShowBubble =
				selectedHorizontalRayIdRef.current === drawing.id ||
				hoveredHorizontalRayIdRef.current === drawing.id;
			const drawStrokeOnOverlay = !underlayIsPrimitive || isCurrentDrawing;

			if (drawStrokeOnOverlay) {
				ctx.save();
				ctx.beginPath();
				ctx.rect(0, 0, plotWidth || container.getBoundingClientRect().width, container.getBoundingClientRect().height);
				ctx.clip();
				ctx.strokeStyle = lineColor;
				ctx.lineWidth = lineWidth;
				ctx.lineCap = 'round';
				ctx.beginPath();
				ctx.moveTo(startX, y);
				ctx.lineTo(containerWidth, y);
				ctx.stroke();
				ctx.restore();
			}

			if (shouldShowBubble) {
				const r = 5;
				const isHandleHovered = hoveredHorizontalRayHandleIdRef.current === drawing.id;
				ctx.save();
				ctx.fillStyle = '#ffffff';
				ctx.strokeStyle = lineColor;
				ctx.lineWidth = Math.max(1.5, lineWidth * 0.6);
				if (isHandleHovered) {
					ctx.shadowColor = 'rgba(59, 130, 246, 0.9)';
					ctx.shadowBlur = 8;
				}
				ctx.beginPath();
				ctx.arc(startX, y, r, 0, 2 * Math.PI);
				ctx.fill();
				ctx.stroke();
				ctx.restore();
			}

			ctx.restore();
			return;
		}

		// Arrow Mark Up / Arrow Mark Down: single-point directional arrow
		if ((drawing.type === 'arrow-markup' || drawing.type === 'arrow-markdown') && drawing.points && drawing.points.length >= 1) {
			const scrPt = chartToScreen(drawing.points[0]);
			if (scrPt) {
				const isCurrentDrawing = currentDrawingRef.current?.id === drawing.id;
				const isHovered = hoveredLineIdRef.current === drawing.id;
				const isSelected = selectedLineIdRef.current === drawing.id;
				const shouldShowBubbles = isCurrentDrawing || isHovered || isSelected;

				const plotW = plotWidth || container.getBoundingClientRect().width;
				ctx.save();
				ctx.beginPath();
				ctx.rect(0, 0, plotW, container.getBoundingClientRect().height);
				ctx.clip();

				const isUp = drawing.type === 'arrow-markup';
				const color = drawing.style?.color || (isUp ? '#22c55e' : '#ef4444');
				const dir = isUp ? -1 : 1;
				const arrowH = 28, arrowW = 18, headH = 16, shaftW = 7;

				const tipX = scrPt.x;
				const tipY = scrPt.y + dir * arrowH;
				const headBaseY = scrPt.y + dir * (arrowH - headH);
				const baseY = scrPt.y;

				ctx.beginPath();
				ctx.moveTo(tipX, tipY);
				ctx.lineTo(scrPt.x + arrowW / 2, headBaseY);
				ctx.lineTo(scrPt.x + shaftW / 2, headBaseY);
				ctx.lineTo(scrPt.x + shaftW / 2, baseY);
				ctx.lineTo(scrPt.x - shaftW / 2, baseY);
				ctx.lineTo(scrPt.x - shaftW / 2, headBaseY);
				ctx.lineTo(scrPt.x - arrowW / 2, headBaseY);
				ctx.closePath();
				ctx.fillStyle = color;
				ctx.fill();

				if (shouldShowBubbles) {
					const r = 5;
					ctx.fillStyle = '#ffffff';
					ctx.strokeStyle = color;
					ctx.lineWidth = 1.5;
					ctx.beginPath();
					ctx.arc(tipX, tipY, r, 0, Math.PI * 2);
					ctx.fill();
					ctx.stroke();
				}

				ctx.restore();
			}
			return;
		}

		// Curve: quadratic Bezier with start, control (middle lever), end. Supports 1 pt (bubble only), 2 pts (preview), 3 pts (full).
		if (drawing.type === 'curve' && drawing.points && drawing.points.length >= 1) {
			let pts: { x: number; y: number }[] = [];
			if (drawing.points.length === 3) {
				const [p0, p1, p2] = drawing.points;
				let s0 = chartToScreen(p0);
				let s1 = chartToScreen(p1);
				let s2 = chartToScreen(p2);
				const valid = (s: { x: number; y: number } | null) => s != null && Number.isFinite(s.x) && Number.isFinite(s.y);
				if (valid(s0) && valid(s2)) {
					const s0v = s0 as { x: number; y: number };
					const s2v = s2 as { x: number; y: number };
					let s1v: { x: number; y: number };
					if (!valid(s1)) {
						const timeSpan = (p2.time as number) - (p0.time as number);
						const priceSpan = p2.price - p0.price;
						s1v = {
							x: timeSpan !== 0 ? (s0v.x + (s2v.x - s0v.x) * ((p1.time as number) - (p0.time as number)) / timeSpan) : (s0v.x + s2v.x) / 2,
							y: priceSpan !== 0 ? (s0v.y + (s2v.y - s0v.y) * (p1.price - p0.price) / priceSpan) : (s0v.y + s2v.y) / 2,
						};
					} else {
						s1v = s1 as { x: number; y: number };
					}
					pts = [s0v, s1v, s2v];
				} else {
					const ok = [s0, s1, s2].filter((p): p is { x: number; y: number } => valid(p));
					if (ok.length === 0) return;
					const mid = ok.length >= 2 ? { x: ok.reduce((a, p) => a + p.x, 0) / ok.length, y: ok.reduce((a, p) => a + p.y, 0) / ok.length } : ok[0];
					pts = [s0 && valid(s0) ? s0 : mid, s1 && valid(s1) ? s1 : mid, s2 && valid(s2) ? s2 : mid];
				}
			} else {
				pts = drawing.points.map(chartToScreen).filter((p): p is { x: number; y: number } => p !== null);
			}
			if (pts.length < 1) return;
			const isCurrentDrawing = currentDrawingRef.current?.id === drawing.id;
			const isHovered = hoveredLineIdRef.current === drawing.id;
			const isSelected = selectedLineIdRef.current === drawing.id;
			const shouldShowBubbles = isCurrentDrawing || isHovered || isSelected;

			const plotW = plotWidth || container.getBoundingClientRect().width;
			ctx.save();
			ctx.beginPath();
			ctx.rect(0, 0, plotW, container.getBoundingClientRect().height);
			ctx.clip();

			const color = drawing.style?.color || '#3b82f6';
			ctx.strokeStyle = color;
			ctx.lineWidth = drawing.style?.width ?? 2;
			ctx.lineCap = 'round';
			ctx.lineJoin = 'round';

			if (pts.length === 1) {
				if (shouldShowBubbles) {
					const r = 5;
					ctx.fillStyle = '#ffffff';
					ctx.strokeStyle = color;
					ctx.lineWidth = 1.5;
					ctx.beginPath();
					ctx.arc(pts[0].x, pts[0].y, r, 0, Math.PI * 2);
					ctx.fill();
					ctx.stroke();
				}
			} else if (pts.length === 2) {
				const [p0, p1] = pts;
				const midX = (p0.x + p1.x) / 2, midY = (p0.y + p1.y) / 2;
				const dx = p1.x - p0.x, dy = p1.y - p0.y;
				const len = Math.hypot(dx, dy) || 1;
				const offset = len * 0.4;
				const perpX = -dy / len * offset, perpY = dx / len * offset;
				const ctrl = { x: midX + perpX, y: midY + perpY };
				ctx.beginPath();
				ctx.moveTo(p0.x, p0.y);
				ctx.quadraticCurveTo(ctrl.x, ctrl.y, p1.x, p1.y);
				ctx.stroke();
				if (shouldShowBubbles) {
					const r = 5;
					ctx.fillStyle = '#ffffff';
					ctx.strokeStyle = color;
					ctx.lineWidth = 1.5;
					ctx.beginPath();
					ctx.arc(p0.x, p0.y, r, 0, Math.PI * 2);
					ctx.fill();
					ctx.stroke();
				}
			} else {
				const [p0, ctrl, p2] = pts;
				ctx.beginPath();
				ctx.moveTo(p0.x, p0.y);
				ctx.quadraticCurveTo(ctrl.x, ctrl.y, p2.x, p2.y);
				ctx.stroke();
				if (shouldShowBubbles) {
					const r = 5;
					ctx.fillStyle = '#ffffff';
					ctx.strokeStyle = color;
					ctx.lineWidth = 1.5;
					const midOnCurve = {
						x: 0.25 * p0.x + 0.5 * ctrl.x + 0.25 * p2.x,
						y: 0.25 * p0.y + 0.5 * ctrl.y + 0.25 * p2.y,
					};
					for (const p of [p0, midOnCurve, p2]) {
						ctx.beginPath();
						ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
						ctx.fill();
						ctx.stroke();
					}
				}
			}
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
		const lineWidth = drawing.style?.width ?? 2;
		ctx.lineWidth = lineWidth;
		ctx.lineCap = 'round';
		ctx.lineJoin = 'round';

		// Generalized drawing renderer - works for different drawing types
		if (drawing.type === 'ray' && screenPoints.length >= 2) {
			// ============================================================================
			// RAY TOOL: Rendering Logic
			// ============================================================================
			const start = screenPoints[0];
			const end = screenPoints[1];
			const isCurrentDrawing = currentDrawingRef.current?.id === drawing.id;
			const isHovered = hoveredLineIdRef.current === drawing.id;
			const isSelected = selectedLineIdRef.current === drawing.id;
			const shouldShowBubbles = isCurrentDrawing || isHovered || isSelected;
			const drawStrokeOnOverlay = !underlayIsPrimitive || isCurrentDrawing;

			const plotW = plotWidth || container.getBoundingClientRect().width;
			const plotH = container.getBoundingClientRect().height;
			ctx.save();
			ctx.beginPath();
			ctx.rect(0, 0, plotW, plotH);
			ctx.clip();

			// Calculate direction vector from start to end
			const dx = end.x - start.x;
			const dy = end.y - start.y;
			const length = Math.sqrt(dx * dx + dy * dy);

			if (length > 0) {
				const unitX = dx / length;
				const unitY = dy / length;

				// Extend ray from start point through end point to chart edge
				let finalX = end.x;
				let finalY = end.y;

				const intersections: { x: number; y: number; t: number }[] = [];
				if (unitX < 0) {
					const t = (0 - start.x) / unitX;
					const y = start.y + unitY * t;
					if (y >= 0 && y <= plotH) intersections.push({ x: 0, y, t });
				}
				if (unitX > 0) {
					const t = (plotW - start.x) / unitX;
					const y = start.y + unitY * t;
					if (y >= 0 && y <= plotH) intersections.push({ x: plotW, y, t });
				}
				if (unitY < 0) {
					const t = (0 - start.y) / unitY;
					const x = start.x + unitX * t;
					if (x >= 0 && x <= plotW) intersections.push({ x, y: 0, t });
				}
				if (unitY > 0) {
					const t = (plotH - start.y) / unitY;
					const x = start.x + unitX * t;
					if (x >= 0 && x <= plotW) intersections.push({ x, y: plotH, t });
				}
				if (intersections.length > 0) {
					const furthest = intersections.reduce((prev, curr) => (curr.t > prev.t ? curr : prev));
					finalX = furthest.x;
					finalY = furthest.y;
				}

				if (drawStrokeOnOverlay) {
					ctx.strokeStyle = drawing.style?.color || '#3b82f6';
					ctx.lineWidth = drawing.style?.width ?? 2;
					ctx.lineCap = 'round';
					ctx.beginPath();
					ctx.moveTo(start.x, start.y);
					ctx.lineTo(finalX, finalY);
					ctx.stroke();
				}

				if (shouldShowBubbles) {
					const r = 5;
					ctx.fillStyle = '#ffffff';
					ctx.strokeStyle = drawing.style?.color || '#3b82f6';
					ctx.lineWidth = Math.max(1.5, (drawing.style?.width || 2) * 0.6);

					// Check which handle is hovered for glow effect
					const hoveredHandle = hoveredLineHandleIdRef.current;
					const isStartHovered = hoveredHandle === `${drawing.id}:start`;
					const isEndHovered = hoveredHandle === `${drawing.id}:end`;

					// Draw start bubble (at first point)
					ctx.save();
					if (isStartHovered) {
						ctx.shadowColor = 'rgba(59, 130, 246, 0.9)';
						ctx.shadowBlur = 8;
					}
					ctx.beginPath();
					ctx.arc(start.x, start.y, r, 0, 2 * Math.PI);
					ctx.fill();
					ctx.stroke();
					ctx.restore();

					// Draw end bubble (at second point, not at the edge)
					ctx.save();
					if (isEndHovered) {
						ctx.shadowColor = 'rgba(59, 130, 246, 0.9)';
						ctx.shadowBlur = 8;
					}
					ctx.beginPath();
					ctx.arc(end.x, end.y, r, 0, 2 * Math.PI);
					ctx.fill();
					ctx.stroke();
					ctx.restore();
				}
			}

			ctx.restore();
			ctx.restore();
			return;
		}

		// ============================================================================
		// INFO LINE: trend line + gray info box below with 3 stats + optional center label
		// ============================================================================
		if (drawing.type === 'info-line' && drawing.points && drawing.points.length >= 2 && screenPoints.length >= 2) {
			const start = screenPoints[0];
			const end = screenPoints[screenPoints.length - 1];
			const p0 = drawing.points[0];
			const p1 = drawing.points[1];
			const isCurrentDrawing = currentDrawingRef.current?.id === drawing.id;
			const isHovered = hoveredLineIdRef.current === drawing.id;
			const isSelected = selectedLineIdRef.current === drawing.id;
			const shouldShowBubbles = isCurrentDrawing || isHovered || isSelected;
			const plotW = plotWidth || container.getBoundingClientRect().width;
			const plotH = container.getBoundingClientRect().height;
			ctx.save();
			ctx.beginPath();
			ctx.rect(0, 0, plotW, plotH);
			ctx.clip();

			// 1. Draw the trend line (always on overlay so it's visible; info-line has no underlay primitive)
			ctx.strokeStyle = drawing.style?.color || '#3b82f6';
			ctx.lineWidth = drawing.style?.width ?? 2;
			ctx.lineCap = 'round';
			ctx.beginPath();
			ctx.moveTo(start.x, start.y);
			ctx.lineTo(end.x, end.y);
			ctx.stroke();

			// 2. Stats for the gray box (left-aligned; + sign and numbers align with other lines)
			const priceDiff = p1.price - p0.price;
			const pct = p0.price !== 0 ? (priceDiff / p0.price) * 100 : 0;
			const line1 = (priceDiff >= 0 ? '+' : '') + priceDiff.toFixed(2) + ' (' + pct.toFixed(2) + '%)';
			const bars = candlestickDataRef?.current ?? [];
			const minT = Math.min(p0.time as number, p1.time as number);
			const maxT = Math.max(p0.time as number, p1.time as number);
			const barCount = bars.filter((b) => (b.time as number) >= minT && (b.time as number) <= maxT).length;
			const timeSpanSec = Math.abs((p1.time as number) - (p0.time as number));
			const daysNum = timeSpanSec / 86400;
			const timeStr = daysNum >= 1 ? `${Math.round(daysNum)}d` : `${(timeSpanSec / 3600).toFixed(1)}h`;
			const distPx = Math.round(Math.hypot(end.x - start.x, end.y - start.y));
			const line2 = `${barCount} bars (${timeStr}), distance: ${distPx} px`;
			const angleRad = Math.atan2(start.y - end.y, end.x - start.x);
			const angleDeg = (angleRad * 180 / Math.PI).toFixed(2);
			const line3 = `${angleDeg}°`;

			// 3. Gray box offset perpendicular to the line so it never overlaps the segment
			const midX = (start.x + end.x) / 2;
			const midY = (start.y + end.y) / 2;
			const dx = end.x - start.x;
			const dy = end.y - start.y;
			const len = Math.hypot(dx, dy) || 1;
			const boxPad = 18;
			const lineHeight = 17;
			const lineSpacing = 30;
			const iconSize = 14;
			const iconGap = 12;
			const font = '12px "Trebuchet MS", "Roboto", "Segoe UI", system-ui, sans-serif';
			ctx.font = font;
			const w1 = ctx.measureText(line1).width;
			const w2 = ctx.measureText(line2).width;
			const w3 = ctx.measureText(line3).width;
			const textWidth = Math.max(w1, w2, w3);
			const boxW = boxPad * 2 + iconSize + iconGap + textWidth;
			const boxH = boxPad * 2 + lineSpacing * 2 + lineHeight;
			// Unit perpendicular pointing to one side of the line (so box stays off the segment)
			const perpX = -dy / len;
			const perpY = dx / len;
			// Fixed perpendicular gap from line to nearest edge of box (half-extent of rect in perp direction)
			const fixedGap = 20;
			const boxHalfExtentInPerp = (boxW / 2) * Math.abs(perpX) + (boxH / 2) * Math.abs(perpY);
			const offsetDist = fixedGap + boxHalfExtentInPerp;
			let boxCenterX = midX + perpX * offsetDist;
			let boxCenterY = midY + perpY * offsetDist;
			let boxLeft = boxCenterX - boxW / 2;
			let boxTop = boxCenterY - boxH / 2;
			if (boxLeft < 4) boxLeft = 4;
			if (boxLeft + boxW > plotW - 4) boxLeft = plotW - boxW - 4;
			if (boxTop < 4) boxTop = 4;
			if (boxTop + boxH > plotH - 4) boxTop = plotH - boxH - 4;
			ctx.fillStyle = 'rgba(100, 108, 120, 0.88)';
			ctx.strokeStyle = 'rgba(71, 78, 90, 0.85)';
			ctx.lineWidth = 1;
			ctx.beginPath();
			drawRoundedRect(ctx, boxLeft, boxTop, boxW, boxH, 8);
			ctx.fill();
			ctx.stroke();
			ctx.fillStyle = '#ffffff';
			ctx.textAlign = 'left';
			ctx.textBaseline = 'middle';
			const textX = boxLeft + boxPad + iconSize + iconGap;
			const iconCenterX = boxLeft + boxPad + iconSize / 2;
			// Helper to draw icon and text for each row
			const drawRow = (rowIndex: number, text: string, drawIcon: (cx: number, cy: number) => void) => {
				const cy = boxTop + boxPad + lineSpacing * rowIndex + lineHeight / 2;
				ctx.save();
				ctx.strokeStyle = '#ffffff';
				ctx.lineWidth = 1.5;
				ctx.lineCap = 'round';
				drawIcon(iconCenterX, cy);
				ctx.restore();
				ctx.fillText(text, textX, cy);
			};
			// Row 0: vertical height icon (vertical bar with end caps)
			drawRow(0, line1, (cx, cy) => {
				ctx.beginPath();
				ctx.moveTo(cx, cy - 6);
				ctx.lineTo(cx, cy + 6);
				ctx.stroke();
				ctx.beginPath();
				ctx.moveTo(cx - 2.5, cy - 6);
				ctx.lineTo(cx + 2.5, cy - 6);
				ctx.moveTo(cx - 2.5, cy + 6);
				ctx.lineTo(cx + 2.5, cy + 6);
				ctx.stroke();
			});
			// Row 1: horizontal distance icon (horizontal line with end caps)
			drawRow(1, line2, (cx, cy) => {
				ctx.beginPath();
				ctx.moveTo(cx - 6, cy);
				ctx.lineTo(cx + 6, cy);
				ctx.stroke();
				ctx.beginPath();
				ctx.moveTo(cx - 6, cy - 2.5);
				ctx.lineTo(cx - 6, cy + 2.5);
				ctx.moveTo(cx + 6, cy - 2.5);
				ctx.lineTo(cx + 6, cy + 2.5);
				ctx.stroke();
			});
			// Row 2: angle icon (two lines forming an angle)
			drawRow(2, line3, (cx, cy) => {
				ctx.beginPath();
				ctx.moveTo(cx - 5, cy + 5);
				ctx.lineTo(cx, cy - 5);
				ctx.lineTo(cx + 6, cy + 4);
				ctx.stroke();
			});

			// 4. Optional label centered on the line (on the segment)
			if (drawing.label && drawing.label.trim()) {
				ctx.save();
				ctx.font = '12px system-ui, sans-serif';
				ctx.fillStyle = drawing.style?.color || '#3b82f6';
				ctx.strokeStyle = '#ffffff';
				ctx.lineWidth = 2.5;
				ctx.textAlign = 'center';
				ctx.textBaseline = 'middle';
				ctx.strokeText(drawing.label.trim(), midX, midY);
				ctx.fillText(drawing.label.trim(), midX, midY);
				ctx.restore();
			}

			// 5. Bubbles when selected/hovered
			if (shouldShowBubbles) {
				const r = 5;
				ctx.fillStyle = '#ffffff';
				ctx.strokeStyle = drawing.style?.color || '#3b82f6';
				ctx.lineWidth = Math.max(1.5, (drawing.style?.width || 2) * 0.6);
				const hoveredHandle = hoveredLineHandleIdRef.current;
				const isStartHovered = hoveredHandle === `${drawing.id}:start`;
				const isEndHovered = hoveredHandle === `${drawing.id}:end`;
				ctx.save();
				if (isStartHovered) { ctx.shadowColor = 'rgba(59, 130, 246, 0.9)'; ctx.shadowBlur = 8; }
				ctx.beginPath();
				ctx.arc(start.x, start.y, r, 0, 2 * Math.PI);
				ctx.fill();
				ctx.stroke();
				ctx.restore();
				ctx.save();
				if (isEndHovered) { ctx.shadowColor = 'rgba(59, 130, 246, 0.9)'; ctx.shadowBlur = 8; }
				ctx.beginPath();
				ctx.arc(end.x, end.y, r, 0, 2 * Math.PI);
				ctx.fill();
				ctx.stroke();
				ctx.restore();
			}
			ctx.restore();
			ctx.restore();
			return;
		}

		if (drawing.type === 'lines' && screenPoints.length >= 2) {
			const start = screenPoints[0];
			const end = screenPoints[screenPoints.length - 1];

			const isCurrentDrawing = currentDrawingRef.current?.id === drawing.id;
			const isHovered = hoveredLineIdRef.current === drawing.id;
			const isSelected = selectedLineIdRef.current === drawing.id;
			const shouldShowBubbles = isCurrentDrawing || isHovered || isSelected;
			const drawStrokeOnOverlay = !underlayIsPrimitive || isCurrentDrawing;

			// Segment-only renderer (chart-space): bubble -> bubble, no extension
			const plotW = plotWidth || container.getBoundingClientRect().width;
			ctx.save();
			ctx.beginPath();
			ctx.rect(0, 0, plotW, container.getBoundingClientRect().height);
			ctx.clip();

			if (drawStrokeOnOverlay) {
				ctx.strokeStyle = drawing.style?.color || '#3b82f6';
				ctx.lineWidth = drawing.style?.width ?? 2;
				ctx.lineCap = 'round';
				ctx.beginPath();
				ctx.moveTo(start.x, start.y);
				ctx.lineTo(end.x, end.y);
				ctx.stroke();
			}

			if (shouldShowBubbles) {
				const r = 5;
				ctx.fillStyle = '#ffffff';
				ctx.strokeStyle = drawing.style?.color || '#3b82f6';
				ctx.lineWidth = Math.max(1.5, (drawing.style?.width || 2) * 0.6);

				// Check which handle is hovered for glow effect
				const hoveredHandle = hoveredLineHandleIdRef.current;
				const isStartHovered = hoveredHandle === `${drawing.id}:start`;
				const isEndHovered = hoveredHandle === `${drawing.id}:end`;

				// Draw start bubble
				ctx.save();
				if (isStartHovered) {
					ctx.shadowColor = 'rgba(59, 130, 246, 0.9)';
					ctx.shadowBlur = 8;
				}
				ctx.beginPath();
				ctx.arc(start.x, start.y, r, 0, 2 * Math.PI);
				ctx.fill();
				ctx.stroke();
				ctx.restore();

				// Draw end bubble
				ctx.save();
				if (isEndHovered) {
					ctx.shadowColor = 'rgba(59, 130, 246, 0.9)';
					ctx.shadowBlur = 8;
				}
				ctx.beginPath();
				ctx.arc(end.x, end.y, r, 0, 2 * Math.PI);
				ctx.fill();
				ctx.stroke();
				ctx.restore();
			}

			ctx.restore();
			ctx.restore();
			return;
		}

	// Simple arrow: line from start to end + ">" chevron at tip; always draw on overlay (not in underlay primitive)
	if (drawing.type === 'arrow' && screenPoints.length >= 2) {
			const start = screenPoints[0];
			const end = screenPoints[screenPoints.length - 1];

			const isCurrentDrawing = currentDrawingRef.current?.id === drawing.id;
			const isHovered = hoveredLineIdRef.current === drawing.id;
			const isSelected = selectedLineIdRef.current === drawing.id;
			const shouldShowBubbles = isCurrentDrawing || isHovered || isSelected;
			const drawOnOverlay = drawing.type === 'arrow' || drawing.type === 'arrow-marker' ? true : (!underlayIsPrimitive || isCurrentDrawing);

			const plotW = plotWidth || container.getBoundingClientRect().width;
			ctx.save();
			ctx.beginPath();
			ctx.rect(0, 0, plotW, container.getBoundingClientRect().height);
			ctx.clip();

			const color = drawing.style?.color || '#3b82f6';
			const lineW = drawing.style?.width ?? 2;
			const dx = end.x - start.x;
			const dy = end.y - start.y;
			const len = Math.sqrt(dx * dx + dy * dy) || 1;
			const ux = dx / len;
			const uy = dy / len;
			const perpX = -uy;
			const perpY = ux;
			const arrowheadLen = 13;
			const arrowheadHalfW = 8;

			if (drawOnOverlay) {
				ctx.strokeStyle = color;
				ctx.lineWidth = lineW;
				ctx.lineCap = 'round';
				ctx.lineJoin = 'round';
				ctx.beginPath();
				ctx.moveTo(start.x, start.y);
				ctx.lineTo(end.x, end.y);
				ctx.stroke();

				// ">" chevron at tip: two lines meeting at the point (like >)
				const baseX = end.x - ux * arrowheadLen;
				const baseY = end.y - uy * arrowheadLen;
				const leftX = baseX + perpX * arrowheadHalfW;
				const leftY = baseY + perpY * arrowheadHalfW;
				const rightX = baseX - perpX * arrowheadHalfW;
				const rightY = baseY - perpY * arrowheadHalfW;
				ctx.beginPath();
				ctx.moveTo(end.x, end.y);
				ctx.lineTo(leftX, leftY);
				ctx.moveTo(end.x, end.y);
				ctx.lineTo(rightX, rightY);
				ctx.strokeStyle = color;
				ctx.lineWidth = lineW;
				ctx.stroke();
			}

			if (shouldShowBubbles) {
				const r = 5;
				ctx.fillStyle = '#ffffff';
				ctx.strokeStyle = color;
				ctx.lineWidth = 1.5;
				const hoveredHandle = hoveredLineHandleIdRef.current;
				const isStartHovered = hoveredHandle === `${drawing.id}:start`;
				const isEndHovered = hoveredHandle === `${drawing.id}:end`;
				ctx.save();
				if (isStartHovered) { ctx.shadowColor = 'rgba(59, 130, 246, 0.9)'; ctx.shadowBlur = 8; }
				ctx.beginPath();
				ctx.arc(start.x, start.y, r, 0, 2 * Math.PI);
				ctx.fill();
				ctx.stroke();
				ctx.restore();
				ctx.save();
				if (isEndHovered) { ctx.shadowColor = 'rgba(59, 130, 246, 0.9)'; ctx.shadowBlur = 8; }
				ctx.beginPath();
				ctx.arc(end.x, end.y, r, 0, 2 * Math.PI);
				ctx.fill();
				ctx.stroke();
				ctx.restore();
			}

			ctx.restore();
			ctx.restore();
			return;
		}

		if (drawing.type === 'arrow-marker' && screenPoints.length >= 2) {
			const start = screenPoints[0];
			const end = screenPoints[screenPoints.length - 1];

			const isCurrentDrawing = currentDrawingRef.current?.id === drawing.id;
			const isHovered = hoveredLineIdRef.current === drawing.id;
			const isSelected = selectedLineIdRef.current === drawing.id;
			const shouldShowBubbles = isCurrentDrawing || isHovered || isSelected;
			// Arrow-marker is not drawn by underlay primitive, so always draw on overlay
			const drawOnOverlay = drawing.type === 'arrow-marker' ? true : (!underlayIsPrimitive || isCurrentDrawing);

			const plotW = plotWidth || container.getBoundingClientRect().width;
			ctx.save();
			ctx.beginPath();
			ctx.rect(0, 0, plotW, container.getBoundingClientRect().height);
			ctx.clip();

			const color = drawing.style?.color || '#3b82f6';
			const dx = end.x - start.x;
			const dy = end.y - start.y;
			const len = Math.sqrt(dx * dx + dy * dy) || 1;
			const ux = dx / len;
			const uy = dy / len;
			const perpX = -uy;
			const perpY = ux;

			// Scale whole figure with distance: reference length ~40px, scale proportionally (min so it's visible when short)
			const refLen = 40;
			const scale = Math.max(0.5, Math.min(2.5, len / refLen));
			const shaftWidth = 4 * scale;           // base for shaft thickness

			if (drawOnOverlay) {
				// One continuous arrow: narrow at start, broad body, point at end (single figure, proper arrowhead)
				const halfWidthStart = shaftWidth * 0.25;
				const halfWidthEnd = shaftWidth * 2.5;
				const arrowheadLen = 12 * scale;  // how far back the "shoulders" of the arrowhead are from the tip
				const baseDist = len - arrowheadLen;  // distance from start to arrowhead base (broad end)

				const s1x = start.x + perpX * halfWidthStart;
				const s1y = start.y + perpY * halfWidthStart;
				const s2x = start.x - perpX * halfWidthStart;
				const s2y = start.y - perpY * halfWidthStart;
				const e1x = start.x + ux * baseDist + perpX * halfWidthEnd;
				const e1y = start.y + uy * baseDist + perpY * halfWidthEnd;
				const e2x = start.x + ux * baseDist - perpX * halfWidthEnd;
				const e2y = start.y + uy * baseDist - perpY * halfWidthEnd;
				const tipX = end.x;
				const tipY = end.y;

				// Single path: s1 -> e1 -> tip -> e2 -> s2 (one arrow shape with point at end)
				ctx.beginPath();
				ctx.moveTo(s1x, s1y);
				ctx.lineTo(e1x, e1y);
				ctx.lineTo(tipX, tipY);
				ctx.lineTo(e2x, e2y);
				ctx.lineTo(s2x, s2y);
				ctx.closePath();
				ctx.fillStyle = color;
				ctx.fill();

				// Thick ">" arrow pointer at tip (same style as simple arrow, but thicker and large)
				const pointerLen = 24 * scale;
				const pointerHalfW = 20 * scale;
				const basePX = end.x - ux * pointerLen;
				const basePY = end.y - uy * pointerLen;
				const plX = basePX + perpX * pointerHalfW;
				const plY = basePY + perpY * pointerHalfW;
				const prX = basePX - perpX * pointerHalfW;
				const prY = basePY - perpY * pointerHalfW;
				ctx.beginPath();
				ctx.moveTo(end.x, end.y);
				ctx.lineTo(plX, plY);
				ctx.moveTo(end.x, end.y);
				ctx.lineTo(prX, prY);
				ctx.strokeStyle = color;
				ctx.lineWidth = Math.max(4, shaftWidth * 1.2);
				ctx.lineCap = 'round';
				ctx.lineJoin = 'round';
				ctx.stroke();
			}

			// Reposition bubbles on top
			if (shouldShowBubbles) {
				const r = 5;
				ctx.fillStyle = '#ffffff';
				ctx.strokeStyle = color;
				ctx.lineWidth = 1.5;

				const hoveredHandle = hoveredLineHandleIdRef.current;
				const isStartHovered = hoveredHandle === `${drawing.id}:start`;
				const isEndHovered = hoveredHandle === `${drawing.id}:end`;

				ctx.save();
				if (isStartHovered) {
					ctx.shadowColor = 'rgba(59, 130, 246, 0.9)';
					ctx.shadowBlur = 8;
				}
				ctx.beginPath();
				ctx.arc(start.x, start.y, r, 0, 2 * Math.PI);
				ctx.fill();
				ctx.stroke();
				ctx.restore();

				ctx.save();
				if (isEndHovered) {
					ctx.shadowColor = 'rgba(59, 130, 246, 0.9)';
					ctx.shadowBlur = 8;
				}
				ctx.beginPath();
				ctx.arc(end.x, end.y, r, 0, 2 * Math.PI);
				ctx.fill();
				ctx.stroke();
				ctx.restore();
			}

			ctx.restore();
			ctx.restore();
			return;
		}

		// Parallel Channel: render two parallel lines with shaded area
		// Use screenPoints if available (during preview) for smooth rendering, otherwise use converted screenPoints
		if (drawing.type === 'parallel-channel') {
			let parallelScreenPoints = drawing.screenPoints && drawing.screenPoints.length >= 2 
				? drawing.screenPoints 
				: screenPoints.length >= 2 
					? screenPoints 
					: null;
			
			if (!parallelScreenPoints || parallelScreenPoints.length < 2) return;
			const plotW = plotWidth || container.getBoundingClientRect().width;
			ctx.save();
			ctx.beginPath();
			ctx.rect(0, 0, plotW, container.getBoundingClientRect().height);
			ctx.clip();

			// Get selection/hidden state for styling
			const isCurrentDrawing = currentDrawingRef.current?.id === drawing.id;
			const isHovered = hoveredLineIdRef.current === drawing.id;
			const isSelected = selectedLineIdRef.current === drawing.id;
			const isHidden = !!drawing.hidden;
			const lineColor = isHidden ? 'rgba(148, 163, 184, 0.9)' : isSelected ? '#2563eb' : '#3b82f6';
			const lineWidth = isHidden ? 1 : isSelected ? 2 : (drawing.style?.width || 2);

			if (parallelScreenPoints.length >= 4) {
				// Complete channel: 4 points [start1, end1, start2, end2]
				const start1 = parallelScreenPoints[0];
				const end1 = parallelScreenPoints[1];
				const start2 = parallelScreenPoints[2];
				const end2 = parallelScreenPoints[3];

				// Underlay: draw channel visuals only (behind candles)
				if (drawLayer === 'underlay') {
					ctx.save();
					ctx.fillStyle = isHidden ? 'rgba(255, 165, 0, 0.1)' : 'rgba(255, 165, 0, 0.2)';
					ctx.beginPath();
					ctx.moveTo(start1.x, start1.y);
					ctx.lineTo(end1.x, end1.y);
					ctx.lineTo(end2.x, end2.y);
					ctx.lineTo(start2.x, start2.y);
					ctx.closePath();
					ctx.fill();
					ctx.restore();
					ctx.save();
					ctx.strokeStyle = lineColor;
					ctx.lineWidth = lineWidth;
					ctx.lineCap = 'round';
					ctx.beginPath();
					ctx.moveTo(start1.x, start1.y);
					ctx.lineTo(end1.x, end1.y);
					ctx.stroke();
					ctx.restore();
					ctx.save();
					ctx.strokeStyle = lineColor;
					ctx.lineWidth = lineWidth;
					ctx.lineCap = 'round';
					ctx.beginPath();
					ctx.moveTo(start2.x, start2.y);
					ctx.lineTo(end2.x, end2.y);
					ctx.stroke();
					ctx.restore();
					ctx.save();
					ctx.strokeStyle = lineColor;
					ctx.lineWidth = lineWidth * 0.5;
					ctx.lineCap = 'round';
					ctx.setLineDash(TOOL_DOTTED_LINE_DASH);
					ctx.beginPath();
					const midStartX = (start1.x + start2.x) / 2;
					const midStartY = (start1.y + start2.y) / 2;
					const midEndX = (end1.x + end2.x) / 2;
					const midEndY = (end1.y + end2.y) / 2;
					ctx.moveTo(midStartX, midStartY);
					ctx.lineTo(midEndX, midEndY);
					ctx.stroke();
					ctx.setLineDash([]);
					ctx.lineCap = 'butt';
					ctx.restore();
					ctx.restore();
					ctx.restore();
					return;
				}

				// Overlay: draw channel when no primitive underlay, or while drawing (current drawing not in primitive yet)
				const hasUnderlay = underlayIsPrimitive;
				const drawChannelOnOverlay = !hasUnderlay || isCurrentDrawing;
				if (drawChannelOnOverlay) {
					// Draw shaded area between the two parallel lines
					ctx.save();
					ctx.fillStyle = isHidden ? 'rgba(255, 165, 0, 0.1)' : 'rgba(255, 165, 0, 0.2)';
					ctx.beginPath();
					ctx.moveTo(start1.x, start1.y);
					ctx.lineTo(end1.x, end1.y);
					ctx.lineTo(end2.x, end2.y);
					ctx.lineTo(start2.x, start2.y);
					ctx.closePath();
					ctx.fill();
					ctx.restore();

					// Draw first parallel line
					ctx.save();
					ctx.strokeStyle = lineColor;
					ctx.lineWidth = lineWidth;
					ctx.lineCap = 'round';
					ctx.beginPath();
					ctx.moveTo(start1.x, start1.y);
					ctx.lineTo(end1.x, end1.y);
					ctx.stroke();
					ctx.restore();

					// Draw second parallel line
					ctx.save();
					ctx.strokeStyle = lineColor;
					ctx.lineWidth = lineWidth;
					ctx.lineCap = 'round';
					ctx.beginPath();
					ctx.moveTo(start2.x, start2.y);
					ctx.lineTo(end2.x, end2.y);
					ctx.stroke();
					ctx.restore();

					// Draw dashed middle line (dense dots)
					ctx.save();
					ctx.strokeStyle = lineColor;
					ctx.lineWidth = lineWidth * 0.5;
					ctx.lineCap = 'round';
					ctx.setLineDash(TOOL_DOTTED_LINE_DASH);
					ctx.beginPath();
					const midStartX = (start1.x + start2.x) / 2;
					const midStartY = (start1.y + start2.y) / 2;
					const midEndX = (end1.x + end2.x) / 2;
					const midEndY = (end1.y + end2.y) / 2;
					ctx.moveTo(midStartX, midStartY);
					ctx.lineTo(midEndX, midEndY);
					ctx.stroke();
					ctx.setLineDash([]);
					ctx.lineCap = 'butt';
					ctx.restore();
				}

				// Show bubbles at corners and squares in middle when hovered/selected (always on overlay)
				const shouldShowBubbles = isCurrentDrawing || isHovered || isSelected;
				if (shouldShowBubbles) {
					const r = 5;
					const squareSize = 11;
					const borderRadius = 3;
					ctx.fillStyle = '#ffffff';
					ctx.strokeStyle = lineColor;
					ctx.lineWidth = Math.max(1.5, lineWidth * 0.6);

					// Check which handle is hovered for glow effect
					const hoveredHandle = hoveredLineHandleIdRef.current;
					const isStart1Hovered = hoveredHandle === `${drawing.id}:start1`;
					const isEnd1Hovered = hoveredHandle === `${drawing.id}:end1`;
					const isStart2Hovered = hoveredHandle === `${drawing.id}:start2`;
					const isEnd2Hovered = hoveredHandle === `${drawing.id}:end2`;
					const isMid1Hovered = hoveredHandle === `${drawing.id}:mid1`;
					const isMid2Hovered = hoveredHandle === `${drawing.id}:mid2`;

					// Draw 4 corner bubbles with hover glow
					const corners = [
						{ x: start1.x, y: start1.y, hovered: isStart1Hovered },
						{ x: end1.x, y: end1.y, hovered: isEnd1Hovered },
						{ x: start2.x, y: start2.y, hovered: isStart2Hovered },
						{ x: end2.x, y: end2.y, hovered: isEnd2Hovered },
					];

					corners.forEach((corner) => {
						ctx.save();
						if (corner.hovered) {
							ctx.shadowColor = 'rgba(59, 130, 246, 0.9)';
							ctx.shadowBlur = 8;
						}
						ctx.beginPath();
						ctx.arc(corner.x, corner.y, r, 0, 2 * Math.PI);
						ctx.fill();
						ctx.stroke();
						ctx.restore();
					});

					// Draw 2 middle squares (for changing channel width)
					const mid1X = (start1.x + end1.x) / 2;
					const mid1Y = (start1.y + end1.y) / 2;
					const mid2X = (start2.x + end2.x) / 2;
					const mid2Y = (start2.y + end2.y) / 2;

					// Draw middle square on top line
					ctx.save();
					if (isMid1Hovered) {
						ctx.shadowColor = 'rgba(59, 130, 246, 0.9)';
						ctx.shadowBlur = 8;
					}
					ctx.beginPath();
					drawRoundedRect(ctx, mid1X - squareSize / 2, mid1Y - squareSize / 2, squareSize, squareSize, borderRadius);
					ctx.stroke();
					ctx.restore();

					// Draw middle square on bottom line
					ctx.save();
					if (isMid2Hovered) {
						ctx.shadowColor = 'rgba(59, 130, 246, 0.9)';
						ctx.shadowBlur = 8;
					}
					ctx.beginPath();
					drawRoundedRect(ctx, mid2X - squareSize / 2, mid2Y - squareSize / 2, squareSize, squareSize, borderRadius);
					ctx.stroke();
					ctx.restore();
				}
			} else {
				// Incomplete channel (still drawing): show first line only
				const start = parallelScreenPoints[0];
				const end = parallelScreenPoints[1];

				// Underlay: draw first line only
				if (drawLayer === 'underlay') {
					ctx.save();
					ctx.strokeStyle = lineColor;
					ctx.lineWidth = lineWidth;
					ctx.lineCap = 'round';
					ctx.beginPath();
					ctx.moveTo(start.x, start.y);
					ctx.lineTo(end.x, end.y);
					ctx.stroke();
					ctx.restore();
					ctx.restore();
					ctx.restore();
					return;
				}

				// Overlay: draw first line when no primitive underlay, or while drawing (so user sees the line)
				const hasUnderlay = underlayIsPrimitive;
				const drawLineOnOverlay = !hasUnderlay || isCurrentDrawing;
				if (drawLineOnOverlay) {
					ctx.save();
					ctx.strokeStyle = lineColor;
					ctx.lineWidth = lineWidth;
					ctx.lineCap = 'round';
					ctx.beginPath();
					ctx.moveTo(start.x, start.y);
					ctx.lineTo(end.x, end.y);
					ctx.stroke();
					ctx.restore();
				}

				// Show bubbles during drawing (always on overlay)
				if (isCurrentDrawing) {
					const r = 5;
					ctx.fillStyle = '#ffffff';
					ctx.strokeStyle = lineColor;
					ctx.lineWidth = Math.max(1.5, lineWidth * 0.6);

					ctx.save();
					ctx.beginPath();
					ctx.arc(start.x, start.y, r, 0, 2 * Math.PI);
					ctx.fill();
					ctx.stroke();
					ctx.restore();

					ctx.save();
					ctx.beginPath();
					ctx.arc(end.x, end.y, r, 0, 2 * Math.PI);
					ctx.fill();
					ctx.stroke();
					ctx.restore();
				}
			}

			ctx.restore();
			ctx.restore();
			return;
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
