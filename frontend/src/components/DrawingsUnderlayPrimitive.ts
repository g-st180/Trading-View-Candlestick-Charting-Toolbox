/**
 * Series primitive that draws RR box and parallel channel behind candles but above grid
 * by using drawBackground with zOrder 'normal'.
 */
import type {
	ISeriesPrimitive,
	ISeriesPrimitivePaneView,
	ISeriesPrimitivePaneRenderer,
	SeriesPrimitivePaneViewZOrder,
} from 'lightweight-charts';
import type { Drawing } from './DrawingContext';
import type { IChartApi, ISeriesApi } from 'lightweight-charts';

export type CandleBar = { time: number; open: number; high: number; low: number; close: number; volume?: number };

export interface UnderlayDataRef {
	current: {
		drawings: Drawing[];
		candlestickData: CandleBar[];
	};
}

export interface UnderlayPrimitiveRef {
	requestUpdate: (() => void) | null;
}

export class DrawingsUnderlayPrimitive implements ISeriesPrimitive<unknown> {
	private _chart: IChartApi | null = null;
	private _series: ISeriesApi<'Candlestick'> | null = null;
	private _dataRef: UnderlayDataRef;
	private _view: ISeriesPrimitivePaneView | null = null;
	private _requestUpdateRef: UnderlayPrimitiveRef | null = null;

	constructor(dataRef: UnderlayDataRef, requestUpdateRef?: UnderlayPrimitiveRef) {
		this._dataRef = dataRef;
		this._requestUpdateRef = requestUpdateRef || null;
	}

	attached(param: any): void {
		this._chart = param.chart;
		this._series = param.series;
		if (this._requestUpdateRef) this._requestUpdateRef.requestUpdate = param.requestUpdate;
		this._view = {
			zOrder: (): SeriesPrimitivePaneViewZOrder => 'normal',
			renderer: (): ISeriesPrimitivePaneRenderer | null => ({
				draw: () => {},
				drawBackground: (target) => this._drawBackground(target),
			}),
		};
	}

	detached(): void {
		this._chart = null;
		this._series = null;
		if (this._requestUpdateRef) this._requestUpdateRef.requestUpdate = null;
		this._view = null;
	}

	paneViews(): readonly ISeriesPrimitivePaneView[] {
		return this._view ? [this._view] : [];
	}

	private _drawBackground(target: { useMediaCoordinateSpace: (f: (scope: { context: CanvasRenderingContext2D; mediaSize: { width: number; height: number } }) => void) => void }): void {
		const chart = this._chart;
		const series = this._series;
		if (!chart || !series) return;
		const data = this._dataRef.current;
		if (!data) return;
		const { drawings, candlestickData, inProgressIds } = data;
		const inProgress = (inProgressIds as Set<string> | undefined) ?? new Set<string>();
		const underlayDrawings = drawings.filter(
			(d) => !d.hidden && !inProgress.has(d.id) && (
				d.type === 'long-position' || d.type === 'short-position' || d.type === 'parallel-channel' ||
				d.type === 'price-range' || d.type === 'date-range' || d.type === 'date-price-range' || d.type === 'fibonacci-retracement' || d.type === 'gann-box' ||
				d.type === 'lines' || d.type === 'ray' || d.type === 'horizontal-line' || d.type === 'horizontal-ray'
			)
		);
		if (underlayDrawings.length === 0) return;

		target.useMediaCoordinateSpace((scope) => {
			const ctx = scope.context;
			const plotWidth = scope.mediaSize.width;
			const plotHeight = scope.mediaSize.height;
			ctx.save();
			try {
				ctx.beginPath();
				ctx.rect(0, 0, plotWidth, plotHeight);
				ctx.clip();

				for (const drawing of underlayDrawings) {
					if (drawing.type === 'long-position' && drawing.entryPrice != null && drawing.stopLoss != null && drawing.takeProfit != null && drawing.startTime != null && drawing.endTime != null) {
						this._drawLongPosition(ctx, chart, series, drawing, candlestickData);
					} else if (drawing.type === 'short-position' && drawing.entryPrice != null && drawing.stopLoss != null && drawing.takeProfit != null && drawing.startTime != null && drawing.endTime != null) {
						this._drawShortPosition(ctx, chart, series, drawing, candlestickData);
					} else if (drawing.type === 'parallel-channel' && drawing.points && drawing.points.length >= 2) {
						this._drawParallelChannel(ctx, chart, series, drawing);
					} else if (drawing.type === 'price-range' && drawing.startTime != null && drawing.startPrice != null && drawing.endTime != null && drawing.endPrice != null) {
						this._drawPriceRange(ctx, chart, series, drawing);
					} else if (drawing.type === 'date-range' && drawing.startTime != null && drawing.startPrice != null && drawing.endTime != null && drawing.endPrice != null) {
						this._drawDateRange(ctx, chart, series, drawing);
					} else if (drawing.type === 'date-price-range' && drawing.startTime != null && drawing.startPrice != null && drawing.endTime != null && drawing.endPrice != null) {
						this._drawDatePriceRange(ctx, chart, series, drawing);
					} else if (drawing.type === 'fibonacci-retracement' && drawing.startTime != null && drawing.startPrice != null && drawing.endTime != null && drawing.endPrice != null) {
						this._drawFibRetracement(ctx, chart, series, drawing);
					} else if (drawing.type === 'gann-box' && drawing.startTime != null && drawing.startPrice != null && drawing.endTime != null && drawing.endPrice != null) {
						this._drawGannBox(ctx, chart, series, drawing);
					} else if (drawing.type === 'lines' && drawing.points && drawing.points.length >= 2) {
						this._drawLineSegment(ctx, chart, series, drawing, plotWidth, plotHeight);
					} else if (drawing.type === 'ray' && drawing.points && drawing.points.length >= 2) {
						this._drawRay(ctx, chart, series, drawing, plotWidth, plotHeight);
					} else if (drawing.type === 'horizontal-line' && drawing.points && drawing.points.length >= 1) {
						this._drawHorizontalLine(ctx, chart, series, drawing, plotWidth);
					} else if (drawing.type === 'horizontal-ray' && drawing.points && drawing.points.length >= 1) {
						this._drawHorizontalRay(ctx, chart, series, drawing, plotWidth);
					}
				}
			} finally {
				ctx.restore();
			}
		});
	}

	private _drawLongPosition(
		ctx: CanvasRenderingContext2D,
		chart: IChartApi,
		series: ISeriesApi<'Candlestick'>,
		drawing: Drawing,
		candlestickData: CandleBar[]
	): void {
		const ts = chart.timeScale();
		const isHidden = !!drawing.hidden;
		let startX = ts.timeToCoordinate(drawing.startTime as any);
		let endX = ts.timeToCoordinate(drawing.endTime as any);
		const visible = ts.getVisibleRange();
		if (visible && typeof visible.from === 'number' && typeof visible.to === 'number') {
			const leftX = ts.timeToCoordinate(visible.from as any);
			const rightX = ts.timeToCoordinate(visible.to as any);
			const visibleTimeSpan = visible.to - visible.from;
			const visiblePixelSpan = rightX != null && leftX != null ? rightX - leftX : 0;
			if (visibleTimeSpan > 0 && visiblePixelSpan > 0) {
				const timeWidth = drawing.endTime! - drawing.startTime!;
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
		const entryY = series.priceToCoordinate(drawing.entryPrice!);
		const stopLossY = series.priceToCoordinate(drawing.stopLoss!);
		const takeProfitY = series.priceToCoordinate(drawing.takeProfit!);
		if (startX == null || endX == null || entryY == null || stopLossY == null || takeProfitY == null) return;

		const boxX = Math.min(Number(startX), Number(endX));
		const boxWidth = Math.abs(Number(endX) - Number(startX));
		const startTime = drawing.startTime!;
		const endTime = drawing.endTime!;
		const entryPrice = drawing.entryPrice!;
		const takeProfit = drawing.takeProfit!;
		const stopLoss = drawing.stopLoss!;
		const barsInRange = candlestickData
			.filter((b) => b.time >= startTime && b.time <= endTime)
			.sort((a, b) => a.time - b.time);
		// First bar that breaches the middle (entry) line: candle range crosses entry price
		const firstBreachBar = barsInRange.find((b) => b.low <= entryPrice && b.high >= entryPrice);
		const dotStartTime = firstBreachBar != null ? firstBreachBar.time : startTime;
		const dotStartX = ts.timeToCoordinate(dotStartTime as any);
		const dotStartY = entryY;

		// Only consider bars at or after the breach (dotted line always left-to-right: exits after entry)
		const barsAfterBreach = barsInRange.filter((b) => b.time >= dotStartTime);

		let outcomeEndTime = endTime;
		let outcomeEndPrice = entryPrice;
		for (const bar of barsAfterBreach) {
			const hitTP = bar.high >= takeProfit;
			const hitSL = bar.low <= stopLoss;
			if (hitTP && hitSL) {
				outcomeEndTime = bar.time;
				outcomeEndPrice = bar.close > bar.open ? takeProfit : stopLoss;
				break;
			}
			if (hitTP) {
				outcomeEndTime = bar.time;
				outcomeEndPrice = takeProfit;
				break;
			}
			if (hitSL) {
				outcomeEndTime = bar.time;
				outcomeEndPrice = stopLoss;
				break;
			}
		}
		if (barsAfterBreach.length > 0 && outcomeEndTime === endTime && outcomeEndPrice === entryPrice) {
			const lastBar = barsAfterBreach[barsAfterBreach.length - 1];
			outcomeEndTime = lastBar.time;
			outcomeEndPrice = lastBar.close;
		}
		const dotEndX = ts.timeToCoordinate(outcomeEndTime as any);
		const dotEndY = series.priceToCoordinate(outcomeEndPrice);

		const riskTop = Math.min(entryY, stopLossY);
		const riskBottom = Math.max(entryY, stopLossY);
		const rewardTop = Math.min(entryY, takeProfitY);
		const rewardBottom = Math.max(entryY, takeProfitY);

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
		// Only show dotted line and darkened rectangle when entry was breached
		if (firstBreachBar != null && dotEndX != null && dotEndY != null) {
			const dsx = dotStartX != null ? Number(dotStartX) : boxX;
			const dex = Number(dotEndX);
			// Darkened rectangle from first breach of middle line to outcome point (dotted line endpoints)
			ctx.save();
			const rectLeft = Math.min(dsx, dex);
			const rectRight = Math.max(dsx, dex);
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
			ctx.moveTo(dsx, dotStartY);
			ctx.lineTo(dex, dotEndY);
		ctx.stroke();
		ctx.setLineDash([]);
		ctx.restore();
		}
	}

	private _drawShortPosition(
		ctx: CanvasRenderingContext2D,
		chart: IChartApi,
		series: ISeriesApi<'Candlestick'>,
		drawing: Drawing,
		candlestickData: CandleBar[]
	): void {
		const ts = chart.timeScale();
		const isHidden = !!drawing.hidden;
		let startX = ts.timeToCoordinate(drawing.startTime as any);
		let endX = ts.timeToCoordinate(drawing.endTime as any);
		const visible = ts.getVisibleRange();
		if (visible && typeof visible.from === 'number' && typeof visible.to === 'number') {
			const leftX = ts.timeToCoordinate(visible.from as any);
			const rightX = ts.timeToCoordinate(visible.to as any);
			const visibleTimeSpan = visible.to - visible.from;
			const visiblePixelSpan = rightX != null && leftX != null ? rightX - leftX : 0;
			if (visibleTimeSpan > 0 && visiblePixelSpan > 0) {
				const timeWidth = drawing.endTime! - drawing.startTime!;
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
		const entryY = series.priceToCoordinate(drawing.entryPrice!);
		const stopLossY = series.priceToCoordinate(drawing.stopLoss!);
		const takeProfitY = series.priceToCoordinate(drawing.takeProfit!);
		if (startX == null || endX == null || entryY == null || stopLossY == null || takeProfitY == null) return;

		const boxX = Math.min(Number(startX), Number(endX));
		const boxWidth = Math.abs(Number(endX) - Number(startX));
		const startTime = drawing.startTime!;
		const endTime = drawing.endTime!;
		const entryPrice = drawing.entryPrice!;
		const takeProfit = drawing.takeProfit!;
		const stopLoss = drawing.stopLoss!;
		const barsInRange = candlestickData
			.filter((b) => b.time >= startTime && b.time <= endTime)
			.sort((a, b) => a.time - b.time);
		const firstBreachBar = barsInRange.find((b) => b.low <= entryPrice && b.high >= entryPrice);
		const dotStartTime = firstBreachBar != null ? firstBreachBar.time : startTime;
		const dotStartX = ts.timeToCoordinate(dotStartTime as any);
		const dotStartY = entryY;

		const barsAfterBreach = barsInRange.filter((b) => b.time >= dotStartTime);

		let outcomeEndTime = endTime;
		let outcomeEndPrice = entryPrice;
		// Short: TP below entry (bar.low <= takeProfit), SL above (bar.high >= stopLoss)
		for (const bar of barsAfterBreach) {
			const hitTP = bar.low <= takeProfit;
			const hitSL = bar.high >= stopLoss;
			if (hitTP && hitSL) {
				outcomeEndTime = bar.time;
				outcomeEndPrice = bar.close > bar.open ? takeProfit : stopLoss;
				break;
			}
			if (hitTP) {
				outcomeEndTime = bar.time;
				outcomeEndPrice = takeProfit;
				break;
			}
			if (hitSL) {
				outcomeEndTime = bar.time;
				outcomeEndPrice = stopLoss;
				break;
			}
		}
		if (barsAfterBreach.length > 0 && outcomeEndTime === endTime && outcomeEndPrice === entryPrice) {
			const lastBar = barsAfterBreach[barsAfterBreach.length - 1];
			outcomeEndTime = lastBar.time;
			outcomeEndPrice = lastBar.close;
		}
		const dotEndX = ts.timeToCoordinate(outcomeEndTime as any);
		const dotEndY = series.priceToCoordinate(outcomeEndPrice);

		const riskTop = Math.min(entryY, stopLossY);
		const riskBottom = Math.max(entryY, stopLossY);
		const rewardTop = Math.min(entryY, takeProfitY);
		const rewardBottom = Math.max(entryY, takeProfitY);

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
		if (firstBreachBar != null && dotEndX != null && dotEndY != null) {
			const dsx = dotStartX != null ? Number(dotStartX) : boxX;
			const dex = Number(dotEndX);
			ctx.save();
			const rectLeft = Math.min(dsx, dex);
			const rectRight = Math.max(dsx, dex);
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
			ctx.moveTo(dsx, dotStartY);
			ctx.lineTo(dex, dotEndY);
			ctx.stroke();
			ctx.setLineDash([]);
			ctx.restore();
		}
	}

	private _drawParallelChannel(
		ctx: CanvasRenderingContext2D,
		chart: IChartApi,
		series: ISeriesApi<'Candlestick'>,
		drawing: Drawing
	): void {
		const pts = drawing.points!;
		if (pts.length < 2) return;
		const ts = chart.timeScale();
		const toScreen = (p: { time: number; price: number }) => ({
			x: Number(ts.timeToCoordinate(p.time as any)),
			y: series.priceToCoordinate(p.price),
		});
		const parallelScreenPoints = pts.map(toScreen).filter((p) => p.x != null && p.y != null) as { x: number; y: number }[];
		if (parallelScreenPoints.length < 2) return;

		const isHidden = !!drawing.hidden;
		const lineColor = isHidden ? 'rgba(148, 163, 184, 0.9)' : '#3b82f6';
		const lineWidth = isHidden ? 1 : (drawing.style?.width || 2);

		if (parallelScreenPoints.length >= 4) {
			const [start1, end1, start2, end2] = parallelScreenPoints;
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
			ctx.moveTo((start1.x + start2.x) / 2, (start1.y + start2.y) / 2);
			ctx.lineTo((end1.x + end2.x) / 2, (end1.y + end2.y) / 2);
			ctx.stroke();
			ctx.setLineDash([]);
			ctx.restore();
		} else {
			const [start, end] = parallelScreenPoints;
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
	}

	private _drawPriceRange(
		ctx: CanvasRenderingContext2D,
		chart: IChartApi,
		series: ISeriesApi<'Candlestick'>,
		drawing: Drawing
	): void {
		const ts = chart.timeScale();
		const startX = ts.timeToCoordinate(drawing.startTime as any);
		const startY = series.priceToCoordinate(drawing.startPrice!);
		const endX = ts.timeToCoordinate(drawing.endTime as any);
		const endY = series.priceToCoordinate(drawing.endPrice!);
		if (startX == null || startY == null || endX == null || endY == null) return;
		const minX = Math.min(Number(startX), Number(endX));
		const maxX = Math.max(Number(startX), Number(endX));
		const minY = Math.min(startY, endY);
		const maxY = Math.max(startY, endY);
		const isHidden = !!drawing.hidden;
		const lineColor = isHidden ? 'rgba(59, 130, 246, 0.6)' : '#3b82f6';
		const borderWidth = 1.5;
		const arrowWidth = 2;
		const arrowLen = 7;

		ctx.save();
		ctx.fillStyle = isHidden ? 'rgba(59, 130, 246, 0.12)' : 'rgba(59, 130, 246, 0.14)';
		ctx.fillRect(minX, minY, maxX - minX, maxY - minY);
		ctx.restore();

		ctx.save();
		ctx.strokeStyle = lineColor;
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
		ctx.restore();

		// Only draw arrow when band has enough height; full height from top to bottom border
		const bandHeight = maxY - minY;
		const minHeightForArrow = 24;
		if (bandHeight >= minHeightForArrow) {
			const midX = (minX + maxX) / 2;
			ctx.save();
			ctx.strokeStyle = lineColor;
			ctx.lineWidth = arrowWidth;
			ctx.lineCap = 'round';
			ctx.beginPath();
			ctx.moveTo(midX, maxY);
			ctx.lineTo(midX, minY);
			ctx.stroke();
			ctx.restore();

			const endIsAbove = endY < startY;
			ctx.save();
			ctx.strokeStyle = lineColor;
			ctx.lineWidth = arrowWidth;
			ctx.lineCap = 'round';
			ctx.lineJoin = 'round';
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
			ctx.restore();
		}
	}

	private _drawDateRange(
		ctx: CanvasRenderingContext2D,
		chart: IChartApi,
		series: ISeriesApi<'Candlestick'>,
		drawing: Drawing
	): void {
		const ts = chart.timeScale();
		const startX = ts.timeToCoordinate(drawing.startTime as any);
		const startY = series.priceToCoordinate(drawing.startPrice!);
		const endX = ts.timeToCoordinate(drawing.endTime as any);
		const endY = series.priceToCoordinate(drawing.endPrice!);
		if (startX == null || startY == null || endX == null || endY == null) return;
		const minX = Math.min(Number(startX), Number(endX));
		const maxX = Math.max(Number(startX), Number(endX));
		const minY = Math.min(startY, endY);
		const maxY = Math.max(startY, endY);
		const isHidden = !!drawing.hidden;
		const lineColor = isHidden ? 'rgba(59, 130, 246, 0.6)' : '#3b82f6';
		const borderWidth = 1.5;
		const arrowWidth = 2;
		const arrowLen = 7;

		ctx.save();
		ctx.fillStyle = isHidden ? 'rgba(59, 130, 246, 0.12)' : 'rgba(59, 130, 246, 0.14)';
		ctx.fillRect(minX, minY, maxX - minX, maxY - minY);
		ctx.restore();

		ctx.save();
		ctx.strokeStyle = lineColor;
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
		ctx.restore();

		const bandWidth = maxX - minX;
		const minWidthForArrow = 24;
		if (bandWidth >= minWidthForArrow) {
			const midY = (minY + maxY) / 2;
			ctx.save();
			ctx.strokeStyle = lineColor;
			ctx.lineWidth = arrowWidth;
			ctx.lineCap = 'round';
			ctx.beginPath();
			ctx.moveTo(minX, midY);
			ctx.lineTo(maxX, midY);
			ctx.stroke();
			ctx.restore();

			const endIsRight = (drawing.endTime as number) > (drawing.startTime as number);
			ctx.save();
			ctx.strokeStyle = lineColor;
			ctx.lineWidth = arrowWidth;
			ctx.lineCap = 'round';
			ctx.lineJoin = 'round';
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
			ctx.restore();
		}
	}

	private _drawDatePriceRange(
		ctx: CanvasRenderingContext2D,
		chart: IChartApi,
		series: ISeriesApi<'Candlestick'>,
		drawing: Drawing
	): void {
		const ts = chart.timeScale();
		const startX = ts.timeToCoordinate(drawing.startTime as any);
		const startY = series.priceToCoordinate(drawing.startPrice!);
		const endX = ts.timeToCoordinate(drawing.endTime as any);
		const endY = series.priceToCoordinate(drawing.endPrice!);
		if (startX == null || startY == null || endX == null || endY == null) return;
		const minX = Math.min(Number(startX), Number(endX));
		const maxX = Math.max(Number(startX), Number(endX));
		const minY = Math.min(startY, endY);
		const maxY = Math.max(startY, endY);
		const isHidden = !!drawing.hidden;
		const lineColor = isHidden ? 'rgba(59, 130, 246, 0.6)' : '#3b82f6';
		const arrowWidth = 2;
		const arrowLen = 7;

		ctx.save();
		// Use 0.14 to match overlay in-progress opacity so completed range doesn't look darker when it moves behind candles
		ctx.fillStyle = isHidden ? 'rgba(59, 130, 246, 0.12)' : 'rgba(59, 130, 246, 0.14)';
		ctx.fillRect(minX, minY, maxX - minX, maxY - minY);
		ctx.restore();

		// Vertical arrow (price) at center X
		const bandHeight = maxY - minY;
		const minHeightForArrow = 24;
		if (bandHeight >= minHeightForArrow) {
			const midX = (minX + maxX) / 2;
			ctx.save();
			ctx.strokeStyle = lineColor;
			ctx.lineWidth = arrowWidth;
			ctx.lineCap = 'round';
			ctx.beginPath();
			ctx.moveTo(midX, maxY);
			ctx.lineTo(midX, minY);
			ctx.stroke();
			ctx.restore();
			const endIsAbove = endY < startY;
			ctx.save();
			ctx.strokeStyle = lineColor;
			ctx.lineWidth = arrowWidth;
			ctx.lineCap = 'round';
			ctx.lineJoin = 'round';
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
			ctx.restore();
		}

		// Horizontal arrow (date) at center Y
		const bandWidth = maxX - minX;
		const minWidthForArrow = 24;
		if (bandWidth >= minWidthForArrow) {
			const midY = (minY + maxY) / 2;
			ctx.save();
			ctx.strokeStyle = lineColor;
			ctx.lineWidth = arrowWidth;
			ctx.lineCap = 'round';
			ctx.beginPath();
			ctx.moveTo(minX, midY);
			ctx.lineTo(maxX, midY);
			ctx.stroke();
			ctx.restore();
			const endIsRight = (drawing.endTime as number) > (drawing.startTime as number);
			ctx.save();
			ctx.strokeStyle = lineColor;
			ctx.lineWidth = arrowWidth;
			ctx.lineCap = 'round';
			ctx.lineJoin = 'round';
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
			ctx.restore();
		}
	}

	private _drawFibRetracement(
		ctx: CanvasRenderingContext2D,
		chart: IChartApi,
		series: ISeriesApi<'Candlestick'>,
		drawing: Drawing
	): void {
		const ts = chart.timeScale();
		const startPrice = drawing.startPrice!;
		const endPrice = drawing.endPrice!;
		const startX = ts.timeToCoordinate(drawing.startTime as any);
		const endX = ts.timeToCoordinate(drawing.endTime as any);
		if (startX == null || endX == null) return;
		const leftX = Math.min(Number(startX), Number(endX));
		const rightX = Math.max(Number(startX), Number(endX));
		const width = rightX - leftX;
		const range = startPrice - endPrice;
		const retraceLevels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1] as const;
		const retracePrices = retraceLevels.map((L) => endPrice + range * L);
		const extLevels = [1.618, 2.618, 3.618, 4.236] as const;
		const extPrices = extLevels.map((E) => startPrice + range * (E - 1));
		const allPrices = [...retracePrices, ...extPrices];
		const allYCoords = allPrices.map((p) => series.priceToCoordinate(p));
		if (allYCoords.some((y) => y == null)) return;
		const allYs = allYCoords as number[];
		const bandColors = ['rgba(239,68,68,0.35)', 'rgba(249,115,22,0.35)', 'rgba(234,179,8,0.35)', 'rgba(34,197,94,0.35)', 'rgba(59,130,246,0.35)', 'rgba(139,92,246,0.35)'];
		const strokeColors = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6'];
		const extBandColors = ['rgba(192,132,252,0.35)', 'rgba(167,139,250,0.35)', 'rgba(129,140,248,0.35)', 'rgba(99,102,241,0.35)'];
		const extStrokeColors = ['#c084fc', '#a78bfa', '#818cf8', '#6366f1'];
		const isHidden = !!drawing.hidden;
		const opacity = isHidden ? 0.2 : 1;
		const startY = allYs[6];
		const endY = allYs[0];
		for (let i = 0; i < 6; i++) {
			const yTop = Math.min(allYs[i], allYs[i + 1]);
			const yBottom = Math.max(allYs[i], allYs[i + 1]);
			const h = yBottom - yTop;
			if (h < 0.5) continue;
			ctx.save();
			ctx.globalAlpha = opacity;
			ctx.fillStyle = bandColors[i];
			ctx.fillRect(leftX, yTop, width, h);
			ctx.strokeStyle = strokeColors[i];
			ctx.lineWidth = 1.5;
			ctx.beginPath();
			ctx.moveTo(leftX, yTop);
			ctx.lineTo(rightX, yTop);
			ctx.stroke();
			ctx.restore();
		}
		ctx.save();
		ctx.globalAlpha = opacity;
		ctx.strokeStyle = '#8b5cf6';
		ctx.lineWidth = 1.5;
		ctx.beginPath();
		ctx.moveTo(leftX, allYs[6]);
		ctx.lineTo(rightX, allYs[6]);
		ctx.stroke();
		ctx.restore();
		for (let i = 0; i < 4; i++) {
			const yTop = Math.min(allYs[6 + i], allYs[7 + i]);
			const yBottom = Math.max(allYs[6 + i], allYs[7 + i]);
			const h = yBottom - yTop;
			if (h < 0.5) continue;
			ctx.save();
			ctx.globalAlpha = opacity;
			ctx.fillStyle = extBandColors[i];
			ctx.fillRect(leftX, yTop, width, h);
			ctx.strokeStyle = extStrokeColors[i];
			ctx.lineWidth = 1.5;
			ctx.beginPath();
			ctx.moveTo(leftX, yTop);
			ctx.lineTo(rightX, yTop);
			ctx.stroke();
			ctx.restore();
		}
		ctx.save();
		ctx.globalAlpha = opacity;
		ctx.strokeStyle = '#6366f1';
		ctx.lineWidth = 1.5;
		ctx.beginPath();
		ctx.moveTo(leftX, allYs[10]);
		ctx.lineTo(rightX, allYs[10]);
		ctx.stroke();
		ctx.restore();
		// Dotted line from 1 to 0 (diagonal: left corner level 1 to right corner level 0)
		ctx.save();
		ctx.globalAlpha = opacity;
		ctx.setLineDash([4, 4]);
		ctx.strokeStyle = 'rgba(0,0,0,0.4)';
		ctx.lineWidth = 1.5;
		ctx.beginPath();
		ctx.moveTo(leftX, startY);
		ctx.lineTo(rightX, endY);
		ctx.stroke();
		ctx.setLineDash([]);
		ctx.restore();
	}

	/** Gann box: divisions 0, 0.25, 0.382, 0.5, 0.618, 0.75, 1 on all sides → 6×6 grid; corners (0,0)=bl, (0,1)=tl, (1,0)=br, (1,1)=tr */
	private static readonly GANN_FRACTIONS = [0, 0.25, 0.382, 0.5, 0.618, 0.75, 1] as const;

	/** Yellow–green palette: hues 45 (yellow) to 120 (green) */
	private static _gannCellColor(row: number, col: number): string {
		const idx = row * 6 + col;
		const hue = 45 + (idx / 36) * 75;
		return `hsla(${hue}, 58%, 72%, 0.55)`;
	}

	/** Label color for each division index (0..6) – yellow–green palette, solid for readability */
	private static _gannLabelColor(index: number): string {
		const hue = 45 + (index / 6) * 75;
		return `hsl(${hue}, 52%, 32%)`;
	}

	/** Outer border: each side its own color from yellow–green palette (top, right, bottom, left) */
	private static _gannBorderColor(side: 'top' | 'right' | 'bottom' | 'left'): string {
		const hues = { top: 52, right: 75, bottom: 98, left: 118 };
		return `hsl(${hues[side]}, 55%, 38%)`;
	}

	private _drawGannBox(
		ctx: CanvasRenderingContext2D,
		chart: IChartApi,
		series: ISeriesApi<'Candlestick'>,
		drawing: Drawing
	): void {
		const ts = chart.timeScale();
		const minT = Math.min(drawing.startTime!, drawing.endTime!);
		const maxT = Math.max(drawing.startTime!, drawing.endTime!);
		const minP = Math.min(drawing.startPrice!, drawing.endPrice!);
		const maxP = Math.max(drawing.startPrice!, drawing.endPrice!);
		const leftX = Number(ts.timeToCoordinate(minT as any));
		const rightX = Number(ts.timeToCoordinate(maxT as any));
		const topY = series.priceToCoordinate(maxP);
		const bottomY = series.priceToCoordinate(minP);
		if (leftX == null || rightX == null || topY == null || bottomY == null) return;
		const left = Math.min(leftX, rightX);
		const right = Math.max(leftX, rightX);
		const top = Math.min(topY, bottomY);
		const bottom = Math.max(topY, bottomY);
		const w = right - left;
		const h = bottom - top;
		if (w < 1 || h < 1) return;
		const isHidden = !!drawing.hidden;
		const opacity = isHidden ? 0.4 : 1;
		const fractions = DrawingsUnderlayPrimitive.GANN_FRACTIONS;

		ctx.save();
		ctx.globalAlpha = opacity;

		// Draw each cell with a different color (y=0 at bottom, y=1 at top → row 0 is bottom)
		for (let row = 0; row < 6; row++) {
			const y0 = fractions[row];
			const y1 = fractions[row + 1];
			const cellTop = bottom + (top - bottom) * y1;
			const cellBottom = bottom + (top - bottom) * y0;
			const cellH = cellBottom - cellTop;
			for (let col = 0; col < 6; col++) {
				const x0 = fractions[col];
				const x1 = fractions[col + 1];
				const cellLeft = left + w * x0;
				const cellRight = left + w * x1;
				const cellW = cellRight - cellLeft;
				ctx.fillStyle = DrawingsUnderlayPrimitive._gannCellColor(row, col);
				ctx.fillRect(cellLeft, cellTop, cellW, cellH);
			}
		}

		// Grid lines at all division points (horizontal and vertical)
		ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
		ctx.lineWidth = 1;
		for (let i = 0; i < fractions.length; i++) {
			const t = fractions[i];
			// Vertical line at x = t
			const x = left + w * t;
			ctx.beginPath();
			ctx.moveTo(x, top);
			ctx.lineTo(x, bottom);
			ctx.stroke();
			// Horizontal line at y = t
			const y = bottom + (top - bottom) * t;
			ctx.beginPath();
			ctx.moveTo(left, y);
			ctx.lineTo(right, y);
			ctx.stroke();
		}

		// Outer border: each side its own color (yellow–green palette, no blue)
		const borderW = drawing.style?.width ?? 2;
		ctx.lineWidth = borderW;
		ctx.strokeStyle = DrawingsUnderlayPrimitive._gannBorderColor('top');
		ctx.beginPath();
		ctx.moveTo(left, top);
		ctx.lineTo(right, top);
		ctx.stroke();
		ctx.strokeStyle = DrawingsUnderlayPrimitive._gannBorderColor('right');
		ctx.beginPath();
		ctx.moveTo(right, top);
		ctx.lineTo(right, bottom);
		ctx.stroke();
		ctx.strokeStyle = DrawingsUnderlayPrimitive._gannBorderColor('bottom');
		ctx.beginPath();
		ctx.moveTo(right, bottom);
		ctx.lineTo(left, bottom);
		ctx.stroke();
		ctx.strokeStyle = DrawingsUnderlayPrimitive._gannBorderColor('left');
		ctx.beginPath();
		ctx.moveTo(left, bottom);
		ctx.lineTo(left, top);
		ctx.stroke();

		// Labels on all four sides: 0, 0.25, 0.382, 0.5, 0.618, 0.75, 1 – colored like boxes, slightly larger, more padding
		ctx.font = '12px sans-serif';
		const pad = 10;
		const fracLabels = ['0', '0.25', '0.382', '0.5', '0.618', '0.75', '1'];
		for (let i = 0; i < fractions.length; i++) {
			const t = fractions[i];
			const x = left + w * t;
			const y = bottom + (top - bottom) * t;
			ctx.fillStyle = isHidden ? 'rgba(0, 0, 0, 0.5)' : DrawingsUnderlayPrimitive._gannLabelColor(i);
			// Bottom
			ctx.textAlign = 'center';
			ctx.textBaseline = 'top';
			ctx.fillText(fracLabels[i], x, bottom + pad);
			// Top
			ctx.textBaseline = 'bottom';
			ctx.fillText(fracLabels[i], x, top - pad);
			// Left
			ctx.textAlign = 'right';
			ctx.textBaseline = 'middle';
			ctx.fillText(fracLabels[i], left - pad, y);
			// Right
			ctx.textAlign = 'left';
			ctx.fillText(fracLabels[i], right + pad, y);
		}
		ctx.restore();
	}

	private _drawLineSegment(
		ctx: CanvasRenderingContext2D,
		chart: IChartApi,
		series: ISeriesApi<'Candlestick'>,
		drawing: Drawing,
		_plotWidth: number,
		_plotHeight: number
	): void {
		const pts = drawing.points!;
		if (pts.length < 2) return;
		const ts = chart.timeScale();
		const toScreen = (p: { time: number; price: number }) => ({
			x: Number(ts.timeToCoordinate(p.time as any)),
			y: series.priceToCoordinate(p.price),
		});
		const [start, end] = pts.map(toScreen).filter((p) => p.x != null && p.y != null) as { x: number; y: number }[];
		if (!start || !end) return;
		const isHidden = !!drawing.hidden;
		const lineColor = isHidden ? 'rgba(148, 163, 184, 0.9)' : (drawing.style?.color || '#3b82f6');
		const lineWidth = isHidden ? 1 : (drawing.style?.width || 2);
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

	private _drawRay(
		ctx: CanvasRenderingContext2D,
		chart: IChartApi,
		series: ISeriesApi<'Candlestick'>,
		drawing: Drawing,
		plotWidth: number,
		plotHeight: number
	): void {
		const pts = drawing.points!;
		if (pts.length < 2) return;
		const ts = chart.timeScale();
		const toScreen = (p: { time: number; price: number }) => ({
			x: Number(ts.timeToCoordinate(p.time as any)),
			y: series.priceToCoordinate(p.price),
		});
		const screenPoints = pts.map(toScreen).filter((p) => p.x != null && p.y != null) as { x: number; y: number }[];
		if (screenPoints.length < 2) return;
		const start = screenPoints[0];
		const end = screenPoints[1];
		const dx = end.x - start.x;
		const dy = end.y - start.y;
		const length = Math.sqrt(dx * dx + dy * dy);
		if (length === 0) return;
		const unitX = dx / length;
		const unitY = dy / length;
		const intersections: { x: number; y: number; t: number }[] = [];
		if (unitX < 0) {
			const t = (0 - start.x) / unitX;
			const y = start.y + unitY * t;
			if (y >= 0 && y <= plotHeight) intersections.push({ x: 0, y, t });
		}
		if (unitX > 0) {
			const t = (plotWidth - start.x) / unitX;
			const y = start.y + unitY * t;
			if (y >= 0 && y <= plotHeight) intersections.push({ x: plotWidth, y, t });
		}
		if (unitY < 0) {
			const t = (0 - start.y) / unitY;
			const x = start.x + unitX * t;
			if (x >= 0 && x <= plotWidth) intersections.push({ x, y: 0, t });
		}
		if (unitY > 0) {
			const t = (plotHeight - start.y) / unitY;
			const x = start.x + unitX * t;
			if (x >= 0 && x <= plotWidth) intersections.push({ x, y: plotHeight, t });
		}
		let finalX = end.x;
		let finalY = end.y;
		if (intersections.length > 0) {
			const furthest = intersections.reduce((prev, curr) => (curr.t > prev.t ? curr : prev));
			finalX = furthest.x;
			finalY = furthest.y;
		}
		const isHidden = !!drawing.hidden;
		const lineColor = isHidden ? 'rgba(148, 163, 184, 0.9)' : (drawing.style?.color || '#3b82f6');
		const lineWidth = isHidden ? 1 : (drawing.style?.width || 2);
		ctx.save();
		ctx.strokeStyle = lineColor;
		ctx.lineWidth = lineWidth;
		ctx.lineCap = 'round';
		ctx.beginPath();
		ctx.moveTo(start.x, start.y);
		ctx.lineTo(finalX, finalY);
		ctx.stroke();
		ctx.restore();
	}

	private _drawHorizontalLine(
		ctx: CanvasRenderingContext2D,
		_chart: IChartApi,
		series: ISeriesApi<'Candlestick'>,
		drawing: Drawing,
		plotWidth: number
	): void {
		const price = drawing.points![0].price;
		const y = series.priceToCoordinate(price);
		if (y == null) return;
		const isHidden = !!drawing.hidden;
		const lineColor = isHidden ? 'rgba(148, 163, 184, 0.9)' : (drawing.style?.color || '#3b82f6');
		const lineWidth = isHidden ? 1 : (drawing.style?.width || 2);
		ctx.save();
		ctx.strokeStyle = lineColor;
		ctx.lineWidth = lineWidth;
		ctx.lineCap = 'round';
		ctx.beginPath();
		ctx.moveTo(0, y);
		ctx.lineTo(plotWidth, y);
		ctx.stroke();
		ctx.restore();
	}

	private _drawHorizontalRay(
		ctx: CanvasRenderingContext2D,
		chart: IChartApi,
		series: ISeriesApi<'Candlestick'>,
		drawing: Drawing,
		plotWidth: number
	): void {
		const point = drawing.points![0];
		const startX = chart.timeScale().timeToCoordinate(point.time as any);
		const y = series.priceToCoordinate(point.price);
		if (startX == null || y == null) return;
		const sx = Number(startX);
		const isHidden = !!drawing.hidden;
		const lineColor = isHidden ? 'rgba(148, 163, 184, 0.9)' : (drawing.style?.color || '#3b82f6');
		const lineWidth = isHidden ? 1 : (drawing.style?.width || 2);
		ctx.save();
		ctx.strokeStyle = lineColor;
		ctx.lineWidth = lineWidth;
		ctx.lineCap = 'round';
		ctx.beginPath();
		ctx.moveTo(sx, y);
		ctx.lineTo(plotWidth, y);
		ctx.stroke();
		ctx.restore();
	}
}
