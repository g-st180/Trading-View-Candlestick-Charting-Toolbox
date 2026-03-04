import { useEffect, useRef } from 'react';
import { useDrawing, Drawing, ChartPoint } from './DrawingContext';
import { IChartApi, ISeriesApi, Time } from 'lightweight-charts';

export type CandleBar = { time: number; open: number; high: number; low: number; close: number; volume?: number };

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
}

export default function DrawingOverlay({ chart, series, containerRef, underlayIsPrimitive = false, candlestickDataRef, candlestickDataVersion = 0, priceRangeInProgressIdRef, priceRangeLiveEndPriceRef, priceRangeLiveEndTimeRef, priceRangeLiveTick = 0, dateRangeInProgressIdRef, dateRangeLiveEndTimeRef, dateRangeLiveEndPriceRef, dateRangeLiveTick = 0, rectangleInProgressIdRef, rectangleLiveTick = 0, pathInProgressIdRef, pathLiveEndTimeRef, pathLiveEndPriceRef, pathLiveTick = 0, circleInProgressIdRef, circleLiveEndTimeRef, circleLiveEndPriceRef, circleLiveTick = 0 }: DrawingOverlayProps) {
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
	}, [drawings, currentDrawing, selectedHorizontalLineId, hoveredHorizontalLineId, hoveredHorizontalLineHandleId, selectedHorizontalRayId, hoveredHorizontalRayId, hoveredHorizontalRayHandleId, selectedLineId, hoveredLineId, hoveredLineHandleId, candlestickDataVersion, priceRangeLiveTick, dateRangeLiveTick, rectangleLiveTick, pathLiveTick, circleLiveTick]);

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
		chartToScreen: (point: ChartPoint) => { x: number; y: number } | null,
		drawLayer: 'overlay' | 'underlay' = 'overlay'
	) => {
		// Compute drawable plot width (exclude right price scale if present)
		const rightScaleWidth =
			chart && typeof (chart.priceScale('right') as any)?.width === 'function'
				? Number((chart.priceScale('right') as any).width())
				: 0;
		const plotWidth = Math.max(0, Math.floor(container.getBoundingClientRect().width - rightScaleWidth));

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
					ctx.setLineDash([4, 4]);
					ctx.lineWidth = 0.8;
					ctx.strokeStyle = isHidden ? 'rgba(0, 0, 0, 0.5)' : '#000000';
					ctx.beginPath();
					ctx.moveTo(dotStartXVal, dotStartY);
					ctx.lineTo(dotEndX, dotEndY);
					ctx.stroke();
					ctx.setLineDash([]);
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
					ctx.setLineDash([4, 4]);
					ctx.lineWidth = 0.8;
					ctx.strokeStyle = isHidden ? 'rgba(0, 0, 0, 0.5)' : '#000000';
					ctx.beginPath();
					ctx.moveTo(dotStartXVal, dotStartY);
					ctx.lineTo(dotEndX, dotEndY);
					ctx.stroke();
					ctx.setLineDash([]);
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
			const borderWidth = 2;
			const arrowWidth = 2.5;
			const arrowLen = 7;
			// Same perceived look when drawing and when done: use slightly lighter fill when in progress (overlay on top) so it doesn’t look dark
			const fillOpacity = isInProgress ? 0.18 : 0.25;
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

			// White rectangular info block at center-bottom of rect
			const padding = 6;
			ctx.font = '12px sans-serif';
			const textWidth = ctx.measureText(labelText).width;
			const textHeight = 14;
			const rectW = textWidth + padding * 2;
			const rectH = textHeight + padding * 2;
			const blockX = (minX + maxX) / 2 - rectW / 2;
			const blockY = maxY + 8;
			ctx.fillStyle = '#ffffff';
			ctx.strokeStyle = 'rgba(0,0,0,0.2)';
			ctx.lineWidth = 1;
			ctx.beginPath();
			drawRoundedRect(ctx, blockX, blockY, rectW, rectH, 4);
			ctx.fill();
			ctx.stroke();
			ctx.fillStyle = '#1e293b';
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.fillText(labelText, (minX + maxX) / 2, blockY + rectH / 2);

			// Two white reposition dots: at start and end points (free handles, no min/max swap)
			const shouldShowHandles = selectedLineIdRef.current === drawing.id || hoveredLineIdRef.current === drawing.id;
			if (shouldShowHandles) {
				const r = 5;
				ctx.fillStyle = '#ffffff';
				ctx.strokeStyle = '#000000';
				ctx.lineWidth = 1.5;
				// Start point (first click)
				ctx.beginPath();
				ctx.arc(Number(startX), startY, r, 0, 2 * Math.PI);
				ctx.fill();
				ctx.stroke();
				// End point (second click)
				ctx.beginPath();
				ctx.arc(Number(endX), endY, r, 0, 2 * Math.PI);
				ctx.fill();
				ctx.stroke();
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
			const borderWidth = 2;
			const arrowWidth = 2.5;
			const arrowLen = 7;
			const fillOpacity = isInProgress ? 0.18 : 0.25;
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

			const padding = 6;
			ctx.font = '12px sans-serif';
			const line1W = ctx.measureText(barsText).width;
			const line2W = ctx.measureText(volText).width;
			const textW = Math.max(line1W, line2W);
			const rectW = textW + padding * 2;
			const rectH = 14 * 2 + padding * 2;
			const blockX = (minX + maxX) / 2 - rectW / 2;
			const blockY = maxY + 8;
			ctx.fillStyle = '#ffffff';
			ctx.strokeStyle = 'rgba(0,0,0,0.2)';
			ctx.lineWidth = 1;
			ctx.beginPath();
			drawRoundedRect(ctx, blockX, blockY, rectW, rectH, 4);
			ctx.fill();
			ctx.stroke();
			ctx.fillStyle = '#1e293b';
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.fillText(barsText, (minX + maxX) / 2, blockY + 14);
			ctx.fillText(volText, (minX + maxX) / 2, blockY + 14 + 14);

			const shouldShowHandles = selectedLineIdRef.current === drawing.id || hoveredLineIdRef.current === drawing.id;
			if (shouldShowHandles) {
				const r = 5;
				ctx.fillStyle = '#ffffff';
				ctx.strokeStyle = '#000000';
				ctx.lineWidth = 1.5;
				ctx.beginPath();
				ctx.arc(Number(startX), startY, r, 0, 2 * Math.PI);
				ctx.fill();
				ctx.stroke();
				ctx.beginPath();
				ctx.arc(Number(endX), endY, r, 0, 2 * Math.PI);
				ctx.fill();
				ctx.stroke();
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
				// 4 edge-center squares (resize width/height) – same style as horizontal line
				ctx.fillStyle = '#ffffff';
				ctx.strokeStyle = '#000000';
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
				ctx.setLineDash([4, 4]);
				ctx.strokeRect(left, top, w, h);
				ctx.setLineDash([]);
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
			ctx.moveTo(screenPts[0].x, screenPts[0].y);
			for (let i = 1; i < screenPts.length; i++) {
				ctx.lineTo(screenPts[i].x, screenPts[i].y);
			}
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
			if ((drawing.type === 'lines' || drawing.type === 'ray') && pts.length === 1) {
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

			// Draw hollow rounded corner square on the right border (only if hovered/selected)
			if (shouldShowSquare) {
				const isHandleHovered = hoveredHorizontalLineHandleIdRef.current === drawing.id;
				ctx.save();
				ctx.strokeStyle = lineColor;
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

		// Chart-space Lines/Ray tool: show first bubble immediately (before second click)
		if ((drawing.type === 'lines' || drawing.type === 'ray') && drawing.points && drawing.points.length === 1) {
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
					ctx.setLineDash([4, 8]);
					ctx.beginPath();
					const midStartX = (start1.x + start2.x) / 2;
					const midStartY = (start1.y + start2.y) / 2;
					const midEndX = (end1.x + end2.x) / 2;
					const midEndY = (end1.y + end2.y) / 2;
					ctx.moveTo(midStartX, midStartY);
					ctx.lineTo(midEndX, midEndY);
					ctx.stroke();
					ctx.setLineDash([]);
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

					// Draw dashed middle line
					ctx.save();
					ctx.strokeStyle = lineColor;
					ctx.lineWidth = lineWidth * 0.5;
					ctx.setLineDash([4, 8]);
					ctx.beginPath();
					const midStartX = (start1.x + start2.x) / 2;
					const midStartY = (start1.y + start2.y) / 2;
					const midEndX = (end1.x + end2.x) / 2;
					const midEndY = (end1.y + end2.y) / 2;
					ctx.moveTo(midStartX, midStartY);
					ctx.lineTo(midEndX, midEndY);
					ctx.stroke();
					ctx.setLineDash([]);
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
