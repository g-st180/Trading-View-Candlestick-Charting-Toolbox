/**
 * =============================================================================
 * CANDLESTICK CHART — Main chart component with drawing tool interaction
 * =============================================================================
 *
 * This is the heart of the charting application. It manages:
 *
 *   1. CHART SETUP — Creates and configures the lightweight-charts instance
 *      with candlestick series, volume histogram, and time scale settings
 *
 *   2. SYNTHETIC DATA — Generates 4000 bars of historical data plus live
 *      1-minute bars that update every second (simulating a real data feed)
 *
 *   3. TOOL PLACEMENT — Handles pointer events for placing drawings:
 *      click-to-place for lines/shapes, click-drag for brush, etc.
 *
 *   4. HIT-TESTING — Detects when the cursor hovers over existing drawings
 *      or their handles (findHoveredXxxId / findHoveredHandle functions)
 *
 *   5. DRAG LOGIC — Handles repositioning drawings by dragging their handles
 *      or bodies, with pointer capture to prevent chart panning conflicts
 *
 *   6. PRICE LINE SYNC — Keeps lightweight-charts price markers in sync with
 *      horizontal lines, horizontal rays, and RR box price levels
 *
 *   7. CURSOR MANAGEMENT — Updates cursor style based on active tool and
 *      hover state (crosshair, grab, resize arrows, etc.)
 *
 * The component renders:
 *   - A chart container div (lightweight-charts mounts here)
 *   - An invisible interaction layer div
 *   - DrawingOverlay canvas (visual rendering of all drawings)
 */
import { useEffect, useRef, useState } from 'react';
import { createChart, IChartApi, ISeriesApi, CandlestickData, Time, UTCTimestamp, CrosshairMode } from 'lightweight-charts';
import { useDrawing } from './components/DrawingContext';
import type { Drawing, ChartPoint } from './types/drawing';
import DrawingOverlay from './components/DrawingOverlay';
import { DrawingsUnderlayPrimitive } from './components/DrawingsUnderlayPrimitive';
import { pointToSegmentDistance } from './utils/drawingHelpers';

interface CandlestickChartProps {
    height?: number;
    crosshairType?: string;
}

// ── Component: Props, Refs & Context ────────────────────────────────
// Main chart component. Manages a lightweight-charts instance,
// real-time candlestick simulation, and a full drawing-tool system
// (lines, shapes, annotations, drag, hover, selection).

export default function CandlestickChart({ height = 600, crosshairType = 'hovering-cross' }: CandlestickChartProps): JSX.Element {
    // Core chart DOM & API refs
    const containerRef = useRef<HTMLDivElement | null>(null);
    const interactionLayerRef = useRef<HTMLDivElement | null>(null);
    const chartRef = useRef<IChartApi | null>(null);
    const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
    const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);

    // Invisible series that extends the time-axis into the future so labels render beyond the last candle
    const futureTimeSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
    const lastFutureTimeRef = useRef<number>(0);

    // Canonical candlestick data store; version counter triggers React re-renders when data changes
    const candlestickDataRef = useRef<CandlestickData<Time>[]>([]);
    const [candlestickDataVersion, setCandlestickDataVersion] = useState(0);

    // Shared data bag passed to the DrawingsUnderlayPrimitive so it can paint behind candles
    const underlayDataRef = useRef<{ drawings: Drawing[]; candlestickData: { time: number; open: number; high: number; low: number; close: number; volume?: number }[]; inProgressIds: Set<string> }>({ drawings: [], candlestickData: [], inProgressIds: new Set() });
    const underlayRequestUpdateRef = useRef<{ requestUpdate: (() => void) | null }>({ requestUpdate: null });
    const underlayPrimitiveRef = useRef<DrawingsUnderlayPrimitive | null>(null);

    // Exposed via state so child components (DrawingOverlay) can access the chart/series APIs
    const [chartApi, setChartApi] = useState<IChartApi | null>(null);
    const [seriesApi, setSeriesApi] = useState<ISeriesApi<'Candlestick'> | null>(null);

    // We intentionally avoid covering the chart with a pointer-events layer during drawing,
    // so the user can still interact with candles/price scale (pan/zoom/scale).
    const lastPriceRef = useRef<number>(150);

    // Live 1-minute bar state: Open is fixed when the bar opens; High/Low accumulate tick-by-tick
    const currentBarOpenRef = useRef<number>(150);
    const currentBarHighRef = useRef<number>(150);
    const currentBarLowRef = useRef<number>(150);
    const lastBarMinuteRef = useRef<number>(0);

    // Drawing context — all drawing state (tool selection, drawings list, hover/selection IDs)
    const {
        activeTool,
        activeToolRef: contextActiveToolRef,
        setActiveTool,
        setIsDrawing,
        setCurrentDrawing,
        addDrawing,
        drawings,
        setHoveredHorizontalLineId,
        setHoveredHorizontalLineHandleId,
        setSelectedHorizontalLineId,
        hoveredHorizontalLineId,
        hoveredHorizontalLineHandleId,
        updateDrawing,
        selectedHorizontalLineId,
        setSelectedDrawingId,
        selectedDrawingId,
        removeDrawing,
        hoveredLineId,
        setHoveredLineId,
        hoveredLineHandleId,
        setHoveredLineHandleId,
        setSelectedLineId,
        hoveredHorizontalRayId,
        setHoveredHorizontalRayId,
        hoveredHorizontalRayHandleId,
        setHoveredHorizontalRayHandleId,
        selectedHorizontalRayId,
        setSelectedHorizontalRayId,
        selectedEmoji,
    } = useDrawing();

    // Sync emoji selection into a ref so pointer handlers can read it without re-subscribing
    const selectedEmojiRef = useRef<string | null>(null);
    useEffect(() => {
        selectedEmojiRef.current = selectedEmoji;
    }, [selectedEmoji]);

    // Stable refs for context callbacks — prevents pointer-event useEffects from
    // re-subscribing every time React creates new function identities
    const addDrawingRefFn = useRef(addDrawing);
    const setCurrentDrawingRefFn = useRef(setCurrentDrawing);
    const setIsDrawingRefFn = useRef(setIsDrawing);
    const setActiveToolRefFn = useRef(setActiveTool);
    const updateDrawingRefFn = useRef(updateDrawing);
    // Use context's ref so tool selection is visible immediately (no one-frame delay)
    const activeToolRef = contextActiveToolRef;

    useEffect(() => {
        addDrawingRefFn.current = addDrawing;
        setCurrentDrawingRefFn.current = setCurrentDrawing;
        setIsDrawingRefFn.current = setIsDrawing;
        setActiveToolRefFn.current = setActiveTool;
        updateDrawingRefFn.current = updateDrawing;
    }, [addDrawing, setCurrentDrawing, setIsDrawing, setActiveTool, updateDrawing]);

    const drawingsRef = useRef<Drawing[]>([]);
    useEffect(() => {
        drawingsRef.current = drawings;
    }, [drawings]);

    // ── In-Progress Drawing State & Live-Preview Ticks ────────────────
    // Each two-click drawing tool needs three pieces of state:
    //   1. *InProgressRef  — the drawing id currently being placed (null when idle)
    //   2. *LiveEnd*Ref    — the cursor's current chart-space position during preview
    //   3. *LiveTick state — a counter bumped every pointer-move to trigger React re-render
    // The overlay reads these to show a live preview while the second click hasn't landed.

    const draggingHorizontalLineIdRef = useRef<string | null>(null);

    // Maps of drawing-id → lightweight-charts PriceLine objects, kept in sync via useEffects below
    const horizontalPriceLinesRef = useRef<Map<string, any>>(new Map());
    const horizontalRayPriceLinesRef = useRef<Map<string, any>>(new Map());
    const longPositionPriceLinesRef = useRef<Map<string, any>>(new Map());
    const shortPositionPriceLinesRef = useRef<Map<string, any>>(new Map());

    // Price-range tool
    const priceRangeInProgressRef = useRef<string | null>(null);
    const priceRangeLiveEndPriceRef = useRef<number | null>(null);
    const priceRangeLiveEndTimeRef = useRef<number | null>(null);
    const [priceRangeLiveTick, setPriceRangeLiveTick] = useState(0);

    // Date-range tool
    const dateRangeInProgressRef = useRef<string | null>(null);
    const dateRangeLiveEndTimeRef = useRef<number | null>(null);
    const dateRangeLiveEndPriceRef = useRef<number | null>(null);
    const [dateRangeLiveTick, setDateRangeLiveTick] = useState(0);

    // Date-price-range tool
    const datePriceRangeInProgressRef = useRef<string | null>(null);
    const datePriceRangeLiveEndTimeRef = useRef<number | null>(null);
    const datePriceRangeLiveEndPriceRef = useRef<number | null>(null);
    const [datePriceRangeLiveTick, setDatePriceRangeLiveTick] = useState(0);

    // Rectangle tool
    const rectangleInProgressRef = useRef<string | null>(null);
    const [rectangleLiveTick, setRectangleLiveTick] = useState(0);

    // Path (polyline) tool
    const pathInProgressRef = useRef<string | null>(null);
    const pathLiveEndTimeRef = useRef<number | null>(null);
    const pathLiveEndPriceRef = useRef<number | null>(null);
    const [pathLiveTick, setPathLiveTick] = useState(0);

    // Circle tool
    const circleInProgressRef = useRef<string | null>(null);
    const circleLiveEndTimeRef = useRef<number | null>(null);
    const circleLiveEndPriceRef = useRef<number | null>(null);
    const [circleLiveTick, setCircleLiveTick] = useState(0);

    // Quadratic Bézier curve tool
    const curveInProgressRef = useRef<string | null>(null);
    const [, setCurveLiveTick] = useState(0);

    // Fibonacci retracement tool
    const fibRetracementInProgressRef = useRef<string | null>(null);
    const fibRetracementLiveEndTimeRef = useRef<number | null>(null);
    const fibRetracementLiveEndPriceRef = useRef<number | null>(null);
    const [fibRetracementLiveTick, setFibRetracementLiveTick] = useState(0);

    // Gann box tool
    const gannBoxInProgressRef = useRef<string | null>(null);
    const gannBoxLiveEndTimeRef = useRef<number | null>(null);
    const gannBoxLiveEndPriceRef = useRef<number | null>(null);
    const [gannBoxLiveTick, setGannBoxLiveTick] = useState(0);

    // Zoom selection rectangle
    const zoomStartRef = useRef<{ x: number; y: number } | null>(null);
    const zoomEndRef = useRef<{ x: number; y: number } | null>(null);
    const [zoomLiveTick, setZoomLiveTick] = useState(0);

    // ── Price-Line Sync: Horizontal Lines → Right Price Scale ─────────
    // Each horizontal-line drawing gets a lightweight-charts PriceLine so
    // the price label appears on the right axis. The actual visible line
    // is rendered by DrawingOverlay (lineVisible: false here).
    useEffect(() => {
        const series = seriesRef.current as any;
        if (!series || typeof series.createPriceLine !== 'function') return;

        const map = horizontalPriceLinesRef.current;

        const horizontalLines = drawings.filter(
            (d) =>
                d.type === 'horizontal-line' &&
                d.points &&
                d.points.length >= 1 &&
                typeof d.points[0].price === 'number'
        );

        // Remove price lines that no longer exist
        for (const [id, priceLine] of map.entries()) {
            if (!horizontalLines.some((d) => d.id === id)) {
                try {
                    series.removePriceLine?.(priceLine);
                } catch {}
                map.delete(id);
            }
        }

        // Create / update price lines
        for (const d of horizontalLines) {
            const price = d.points![0].price;
            const isSelected = selectedHorizontalLineId === d.id;

            const isHidden = !!d.hidden;
            const lineColor = isHidden ? 'rgba(148, 163, 184, 0.9)' : isSelected ? '#2563eb' : '#3b82f6';
            const lineWidth = isHidden ? 1 : isSelected ? 2 : 1;

            const options: any = {
                price,
                color: lineColor,
                lineWidth,
                lineStyle: 0,
                axisLabelVisible: true,
                title: '',
                // We draw the line ourselves on the overlay (with the handle gap), so keep chart line hidden if supported.
                lineVisible: false,
            };

            const existing = map.get(d.id);
            if (!existing) {
                const pl = series.createPriceLine(options);
                map.set(d.id, pl);
            } else if (typeof existing.applyOptions === 'function') {
                existing.applyOptions(options);
            }
        }

        return () => {
            // no-op: we manage deletions above; full cleanup happens on unmount below
        };
    }, [drawings, selectedHorizontalLineId]);

    // ── Price-Line Sync: Horizontal Rays → Right Price Scale ──────────
    // Same pattern as horizontal lines but for horizontal-ray drawings.
    useEffect(() => {
        const series = seriesRef.current as any;
        if (!series || typeof series.createPriceLine !== 'function') return;

        const map = horizontalRayPriceLinesRef.current;

        const horizontalRays = drawings.filter(
            (d) =>
                d.type === 'horizontal-ray' &&
                d.points &&
                d.points.length >= 1 &&
                typeof d.points[0].price === 'number'
        );

        // Remove price lines that no longer exist
        for (const [id, priceLine] of map.entries()) {
            if (!horizontalRays.some((d) => d.id === id)) {
                try {
                    series.removePriceLine?.(priceLine);
                } catch {}
                map.delete(id);
            }
        }

        // Create / update price lines
        for (const d of horizontalRays) {
            const price = d.points![0].price;
            const isSelected = selectedHorizontalRayId === d.id;

            const isHidden = !!d.hidden;
            const lineColor = isHidden ? 'rgba(148, 163, 184, 0.9)' : isSelected ? '#2563eb' : '#3b82f6';
            const lineWidth = isHidden ? 1 : isSelected ? 2 : 1;

            const options: any = {
                price,
                color: lineColor,
                lineWidth,
                lineStyle: 0,
                axisLabelVisible: true,
                title: '',
                // We draw the line ourselves on the overlay, so keep chart line hidden if supported.
                lineVisible: false,
            };

            const existing = map.get(d.id);
            if (!existing) {
                const pl = series.createPriceLine(options);
                map.set(d.id, pl);
            } else if (typeof existing.applyOptions === 'function') {
                existing.applyOptions(options);
            }
        }

        return () => {
            // no-op: we manage deletions above; full cleanup happens on unmount below
        };
    }, [drawings, selectedHorizontalRayId]);

    // ── Price-Line Sync: Long Position (RR Box) → Right Price Scale ───
    // Long positions show three price labels: entry (black), TP (green), SL (red).
    // Composite keys like "drawingId:target" keep each label independently managed.
    useEffect(() => {
        const series = seriesRef.current as any;
        if (!series || typeof series.createPriceLine !== 'function') return;

        const map = longPositionPriceLinesRef.current;

        const longPositions = drawings.filter(
            (d) =>
                d.type === 'long-position' &&
                d.entryPrice != null &&
                d.stopLoss != null &&
                d.takeProfit != null
        );

        // Remove price lines that no longer exist
        for (const [id, priceLine] of map.entries()) {
            if (!longPositions.some((d) => d.id === id.split(':')[0])) {
                try {
                    series.removePriceLine?.(priceLine);
                } catch {}
                map.delete(id);
            }
        }

        // Create / update price lines for each long-position
        for (const d of longPositions) {
            const isSelected = selectedDrawingId === d.id;
            const isHidden = !!d.hidden;

            // Target (Take Profit) - Green
            const targetId = `${d.id}:target`;
            const targetColor = isHidden ? 'rgba(60, 174, 60, 0.5)' : isSelected ? '#3cae3c' : '#3cae3c';
            const targetOptions: any = {
                price: d.takeProfit,
                color: targetColor,
                lineWidth: 1,
                lineStyle: 0,
                axisLabelVisible: true,
                title: '',
                lineVisible: false, // No line, just price marker
            };

            let targetExisting = map.get(targetId);
            if (!targetExisting) {
                const pl = series.createPriceLine(targetOptions);
                map.set(targetId, pl);
            } else if (typeof targetExisting.applyOptions === 'function') {
                targetExisting.applyOptions(targetOptions);
            }

            // Entry Price - Black
            const entryId = `${d.id}:entry`;
            const entryColor = isHidden ? 'rgba(0, 0, 0, 0.5)' : isSelected ? '#000000' : '#000000';
            const entryOptions: any = {
                price: d.entryPrice,
                color: entryColor,
                lineWidth: 1,
                lineStyle: 0,
                axisLabelVisible: true,
                title: '',
                lineVisible: false, // No line, just price marker
            };

            let entryExisting = map.get(entryId);
            if (!entryExisting) {
                const pl = series.createPriceLine(entryOptions);
                map.set(entryId, pl);
            } else if (typeof entryExisting.applyOptions === 'function') {
                entryExisting.applyOptions(entryOptions);
            }

            // Stop Loss - Red
            const stopLossId = `${d.id}:stopLoss`;
            const stopLossColor = isHidden ? 'rgba(212, 77, 77, 0.5)' : isSelected ? '#d44d4d' : '#d44d4d';
            const stopLossOptions: any = {
                price: d.stopLoss,
                color: stopLossColor,
                lineWidth: 1,
                lineStyle: 0,
                axisLabelVisible: true,
                title: '',
                lineVisible: false, // No line, just price marker
            };

            let stopLossExisting = map.get(stopLossId);
            if (!stopLossExisting) {
                const pl = series.createPriceLine(stopLossOptions);
                map.set(stopLossId, pl);
            } else if (typeof stopLossExisting.applyOptions === 'function') {
                stopLossExisting.applyOptions(stopLossOptions);
            }
        }

        return () => {
            // no-op: we manage deletions above; full cleanup happens on unmount below
        };
    }, [drawings, selectedDrawingId]);

    // ── Price-Line Sync: Short Position (RR Box) → Right Price Scale ──
    // Mirrors the long-position sync but with inverted TP/SL directions.
    useEffect(() => {
        const series = seriesRef.current as any;
        if (!series || typeof series.createPriceLine !== 'function') return;

        const map = shortPositionPriceLinesRef.current;

        const shortPositions = drawings.filter(
            (d) =>
                d.type === 'short-position' &&
                d.entryPrice != null &&
                d.stopLoss != null &&
                d.takeProfit != null
        );

        for (const [id, priceLine] of map.entries()) {
            if (!shortPositions.some((d) => d.id === id.split(':')[0])) {
                try {
                    series.removePriceLine?.(priceLine);
                } catch {}
                map.delete(id);
            }
        }

        for (const d of shortPositions) {
            const isSelected = selectedDrawingId === d.id;
            const isHidden = !!d.hidden;

            // Target (Take Profit - below entry for short) - Green
            const targetId = `${d.id}:target`;
            const targetColor = isHidden ? 'rgba(60, 174, 60, 0.5)' : isSelected ? '#3cae3c' : '#3cae3c';
            const targetOptions: any = {
                price: d.takeProfit,
                color: targetColor,
                lineWidth: 1,
                lineStyle: 0,
                axisLabelVisible: true,
                title: '',
                lineVisible: false,
            };
            let targetExisting = map.get(targetId);
            if (!targetExisting) {
                const pl = series.createPriceLine(targetOptions);
                map.set(targetId, pl);
            } else if (typeof targetExisting.applyOptions === 'function') {
                targetExisting.applyOptions(targetOptions);
            }

            // Entry Price - Black
            const entryId = `${d.id}:entry`;
            const entryColor = isHidden ? 'rgba(0, 0, 0, 0.5)' : isSelected ? '#000000' : '#000000';
            const entryOptions: any = {
                price: d.entryPrice,
                color: entryColor,
                lineWidth: 1,
                lineStyle: 0,
                axisLabelVisible: true,
                title: '',
                lineVisible: false,
            };
            let entryExisting = map.get(entryId);
            if (!entryExisting) {
                const pl = series.createPriceLine(entryOptions);
                map.set(entryId, pl);
            } else if (typeof entryExisting.applyOptions === 'function') {
                entryExisting.applyOptions(entryOptions);
            }

            // Stop Loss (above entry for short) - Red
            const stopLossId = `${d.id}:stopLoss`;
            const stopLossColor = isHidden ? 'rgba(212, 77, 77, 0.5)' : isSelected ? '#d44d4d' : '#d44d4d';
            const stopLossOptions: any = {
                price: d.stopLoss,
                color: stopLossColor,
                lineWidth: 1,
                lineStyle: 0,
                axisLabelVisible: true,
                title: '',
                lineVisible: false,
            };
            let stopLossExisting = map.get(stopLossId);
            if (!stopLossExisting) {
                const pl = series.createPriceLine(stopLossOptions);
                map.set(stopLossId, pl);
            } else if (typeof stopLossExisting.applyOptions === 'function') {
                stopLossExisting.applyOptions(stopLossOptions);
            }
        }

        return () => {};
    }, [drawings, selectedDrawingId]);

    // ── Price-Line Cleanup on Unmount ──────────────────────────────────
    // Removes every PriceLine from all four maps so lightweight-charts
    // doesn't leak DOM nodes after the component unmounts.
    useEffect(() => {
        return () => {
            const series = seriesRef.current as any;
            const horizontalMap = horizontalPriceLinesRef.current;
            const horizontalRayMap = horizontalRayPriceLinesRef.current;
            if (!series) return;
            for (const [, priceLine] of horizontalMap.entries()) {
                try { series.removePriceLine?.(priceLine); } catch {}
            }
            horizontalMap.clear();
            
            for (const [, priceLine] of horizontalRayMap.entries()) {
                try { series.removePriceLine?.(priceLine); } catch {}
            }
            horizontalRayMap.clear();
            
            const longPositionMap = longPositionPriceLinesRef.current;
            for (const [, priceLine] of longPositionMap.entries()) {
                try { series.removePriceLine?.(priceLine); } catch {}
            }
            longPositionMap.clear();

            const shortPositionMap = shortPositionPriceLinesRef.current;
            for (const [, priceLine] of shortPositionMap.entries()) {
                try { series.removePriceLine?.(priceLine); } catch {}
            }
            shortPositionMap.clear();
        };
    }, []);

    // ── Keyboard: Backspace / Delete Removes Selected Drawing ─────────
    // Global keydown listener that deletes the currently selected drawing.
    // Skips if focus is on an editable element (input, textarea, contenteditable).
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (!selectedDrawingId) return;

            const target = e.target as HTMLElement | null;
            const tag = target?.tagName?.toLowerCase();
            const isEditable =
                !!target?.closest('[contenteditable="true"]') ||
                tag === 'input' ||
                tag === 'textarea' ||
                (target as any)?.isContentEditable;
            if (isEditable) return;

            if (e.key === 'Backspace' || e.key === 'Delete') {
                e.preventDefault();
                removeDrawing(selectedDrawingId);
                setSelectedDrawingId(null);
                setSelectedHorizontalLineId(null);
                setSelectedHorizontalRayId(null);
                setSelectedLineId(null);
            }
        };

        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [selectedDrawingId, removeDrawing, setSelectedDrawingId, setSelectedHorizontalLineId]);

    // ── Chart Initialization ───────────────────────────────────────────
    // Creates the lightweight-charts instance, candlestick series, volume
    // histogram, invisible future-time series, and the DrawingsUnderlayPrimitive.
    // Runs once on mount; teardown removes the primitive and disposes the chart.
    useEffect(() => {
        if (!containerRef.current) return;
        const containerHeight = containerRef.current.clientHeight || height;
        const chart = createChart(containerRef.current, {
            width: containerRef.current.clientWidth,
            height: containerHeight,
            layout: { 
                background: { color: '#ffffff' }, 
                textColor: '#475569',
                fontSize: 12,
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            },
            grid: { 
                vertLines: { color: '#e5e9ed', style: 1, visible: true }, 
                horzLines: { color: '#e5e9ed', style: 1, visible: true } 
            },
            crosshair: {
                mode: CrosshairMode.Normal,
                vertLine: {
                    width: 1,
                    color: 'rgba(148, 163, 184, 0.65)',
                    style: 2, // dashed (middle ground)
                    labelBackgroundColor: '#f1f5f9',
                },
                horzLine: {
                    width: 1,
                    color: 'rgba(148, 163, 184, 0.65)',
                    style: 2, // dashed (middle ground)
                    labelBackgroundColor: '#f1f5f9',
                },
            },
            timeScale: { 
                timeVisible: true, 
                secondsVisible: false,
                borderColor: '#e2e8f0',
                rightOffset: 12,
                // Don't scroll left when a new candle appears — keep the same visible range, new candle forms in empty space
                shiftVisibleRangeOnNewBar: false,
            },
            rightPriceScale: {
                borderColor: '#e2e8f0'
            },
        });

        const candleSeries = chart.addCandlestickSeries({
            upColor: '#10b981', 
            downColor: '#ef4444', 
            borderDownColor: '#ef4444',
            borderUpColor: '#10b981', 
            wickDownColor: '#ef4444', 
            wickUpColor: '#10b981',
        });

        // Volume histogram on a secondary price scale pinned to the bottom 20% of the chart
        const volumeSeries = chart.addHistogramSeries({
            priceScaleId: 'volume',
            priceFormat: { type: 'volume' },
        } as any);
        volumeSeriesRef.current = volumeSeries;
        try {
            chart.priceScale('right').applyOptions({ scaleMargins: { top: 0.05, bottom: 0.25 } });
            chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
        } catch (_) {}

        // Invisible line series only to extend time scale — future timestamps on x-axis, no candles drawn
        const futureSeries = chart.addLineSeries({
            lineVisible: false,
            lastValueVisible: false,
            priceLineVisible: false,
            crosshairMarkerVisible: false,
            lastPriceAnimation: 0,
        } as any);
        futureTimeSeriesRef.current = futureSeries;

        chartRef.current = chart;
        seriesRef.current = candleSeries;
        setChartApi(chart);
        setSeriesApi(candleSeries);

        // Attach underlay primitive — renders RR boxes, parallel channels, etc. above the grid but behind candles
        const primitive = new DrawingsUnderlayPrimitive(underlayDataRef as any, underlayRequestUpdateRef.current);
        candleSeries.attachPrimitive(primitive);
        underlayPrimitiveRef.current = primitive;
        
        const handleResize = () => {
            if (chartRef.current && containerRef.current) {
                const containerHeight = containerRef.current.clientHeight || height;
                chartRef.current.resize(containerRef.current.clientWidth, containerHeight);
            }
        };

        window.addEventListener('resize', handleResize);

        return () => {
            if (underlayPrimitiveRef.current && seriesRef.current) {
                try {
                    seriesRef.current.detachPrimitive(underlayPrimitiveRef.current);
                } catch (_) {}
                underlayPrimitiveRef.current = null;
            }
            underlayRequestUpdateRef.current.requestUpdate = null;
            window.removeEventListener('resize', handleResize);
            chart.remove();
        };
    }, []);

    // ── Underlay Data Sync ─────────────────────────────────────────────
    // Pushes the latest drawings + candlestick data into the underlay primitive's shared ref.
    // In-progress drawings are excluded from the underlay (the overlay handles their preview)
    // to prevent a double-draw that would darken semi-transparent fills.
    useEffect(() => {
        underlayDataRef.current.drawings = drawings;
        const ids = new Set<string>();
        if (priceRangeInProgressRef.current) ids.add(priceRangeInProgressRef.current);
        if (dateRangeInProgressRef.current) ids.add(dateRangeInProgressRef.current);
        if (datePriceRangeInProgressRef.current) ids.add(datePriceRangeInProgressRef.current);
        if (fibRetracementInProgressRef.current) ids.add(fibRetracementInProgressRef.current);
        if (gannBoxInProgressRef.current) ids.add(gannBoxInProgressRef.current);
        underlayDataRef.current.inProgressIds = ids;
        const raw = candlestickDataRef.current ?? [];
        underlayDataRef.current.candlestickData = raw.map((b) => ({
            time: b.time as number,
            open: b.open,
            high: b.high,
            low: b.low,
            close: b.close,
            volume: (b as any).volume,
        }));
        underlayRequestUpdateRef.current.requestUpdate?.();
    }, [drawings, candlestickDataVersion, priceRangeLiveTick, dateRangeLiveTick, datePriceRangeLiveTick, fibRetracementLiveTick, gannBoxLiveTick]);

    // ── Crosshair Style Tuning ─────────────────────────────────────────
    // Reapply crosshair options when crosshairType changes.
    // Dashed lines are a middle ground between solid (visually heavy) and dotted (hard to see).
    useEffect(() => {
        if (!chartApi) return;
        // lightweight-charts types vary a bit by version; keep this robust via `as any`
        (chartApi as any).applyOptions?.({
            crosshair: {
                vertLine: {
                    width: 1,
                    color: 'rgba(148, 163, 184, 0.65)',
                    style: 2, // dashed (middle ground)
                    visible: true,
                },
                horzLine: {
                    width: 1,
                    color: 'rgba(148, 163, 184, 0.65)',
                    style: 2, // dashed (middle ground)
                    visible: true,
                },
            },
        });
    }, [chartApi, crosshairType]);


    const barIntervalSeconds = 60; // 1 minute

    // ── Historical Data Generation & Live Bar Simulation ────────────────
    // Generates ~4000 random 1-minute candles as historical data, sets an initial view range,
    // extends the time axis with invisible future timestamps, and starts a 1-second interval
    // that simulates live price ticks (random walk). The current bar's Open is fixed at the
    // start of each minute; High/Low accumulate; Close updates every tick.
    useEffect(() => {
        if (!seriesRef.current) return;

        const initialData: CandlestickData<Time>[] = [];
        let basePrice = 150;
        const now = Date.now() / 1000;
        const currentMinuteTime = Math.floor(now / barIntervalSeconds) * barIntervalSeconds;
        
        // Historical bars (4000 bars before current minute — ~2.8 days of 1m data)
        for (let i = 4000; i >= 1; i--) {
            const t = (currentMinuteTime - i * barIntervalSeconds) as UTCTimestamp;
            const change = (Math.random() - 0.5) * 10;
            const open = basePrice;
            const close = basePrice + change;
            const high = Math.max(open, close) + Math.random() * 5;
            const low = Math.min(open, close) - Math.random() * 5;
            basePrice = close;
            // Dummy volume per bar (for date-range tool and volume series if needed)
            const volume = Math.floor(10000 + Math.random() * 50000);
            initialData.push({
                time: t,
                open: Number(open.toFixed(2)),
                high: Number(high.toFixed(2)),
                low: Number(low.toFixed(2)),
                close: Number(close.toFixed(2)),
                volume,
            } as CandlestickData<Time>);
        }

        // Current minute bar — Open stays fixed; we'll only update High/Low/Close every second
        initialData.push({
            time: currentMinuteTime as UTCTimestamp,
            open: basePrice,
            high: basePrice,
            low: basePrice,
            close: basePrice,
            volume: Math.floor(10000 + Math.random() * 50000),
        } as CandlestickData<Time>);
        lastPriceRef.current = basePrice;
        currentBarOpenRef.current = basePrice;
        currentBarHighRef.current = basePrice;
        currentBarLowRef.current = basePrice;
        lastBarMinuteRef.current = currentMinuteTime;

        seriesRef.current.setData(initialData);
        candlestickDataRef.current = [...initialData];
        const volUp = 'rgba(16, 185, 129, 0.45)';
        const volDown = 'rgba(239, 68, 68, 0.45)';
        const volumeData = initialData.map((b) => ({
            time: b.time,
            value: (b as any).volume ?? 0,
            color: b.close >= b.open ? volUp : volDown,
        }));
        volumeSeriesRef.current?.setData(volumeData);
        setCandlestickDataVersion((v) => v + 1);

        // Future timestamps only: invisible series so x-axis has labels all the way to the right border when scrolled
        const futureBarsCount = 600; // 10 hours (1-min bars)
        const futureData = Array.from({ length: futureBarsCount }, (_, k) => ({
            time: (currentMinuteTime + (k + 1) * barIntervalSeconds) as UTCTimestamp,
            value: basePrice,
        }));
        futureTimeSeriesRef.current?.setData(futureData);
        lastFutureTimeRef.current = currentMinuteTime + futureBarsCount * barIntervalSeconds;

        // Position view on the most recent candle: visible range ends at current candle + a little future (not at last future timestamp)
        const chart = chartRef.current;
        if (chart) {
            const ts = chart.timeScale();
            const rangeEndTime = currentMinuteTime + barIntervalSeconds * (1 + 12); // current candle + 12 bars right margin
            const rangeStartTime = currentMinuteTime - 50 * barIntervalSeconds; // initial view: ~50 bars of history (data has 200)
            const applyInitialView = () => {
                try {
                        (ts as any).setVisibleRange?.({ from: rangeStartTime, to: rangeEndTime });
                } catch {
                    try {
                        (ts as any).setVisibleLogicalRange?.({ from: 0, to: 51 + 12 });
                    } catch {}
                }
            };
            requestAnimationFrame(applyInitialView);
            setTimeout(applyInitialView, 100);
        }

        // Every second: update only Close (and running High/Low); Open stays fixed until the minute rolls over
        const interval = setInterval(() => {
            if (!seriesRef.current) return;
            const nowSec = Date.now() / 1000;
            const currentMinute = Math.floor(nowSec / barIntervalSeconds) * barIntervalSeconds;

            // New minute: next bar gets Open = last close; update that bar and refresh future timestamps
            if (currentMinute !== lastBarMinuteRef.current) {
                lastBarMinuteRef.current = currentMinute;
                currentBarOpenRef.current = lastPriceRef.current;
                currentBarHighRef.current = lastPriceRef.current;
                currentBarLowRef.current = lastPriceRef.current;
                // Keep future timestamps ahead so x-axis has labels to the right border
                const nextFutureData = Array.from({ length: futureBarsCount }, (_, k) => ({
                    time: (currentMinute + (k + 1) * barIntervalSeconds) as UTCTimestamp,
                    value: lastPriceRef.current,
                }));
                futureTimeSeriesRef.current?.setData(nextFutureData);
                lastFutureTimeRef.current = currentMinute + futureBarsCount * barIntervalSeconds;
            }

            const open = currentBarOpenRef.current;
            const change = (Math.random() - 0.5) * 10;
            const close = Number((lastPriceRef.current + change).toFixed(2));
            lastPriceRef.current = close;

            const high = Number(Math.max(currentBarHighRef.current, open, close).toFixed(2));
            const low = Number(Math.min(currentBarLowRef.current, open, close).toFixed(2));
            currentBarHighRef.current = high;
            currentBarLowRef.current = low;

            const barUpdate = {
                time: currentMinute as UTCTimestamp,
                open,
                high,
                low,
                close,
                volume: Math.floor(10000 + Math.random() * 50000),
            } as CandlestickData<Time>;
            seriesRef.current.update(barUpdate);
            const volColor = close >= open ? 'rgba(16, 185, 129, 0.45)' : 'rgba(239, 68, 68, 0.45)';
            volumeSeriesRef.current?.update({
                time: currentMinute as UTCTimestamp,
                value: (barUpdate as any).volume ?? 0,
                color: volColor,
            });
            const data = candlestickDataRef.current;
            const idx = data.findIndex((b) => (b.time as number) === currentMinute);
            if (idx >= 0) {
                data[idx] = barUpdate;
            } else {
                data.push(barUpdate);
            }
            setCandlestickDataVersion((v) => v + 1);
        }, 1000);

        return () => clearInterval(interval);
    }, []);

    // ============================================================================
    // DRAWING LOGIC (Shared for all drawing tools)
    // ============================================================================
    // Handles the actual drawing/placement of drawings on the chart.
    // This is tool-agnostic and works for both 'lines' and 'horizontal-line' tools.
    useEffect(() => {
        if (!containerRef.current || !chartRef.current) return;

        const container = containerRef.current;
        // Keep these as refs so they survive re-renders.
        let isDrawing = false;
        let currentDrawingRef: Drawing | null = null;
        let isPlacingLine = false;
        let isPlacingParallel = false; // For parallel-channel: after second click, we're placing the parallel line
        let cachedFirstLineScreen: { startX: number; startY: number; endX: number; endY: number } | null = null;

        const getLocalXY = (e: PointerEvent) => {
            const rect = container.getBoundingClientRect();
            return { x: e.clientX - rect.left, y: e.clientY - rect.top };
        };

        // Use library conversion (smooth interpolation was breaking drawing; can revisit later with correct coord system)
        const getTimeFromX = (ch: IChartApi, x: number): number | null => ch.timeScale().coordinateToTime(x as any) as number | null;

        const screenToChart = (x: number, y: number): ChartPoint | null => {
            const chart = chartRef.current;
            const series = seriesRef.current;
            if (!chart || !series) return null;

            const t = getTimeFromX(chart, x);
            const p = series.coordinateToPrice(y);
            if (t == null || p == null) return null;

            // For this app we only support UTCTimestamp (number seconds) for now.
            if (typeof t !== 'number') return null;
            return { time: t, price: p };
        };

        // ── handlePointerDown: Placement Router ────────────────────────
        // Dispatches to the correct placement logic based on activeTool.
        // Single-click tools (emoji, horizontal-line, long-position, etc.)
        // finalize immediately. Two-click tools (rectangle, fib, lines, etc.)
        // register a start point on first click and finalize on second.
        // Three-click tools (parallel-channel) add an extra placement step.
        const handlePointerDown = (e: PointerEvent) => {
            const tool = activeToolRef.current;
            if (tool !== 'lines' && tool !== 'ray' && tool !== 'info-line' && tool !== 'horizontal-line' && tool !== 'horizontal-ray' && tool !== 'parallel-channel' && tool !== 'long-position' && tool !== 'short-position' && tool !== 'price-range' && tool !== 'date-range' && tool !== 'date-price-range' && tool !== 'fibonacci-retracement' && tool !== 'gann-box' && tool !== 'brush' && tool !== 'rectangle' && tool !== 'path' && tool !== 'circle' && tool !== 'curve' && tool !== 'emoji' && tool !== 'zoom' && tool !== 'arrow-marker' && tool !== 'arrow' && tool !== 'arrow-markup' && tool !== 'arrow-markdown') return;
            const { x, y } = getLocalXY(e);

            // ── Zoom Tool ──
            if (tool === 'zoom') {
                const chart = chartRef.current;
                const series = seriesRef.current;
                if (!chart || !series) return;
                e.preventDefault();
                e.stopPropagation();
                zoomStartRef.current = { x, y };
                zoomEndRef.current = { x, y };
                setZoomLiveTick((t) => t + 1);
                try {
                    container.setPointerCapture(e.pointerId);
                } catch (_) {}
                return;
            }

            const drawingId = `drawing-${Date.now()}`;

            // ── Brush Tool (click-drag) ──
            if (tool === 'brush') {
                e.preventDefault();
                e.stopPropagation();
                const chart = chartRef.current;
                const series = seriesRef.current;
                if (!chart || !series) return;
                const time = getTimeFromX(chart, x);
                const price = series.coordinateToPrice(y);
                if (time == null || price == null) return;
                const brushDrawing: Drawing = {
                    id: drawingId,
                    type: 'brush',
                    points: [{ time, price }],
                    style: { color: '#3b82f6', width: 2 },
                };
                currentDrawingRef = brushDrawing;
                setCurrentDrawingRefFn.current(brushDrawing);
                setIsDrawingRefFn.current(true);
                isDrawing = true;
                try {
                    container.setPointerCapture(e.pointerId);
                } catch (_) {}
                return;
            }

            // ── Emoji Tool (single-click placement) ──
            if (tool === 'emoji') {
                e.preventDefault();
                e.stopPropagation();
                const chart = chartRef.current;
                const series = seriesRef.current;
                const emojiChar = selectedEmojiRef.current;
                if (!chart || !series || !emojiChar) return;
                const time = getTimeFromX(chart, x);
                const price = series.coordinateToPrice(y);
                if (time == null || price == null) return;
                // Place emoji with default box: top-left at click, size ~2% price height, ~120s width
                const priceDelta = Math.abs(price) * 0.02 || 1;
                const endTime = time + 120;
                const endPrice = price - priceDelta;
                const emojiDrawing: Drawing = {
                    id: drawingId,
                    type: 'emoji',
                    emojiChar,
                    startTime: time,
                    startPrice: price,
                    endTime,
                    endPrice,
                    style: { color: '#3b82f6', width: 2 },
                };
                addDrawingRefFn.current(emojiDrawing);
                setActiveToolRefFn.current(null);
                return;
            }

            // ── Arrow Markup / Markdown (single-click annotations) ──
            if (tool === 'arrow-markup') {
                e.preventDefault();
                e.stopPropagation();
                const chart = chartRef.current;
                const series = seriesRef.current;
                if (!chart || !series) return;
                const time = getTimeFromX(chart, x);
                const price = series.coordinateToPrice(y);
                if (time == null || price == null) return;
                const markupDrawing: Drawing = {
                    id: drawingId,
                    type: 'arrow-markup',
                    points: [{ time, price }],
                    style: { color: '#22c55e', width: 2 },
                };
                addDrawingRefFn.current(markupDrawing);
                setActiveToolRefFn.current(null);
                return;
            }

            if (tool === 'arrow-markdown') {
                e.preventDefault();
                e.stopPropagation();
                const chart = chartRef.current;
                const series = seriesRef.current;
                if (!chart || !series) return;
                const time = getTimeFromX(chart, x);
                const price = series.coordinateToPrice(y);
                if (time == null || price == null) return;
                const markdownDrawing: Drawing = {
                    id: drawingId,
                    type: 'arrow-markdown',
                    points: [{ time, price }],
                    style: { color: '#ef4444', width: 2 },
                };
                addDrawingRefFn.current(markdownDrawing);
                setActiveToolRefFn.current(null);
                return;
            }

            // ── Rectangle Tool (two-click: start corner → end corner) ──
            if (tool === 'rectangle') {
                e.preventDefault();
                e.stopPropagation();
                const chart = chartRef.current;
                const series = seriesRef.current;
                if (!chart || !series) return;
                const time = getTimeFromX(chart, x);
                const price = series.coordinateToPrice(y);
                if (time == null || price == null) return;

                // Second click: set end and finalize
                if (rectangleInProgressRef.current) {
                    const id = rectangleInProgressRef.current;
                    updateDrawingRefFn.current(id, (prev) => ({ ...prev, endTime: time, endPrice: price }));
                    rectangleInProgressRef.current = null;
                    setActiveToolRefFn.current(null);
                    return;
                }

                // First click: register start; then drag (no hold) to preview, second click to finalize
                const rectDrawing: Drawing = {
                    id: drawingId,
                    type: 'rectangle',
                    startTime: time,
                    startPrice: price,
                    style: { color: '#3b82f6', width: 2 },
                };
                addDrawingRefFn.current(rectDrawing);
                rectangleInProgressRef.current = drawingId;
                return;
            }

            // ── Gann Box Tool (two-click: start corner → end corner) ──
            if (tool === 'gann-box') {
                e.preventDefault();
                e.stopPropagation();
                const chart = chartRef.current;
                const series = seriesRef.current;
                if (!chart || !series) return;
                const time = getTimeFromX(chart, x);
                const price = series.coordinateToPrice(y);
                if (time == null || price == null) return;

                if (gannBoxInProgressRef.current) {
                    const id = gannBoxInProgressRef.current;
                    updateDrawingRefFn.current(id, (prev) => ({ ...prev, endTime: time, endPrice: price }));
                    gannBoxInProgressRef.current = null;
                    setActiveToolRefFn.current(null);
                    return;
                }

                const gannDrawing: Drawing = {
                    id: drawingId,
                    type: 'gann-box',
                    startTime: time,
                    startPrice: price,
                    style: { color: '#6366f1', width: 2 },
                };
                addDrawingRefFn.current(gannDrawing);
                gannBoxInProgressRef.current = drawingId;
                return;
            }

            // ── Circle Tool (two-click: center → radius point) ──
            if (tool === 'circle') {
                e.preventDefault();
                e.stopPropagation();
                const chart = chartRef.current;
                const series = seriesRef.current;
                if (!chart || !series) return;
                const time = getTimeFromX(chart, x);
                const price = series.coordinateToPrice(y);
                if (time == null || price == null) return;

                // Second click: set radius point and finalize
                if (circleInProgressRef.current) {
                    const id = circleInProgressRef.current;
                    updateDrawingRefFn.current(id, (prev) => ({ ...prev, endTime: time, endPrice: price }));
                    circleInProgressRef.current = null;
                    setActiveToolRefFn.current(null);
                    return;
                }

                // First click: center; then move to preview radius, second click to finalize
                const circleDrawing: Drawing = {
                    id: drawingId,
                    type: 'circle',
                    startTime: time,
                    startPrice: price,
                    endTime: time,
                    endPrice: price,
                    style: { color: '#3b82f6', width: 2 },
                };
                addDrawingRefFn.current(circleDrawing);
                circleInProgressRef.current = drawingId;
                return;
            }

            // ── Curve Tool (two-click: start → end; control point auto-computed) ──
            if (tool === 'curve') {
                e.preventDefault();
                e.stopPropagation();
                const chart = chartRef.current;
                const series = seriesRef.current;
                if (!chart || !series) return;
                const pt = screenToChart(x, y);
                if (!pt) return;

                if (curveInProgressRef.current) {
                    const id = curveInProgressRef.current;
                    const curveDrawing = drawingsRef.current.find((d) => d.id === id);
                    if (!curveDrawing || curveDrawing.type !== 'curve' || !curveDrawing.points?.length) {
                        curveInProgressRef.current = null;
                        return;
                    }
                    const start = curveDrawing.points[0];
                    const end = pt;
                    const startScreenX = chart.timeScale().timeToCoordinate(start.time as any);
                    const startScreenY = series.priceToCoordinate(start.price);
                    const endScreenX = chart.timeScale().timeToCoordinate(end.time as any);
                    const endScreenY = series.priceToCoordinate(end.price);
                    let control: { time: number; price: number };
                    if (startScreenX != null && startScreenY != null && endScreenX != null && endScreenY != null) {
                        const midX = (Number(startScreenX) + Number(endScreenX)) / 2;
                        const midY = (startScreenY + endScreenY) / 2;
                        const dx = Number(endScreenX) - Number(startScreenX);
                        const dy = endScreenY - startScreenY;
                        const len = Math.hypot(dx, dy) || 1;
                        const offset = len * 0.4;
                        const perpX = (-dy / len) * offset;
                        const perpY = (dx / len) * offset;
                        const ctrlScreenX = midX + perpX;
                        const ctrlScreenY = midY + perpY;
                        const ctrlTime = getTimeFromX(chart, ctrlScreenX);
                        const ctrlPrice = series.coordinateToPrice(ctrlScreenY);
                        if (ctrlTime != null && ctrlPrice != null) {
                            control = { time: ctrlTime, price: ctrlPrice };
                        } else {
                            control = { time: (start.time + end.time) / 2, price: (start.price + end.price) / 2 };
                        }
                    } else {
                        control = { time: (start.time + end.time) / 2, price: (start.price + end.price) / 2 };
                    }
                    updateDrawingRefFn.current(id, (prev) => ({
                        ...prev,
                        points: [start, control, end],
                    }));
                    setCurrentDrawingRefFn.current(null);
                    curveInProgressRef.current = null;
                    setActiveToolRefFn.current(null);
                    return;
                }

                const curveDrawing: Drawing = {
                    id: drawingId,
                    type: 'curve',
                    points: [pt],
                    style: { color: '#3b82f6', width: 2 },
                };
                addDrawingRefFn.current(curveDrawing);
                setCurrentDrawingRefFn.current(curveDrawing);
                curveInProgressRef.current = drawingId;
                return;
            }

            // ── Path / Polyline Tool (multi-click: click to add vertex, click on last vertex to close) ──
            if (tool === 'path') {
                e.preventDefault();
                e.stopPropagation();
                const chart = chartRef.current;
                const series = seriesRef.current;
                if (!chart || !series) return;
                const time = getTimeFromX(chart, x);
                const price = series.coordinateToPrice(y);
                if (time == null || price == null) return;

                const SNAP_RADIUS = 14; // pixels

                const chartToScreen = (t: number, p: number) => {
                    const sx = chart.timeScale().timeToCoordinate(t as any);
                    const sy = series.priceToCoordinate(p);
                    return sx != null && sy != null ? { x: Number(sx), y: sy } : null;
                };

                if (pathInProgressRef.current) {
                    const id = pathInProgressRef.current;
                    const pathDrawing = drawingsRef.current.find((d) => d.id === id);
                    if (!pathDrawing || pathDrawing.type !== 'path' || !pathDrawing.points?.length) {
                        pathInProgressRef.current = null;
                        return;
                    }
                    const pts = pathDrawing.points;
                    const lastPt = pts[pts.length - 1];
                    const lastScreen = chartToScreen(lastPt.time, lastPt.price);
                    const distToLast = lastScreen ? Math.hypot(x - lastScreen.x, y - lastScreen.y) : Infinity;

                    if (distToLast <= SNAP_RADIUS && (pts.length === 1 || pts.length >= 2)) {
                        pathInProgressRef.current = null;
                        pathLiveEndTimeRef.current = null;
                        pathLiveEndPriceRef.current = null;
                        setActiveToolRefFn.current(null);
                        return;
                    }

                    for (let i = 0; i < pts.length - 1; i++) {
                        const sc = chartToScreen(pts[i].time, pts[i].price);
                        if (sc && Math.hypot(x - sc.x, y - sc.y) <= SNAP_RADIUS) {
                            updateDrawingRefFn.current(id, (prev) => ({
                                ...prev,
                                points: [...(prev.points || []), { time: pts[i].time, price: pts[i].price }],
                            }));
                            setPathLiveTick((t) => t + 1);
                            return;
                        }
                    }

                    updateDrawingRefFn.current(id, (prev) => ({
                        ...prev,
                        points: [...(prev.points || []), { time, price }],
                    }));
                    setPathLiveTick((t) => t + 1);
                    return;
                }

                const pathDrawing: Drawing = {
                    id: drawingId,
                    type: 'path',
                    points: [{ time, price }],
                    style: { color: '#3b82f6', width: 2 },
                };
                addDrawingRefFn.current(pathDrawing);
                pathInProgressRef.current = drawingId;
                pathLiveEndTimeRef.current = null;
                pathLiveEndPriceRef.current = null;
                return;
            }

            // ── Long Position Tool (single-click: places RR box with default 1% TP/SL) ──
            if (tool === 'long-position') {
                const chart = chartRef.current;
                const series = seriesRef.current;
                if (!chart || !series) return;
                
                const time = getTimeFromX(chart, x);
                const entryPrice = series.coordinateToPrice(y);
                if (time == null || entryPrice == null) return;

                const stopLoss = entryPrice * 0.99; // 1% down
                const takeProfit = entryPrice * 1.01; // 1% up

                const visibleRange = chart.timeScale().getVisibleRange();
                let timeRange: number;
                if (visibleRange && typeof visibleRange.from === 'number' && typeof visibleRange.to === 'number') {
                    timeRange = visibleRange.to - visibleRange.from;
                } else {
                    timeRange = 60 * 10;
                }
                const estimatedBarWidth = Math.max(timeRange / 100, 60);
                const tenBarsWidth = estimatedBarWidth * 10;
                const endTime = time + tenBarsWidth;

                addDrawingRefFn.current({
                    id: drawingId,
                    type: 'long-position',
                    entryPrice,
                    stopLoss,
                    takeProfit,
                    startTime: time,
                    endTime,
                    style: { color: '#3b82f6', width: 2 },
                });

                setActiveToolRefFn.current(null);
                setCurrentDrawingRefFn.current(null);
                setIsDrawingRefFn.current(false);
                isDrawing = false;
                currentDrawingRef = null;
                return;
            }

            // ── Short Position Tool (single-click: places RR box with inverted TP/SL) ──
            if (tool === 'short-position') {
                const chart = chartRef.current;
                const series = seriesRef.current;
                if (!chart || !series) return;
                
                const time = getTimeFromX(chart, x);
                const entryPrice = series.coordinateToPrice(y);
                if (time == null || entryPrice == null) return;

                const takeProfit = entryPrice * 0.99; // 1% down = profit for short
                const stopLoss = entryPrice * 1.01; // 1% up = loss for short

                const visibleRange = chart.timeScale().getVisibleRange();
                let timeRange: number;
                if (visibleRange && typeof visibleRange.from === 'number' && typeof visibleRange.to === 'number') {
                    timeRange = visibleRange.to - visibleRange.from;
                } else {
                    timeRange = 60 * 10;
                }
                const estimatedBarWidth = Math.max(timeRange / 100, 60);
                const tenBarsWidth = estimatedBarWidth * 10;
                const endTime = time + tenBarsWidth;

                addDrawingRefFn.current({
                    id: drawingId,
                    type: 'short-position',
                    entryPrice,
                    stopLoss,
                    takeProfit,
                    startTime: time,
                    endTime,
                    style: { color: '#3b82f6', width: 2 },
                });

                setActiveToolRefFn.current(null);
                setCurrentDrawingRefFn.current(null);
                setIsDrawingRefFn.current(false);
                isDrawing = false;
                currentDrawingRef = null;
                return;
            }

            // ── Fibonacci Retracement Tool (two-click: start level → end level) ──
            if (tool === 'fibonacci-retracement') {
                const chart = chartRef.current;
                const series = seriesRef.current;
                if (!chart || !series) return;
                const time = getTimeFromX(chart, x);
                const price = series.coordinateToPrice(y);
                if (time == null || price == null) return;

                if (fibRetracementInProgressRef.current) {
                    const id = fibRetracementInProgressRef.current;
                    updateDrawingRefFn.current(id, (prev) => ({ ...prev, endTime: time, endPrice: price }));
                    fibRetracementInProgressRef.current = null;
                    fibRetracementLiveEndPriceRef.current = null;
                    fibRetracementLiveEndTimeRef.current = null;
                    setCurrentDrawingRefFn.current(null);
                    setIsDrawingRefFn.current(false);
                    setActiveToolRefFn.current(null);
                    isDrawing = false;
                    currentDrawingRef = null;
                    setFibRetracementLiveTick((t) => t + 1);
                    return;
                }

                const newDrawing: Drawing = {
                    id: drawingId,
                    type: 'fibonacci-retracement',
                    startTime: time,
                    startPrice: price,
                    endTime: time,
                    endPrice: price,
                    style: { color: '#3b82f6', width: 2 },
                };
                addDrawingRefFn.current(newDrawing);
                currentDrawingRef = newDrawing;
                setCurrentDrawingRefFn.current(newDrawing);
                isDrawing = true;
                setIsDrawingRefFn.current(true);
                fibRetracementInProgressRef.current = drawingId;
                fibRetracementLiveEndPriceRef.current = null;
                fibRetracementLiveEndTimeRef.current = null;
                return;
            }

            // ── Price Range Tool (two-click: start → end, shows price delta) ──
            if (tool === 'price-range') {
                const chart = chartRef.current;
                const series = seriesRef.current;
                if (!chart || !series) return;
                const time = getTimeFromX(chart, x);
                const price = series.coordinateToPrice(y);
                if (time == null || price == null) return;

                // Second click: set end (time + price) and finalize
                if (priceRangeInProgressRef.current) {
                    const id = priceRangeInProgressRef.current;
                    updateDrawingRefFn.current(id, (prev) => ({ ...prev, endTime: time, endPrice: price }));
                    priceRangeInProgressRef.current = null;
                    priceRangeLiveEndPriceRef.current = null;
                    priceRangeLiveEndTimeRef.current = null;
                    setCurrentDrawingRefFn.current(null);
                    setIsDrawingRefFn.current(false);
                    setActiveToolRefFn.current(null); // Return to crosshair like other tools
                    isDrawing = false;
                    currentDrawingRef = null;
                    return;
                }

                // First click: place start dot; move (no hold) to see live preview; second click to finalize
                const newDrawing: Drawing = {
                    id: drawingId,
                    type: 'price-range',
                    startTime: time,
                    startPrice: price,
                    style: { color: '#3b82f6', width: 2 },
                };
                addDrawingRefFn.current(newDrawing);
                currentDrawingRef = newDrawing;
                setCurrentDrawingRefFn.current(newDrawing);
                isDrawing = true;
                setIsDrawingRefFn.current(true);
                priceRangeInProgressRef.current = drawingId;
                priceRangeLiveEndPriceRef.current = null;
                priceRangeLiveEndTimeRef.current = null;
                return;
            }

            // ── Date Range Tool (two-click: start → end, shows time delta) ──
            if (tool === 'date-range') {
                const chart = chartRef.current;
                const series = seriesRef.current;
                if (!chart || !series) return;
                const time = getTimeFromX(chart, x);
                const price = series.coordinateToPrice(y);
                if (time == null || price == null) return;

                if (dateRangeInProgressRef.current) {
                    const id = dateRangeInProgressRef.current;
                    updateDrawingRefFn.current(id, (prev) => ({ ...prev, endTime: time, endPrice: price }));
                    dateRangeInProgressRef.current = null;
                    dateRangeLiveEndTimeRef.current = null;
                    dateRangeLiveEndPriceRef.current = null;
                    setCurrentDrawingRefFn.current(null);
                    setIsDrawingRefFn.current(false);
                    setActiveToolRefFn.current(null);
                    isDrawing = false;
                    currentDrawingRef = null;
                    return;
                }

                const newDrawing: Drawing = {
                    id: drawingId,
                    type: 'date-range',
                    startTime: time,
                    startPrice: price,
                    style: { color: '#3b82f6', width: 2 },
                };
                addDrawingRefFn.current(newDrawing);
                currentDrawingRef = newDrawing;
                setCurrentDrawingRefFn.current(newDrawing);
                isDrawing = true;
                setIsDrawingRefFn.current(true);
                dateRangeInProgressRef.current = drawingId;
                dateRangeLiveEndTimeRef.current = null;
                dateRangeLiveEndPriceRef.current = null;
                return;
            }

            // ── Date-Price Range Tool (two-click: start → end, shows both deltas) ──
            if (tool === 'date-price-range') {
                const chart = chartRef.current;
                const series = seriesRef.current;
                if (!chart || !series) return;
                const time = getTimeFromX(chart, x);
                const price = series.coordinateToPrice(y);
                if (time == null || price == null) return;

                if (datePriceRangeInProgressRef.current) {
                    const id = datePriceRangeInProgressRef.current;
                    updateDrawingRefFn.current(id, (prev) => ({ ...prev, endTime: time, endPrice: price }));
                    datePriceRangeInProgressRef.current = null;
                    datePriceRangeLiveEndTimeRef.current = null;
                    datePriceRangeLiveEndPriceRef.current = null;
                    setCurrentDrawingRefFn.current(null);
                    setIsDrawingRefFn.current(false);
                    setActiveToolRefFn.current(null);
                    isDrawing = false;
                    currentDrawingRef = null;
                    return;
                }

                const newDrawing: Drawing = {
                    id: drawingId,
                    type: 'date-price-range',
                    startTime: time,
                    startPrice: price,
                    style: { color: '#3b82f6', width: 2 },
                };
                addDrawingRefFn.current(newDrawing);
                currentDrawingRef = newDrawing;
                setCurrentDrawingRefFn.current(newDrawing);
                isDrawing = true;
                setIsDrawingRefFn.current(true);
                datePriceRangeInProgressRef.current = drawingId;
                datePriceRangeLiveEndTimeRef.current = null;
                datePriceRangeLiveEndPriceRef.current = null;
                return;
            }

            // ── Horizontal Line Tool (single-click: anchored to price only, time=0) ──
            if (tool === 'horizontal-line') {
                const series = seriesRef.current;
                if (!series) return;
                const price = series.coordinateToPrice(y);
                if (price == null) return;

                addDrawingRefFn.current({
                    id: drawingId,
                    type: 'horizontal-line',
                    points: [{ time: 0, price }],
                    style: { color: '#3b82f6', width: 2 },
                });

                // Immediately return to navigation mode (crosshair)
                setActiveToolRefFn.current(null);
                setCurrentDrawingRefFn.current(null);
                setIsDrawingRefFn.current(false);
                isDrawing = false;
                currentDrawingRef = null;
                return;
            }

            // ── Horizontal Ray Tool (single-click: ray from click point → right edge) ──
            if (tool === 'horizontal-ray') {
                const chart = chartRef.current;
                const series = seriesRef.current;
                if (!chart || !series) return;
                
                const time = getTimeFromX(chart, x);
                const price = series.coordinateToPrice(y);
                if (time == null || price == null) return;

                addDrawingRefFn.current({
                    id: drawingId,
                    type: 'horizontal-ray',
                    points: [{ time, price }],
                    style: { color: '#3b82f6', width: 2 },
                });

                // Immediately return to navigation mode (crosshair)
                setActiveToolRefFn.current(null);
                setCurrentDrawingRefFn.current(null);
                setIsDrawingRefFn.current(false);
                isDrawing = false;
                currentDrawingRef = null;
                return;
            }

            // Lines/Ray/Arrow/Parallel Channel tool: 2-click place + preview + place
            if (!isPlacingLine && !isPlacingParallel) {
                // First click: place start point
                const startPt = screenToChart(x, y);
                if (!startPt) return;
                isPlacingLine = true;
                isDrawing = true;
                setIsDrawingRefFn.current(true);
                currentDrawingRef = {
                    id: drawingId,
                    type: tool, // 'lines', 'ray', or 'parallel-channel'
                    // chart-space points so it stays anchored to candles on pan/zoom
                    points: [startPt],
                    style: { color: '#3b82f6', width: 2 },
                };
                setCurrentDrawingRefFn.current(currentDrawingRef);
                return;
            }

            // Second click: for parallel-channel, enter parallel placement mode; for others, complete
            if (isPlacingLine && !isPlacingParallel) {
                const endPt = screenToChart(x, y);
                if (!endPt) return;
                if (!currentDrawingRef?.points?.length) return;
                
                if (tool === 'parallel-channel') {
                    // For parallel-channel: don't complete yet, enter parallel placement mode
                    // Cache first line screen coordinates NOW to avoid quantization during preview
                    const chart = chartRef.current;
                    const series = seriesRef.current;
                    if (!chart || !series) return;
                    
                    const start1 = currentDrawingRef.points[0];
                    const start1ScreenX = chart.timeScale().timeToCoordinate(start1.time as any);
                    const start1ScreenY = series.priceToCoordinate(start1.price);
                    const end1ScreenX = chart.timeScale().timeToCoordinate(endPt.time as any);
                    const end1ScreenY = series.priceToCoordinate(endPt.price);
                    
                    if (start1ScreenX != null && start1ScreenY != null && end1ScreenX != null && end1ScreenY != null) {
                        cachedFirstLineScreen = {
                            startX: start1ScreenX,
                            startY: start1ScreenY,
                            endX: end1ScreenX,
                            endY: end1ScreenY,
                        };
                    }
                    
                    currentDrawingRef = {
                        ...currentDrawingRef,
                        points: [currentDrawingRef.points[0], endPt],
                    };
                    isPlacingLine = false;
                    isPlacingParallel = true;
                    setCurrentDrawingRefFn.current(currentDrawingRef);
                    return;
                } else {
                    // For lines/ray: complete the drawing
                    currentDrawingRef = {
                        ...currentDrawingRef,
                        points: [currentDrawingRef.points[0], endPt],
                    };
                    addDrawingRefFn.current(currentDrawingRef);
                    setCurrentDrawingRefFn.current(null);
                    setIsDrawingRefFn.current(false);
                    setActiveToolRefFn.current(null); // Auto-switch to crosshair after drawing
                    isDrawing = false;
                    isPlacingLine = false;
                    currentDrawingRef = null;
                    return;
                }
            }

            // Third click (parallel-channel only): complete the channel
            if (isPlacingParallel && tool === 'parallel-channel') {
                const finalPt = screenToChart(x, y);
                if (!finalPt) return;
                if (!currentDrawingRef?.points || currentDrawingRef.points.length < 2) return;
                
                // Calculate the parallel line based on the offset from the first line
                // We'll store 4 points: [start1, end1, start2, end2] for the two parallel lines
                const start1 = currentDrawingRef.points[0];
                const end1 = currentDrawingRef.points[1];
                
                // Vertical stretch only: keep same X coordinates, only adjust Y based on mouse
                const chart = chartRef.current;
                const series = seriesRef.current;
                if (!chart || !series) return;
                
                // Convert first line points to screen coordinates
                const start1ScreenX = chart.timeScale().timeToCoordinate(start1.time as any);
                const start1ScreenY = series.priceToCoordinate(start1.price);
                const end1ScreenX = chart.timeScale().timeToCoordinate(end1.time as any);
                const end1ScreenY = series.priceToCoordinate(end1.price);
                
                if (start1ScreenX == null || start1ScreenY == null || end1ScreenX == null || end1ScreenY == null) return;
                
                // Calculate vertical offset based on mouse Y position relative to the first line
                // Project mouse onto the first line to find the reference point, then use mouse Y directly
                const dx = end1ScreenX - start1ScreenX;
                const dy = end1ScreenY - start1ScreenY;
                
                let start2ScreenX: number;
                let start2ScreenY: number;
                let end2ScreenX: number;
                let end2ScreenY: number;
                
                if (Math.abs(dx) < 0.001) {
                    // Vertical line case: use simple Y difference
                    const verticalOffset = y - start1ScreenY;
                    start2ScreenX = start1ScreenX;
                    start2ScreenY = start1ScreenY + verticalOffset;
                    end2ScreenX = end1ScreenX;
                    end2ScreenY = end1ScreenY + verticalOffset;
                } else {
                    // Project mouse X onto the line to find which point on the line corresponds to mouse X
                    const toMouseX = x - start1ScreenX;
                    const t = toMouseX / dx; // How far along the line (0 = start, 1 = end)
                    const lineYAtMouseX = start1ScreenY + t * dy; // Y coordinate on the line at mouse X
                    
                    // Vertical offset is the difference between mouse Y and the line Y at that X
                    const verticalOffset = y - lineYAtMouseX;
                    
                    // Second line: same X coordinates (vertical borders), Y offset vertically
                    start2ScreenX = start1ScreenX; // Same X (vertical border)
                    start2ScreenY = start1ScreenY + verticalOffset; // Vertical stretch
                    end2ScreenX = end1ScreenX; // Same X (vertical border)
                    end2ScreenY = end1ScreenY + verticalOffset; // Vertical stretch
                }
                
                // Convert back to chart coordinates (smooth so preview doesn't jump)
                const start2Time = getTimeFromX(chart, start2ScreenX);
                const start2Price = series.coordinateToPrice(start2ScreenY);
                const end2Time = getTimeFromX(chart, end2ScreenX);
                const end2Price = series.coordinateToPrice(end2ScreenY);
                
                if (start2Time == null || start2Price == null || end2Time == null || end2Price == null) return;
                
                // Store all 4 points: [start1, end1, start2, end2]
                // Clear screenPoints on final commit (use chart coords only)
                currentDrawingRef = {
                    ...currentDrawingRef,
                    points: [
                        start1,
                        end1,
                        { time: start2Time, price: start2Price },
                        { time: end2Time, price: end2Price },
                    ],
                    screenPoints: undefined,
                };
                
                addDrawingRefFn.current(currentDrawingRef);
                setCurrentDrawingRefFn.current(null);
                setIsDrawingRefFn.current(false);
                setActiveToolRefFn.current(null); // Auto-switch to crosshair after drawing
                isDrawing = false;
                isPlacingLine = false;
                isPlacingParallel = false;
                cachedFirstLineScreen = null;
                currentDrawingRef = null;
                return;
            }
        };

        // ── handlePointerMove: Live Preview ──────────────────────────────
        // While a drawing is in progress, converts the cursor position to chart
        // coordinates and updates the relevant *LiveEnd*Ref + bumps the tick counter
        // so the overlay re-renders with a live preview. Each tool branch is
        // independent to keep the logic simple even though there's overlap.
        const handlePointerMove = (e: PointerEvent) => {
            if (zoomStartRef.current != null) {
                const { x, y } = getLocalXY(e);
                zoomEndRef.current = { x, y };
                setZoomLiveTick((t) => t + 1);
                return;
            }
            const tool = activeToolRef.current;
            if (currentDrawingRef?.type === 'brush') {
                e.preventDefault();
                e.stopPropagation();
                const chart = chartRef.current;
                const series = seriesRef.current;
                if (!chart || !series) return;
                const { x, y } = getLocalXY(e);
                const time = getTimeFromX(chart, x);
                const price = series.coordinateToPrice(y);
                if (time == null || price == null) return;
                const prevPoints = currentDrawingRef.points || [];
                const last = prevPoints[prevPoints.length - 1];
                if (last) {
                    const lastSx = chart.timeScale().timeToCoordinate(last.time as any);
                    const lastSy = series.priceToCoordinate(last.price);
                    if (lastSx != null && lastSy != null) {
                        const dx = x - Number(lastSx);
                        const dy = y - lastSy;
                        if (dx * dx + dy * dy < 1) return;
                    }
                }
                const updated = {
                    ...currentDrawingRef,
                    points: [...prevPoints, { time, price }],
                };
                currentDrawingRef = updated;
                setCurrentDrawingRefFn.current(updated);
                return;
            }
            const rectangleId = rectangleInProgressRef.current;
            if (rectangleId && tool === 'rectangle') {
                e.preventDefault();
                e.stopPropagation();
                const chart = chartRef.current;
                const series = seriesRef.current;
                if (chart && series) {
                    const { x, y } = getLocalXY(e);
                    const endTime = getTimeFromX(chart, x);
                    const endPrice = series.coordinateToPrice(y);
                    if (endTime != null && endPrice != null) {
                        updateDrawingRefFn.current(rectangleId, (prev) => ({ ...prev, endTime, endPrice }));
                        setRectangleLiveTick((t) => t + 1);
                    }
                }
                return;
            }
            const gannBoxId = gannBoxInProgressRef.current;
            if (gannBoxId && tool === 'gann-box') {
                e.preventDefault();
                e.stopPropagation();
                const chart = chartRef.current;
                const series = seriesRef.current;
                if (chart && series) {
                    const { x, y } = getLocalXY(e);
                    const endTime = getTimeFromX(chart, x);
                    const endPrice = series.coordinateToPrice(y);
                    if (endTime != null && endPrice != null) {
                        updateDrawingRefFn.current(gannBoxId, (prev) => ({ ...prev, endTime, endPrice }));
                        gannBoxLiveEndTimeRef.current = endTime;
                        gannBoxLiveEndPriceRef.current = endPrice;
                        setGannBoxLiveTick((t) => t + 1);
                    }
                }
                return;
            }
            const circleId = circleInProgressRef.current;
            if (circleId && tool === 'circle') {
                e.preventDefault();
                e.stopPropagation();
                const chart = chartRef.current;
                const series = seriesRef.current;
                if (chart && series) {
                    const { x, y } = getLocalXY(e);
                    const endTime = getTimeFromX(chart, x);
                    const endPrice = series.coordinateToPrice(y);
                    if (endTime != null && endPrice != null) {
                        updateDrawingRefFn.current(circleId, (prev) => ({ ...prev, endTime, endPrice }));
                        circleLiveEndTimeRef.current = endTime;
                        circleLiveEndPriceRef.current = endPrice;
                        setCircleLiveTick((t) => t + 1);
                    }
                }
                return;
            }
            const pathId = pathInProgressRef.current;
            if (pathId && tool === 'path') {
                e.preventDefault();
                e.stopPropagation();
                const chart = chartRef.current;
                const series = seriesRef.current;
                if (chart && series) {
                    const { x, y } = getLocalXY(e);
                    const endTime = getTimeFromX(chart, x);
                    const endPrice = series.coordinateToPrice(y);
                    if (endTime != null && endPrice != null) {
                        pathLiveEndTimeRef.current = endTime;
                        pathLiveEndPriceRef.current = endPrice;
                        setPathLiveTick((t) => t + 1);
                    }
                }
                return;
            }
            const curveId = curveInProgressRef.current;
            if (curveId && tool === 'curve') {
                const chart = chartRef.current;
                const series = seriesRef.current;
                if (chart && series) {
                    const { x, y } = getLocalXY(e);
                    const previewPt = screenToChart(x, y);
                    if (previewPt) {
                        const curveDrawing = drawingsRef.current.find((d) => d.id === curveId);
                        if (curveDrawing?.type === 'curve' && curveDrawing.points?.length === 1) {
                            setCurrentDrawingRefFn.current({
                                ...curveDrawing,
                                points: [curveDrawing.points[0], previewPt],
                            });
                            setCurveLiveTick((t) => t + 1);
                        }
                    }
                }
                return;
            }
            const fibRetracementId = fibRetracementInProgressRef.current;
            if (fibRetracementId && tool === 'fibonacci-retracement') {
                const chart = chartRef.current;
                const series = seriesRef.current;
                if (!chart || !series) return;
                const { x, y } = getLocalXY(e);
                const endTime = getTimeFromX(chart, x);
                const endPrice = series.coordinateToPrice(y);
                if (endTime != null && endPrice != null) {
                    fibRetracementLiveEndTimeRef.current = endTime;
                    fibRetracementLiveEndPriceRef.current = endPrice;
                    setFibRetracementLiveTick((t) => t + 1);
                    updateDrawingRefFn.current(fibRetracementId, (prev) => ({ ...prev, endTime, endPrice }));
                }
                return;
            }
            const priceRangeId = priceRangeInProgressRef.current;
            if (priceRangeId && tool === 'price-range') {
                const chart = chartRef.current;
                const series = seriesRef.current;
                if (!chart || !series) return;
                const { x, y } = getLocalXY(e);
                const endTime = getTimeFromX(chart, x);
                const endPrice = series.coordinateToPrice(y);
                if (endTime != null && endPrice != null) {
                    priceRangeLiveEndTimeRef.current = endTime;
                    priceRangeLiveEndPriceRef.current = endPrice;
                    setPriceRangeLiveTick((t) => t + 1);
                    updateDrawingRefFn.current(priceRangeId, (prev) => ({ ...prev, endTime, endPrice }));
                }
                return;
            }
            const dateRangeId = dateRangeInProgressRef.current;
            if (dateRangeId && tool === 'date-range') {
                const chart = chartRef.current;
                const series = seriesRef.current;
                if (!chart || !series) return;
                const { x, y } = getLocalXY(e);
                const endTime = getTimeFromX(chart, x);
                const endPrice = series.coordinateToPrice(y);
                if (endTime != null && endPrice != null) {
                    dateRangeLiveEndTimeRef.current = endTime;
                    dateRangeLiveEndPriceRef.current = endPrice;
                    setDateRangeLiveTick((t) => t + 1);
                    updateDrawingRefFn.current(dateRangeId, (prev) => ({ ...prev, endTime, endPrice }));
                }
                return;
            }
            const datePriceRangeId = datePriceRangeInProgressRef.current;
            if (datePriceRangeId && tool === 'date-price-range') {
                const chart = chartRef.current;
                const series = seriesRef.current;
                if (!chart || !series) return;
                const { x, y } = getLocalXY(e);
                const endTime = getTimeFromX(chart, x);
                const endPrice = series.coordinateToPrice(y);
                if (endTime != null && endPrice != null) {
                    datePriceRangeLiveEndTimeRef.current = endTime;
                    datePriceRangeLiveEndPriceRef.current = endPrice;
                    setDatePriceRangeLiveTick((t) => t + 1);
                    updateDrawingRefFn.current(datePriceRangeId, (prev) => ({ ...prev, endTime, endPrice }));
                }
                return;
            }
            if (!isDrawing || (tool !== 'lines' && tool !== 'ray' && tool !== 'info-line' && tool !== 'parallel-channel' && tool !== 'arrow-marker' && tool !== 'arrow')) return;
            const { x, y } = getLocalXY(e);

            const pt = screenToChart(x, y);
            if (!pt) return;
            if (!currentDrawingRef?.points) return;

            // Live preview: keep start fixed, update end to cursor
            if (isPlacingLine) {
                currentDrawingRef = {
                    ...currentDrawingRef,
                    points: currentDrawingRef.points.length >= 1 ? [currentDrawingRef.points[0], pt] : [pt],
                };
                setCurrentDrawingRefFn.current(currentDrawingRef);
                return;
            }

            // Parallel channel: after second click, show parallel line preview
            if (isPlacingParallel && tool === 'parallel-channel' && currentDrawingRef.points.length >= 2) {
                if (!cachedFirstLineScreen) return;
                const chart = chartRef.current;
                const series = seriesRef.current;
                if (!chart || !series) return;

                // Use cached screen coordinates (no recalculation = smooth)
                const { startX: start1ScreenX, startY: start1ScreenY, endX: end1ScreenX, endY: end1ScreenY } = cachedFirstLineScreen;
                
                // Vertical stretch only: keep same X coordinates, only adjust Y based on mouse
                // The parallel line should have vertical borders (vertical lines connecting bubbles)
                // So start2 and end2 have the same X as start1 and end1, but different Y
                
                // Calculate the vertical offset based on mouse Y position relative to the first line
                // Project mouse onto the first line to find the reference point, then use mouse Y directly
                const dx = end1ScreenX - start1ScreenX;
                const dy = end1ScreenY - start1ScreenY;
                const length = Math.sqrt(dx * dx + dy * dy);
                
                if (length === 0) return;
                
                // Project mouse X onto the line to find which point on the line corresponds to mouse X
                const toMouseX = x - start1ScreenX;
                const t = toMouseX / dx; // How far along the line (0 = start, 1 = end)
                const lineYAtMouseX = start1ScreenY + t * dy; // Y coordinate on the line at mouse X
                
                // Vertical offset is the difference between mouse Y and the line Y at that X
                const verticalOffset = y - lineYAtMouseX;
                
                // Second line: same X coordinates, Y offset by the vertical distance
                const start2ScreenX = start1ScreenX; // Same X (vertical border)
                const start2ScreenY = start1ScreenY + verticalOffset; // Vertical stretch
                const end2ScreenX = end1ScreenX; // Same X (vertical border)
                const end2ScreenY = end1ScreenY + verticalOffset; // Vertical stretch
                
                // Convert back to chart coordinates (only for storage, preview uses screenPoints) (smooth to avoid jump)
                const start2Time = getTimeFromX(chart, start2ScreenX);
                const start2Price = series.coordinateToPrice(start2ScreenY);
                const end2Time = getTimeFromX(chart, end2ScreenX);
                const end2Price = series.coordinateToPrice(end2ScreenY);
                
                if (start2Time == null || start2Price == null || end2Time == null || end2Price == null) return;
                
                // Store chart coordinates AND screen points for smooth preview
                const start1 = currentDrawingRef.points[0];
                const end1 = currentDrawingRef.points[1];
                
                currentDrawingRef = {
                    ...currentDrawingRef,
                    points: [
                        start1,
                        end1,
                        { time: start2Time, price: start2Price },
                        { time: end2Time, price: end2Price },
                    ],
                    screenPoints: [
                        { x: start1ScreenX, y: start1ScreenY },
                        { x: end1ScreenX, y: end1ScreenY },
                        { x: start2ScreenX, y: start2ScreenY },
                        { x: end2ScreenX, y: end2ScreenY },
                    ],
                };
                setCurrentDrawingRefFn.current(currentDrawingRef);
                return;
            }

            // (No-op) We no longer use click-drag finalize for lines.
        };

        // ── handlePointerUp: Finalize Drag-Based Tools ────────────────
        // Handles pointer-up for brush (commit stroke) and zoom (apply visible range).
        // Most two-click tools finalize in handlePointerDown on the second click,
        // so this handler only deals with click-drag tools.
        const handlePointerUp = (e: PointerEvent) => {
            // Zoom: apply the selected rectangle as the new visible time + price range
            if (zoomStartRef.current != null && zoomEndRef.current != null) {
                const chart = chartRef.current;
                const series = seriesRef.current;
                const start = zoomStartRef.current;
                const end = zoomEndRef.current;
                zoomStartRef.current = null;
                zoomEndRef.current = null;
                setZoomLiveTick(0);
                try {
                    container.releasePointerCapture(e.pointerId);
                } catch (_) {}
                if (chart && series) {
                    const minX = Math.min(start.x, end.x);
                    const maxX = Math.max(start.x, end.x);
                    const minY = Math.min(start.y, end.y);
                    const maxY = Math.max(start.y, end.y);
                    const dx = maxX - minX;
                    const dy = maxY - minY;
                    if (dx < 4 || dy < 4) return;
                    const timeFrom = getTimeFromX(chart, minX);
                    const timeTo = getTimeFromX(chart, maxX);
                    const priceHigh = series.coordinateToPrice(minY);
                    const priceLow = series.coordinateToPrice(maxY);
                    if (timeFrom != null && timeTo != null && timeFrom !== timeTo) {
                        try {
                            (chart.timeScale() as any).setVisibleRange?.({ from: timeFrom, to: timeTo });
                        } catch (_) {}
                    }
                    if (priceHigh != null && priceLow != null && priceHigh !== priceLow) {
                        try {
                            const ps = chart.priceScale('right') as any;
                            if (ps && typeof ps.setVisibleRange === 'function') {
                                ps.setVisibleRange({ from: Math.min(priceHigh, priceLow), to: Math.max(priceHigh, priceLow) });
                            }
                        } catch (_) {}
                    }
                }
                return;
            }
            if (currentDrawingRef?.type === 'brush') {
                e.preventDefault();
                e.stopPropagation();
                const pts = currentDrawingRef.screenPoints || currentDrawingRef.points || [];
                if (pts.length >= 2) {
                    addDrawingRefFn.current(currentDrawingRef);
                }
                setCurrentDrawingRefFn.current(null);
                setIsDrawingRefFn.current(false);
                setActiveToolRefFn.current(null); // Switch back to crosshair when done
                currentDrawingRef = null;
                isDrawing = false;
                try {
                    container.releasePointerCapture(e.pointerId);
                } catch (_) {}
            }
        };

        // Capture listeners on the container so we receive events without blocking chart interactions.
        // Price-range finalizes on second click only (no pointerup).
        container.addEventListener('pointerdown', handlePointerDown, true);
        container.addEventListener('pointermove', handlePointerMove, true);
        container.addEventListener('pointerup', handlePointerUp, true);
        container.addEventListener('pointercancel', handlePointerUp, true);

        return () => {
            container.removeEventListener('pointerdown', handlePointerDown, true);
            container.removeEventListener('pointermove', handlePointerMove, true);
            container.removeEventListener('pointerup', handlePointerUp, true);
            container.removeEventListener('pointercancel', handlePointerUp, true);
            // Cancel any in-progress placement if tool changes / unmounts
            isDrawing = false;
            isPlacingLine = false;
            currentDrawingRef = null;
            priceRangeInProgressRef.current = null;
            zoomStartRef.current = null;
            zoomEndRef.current = null;
        };
    }, [activeTool]);

    // ============================================================================
    // HORIZONTAL LINE TOOL: Interaction Logic (Hover + Select + Drag)
    // ============================================================================
    // This section handles ALL interaction for horizontal lines:
    // - Hover detection: shows the right-side square handle
    // - Selection: clicking a line selects it and shows the handle persistently
    // - Drag: dragging the handle moves the line vertically
    // NOTE: This is isolated from other tools - editing here won't affect lines tool
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const getLocalXY = (e: PointerEvent) => {
            const rect = container.getBoundingClientRect();
            return { x: e.clientX - rect.left, y: e.clientY - rect.top };
        };

        const getPlotWidth = () => {
            const chart = chartRef.current;
            const rect = container.getBoundingClientRect();
            if (!chart) return rect.width;
            const rightScale: any = (chart as any).priceScale?.('right');
            const rightScaleWidth = rightScale && typeof rightScale.width === 'function' ? Number(rightScale.width()) : 0;
            return Math.max(0, rect.width - rightScaleWidth);
        };

        // ── findHoveredHorizontalLineId ──
        // Returns the id of the horizontal line closest to localY within 5px, or null.
        // Only checks the plot area (ignores the right price-scale gutter).
        const findHoveredHorizontalLineId = (localX: number, localY: number) => {
            const plotWidth = getPlotWidth();
            if (localX > plotWidth) return null;

            const series = seriesRef.current;
            if (!series) return null;

            const thresholdPx = 5;
            let bestId: string | null = null;
            let bestDist = Number.POSITIVE_INFINITY;

            for (const d of drawings) {
                if (d.type !== 'horizontal-line') continue;
                if (d.hidden) continue;
                const price = d.points?.[0]?.price;
                if (price == null) continue;
                const y = series.priceToCoordinate(price);
                if (y == null) continue;
                const dist = Math.abs(y - localY);
                if (dist <= thresholdPx && dist < bestDist) {
                    bestDist = dist;
                    bestId = d.id;
                }
            }

            return bestId;
        };

        const onPointerMove = (e: PointerEvent) => {
            // Don’t do hover detection while a drawing tool is active
            if (activeTool === 'lines' || activeTool === 'horizontal-line') return;

            const { x, y } = getLocalXY(e);
            const hoveredId = findHoveredHorizontalLineId(x, y);
            setHoveredHorizontalLineId(hoveredId);

            // Handle hover (square)
            if (!hoveredId) {
                setHoveredHorizontalLineHandleId(null);
                return;
            }

            const series = seriesRef.current;
            if (!series) {
                setHoveredHorizontalLineHandleId(null);
                return;
            }

            const hoveredDrawing = drawings.find((d) => d.id === hoveredId);
            const price = hoveredDrawing?.points?.[0]?.price;
            if (price == null) {
                setHoveredHorizontalLineHandleId(null);
                return;
            }

            const lineY = series.priceToCoordinate(price);
            if (lineY == null) {
                setHoveredHorizontalLineHandleId(null);
                return;
            }

            const plotWidth = getPlotWidth();
            const squareSize = 11;
            const rightPad = 28; // move further left (match overlay)
            const squareX = plotWidth - squareSize - rightPad;
            const squareY = lineY - squareSize / 2;

            const overHandle =
                x >= squareX &&
                x <= squareX + squareSize &&
                y >= squareY &&
                y <= squareY + squareSize;

            setHoveredHorizontalLineHandleId(overHandle ? hoveredId : null);
        };

        const onPointerLeave = () => {
            setHoveredHorizontalLineId(null);
            setHoveredHorizontalLineHandleId(null);
        };

        const onPointerDown = (e: PointerEvent) => {
            // If user is in a drawing tool, ignore selection logic
            if (activeTool === 'lines' || activeTool === 'ray' || activeTool === 'info-line' || activeTool === 'horizontal-line' || activeTool === 'horizontal-ray' || activeTool === 'parallel-channel' || activeTool === 'long-position' || activeTool === 'short-position' || activeTool === 'price-range') return;

            const { x, y } = getLocalXY(e);
            const hoveredId = findHoveredHorizontalLineId(x, y);
            if (hoveredId) {
                setSelectedHorizontalLineId(hoveredId);
                setSelectedDrawingId(hoveredId);
                setSelectedLineId(null); // Clear lines tool selection
                setSelectedHorizontalRayId(null); // Clear horizontal ray selection
            } else {
                // Click outside: clear HORIZONTAL LINE selection only (don't affect other tools)
                setSelectedHorizontalLineId(null);
                // Only clear selectedDrawingId if it's currently a horizontal line
                const currentSelected = drawings.find(d => d.id === selectedDrawingId);
                if (currentSelected?.type === 'horizontal-line') {
                    setSelectedDrawingId(null);
                }
            }
        };

        const onDocumentPointerDown = (e: PointerEvent) => {
            // Click outside the chart clears selection (shared handler, but type-aware)
            const target = e.target as HTMLElement | null;
            if (!target) return;

            // If the click is inside the left toolbar, don't clear selection.
            if (target.closest('[data-left-toolbar="true"]')) return;

            if (!container.contains(target)) {
                // Clear all tool-specific selections when clicking outside chart
                setSelectedHorizontalLineId(null);
                setSelectedHorizontalRayId(null);
                setSelectedLineId(null);
                setSelectedDrawingId(null);
            }
        };

        container.addEventListener('pointermove', onPointerMove);
        container.addEventListener('pointerleave', onPointerLeave);
        container.addEventListener('pointerdown', onPointerDown);
        document.addEventListener('pointerdown', onDocumentPointerDown);

        return () => {
            container.removeEventListener('pointermove', onPointerMove);
            container.removeEventListener('pointerleave', onPointerLeave);
            container.removeEventListener('pointerdown', onPointerDown);
            document.removeEventListener('pointerdown', onDocumentPointerDown);
        };
    }, [
        drawings,
        activeTool,
        selectedDrawingId, // Need to check current selection type
        setHoveredHorizontalLineId,
        setHoveredHorizontalLineHandleId,
        setSelectedHorizontalLineId,
        setSelectedDrawingId,
        setSelectedLineId,
    ]);

    // ============================================================================
    // HORIZONTAL LINE TOOL: Drag Logic
    // ============================================================================
    // Handles dragging horizontal lines by their handle square.
    // NOTE: This is isolated from other tools - editing here won't affect lines tool
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const getLocalY = (e: PointerEvent) => {
            const rect = container.getBoundingClientRect();
            return e.clientY - rect.top;
        };

        const startDrag = (e: PointerEvent) => {
            // don't interfere with drawing tools
            if (activeTool === 'lines' || activeTool === 'horizontal-line') return;
            // Allow drag from anywhere on the line or from the handle
            const id = hoveredHorizontalLineHandleId || hoveredHorizontalLineId;
            if (!id) return;
            const targetDrawing = drawings.find((d) => d.id === id);
            if (targetDrawing?.locked) return;
            draggingHorizontalLineIdRef.current = id;
            setSelectedHorizontalLineId(id);
            setSelectedDrawingId(id);

            try {
                container.setPointerCapture(e.pointerId);
            } catch {
                // ignore
            }
            e.preventDefault();
        };

        const onMove = (e: PointerEvent) => {
            const id = draggingHorizontalLineIdRef.current;
            if (!id) return;

            const series = seriesRef.current;
            if (!series) return;

            const y = getLocalY(e);
            const price = series.coordinateToPrice(y);
            if (price == null) return;

            updateDrawing(id, (prev) => {
                if (prev.type !== 'horizontal-line') return prev;
                return { ...prev, points: [{ time: 0, price }] };
            });
        };

        const stop = () => {
            if (!draggingHorizontalLineIdRef.current) return;
            draggingHorizontalLineIdRef.current = null;
        };

        // Use capture so we still get the event even if the chart canvas is the target
        container.addEventListener('pointerdown', startDrag, true);
        document.addEventListener('pointermove', onMove, true);
        document.addEventListener('pointerup', stop, true);
        document.addEventListener('pointercancel', stop, true);

        return () => {
            container.removeEventListener('pointerdown', startDrag, true);
            document.removeEventListener('pointermove', onMove, true);
            document.removeEventListener('pointerup', stop, true);
            document.removeEventListener('pointercancel', stop, true);
        };
    }, [activeTool, hoveredHorizontalLineHandleId, hoveredHorizontalLineId, drawings, setSelectedHorizontalLineId, setSelectedDrawingId, updateDrawing]);

    // ============================================================================
    // HORIZONTAL RAY TOOL: Interaction Logic (Hover + Select + Drag)
    // ============================================================================
    // This section handles ALL interaction for horizontal ray:
    // - Hover detection: shows the bubble handle at the start point
    // - Selection: clicking a ray selects it and shows the bubble persistently
    // - Drag: dragging the bubble moves the ray vertically (changes price)
    // NOTE: This is isolated from other tools - editing here won't affect other tools
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const getLocalXY = (e: PointerEvent) => {
            const rect = container.getBoundingClientRect();
            return { x: e.clientX - rect.left, y: e.clientY - rect.top };
        };

        const getPlotWidth = () => {
            const chart = chartRef.current;
            const rect = container.getBoundingClientRect();
            if (!chart) return rect.width;
            const rightScale: any = (chart as any).priceScale?.('right');
            const rightScaleWidth = rightScale && typeof rightScale.width === 'function' ? Number(rightScale.width()) : 0;
            return Math.max(0, rect.width - rightScaleWidth);
        };

        // ── findHoveredHorizontalRayId ──
        // Returns the id of the horizontal ray closest to localY within 5px, or null.
        // Only considers the portion from the ray's start-time rightward.
        const findHoveredHorizontalRayId = (localX: number, localY: number) => {
            const plotWidth = getPlotWidth();
            if (localX > plotWidth) return null;

            const series = seriesRef.current;
            const chart = chartRef.current;
            if (!series || !chart) return null;

            const thresholdPx = 5;
            let bestId: string | null = null;
            let bestDist = Number.POSITIVE_INFINITY;

            for (const d of drawings) {
                if (d.type !== 'horizontal-ray') continue;
                if (d.hidden) continue;
                const point = d.points?.[0];
                if (!point) continue;
                
                const price = point.price;
                const y = series.priceToCoordinate(price);
                if (y == null) continue;
                
                // Check if mouse is on the horizontal line (from start point to right edge)
                const startX = chart.timeScale().timeToCoordinate(point.time as any);
                if (startX == null) continue;
                
                // Only consider if mouse is to the right of start point
                if (localX < startX) continue;
                
                const dist = Math.abs(y - localY);
                if (dist <= thresholdPx && dist < bestDist) {
                    bestDist = dist;
                    bestId = d.id;
                }
            }

            return bestId;
        };

        const onPointerMove = (e: PointerEvent) => {
            // Don't do hover detection while a drawing tool is active
            if (activeTool === 'lines' || activeTool === 'ray' || activeTool === 'info-line' || activeTool === 'horizontal-line' || activeTool === 'horizontal-ray' || activeTool === 'parallel-channel' || activeTool === 'long-position' || activeTool === 'short-position' || activeTool === 'price-range') return;

            const { x, y } = getLocalXY(e);
            const hoveredId = findHoveredHorizontalRayId(x, y);
            setHoveredHorizontalRayId(hoveredId);

            // Handle hover (bubble)
            if (!hoveredId) {
                setHoveredHorizontalRayHandleId(null);
                return;
            }

            const series = seriesRef.current;
            const chart = chartRef.current;
            if (!series || !chart) {
                setHoveredHorizontalRayHandleId(null);
                return;
            }

            const hoveredDrawing = drawings.find((d) => d.id === hoveredId);
            const point = hoveredDrawing?.points?.[0];
            if (!point) {
                setHoveredHorizontalRayHandleId(null);
                return;
            }

            const lineY = series.priceToCoordinate(point.price);
            const startX = chart.timeScale().timeToCoordinate(point.time as any);
            if (lineY == null || startX == null) {
                setHoveredHorizontalRayHandleId(null);
                return;
            }

            // Bubble at start point
            const bubbleRadius = 5;
            const distToBubble = Math.sqrt((x - startX) ** 2 + (y - lineY) ** 2);
            const overHandle = distToBubble <= bubbleRadius + 3; // Slightly larger hit area

            setHoveredHorizontalRayHandleId(overHandle ? hoveredId : null);
        };

        const onPointerLeave = () => {
            setHoveredHorizontalRayId(null);
            setHoveredHorizontalRayHandleId(null);
        };

        const onPointerDown = (e: PointerEvent) => {
            // If user is in a drawing tool, ignore selection logic
            if (activeTool === 'lines' || activeTool === 'ray' || activeTool === 'info-line' || activeTool === 'horizontal-line' || activeTool === 'horizontal-ray' || activeTool === 'parallel-channel' || activeTool === 'long-position' || activeTool === 'short-position' || activeTool === 'price-range') return;

            const { x, y } = getLocalXY(e);
            const hoveredId = findHoveredHorizontalRayId(x, y);
            if (hoveredId) {
                setSelectedHorizontalRayId(hoveredId);
                setSelectedDrawingId(hoveredId);
                setSelectedLineId(null); // Clear lines tool selection
                setSelectedHorizontalLineId(null); // Clear horizontal line selection
            } else {
                // Click outside: clear HORIZONTAL RAY selection only (don't affect other tools)
                setSelectedHorizontalRayId(null);
                // Only clear selectedDrawingId if it's currently a horizontal ray
                const currentSelected = drawings.find(d => d.id === selectedDrawingId);
                if (currentSelected?.type === 'horizontal-ray') {
                    setSelectedDrawingId(null);
                }
            }
        };

        container.addEventListener('pointermove', onPointerMove);
        container.addEventListener('pointerleave', onPointerLeave);
        container.addEventListener('pointerdown', onPointerDown);

        return () => {
            container.removeEventListener('pointermove', onPointerMove);
            container.removeEventListener('pointerleave', onPointerLeave);
            container.removeEventListener('pointerdown', onPointerDown);
        };
    }, [
        drawings,
        activeTool,
        selectedDrawingId,
        setHoveredHorizontalRayId,
        setHoveredHorizontalRayHandleId,
        setSelectedHorizontalRayId,
        setSelectedDrawingId,
        setSelectedLineId,
        setSelectedHorizontalLineId,
    ]);

    // ============================================================================
    // HORIZONTAL RAY TOOL: Drag Logic
    // ============================================================================
    // Handles dragging horizontal ray by its bubble handle (moves vertically).
    // NOTE: This is isolated from other tools - editing here won't affect other tools
    const draggingHorizontalRayIdRef = useRef<string | null>(null);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const getLocalY = (e: PointerEvent) => {
            const rect = container.getBoundingClientRect();
            return e.clientY - rect.top;
        };

        const startDrag = (e: PointerEvent) => {
            // don't interfere with drawing tools
            if (activeTool === 'lines' || activeTool === 'ray' || activeTool === 'info-line' || activeTool === 'horizontal-line' || activeTool === 'horizontal-ray' || activeTool === 'parallel-channel' || activeTool === 'long-position' || activeTool === 'short-position' || activeTool === 'price-range') return;
            if (!hoveredHorizontalRayHandleId) return;

            const id = hoveredHorizontalRayHandleId;
            const targetDrawing = drawings.find((d) => d.id === id);
            if (targetDrawing?.locked) return;
            draggingHorizontalRayIdRef.current = id;
            setSelectedHorizontalRayId(id);
            setSelectedDrawingId(id);

            try {
                container.setPointerCapture(e.pointerId);
            } catch {
                // ignore
            }
            e.preventDefault();
        };

        const onMove = (e: PointerEvent) => {
            const id = draggingHorizontalRayIdRef.current;
            if (!id) return;

            const series = seriesRef.current;
            if (!series) return;

            const y = getLocalY(e);
            const price = series.coordinateToPrice(y);
            if (price == null) return;

            updateDrawing(id, (prev) => {
                if (prev.type !== 'horizontal-ray' || !prev.points?.[0]) return prev;
                // Keep the same time, only update price
                return { ...prev, points: [{ time: prev.points[0].time, price }] };
            });
        };

        const stop = () => {
            if (!draggingHorizontalRayIdRef.current) return;
            draggingHorizontalRayIdRef.current = null;
        };

        container.addEventListener('pointerdown', startDrag, true);
        document.addEventListener('pointermove', onMove, true);
        document.addEventListener('pointerup', stop, true);
        document.addEventListener('pointercancel', stop, true);

        return () => {
            container.removeEventListener('pointerdown', startDrag, true);
            document.removeEventListener('pointermove', onMove, true);
            document.removeEventListener('pointerup', stop, true);
            document.removeEventListener('pointercancel', stop, true);
        };
    }, [activeTool, hoveredHorizontalRayHandleId, drawings, setSelectedHorizontalRayId, setSelectedDrawingId, updateDrawing]);

    // ============================================================================
    // LINES TOOL: Interaction Logic (Hover + Select + Drag)
    // ============================================================================
    // This section handles ALL interaction for lines tool:
    // - Hover detection: shows bubbles at both ends when hovering over the line
    // - Handle hover: highlights specific bubble when hovering directly over it
    // - Selection: clicking a line/bubble selects it and shows bubbles persistently
    // - Drag: dragging a bubble moves that end of the line
    // NOTE: This is isolated from other tools - editing here won't affect horizontal lines
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const getLocalXY = (e: PointerEvent) => {
            const rect = container.getBoundingClientRect();
            return { x: e.clientX - rect.left, y: e.clientY - rect.top };
        };

        const chartToScreen = (point: ChartPoint): { x: number; y: number } | null => {
            const chart = chartRef.current;
            const series = seriesRef.current;
            if (!chart || !series) return null;

            const x = chart.timeScale().timeToCoordinate(point.time as any);
            const y = series.priceToCoordinate(point.price);
            if (x == null || y == null) return null;

            return { x, y };
        };

        // ── findHoveredLineId ──
        // Hit-tests against all line-type drawings (lines, ray, info-line,
        // parallel-channel, arrow-marker, arrow) plus long/short position
        // boxes and annotation markers. Returns the closest match within
        // 8px, prioritizing RR boxes > annotations > curves > segments.
        const findHoveredLineId = (localX: number, localY: number): string | null => {
            const series = seriesRef.current;
            const chart = chartRef.current;
            if (!series || !chart) return null;

            // Check long-position RR boxes first (click anywhere in the box)
            for (const d of drawings) {
                if (d.type === 'long-position' && d.entryPrice != null && d.stopLoss != null && d.takeProfit != null && d.startTime != null && d.endTime != null) {
                    if (d.hidden) continue;
                    
                    const startX = chart.timeScale().timeToCoordinate(d.startTime as any);
                    const endX = chart.timeScale().timeToCoordinate(d.endTime as any);
                    const entryY = series.priceToCoordinate(d.entryPrice);
                    const stopLossY = series.priceToCoordinate(d.stopLoss);
                    const takeProfitY = series.priceToCoordinate(d.takeProfit);
                    
                    if (startX == null || endX == null || entryY == null || stopLossY == null || takeProfitY == null) continue;
                    
                    const boxX = Math.min(startX, endX);
                    const boxWidth = Math.abs(endX - startX);
                    const boxTop = Math.min(takeProfitY, stopLossY, entryY);
                    const boxBottom = Math.max(takeProfitY, stopLossY, entryY);
                    
                    // Check if point is inside the box
                    if (localX >= boxX && localX <= boxX + boxWidth && localY >= boxTop && localY <= boxBottom) {
                        return d.id;
                    }
                }
            }

            for (const d of drawings) {
                if (d.type !== 'arrow-markup' && d.type !== 'arrow-markdown') continue;
                if (d.hidden) continue;
                if (!d.points || d.points.length < 1) continue;
                const scr = chartToScreen(d.points[0]);
                if (!scr) continue;
                const dx = localX - scr.x;
                const dy = localY - scr.y;
                if (d.type === 'arrow-markup' && Math.abs(dx) <= 12 && dy >= -30 && dy <= 4) {
                    return d.id;
                }
                if (d.type === 'arrow-markdown' && Math.abs(dx) <= 12 && dy >= -4 && dy <= 30) {
                    return d.id;
                }
            }

            for (const d of drawings) {
                if (d.type !== 'curve' || d.hidden || !d.points || d.points.length !== 3) continue;
                const [pt0, pt1, pt2] = d.points;
                let p0 = chartToScreen(pt0);
                let p1 = chartToScreen(pt1);
                let p2 = chartToScreen(pt2);
                if (p0 && p2) {
                    if (!p1) {
                        const timeSpan = (pt2.time as number) - (pt0.time as number);
                        const priceSpan = pt2.price - pt0.price;
                        p1 = {
                            x: timeSpan !== 0 ? (p0.x + (p2.x - p0.x) * ((pt1.time as number) - (pt0.time as number)) / timeSpan) : (p0.x + p2.x) / 2,
                            y: priceSpan !== 0 ? (p0.y + (p2.y - p0.y) * (pt1.price - pt0.price) / priceSpan) : (p0.y + p2.y) / 2,
                        };
                    }
                } else {
                    if (!p0 && !p1 && !p2) continue;
                    const ok = [p0, p1, p2].filter((p): p is { x: number; y: number } => p != null);
                    if (ok.length < 2) continue;
                    const mid = { x: ok.reduce((a, p) => a + p.x, 0) / ok.length, y: ok.reduce((a, p) => a + p.y, 0) / ok.length };
                    p0 = p0 ?? mid;
                    p1 = p1 ?? (p0 && p2 ? { x: (p0.x + p2.x) / 2, y: (p0.y + p2.y) / 2 } : mid);
                    p2 = p2 ?? mid;
                }
                const samples = 36;
                let bestD = Infinity;
                for (let i = 0; i <= samples; i++) {
                    const t = i / samples;
                    const x = (1-t)*(1-t)*p0.x + 2*(1-t)*t*p1.x + t*t*p2.x;
                    const y = (1-t)*(1-t)*p0.y + 2*(1-t)*t*p1.y + t*t*p2.y;
                    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
                    const dist = Math.hypot(localX - x, localY - y);
                    if (dist < bestD) bestD = dist;
                }
                if (bestD <= 14) return d.id;
            }

            const thresholdPx = 8; // Distance threshold for line hover
            let bestId: string | null = null;
            let bestDist = Number.POSITIVE_INFINITY;

            for (const d of drawings) {
                if (d.type !== 'lines' && d.type !== 'ray' && d.type !== 'info-line' && d.type !== 'parallel-channel' && d.type !== 'arrow-marker' && d.type !== 'arrow') continue;
                if (d.hidden) continue;
                if (!d.points || d.points.length < 2) continue;

                const start = chartToScreen(d.points[0]);
                const end = chartToScreen(d.points[1]);
                if (!start || !end) continue;

                const dx = end.x - start.x;
                const dy = end.y - start.y;
                const lengthSq = dx * dx + dy * dy;
                if (lengthSq === 0) continue;

                let dist: number;

                if (d.type === 'ray') {
                    // For ray: check distance to extended ray (from start through end to edge)
                    // Calculate direction vector
                    const unitX = dx / Math.sqrt(lengthSq);
                    const unitY = dy / Math.sqrt(lengthSq);

                    // Project point onto the infinite ray
                    const t = ((localX - start.x) * unitX + (localY - start.y) * unitY);
                    
                    // Only consider points in the forward direction (from start through end)
                    if (t < 0) continue; // Behind the start point

                    // Calculate closest point on the ray
                    const projX = start.x + t * unitX;
                    const projY = start.y + t * unitY;
                    dist = Math.sqrt((localX - projX) ** 2 + (localY - projY) ** 2);
                } else {
                    // For lines: check distance to line segment (between bubbles only)
                    const t = Math.max(0, Math.min(1, ((localX - start.x) * dx + (localY - start.y) * dy) / lengthSq));
                    const projX = start.x + t * dx;
                    const projY = start.y + t * dy;
                    dist = Math.sqrt((localX - projX) ** 2 + (localY - projY) ** 2);
                }

                if (dist <= thresholdPx && dist < bestDist) {
                    bestDist = dist;
                    bestId = d.id;
                }
            }

            return bestId;
        };

        // ── getLongPositionBoxX ──
        // Computes the pixel x-bounds of an RR box, applying the same fallback
        // logic as the overlay so the hit-test area matches exactly what's drawn.
        const getLongPositionBoxX = (ch: IChartApi, d: Drawing): { boxX: number; boxWidth: number } | null => {
            const ts = ch.timeScale();
            let startX = ts.timeToCoordinate(d.startTime as any);
            let endX = ts.timeToCoordinate(d.endTime as any);
            const visible = ts.getVisibleRange();
            if (visible && typeof visible.from === 'number' && typeof visible.to === 'number') {
                const leftX = ts.timeToCoordinate(visible.from as any);
                const rightX = ts.timeToCoordinate(visible.to as any);
                const visibleTimeSpan = visible.to - visible.from;
                const visiblePixelSpan = (rightX != null && leftX != null) ? rightX - leftX : 0;
                if (visibleTimeSpan > 0 && visiblePixelSpan > 0 && leftX != null) {
                    const timeWidth = (d.endTime ?? 0) - (d.startTime ?? 0);
                    const baseX = startX ?? leftX;
                    if (startX == null) startX = leftX as any;
                    if (endX == null && typeof baseX === 'number') endX = (baseX + (timeWidth / visibleTimeSpan) * visiblePixelSpan) as any;
                } else if (startX == null || endX == null) {
                    if (startX == null) startX = leftX;
                    if (endX == null) endX = rightX;
                }
            }
            if (startX == null || endX == null) return null;
            return { boxX: Math.min(Number(startX), Number(endX)), boxWidth: Math.abs(Number(endX) - Number(startX)) };
        };

        // ── findHoveredLongPositionId ──
        // Point-in-box test for long-position and short-position RR boxes.
        const findHoveredLongPositionId = (localX: number, localY: number): string | null => {
            const series = seriesRef.current;
            const chart = chartRef.current;
            if (!series || !chart) return null;

            for (const d of drawings) {
                if (d.type !== 'long-position' && d.type !== 'short-position') continue;
                if (d.hidden) continue;
                if (d.entryPrice == null || d.stopLoss == null || d.takeProfit == null || d.startTime == null || d.endTime == null) continue;

                const boxBounds = getLongPositionBoxX(chart, d);
                if (!boxBounds) continue;
                const { boxX, boxWidth } = boxBounds;
                const entryY = series.priceToCoordinate(d.entryPrice);
                const stopLossY = series.priceToCoordinate(d.stopLoss);
                const takeProfitY = series.priceToCoordinate(d.takeProfit);
                if (entryY == null || stopLossY == null || takeProfitY == null) continue;

                const boxTop = Math.min(takeProfitY, stopLossY, entryY);
                const boxBottom = Math.max(takeProfitY, stopLossY, entryY);

                // Check if point is inside the box
                if (localX >= boxX && localX <= boxX + boxWidth && localY >= boxTop && localY <= boxBottom) {
                    return d.id;
                }
            }

            return null;
        };

        // ── findHoveredParallelChannelId ──
        // Point-in-polygon test for the quadrilateral formed by 4 channel corners.
        const findHoveredParallelChannelId = (localX: number, localY: number): string | null => {
            const series = seriesRef.current;
            const chart = chartRef.current;
            if (!series || !chart) return null;

            for (const d of drawings) {
                if (d.type !== 'parallel-channel') continue;
                if (d.hidden) continue;
                if (!d.points || d.points.length < 4) continue;

                const [start1, end1, start2, end2] = d.points;
                const p1 = chartToScreen(start1);
                const p2 = chartToScreen(end1);
                const p3 = chartToScreen(end2);
                const p4 = chartToScreen(start2);

                if (!p1 || !p2 || !p3 || !p4) continue;

                const points = [p1, p2, p3, p4];
                let inside = false;
                for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
                    const xi = points[i].x, yi = points[i].y;
                    const xj = points[j].x, yj = points[j].y;
                    const intersect = ((yi > localY) !== (yj > localY)) && (localX < (xj - xi) * (localY - yi) / (yj - yi) + xi);
                    if (intersect) inside = !inside;
                }

                if (inside) {
                    return d.id;
                }
            }

            return null;
        };

        // Generic rect hit-test for any drawing with startTime/startPrice/endTime/endPrice
        const findHoveredRectId = (localX: number, localY: number, ...types: string[]): string | null => {
            const series = seriesRef.current;
            const chart = chartRef.current;
            if (!series || !chart) return null;
            const ts = chart.timeScale();
            for (const d of drawings) {
                if (d.hidden || !types.includes(d.type as string)) continue;
                if (d.startTime == null || d.startPrice == null || d.endTime == null || d.endPrice == null) continue;
                const startX = ts.timeToCoordinate(d.startTime as any);
                const endX = ts.timeToCoordinate(d.endTime as any);
                const startY = series.priceToCoordinate(d.startPrice);
                const endY = series.priceToCoordinate(d.endPrice);
                if (startX == null || endX == null || startY == null || endY == null) continue;
                const minX = Math.min(Number(startX), Number(endX));
                const maxX = Math.max(Number(startX), Number(endX));
                const minY = Math.min(startY, endY);
                const maxY = Math.max(startY, endY);
                if (localX >= minX && localX <= maxX && localY >= minY && localY <= maxY) return d.id;
            }
            return null;
        };

        const pointToSegmentDistHover = pointToSegmentDistance;

        // ── findHoveredBrushId ──
        // Tests proximity to each segment of a brush stroke polyline.
        const findHoveredBrushId = (localX: number, localY: number): string | null => {
            const chart = chartRef.current;
            const series = seriesRef.current;
            if (!chart || !series) return null;
            const threshold = 10;
            for (const d of drawings) {
                if (d.type !== 'brush' || d.hidden) continue;
                let screenPts: { x: number; y: number }[];
                if (d.points && d.points.length >= 2) {
                    screenPts = [];
                    for (const p of d.points) {
                        const sx = chart.timeScale().timeToCoordinate(p.time as any);
                        const sy = series.priceToCoordinate(p.price);
                        if (sx != null && sy != null) screenPts.push({ x: Number(sx), y: sy });
                    }
                } else if (d.screenPoints && d.screenPoints.length >= 2) {
                    screenPts = d.screenPoints;
                } else continue;
                if (screenPts.length < 2) continue;
                for (let i = 0; i < screenPts.length - 1; i++) {
                    const dist = pointToSegmentDistHover(localX, localY, screenPts[i].x, screenPts[i].y, screenPts[i + 1].x, screenPts[i + 1].y);
                    if (dist <= threshold) return d.id;
                }
            }
            return null;
        };

        // findHoveredRectangleId and findHoveredGannBoxId are now covered by findHoveredRectId

        // ── findHoveredPathId ──
        // Segment-by-segment proximity test for polyline / path drawings.
        const findHoveredPathId = (localX: number, localY: number): string | null => {
            const chart = chartRef.current;
            const series = seriesRef.current;
            if (!chart || !series) return null;
            const threshold = 10;
            for (const d of drawings) {
                if (d.type !== 'path' || d.hidden || !d.points?.length) continue;
                const pts = d.points;
                if (pts.length < 2) {
                    const sx = chart.timeScale().timeToCoordinate(pts[0].time as any);
                    const sy = series.priceToCoordinate(pts[0].price);
                    if (sx != null && sy != null && Math.hypot(localX - Number(sx), localY - sy) <= threshold) return d.id;
                    continue;
                }
                for (let i = 0; i < pts.length - 1; i++) {
                    const s1 = chart.timeScale().timeToCoordinate(pts[i].time as any);
                    const s2 = chart.timeScale().timeToCoordinate(pts[i + 1].time as any);
                    const y1 = series.priceToCoordinate(pts[i].price);
                    const y2 = series.priceToCoordinate(pts[i + 1].price);
                    if (s1 == null || s2 == null || y1 == null || y2 == null) continue;
                    const dist = pointToSegmentDistHover(localX, localY, Number(s1), y1, Number(s2), y2);
                    if (dist <= threshold) return d.id;
                }
            }
            return null;
        };

        // ── findHoveredCircleId ──
        // Checks if cursor is inside the circle or within 8px of its edge.
        const findHoveredCircleId = (localX: number, localY: number): string | null => {
            const chart = chartRef.current;
            const series = seriesRef.current;
            if (!chart || !series) return null;
            for (const d of drawings) {
                if (d.type !== 'circle' || d.hidden) continue;
                if (d.startTime == null || d.startPrice == null || d.endTime == null || d.endPrice == null) continue;
                const cx = Number(chart.timeScale().timeToCoordinate(d.startTime as any));
                const cy = series.priceToCoordinate(d.startPrice);
                const rx = Number(chart.timeScale().timeToCoordinate(d.endTime as any));
                const ry = series.priceToCoordinate(d.endPrice);
                if (cx == null || cy == null || rx == null || ry == null) continue;
                const R = Math.hypot(rx - cx, ry - cy);
                const distFromCenter = Math.hypot(localX - cx, localY - cy);
                const distFromEdge = Math.abs(distFromCenter - R);
                if (distFromCenter <= R + 6 || distFromEdge <= 8) return d.id;
            }
            return null;
        };

        // ── findHoveredHandle ──
        // Checks all drawing types for handle proximity (bubbles at endpoints,
        // corner handles, edge-midpoint squares, etc.). Returns a compound id
        // like "drawingId:start" or "drawingId:rect-corner-tl" so the caller
        // knows which specific handle to highlight or initiate dragging on.
        const findHoveredHandle = (localX: number, localY: number): string | null => {
            const series = seriesRef.current;
            const chart = chartRef.current;
            if (!series || !chart) return null;

            const handleRadius = 8; // Hit test radius for bubbles
            const squareSize = 11;
            const squareRadius = squareSize / 2 * 1.5; // Slightly larger hit area
            let bestHandle: string | null = null;
            let bestDist = Number.POSITIVE_INFINITY;

            // Date-range: free handles at start and end points
            for (const d of drawings) {
                if (d.type !== 'date-range' || d.hidden) continue;
                if (d.startTime == null || d.startPrice == null || d.endTime == null || d.endPrice == null) continue;
                const ts = chart.timeScale();
                const startX = ts.timeToCoordinate(d.startTime as any);
                const endX = ts.timeToCoordinate(d.endTime as any);
                const startY = series.priceToCoordinate(d.startPrice);
                const endY = series.priceToCoordinate(d.endPrice);
                if (startX == null || endX == null || startY == null || endY == null) continue;
                const distStart = Math.sqrt((localX - Number(startX)) ** 2 + (localY - startY) ** 2);
                const distEnd = Math.sqrt((localX - Number(endX)) ** 2 + (localY - endY) ** 2);
                if (distStart <= handleRadius && distStart < bestDist) {
                    bestDist = distStart;
                    bestHandle = `${d.id}:date-range-start`;
                }
                if (distEnd <= handleRadius && distEnd < bestDist) {
                    bestDist = distEnd;
                    bestHandle = `${d.id}:date-range-end`;
                }
            }

            // Price-range: free handles at start and end points (no min/max swap)
            for (const d of drawings) {
                if (d.type !== 'price-range' || d.hidden) continue;
                if (d.startTime == null || d.startPrice == null || d.endTime == null || d.endPrice == null) continue;
                const ts = chart.timeScale();
                const startX = ts.timeToCoordinate(d.startTime as any);
                const endX = ts.timeToCoordinate(d.endTime as any);
                const startY = series.priceToCoordinate(d.startPrice);
                const endY = series.priceToCoordinate(d.endPrice);
                if (startX == null || endX == null || startY == null || endY == null) continue;
                const distStart = Math.sqrt((localX - Number(startX)) ** 2 + (localY - startY) ** 2);
                const distEnd = Math.sqrt((localX - Number(endX)) ** 2 + (localY - endY) ** 2);
                if (distStart <= handleRadius && distStart < bestDist) {
                    bestDist = distStart;
                    bestHandle = `${d.id}:price-range-start`;
                }
                if (distEnd <= handleRadius && distEnd < bestDist) {
                    bestDist = distEnd;
                    bestHandle = `${d.id}:price-range-end`;
                }
            }

            // Date-price-range: free handles at start and end points
            for (const d of drawings) {
                if (d.type !== 'date-price-range' || d.hidden) continue;
                if (d.startTime == null || d.startPrice == null || d.endTime == null || d.endPrice == null) continue;
                const ts = chart.timeScale();
                const startX = ts.timeToCoordinate(d.startTime as any);
                const endX = ts.timeToCoordinate(d.endTime as any);
                const startY = series.priceToCoordinate(d.startPrice);
                const endY = series.priceToCoordinate(d.endPrice);
                if (startX == null || endX == null || startY == null || endY == null) continue;
                const distStart = Math.sqrt((localX - Number(startX)) ** 2 + (localY - startY) ** 2);
                const distEnd = Math.sqrt((localX - Number(endX)) ** 2 + (localY - endY) ** 2);
                if (distStart <= handleRadius && distStart < bestDist) {
                    bestDist = distStart;
                    bestHandle = `${d.id}:date-price-range-start`;
                }
                if (distEnd <= handleRadius && distEnd < bestDist) {
                    bestDist = distEnd;
                    bestHandle = `${d.id}:date-price-range-end`;
                }
            }

            // Fibonacci retracement: left corner of 1, right corner of 0
            for (const d of drawings) {
                if (d.type !== 'fibonacci-retracement' || d.hidden) continue;
                if (d.startTime == null || d.startPrice == null || d.endTime == null || d.endPrice == null) continue;
                const ts = chart.timeScale();
                const startX = Number(ts.timeToCoordinate(d.startTime as any));
                const endX = Number(ts.timeToCoordinate(d.endTime as any));
                const startY = series.priceToCoordinate(d.startPrice);
                const endY = series.priceToCoordinate(d.endPrice);
                if (startX == null || endX == null || startY == null || endY == null) continue;
                const leftX = Math.min(startX, endX);
                const rightX = Math.max(startX, endX);
                const distLeft = Math.hypot(localX - leftX, localY - startY);
                const distRight = Math.hypot(localX - rightX, localY - endY);
                if (distLeft <= handleRadius && distLeft < bestDist) {
                    bestDist = distLeft;
                    bestHandle = `${d.id}:fib-retracement-start`;
                }
                if (distRight <= handleRadius && distRight < bestDist) {
                    bestDist = distRight;
                    bestHandle = `${d.id}:fib-retracement-end`;
                }
            }

            // Gann box: 4 corner bubbles only
            for (const d of drawings) {
                if (d.type !== 'gann-box' || d.hidden) continue;
                if (d.startTime == null || d.startPrice == null || d.endTime == null || d.endPrice == null) continue;
                const ts = chart.timeScale();
                const minT = Math.min(d.startTime, d.endTime);
                const maxT = Math.max(d.startTime, d.endTime);
                const minP = Math.min(d.startPrice, d.endPrice);
                const maxP = Math.max(d.startPrice, d.endPrice);
                const minX = Number(ts.timeToCoordinate(minT as any));
                const maxX = Number(ts.timeToCoordinate(maxT as any));
                const minY = series.priceToCoordinate(maxP);
                const maxY = series.priceToCoordinate(minP);
                if (minX == null || maxX == null || minY == null || maxY == null) continue;
                const distTL = Math.hypot(localX - minX, localY - minY);
                const distTR = Math.hypot(localX - maxX, localY - minY);
                const distBL = Math.hypot(localX - minX, localY - maxY);
                const distBR = Math.hypot(localX - maxX, localY - maxY);
                if (distTL <= handleRadius && distTL < bestDist) { bestDist = distTL; bestHandle = `${d.id}:gann-corner-tl`; }
                if (distTR <= handleRadius && distTR < bestDist) { bestDist = distTR; bestHandle = `${d.id}:gann-corner-tr`; }
                if (distBL <= handleRadius && distBL < bestDist) { bestDist = distBL; bestHandle = `${d.id}:gann-corner-bl`; }
                if (distBR <= handleRadius && distBR < bestDist) { bestDist = distBR; bestHandle = `${d.id}:gann-corner-br`; }
            }

            // Rectangle: 4 corner bubbles (circle) + 4 edge-center squares
            for (const d of drawings) {
                if (d.type !== 'rectangle' || d.hidden) continue;
                if (d.startTime == null || d.startPrice == null || d.endTime == null || d.endPrice == null) continue;
                const ts = chart.timeScale();
                const minT = Math.min(d.startTime, d.endTime);
                const maxT = Math.max(d.startTime, d.endTime);
                const minP = Math.min(d.startPrice, d.endPrice);
                const maxP = Math.max(d.startPrice, d.endPrice);
                const minX = Number(ts.timeToCoordinate(minT as any));
                const maxX = Number(ts.timeToCoordinate(maxT as any));
                const minY = series.priceToCoordinate(maxP); // higher price = lower y
                const maxY = series.priceToCoordinate(minP);
                if (minX == null || maxX == null || minY == null || maxY == null) continue;
                const midX = (minX + maxX) / 2;
                const midY = (minY + maxY) / 2;
                const distTL = Math.hypot(localX - minX, localY - minY);
                const distTR = Math.hypot(localX - maxX, localY - minY);
                const distBL = Math.hypot(localX - minX, localY - maxY);
                const distBR = Math.hypot(localX - maxX, localY - maxY);
                const distLeft = Math.hypot(localX - minX, localY - midY);
                const distRight = Math.hypot(localX - maxX, localY - midY);
                const distTop = Math.hypot(localX - midX, localY - minY);
                const distBottom = Math.hypot(localX - midX, localY - maxY);
                if (distTL <= handleRadius && distTL < bestDist) { bestDist = distTL; bestHandle = `${d.id}:rect-corner-tl`; }
                if (distTR <= handleRadius && distTR < bestDist) { bestDist = distTR; bestHandle = `${d.id}:rect-corner-tr`; }
                if (distBL <= handleRadius && distBL < bestDist) { bestDist = distBL; bestHandle = `${d.id}:rect-corner-bl`; }
                if (distBR <= handleRadius && distBR < bestDist) { bestDist = distBR; bestHandle = `${d.id}:rect-corner-br`; }
                if (distLeft <= squareRadius && distLeft < bestDist) { bestDist = distLeft; bestHandle = `${d.id}:rect-edge-left`; }
                if (distRight <= squareRadius && distRight < bestDist) { bestDist = distRight; bestHandle = `${d.id}:rect-edge-right`; }
                if (distTop <= squareRadius && distTop < bestDist) { bestDist = distTop; bestHandle = `${d.id}:rect-edge-top`; }
                if (distBottom <= squareRadius && distBottom < bestDist) { bestDist = distBottom; bestHandle = `${d.id}:rect-edge-bottom`; }
            }

            // Emoji: 4 corner handles only (same box math as rectangle)
            for (const d of drawings) {
                if (d.type !== 'emoji' || d.hidden) continue;
                if (d.startTime == null || d.startPrice == null || d.endTime == null || d.endPrice == null) continue;
                const ts = chart.timeScale();
                const minT = Math.min(d.startTime, d.endTime);
                const maxT = Math.max(d.startTime, d.endTime);
                const minP = Math.min(d.startPrice, d.endPrice);
                const maxP = Math.max(d.startPrice, d.endPrice);
                const minX = Number(ts.timeToCoordinate(minT as any));
                const maxX = Number(ts.timeToCoordinate(maxT as any));
                const minY = series.priceToCoordinate(maxP);
                const maxY = series.priceToCoordinate(minP);
                if (minX == null || maxX == null || minY == null || maxY == null) continue;
                const distTL = Math.hypot(localX - minX, localY - minY);
                const distTR = Math.hypot(localX - maxX, localY - minY);
                const distBL = Math.hypot(localX - minX, localY - maxY);
                const distBR = Math.hypot(localX - maxX, localY - maxY);
                if (distTL <= handleRadius && distTL < bestDist) { bestDist = distTL; bestHandle = `${d.id}:rect-corner-tl`; }
                if (distTR <= handleRadius && distTR < bestDist) { bestDist = distTR; bestHandle = `${d.id}:rect-corner-tr`; }
                if (distBL <= handleRadius && distBL < bestDist) { bestDist = distBL; bestHandle = `${d.id}:rect-corner-bl`; }
                if (distBR <= handleRadius && distBR < bestDist) { bestDist = distBR; bestHandle = `${d.id}:rect-corner-br`; }
            }

            // Circle: center (start) + radius point (end)
            for (const d of drawings) {
                if (d.type !== 'circle' || d.hidden) continue;
                if (d.startTime == null || d.startPrice == null || d.endTime == null || d.endPrice == null) continue;
                const cx = Number(chart.timeScale().timeToCoordinate(d.startTime as any));
                const cy = series.priceToCoordinate(d.startPrice);
                const rx = Number(chart.timeScale().timeToCoordinate(d.endTime as any));
                const ry = series.priceToCoordinate(d.endPrice);
                if (cx == null || cy == null || rx == null || ry == null) continue;
                const distCenter = Math.hypot(localX - cx, localY - cy);
                const distRadius = Math.hypot(localX - rx, localY - ry);
                if (distCenter <= handleRadius && distCenter < bestDist) { bestDist = distCenter; bestHandle = `${d.id}:circle-center`; }
                if (distRadius <= handleRadius && distRadius < bestDist) { bestDist = distRadius; bestHandle = `${d.id}:circle-radius`; }
            }

            // Path: vertex bubbles (reposition handles)
            for (const d of drawings) {
                if (d.type !== 'path' || d.hidden || !d.points?.length) continue;
                const ts = chart.timeScale();
                for (let i = 0; i < d.points.length; i++) {
                    const p = d.points[i];
                    const sx = ts.timeToCoordinate(p.time as any);
                    const sy = series.priceToCoordinate(p.price);
                    if (sx == null || sy == null) continue;
                    const dist = Math.hypot(localX - Number(sx), localY - sy);
                    if (dist <= handleRadius && dist < bestDist) {
                        bestDist = dist;
                        bestHandle = `${d.id}:path-${i}`;
                    }
                }
            }

            // Check long-position / short-position RR box handles first (use same box bounds as overlay)
            for (const d of drawings) {
                if ((d.type === 'long-position' || d.type === 'short-position') && d.entryPrice != null && d.stopLoss != null && d.takeProfit != null && d.startTime != null && d.endTime != null) {
                    if (d.hidden) continue;

                    const boxBounds = getLongPositionBoxX(chart, d);
                    if (!boxBounds) continue;
                    const { boxX, boxWidth } = boxBounds;
                    const entryY = series.priceToCoordinate(d.entryPrice);
                    const stopLossY = series.priceToCoordinate(d.stopLoss);
                    const takeProfitY = series.priceToCoordinate(d.takeProfit);

                    if (entryY == null || stopLossY == null || takeProfitY == null) continue;
                    
                    // Top of box / bottom of box (same for long and short: topLeft = min(TP,SL), bottomLeft = max(TP,SL))
                    const topLeftX = boxX;
                    const topLeftY = Math.min(takeProfitY, stopLossY);
                    const distTopLeft = Math.sqrt((localX - topLeftX) ** 2 + (localY - topLeftY) ** 2);
                    
                    const bottomLeftX = boxX;
                    const bottomLeftY = Math.max(takeProfitY, stopLossY);
                    const distBottomLeft = Math.sqrt((localX - bottomLeftX) ** 2 + (localY - bottomLeftY) ** 2);
                    
                    // Right-middle square (for width adjustment)
                    const rightMiddleX = boxX + boxWidth;
                    const rightMiddleY = entryY;
                    const distRightMiddle = Math.sqrt((localX - rightMiddleX) ** 2 + (localY - rightMiddleY) ** 2);
                    
                    // Left-middle bubble (for moving left border and entry line)
                    const leftMiddleX = boxX;
                    const leftMiddleY = entryY;
                    const distLeftMiddle = Math.sqrt((localX - leftMiddleX) ** 2 + (localY - leftMiddleY) ** 2);
                    
                    if (distTopLeft <= squareRadius && distTopLeft < bestDist) {
                        bestDist = distTopLeft;
                        bestHandle = `${d.id}:top-left`;
                    }
                    if (distBottomLeft <= squareRadius && distBottomLeft < bestDist) {
                        bestDist = distBottomLeft;
                        bestHandle = `${d.id}:bottom-left`;
                    }
                    if (distRightMiddle <= squareRadius && distRightMiddle < bestDist) {
                        bestDist = distRightMiddle;
                        bestHandle = `${d.id}:right-middle`;
                    }
                    if (distLeftMiddle <= handleRadius && distLeftMiddle < bestDist) {
                        bestDist = distLeftMiddle;
                        bestHandle = `${d.id}:left-middle`;
                    }
                }
            }

            for (const d of drawings) {
                if (d.type === 'curve' && !d.hidden && d.points && d.points.length === 3) {
                    const [pt0, pt1, pt2] = d.points;
                    let s0 = chartToScreen(pt0);
                    let s1 = chartToScreen(pt1);
                    let s2 = chartToScreen(pt2);
                    if (s0 && s2) {
                        if (!s1) {
                            const timeSpan = (pt2.time as number) - (pt0.time as number);
                            const priceSpan = pt2.price - pt0.price;
                            s1 = {
                                x: timeSpan !== 0 ? (s0.x + (s2.x - s0.x) * ((pt1.time as number) - (pt0.time as number)) / timeSpan) : (s0.x + s2.x) / 2,
                                y: priceSpan !== 0 ? (s0.y + (s2.y - s0.y) * (pt1.price - pt0.price) / priceSpan) : (s0.y + s2.y) / 2,
                            };
                        }
                        const d0 = Math.hypot(localX - s0.x, localY - s0.y);
                        const d2 = Math.hypot(localX - s2.x, localY - s2.y);
                        const midX = 0.25 * s0.x + 0.5 * s1.x + 0.25 * s2.x;
                        const midY = 0.25 * s0.y + 0.5 * s1.y + 0.25 * s2.y;
                        const dMid = Math.hypot(localX - midX, localY - midY);
                        if (d0 <= handleRadius && d0 < bestDist) { bestDist = d0; bestHandle = `${d.id}:start`; }
                        if (dMid <= handleRadius && dMid < bestDist) { bestDist = dMid; bestHandle = `${d.id}:control`; }
                        if (d2 <= handleRadius && d2 < bestDist) { bestDist = d2; bestHandle = `${d.id}:end`; }
                    } else {
                        const ok = [s0, s1, s2].filter((p): p is { x: number; y: number } => p != null);
                        if (ok.length >= 2) {
                            const mid = { x: ok.reduce((a, p) => a + p.x, 0) / ok.length, y: ok.reduce((a, p) => a + p.y, 0) / ok.length };
                            s0 = s0 ?? mid;
                            s1 = s1 ?? (s0 && s2 ? { x: (s0.x + s2.x) / 2, y: (s0.y + s2.y) / 2 } : mid);
                            s2 = s2 ?? mid;
                            const d0 = Math.hypot(localX - s0.x, localY - s0.y);
                            const d2 = Math.hypot(localX - s2.x, localY - s2.y);
                            const midX = 0.25 * s0.x + 0.5 * s1.x + 0.25 * s2.x;
                            const midY = 0.25 * s0.y + 0.5 * s1.y + 0.25 * s2.y;
                            const dMid = Math.hypot(localX - midX, localY - midY);
                            if (d0 <= handleRadius && d0 < bestDist) { bestDist = d0; bestHandle = `${d.id}:start`; }
                            if (dMid <= handleRadius && dMid < bestDist) { bestDist = dMid; bestHandle = `${d.id}:control`; }
                            if (d2 <= handleRadius && d2 < bestDist) { bestDist = d2; bestHandle = `${d.id}:end`; }
                        }
                    }
                }
            }

            for (const d of drawings) {
                if ((d.type === 'arrow-markup' || d.type === 'arrow-markdown') && !d.hidden && d.points && d.points.length >= 1) {
                    const scr = chartToScreen(d.points[0]);
                    if (scr) {
                        const tipY = d.type === 'arrow-markup' ? scr.y - 28 : scr.y + 28;
                        const dist = Math.sqrt((localX - scr.x) ** 2 + (localY - tipY) ** 2);
                        if (dist <= handleRadius && dist < bestDist) {
                            bestDist = dist;
                            bestHandle = `${d.id}:start`;
                        }
                    }
                }
            }

            for (const d of drawings) {
                if (d.type !== 'lines' && d.type !== 'ray' && d.type !== 'info-line' && d.type !== 'parallel-channel' && d.type !== 'arrow-marker' && d.type !== 'arrow') continue;
                if (d.hidden) continue;
                if (!d.points || d.points.length < 2) continue;

                if (d.type === 'parallel-channel' && d.points.length >= 4) {
                    // Parallel channel: check all 4 corners and 2 middle squares
                    const start1 = chartToScreen(d.points[0]);
                    const end1 = chartToScreen(d.points[1]);
                    const start2 = chartToScreen(d.points[2]);
                    const end2 = chartToScreen(d.points[3]);
                    
                    if (start1 && end1 && start2 && end2) {
                        const distStart1 = Math.sqrt((localX - start1.x) ** 2 + (localY - start1.y) ** 2);
                        const distEnd1 = Math.sqrt((localX - end1.x) ** 2 + (localY - end1.y) ** 2);
                        const distStart2 = Math.sqrt((localX - start2.x) ** 2 + (localY - start2.y) ** 2);
                        const distEnd2 = Math.sqrt((localX - end2.x) ** 2 + (localY - end2.y) ** 2);

                        // Check middle squares (on both lines)
                        const mid1X = (start1.x + end1.x) / 2;
                        const mid1Y = (start1.y + end1.y) / 2;
                        const mid2X = (start2.x + end2.x) / 2;
                        const mid2Y = (start2.y + end2.y) / 2;
                        const squareSize = 11;
                        const squareHalf = squareSize / 2;
                        
                        const distMid1 = Math.sqrt((localX - mid1X) ** 2 + (localY - mid1Y) ** 2);
                        const distMid2 = Math.sqrt((localX - mid2X) ** 2 + (localY - mid2Y) ** 2);
                        const squareRadius = squareHalf * 1.5; // Slightly larger hit area

                        if (distStart1 <= handleRadius && distStart1 < bestDist) {
                            bestDist = distStart1;
                            bestHandle = `${d.id}:start1`;
                        }
                        if (distEnd1 <= handleRadius && distEnd1 < bestDist) {
                            bestDist = distEnd1;
                            bestHandle = `${d.id}:end1`;
                        }
                        if (distStart2 <= handleRadius && distStart2 < bestDist) {
                            bestDist = distStart2;
                            bestHandle = `${d.id}:start2`;
                        }
                        if (distEnd2 <= handleRadius && distEnd2 < bestDist) {
                            bestDist = distEnd2;
                            bestHandle = `${d.id}:end2`;
                        }
                        if (distMid1 <= squareRadius && distMid1 < bestDist) {
                            bestDist = distMid1;
                            bestHandle = `${d.id}:mid1`;
                        }
                        if (distMid2 <= squareRadius && distMid2 < bestDist) {
                            bestDist = distMid2;
                            bestHandle = `${d.id}:mid2`;
                        }
                    }
                } else {
                    // Lines/Ray: check start and end
                    const start = chartToScreen(d.points[0]);
                    const end = chartToScreen(d.points[1]);
                    if (!start || !end) continue;

                    const distStart = Math.sqrt((localX - start.x) ** 2 + (localY - start.y) ** 2);
                    const distEnd = Math.sqrt((localX - end.x) ** 2 + (localY - end.y) ** 2);

                    if (distStart <= handleRadius && distStart < bestDist) {
                        bestDist = distStart;
                        bestHandle = `${d.id}:start`;
                    }
                    if (distEnd <= handleRadius && distEnd < bestDist) {
                        bestDist = distEnd;
                        bestHandle = `${d.id}:end`;
                    }
                }
            }

            return bestHandle;
        };

        // ── onPointerMove: Cascading Hover Detection ────────────────
        // Runs all findHoveredXxx functions in priority order (handle → body
        // types → line segments) and sets the global hoveredLineId /
        // hoveredLineHandleId accordingly. Skipped while any drawing tool is active.
        const onPointerMove = (e: PointerEvent) => {
            if (activeTool === 'lines' || activeTool === 'ray' || activeTool === 'info-line' || activeTool === 'horizontal-line' || activeTool === 'horizontal-ray' || activeTool === 'parallel-channel' || activeTool === 'long-position' || activeTool === 'short-position' || activeTool === 'price-range' || activeTool === 'date-range' || activeTool === 'date-price-range' || activeTool === 'fibonacci-retracement' || activeTool === 'gann-box' || activeTool === 'brush' || activeTool === 'rectangle' || activeTool === 'path' || activeTool === 'circle' || activeTool === 'curve' || activeTool === 'emoji' || activeTool === 'arrow-markup' || activeTool === 'arrow-markdown') return;

            const { x, y } = getLocalXY(e);

            // Check handle first (more specific)
            const handleId = findHoveredHandle(x, y);
            setHoveredLineHandleId(handleId);

            if (handleId) {
                const lineId = handleId.split(':')[0];
                setHoveredLineId(lineId);
                return;
            }

            // Then check long-position RR box body
            const longPositionId = findHoveredLongPositionId(x, y);
            if (longPositionId) {
                setHoveredLineId(longPositionId);
                return;
            }

            // Then check parallel channel body
            const parallelChannelId = findHoveredParallelChannelId(x, y);
            if (parallelChannelId) {
                setHoveredLineId(parallelChannelId);
                return;
            }

            // Check rect-based drawings (price-range, date-range, date-price-range, fibonacci)
            const rectBasedId = findHoveredRectId(x, y, 'price-range', 'date-range', 'date-price-range', 'fibonacci-retracement');
            if (rectBasedId) {
                setHoveredLineId(rectBasedId);
                return;
            }

            // Then check brush stroke
            const brushId = findHoveredBrushId(x, y);
            if (brushId) {
                setHoveredLineId(brushId);
                return;
            }

            // Check rectangle, emoji, and gann-box drawings
            const rectShapeId = findHoveredRectId(x, y, 'rectangle', 'emoji', 'gann-box');
            if (rectShapeId) {
                setHoveredLineId(rectShapeId);
                return;
            }

            // Then check circle body
            const circleId = findHoveredCircleId(x, y);
            if (circleId) {
                setHoveredLineId(circleId);
                return;
            }

            // Then check path body
            const pathId = findHoveredPathId(x, y);
            if (pathId) {
                setHoveredLineId(pathId);
                return;
            }

            // Then check line
            const lineId = findHoveredLineId(x, y);
            setHoveredLineId(lineId);
        };

        const onPointerLeave = () => {
            setHoveredLineId(null);
            setHoveredLineHandleId(null);
        };

        const onPointerDown = (e: PointerEvent) => {
            // If user is in a drawing tool, ignore selection logic
            if (activeTool === 'lines' || activeTool === 'ray' || activeTool === 'info-line' || activeTool === 'horizontal-line' || activeTool === 'horizontal-ray' || activeTool === 'parallel-channel' || activeTool === 'long-position' || activeTool === 'short-position' || activeTool === 'price-range' || activeTool === 'date-range' || activeTool === 'date-price-range' || activeTool === 'fibonacci-retracement' || activeTool === 'gann-box' || activeTool === 'brush' || activeTool === 'rectangle' || activeTool === 'path' || activeTool === 'circle' || activeTool === 'curve' || activeTool === 'emoji' || activeTool === 'arrow-markup' || activeTool === 'arrow-markdown') return;

            const { x, y } = getLocalXY(e);
            const handleId = findHoveredHandle(x, y);
            const lineId = handleId ? handleId.split(':')[0] : (findHoveredRectId(x, y, 'price-range', 'date-range', 'date-price-range', 'fibonacci-retracement', 'gann-box', 'rectangle', 'emoji') ?? findHoveredBrushId(x, y) ?? findHoveredCircleId(x, y) ?? findHoveredPathId(x, y) ?? findHoveredLineId(x, y));

            // Check if clicking on a long-position handle
            if (handleId && (handleId.includes(':top-left') || handleId.includes(':bottom-left') || handleId.includes(':right-middle') || handleId.includes(':left-middle'))) {
                setSelectedLineId(lineId);
                setSelectedDrawingId(lineId);
                setSelectedHorizontalLineId(null);
                setSelectedHorizontalRayId(null);
                return;
            }

            // Check if clicking on a price-range handle
            if (handleId && (handleId.includes(':price-range-start') || handleId.includes(':price-range-end'))) {
                setSelectedLineId(lineId);
                setSelectedDrawingId(lineId);
                setSelectedHorizontalLineId(null);
                setSelectedHorizontalRayId(null);
                return;
            }

            // Check if clicking on a date-range handle
            if (handleId && (handleId.includes(':date-range-start') || handleId.includes(':date-range-end'))) {
                setSelectedLineId(lineId);
                setSelectedDrawingId(lineId);
                setSelectedHorizontalLineId(null);
                setSelectedHorizontalRayId(null);
                return;
            }

            // Check if clicking on a date-price-range handle
            if (handleId && (handleId.includes(':date-price-range-start') || handleId.includes(':date-price-range-end'))) {
                setSelectedLineId(lineId);
                setSelectedDrawingId(lineId);
                setSelectedHorizontalLineId(null);
                setSelectedHorizontalRayId(null);
                return;
            }

            // Check if clicking on a fib retracement handle
            if (handleId && (handleId.includes(':fib-retracement-start') || handleId.includes(':fib-retracement-end'))) {
                setSelectedLineId(lineId);
                setSelectedDrawingId(lineId);
                setSelectedHorizontalLineId(null);
                setSelectedHorizontalRayId(null);
                return;
            }

            // Check if clicking on a gann box corner handle
            if (handleId && (handleId.includes(':gann-corner-tl') || handleId.includes(':gann-corner-tr') || handleId.includes(':gann-corner-bl') || handleId.includes(':gann-corner-br'))) {
                setSelectedLineId(lineId);
                setSelectedDrawingId(lineId);
                setSelectedHorizontalLineId(null);
                setSelectedHorizontalRayId(null);
                return;
            }

            if (lineId) {
                setSelectedLineId(lineId);
                setSelectedDrawingId(lineId);
                setSelectedHorizontalLineId(null); // Clear horizontal line selection
                setSelectedHorizontalRayId(null); // Clear horizontal ray selection
            } else {
                    // Click outside: clear selection only for specific tool types (don't affect other tools)
                    const target = e.target as HTMLElement;
                    if (!target.closest('[data-left-toolbar="true"]')) {
                        setSelectedLineId(null);
                        // Only clear selectedDrawingId if it's currently a lines, ray, long-position, short-position, or price-range tool
                        const currentSelected = drawings.find(d => d.id === selectedDrawingId);
                        if (currentSelected?.type === 'lines' || currentSelected?.type === 'ray' || currentSelected?.type === 'info-line' || currentSelected?.type === 'long-position' || currentSelected?.type === 'short-position' || currentSelected?.type === 'price-range' || currentSelected?.type === 'date-range' || currentSelected?.type === 'date-price-range' || currentSelected?.type === 'fibonacci-retracement' || currentSelected?.type === 'gann-box' || currentSelected?.type === 'brush' || currentSelected?.type === 'rectangle' || currentSelected?.type === 'path' || currentSelected?.type === 'circle' || currentSelected?.type === 'arrow-markup' || currentSelected?.type === 'arrow-markdown' || currentSelected?.type === 'curve') {
                            setSelectedDrawingId(null);
                        }
                    }
            }
        };

        const onDoubleClick = (_e: MouseEvent) => {
            if (activeTool !== null) return;
            const id = selectedDrawingId;
            if (!id) return;
            const targetDrawing = drawings.find((d) => d.id === id);
            if (targetDrawing?.type !== 'info-line') return;
            const newLabel = window.prompt('Label for info line:', targetDrawing.label ?? '');
            if (newLabel !== null) {
                updateDrawing(id, (prev) => ({ ...prev, label: newLabel }));
            }
        };

        container.addEventListener('pointermove', onPointerMove);
        container.addEventListener('pointerleave', onPointerLeave);
        container.addEventListener('pointerdown', onPointerDown);
        container.addEventListener('dblclick', onDoubleClick);

        return () => {
            container.removeEventListener('pointermove', onPointerMove);
            container.removeEventListener('pointerleave', onPointerLeave);
            container.removeEventListener('pointerdown', onPointerDown);
            container.removeEventListener('dblclick', onDoubleClick);
        };
        }, [drawings, activeTool, selectedDrawingId, setHoveredLineId, setHoveredLineHandleId, setSelectedLineId, setSelectedDrawingId, setSelectedHorizontalLineId, updateDrawing]);

    // ============================================================================
    // LINES TOOL: Drag Logic
    // ============================================================================
    // Handles dragging line handles (start or end bubbles) to move that end of the line.
    // NOTE: This is isolated from other tools - editing here won't affect horizontal lines
    // NOTE: Also handles ray tool (same interaction pattern)
    // NOTE: Also handles parallel-channel (4 corners: start1, end1, start2, end2, and 2 middle squares: mid1, mid2)
    // NOTE: Also handles long-position (3 squares: top-left, bottom-left, right-middle, and 1 bubble: left-middle)
    // NOTE: Also handles line body drag (moving entire line)
    // NOTE: Also handles parallel-channel body drag (moving entire channel)
    // NOTE: Also handles long-position body drag (moving entire RR box)
    const draggingLineHandleRef = useRef<{ lineId: string; handle: 'start' | 'end' | 'control' | 'start1' | 'end1' | 'start2' | 'end2' | 'mid1' | 'mid2' | 'top-left' | 'bottom-left' | 'right-middle' | 'left-middle' | 'line-body' | 'parallel-channel-body' | 'long-position-body' | 'price-range-body' | 'price-range-start' | 'price-range-end' | 'date-range-body' | 'date-range-start' | 'date-range-end' | 'date-price-range-body' | 'date-price-range-start' | 'date-price-range-end' | 'fib-retracement-body' | 'fib-retracement-start' | 'fib-retracement-end' | 'gann-box-body' | 'gann-corner-tl' | 'gann-corner-tr' | 'gann-corner-bl' | 'gann-corner-br' | 'brush-body' | 'rectangle-body' | 'rect-corner-tl' | 'rect-corner-tr' | 'rect-corner-bl' | 'rect-corner-br' | 'rect-edge-left' | 'rect-edge-right' | 'rect-edge-top' | 'rect-edge-bottom' | 'path-body' | 'path-vertex' | 'circle-body' | 'circle-center' | 'circle-radius' | 'arrow-markup-body' | 'curve-body'; pathVertexIndex?: number; initialClickTime?: number; initialClickPrice?: number; initialStartTime?: number; initialStartPrice?: number; initialEndTime?: number; initialEndPrice?: number; initialStart1Time?: number; initialStart1Price?: number; initialEnd1Time?: number; initialEnd1Price?: number; initialStart2Time?: number; initialStart2Price?: number; initialEnd2Time?: number; initialEnd2Price?: number; initialEntryPrice?: number; initialStopLoss?: number; initialTakeProfit?: number; initialLongPositionStartTime?: number; initialLongPositionEndTime?: number; initialPointerX?: number; initialPointerY?: number; initialScreenPoints?: { x: number; y: number }[]; initialChartPoints?: { time: number; price: number }[] } | null>(null);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const getLocalXY = (e: PointerEvent) => {
            const rect = container.getBoundingClientRect();
            return { x: e.clientX - rect.left, y: e.clientY - rect.top };
        };

        // Use library conversion (same as drawing effect so behavior is consistent)
        const getTimeFromX = (ch: IChartApi, x: number): number | null => ch.timeScale().coordinateToTime(x as any) as number | null;

        const screenToChart = (x: number, y: number): ChartPoint | null => {
            const chart = chartRef.current;
            const series = seriesRef.current;
            if (!chart || !series) return null;

            const t = getTimeFromX(chart, x);
            const p = series.coordinateToPrice(y);
            if (t == null || p == null) return null;

            return { time: t, price: p };
        };

        const chartToScreen = (point: ChartPoint): { x: number; y: number } | null => {
            const chart = chartRef.current;
            const series = seriesRef.current;
            if (!chart || !series) return null;

            const x = chart.timeScale().timeToCoordinate(point.time as any);
            const y = series.priceToCoordinate(point.price);
            if (x == null || y == null) return null;

            return { x, y };
        };

        // Duplicate of hover-section's findHoveredLineId — needed because
        // this drag useEffect creates its own closure with different deps.
        const findHoveredLineId = (localX: number, localY: number): string | null => {
            const series = seriesRef.current;
            const chart = chartRef.current;
            if (!series || !chart) return null;

            const thresholdPx = 8;
            let bestId: string | null = null;
            let bestDist = Number.POSITIVE_INFINITY;

            for (const d of drawings) {
                if (d.type !== 'lines' && d.type !== 'ray' && d.type !== 'info-line' && d.type !== 'arrow-marker' && d.type !== 'arrow') continue;
                if (d.hidden) continue;
                if (!d.points || d.points.length < 2) continue;

                const start = chartToScreen(d.points[0]);
                const end = chartToScreen(d.points[1]);
                if (!start || !end) continue;

                const dx = end.x - start.x;
                const dy = end.y - start.y;
                const lengthSq = dx * dx + dy * dy;
                if (lengthSq === 0) continue;

                let dist: number;

                if (d.type === 'ray') {
                    // For ray: check distance to extended ray (from start through end to edge)
                    // Calculate direction vector
                    const unitX = dx / Math.sqrt(lengthSq);
                    const unitY = dy / Math.sqrt(lengthSq);

                    // Project point onto the infinite ray
                    const t = ((localX - start.x) * unitX + (localY - start.y) * unitY);
                    
                    // Only consider points in the forward direction (from start through end)
                    if (t < 0) continue; // Behind the start point

                    // Calculate closest point on the ray
                    const projX = start.x + t * unitX;
                    const projY = start.y + t * unitY;
                    dist = Math.sqrt((localX - projX) ** 2 + (localY - projY) ** 2);
                } else {
                    // For lines: check distance to line segment (between bubbles only)
                    const t = Math.max(0, Math.min(1, ((localX - start.x) * dx + (localY - start.y) * dy) / lengthSq));
                    const projX = start.x + t * dx;
                    const projY = start.y + t * dy;
                    dist = Math.sqrt((localX - projX) ** 2 + (localY - projY) ** 2);
                }

                if (dist <= thresholdPx && dist < bestDist) {
                    bestDist = dist;
                    bestId = d.id;
                }
            }

            return bestId;
        };

        // Duplicate of hover-section's findHoveredParallelChannelId for this drag closure.
        const findHoveredParallelChannelId = (localX: number, localY: number): string | null => {
            const series = seriesRef.current;
            const chart = chartRef.current;
            if (!series || !chart) return null;

            for (const d of drawings) {
                if (d.type !== 'parallel-channel') continue;
                if (d.hidden) continue;
                if (!d.points || d.points.length < 4) continue;

                const [start1, end1, start2, end2] = d.points;
                const p1 = chartToScreen(start1);
                const p2 = chartToScreen(end1);
                const p3 = chartToScreen(end2);
                const p4 = chartToScreen(start2);

                if (!p1 || !p2 || !p3 || !p4) continue;

                const points = [p1, p2, p3, p4];
                let inside = false;
                for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
                    const xi = points[i].x, yi = points[i].y;
                    const xj = points[j].x, yj = points[j].y;
                    const intersect = ((yi > localY) !== (yj > localY)) && (localX < (xj - xi) * (localY - yi) / (yj - yi) + xi);
                    if (intersect) inside = !inside;
                }

                if (inside) {
                    return d.id;
                }
            }

            return null;
        };

        // Use findHoveredRectDrawingId for price-range and fib-retracement hit-tests

        // Use shared pointToSegmentDistance from drawingHelpers
        const pointToSegmentDist = pointToSegmentDistance;

        // Find which brush stroke is being hovered (distance to path < threshold)
        const findHoveredBrushId = (localX: number, localY: number): string | null => {
            const chart = chartRef.current;
            const series = seriesRef.current;
            if (!chart || !series) return null;
            const threshold = 10;
            for (const d of drawings) {
                if (d.type !== 'brush' || d.hidden) continue;
                let screenPts: { x: number; y: number }[];
                if (d.points && d.points.length >= 2) {
                    screenPts = [];
                    for (const p of d.points) {
                        const sx = chart.timeScale().timeToCoordinate(p.time as any);
                        const sy = series.priceToCoordinate(p.price);
                        if (sx != null && sy != null) screenPts.push({ x: Number(sx), y: sy });
                    }
                } else if (d.screenPoints && d.screenPoints.length >= 2) {
                    screenPts = d.screenPoints;
                } else continue;
                if (screenPts.length < 2) continue;
                for (let i = 0; i < screenPts.length - 1; i++) {
                    const dist = pointToSegmentDist(localX, localY, screenPts[i].x, screenPts[i].y, screenPts[i + 1].x, screenPts[i + 1].y);
                    if (dist <= threshold) return d.id;
                }
            }
            return null;
        };

        // Helper for long-position box x bounds (same as overlay so body click matches)
        const getLongPositionBoxXDrag = (ch: IChartApi, d: Drawing): { boxX: number; boxWidth: number } | null => {
            const ts = ch.timeScale();
            let startX = ts.timeToCoordinate(d.startTime as any);
            let endX = ts.timeToCoordinate(d.endTime as any);
            const visible = ts.getVisibleRange();
            if (visible && typeof visible.from === 'number' && typeof visible.to === 'number') {
                const leftX = ts.timeToCoordinate(visible.from as any);
                const rightX = ts.timeToCoordinate(visible.to as any);
                const visibleTimeSpan = visible.to - visible.from;
                const visiblePixelSpan = (rightX != null && leftX != null) ? rightX - leftX : 0;
                if (visibleTimeSpan > 0 && visiblePixelSpan > 0 && leftX != null) {
                    const timeWidth = (d.endTime ?? 0) - (d.startTime ?? 0);
                    const baseX = startX ?? leftX;
                    if (startX == null) startX = leftX as any;
                    if (endX == null && typeof baseX === 'number') endX = (baseX + (timeWidth / visibleTimeSpan) * visiblePixelSpan) as any;
                } else if (startX == null || endX == null) {
                    if (startX == null) startX = leftX;
                    if (endX == null) endX = rightX;
                }
            }
            if (startX == null || endX == null) return null;
            return { boxX: Math.min(Number(startX), Number(endX)), boxWidth: Math.abs(Number(endX) - Number(startX)) };
        };

        // Find which long-position or short-position (RR box) is being hovered (for startDrag body click)
        const findHoveredLongPositionId = (localX: number, localY: number): string | null => {
            const series = seriesRef.current;
            const chart = chartRef.current;
            if (!series || !chart) return null;

            for (const d of drawings) {
                if (d.type !== 'long-position' && d.type !== 'short-position') continue;
                if (d.hidden) continue;
                if (d.entryPrice == null || d.stopLoss == null || d.takeProfit == null || d.startTime == null || d.endTime == null) continue;

                const boxBounds = getLongPositionBoxXDrag(chart, d);
                if (!boxBounds) continue;
                const { boxX, boxWidth } = boxBounds;
                const entryY = series.priceToCoordinate(d.entryPrice);
                const stopLossY = series.priceToCoordinate(d.stopLoss);
                const takeProfitY = series.priceToCoordinate(d.takeProfit);
                if (entryY == null || stopLossY == null || takeProfitY == null) continue;

                const boxTop = Math.min(takeProfitY, stopLossY, entryY);
                const boxBottom = Math.max(takeProfitY, stopLossY, entryY);

                if (localX >= boxX && localX <= boxX + boxWidth && localY >= boxTop && localY <= boxBottom) {
                    return d.id;
                }
            }

            return null;
        };

        // ── startDrag ──
        // Determines what the user clicked on (handle, body, or nothing) and
        // initializes the dragging state. Captures initial positions so onMove
        // can compute deltas from the click origin, not the drawing origin.
        const startDrag = (e: PointerEvent) => {
            if (activeTool === 'lines' || activeTool === 'ray' || activeTool === 'info-line' || activeTool === 'horizontal-line' || activeTool === 'horizontal-ray' || activeTool === 'parallel-channel' || activeTool === 'long-position' || activeTool === 'short-position' || activeTool === 'price-range' || activeTool === 'date-range' || activeTool === 'date-price-range' || activeTool === 'fibonacci-retracement' || activeTool === 'gann-box' || activeTool === 'brush' || activeTool === 'rectangle' || activeTool === 'path' || activeTool === 'circle' || activeTool === 'curve') return;

            const { x, y } = getLocalXY(e);
            const chart = chartRef.current;
            const series = seriesRef.current;
            if (!chart || !series) return;

            const captureAndDisablePanning = (ev: PointerEvent) => {
                try { container.setPointerCapture(ev.pointerId); } catch {}
                const chartEl = (chart as any).chartElement?.parentElement || container;
                if (chartEl) {
                    const canvas = chartEl.querySelector('canvas');
                    if (canvas) {
                        (canvas as any).__originalPointerEvents = canvas.style.pointerEvents;
                        canvas.style.pointerEvents = 'none';
                    }
                }
                ev.preventDefault();
                ev.stopPropagation();
            };

            // Generic rect-based hit-test for drawings with startTime/startPrice/endTime/endPrice
            const findHoveredRectDrawingId = (localX: number, localY: number, ...types: string[]): string | null => {
                const ts = chart.timeScale();
                for (const d of drawings) {
                    if (d.hidden || !types.includes(d.type as string)) continue;
                    if (d.startTime == null || d.startPrice == null || d.endTime == null || d.endPrice == null) continue;
                    const startX = ts.timeToCoordinate(d.startTime as any);
                    const endX = ts.timeToCoordinate(d.endTime as any);
                    const startY = series.priceToCoordinate(d.startPrice);
                    const endY = series.priceToCoordinate(d.endPrice);
                    if (startX == null || endX == null || startY == null || endY == null) continue;
                    const minX = Math.min(Number(startX), Number(endX));
                    const maxX = Math.max(Number(startX), Number(endX));
                    const minY = Math.min(startY, endY);
                    const maxY = Math.max(startY, endY);
                    if (localX >= minX && localX <= maxX && localY >= minY && localY <= maxY) return d.id;
                }
                return null;
            };

            // Starts a body drag for any drawing with startTime/startPrice/endTime/endPrice
            const tryStartRectBodyDrag = (
                bodyId: string | null,
                handleName: string,
                allowedTypes: string[]
            ): boolean => {
                if (!bodyId) return false;
                const targetDrawing = drawings.find((d) => d.id === bodyId);
                if (!targetDrawing || targetDrawing.locked) return false;
                if (!allowedTypes.includes(targetDrawing.type as string) || targetDrawing.startTime == null || targetDrawing.startPrice == null || targetDrawing.endTime == null || targetDrawing.endPrice == null) {
                    setSelectedLineId(bodyId);
                    setSelectedDrawingId(bodyId);
                    return true;
                }
                const clickTime = getTimeFromX(chart, x);
                const clickPrice = series.coordinateToPrice(y);
                if (clickTime == null || clickPrice == null) return false;
                draggingLineHandleRef.current = {
                    lineId: bodyId,
                    handle: handleName as any,
                    initialClickTime: clickTime,
                    initialClickPrice: clickPrice,
                    initialStartTime: targetDrawing.startTime as number,
                    initialStartPrice: targetDrawing.startPrice,
                    initialEndTime: targetDrawing.endTime as number,
                    initialEndPrice: targetDrawing.endPrice,
                };
                setSelectedLineId(bodyId);
                setSelectedDrawingId(bodyId);
                captureAndDisablePanning(e);
                return true;
            };

            // Priority: handle click > body click (so dragging a handle on a body still works)
            if (hoveredLineHandleId) {
                const parts = hoveredLineHandleId.split(':');
                const lineId = parts[0];
                let handle = parts[1] as string;
                const targetDrawing = drawings.find((d) => d.id === lineId);
                if (!targetDrawing || targetDrawing.locked) return;

                let pathVertexIndex: number | undefined;
                if (handle.startsWith('path-') && handle !== 'path-body') {
                    const idx = parseInt(handle.slice(5), 10);
                    if (!Number.isNaN(idx)) {
                        pathVertexIndex = idx;
                        handle = 'path-vertex';
                    }
                }
                const clickTime = getTimeFromX(chart, x);
                const clickPrice = series.coordinateToPrice(y);
                const base = pathVertexIndex !== undefined
                    ? { lineId, handle: 'path-vertex' as const, pathVertexIndex }
                    : { lineId, handle: handle as any };
                if (handle === 'circle-center' && clickTime != null && clickPrice != null && targetDrawing.type === 'circle' && targetDrawing.startTime != null && targetDrawing.startPrice != null && targetDrawing.endTime != null && targetDrawing.endPrice != null) {
                    draggingLineHandleRef.current = { ...base, initialClickTime: clickTime, initialClickPrice: clickPrice, initialStartTime: targetDrawing.startTime, initialStartPrice: targetDrawing.startPrice, initialEndTime: targetDrawing.endTime, initialEndPrice: targetDrawing.endPrice };
                } else if ((targetDrawing.type === 'arrow-markup' || targetDrawing.type === 'arrow-markdown') && clickTime != null && clickPrice != null && targetDrawing.points && targetDrawing.points.length >= 1) {
                    draggingLineHandleRef.current = { ...base, initialClickTime: clickTime, initialClickPrice: clickPrice, initialStartTime: targetDrawing.points[0].time as number, initialStartPrice: targetDrawing.points[0].price };
                } else {
                    draggingLineHandleRef.current = base;
                }
                setSelectedLineId(lineId);
                setSelectedDrawingId(lineId);

                try {
                    container.setPointerCapture(e.pointerId);
                } catch {
                    // ignore
                }
                e.preventDefault();
                return;
            }

            if (tryStartRectBodyDrag(findHoveredRectDrawingId(x, y, 'price-range'), 'price-range-body', ['price-range'])) return;

            if (tryStartRectBodyDrag(findHoveredRectDrawingId(x, y, 'date-range'), 'date-range-body', ['date-range'])) return;

            if (tryStartRectBodyDrag(findHoveredRectDrawingId(x, y, 'date-price-range'), 'date-price-range-body', ['date-price-range'])) return;

            // Click on brush stroke body: start body drag (move whole brush stroke; screen or chart space)
            const brushBodyId = findHoveredBrushId(x, y);
            if (brushBodyId) {
                const targetDrawing = drawings.find((d) => d.id === brushBodyId);
                if (!targetDrawing || targetDrawing.locked) return;
                if (targetDrawing.type !== 'brush') return;
                const pts = targetDrawing.screenPoints || targetDrawing.points;
                if (!pts || pts.length < 2) return;

                const { x: localX, y: localY } = getLocalXY(e);
                const base: { lineId: string; handle: 'brush-body'; initialClickTime?: number; initialClickPrice?: number; initialChartPoints?: { time: number; price: number }[]; initialScreenPoints?: { x: number; y: number }[]; initialPointerX?: number; initialPointerY?: number } = {
                    lineId: brushBodyId,
                    handle: 'brush-body',
                };
                if (targetDrawing.screenPoints && targetDrawing.screenPoints.length >= 2) {
                    base.initialScreenPoints = targetDrawing.screenPoints.map((p) => ({ x: p.x, y: p.y }));
                    base.initialPointerX = localX;
                    base.initialPointerY = localY;
                } else {
                    const chartPoints = (targetDrawing.points || []) as { time: number; price: number }[];
                    if (chartPoints.length < 2) return;
                    const clickTime = getTimeFromX(chart, x);
                    const clickPrice = series.coordinateToPrice(y);
                    if (clickTime == null || clickPrice == null) return;
                    base.initialClickTime = clickTime;
                    base.initialClickPrice = clickPrice;
                    base.initialChartPoints = chartPoints.map((p) => ({ time: p.time, price: p.price }));
                }

                draggingLineHandleRef.current = base as any;
                setSelectedLineId(brushBodyId);
                setSelectedDrawingId(brushBodyId);

                captureAndDisablePanning(e);
                return;
            }

            if (tryStartRectBodyDrag(findHoveredRectDrawingId(x, y, 'fibonacci-retracement'), 'fib-retracement-body', ['fibonacci-retracement'])) return;

            if (tryStartRectBodyDrag(findHoveredRectDrawingId(x, y, 'gann-box'), 'gann-box-body', ['gann-box'])) return;

            if (tryStartRectBodyDrag(findHoveredRectDrawingId(x, y, 'rectangle', 'emoji'), 'rectangle-body', ['rectangle', 'emoji'])) return;

            // Click on circle body: start body drag (move whole circle in chart space)
            const findHoveredCircleIdDrag = (localX: number, localY: number): string | null => {
                for (const d of drawings) {
                    if (d.type !== 'circle' || d.hidden) continue;
                    if (d.startTime == null || d.startPrice == null || d.endTime == null || d.endPrice == null) continue;
                    const cx = Number(chart.timeScale().timeToCoordinate(d.startTime as any));
                    const cy = series.priceToCoordinate(d.startPrice);
                    const rx = Number(chart.timeScale().timeToCoordinate(d.endTime as any));
                    const ry = series.priceToCoordinate(d.endPrice);
                    if (cx == null || cy == null || rx == null || ry == null) continue;
                    const R = Math.hypot(rx - cx, ry - cy);
                    const distFromCenter = Math.hypot(localX - cx, localY - cy);
                    const distFromEdge = Math.abs(distFromCenter - R);
                    if (distFromCenter <= R + 6 || distFromEdge <= 8) return d.id;
                }
                return null;
            };
            const circleBodyId = findHoveredCircleIdDrag(x, y);
            if (circleBodyId) {
                const targetDrawing = drawings.find((d) => d.id === circleBodyId);
                if (!targetDrawing || targetDrawing.locked) return;
                if (targetDrawing.type !== 'circle' || targetDrawing.startTime == null || targetDrawing.startPrice == null || targetDrawing.endTime == null || targetDrawing.endPrice == null) {
                    setSelectedLineId(circleBodyId);
                    setSelectedDrawingId(circleBodyId);
                    return;
                }
                const clickTime = getTimeFromX(chart, x);
                const clickPrice = series.coordinateToPrice(y);
                if (clickTime == null || clickPrice == null) return;

                draggingLineHandleRef.current = {
                    lineId: circleBodyId,
                    handle: 'circle-body',
                    initialClickTime: clickTime,
                    initialClickPrice: clickPrice,
                    initialStartTime: targetDrawing.startTime,
                    initialStartPrice: targetDrawing.startPrice,
                    initialEndTime: targetDrawing.endTime,
                    initialEndPrice: targetDrawing.endPrice,
                };
                setSelectedLineId(circleBodyId);
                setSelectedDrawingId(circleBodyId);

                captureAndDisablePanning(e);
                return;
            }

            // Click on path body: start body drag (move whole path in chart space)
            const findHoveredPathIdDrag = (localX: number, localY: number): string | null => {
                const chart = chartRef.current;
                const series = seriesRef.current;
                if (!chart || !series) return null;
                const threshold = 10;
                const pointToSeg = (px: number, py: number, x1: number, y1: number, x2: number, y2: number) => {
                    const dx = x2 - x1, dy = y2 - y1;
                    const lenSq = dx * dx + dy * dy;
                    if (lenSq === 0) return Math.hypot(px - x1, py - y1);
                    let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
                    t = Math.max(0, Math.min(1, t));
                    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
                };
                for (const d of drawings) {
                    if (d.type !== 'path' || d.hidden || !d.points?.length) continue;
                    const pts = d.points;
                    if (pts.length < 2) {
                        const sx = chart.timeScale().timeToCoordinate(pts[0].time as any);
                        const sy = series.priceToCoordinate(pts[0].price);
                        if (sx != null && sy != null && Math.hypot(localX - Number(sx), localY - sy) <= threshold) return d.id;
                        continue;
                    }
                    for (let i = 0; i < pts.length - 1; i++) {
                        const s1 = chart.timeScale().timeToCoordinate(pts[i].time as any);
                        const s2 = chart.timeScale().timeToCoordinate(pts[i + 1].time as any);
                        const y1 = series.priceToCoordinate(pts[i].price);
                        const y2 = series.priceToCoordinate(pts[i + 1].price);
                        if (s1 == null || s2 == null || y1 == null || y2 == null) continue;
                        const dist = pointToSeg(localX, localY, Number(s1), y1, Number(s2), y2);
                        if (dist <= threshold) return d.id;
                    }
                }
                return null;
            };
            const pathBodyId = findHoveredPathIdDrag(x, y);
            if (pathBodyId) {
                const targetDrawing = drawings.find((d) => d.id === pathBodyId);
                if (!targetDrawing || targetDrawing.locked) return;
                if (targetDrawing.type !== 'path' || !targetDrawing.points?.length) {
                    setSelectedLineId(pathBodyId);
                    setSelectedDrawingId(pathBodyId);
                    return;
                }
                const clickTime = getTimeFromX(chart, x);
                const clickPrice = series.coordinateToPrice(y);
                if (clickTime == null || clickPrice == null) return;

                draggingLineHandleRef.current = {
                    lineId: pathBodyId,
                    handle: 'path-body',
                    initialClickTime: clickTime,
                    initialClickPrice: clickPrice,
                    initialChartPoints: targetDrawing.points.map((p) => ({ time: p.time as number, price: p.price })),
                };
                setSelectedLineId(pathBodyId);
                setSelectedDrawingId(pathBodyId);

                captureAndDisablePanning(e);
                return;
            }

            // Then check if clicking on a long-position or short-position RR box body (not a handle)
            const longPositionId = findHoveredLongPositionId(x, y);
            if (longPositionId) {
                const targetDrawing = drawings.find((d) => d.id === longPositionId);
                if (!targetDrawing || targetDrawing.locked) return;
                if (targetDrawing.type !== 'long-position' && targetDrawing.type !== 'short-position') return;
                if (targetDrawing.entryPrice == null || targetDrawing.stopLoss == null || targetDrawing.takeProfit == null || targetDrawing.startTime == null || targetDrawing.endTime == null) return;

                const clickTime = getTimeFromX(chart, x);
                const clickPrice = series.coordinateToPrice(y);
                if (clickTime == null || clickPrice == null) return;

                draggingLineHandleRef.current = {
                    lineId: longPositionId,
                    handle: 'long-position-body',
                    initialClickTime: clickTime,
                    initialClickPrice: clickPrice,
                    initialEntryPrice: targetDrawing.entryPrice,
                    initialStopLoss: targetDrawing.stopLoss,
                    initialTakeProfit: targetDrawing.takeProfit,
                    initialLongPositionStartTime: targetDrawing.startTime,
                    initialLongPositionEndTime: targetDrawing.endTime,
                };
                setSelectedLineId(longPositionId);
                setSelectedDrawingId(longPositionId);

                captureAndDisablePanning(e);
                return;
            }

            // Then check if clicking on a parallel channel body (not a handle)
            const parallelChannelId = findHoveredParallelChannelId(x, y);
            if (parallelChannelId) {
                const targetDrawing = drawings.find((d) => d.id === parallelChannelId);
                if (!targetDrawing || targetDrawing.locked) return;
                if (targetDrawing.type !== 'parallel-channel') return;
                if (!targetDrawing.points || targetDrawing.points.length < 4) return;

                const clickTime = getTimeFromX(chart, x);
                const clickPrice = series.coordinateToPrice(y);
                if (clickTime == null || clickPrice == null) return;

                const [start1, end1, start2, end2] = targetDrawing.points;
                draggingLineHandleRef.current = {
                    lineId: parallelChannelId,
                    handle: 'parallel-channel-body',
                    initialClickTime: clickTime,
                    initialClickPrice: clickPrice,
                    initialStart1Time: start1.time as number,
                    initialStart1Price: start1.price,
                    initialEnd1Time: end1.time as number,
                    initialEnd1Price: end1.price,
                    initialStart2Time: start2.time as number,
                    initialStart2Price: start2.price,
                    initialEnd2Time: end2.time as number,
                    initialEnd2Price: end2.price,
                };
                setSelectedLineId(parallelChannelId);
                setSelectedDrawingId(parallelChannelId);

                captureAndDisablePanning(e);
                return;
            }

            // Then check if clicking on a line body (not a handle)
            const lineId = findHoveredLineId(x, y);
            if (lineId) {
                const targetDrawing = drawings.find((d) => d.id === lineId);
                if (!targetDrawing || targetDrawing.locked) return;

                if (targetDrawing.type === 'arrow-markup' || targetDrawing.type === 'arrow-markdown') {
                    if (!targetDrawing.points || targetDrawing.points.length < 1) return;
                    const clickTime = getTimeFromX(chart, x);
                    const clickPrice = series.coordinateToPrice(y);
                    if (clickTime == null || clickPrice == null) return;
                    draggingLineHandleRef.current = {
                        lineId,
                        handle: 'arrow-markup-body',
                        initialClickTime: clickTime,
                        initialClickPrice: clickPrice,
                        initialStartTime: targetDrawing.points[0].time as number,
                        initialStartPrice: targetDrawing.points[0].price,
                    };
                    setSelectedLineId(lineId);
                    setSelectedDrawingId(lineId);
                    captureAndDisablePanning(e);
                    return;
                }

                if (targetDrawing.type === 'curve' && targetDrawing.points && targetDrawing.points.length === 3) {
                    const clickTime = getTimeFromX(chart, x);
                    const clickPrice = series.coordinateToPrice(y);
                    if (clickTime == null || clickPrice == null) return;
                    const [p0, p1, p2] = targetDrawing.points;
                    draggingLineHandleRef.current = {
                        lineId,
                        handle: 'curve-body',
                        initialClickTime: clickTime,
                        initialClickPrice: clickPrice,
                        initialStartTime: p0.time as number,
                        initialStartPrice: p0.price,
                        initialStart1Time: p1.time as number,
                        initialStart1Price: p1.price,
                        initialEndTime: p2.time as number,
                        initialEndPrice: p2.price,
                    };
                    setSelectedLineId(lineId);
                    setSelectedDrawingId(lineId);
                    captureAndDisablePanning(e);
                    return;
                }

                if (targetDrawing.type !== 'lines' && targetDrawing.type !== 'ray' && targetDrawing.type !== 'info-line' && targetDrawing.type !== 'arrow-marker' && targetDrawing.type !== 'arrow') return;
                if (!targetDrawing.points || targetDrawing.points.length < 2) return;

                const clickTime = getTimeFromX(chart, x);
                const clickPrice = series.coordinateToPrice(y);
                if (clickTime == null || clickPrice == null) return;

                const [startPoint, endPoint] = targetDrawing.points;
                draggingLineHandleRef.current = {
                    lineId,
                    handle: 'line-body',
                    initialClickTime: clickTime,
                    initialClickPrice: clickPrice,
                    initialStartTime: startPoint.time as number,
                    initialStartPrice: startPoint.price,
                    initialEndTime: endPoint.time as number,
                    initialEndPrice: endPoint.price,
                };
                setSelectedLineId(lineId);
                setSelectedDrawingId(lineId);

                captureAndDisablePanning(e);
            }
        };

        // ── onMove: Drag Update ──
        // Routes every pointermove to the correct drag handler based on the
        // handle type stored in draggingLineHandleRef. Each handler computes
        // the delta from the initial click and applies it to the drawing via
        // updateDrawing. Pointer capture is re-asserted to block chart panning.
        const onMove = (e: PointerEvent) => {
            const drag = draggingLineHandleRef.current;
            if (!drag) return;

            e.preventDefault();
            e.stopPropagation();
            
            if (container && e.pointerId !== undefined) {
                try {
                    if (!container.hasPointerCapture(e.pointerId)) {
                        container.setPointerCapture(e.pointerId);
                    }
                } catch {
                }
            }

            const { x, y } = getLocalXY(e);
            const chart = chartRef.current;
            const series = seriesRef.current;
            if (!chart || !series) return;

            /**
             * Applies a body-drag offset to any drawing with startTime/startPrice/endTime/endPrice.
             * Returns true if the handle matched and was handled, false otherwise.
             */
            const applyRectBodyOffset = (handleName: string, ...allowedTypes: string[]): boolean => {
                if (drag.handle !== handleName) return false;
                if (drag.initialClickTime == null || drag.initialClickPrice == null ||
                    drag.initialStartTime == null || drag.initialStartPrice == null ||
                    drag.initialEndTime == null || drag.initialEndPrice == null) return true;
                const currentTime = getTimeFromX(chart, x);
                const currentPrice = series.coordinateToPrice(y);
                if (currentTime == null || currentPrice == null) return true;
                const timeOffset = currentTime - drag.initialClickTime;
                const priceOffset = currentPrice - drag.initialClickPrice;
                updateDrawing(drag.lineId, (prev) => {
                    if (!allowedTypes.includes(prev.type as string)) return prev;
                    return {
                        ...prev,
                        startTime: drag.initialStartTime! + timeOffset,
                        startPrice: drag.initialStartPrice! + priceOffset,
                        endTime: drag.initialEndTime! + timeOffset,
                        endPrice: drag.initialEndPrice! + priceOffset,
                    };
                });
                return true;
            };

            /**
             * Applies a start/end handle drag for drawings with startTime/startPrice/endTime/endPrice.
             * Moves only the start or end point depending on the handle suffix.
             */
            const applyEndpointDrag = (startHandle: string, endHandle: string, drawingType: string): boolean => {
                if (drag.handle !== startHandle && drag.handle !== endHandle) return false;
                const newT = getTimeFromX(chart, x);
                const newP = series.coordinateToPrice(y);
                if (newT == null || newP == null) return true;
                updateDrawing(drag.lineId, (prev) => {
                    if (prev.type !== drawingType || prev.startTime == null || prev.startPrice == null || prev.endTime == null || prev.endPrice == null) return prev;
                    if (drag.handle === startHandle) return { ...prev, startTime: newT, startPrice: newP };
                    return { ...prev, endTime: newT, endPrice: newP };
                });
                return true;
            };

            // Handle long-position / short-position RR box body drag (moving entire box)
            if (drag.handle === 'long-position-body') {
                if (drag.initialClickTime == null || drag.initialClickPrice == null || 
                    drag.initialEntryPrice == null || drag.initialStopLoss == null ||
                    drag.initialTakeProfit == null || drag.initialLongPositionStartTime == null ||
                    drag.initialLongPositionEndTime == null) return;

                const currentTime = getTimeFromX(chart, x);
                const currentPrice = series.coordinateToPrice(y);
                if (currentTime == null || currentPrice == null) return;

                const timeOffset = currentTime - drag.initialClickTime;
                const priceOffset = currentPrice - drag.initialClickPrice;

                updateDrawing(drag.lineId, (prev) => {
                    if ((prev.type === 'long-position' || prev.type === 'short-position') && prev.entryPrice != null && prev.stopLoss != null && prev.takeProfit != null && prev.startTime != null && prev.endTime != null) {
                        return {
                            ...prev,
                            entryPrice: drag.initialEntryPrice! + priceOffset,
                            stopLoss: drag.initialStopLoss! + priceOffset,
                            takeProfit: drag.initialTakeProfit! + priceOffset,
                            startTime: drag.initialLongPositionStartTime! + timeOffset,
                            endTime: drag.initialLongPositionEndTime! + timeOffset,
                        };
                    }
                    return prev;
                });
                return;
            }

            // Handle arrow-markup body/handle drag (move single point)
            if (drag.handle === 'arrow-markup-body' || (drag.handle === 'start' && (drawings.find(d => d.id === drag.lineId)?.type === 'arrow-markup' || drawings.find(d => d.id === drag.lineId)?.type === 'arrow-markdown'))) {
                if (drag.initialClickTime == null || drag.initialClickPrice == null ||
                    drag.initialStartTime == null || drag.initialStartPrice == null) return;

                const currentTime = getTimeFromX(chart, x);
                const currentPrice = series.coordinateToPrice(y);
                if (currentTime == null || currentPrice == null) return;

                const timeOffset = currentTime - drag.initialClickTime;
                const priceOffset = currentPrice - drag.initialClickPrice;

                updateDrawing(drag.lineId, (prev) => {
                    if ((prev.type === 'arrow-markup' || prev.type === 'arrow-markdown') && prev.points && prev.points.length >= 1) {
                        return {
                            ...prev,
                            points: [{ time: drag.initialStartTime! + timeOffset, price: drag.initialStartPrice! + priceOffset }],
                        };
                    }
                    return prev;
                });
                return;
            }

            if (applyRectBodyOffset('price-range-body', 'price-range')) return;
            if (applyRectBodyOffset('date-range-body', 'date-range')) return;
            if (applyRectBodyOffset('date-price-range-body', 'date-price-range')) return;

            // Handle brush stroke body drag (screen-space or chart-space)
            if (drag.handle === 'brush-body') {
                if (drag.initialScreenPoints?.length) {
                    const { x: localX, y: localY } = getLocalXY(e as any);
                    const dx = localX - (drag.initialPointerX ?? 0);
                    const dy = localY - (drag.initialPointerY ?? 0);
                    updateDrawing(drag.lineId, (prev) => {
                        if (prev.type === 'brush' && drag.initialScreenPoints?.length) {
                            return {
                                ...prev,
                                screenPoints: drag.initialScreenPoints.map((p) => ({ x: p.x + dx, y: p.y + dy })),
                            };
                        }
                        return prev;
                    });
                } else if (drag.initialClickTime != null && drag.initialClickPrice != null && drag.initialChartPoints?.length) {
                    const currentTime = getTimeFromX(chart, x);
                    const currentPrice = series.coordinateToPrice(y);
                    if (currentTime == null || currentPrice == null) return;
                    const deltaTime = currentTime - drag.initialClickTime;
                    const deltaPrice = currentPrice - drag.initialClickPrice;
                    updateDrawing(drag.lineId, (prev) => {
                        if (prev.type === 'brush' && drag.initialChartPoints?.length) {
                            return {
                                ...prev,
                                points: drag.initialChartPoints.map((p) => ({ time: p.time + deltaTime, price: p.price + deltaPrice })),
                            };
                        }
                        return prev;
                    });
                }
                return;
            }

            if (applyRectBodyOffset('rectangle-body', 'rectangle', 'emoji')) return;
            if (applyRectBodyOffset('gann-box-body', 'gann-box')) return;
            if (applyRectBodyOffset('circle-body', 'circle')) return;
            if (applyRectBodyOffset('circle-center', 'circle')) return;

            // Handle circle radius drag (change radius only; center stays fixed)
            if (drag.handle === 'circle-radius') {
                const currentTime = getTimeFromX(chart, x);
                const currentPrice = series.coordinateToPrice(y);
                if (currentTime == null || currentPrice == null) return;
                updateDrawing(drag.lineId, (prev) => {
                    if (prev.type === 'circle') {
                        return { ...prev, endTime: currentTime, endPrice: currentPrice };
                    }
                    return prev;
                });
                return;
            }

            // Handle path body drag (moving entire path in chart space)
            if (drag.handle === 'path-body') {
                if (drag.initialClickTime == null || drag.initialClickPrice == null || !drag.initialChartPoints?.length) return;
                const currentTime = getTimeFromX(chart, x);
                const currentPrice = series.coordinateToPrice(y);
                if (currentTime == null || currentPrice == null) return;
                const deltaTime = currentTime - drag.initialClickTime;
                const deltaPrice = currentPrice - drag.initialClickPrice;
                updateDrawing(drag.lineId, (prev) => {
                    if (prev.type === 'path' && drag.initialChartPoints?.length) {
                        return {
                            ...prev,
                            points: drag.initialChartPoints.map((p) => ({ time: p.time + deltaTime, price: p.price + deltaPrice })),
                        };
                    }
                    return prev;
                });
                return;
            }

            // Handle path vertex drag (reposition one point)
            if (drag.handle === 'path-vertex' && drag.pathVertexIndex !== undefined) {
                const currentTime = getTimeFromX(chart, x);
                const currentPrice = series.coordinateToPrice(y);
                if (currentTime == null || currentPrice == null) return;
                const idx = drag.pathVertexIndex;
                updateDrawing(drag.lineId, (prev) => {
                    if (prev.type !== 'path' || !prev.points || idx < 0 || idx >= prev.points.length) return prev;
                    const next = [...prev.points];
                    next[idx] = { time: currentTime, price: currentPrice };
                    return { ...prev, points: next };
                });
                return;
            }

            // Handle rectangle corner/edge resize
            const rectHandle = drag.handle as string;
            if (rectHandle.startsWith('rect-corner-') || rectHandle.startsWith('rect-edge-')) {
                const currentTime = getTimeFromX(chart, x);
                const currentPrice = series.coordinateToPrice(y);
                if (currentTime == null || currentPrice == null) return;
                updateDrawing(drag.lineId, (prev) => {
                    if ((prev.type !== 'rectangle' && prev.type !== 'emoji') || prev.startTime == null || prev.startPrice == null || prev.endTime == null || prev.endPrice == null) return prev;
                    const minT = Math.min(prev.startTime, prev.endTime);
                    const maxT = Math.max(prev.startTime, prev.endTime);
                    const minP = Math.min(prev.startPrice, prev.endPrice);
                    const maxP = Math.max(prev.startPrice, prev.endPrice);
                    switch (drag.handle) {
                        case 'rect-corner-tl': return { ...prev, startTime: currentTime, endPrice: currentPrice, endTime: maxT, startPrice: minP };
                        case 'rect-corner-tr': return { ...prev, endTime: currentTime, endPrice: currentPrice, startTime: minT, startPrice: minP };
                        case 'rect-corner-bl': return { ...prev, startTime: currentTime, startPrice: currentPrice, endTime: maxT, endPrice: maxP };
                        case 'rect-corner-br': return { ...prev, endTime: currentTime, startPrice: currentPrice, startTime: minT, endPrice: maxP };
                        case 'rect-edge-left': return { ...prev, startTime: currentTime, endTime: maxT };
                        case 'rect-edge-right': return { ...prev, startTime: minT, endTime: currentTime };
                        case 'rect-edge-top': return { ...prev, startPrice: minP, endPrice: currentPrice };
                        case 'rect-edge-bottom': return { ...prev, startPrice: currentPrice, endPrice: maxP };
                        default: return prev;
                    }
                });
                return;
            }

            // Handle gann box corner resize (4 corners only)
            const gannHandle = drag.handle as string;
            if (gannHandle.startsWith('gann-corner-')) {
                const currentTime = getTimeFromX(chart, x);
                const currentPrice = series.coordinateToPrice(y);
                if (currentTime == null || currentPrice == null) return;
                updateDrawing(drag.lineId, (prev) => {
                    if (prev.type !== 'gann-box' || prev.startTime == null || prev.startPrice == null || prev.endTime == null || prev.endPrice == null) return prev;
                    const minT = Math.min(prev.startTime, prev.endTime);
                    const maxT = Math.max(prev.startTime, prev.endTime);
                    const minP = Math.min(prev.startPrice, prev.endPrice);
                    const maxP = Math.max(prev.startPrice, prev.endPrice);
                    switch (drag.handle) {
                        case 'gann-corner-tl': return { ...prev, startTime: currentTime, endPrice: currentPrice, endTime: maxT, startPrice: minP };
                        case 'gann-corner-tr': return { ...prev, endTime: currentTime, endPrice: currentPrice, startTime: minT, startPrice: minP };
                        case 'gann-corner-bl': return { ...prev, startTime: currentTime, startPrice: currentPrice, endTime: maxT, endPrice: maxP };
                        case 'gann-corner-br': return { ...prev, endTime: currentTime, startPrice: currentPrice, startTime: minT, endPrice: maxP };
                        default: return prev;
                    }
                });
                return;
            }

            // Handle parallel channel body drag (moving entire channel)
            if (drag.handle === 'parallel-channel-body') {
                if (drag.initialClickTime == null || drag.initialClickPrice == null || 
                    drag.initialStart1Time == null || drag.initialStart1Price == null ||
                    drag.initialEnd1Time == null || drag.initialEnd1Price == null ||
                    drag.initialStart2Time == null || drag.initialStart2Price == null ||
                    drag.initialEnd2Time == null || drag.initialEnd2Price == null) return;

                const currentTime = getTimeFromX(chart, x);
                const currentPrice = series.coordinateToPrice(y);
                if (currentTime == null || currentPrice == null) return;

                // Calculate the offset from initial click position
                const timeOffset = currentTime - drag.initialClickTime;
                const priceOffset = currentPrice - drag.initialClickPrice;

                // Move all 4 points by the offset
                updateDrawing(drag.lineId, (prev) => {
                    if (prev.type === 'parallel-channel' && prev.points && prev.points.length >= 4) {
                        return {
                            ...prev,
                            points: [
                                { time: drag.initialStart1Time! + timeOffset, price: drag.initialStart1Price! + priceOffset },
                                { time: drag.initialEnd1Time! + timeOffset, price: drag.initialEnd1Price! + priceOffset },
                                { time: drag.initialStart2Time! + timeOffset, price: drag.initialStart2Price! + priceOffset },
                                { time: drag.initialEnd2Time! + timeOffset, price: drag.initialEnd2Price! + priceOffset },
                            ],
                        };
                    }
                    return prev;
                });
                return;
            }

            // Handle line body drag (moving entire line)
            if (drag.handle === 'line-body') {
                if (drag.initialClickTime == null || drag.initialClickPrice == null || 
                    drag.initialStartTime == null || drag.initialStartPrice == null ||
                    drag.initialEndTime == null || drag.initialEndPrice == null) return;

                const currentTime = getTimeFromX(chart, x);
                const currentPrice = series.coordinateToPrice(y);
                if (currentTime == null || currentPrice == null) return;

                // Calculate the offset from initial click position
                const timeOffset = currentTime - drag.initialClickTime;
                const priceOffset = currentPrice - drag.initialClickPrice;

                // Move both start and end points by the offset
                updateDrawing(drag.lineId, (prev) => {
                    if ((prev.type === 'lines' || prev.type === 'ray' || prev.type === 'info-line' || prev.type === 'arrow-marker' || prev.type === 'arrow') && prev.points && prev.points.length >= 2) {
                        return {
                            ...prev,
                            points: [
                                { time: drag.initialStartTime! + timeOffset, price: drag.initialStartPrice! + priceOffset },
                                { time: drag.initialEndTime! + timeOffset, price: drag.initialEndPrice! + priceOffset },
                            ],
                        };
                    }
                    return prev;
                });
                return;
            }

            if (drag.handle === 'curve-body') {
                if (drag.initialClickTime == null || drag.initialClickPrice == null ||
                    drag.initialStartTime == null || drag.initialStartPrice == null ||
                    drag.initialStart1Time == null || drag.initialStart1Price == null ||
                    drag.initialEndTime == null || drag.initialEndPrice == null) return;

                const currentTime = getTimeFromX(chart, x);
                const currentPrice = series.coordinateToPrice(y);
                if (currentTime == null || currentPrice == null) return;

                const timeOffset = currentTime - drag.initialClickTime;
                const priceOffset = currentPrice - drag.initialClickPrice;

                updateDrawing(drag.lineId, (prev) => {
                    if (prev.type === 'curve' && prev.points && prev.points.length === 3) {
                        return {
                            ...prev,
                            points: [
                                { time: drag.initialStartTime! + timeOffset, price: drag.initialStartPrice! + priceOffset },
                                { time: drag.initialStart1Time! + timeOffset, price: drag.initialStart1Price! + priceOffset },
                                { time: drag.initialEndTime! + timeOffset, price: drag.initialEndPrice! + priceOffset },
                            ],
                        };
                    }
                    return prev;
                });
                return;
            }

            if (applyEndpointDrag('price-range-start', 'price-range-end', 'price-range')) return;
            if (applyEndpointDrag('date-range-start', 'date-range-end', 'date-range')) return;
            if (applyEndpointDrag('date-price-range-start', 'date-price-range-end', 'date-price-range')) return;
            if (applyEndpointDrag('fib-retracement-start', 'fib-retracement-end', 'fibonacci-retracement')) return;
            if (applyRectBodyOffset('fib-retracement-body', 'fibonacci-retracement')) return;

            // Handle long-position / short-position RR box handles
            if (drag.handle === 'top-left' || drag.handle === 'bottom-left' || drag.handle === 'right-middle' || drag.handle === 'left-middle') {
                const chart = chartRef.current;
                const series = seriesRef.current;
                if (!chart || !series) return;

                updateDrawing(drag.lineId, (prev) => {
                    if ((prev.type === 'long-position' || prev.type === 'short-position') && prev.entryPrice != null && prev.stopLoss != null && prev.takeProfit != null && prev.startTime != null && prev.endTime != null) {
                        if (drag.handle === 'top-left') {
                            // Long: top of box = take profit (green). Short: top of box = stop loss (red).
                            const newPrice = series.coordinateToPrice(y);
                            if (newPrice == null) return prev;
                            if (prev.type === 'long-position' && newPrice > prev.entryPrice) return { ...prev, takeProfit: newPrice };
                            if (prev.type === 'short-position' && newPrice > prev.entryPrice) return { ...prev, stopLoss: newPrice };
                        } else if (drag.handle === 'bottom-left') {
                            // Long: bottom = stop loss (red). Short: bottom = take profit (green).
                            const newPrice = series.coordinateToPrice(y);
                            if (newPrice == null) return prev;
                            if (prev.type === 'long-position' && newPrice < prev.entryPrice) return { ...prev, stopLoss: newPrice };
                            if (prev.type === 'short-position' && newPrice < prev.entryPrice) return { ...prev, takeProfit: newPrice };
                        } else if (drag.handle === 'right-middle') {
                            const newEndTime = getTimeFromX(chart, x);
                            if (newEndTime != null && newEndTime > prev.startTime) {
                                return { ...prev, endTime: newEndTime };
                            }
                        } else if (drag.handle === 'left-middle') {
                            const newStartTime = getTimeFromX(chart, x);
                            const newEntryPrice = series.coordinateToPrice(y);
                            if (newStartTime != null && newEntryPrice != null && newStartTime < prev.endTime) {
                                return { ...prev, startTime: newStartTime, entryPrice: newEntryPrice };
                            }
                        }
                    }
                    return prev;
                });
                return;
            }
            
            // Handle middle squares separately (they only need Y coordinate)
            if (drag.handle === 'mid1' || drag.handle === 'mid2') {
                updateDrawing(drag.lineId, (prev) => {
                    if (prev.type === 'parallel-channel' && prev.points && prev.points.length >= 4) {
                        const [start1, end1, start2, end2] = prev.points;
                        const newPoints = [...prev.points];
                        const chart = chartRef.current;
                        const series = seriesRef.current;
                        if (!chart || !series) return prev;
                        
                        // Get current line positions
                        const start1ScreenX = chart.timeScale().timeToCoordinate(start1.time as any);
                        const start1ScreenY = series.priceToCoordinate(start1.price);
                        const end1ScreenX = chart.timeScale().timeToCoordinate(end1.time as any);
                        const end1ScreenY = series.priceToCoordinate(end1.price);
                        const start2ScreenX = chart.timeScale().timeToCoordinate(start2.time as any);
                        const start2ScreenY = series.priceToCoordinate(start2.price);
                        const end2ScreenX = chart.timeScale().timeToCoordinate(end2.time as any);
                        const end2ScreenY = series.priceToCoordinate(end2.price);
                        
                        if (start1ScreenX == null || start1ScreenY == null || end1ScreenX == null || end1ScreenY == null || 
                            start2ScreenX == null || start2ScreenY == null || end2ScreenX == null || end2ScreenY == null) return prev;
                        
                        if (drag.handle === 'mid1') {
                            // Drag top line middle: calculate vertical offset
                            const mid1Y = (start1ScreenY + end1ScreenY) / 2;
                            const verticalOffset = y - mid1Y;
                            
                            // Move entire top line by the offset
                            const newStart1Y = start1ScreenY + verticalOffset;
                            const newEnd1Y = end1ScreenY + verticalOffset;
                            const newStart1Price = series.coordinateToPrice(newStart1Y);
                            const newEnd1Price = series.coordinateToPrice(newEnd1Y);
                            
                            if (newStart1Price != null && newEnd1Price != null) {
                                newPoints[0] = { time: start1.time, price: newStart1Price };
                                newPoints[1] = { time: end1.time, price: newEnd1Price };
                            }
                        } else {
                            // Drag bottom line middle: calculate vertical offset
                            const mid2Y = (start2ScreenY + end2ScreenY) / 2;
                            const verticalOffset = y - mid2Y;
                            
                            // Move entire bottom line by the offset
                            const newStart2Y = start2ScreenY + verticalOffset;
                            const newEnd2Y = end2ScreenY + verticalOffset;
                            const newStart2Price = series.coordinateToPrice(newStart2Y);
                            const newEnd2Price = series.coordinateToPrice(newEnd2Y);
                            
                            if (newStart2Price != null && newEnd2Price != null) {
                                newPoints[2] = { time: start2.time, price: newStart2Price };
                                newPoints[3] = { time: end2.time, price: newEnd2Price };
                            }
                        }
                        
                        return { ...prev, points: newPoints };
                    }
                    return prev;
                });
                return;
            }
            
            const newPoint = screenToChart(x, y);
            if (!newPoint) return;

            // Update immediately for faster response
            updateDrawing(drag.lineId, (prev) => {
                if (prev.type === 'parallel-channel' && prev.points && prev.points.length >= 4) {
                    // Parallel channel: maintain parallelism and vertical borders
                    const [start1, end1, start2, end2] = prev.points;
                    const newPoints = [...prev.points];
                    
                    if (drag.handle === 'start1') {
                        // Drag start1: move start1, keep end1's Y, move start2 vertically, adjust end2 to maintain parallel
                        newPoints[0] = newPoint; // Update start1
                        newPoints[2] = { time: newPoint.time, price: start2.price + (newPoint.price - start1.price) }; // Move start2 vertically
                        // Adjust end2 to maintain parallel line (same angle as line from new start1 to end1)
                        const chart = chartRef.current;
                        const series = seriesRef.current;
                        if (chart && series) {
                            const start1ScreenX = chart.timeScale().timeToCoordinate(newPoint.time as any);
                            const start1ScreenY = series.priceToCoordinate(newPoint.price);
                            const end1ScreenX = chart.timeScale().timeToCoordinate(end1.time as any);
                            const end1ScreenY = series.priceToCoordinate(end1.price);
                            if (start1ScreenX != null && start1ScreenY != null && end1ScreenX != null && end1ScreenY != null) {
                                const dx = end1ScreenX - start1ScreenX;
                                const dy = end1ScreenY - start1ScreenY;
                                const start2ScreenX = chart.timeScale().timeToCoordinate(newPoints[2].time as any);
                                const start2ScreenY = series.priceToCoordinate(newPoints[2].price);
                                if (start2ScreenX != null && start2ScreenY != null && Math.abs(dx) > 0.001) {
                                    const t = (end1ScreenX - start1ScreenX) / dx;
                                    const end2ScreenY = start2ScreenY + t * dy;
                                    const end2Price = series.coordinateToPrice(end2ScreenY);
                                    if (end2Price != null) {
                                        newPoints[3] = { time: end1.time, price: end2Price };
                                    }
                                }
                            }
                        }
                    } else if (drag.handle === 'end1') {
                        // Drag end1: move end1, keep start1's Y, move end2 vertically, adjust start2 to maintain parallel
                        newPoints[1] = newPoint; // Update end1
                        newPoints[3] = { time: newPoint.time, price: end2.price + (newPoint.price - end1.price) }; // Move end2 vertically
                        // Adjust start2 to maintain parallel line
                        const chart = chartRef.current;
                        const series = seriesRef.current;
                        if (chart && series) {
                            const start1ScreenX = chart.timeScale().timeToCoordinate(start1.time as any);
                            const start1ScreenY = series.priceToCoordinate(start1.price);
                            const end1ScreenX = chart.timeScale().timeToCoordinate(newPoint.time as any);
                            const end1ScreenY = series.priceToCoordinate(newPoint.price);
                            if (start1ScreenX != null && start1ScreenY != null && end1ScreenX != null && end1ScreenY != null) {
                                const dx = end1ScreenX - start1ScreenX;
                                const dy = end1ScreenY - start1ScreenY;
                                const end2ScreenX = chart.timeScale().timeToCoordinate(newPoints[3].time as any);
                                const end2ScreenY = series.priceToCoordinate(newPoints[3].price);
                                if (end2ScreenX != null && end2ScreenY != null && Math.abs(dx) > 0.001) {
                                    const t = (start1ScreenX - end1ScreenX) / dx;
                                    const start2ScreenY = end2ScreenY + t * dy;
                                    const start2Price = series.coordinateToPrice(start2ScreenY);
                                    if (start2Price != null) {
                                        newPoints[2] = { time: start1.time, price: start2Price };
                                    }
                                }
                            }
                        }
                    } else if (drag.handle === 'start2') {
                        // Drag start2: move start2, keep end2's Y, move start1 vertically, adjust end1 to maintain parallel
                        newPoints[2] = newPoint; // Update start2
                        newPoints[0] = { time: newPoint.time, price: start1.price + (newPoint.price - start2.price) }; // Move start1 vertically
                        // Adjust end1 to maintain parallel line
                        const chart = chartRef.current;
                        const series = seriesRef.current;
                        if (chart && series) {
                            const start1ScreenX = chart.timeScale().timeToCoordinate(newPoints[0].time as any);
                            const start1ScreenY = series.priceToCoordinate(newPoints[0].price);
                            const start2ScreenX = chart.timeScale().timeToCoordinate(newPoint.time as any);
                            const start2ScreenY = series.priceToCoordinate(newPoint.price);
                            const end2ScreenX = chart.timeScale().timeToCoordinate(end2.time as any);
                            const end2ScreenY = series.priceToCoordinate(end2.price);
                            if (start1ScreenX != null && start1ScreenY != null && start2ScreenX != null && start2ScreenY != null && end2ScreenX != null && end2ScreenY != null) {
                                const dx = end2ScreenX - start2ScreenX;
                                const dy = end2ScreenY - start2ScreenY;
                                if (Math.abs(dx) > 0.001) {
                                    const t = (end2ScreenX - start2ScreenX) / dx;
                                    const end1ScreenY = start1ScreenY + t * dy;
                                    const end1Price = series.coordinateToPrice(end1ScreenY);
                                    if (end1Price != null) {
                                        newPoints[1] = { time: end2.time, price: end1Price };
                                    }
                                }
                            }
                        }
                    } else if (drag.handle === 'end2') {
                        // Drag end2: move end2, keep start2's Y, move end1 vertically, adjust start1 to maintain parallel
                        newPoints[3] = newPoint; // Update end2
                        newPoints[1] = { time: newPoint.time, price: end1.price + (newPoint.price - end2.price) }; // Move end1 vertically
                        // Adjust start1 to maintain parallel line
                        const chart = chartRef.current;
                        const series = seriesRef.current;
                        if (chart && series) {
                            const end1ScreenX = chart.timeScale().timeToCoordinate(newPoints[1].time as any);
                            const end1ScreenY = series.priceToCoordinate(newPoints[1].price);
                            const start2ScreenX = chart.timeScale().timeToCoordinate(start2.time as any);
                            const start2ScreenY = series.priceToCoordinate(start2.price);
                            const end2ScreenX = chart.timeScale().timeToCoordinate(newPoint.time as any);
                            const end2ScreenY = series.priceToCoordinate(newPoint.price);
                            if (end1ScreenX != null && end1ScreenY != null && start2ScreenX != null && start2ScreenY != null && end2ScreenX != null && end2ScreenY != null) {
                                const dx = end2ScreenX - start2ScreenX;
                                const dy = end2ScreenY - start2ScreenY;
                                if (Math.abs(dx) > 0.001) {
                                    const t = (start2ScreenX - end2ScreenX) / dx;
                                    const start1ScreenY = end1ScreenY + t * dy;
                                    const start1Price = series.coordinateToPrice(start1ScreenY);
                                    if (start1Price != null) {
                                        newPoints[0] = { time: start2.time, price: start1Price };
                                    }
                                }
                            }
                        }
                    }
                    
                    return { ...prev, points: newPoints };
                } else if (prev.type === 'curve' && prev.points && prev.points.length === 3) {
                    const newPoints = [...prev.points];
                    const [p0, prevCtrl, p2] = prev.points;
                    if (drag.handle === 'start') newPoints[0] = newPoint;
                    else if (drag.handle === 'control') {
                        let ctrlTime = 2 * newPoint.time - 0.5 * p0.time - 0.5 * p2.time;
                        let ctrlPrice = 2 * newPoint.price - 0.5 * p0.price - 0.5 * p2.price;
                        if (!Number.isFinite(ctrlTime)) ctrlTime = prevCtrl.time;
                        if (!Number.isFinite(ctrlPrice)) ctrlPrice = prevCtrl.price;
                        newPoints[1] = { time: ctrlTime, price: ctrlPrice };
                    } else if (drag.handle === 'end') newPoints[2] = newPoint;
                    return { ...prev, points: newPoints };
                } else if ((prev.type === 'lines' || prev.type === 'ray' || prev.type === 'info-line' || prev.type === 'arrow-marker' || prev.type === 'arrow') && prev.points && prev.points.length >= 2) {
                    // Lines/Ray: simple update
                    const newPoints = [...prev.points];
                    if (drag.handle === 'start') {
                        newPoints[0] = newPoint;
                    } else {
                        newPoints[1] = newPoint;
                    }
                    return { ...prev, points: newPoints };
                }
                return prev;
            });
        };

        // ── stop: End Drag ──
        // Releases pointer capture, restores the chart canvas's pointer-events
        // style (which was disabled during drag to block chart panning),
        // and clears the dragging ref.
        const stop = (e?: PointerEvent) => {
            if (e) {
                if (container && e.pointerId !== undefined) {
                    try {
                        if (container.hasPointerCapture(e.pointerId)) {
                            container.releasePointerCapture(e.pointerId);
                        }
                    } catch {}
                }
            }
            const chart = chartRef.current;
            if (chart) {
                const chartContainer = (chart as any).chartElement?.parentElement || container;
                if (chartContainer) {
                    const canvas = chartContainer.querySelector('canvas');
                    if (canvas && (canvas as any).__originalPointerEvents !== undefined) {
                        canvas.style.pointerEvents = (canvas as any).__originalPointerEvents || '';
                        delete (canvas as any).__originalPointerEvents;
                    }
                }
            }
            draggingLineHandleRef.current = null;
        };

        container.addEventListener('pointerdown', startDrag, true);
        document.addEventListener('pointermove', onMove, true);
        document.addEventListener('pointerup', stop, true);
        document.addEventListener('pointercancel', stop, true);

        return () => {
            container.removeEventListener('pointerdown', startDrag, true);
            document.removeEventListener('pointermove', onMove, true);
            document.removeEventListener('pointerup', stop, true);
            document.removeEventListener('pointercancel', stop, true);
        };
    }, [activeTool, hoveredLineHandleId, drawings, setSelectedLineId, setSelectedDrawingId, updateDrawing]);

    // ============================================================================
    // CURSOR MANAGEMENT (Shared for all tools)
    // ============================================================================
    // Updates cursor style based on active tool, hover states, etc.
    // This is shared across all tools but checks tool-specific hover states.
    useEffect(() => {
        if (!containerRef.current) return;
        
        const chartContainer = containerRef.current;
        const interactionLayer = interactionLayerRef.current;
        let cursorStyle = 'default';
        
        if (activeTool === 'lines' || activeTool === 'ray' || activeTool === 'info-line' || activeTool === 'horizontal-line' || activeTool === 'horizontal-ray' || activeTool === 'parallel-channel') {
            cursorStyle = 'crosshair';
        } else if (hoveredLineHandleId) {
            // Check if it's a middle square (for parallel channel width adjustment)
            if (hoveredLineHandleId.includes(':mid1') || hoveredLineHandleId.includes(':mid2')) {
                // Up/down resize cursor for middle squares
                cursorStyle = 'ns-resize';
            } else if (hoveredLineHandleId.includes(':top-left') || hoveredLineHandleId.includes(':bottom-left')) {
                // Up/down resize cursor for RR box vertical handles
                cursorStyle = 'ns-resize';
            } else if (hoveredLineHandleId.includes(':right-middle')) {
                // Left/right resize cursor for RR box width handle
                cursorStyle = 'ew-resize';
            } else if (hoveredLineHandleId.includes(':left-middle')) {
                // Move cursor for left-middle bubble (can move both horizontally and vertically)
                cursorStyle = 'move';
            } else {
                // Move cursor when hovering over a line handle
                cursorStyle = 'move';
            }
        } else if (hoveredLineId) {
            // White hand cursor (grab) when hovering lines, ray, parallel channel, or long-position
            // Check if we're currently dragging a line body, parallel channel body, or long-position body
            const dragHandle = draggingLineHandleRef.current?.handle;
            if (dragHandle === 'line-body' || dragHandle === 'parallel-channel-body' || dragHandle === 'long-position-body' || dragHandle === 'price-range-body' || dragHandle === 'date-range-body' || dragHandle === 'date-price-range-body' || dragHandle === 'fib-retracement-body' || dragHandle === 'gann-box-body' || dragHandle === 'brush-body' || dragHandle === 'rectangle-body' || dragHandle === 'circle-body' || dragHandle === 'path-body') {
                cursorStyle = 'grabbing';
            } else {
                cursorStyle = 'grab';
            }
        } else if (hoveredHorizontalRayHandleId) {
            // Move cursor when hovering over horizontal ray bubble handle
            cursorStyle = 'move';
        } else if (hoveredHorizontalRayId) {
            // White hand cursor when hovering the horizontal ray
            cursorStyle = 'grab';
        } else if (hoveredHorizontalLineHandleId) {
            // Up/down resize cursor when directly over the handle square
            cursorStyle = 'ns-resize';
        } else if (hoveredHorizontalLineId) {
            // White hand-ish cursor (same as eraser) when hovering the horizontal line
            cursorStyle = 'grab';
        } else if (crosshairType === 'dot' || crosshairType === 'cross') {
            cursorStyle = 'crosshair';
        } else if (crosshairType === 'arrow') {
            cursorStyle = 'default';
        } else if (crosshairType === 'demonstration') {
            cursorStyle = 'default';
        } else if (crosshairType === 'eraser') {
            cursorStyle = 'grab';
        } else {
            cursorStyle = 'default';
        }
        
        chartContainer.style.cursor = cursorStyle;
        if (interactionLayer) interactionLayer.style.cursor = cursorStyle;
        
        return () => {
            chartContainer.style.cursor = 'default';
            if (interactionLayer) interactionLayer.style.cursor = 'default';
        };
    }, [crosshairType, activeTool, hoveredHorizontalLineId, hoveredHorizontalLineHandleId, hoveredHorizontalRayId, hoveredHorizontalRayHandleId, hoveredLineId, hoveredLineHandleId]);

    // ── Render ────────────────────────────────────────────────────────
    // Three layers stacked with CSS:
    //   1. containerRef  — the lightweight-charts <canvas> lives here
    //   2. interactionLayerRef — transparent overlay for cursor styling only (pointerEvents: none)
    //   3. DrawingOverlay — SVG/canvas that paints all visible drawings,
    //      handles, hover highlights, and live previews on top of the chart
    return (
        <div className="relative w-full h-full bg-white overflow-hidden">
            <div ref={containerRef} style={{ position: 'relative', width: '100%', height: '100%' }} />
            <div
                ref={interactionLayerRef}
                className="absolute inset-0 z-50"
                style={{
                    pointerEvents: 'none',
                }}
            />
            <DrawingOverlay
                chart={chartApi}
                series={seriesApi}
                containerRef={containerRef}
                underlayIsPrimitive={true}
                candlestickDataRef={candlestickDataRef as React.RefObject<Array<{ time: number; open: number; high: number; low: number; close: number }>>}
                candlestickDataVersion={candlestickDataVersion}
                priceRangeInProgressIdRef={priceRangeInProgressRef}
                priceRangeLiveEndPriceRef={priceRangeLiveEndPriceRef}
                priceRangeLiveEndTimeRef={priceRangeLiveEndTimeRef}
                priceRangeLiveTick={priceRangeLiveTick}
                dateRangeInProgressIdRef={dateRangeInProgressRef}
                dateRangeLiveEndTimeRef={dateRangeLiveEndTimeRef}
                dateRangeLiveEndPriceRef={dateRangeLiveEndPriceRef}
                dateRangeLiveTick={dateRangeLiveTick}
                datePriceRangeInProgressIdRef={datePriceRangeInProgressRef}
                datePriceRangeLiveEndTimeRef={datePriceRangeLiveEndTimeRef}
                datePriceRangeLiveEndPriceRef={datePriceRangeLiveEndPriceRef}
                datePriceRangeLiveTick={datePriceRangeLiveTick}
                rectangleInProgressIdRef={rectangleInProgressRef}
                rectangleLiveTick={rectangleLiveTick}
                pathInProgressIdRef={pathInProgressRef}
                pathLiveEndTimeRef={pathLiveEndTimeRef}
                pathLiveEndPriceRef={pathLiveEndPriceRef}
                pathLiveTick={pathLiveTick}
                circleInProgressIdRef={circleInProgressRef}
                circleLiveEndTimeRef={circleLiveEndTimeRef}
                circleLiveEndPriceRef={circleLiveEndPriceRef}
                circleLiveTick={circleLiveTick}
                fibRetracementInProgressIdRef={fibRetracementInProgressRef}
                fibRetracementLiveEndTimeRef={fibRetracementLiveEndTimeRef}
                fibRetracementLiveEndPriceRef={fibRetracementLiveEndPriceRef}
                fibRetracementLiveTick={fibRetracementLiveTick}
                gannBoxInProgressIdRef={gannBoxInProgressRef}
                gannBoxLiveTick={gannBoxLiveTick}
                zoomRectStartRef={zoomStartRef}
                zoomRectEndRef={zoomEndRef}
                zoomLiveTick={zoomLiveTick}
            />
        </div>
    );
}
