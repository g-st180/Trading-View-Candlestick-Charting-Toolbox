import { create } from 'zustand';
import { produce } from 'immer';

export type TimeSeriesPoint = { ts: number; value: number | null };
export type ExitDistPoint = { name: string; value: number };
export type CandleBar = { ts: number; open: number; high: number; low: number; close: number; volume?: number };
export type SlippagePoint = { ts: number, value: number, cumulative: number, trade_number?: number };
export type TradeDurationPoint = { duration: number, pnl: number };
export type CardMetrics = {
	totalPnl?: number;
	avgTradeDuration?: number;
	winRate?: number;
	totalTrades?: number;
	totalInvestment?: number;
};

export type TradeItem = {
	entryTs?: number;
	exitTs?: number;
	entryPrice?: number;
	exitPrice?: number;
	sl?: number;
	tp?: number;
	direction?: string;
	exitReason?: string;
};

export type AccountHistoryPoint = {
	timestamp: number;
	portfolio_value: number;
	cash: number;
}

export type RiskCards = {
	sharpe?: number | null;
	max_drawdown?: number | null;
	annualized_return?: number | null;
	calmar?: number | null;
	sortino?: number | null;
	total_return?: number | null;
};

function toMs(input: any): number | null {
	if (typeof input === 'number') {
		return input > 1e12 ? input : input * 1000;
	}
	if (typeof input === 'string') {
		const d = new Date(input);
		if (!isNaN(d.getTime())) return d.getTime();
	}
	return null;
}

function normalizeSeries(arr: any[]): TimeSeriesPoint[] {
	return (arr || []).map((row: any) => {
		const tsCandidate = row.ts ?? row.timestamp ?? row.time ?? row.entry_time ?? row.log_time;
		const vCandidate = row.value ?? row.avg ?? row.seconds ?? row.total_seconds ?? row.tp_compute_seconds ?? row.feat_calc_time ?? row.tp_calc_time_seconds;
		const tsMs = toMs(tsCandidate);
		const valNum = typeof vCandidate === 'number' ? vCandidate : (typeof vCandidate === 'string' ? Number(vCandidate) : null);
		return { ts: tsMs ?? 0, value: isNaN(Number(valNum)) ? null : Number(valNum) } as TimeSeriesPoint;
	}).filter(p => !!p.ts);
}

function normalizeSlippageSeries(arr: any[]): SlippagePoint[] {
	return (arr || []).map((row: any) => {
		const tsCandidate = row.ts ?? row.timestamp ?? row.time;
		const vCandidate = row.slippage_pct;
		const cCandidate = row.cumulative_slippage_pct;
		const tradeNum = row.trade_number;
		const tsMs = toMs(tsCandidate);
		const valNum = typeof vCandidate === 'number' ? vCandidate : (typeof vCandidate === 'string' ? Number(vCandidate) : null);
		const cumNum = typeof cCandidate === 'number' ? cCandidate : (typeof cCandidate === 'string' ? Number(cCandidate) : null);
		return { 
			ts: tsMs ?? 0, 
			value: isNaN(Number(valNum)) ? 0 : Number(valNum),
			cumulative: isNaN(Number(cumNum)) ? 0 : Number(cumNum),
			trade_number: tradeNum != null ? Number(tradeNum) : undefined,
		} as SlippagePoint;
	}).filter(p => !!p.ts);
}

function normalizeExitDist(input: any): ExitDistPoint[] {
	if (!input) return [];
	let raw = input;
	if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
		if (Array.isArray(raw.data)) raw = raw.data;
		else if (Array.isArray(raw.labels) && Array.isArray(raw.values)) {
			const out: ExitDistPoint[] = [];
			for (let i = 0; i < Math.min(raw.labels.length, raw.values.length); i++) {
				const name = String(raw.labels[i]);
				const value = Number(raw.values[i]);
				if (!isNaN(value)) out.push({ name, value });
			}
			return out.sort((a, b) => b.value - a.value);
		} else {
			const out: ExitDistPoint[] = [];
			for (const [k, v] of Object.entries(raw)) {
				const value = Number(v as any);
				if (!isNaN(value)) out.push({ name: String(k), value });
			}
			if (out.length) return out.sort((a, b) => b.value - a.value);
		}
	}
	if (Array.isArray(raw)) {
		const out: ExitDistPoint[] = [];
		for (const item of raw) {
			if (Array.isArray(item) && item.length >= 2) {
				const name = String(item[0]);
				const value = Number(item[1]);
				if (!isNaN(value)) out.push({ name, value });
				continue;
			}
			if (item && typeof item === 'object') {
				const name = (item.name ?? item.reason ?? item.exit_reason);
				const valueRaw = (item.value ?? item.count ?? item.c);
				if (name != null && valueRaw != null) {
					const value = Number(valueRaw);
					if (!isNaN(value)) out.push({ name: String(name), value });
				}
			}
		}
		return out.sort((a, b) => b.value - a.value);
	}
	return [];
}

type Store = {
	isLoading: boolean;
	selectedSymbol: string | null;
	selectedModel: string | null;
	selectedExperimentId: string; // 'ALL' or specific id
	selectedDirection: string; // 'ALL' | 'LONG' | 'SHORT'
	// Dashboard (datetime-local)
	dashboardStart: string;
	dashboardEnd: string;
	// Technical Metrics (datetime-local)
	technicalMetricsStart: string;
	technicalMetricsEnd: string;
	// Portfolio Metrics (datetime-local)
	portfolioStart: string;
	portfolioEnd: string;
	portfolioDirection: string; // 'ALL' | 'LONG' | 'SHORT'
	// Chart (date-only)
	chartStart: string; // YYYY-MM-DD
	chartEnd: string;   // YYYY-MM-DD
	timeframe: string;
	chartPage: number;
	chartWindowSize: number;
	totalCandles: number;

	// OHLCV Chart
	ohlcvSelectedSymbol: string | null;
	ohlcvChartStart: string; // YYYY-MM-DD
	ohlcvChartEnd: string;   // YYYY-MM-DD
	ohlcvTimeframe: string;
	
	series: TimeSeriesPoint[];
	totalSeries: TimeSeriesPoint[];
	featSeries: TimeSeriesPoint[];
	apiCandleFetchTimeSeries: TimeSeriesPoint[];
	exitDist: ExitDistPoint[];
	slippageSeries: SlippagePoint[];
	predictionTimeSeris: TimeSeriesPoint[];
	modelConfidenceSeries: TimeSeriesPoint[];
	tradeDurations: TradeDurationPoint[];
	accountHistory: AccountHistoryPoint[];
	pnlSeries: TimeSeriesPoint[];
	cardMetrics: CardMetrics;
	symbols: string[];
	models: string[];
	experiments: string[];
	candles: CandleBar[];
	trades: TradeItem[];
	riskCards: RiskCards;
	
	// Portfolio Metrics data
	portfolioCardMetrics: CardMetrics;
	portfolioRiskCards: RiskCards;

	// Validation Metrics
	validationSelectedSymbols: string[];
	validationExecutionTime: number | null;
	isValidationRunning: boolean;

	setters: {
		setSelectedSymbol: (s: string | null) => void;
		setSelectedModel: (m: string | null) => void;
		setSelectedExperimentId: (e: string) => void;
		setSelectedDirection: (d: string) => void;
		setDashboardStart: (ts: string) => void;
		setDashboardEnd: (ts: string) => void;
		setTechnicalMetricsStart: (ts: string) => void;
		setTechnicalMetricsEnd: (ts: string) => void;
		setPortfolioStart: (ts: string) => void;
		setPortfolioEnd: (ts: string) => void;
		setPortfolioDirection: (d: string) => void;
		setChartStart: (d: string) => void;
		setChartEnd: (d: string) => void;
		setTimeframe: (tf: string) => void;
		setChartPage: (p: number) => void;
		setChartWindowSize: (s: number) => void;
		setTotalCandles: (c: number) => void;
		setOhlcvSelectedSymbol: (s: string | null) => void;
		setOhlcvChartStart: (d: string) => void;
		setOhlcvChartEnd: (d: string) => void;
		setOhlcvTimeframe: (tf: string) => void;
		setValidationSelectedSymbols: (s: string[]) => void;
		setValidationExecutionTime: (t: number | null) => void;
		setIsValidationRunning: (r: boolean) => void;
	};
	loadTickers: () => Promise<void>;
	loadModels: (startDate?: string, endDate?: string) => Promise<void>;
	loadExperiments: (startDate?: string, endDate?: string) => Promise<void>;
	loadDashboardData: () => Promise<void>;
	loadTechnicalMetricsData: () => Promise<void>;
	loadPortfolioData: () => Promise<void>;
	loadCandles: () => Promise<void>;
	loadTrades: () => Promise<void>;
	runValidation: () => Promise<void>;
};

const TICKERS_URL = '/api/tickers';
const MODELS_URL = '/api/models';
const EXPERIMENTS_URL = '/api/experiments';
const TP_URL = '/api/tp_calc_time';
const TOTAL_URL = '/api/total_seconds';
const FEAT_URL = '/api/feat_calc_time';
const API_CANDLE_FETCH_URL = '/api/api_candle_fetch_time';
const EXIT_URL = '/api/exit_reasons';
const SLIPPAGE_URL = '/api/slippage';
const DURATION_URL = '/api/trade_durations';
const PREDICTION_TIME_URL = '/api/prediction_time';
const MODEL_CONFIDENCE_URL = '/api/model_confidence';
const ACCOUNT_HISTORY_URL = '/api/account_history';
const PNL_CURVE_URL = '/api/pnl_curve';
const CARDS_URL = '/api/card_metrics';
const CANDLES_URL = '/api/ohlcv';
const TRADES_URL = '/api/all_trades';
const RISK_CARDS_URL = '/api/risk_cards';

const now = new Date();
const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

export const useDashboardStore = create<Store>((set, get) => ({
	isLoading: true,
	selectedSymbol: null,
	selectedModel: null,
	selectedExperimentId: 'ALL',
	selectedDirection: 'ALL',
	dashboardStart: oneHourAgo.toISOString().slice(0, 16),
	dashboardEnd: now.toISOString().slice(0, 16),
	technicalMetricsStart: oneHourAgo.toISOString().slice(0, 16),
	technicalMetricsEnd: now.toISOString().slice(0, 16),
	portfolioStart: oneHourAgo.toISOString().slice(0, 16),
	portfolioEnd: now.toISOString().slice(0, 16),
	portfolioDirection: 'ALL',
	chartStart: oneHourAgo.toISOString().slice(0, 10),
	chartEnd: now.toISOString().slice(0, 10),
	timeframe: '5Min',
	chartPage: 0,
	chartWindowSize: 100,
	totalCandles: 0,
	
	// OHLCV Chart
	ohlcvSelectedSymbol: null,
	ohlcvChartStart: oneHourAgo.toISOString().slice(0, 10),
	ohlcvChartEnd: now.toISOString().slice(0, 10),
	ohlcvTimeframe: '1Min',

	series: [],
	totalSeries: [],
	featSeries: [],
	apiCandleFetchTimeSeries: [],
	exitDist: [],
	slippageSeries: [],
	predictionTimeSeris: [],
	modelConfidenceSeries: [],
	tradeDurations: [],
	accountHistory: [],
	pnlSeries: [],
	cardMetrics: {},
	symbols: [],
	models: [],
	experiments: [],
	candles: [],
	trades: [],
	riskCards: {},
	portfolioCardMetrics: {},
	portfolioRiskCards: {},
	validationSelectedSymbols: [],
	validationExecutionTime: null,
	isValidationRunning: false,

	setters: {
		setSelectedSymbol: (s) => set({ selectedSymbol: s }),
		setSelectedModel: (m) => set({ selectedModel: m }),
		setSelectedExperimentId: (e) => set({ selectedExperimentId: e || 'ALL' }),
		setSelectedDirection: (d) => set({ selectedDirection: d }),
		setDashboardStart: (ts) => set({ dashboardStart: ts }),
		setDashboardEnd: (ts) => set({ dashboardEnd: ts }),
		setTechnicalMetricsStart: (ts) => set({ technicalMetricsStart: ts }),
		setTechnicalMetricsEnd: (ts) => set({ technicalMetricsEnd: ts }),
		setPortfolioStart: (ts) => set({ portfolioStart: ts }),
		setPortfolioEnd: (ts) => set({ portfolioEnd: ts }),
		setPortfolioDirection: (d) => set({ portfolioDirection: d }),
		setChartStart: (d) => set({ chartStart: d }),
		setChartEnd: (d) => set({ chartEnd: d }),
		setTimeframe: (tf) => set({ timeframe: tf }),
		setChartPage: (p) => set({ chartPage: p }),
		setChartWindowSize: (s) => set({ chartWindowSize: s, chartPage: 0 }), // Reset page on size change
		setTotalCandles: (c) => set({ totalCandles: c }),
		setOhlcvSelectedSymbol: (s) => set({ ohlcvSelectedSymbol: s }),
		setOhlcvChartStart: (d) => set({ ohlcvChartStart: d }),
		setOhlcvChartEnd: (d) => set({ ohlcvChartEnd: d }),
		setOhlcvTimeframe: (tf) => set({ ohlcvTimeframe: tf }),
		setValidationSelectedSymbols: (s) => set({ validationSelectedSymbols: s }),
		setValidationExecutionTime: (t) => set({ validationExecutionTime: t }),
		setIsValidationRunning: (r) => set({ isValidationRunning: r }),
	},

	loadTickers: async () => {
		try {
			const res = await fetch(TICKERS_URL, { cache: 'no-store' });
			const data = await res.json();
			const symbols: string[] = Array.isArray(data) ? data : (Array.isArray(data.tickers) ? data.tickers : (Array.isArray(data.symbols) ? data.symbols : []));
			
			// Only set a default symbol if one isn't already selected.
			// This prevents overriding a user's selection of "All" (which is `null`).
			if (get().selectedSymbol === undefined) {
				set({ symbols, selectedSymbol: symbols[0] ?? null });
			} else {
				set({ symbols });
			}
		} catch {
			set({ symbols: [] });
		}
	},

	loadModels: async (startDate?: string, endDate?: string) => {
		try {
			const params = new URLSearchParams();
			if (startDate) params.set('start_date', startDate);
			if (endDate) params.set('end_date', endDate);
			
			const url = params.toString() ? `${MODELS_URL}?${params.toString()}` : MODELS_URL;
			const res = await fetch(url, { cache: 'no-store' });
			const data = await res.json();
			const models: string[] = Array.isArray(data) ? data : (Array.isArray(data.models) ? data.models : []);
			set({ models });
		} catch {
			set({ models: [] });
		}
	},

	loadExperiments: async (startDate?: string, endDate?: string) => {
		try {
			const params = new URLSearchParams();
			if (startDate) params.set('start_date', startDate);
			if (endDate) params.set('end_date', endDate);
			const url = params.toString() ? `${EXPERIMENTS_URL}?${params.toString()}` : EXPERIMENTS_URL;
			const res = await fetch(url, { cache: 'no-store' });
			const data = await res.json();
			const experiments: string[] = Array.isArray(data) ? data : (Array.isArray(data.experiments) ? data.experiments : []);
			set({ experiments });
		} catch {
			set({ experiments: [] });
		}
	},

	loadDashboardData: async () => {
		set({ isLoading: true });
		try {
			const { dashboardStart, dashboardEnd, selectedSymbol, selectedDirection, selectedExperimentId } = get();
			const params = new URLSearchParams();
			if (dashboardStart) params.set('start_date', dashboardStart);
			if (dashboardEnd) params.set('end_date', dashboardEnd);
			if (selectedSymbol && selectedSymbol !== 'ALL') params.set('ticker', selectedSymbol);
			if (selectedDirection && selectedDirection !== 'ALL') params.set('direction', selectedDirection);
			if (selectedExperimentId && selectedExperimentId !== 'ALL') params.set('experiment_id', selectedExperimentId);

			const [exitRes, durationRes, cardsRes, accountHistoryRes, riskCardsRes, pnlRes, slippageRes] = await Promise.all([
				fetch(`${EXIT_URL}?${params.toString()}`),
				fetch(`${DURATION_URL}?${params.toString()}`),
				fetch(`${CARDS_URL}?${params.toString()}`),
				fetch(`${ACCOUNT_HISTORY_URL}?${params.toString()}`),
				fetch(`${RISK_CARDS_URL}?${params.toString()}`),
				fetch(`${PNL_CURVE_URL}?${params.toString()}`),
				fetch(`${SLIPPAGE_URL}?${params.toString()}`),
			]);
			const [exitData, durationData, cardsData, accountHistoryData, riskCardsData, pnlData, slippageData] = await Promise.all([
				exitRes.json(), durationRes.json(), cardsRes.json(), accountHistoryRes.json(), riskCardsRes.json(), pnlRes.json(), slippageRes.json(),
			]);

			const durationArr = Array.isArray(durationData) ? durationData : [];
			const accountArr = Array.isArray(accountHistoryData) ? accountHistoryData : [];
			const pnlArr = Array.isArray(pnlData) ? pnlData : [];
			const slippageArr = Array.isArray(slippageData) ? slippageData : [];

			set(produce(draft => {
				draft.exitDist = normalizeExitDist(exitData);
				draft.tradeDurations = durationArr;
				draft.cardMetrics = cardsData;
				draft.accountHistory = accountArr.map((d: any) => {
					const ts = toMs(d.timestamp) ?? 0;
					const portfolio = Number(d.portfolio ?? d.portfolio_value ?? 0);
					const cash = d.cash == null ? 0 : Number(d.cash);
					return { ...d, timestamp: ts, portfolio, portfolio_value: portfolio, cash };
				});
				draft.riskCards = riskCardsData || {};
				draft.pnlSeries = normalizeSeries(pnlArr);
				draft.slippageSeries = normalizeSlippageSeries(slippageArr);
			}));
		} catch (error) {
			console.error('Failed to load dashboard data', error);
			set(produce(draft => {
				draft.exitDist = [];
				draft.tradeDurations = [];
				draft.cardMetrics = {};
				draft.accountHistory = [];
				draft.riskCards = {};
				draft.pnlSeries = [];
				draft.slippageSeries = [];
			}));
		} finally {
			set({ isLoading: false });
		}
	},

	loadTechnicalMetricsData: async () => {
		set({ isLoading: true });
		try {
			const { technicalMetricsStart, technicalMetricsEnd, selectedSymbol, selectedModel, selectedExperimentId } = get();
			const params = new URLSearchParams();
			if (technicalMetricsStart) params.set('start_date', technicalMetricsStart);
			if (technicalMetricsEnd) params.set('end_date', technicalMetricsEnd);
			if (selectedSymbol && selectedSymbol !== 'ALL') params.set('ticker', selectedSymbol);
			if (selectedModel) params.set('model_name', selectedModel);
			if (selectedExperimentId && selectedExperimentId !== 'ALL') params.set('experiment_id', selectedExperimentId);

			const [tpRes, totalRes, featRes, apiCandleFetchRes, slippageRes, predTimeRes, modelConfidenceRes] = await Promise.all([
				fetch(`${TP_URL}?${params.toString()}`),
				fetch(`${TOTAL_URL}?${params.toString()}`),
				fetch(`${FEAT_URL}?${params.toString()}`),
				fetch(`${API_CANDLE_FETCH_URL}?${params.toString()}`),
				fetch(`${SLIPPAGE_URL}?${params.toString()}`),
				fetch(`${PREDICTION_TIME_URL}?${params.toString()}`),
				fetch(`${MODEL_CONFIDENCE_URL}?${params.toString()}`),
			]);
			const [tpData, totalData, featData, apiCandleFetchData, slippageData, predTimeData, modelConfidenceData] = await Promise.all([
				tpRes.json(), totalRes.json(), featRes.json(), apiCandleFetchRes.json(), slippageRes.json(), predTimeRes.json(), modelConfidenceRes.json(),
			]);

			const tpArr = Array.isArray(tpData) ? tpData : [];
			const totalArr = Array.isArray(totalData) ? totalData : [];
			const featArr = Array.isArray(featData) ? featData : [];
			const apiArr = Array.isArray(apiCandleFetchData) ? apiCandleFetchData : [];
			const slippageArr = Array.isArray(slippageData) ? slippageData : [];
			const predArr = Array.isArray(predTimeData) ? predTimeData : [];
			const confArr = Array.isArray(modelConfidenceData) ? modelConfidenceData : [];

			set(produce(draft => {
				draft.series = normalizeSeries(tpArr);
				draft.totalSeries = normalizeSeries(totalArr);
				draft.featSeries = normalizeSeries(featArr);
				draft.apiCandleFetchTimeSeries = normalizeSeries(apiArr);
				draft.slippageSeries = normalizeSlippageSeries(slippageArr);
				draft.predictionTimeSeris = normalizeSeries(predArr);
				draft.modelConfidenceSeries = normalizeSeries(confArr);
			}));
		} catch (error) {
			console.error('Failed to load technical metrics data', error);
			set(produce(draft => {
				draft.series = [];
				draft.totalSeries = [];
				draft.featSeries = [];
				draft.apiCandleFetchTimeSeries = [];
				draft.slippageSeries = [];
				draft.predictionTimeSeris = [];
				draft.modelConfidenceSeries = [];
			}));
		} finally {
			set({ isLoading: false });
		}
	},

	loadPortfolioData: async () => {
		set({ isLoading: true });
		try {
			const { portfolioStart, portfolioEnd, selectedExperimentId } = get();
			const params = new URLSearchParams();
			if (portfolioStart) params.set('start_date', portfolioStart);
			if (portfolioEnd) params.set('end_date', portfolioEnd);
			// Direction filter commented out for portfolio-level metrics (logically incorrect to filter by direction 
			// when metrics are calculated from overall account value, not individual trades)
			// if (portfolioDirection && portfolioDirection !== 'ALL') params.set('direction', portfolioDirection);
			// Note: No ticker filter - always "ALL" for portfolio
			if (selectedExperimentId && selectedExperimentId !== 'ALL') params.set('experiment_id', selectedExperimentId);

			const [exitRes, durationRes, cardsRes, accountHistoryRes, riskCardsRes] = await Promise.all([
				fetch(`${EXIT_URL}?${params.toString()}`),
				fetch(`${DURATION_URL}?${params.toString()}`),
				fetch(`${CARDS_URL}?${params.toString()}`),
				fetch(`${ACCOUNT_HISTORY_URL}?${params.toString()}`),
				fetch(`${RISK_CARDS_URL}?${params.toString()}`),
			]);
			const [exitData, durationData, cardsData, accountHistoryData, riskCardsData] = await Promise.all([
				exitRes.json(), durationRes.json(), cardsRes.json(), accountHistoryRes.json(), riskCardsRes.json(),
			]);

			const durationArr = Array.isArray(durationData) ? durationData : [];
			const accountArr = Array.isArray(accountHistoryData) ? accountHistoryData : [];

			set(produce(draft => {
				draft.exitDist = normalizeExitDist(exitData);
				draft.tradeDurations = durationArr;
				draft.portfolioCardMetrics = cardsData;
				draft.accountHistory = accountArr.map((d: any) => {
					const ts = toMs(d.timestamp) ?? 0;
					const portfolio = Number(d.portfolio ?? d.portfolio_value ?? 0);
					const cash = d.cash == null ? 0 : Number(d.cash);
					return { ...d, timestamp: ts, portfolio, portfolio_value: portfolio, cash };
				});
				draft.portfolioRiskCards = riskCardsData || {};
			}));
		} catch (error) {
			console.error('Failed to load portfolio data', error);
			set(produce(draft => {
				draft.exitDist = [];
				draft.tradeDurations = [];
				draft.portfolioCardMetrics = {};
				draft.accountHistory = [];
				draft.portfolioRiskCards = {};
			}));
		} finally {
			set({ isLoading: false });
		}
	},

	loadCandles: async () => {
		set({ isLoading: true });
		try {
			const { chartStart, chartEnd, selectedSymbol, timeframe } = get();
			if (!selectedSymbol || selectedSymbol === 'ALL') { set({ candles: [] }); return; }
			const params = new URLSearchParams();
			if (chartStart) params.set('start_date', chartStart);
			if (chartEnd) params.set('end_date', chartEnd);
			params.set('ticker', selectedSymbol);
			params.set('timeframe', timeframe);

			const res = await fetch(`${CANDLES_URL}?${params.toString()}`);
			const data = await res.json();
			const rows = Array.isArray(data) ? data : [];
			const candles: CandleBar[] = rows.map((row: any) => {
				const ts = toMs(row.timestamp ?? row.time ?? row.ts) ?? 0;
				return { ts, open: Number(row.open), high: Number(row.high), low: Number(row.low), close: Number(row.close), volume: row.volume != null ? Number(row.volume) : undefined };
			}).filter((c: CandleBar) => c.ts && isFinite(c.open) && isFinite(c.high) && isFinite(c.low) && isFinite(c.close));
			set({ candles });
		} catch (e) {
			console.error('Failed to load candles', e);
			set({ candles: [] });
		} finally {
			set({ isLoading: false });
		}
	},

	loadTrades: async () => {
		try {
			const { chartStart, chartEnd, selectedSymbol, selectedExperimentId } = get();
			if (!selectedSymbol || selectedSymbol === 'ALL') { set({ trades: [] }); return; }
			const params = new URLSearchParams();
			if (chartStart) params.set('start_date', chartStart);
			if (chartEnd) params.set('end_date', chartEnd);
			params.set('ticker', selectedSymbol);
			if (selectedExperimentId && selectedExperimentId !== 'ALL') params.set('experiment_id', selectedExperimentId);
			const res = await fetch(`${TRADES_URL}?${params.toString()}`);
			const data = await res.json();
			const trades: TradeItem[] = (data || []).map((r: any) => {
				const entryTs = toMs(r.entry_time ?? r.entryTime ?? r.entry) ?? undefined;
				const exitTs = toMs(r.exit_time ?? r.exitTime ?? r.exit) ?? undefined;
				const entryPrice = r.entry_price ?? r.entryPrice;
				const exitPrice = r.exit_price ?? r.exitPrice;
				const sl = r.stop_loss_price ?? r.stopLoss ?? r.sl;
				const tp = r.take_profit_price ?? r.takeProfit ?? r.tp;
				return {
					entryTs,
					exitTs,
					entryPrice: entryPrice != null ? Number(entryPrice) : undefined,
					exitPrice: exitPrice != null ? Number(exitPrice) : undefined,
					sl: sl != null ? Number(sl) : undefined,
					tp: tp != null ? Number(tp) : undefined,
					direction: r.direction,
					exitReason: r.exit_reason ?? r.exitReason,
				};
			});
			set({ trades });
		} catch (e) {
			console.error('Failed to load trades', e);
			set({ trades: [] });
		}
	},

	runValidation: async () => {
		set({ isValidationRunning: true, validationExecutionTime: null });
		try {
			const { technicalMetricsStart, technicalMetricsEnd } = get();
			
			// Convert datetime-local format to ISO 8601 format expected by backend
			// Input format: "2025-10-24T13:30" (datetime-local)
			// Output format: "2025-10-24T13:30:00+00:00" (ISO 8601 with UTC timezone)
			const startISO = technicalMetricsStart ? `${technicalMetricsStart}:00+00:00` : '';
			const endISO = technicalMetricsEnd ? `${technicalMetricsEnd}:00+00:00` : '';
			
			const response = await fetch('/api/run_validation', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					start_date: startISO,
					end_date: endISO,
				}),
			});
			
			const data = await response.json();
			
			if (!response.ok) {
				console.error('Validation failed:', data.error);
				alert(`Validation failed: ${data.error}`);
				set({ validationExecutionTime: null });
				return;
			}
			
			// Set execution time in seconds
			set({ validationExecutionTime: data.execution_time_seconds });
		} catch (error) {
			console.error('Failed to run validation:', error);
			alert('Failed to run validation. Check console for details.');
			set({ validationExecutionTime: null });
		} finally {
			set({ isValidationRunning: false });
		}
	},
}));

export type SlippageData = {
  timestamp: number;
  pnl: number;
};

export type TradeDurationData = {
  duration_group: string;
  pnl: number;
};
