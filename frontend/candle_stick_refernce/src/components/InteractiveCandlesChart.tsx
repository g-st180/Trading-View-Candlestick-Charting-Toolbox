import { useEffect, useRef, useState } from 'react';
import { createChart, IChartApi, ISeriesApi, CandlestickData, Time } from 'lightweight-charts';
import { useDashboardStore, TradeItem } from '../state/dashboardStore';

function toMs(input: any): number | null {
    if (typeof input === 'number') {
        return input > 1e12 ? input : input * 1000;
    }
    if (typeof input === 'string') {
        const utcInput = input.endsWith('Z') ? input : input + 'Z';
        const d = new Date(utcInput);
        if (!isNaN(d.getTime())) return d.getTime();
    }
    return null;
}


// Static snap policy: 'pre' => ceil to next boundary, 'post' => floor to previous boundary
const SNAP_POLICY: 'pre' | 'post' = 'post';

// Helpers to snap times to timeframe boundaries
function timeframeToSeconds(tf: string): number {
    if (!tf) return 60; // default 1Min
    if (tf.endsWith('Min')) return Math.max(1, Number(tf.replace('Min', ''))) * 60;
    if (tf.endsWith('Hour')) return Math.max(1, Number(tf.replace('Hour', ''))) * 3600;
    if (tf.endsWith('Day')) return Math.max(1, Number(tf.replace('Day', ''))) * 86400;
    return 60;
}
function floorToFrame(sec: number, frameSec: number): number {
    return Math.floor(sec / frameSec) * frameSec;
}
function ceilToFrame(sec: number, frameSec: number): number {
    return Math.ceil(sec / frameSec) * frameSec;
}

export default function InteractiveCandlesChart(): JSX.Element {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const lineCanvasRef = useRef<HTMLCanvasElement | null>(null); // behind-candles canvas
    const tooltipRef = useRef<HTMLDivElement | null>(null); // crosshair tooltip
    const chartRef = useRef<IChartApi | null>(null);
    const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
    const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
    const rafRef = useRef<number | null>(null);
    
    const [candles, setCandles] = useState<CandlestickData[]>([]);
    const [trades, setTrades] = useState<TradeItem[]>([]);
    const [error, setError] = useState<string | null>(null);
    const { selectedSymbol, dashboardStart, dashboardEnd, ohlcvTimeframe, selectedDirection, selectedExperimentId } = useDashboardStore();
    
    // State to track which trades are hidden (by trade index)
    const [hiddenTrades, setHiddenTrades] = useState<Set<number>>(new Set());
    
    // Function to toggle trade visibility
    const toggleTradeVisibility = (tradeIndex: number) => {
        setHiddenTrades(prev => {
            const newSet = new Set(prev);
            if (newSet.has(tradeIndex)) {
                newSet.delete(tradeIndex);
            } else {
                newSet.add(tradeIndex);
            }
            return newSet;
        });
    };

    // NEW: custom RR box API state
    const [customBox, setCustomBox] = useState<{ startSec: number; endSec: number; high: number; low: number } | null>(null);
    // NEW: lightweight real-time refresh tick
    const [refreshTick, setRefreshTick] = useState(0);

    // Expose simple global API for drawing/clearing a custom box
    useEffect(() => {
        function toSecondsUTC(input: any): number | null {
            if (typeof input === 'number') {
                // assume ms if big, else seconds
                return input > 1e12 ? Math.floor(input / 1000) : input;
            }
            if (typeof input === 'string') {
                // ensure UTC parsing
                const withZ = input.endsWith('Z') ? input : input + 'Z';
                const t = Date.parse(withZ);
                return isNaN(t) ? null : Math.floor(t / 1000);
            }
            return null;
        }
        (window as any).drawRRBox = (params: { start: any; end: any; high: number; low: number }) => {
            const startSec = toSecondsUTC(params.start);
            const endSec = toSecondsUTC(params.end);
            if (startSec == null || endSec == null) {
                console.warn('drawRRBox: invalid start/end time');
                return;
            }
            setCustomBox({ startSec, endSec, high: Number(params.high), low: Number(params.low) });
        };
        (window as any).clearRRBox = () => setCustomBox(null);
        return () => {
            delete (window as any).drawRRBox;
            delete (window as any).clearRRBox;
        };
    }, []);

    // Create chart + series
    useEffect(() => {
        if (!containerRef.current) return;
        const chart = createChart(containerRef.current, {
            width: containerRef.current.clientWidth,
            height: 500,
            layout: { background: { color: '#000000' }, textColor: '#9ca3af' },
            grid: { vertLines: { color: 'rgba(6, 182, 212, 0.15)' }, horzLines: { color: 'rgba(6, 182, 212, 0.15)' } },
            timeScale: { 
                rightOffset: 10,
                borderColor: 'rgba(6, 182, 212, 0.3)',
                timeVisible: true,
            },
            rightPriceScale: {
                borderColor: 'rgba(6, 182, 212, 0.3)',
            },
            crosshair: {
                mode: 0, // Normal crosshair mode (always visible when hovering anywhere)
                vertLine: {
                    width: 1,
                    color: 'rgba(6, 182, 212, 0.5)',
                    style: 2, // Dashed line
                },
                horzLine: {
                    width: 1,
                    color: 'rgba(6, 182, 212, 0.5)',
                    style: 2, // Dashed line
                },
            },
        });

        const candleSeries = chart.addCandlestickSeries({
            upColor: '#10b981', downColor: '#ef4444', borderDownColor: '#ef4444',
            borderUpColor: '#10b981', wickDownColor: '#ef4444', wickUpColor: '#10b981',
        });
        // Add volume histogram on separate price scale at bottom
        const volumeSeries = chart.addHistogramSeries({
            priceScaleId: 'volume',
            priceFormat: { type: 'volume' },
            color: 'rgba(6, 182, 212, 0.4)'
        });

        // Allocate vertical space: candles top ~75%, volume bottom ~20%
        try {
            chart.priceScale('right').applyOptions({ scaleMargins: { top: 0.05, bottom: 0.25 } });
            chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
        } catch {}

        chartRef.current = chart;
        seriesRef.current = candleSeries;
        volumeSeriesRef.current = volumeSeries;

        // Create a behind-candles canvas inside chart element
        const chartEl = (chart as any).chartElement ? (chart as any).chartElement() : (chart as any)._chartElement;
        if (chartEl && !lineCanvasRef.current) {
            const lc = document.createElement('canvas');
            lc.style.position = 'absolute';
            lc.style.top = '0';
            lc.style.left = '0';
            lc.style.width = '100%';
            lc.style.height = '100%';
            lc.style.pointerEvents = 'none';
            lc.style.zIndex = '1'; // above background, below series
            chartEl.appendChild(lc);
            lineCanvasRef.current = lc as HTMLCanvasElement;
        }
        // Create tooltip overlay (above everything)
        if (containerRef.current && !tooltipRef.current) {
            const tip = document.createElement('div');
            tip.style.position = 'absolute';
            tip.style.zIndex = '30';
            tip.style.pointerEvents = 'none';
            tip.style.padding = '2px 6px';
            tip.style.borderRadius = '4px';
            tip.style.background = 'rgba(0,0,0,0.9)';
            tip.style.color = '#e5e7eb';
            tip.style.border = '1px solid rgba(6, 182, 212, 0.3)';
            tip.style.font = '12px system-ui, Arial';
            tip.style.display = 'none';
            containerRef.current.appendChild(tip);
            tooltipRef.current = tip;
        }

        // Do not auto-fit; preserve viewport

        return () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
            // Remove line canvas
            if (lineCanvasRef.current && lineCanvasRef.current.parentElement) {
                lineCanvasRef.current.parentElement.removeChild(lineCanvasRef.current);
                lineCanvasRef.current = null;
            }
            // Remove tooltip
            if (tooltipRef.current && tooltipRef.current.parentElement) {
                tooltipRef.current.parentElement.removeChild(tooltipRef.current);
                tooltipRef.current = null;
            }
            chart.remove();
        };
    }, [selectedSymbol]); // Recreate chart when symbol changes to reset scale

    // Data Fetching
    useEffect(() => {
        const chart = chartRef.current;
        const series = seriesRef.current;
        const volumeSeries = volumeSeriesRef.current;
        if (!chart || !series || !volumeSeries) return;

        const fetchData = async () => {
            if (!selectedSymbol || selectedSymbol === 'ALL' || !dashboardStart || !dashboardEnd) {
                series.setData([]);
                volumeSeries.setData([] as any);
                setTrades([]);
                setCandles([]);
                setError('Please select a symbol and a date range.');
                return;
            }
            setError(null);
            
            const params = new URLSearchParams({
                ticker: selectedSymbol,
                start_date: dashboardStart,
                end_date: dashboardEnd,
                timeframe: ohlcvTimeframe,
            });
            
            // Add direction filter for trades
            const tradesParams = new URLSearchParams(params);
            if (selectedDirection && selectedDirection !== 'ALL') {
                tradesParams.set('direction', selectedDirection);
            }
            if (selectedExperimentId && selectedExperimentId !== 'ALL') {
                tradesParams.set('experiment_id', selectedExperimentId);
            }

            try {
                const [ohlcvRes, tradesRes] = await Promise.all([
                    fetch(`/api/ohlcv?${params.toString()}`),
                    fetch(`/api/all_trades?${tradesParams.toString()}`),
                ]);

                if (!ohlcvRes.ok) throw new Error((await ohlcvRes.json()).error || 'Failed to fetch OHLCV data');
                if (!tradesRes.ok) throw new Error((await tradesRes.json()).error || 'Failed to fetch trades data');

                const ohlcvData = await ohlcvRes.json();
                const tradesData = await tradesRes.json();

                const formattedCandles: CandlestickData<Time>[] = ohlcvData.map((d: any) => ({
                    time: (new Date(d.timestamp).getTime() / 1000) as Time,
                    open: d.open, high: d.high, low: d.low, close: d.close,
                }));

                // Volume histogram data (color by up/down)
                const formattedVolume: any[] = ohlcvData.map((d: any) => ({
                    time: (new Date(d.timestamp).getTime() / 1000) as Time,
                    value: Number(d.volume) || 0,
                    color: d.close >= d.open ? 'rgba(16, 185, 129, 0.5)' : 'rgba(239, 68, 68, 0.5)'
                }));

                const formattedTrades: TradeItem[] = (tradesData || []).map((r: any) => ({
                    entryTs: toMs(r.entry_time),
                    exitTs: toMs(r.exit_time),
                    entryPrice: r.entry_price != null ? Number(r.entry_price) : undefined,
                    exitPrice: r.exit_price != null ? Number(r.exit_price) : undefined,
                    sl: r.stop_loss_price != null ? Number(r.stop_loss_price) : (r.sl != null ? Number(r.sl) : undefined),
                    tp: r.take_profit_price != null ? Number(r.take_profit_price) : (r.tp != null ? Number(r.tp) : undefined),
                    direction: r.direction,
                    exitReason: r.exit_reason,
                }));
                
                series.setData(formattedCandles);
                volumeSeries.setData(formattedVolume as any);
                setCandles(formattedCandles);
                setTrades(formattedTrades);
                // Do not call fitContent() here; preserve user's current viewport/axis state

            } catch (e: any) {
                console.error("Failed to fetch chart data", e);
                setError(e.message || "An unexpected error occurred.");
                series.setData([]);
                setTrades([]);
                setCandles([]);
            }
        };
        fetchData();
    }, [selectedSymbol, dashboardStart, dashboardEnd, ohlcvTimeframe, selectedDirection, refreshTick]);

    // Canvas size & scaling
    useEffect(() => {
        if (!containerRef.current || !canvasRef.current) return;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        
        const resizeCanvas = () => {
            const rect = containerRef.current!.getBoundingClientRect();
            const dpr = window.devicePixelRatio || 1;
            canvas.style.width = `${rect.width}px`;
            canvas.style.height = `${rect.height}px`;
            canvas.width = Math.round(rect.width * dpr);
            canvas.height = Math.round(rect.height * dpr);
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        };
        resizeCanvas();
        
        const ro = new ResizeObserver(resizeCanvas);
        ro.observe(containerRef.current);
        
        return () => ro.disconnect();
    }, []);

    // Draw routine (hardcoded pink box anchored to visible range)
    useEffect(() => {
        const chart = chartRef.current;
        const series = seriesRef.current;
        const canvas = canvasRef.current;
        if (!chart || !series || !canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const lctx = lineCanvasRef.current?.getContext('2d') || null;

        let isDragging = false;
        let pendingDraw = false;

        const drawImmediate = () => {
            const cssWidth = canvas.clientWidth;
            const cssHeight = canvas.clientHeight;
            ctx.clearRect(0, 0, cssWidth, cssHeight);
            if (lineCanvasRef.current && lctx) {
                // sync DPR and size for line canvas
                const dpr = window.devicePixelRatio || 1;
                const rect = canvas.getBoundingClientRect();
                lineCanvasRef.current.style.width = `${rect.width}px`;
                lineCanvasRef.current.style.height = `${rect.height}px`;
                lineCanvasRef.current.width = Math.round(rect.width * dpr);
                lineCanvasRef.current.height = Math.round(rect.height * dpr);
                lctx.setTransform(dpr, 0, 0, dpr, 0, 0);
                lctx.clearRect(0, 0, rect.width, rect.height);
            }

            const len = candles.length;
            const last = candles[len - 1];
            if (!last) return;

                // Draw live trade rectangles (if any) with snapped x-coordinates
                if (trades.length > 0) {
                    const frameSec = timeframeToSeconds(ohlcvTimeframe);
                    trades.forEach((trade, tradeIndex) => {
                        if (!trade.entryTs || !trade.exitTs || !trade.entryPrice) return;
                        
                        // Skip hidden trades
                        if (hiddenTrades.has(tradeIndex)) return;

                        const yEntry = series.priceToCoordinate(trade.entryPrice);
                        const ySL = trade.sl != null ? series.priceToCoordinate(trade.sl) : null;
                        const yTP = trade.tp != null ? series.priceToCoordinate(trade.tp) : null;

                        const entrySec = trade.entryTs / 1000;
                        const exitSec = trade.exitTs / 1000;
                        let snappedEntry = SNAP_POLICY === 'pre' ? ceilToFrame(entrySec, frameSec) : floorToFrame(entrySec, frameSec);
                        let snappedExit = SNAP_POLICY === 'pre' ? ceilToFrame(exitSec, frameSec) : floorToFrame(exitSec, frameSec);
                        if (snappedExit <= snappedEntry) snappedExit = snappedEntry + frameSec; // ensure span

                        const x1raw = chart.timeScale().timeToCoordinate(snappedEntry as unknown as Time);
                        const x2raw = chart.timeScale().timeToCoordinate(snappedExit as unknown as Time);

                        // Skip drawing if both timestamps are outside the visible range
                        if (x1raw === null && x2raw === null) return;

                        const xStart = typeof x1raw === 'number' ? x1raw : 0;
                        const xEnd = typeof x2raw === 'number' ? x2raw : cssWidth;
                        let rxBase = Math.min(xStart, xEnd);
                        let rwBase = Math.max(1, Math.abs(xEnd - xStart));
                        if (rwBase <= 1) {
                            rwBase = 10;
                            rxBase = (x1raw || x2raw || 0) - rwBase / 2;
                        }

                        const yEntryClamped = typeof yEntry === 'number' ? Math.max(0, Math.min(cssHeight, yEntry)) : null;
                        const ySLClamped = typeof ySL === 'number' ? Math.max(0, Math.min(cssHeight, ySL)) : null;
                        const yTPClamped = typeof yTP === 'number' ? Math.max(0, Math.min(cssHeight, yTP)) : null;

                        // Risk (entry ↔ SL) in red (behind-candles line drawn separately)
                        if (yEntryClamped !== null && ySLClamped !== null) {
                            const ry = Math.min(yEntryClamped, ySLClamped);
                            const rh = Math.max(1, Math.abs(ySLClamped - yEntryClamped));
                            ctx.fillStyle = 'rgba(239, 83, 80, 0.25)';
                            ctx.fillRect(rxBase, ry, rwBase, rh);
                        }

                        // Reward (entry ↔ TP) in green
                        if (yEntryClamped !== null && yTPClamped !== null) {
                            const gy = Math.min(yEntryClamped, yTPClamped);
                            const gh = Math.max(1, Math.abs(yTPClamped - yEntryClamped));
                            // dark green (forest green-ish)
                            ctx.fillStyle = 'rgba(34, 139, 34, 0.24)';
                            ctx.fillRect(rxBase, gy, rwBase, gh);
                        }


                        // Draw dotted arrow from entry price to exit price
                        if (lctx && yEntryClamped !== null && trade.exitPrice != null && rwBase > 0) {
                            const yExitPrice = series.priceToCoordinate(trade.exitPrice);
                            const yExitClamped = typeof yExitPrice === 'number' ? Math.max(0, Math.min(cssHeight, yExitPrice)) : null;
                            
                            if (yExitClamped !== null) {
                                // Draw dotted line
                                lctx.strokeStyle = 'rgba(40, 40, 40, 0.9)';
                                lctx.lineWidth = 0.8;
                                lctx.setLineDash([3, 3]); // Dotted line pattern
                                lctx.beginPath();
                                lctx.moveTo(rxBase, yEntryClamped);
                                lctx.lineTo(rxBase + rwBase, yExitClamped);
                                lctx.stroke();
                                lctx.setLineDash([]); // Reset to solid line
                                
                                // Draw arrowhead at exit price
                                const arrowSize = 6;
                                const arrowX = rxBase + rwBase;
                                const dx = rwBase;
                                const dy = yExitClamped - yEntryClamped;
                                const angle = Math.atan2(dy, dx);
                                
                                lctx.fillStyle = 'rgba(40, 40, 40, 0.9)';
                                lctx.beginPath();
                                lctx.moveTo(arrowX, yExitClamped);
                                lctx.lineTo(
                                    arrowX - arrowSize * Math.cos(angle - Math.PI / 6),
                                    yExitClamped - arrowSize * Math.sin(angle - Math.PI / 6)
                                );
                                lctx.lineTo(
                                    arrowX - arrowSize * Math.cos(angle + Math.PI / 6),
                                    yExitClamped - arrowSize * Math.sin(angle + Math.PI / 6)
                                );
                                lctx.closePath();
                                lctx.fill();
                            }
                        }

                        // Profit % and Exit Reason labels shown above the boxes
                        if (trade.exitPrice != null && trade.entryPrice != null && rwBase > 0) {
                            const pnl = trade.direction === 'short'
                                ? (trade.entryPrice - trade.exitPrice)
                                : (trade.exitPrice - trade.entryPrice);
                            const pct = (pnl / trade.entryPrice) * 100;
                            const pctLabel = `${pct.toFixed(2)}%`;
                            const exitReasonLabel = trade.exitReason ? String(trade.exitReason) : '';

                            // Determine top Y of combined boxes
                            let topY = yEntryClamped ?? 0;
                            if (ySLClamped != null) topY = Math.min(topY, ySLClamped);
                            if (yTPClamped != null) topY = Math.min(topY, yTPClamped);
                            topY = Math.max(8, topY - 6); // offset slightly above

                            const centerX = rxBase + rwBase / 2;
                            const rightX = rxBase + rwBase - 4; // Right edge with small padding

                            // Calculate dynamic font sizes based on box dimensions
                            const boxHeight = Math.abs((yTPClamped ?? yEntryClamped ?? 0) - (ySLClamped ?? yEntryClamped ?? 0));
                            const minDimension = Math.min(rwBase, boxHeight);
                            const profitFontSize = Math.max(8, Math.min(14, minDimension / 15));
                            const exitReasonFontSize = Math.max(7, Math.min(12, minDimension / 18));

                            ctx.save();
                            ctx.font = `${profitFontSize}px system-ui, Arial`;
                            ctx.textBaseline = 'bottom';
                            ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
                            
                            // Draw profit % (centered)
                            ctx.textAlign = 'center';
                            ctx.fillText(pctLabel, centerX, topY);
                            
                            // Draw exit reason on the right side, same line as profit %
                            if (exitReasonLabel) {
                                ctx.font = `${exitReasonFontSize}px system-ui, Arial`;
                                ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
                                ctx.textAlign = 'right';
                                ctx.fillText(exitReasonLabel, rightX, topY);
                            }
                            
                            ctx.restore();
                        }
                        
                        // Draw eye icon in top-left corner of RR box
                        if (rwBase > 0) {
                            const eyeSize = 12;
                            const eyeX = rxBase + 2; // Small margin from left edge
                            const eyeY = Math.min(yEntryClamped || 0, ySLClamped || 0, yTPClamped || 0) + 2; // Small margin from top edge
                            
                            // Only draw if eye icon is within visible area
                            if (eyeY >= 0 && eyeY <= cssHeight && eyeX >= 0 && eyeX <= cssWidth) {
                                ctx.save();
                                
                                // Draw eye icon background circle
                                ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
                                ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
                                ctx.lineWidth = 1;
                                ctx.beginPath();
                                ctx.arc(eyeX + eyeSize/2, eyeY + eyeSize/2, eyeSize/2, 0, 2 * Math.PI);
                                ctx.fill();
                                ctx.stroke();
                                
                                // Draw eye icon (open or closed based on visibility)
                                ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
                                ctx.lineWidth = 1.5;
                                ctx.beginPath();
                                
                                if (hiddenTrades.has(tradeIndex)) {
                                    // Draw closed eye (line through)
                                    ctx.moveTo(eyeX + 2, eyeY + eyeSize/2);
                                    ctx.lineTo(eyeX + eyeSize - 2, eyeY + eyeSize/2);
                                } else {
                                    // Draw open eye
                                    ctx.arc(eyeX + eyeSize/2, eyeY + eyeSize/2, eyeSize/3, 0, 2 * Math.PI);
                                }
                                
                                ctx.stroke();
                                ctx.restore();
                            }
                        }
                    });
                }
        };

        // Wrapper that uses immediate draw during dragging, RAF otherwise
        const draw = () => {
            if (isDragging) {
                // During dragging, draw immediately for instant response
                drawImmediate();
                pendingDraw = false;
            } else {
                // When not dragging, use RAF to batch updates
                if (pendingDraw) return; // Already queued
                pendingDraw = true;
                if (rafRef.current) cancelAnimationFrame(rafRef.current);
                rafRef.current = requestAnimationFrame(() => {
                    pendingDraw = false;
                    drawImmediate();
                });
            }
        };

        // Tooltip updater - shows time and price at any crosshair position
        const updateTooltip = (param: any) => {
            const tip = tooltipRef.current;
            const container = containerRef.current;
            if (!tip || !container) return;
            
            const point = param?.point;
            if (!point || typeof point.x !== 'number' || typeof point.y !== 'number') {
                tip.style.display = 'none';
                return;
            }

            // Get time coordinate from x position (even if not hovering over candle)
            const timeCoord = chart.timeScale().coordinateToTime(point.x);
            if (timeCoord == null) {
                tip.style.display = 'none';
                return;
            }

            // Get price coordinate from y position
            const priceCoord = series.priceToCoordinate(point.y);
            const price = priceCoord != null ? series.coordinateToPrice(point.y) : null;

            // Convert Time to ms
            let ms: number | null = null;
            if (typeof timeCoord === 'number') {
                ms = timeCoord * 1000; // seconds -> ms
            } else if (typeof timeCoord === 'object' && timeCoord.year && timeCoord.month && timeCoord.day) {
                // Business day (UTC)
                ms = Date.UTC(timeCoord.year, (timeCoord.month as number) - 1, timeCoord.day as number);
            }
            
            if (ms == null) {
                tip.style.display = 'none';
                return;
            }

            const ts = new Date(ms).toISOString().replace('T', ' ').replace('Z', ' UTC');
            const priceStr = price != null ? price.toFixed(2) : 'N/A';
            
            tip.innerHTML = `<div>${ts}</div><div>Price: $${priceStr}</div>`;
            
            // Position near crosshair, clamped to container
            const rect = container.getBoundingClientRect();
            const x = Math.max(4, Math.min(rect.width - 80, point.x + 10));
            const y = Math.max(16, Math.min(rect.height - 40, point.y - 20));
            tip.style.left = `${x}px`;
            tip.style.top = `${y}px`;
            tip.style.display = 'block';
        };

        // Events to force immediate redraw while interacting with axes
        chart.timeScale().subscribeVisibleTimeRangeChange(draw);
        const ps = series.priceScale() as any;
        const subPrice = typeof ps?.subscribeVisiblePriceRangeChange === 'function' ? ps.subscribeVisiblePriceRangeChange.bind(ps) : null;
        const unsubPrice = typeof ps?.unsubscribeVisiblePriceRangeChange === 'function' ? ps.unsubscribeVisiblePriceRangeChange.bind(ps) : null;
        if (subPrice) subPrice(draw);
        const crosshairHandler = (param: any) => { draw(); updateTooltip(param); };
        if (typeof (chart as any).subscribeCrosshairMove === 'function') {
            (chart as any).subscribeCrosshairMove(crosshairHandler);
        }
        if (typeof (chart as any).subscribeSizeChange === 'function') {
            (chart as any).subscribeSizeChange(draw);
        }
        // Container pointer/wheel to redraw continuously during axis drag
        const container = containerRef.current;
        const onWheel = () => { isDragging = true; drawImmediate(); setTimeout(() => { isDragging = false; }, 100); };
        const onPointerDown = () => { isDragging = true; drawImmediate(); };
        const onPointerMove = () => { if (isDragging) drawImmediate(); };
        const onPointerUp = () => { isDragging = false; draw(); };
        
        // Click handler for eye icons
        const onClick = (event: PointerEvent) => {
            if (!chart || !series) return;
            
            const rect = canvas.getBoundingClientRect();
            const clickX = event.clientX - rect.left;
            const clickY = event.clientY - rect.top;
            
            // Check if click is on any eye icon
            if (trades.length > 0) {
                const frameSec = timeframeToSeconds(ohlcvTimeframe);
                trades.forEach((trade, tradeIndex) => {
                    if (!trade.entryTs || !trade.exitTs || !trade.entryPrice) return;
                    
                    const yEntry = series.priceToCoordinate(trade.entryPrice);
                    const ySL = trade.sl != null ? series.priceToCoordinate(trade.sl) : null;
                    const yTP = trade.tp != null ? series.priceToCoordinate(trade.tp) : null;
                    
                    const entrySec = trade.entryTs / 1000;
                    const exitSec = trade.exitTs / 1000;
                    let snappedEntry = SNAP_POLICY === 'pre' ? ceilToFrame(entrySec, frameSec) : floorToFrame(entrySec, frameSec);
                    let snappedExit = SNAP_POLICY === 'pre' ? ceilToFrame(exitSec, frameSec) : floorToFrame(exitSec, frameSec);
                    if (snappedExit <= snappedEntry) snappedExit = snappedEntry + frameSec;
                    
                    const x1raw = chart.timeScale().timeToCoordinate(snappedEntry as unknown as Time);
                    const x2raw = chart.timeScale().timeToCoordinate(snappedExit as unknown as Time);
                    
                    if (x1raw === null && x2raw === null) return;
                    
                    const xStart = typeof x1raw === 'number' ? x1raw : 0;
                    const xEnd = typeof x2raw === 'number' ? x2raw : rect.width;
                    let rxBase = Math.min(xStart, xEnd);
                    let rwBase = Math.max(1, Math.abs(xEnd - xStart));
                    if (rwBase <= 1) {
                        rwBase = 10;
                        rxBase = (x1raw || x2raw || 0) - rwBase / 2;
                    }
                    
                    const yEntryClamped = typeof yEntry === 'number' ? Math.max(0, Math.min(rect.height, yEntry)) : null;
                    const ySLClamped = typeof ySL === 'number' ? Math.max(0, Math.min(rect.height, ySL)) : null;
                    const yTPClamped = typeof yTP === 'number' ? Math.max(0, Math.min(rect.height, yTP)) : null;
                    
                    // Calculate eye icon position
                    const eyeSize = 12;
                    const eyeX = rxBase + 2;
                    const eyeY = Math.min(yEntryClamped || 0, ySLClamped || 0, yTPClamped || 0) + 2;
                    
                    // Check if click is within eye icon bounds
                    const eyeCenterX = eyeX + eyeSize/2;
                    const eyeCenterY = eyeY + eyeSize/2;
                    const distance = Math.sqrt((clickX - eyeCenterX) ** 2 + (clickY - eyeCenterY) ** 2);
                    
                    if (distance <= eyeSize/2) {
                        toggleTradeVisibility(tradeIndex);
                        draw(); // Redraw to update visibility
                    }
                });
            }
        };
        
        if (container) {
            container.addEventListener('wheel', onWheel, { passive: true });
            container.addEventListener('pointerdown', onPointerDown);
            container.addEventListener('pointermove', onPointerMove);
            container.addEventListener('pointerup', onPointerUp);
            container.addEventListener('pointerleave', onPointerUp);
            container.addEventListener('click', onClick);
        }

        draw();

        return () => {
            chart.timeScale().unsubscribeVisibleTimeRangeChange(draw);
            if (unsubPrice) unsubPrice(draw);
            if (typeof (chart as any).unsubscribeCrosshairMove === 'function') {
                (chart as any).unsubscribeCrosshairMove(crosshairHandler);
            }
            if (typeof (chart as any).unsubscribeSizeChange === 'function') {
                (chart as any).unsubscribeSizeChange(draw);
            }
            if (container) {
                container.removeEventListener('wheel', onWheel as any);
                container.removeEventListener('pointerdown', onPointerDown as any);
                container.removeEventListener('pointermove', onPointerMove as any);
                container.removeEventListener('pointerup', onPointerUp as any);
                container.removeEventListener('pointerleave', onPointerUp as any);
                container.removeEventListener('click', onClick as any);
            }
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        };
    }, [candles, trades, customBox, ohlcvTimeframe, hiddenTrades]);

    // Auto-add requested rectangle for 2025-09-29 between 443-440 when candles include that date
    useEffect(() => {
        if (!candles || candles.length === 0) return;
        // Compute loaded time span in seconds
        const firstTime = Number((candles[0].time as any));
        const lastTime = Number((candles[candles.length - 1].time as any));
        if (!isFinite(firstTime) || !isFinite(lastTime)) return;
        const startSec = Math.floor(Date.parse('2025-09-29T09:30:00Z') / 1000);
        const endSec = Math.floor(Date.parse('2025-09-29T15:30:00Z') / 1000);
        // If requested day overlaps loaded range, set the box
        if (startSec <= lastTime && endSec >= firstTime) {
            setCustomBox({ startSec, endSec, high: 443, low: 440 });
        }
    }, [candles]);

    return (
        <div className="relative rounded-lg border border-cyan-500/20 bg-black/80 backdrop-blur-sm p-4">
            <div className="flex items-center justify-between mb-1">
                <h3 className="metallic-title text-sm font-semibold uppercase tracking-wide">Candlestick Chart</h3>
                <div className="flex gap-2">
                    <button
                        onClick={() => setRefreshTick(t => t + 1)}
                        className="px-2 py-1 text-xs border border-cyan-500/30 bg-black/50 text-gray-300 rounded hover:border-cyan-500/50 hover:bg-black/70 transition-colors"
                        title="Manual refresh - chart used to auto-refresh every 1.5-8 seconds"
                    >
                        🔄 Refresh
                    </button>
                    {trades.length > 0 && (
                        <>
                            <button
                                onClick={() => setHiddenTrades(new Set())}
                                className="px-2 py-1 text-xs border border-emerald-500/30 bg-black/50 text-emerald-400 rounded hover:border-emerald-500/50 hover:bg-black/70 transition-colors"
                            >
                                Show All
                            </button>
                            <button
                                onClick={() => setHiddenTrades(new Set(trades.map((_, i) => i)))}
                                className="px-2 py-1 text-xs border border-red-500/30 bg-black/50 text-red-400 rounded hover:border-red-500/50 hover:bg-black/70 transition-colors"
                            >
                                Hide All
                            </button>
                        </>
                    )}
                </div>
            </div>
            {error && <div className="text-red-400 text-sm">{error}</div>}
            <div ref={containerRef} style={{ position: 'relative', width: '100%', height: '500px', backgroundColor: '#000000' }}>
                <canvas
                    ref={canvasRef}
                    style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', zIndex: 10 }}
                />
            </div>
        </div>
    );
}
