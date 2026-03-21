/**
 * Text annotation constants shared between CandlestickChart (HTML input) and DrawingOverlay (canvas).
 * Keep padding/font identical in both places so the edit box and committed text align perfectly.
 */
export const TEXT_ANNOTATION_FONT = '13px system-ui, sans-serif';
/** Horizontal padding inside the box on each side (px). Tiny — TradingView-style flush text. */
export const TEXT_PAD_PX = 3;
/** border-width * 2 sides for border-box math */
export const TEXT_BORDER_PX = 4;
export const TEXT_ANNOTATION_PLACEHOLDER = 'Add Text';

let _measureCanvas: HTMLCanvasElement | null = null;
function getMeasureCtx(): CanvasRenderingContext2D | null {
	if (!_measureCanvas) _measureCanvas = document.createElement('canvas');
	const ctx = _measureCanvas.getContext('2d');
	if (ctx) ctx.font = TEXT_ANNOTATION_FONT;
	return ctx;
}

export function measureTextPx(text: string): number {
	const ctx = getMeasureCtx();
	if (!ctx) return 40;
	return ctx.measureText(text.length ? text : ' ').width;
}

/** Full box width for a given string (includes padding + border). */
export function textBoxWidthPx(text: string): number {
	return Math.max(40, measureTextPx(text) + TEXT_PAD_PX * 2 + TEXT_BORDER_PX);
}
