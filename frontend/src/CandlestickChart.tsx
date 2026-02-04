import { useEffect, useRef, useState } from 'react';
import { createChart, IChartApi, ISeriesApi, CandlestickData, Time, UTCTimestamp, CrosshairMode } from 'lightweight-charts';
import { useDrawing, Drawing, ChartPoint } from './components/DrawingContext';
import DrawingOverlay from './components/DrawingOverlay';

interface CandlestickChartProps {
    height?: number;
    crosshairType?: string;
}

export default function CandlestickChart({ height = 600, crosshairType = 'hovering-cross' }: CandlestickChartProps): JSX.Element {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const interactionLayerRef = useRef<HTMLDivElement | null>(null);
    const chartRef = useRef<IChartApi | null>(null);
    const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
    const [chartApi, setChartApi] = useState<IChartApi | null>(null);
    const [seriesApi, setSeriesApi] = useState<ISeriesApi<'Candlestick'> | null>(null);
    // Note: we intentionally avoid covering the chart with a pointer-events layer during drawing,
    // so the user can still interact with candles/price scale (pan/zoom/scale).
    const lastPriceRef = useRef<number>(150); // Starting price
    const {
        activeTool,
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
    } = useDrawing();

    // Refs to avoid effect re-subscribing due to changing function identities from context
    const addDrawingRefFn = useRef(addDrawing);
    const setCurrentDrawingRefFn = useRef(setCurrentDrawing);
    const setIsDrawingRefFn = useRef(setIsDrawing);
    const setActiveToolRefFn = useRef(setActiveTool);
    const activeToolRef = useRef(activeTool);

    useEffect(() => {
        addDrawingRefFn.current = addDrawing;
        setCurrentDrawingRefFn.current = setCurrentDrawing;
        setIsDrawingRefFn.current = setIsDrawing;
        setActiveToolRefFn.current = setActiveTool;
    }, [addDrawing, setCurrentDrawing, setIsDrawing, setActiveTool]);

    useEffect(() => {
        activeToolRef.current = activeTool;
    }, [activeTool]);

    const draggingHorizontalLineIdRef = useRef<string | null>(null);
    const horizontalPriceLinesRef = useRef<Map<string, any>>(new Map());
    const horizontalRayPriceLinesRef = useRef<Map<string, any>>(new Map());
    const longPositionPriceLinesRef = useRef<Map<string, any>>(new Map());

    // Sync horizontal-line drawings to lightweight-charts price markers (right price scale)
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
                } catch {
                    // ignore
                }
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

    // Sync horizontal-ray drawings to lightweight-charts price markers (right price scale)
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
                } catch {
                    // ignore
                }
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

    // Sync long-position (RR box) drawings to lightweight-charts price markers (right price scale)
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
                } catch {
                    // ignore
                }
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

    // Cleanup all price lines on unmount
    useEffect(() => {
        return () => {
            const series = seriesRef.current as any;
            const horizontalMap = horizontalPriceLinesRef.current;
            const horizontalRayMap = horizontalRayPriceLinesRef.current;
            if (!series) return;
            for (const [, priceLine] of horizontalMap.entries()) {
                try {
                    series.removePriceLine?.(priceLine);
                } catch {
                    // ignore
                }
            }
            horizontalMap.clear();
            
            for (const [, priceLine] of horizontalRayMap.entries()) {
                try {
                    series.removePriceLine?.(priceLine);
                } catch {
                    // ignore
                }
            }
            horizontalRayMap.clear();
            
            const longPositionMap = longPositionPriceLinesRef.current;
            for (const [, priceLine] of longPositionMap.entries()) {
                try {
                    series.removePriceLine?.(priceLine);
                } catch {
                    // ignore
                }
            }
            longPositionMap.clear();
        };
    }, []);

    // Backspace/Delete removes the currently selected drawing
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (!selectedDrawingId) return;

            // Don't interfere with typing
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

    // Create chart + series
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
                vertLines: { color: '#f1f5f9', style: 1, visible: true }, 
                horzLines: { color: '#f1f5f9', style: 1, visible: true } 
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
                borderColor: '#e2e8f0'
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

        chartRef.current = chart;
        seriesRef.current = candleSeries;
        setChartApi(chart);
        setSeriesApi(candleSeries);

        const handleResize = () => {
            if (chartRef.current && containerRef.current) {
                const containerHeight = containerRef.current.clientHeight || height;
                chartRef.current.resize(containerRef.current.clientWidth, containerHeight);
            }
        };

        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
            chart.remove();
        };
    }, []);

    // Crosshair style tuning:
    // - Dot mode: hide crosshair lines so the dot is clean (no cross over it)
    // - Other modes: show dashed crosshair lines
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


    // Generate random OHLCV data
    const generateRandomCandle = (): CandlestickData<Time> => {
        const basePrice = lastPriceRef.current;
        const change = (Math.random() - 0.5) * 10; // Random change between -5 and +5
        const open = basePrice;
        const close = basePrice + change;
        const high = Math.max(open, close) + Math.random() * 5;
        const low = Math.min(open, close) - Math.random() * 5;
        
        lastPriceRef.current = close;
        
        return {
            time: (Date.now() / 1000) as UTCTimestamp,
            open: Number(open.toFixed(2)),
            high: Number(high.toFixed(2)),
            low: Number(low.toFixed(2)),
            close: Number(close.toFixed(2)),
        };
    };

    // Initialize with some historical data and then update with new data
    useEffect(() => {
        if (!seriesRef.current) return;

        // Generate initial historical data (last 50 candles)
        const initialData: CandlestickData<Time>[] = [];
        let basePrice = 150;
        const now = Date.now() / 1000;
        
        for (let i = 50; i >= 0; i--) {
            const change = (Math.random() - 0.5) * 10;
            const open = basePrice;
            const close = basePrice + change;
            const high = Math.max(open, close) + Math.random() * 5;
            const low = Math.min(open, close) - Math.random() * 5;
            
            initialData.push({
                time: (now - i * 60) as UTCTimestamp, // 1 minute intervals
                open: Number(open.toFixed(2)),
                high: Number(high.toFixed(2)),
                low: Number(low.toFixed(2)),
                close: Number(close.toFixed(2)),
            });
            
            basePrice = close;
        }
        
        lastPriceRef.current = basePrice;
        seriesRef.current.setData(initialData);

        // Update with new random data every second
        const interval = setInterval(() => {
            if (seriesRef.current) {
                const candle = generateRandomCandle();
                seriesRef.current.update(candle);
            }
        }, 1000);

        return () => {
            clearInterval(interval);
        };
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

        const screenToChart = (x: number, y: number): ChartPoint | null => {
            const chart = chartRef.current;
            const series = seriesRef.current;
            if (!chart || !series) return null;

            const t = chart.timeScale().coordinateToTime(x as any) as any;
            const p = series.coordinateToPrice(y);
            if (t == null || p == null) return null;

            // For this app we only support UTCTimestamp (number seconds) for now.
            if (typeof t !== 'number') return null;
            return { time: t, price: p };
        };

        const handlePointerDown = (e: PointerEvent) => {
            const tool = activeToolRef.current;
            if (tool !== 'lines' && tool !== 'ray' && tool !== 'horizontal-line' && tool !== 'horizontal-ray' && tool !== 'parallel-channel' && tool !== 'long-position') return;
            const { x, y } = getLocalXY(e);

            const drawingId = `drawing-${Date.now()}`;

            if (tool === 'long-position') {
                // One-click place RR box: 1% up/down, 10 bars width
                const chart = chartRef.current;
                const series = seriesRef.current;
                if (!chart || !series) return;
                
                const time = chart.timeScale().coordinateToTime(x as any) as any;
                const entryPrice = series.coordinateToPrice(y);
                if (time == null || entryPrice == null) return;

                // Calculate 1% up and down
                const stopLoss = entryPrice * 0.99; // 1% down
                const takeProfit = entryPrice * 1.01; // 1% up

                // Calculate 10 bars width - estimate based on visible time range
                const visibleRange = chart.timeScale().getVisibleRange();
                if (!visibleRange) return;
                
                let timeRange: number;
                if (typeof visibleRange.from === 'number' && typeof visibleRange.to === 'number') {
                    timeRange = visibleRange.to - visibleRange.from;
                } else {
                    // Fallback: assume 1 minute bars (60 seconds)
                    timeRange = 60 * 10; // 10 bars * 60 seconds
                }
                
                // Estimate bar width from visible range (assuming ~100 visible bars)
                // Make sure we have a minimum width
                const estimatedBarWidth = Math.max(timeRange / 100, 60); // At least 60 seconds per bar
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

                // Immediately return to navigation mode (crosshair)
                setActiveToolRefFn.current(null);
                setCurrentDrawingRefFn.current(null);
                setIsDrawingRefFn.current(false);
                isDrawing = false;
                currentDrawingRef = null;
                return;
            }

            if (tool === 'horizontal-line') {
                // One-click place horizontal line anchored to PRICE (chart-space)
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

            if (tool === 'horizontal-ray') {
                // One-click place horizontal ray from click point to right edge (chart-space)
                const chart = chartRef.current;
                const series = seriesRef.current;
                if (!chart || !series) return;
                
                const time = chart.timeScale().coordinateToTime(x as any) as any;
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

            // Lines/Ray/Parallel Channel tool: 2-click place + preview + place
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
                    style: { color: '#3b82f6', width: 3 },
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
                
                // Convert back to chart coordinates
                const start2Time = chart.timeScale().coordinateToTime(start2ScreenX as any) as any;
                const start2Price = series.coordinateToPrice(start2ScreenY);
                const end2Time = chart.timeScale().coordinateToTime(end2ScreenX as any) as any;
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

        const handlePointerMove = (e: PointerEvent) => {
            const tool = activeToolRef.current;
            if (!isDrawing || (tool !== 'lines' && tool !== 'ray' && tool !== 'parallel-channel')) return;
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
                
                // Convert back to chart coordinates (only for storage, preview uses screenPoints)
                const start2Time = chart.timeScale().coordinateToTime(start2ScreenX as any) as any;
                const start2Price = series.coordinateToPrice(start2ScreenY);
                const end2Time = chart.timeScale().coordinateToTime(end2ScreenX as any) as any;
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

        // Capture listeners on the container so we receive events without blocking chart interactions.
        // We don't preventDefault here; Lines is 2-click (no drag), Horizontal-line is one click.
        container.addEventListener('pointerdown', handlePointerDown, true);
        container.addEventListener('pointermove', handlePointerMove, true);

        return () => {
            container.removeEventListener('pointerdown', handlePointerDown, true);
            container.removeEventListener('pointermove', handlePointerMove, true);
            // Cancel any in-progress placement if tool changes / unmounts
            isDrawing = false;
            isPlacingLine = false;
            currentDrawingRef = null;
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

        const findHoveredHorizontalLineId = (localX: number, localY: number) => {
            // Only consider the plot area (exclude right axis)
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
            if (activeTool === 'lines' || activeTool === 'ray' || activeTool === 'horizontal-line' || activeTool === 'horizontal-ray' || activeTool === 'parallel-channel') return;

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
            if (!hoveredHorizontalLineHandleId) return;

            const id = hoveredHorizontalLineHandleId;
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
    }, [activeTool, hoveredHorizontalLineHandleId, drawings, setSelectedHorizontalLineId, setSelectedDrawingId, updateDrawing]);

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

        const findHoveredHorizontalRayId = (localX: number, localY: number) => {
            // Only consider the plot area (exclude right axis)
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
            if (activeTool === 'lines' || activeTool === 'ray' || activeTool === 'horizontal-line' || activeTool === 'horizontal-ray' || activeTool === 'parallel-channel') return;

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
            if (activeTool === 'lines' || activeTool === 'ray' || activeTool === 'horizontal-line' || activeTool === 'horizontal-ray' || activeTool === 'parallel-channel') return;

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
            if (activeTool === 'lines' || activeTool === 'ray' || activeTool === 'horizontal-line' || activeTool === 'horizontal-ray' || activeTool === 'parallel-channel') return;
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

        // Find which line (if any) is being hovered
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

            const thresholdPx = 8; // Distance threshold for line hover
            let bestId: string | null = null;
            let bestDist = Number.POSITIVE_INFINITY;

            for (const d of drawings) {
                if (d.type !== 'lines' && d.type !== 'ray' && d.type !== 'parallel-channel') continue;
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

        // Find which handle (start/end) is being hovered
        const findHoveredHandle = (localX: number, localY: number): string | null => {
            const series = seriesRef.current;
            const chart = chartRef.current;
            if (!series || !chart) return null;

            const handleRadius = 8; // Hit test radius for bubbles
            const squareSize = 11;
            const squareRadius = squareSize / 2 * 1.5; // Slightly larger hit area
            let bestHandle: string | null = null;
            let bestDist = Number.POSITIVE_INFINITY;

            // Check long-position RR box handles first
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
                    
                    // Top-left square (for green/take profit area)
                    const topLeftX = boxX;
                    const topLeftY = Math.min(takeProfitY, entryY);
                    const distTopLeft = Math.sqrt((localX - topLeftX) ** 2 + (localY - topLeftY) ** 2);
                    
                    // Bottom-left square (for red/stop loss area)
                    const bottomLeftX = boxX;
                    const bottomLeftY = Math.max(stopLossY, entryY);
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
                if (d.type !== 'lines' && d.type !== 'ray' && d.type !== 'parallel-channel') continue;
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

        const onPointerMove = (e: PointerEvent) => {
            // Don't do hover detection while a drawing tool is active
            if (activeTool === 'lines' || activeTool === 'ray' || activeTool === 'horizontal-line' || activeTool === 'horizontal-ray' || activeTool === 'parallel-channel' || activeTool === 'long-position') return;

            const { x, y } = getLocalXY(e);

            // Check handle first (more specific)
            const handleId = findHoveredHandle(x, y);
            setHoveredLineHandleId(handleId);

            if (handleId) {
                const lineId = handleId.split(':')[0];
                setHoveredLineId(lineId);
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
            if (activeTool === 'lines' || activeTool === 'ray' || activeTool === 'horizontal-line' || activeTool === 'horizontal-ray' || activeTool === 'parallel-channel' || activeTool === 'long-position') return;

            const { x, y } = getLocalXY(e);
            const handleId = findHoveredHandle(x, y);
            const lineId = handleId ? handleId.split(':')[0] : findHoveredLineId(x, y);

            // Check if clicking on a long-position handle
            if (handleId && (handleId.includes(':top-left') || handleId.includes(':bottom-left') || handleId.includes(':right-middle') || handleId.includes(':left-middle'))) {
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
                        // Only clear selectedDrawingId if it's currently a lines, ray, or long-position tool
                        const currentSelected = drawings.find(d => d.id === selectedDrawingId);
                        if (currentSelected?.type === 'lines' || currentSelected?.type === 'ray' || currentSelected?.type === 'long-position') {
                            setSelectedDrawingId(null);
                        }
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
        }, [drawings, activeTool, selectedDrawingId, setHoveredLineId, setHoveredLineHandleId, setSelectedLineId, setSelectedDrawingId, setSelectedHorizontalLineId]);

    // ============================================================================
    // LINES TOOL: Drag Logic
    // ============================================================================
    // Handles dragging line handles (start or end bubbles) to move that end of the line.
    // NOTE: This is isolated from other tools - editing here won't affect horizontal lines
    // NOTE: Also handles ray tool (same interaction pattern)
    // NOTE: Also handles parallel-channel (4 corners: start1, end1, start2, end2, and 2 middle squares: mid1, mid2)
    // NOTE: Also handles long-position (3 squares: top-left, bottom-left, right-middle, and 1 bubble: left-middle)
    // NOTE: Also handles line move (when clicking on line body, not handles)
    const draggingLineHandleRef = useRef<{ lineId: string; handle: 'start' | 'end' | 'start1' | 'end1' | 'start2' | 'end2' | 'mid1' | 'mid2' | 'top-left' | 'bottom-left' | 'right-middle' | 'left-middle' | 'line-move'; initialStart?: ChartPoint; initialEnd?: ChartPoint; initialClickX?: number; initialClickY?: number } | null>(null);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const getLocalXY = (e: PointerEvent) => {
            const rect = container.getBoundingClientRect();
            return { x: e.clientX - rect.left, y: e.clientY - rect.top };
        };

        const screenToChart = (x: number, y: number): ChartPoint | null => {
            const chart = chartRef.current;
            const series = seriesRef.current;
            if (!chart || !series) return null;

            const t = chart.timeScale().coordinateToTime(x as any) as any;
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

        const findHoveredLineIdLocal = (localX: number, localY: number): string | null => {
            const series = seriesRef.current;
            const chart = chartRef.current;
            if (!series || !chart) return null;

            const thresholdPx = 8;
            let bestId: string | null = null;
            let bestDist = Number.POSITIVE_INFINITY;

            for (const d of drawings) {
                if (d.type !== 'lines' && d.type !== 'ray') continue;
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
                    const unitX = dx / Math.sqrt(lengthSq);
                    const unitY = dy / Math.sqrt(lengthSq);
                    const t = ((localX - start.x) * unitX + (localY - start.y) * unitY);
                    if (t < 0) continue;
                    const projX = start.x + t * unitX;
                    const projY = start.y + t * unitY;
                    dist = Math.sqrt((localX - projX) ** 2 + (localY - projY) ** 2);
                } else {
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

        const findHoveredHandleLocal = (localX: number, localY: number): string | null => {
            const series = seriesRef.current;
            const chart = chartRef.current;
            if (!series || !chart) return null;

            const handleRadius = 8;
            let bestHandle: string | null = null;
            let bestDist = Number.POSITIVE_INFINITY;

            for (const d of drawings) {
                if (d.type !== 'lines' && d.type !== 'ray') continue;
                if (d.hidden) continue;
                if (!d.points || d.points.length < 2) continue;

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

            return bestHandle;
        };

        const startDrag = (e: PointerEvent) => {
            // don't interfere with drawing tools
            if (activeTool === 'lines' || activeTool === 'ray' || activeTool === 'horizontal-line' || activeTool === 'horizontal-ray' || activeTool === 'parallel-channel' || activeTool === 'long-position') return;
            
            const { x, y } = getLocalXY(e);
            const handleId = findHoveredHandleLocal(x, y);
            const lineId = handleId ? handleId.split(':')[0] : findHoveredLineIdLocal(x, y);
            
            // Check if clicking on a line body (not on handles) - start line move
            if (!handleId && lineId) {
                const clickedDrawing = drawings.find(d => d.id === lineId);
                if (clickedDrawing?.type === 'lines' && clickedDrawing.points && clickedDrawing.points.length >= 2 && !clickedDrawing.locked) {
                    // Store initial points and click position for line move
                    draggingLineHandleRef.current = {
                        lineId,
                        handle: 'line-move',
                        initialStart: clickedDrawing.points[0],
                        initialEnd: clickedDrawing.points[1],
                        initialClickX: x,
                        initialClickY: y,
                    };
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
            }
            
            if (!handleId) return;

            const parts = handleId.split(':');
            const handleLineId = parts[0];
            const handle = parts[1] as 'start' | 'end' | 'start1' | 'end1' | 'start2' | 'end2' | 'mid1' | 'mid2' | 'top-left' | 'bottom-left' | 'right-middle' | 'left-middle';
            const targetDrawing = drawings.find((d) => d.id === handleLineId);
            if (!targetDrawing || targetDrawing.locked) return;

            draggingLineHandleRef.current = { lineId: handleLineId, handle };
            setSelectedLineId(handleLineId);
            setSelectedDrawingId(handleLineId);

            try {
                container.setPointerCapture(e.pointerId);
            } catch {
                // ignore
            }
            e.preventDefault();
        };

        // Update immediately for responsive dragging
        const onMove = (e: PointerEvent) => {
            const drag = draggingLineHandleRef.current;
            if (!drag) return;

            const { x, y } = getLocalXY(e);
            
            // Handle long-position RR box handles
            if (drag.handle === 'top-left' || drag.handle === 'bottom-left' || drag.handle === 'right-middle' || drag.handle === 'left-middle') {
                const chart = chartRef.current;
                const series = seriesRef.current;
                if (!chart || !series) return;
                
                updateDrawing(drag.lineId, (prev) => {
                    if (prev.type === 'long-position' && prev.entryPrice != null && prev.stopLoss != null && prev.takeProfit != null && prev.startTime != null && prev.endTime != null) {
                        if (drag.handle === 'top-left') {
                            // Drag top-left: adjust take profit (green area height)
                            const newTakeProfit = series.coordinateToPrice(y);
                            if (newTakeProfit != null && newTakeProfit > prev.entryPrice) {
                                return { ...prev, takeProfit: newTakeProfit };
                            }
                        } else if (drag.handle === 'bottom-left') {
                            // Drag bottom-left: adjust stop loss (red area height)
                            const newStopLoss = series.coordinateToPrice(y);
                            if (newStopLoss != null && newStopLoss < prev.entryPrice) {
                                return { ...prev, stopLoss: newStopLoss };
                            }
                        } else if (drag.handle === 'right-middle') {
                            // Drag right-middle: adjust box width
                            const newEndTime = chart.timeScale().coordinateToTime(x as any) as any;
                            if (newEndTime != null && newEndTime > prev.startTime) {
                                return { ...prev, endTime: newEndTime };
                            }
                        } else if (drag.handle === 'left-middle') {
                            // Drag left-middle: adjust both startTime (horizontal) and entryPrice (vertical)
                            // Keep uppermost green border (takeProfit) and lowermost red border (stopLoss) fixed
                            // Only the entry price (black line) moves up/down, and width changes
                            const newStartTime = chart.timeScale().coordinateToTime(x as any) as any;
                            const newEntryPrice = series.coordinateToPrice(y);
                            
                            if (newStartTime != null && newEntryPrice != null && newStartTime < prev.endTime) {
                                // Keep takeProfit and stopLoss fixed, only update entryPrice and startTime
                                return {
                                    ...prev,
                                    startTime: newStartTime,
                                    entryPrice: newEntryPrice,
                                    // takeProfit and stopLoss remain unchanged
                                };
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
            
            // Handle line-move case first (before converting to chart coordinates)
            if (drag.handle === 'line-move' && drag.initialStart && drag.initialEnd && drag.initialClickX != null && drag.initialClickY != null) {
                const chart = chartRef.current;
                const series = seriesRef.current;
                if (!chart || !series) return;
                
                // Move threshold check
                const moveThreshold = 3; // pixels
                const dx = Math.abs(x - drag.initialClickX);
                const dy = Math.abs(y - drag.initialClickY);
                
                if (dx < moveThreshold && dy < moveThreshold) {
                    // User hasn't moved enough, don't update yet
                    return;
                }
                
                // Calculate screen space delta (works even when mouse is outside container)
                const screenDeltaX = x - drag.initialClickX;
                const screenDeltaY = y - drag.initialClickY;
                
                // Get visible ranges to convert screen delta to chart delta
                const visibleRange = chart.timeScale().getVisibleRange();
                const rect = container.getBoundingClientRect();
                
                if (visibleRange && rect.width > 0 && rect.height > 0) {
                    const timeRange = typeof visibleRange.to === 'number' && typeof visibleRange.from === 'number' 
                        ? visibleRange.to - visibleRange.from 
                        : 0;
                    
                    // Get price range from visible coordinates
                    const topY = 0;
                    const bottomY = rect.height;
                    const topPrice = series.coordinateToPrice(topY);
                    const bottomPrice = series.coordinateToPrice(bottomY);
                    
                    if (topPrice != null && bottomPrice != null && timeRange > 0) {
                        const priceRange = Math.abs(topPrice - bottomPrice);
                        
                        // Convert screen delta to chart delta (proportional to visible range)
                        // This works even when mouse is outside container bounds
                        const timeDelta = (screenDeltaX / rect.width) * timeRange;
                        const priceDelta = -(screenDeltaY / rect.height) * priceRange; // Negative because Y is inverted
                        
                        updateDrawing(drag.lineId, (prev) => {
                            if ((prev.type === 'lines' || prev.type === 'ray') && prev.points && prev.points.length >= 2 && drag.initialStart && drag.initialEnd) {
                                const newPoints = [...prev.points];
                                // Apply delta to both points
                                newPoints[0] = {
                                    time: drag.initialStart.time + timeDelta,
                                    price: drag.initialStart.price + priceDelta,
                                };
                                newPoints[1] = {
                                    time: drag.initialEnd.time + timeDelta,
                                    price: drag.initialEnd.price + priceDelta,
                                };
                                return { ...prev, points: newPoints };
                            }
                            return prev;
                        });
                        return;
                    }
                }
                
                // Fallback: try direct coordinate conversion if proportional method fails
                const rect2 = container.getBoundingClientRect();
                const clampedX = Math.max(0, Math.min(x, rect2.width));
                const clampedY = Math.max(0, Math.min(y, rect2.height));
                
                const currentPoint = screenToChart(clampedX, clampedY);
                if (!currentPoint) return;
                
                const initialClampedX = Math.max(0, Math.min(drag.initialClickX, rect2.width));
                const initialClampedY = Math.max(0, Math.min(drag.initialClickY, rect2.height));
                const initialClickTime = chart.timeScale().coordinateToTime(initialClampedX as any) as any;
                const initialClickPrice = series.coordinateToPrice(initialClampedY);
                
                if (initialClickTime == null || initialClickPrice == null) return;
                
                const timeDelta = currentPoint.time - initialClickTime;
                const priceDelta = currentPoint.price - initialClickPrice;
                
                updateDrawing(drag.lineId, (prev) => {
                    if ((prev.type === 'lines' || prev.type === 'ray') && prev.points && prev.points.length >= 2 && drag.initialStart && drag.initialEnd) {
                        const newPoints = [...prev.points];
                        // Apply delta to both points
                        newPoints[0] = {
                            time: drag.initialStart.time + timeDelta,
                            price: drag.initialStart.price + priceDelta,
                        };
                        newPoints[1] = {
                            time: drag.initialEnd.time + timeDelta,
                            price: drag.initialEnd.price + priceDelta,
                        };
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
                } else if ((prev.type === 'lines' || prev.type === 'ray') && prev.points && prev.points.length >= 2) {
                    // Lines/Ray: simple update
                    const newPoints = [...prev.points];
                    if (drag.handle === 'start') {
                        newPoints[0] = newPoint;
                    } else if (drag.handle === 'end') {
                        newPoints[1] = newPoint;
                    } else if (drag.handle === 'line-move' && drag.initialStart && drag.initialEnd && drag.initialClickX != null && drag.initialClickY != null) {
                        // Move entire line: calculate delta from initial click position
                        const moveThreshold = 3; // pixels
                        const dx = Math.abs(x - drag.initialClickX);
                        const dy = Math.abs(y - drag.initialClickY);
                        
                        if (dx < moveThreshold && dy < moveThreshold) {
                            // User hasn't moved enough, don't update yet
                            return prev;
                        }
                        
                        // Convert initial click position to chart coordinates
                        const chart = chartRef.current;
                        const series = seriesRef.current;
                        if (!chart || !series) return prev;
                        
                        const initialClickTime = chart.timeScale().coordinateToTime(drag.initialClickX as any) as any;
                        const initialClickPrice = series.coordinateToPrice(drag.initialClickY);
                        
                        if (initialClickTime == null || initialClickPrice == null) return prev;
                        
                        // Calculate delta in chart coordinates
                        const timeDelta = newPoint.time - initialClickTime;
                        const priceDelta = newPoint.price - initialClickPrice;
                        
                        // Apply delta to both points
                        newPoints[0] = {
                            time: drag.initialStart.time + timeDelta,
                            price: drag.initialStart.price + priceDelta,
                        };
                        newPoints[1] = {
                            time: drag.initialEnd.time + timeDelta,
                            price: drag.initialEnd.price + priceDelta,
                        };
                    }
                    return { ...prev, points: newPoints };
                }
                return prev;
            });
        };

        const stop = () => {
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
        
        if (activeTool === 'lines' || activeTool === 'ray' || activeTool === 'horizontal-line' || activeTool === 'horizontal-ray' || activeTool === 'parallel-channel') {
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
            // White hand cursor (grab) when hovering lines or ray tools
            cursorStyle = 'grab';
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

    return (
        <div className="relative w-full h-full bg-white overflow-hidden">
            <div ref={containerRef} style={{ position: 'relative', width: '100%', height: '100%' }} />
            <div
                ref={interactionLayerRef}
                className="absolute inset-0 z-50"
                style={{
                    // Keep this non-interactive; drawing uses container capture listeners.
                    pointerEvents: 'none',
                }}
            />
            <DrawingOverlay chart={chartApi} series={seriesApi} containerRef={containerRef} />
        </div>
    );
}
