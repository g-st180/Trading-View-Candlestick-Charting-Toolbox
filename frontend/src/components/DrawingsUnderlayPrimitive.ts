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

export type CandleBar = { time: number; open: number; high: number; low: number; close: number };

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
		const { drawings, candlestickData } = data;
		const underlayDrawings = drawings.filter(
			(d) => !d.hidden && (d.type === 'long-position' || d.type === 'short-position' || d.type === 'parallel-channel')
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
}
