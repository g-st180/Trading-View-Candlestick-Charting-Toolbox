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

    // Cleanup all price lines on unmount
    useEffect(() => {
        return () => {
            const series = seriesRef.current as any;
            const map = horizontalPriceLinesRef.current;
            if (!series) return;
            for (const [, priceLine] of map.entries()) {
                try {
                    series.removePriceLine?.(priceLine);
                } catch {
                    // ignore
                }
            }
            map.clear();
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

    // Drawing: use container-level capture listeners so the chart remains interactive.
    useEffect(() => {
        if (!containerRef.current || !chartRef.current) return;

        const container = containerRef.current;
        // Keep these as refs so they survive re-renders.
        let isDrawing = false;
        let currentDrawingRef: Drawing | null = null;
        let isPlacingLine = false;

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
            if (tool !== 'lines' && tool !== 'horizontal-line') return;
            const { x, y } = getLocalXY(e);

            const drawingId = `drawing-${Date.now()}`;

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

            // Lines tool: 2-click place + preview + place
            if (!isPlacingLine) {
                const startPt = screenToChart(x, y);
                if (!startPt) return;
                isPlacingLine = true;
                isDrawing = true;
                setIsDrawingRefFn.current(true);
                currentDrawingRef = {
                    id: drawingId,
                    type: 'lines',
                    // chart-space points so it stays anchored to candles on pan/zoom
                    points: [startPt],
                    style: { color: '#3b82f6', width: 3 },
                };
                setCurrentDrawingRefFn.current(currentDrawingRef);
                return;
            }

            // Second click: commit at current cursor position
            const endPt = screenToChart(x, y);
            if (!endPt) return;
            if (!currentDrawingRef?.points?.length) return;
            currentDrawingRef = {
                ...currentDrawingRef,
                points: [currentDrawingRef.points[0], endPt],
            };
            addDrawingRefFn.current(currentDrawingRef);
            setCurrentDrawingRefFn.current(null);
            setIsDrawingRefFn.current(false);
            isDrawing = false;
            isPlacingLine = false;
            currentDrawingRef = null;
        };

        const handlePointerMove = (e: PointerEvent) => {
            const tool = activeToolRef.current;
            if (!isDrawing || tool !== 'lines') return;
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

    // Hover + select behavior for horizontal lines:
    // - Hover over a horizontal line: show the right-side square
    // - Click on a horizontal line: keep the square visible (selected)
    // - Click anywhere else (chart or outside): clear selection
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
            if (activeTool === 'lines' || activeTool === 'horizontal-line') return;

            const { x, y } = getLocalXY(e);
            const hoveredId = findHoveredHorizontalLineId(x, y);
            if (hoveredId) {
                setSelectedHorizontalLineId(hoveredId);
                setSelectedDrawingId(hoveredId);
            } else {
                setSelectedHorizontalLineId(null);
                setSelectedDrawingId(null);
            }
        };

        const onDocumentPointerDown = (e: PointerEvent) => {
            // Click outside the chart clears selection
            const target = e.target as HTMLElement | null;
            if (!target) return;

            // If the click is inside the left toolbar, don't clear selection.
            if (target.closest('[data-left-toolbar="true"]')) return;

            if (!container.contains(target)) {
                setSelectedHorizontalLineId(null);
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
        setHoveredHorizontalLineId,
        setHoveredHorizontalLineHandleId,
        setSelectedHorizontalLineId,
        setSelectedDrawingId,
    ]);

    // Drag horizontal line by the handle square (document-level move to avoid hover/pointer-events jitter)
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

    // Update cursor for drawing tools and crosshair
    useEffect(() => {
        if (!containerRef.current) return;
        
        const chartContainer = containerRef.current;
        const interactionLayer = interactionLayerRef.current;
        let cursorStyle = 'default';
        
        if (activeTool === 'lines' || activeTool === 'horizontal-line') {
            cursorStyle = 'crosshair';
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
    }, [crosshairType, activeTool, hoveredHorizontalLineId, hoveredHorizontalLineHandleId]);

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
