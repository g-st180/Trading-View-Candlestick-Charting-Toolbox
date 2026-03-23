/**
 * Shared stroke styles for chart drawing tools (overlay + underlay).
 * Dense “dotted” look: short on-segment, tiny gap, many repeats along the line.
 * Use with `ctx.lineCap = 'round'` so short dashes read as small dots.
 */
export const TOOL_DOTTED_LINE_DASH: number[] = [1.5, 2];
