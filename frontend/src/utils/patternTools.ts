/**
 * Shared configuration for multi-point pattern drawing tools (Chart Patterns + Elliott Waves).
 * Each tool is a multi-click zigzag with labels, optional dashed diagonals, and optional fill.
 */

export interface PatternConfig {
	/** Total points the user must click */
	points: number;
	/** Label for each point (length === points) */
	labels: string[];
	/** Pairs of point indices for dashed diagonal lines (e.g. [0,2] = line from pt0 to pt2) */
	diagonals?: [number, number][];
	/** If true, fill when complete (see fillTriangles for shape) */
	fill?: boolean;
	/** Optional triangles (vertex indices) to fill instead of one closed N-gon — e.g. XAB + BCD for XABCD */
	fillTriangles?: [number, number, number][];
}

export const PATTERN_TOOLS: Record<string, PatternConfig> = {
	xabcd: {
		points: 5,
		labels: ['X', 'A', 'B', 'C', 'D'],
		diagonals: [[0, 2], [1, 3], [0, 4], [2, 4]],
		fill: true,
		fillTriangles: [[0, 1, 2], [2, 3, 4]],
	},
	cypher: {
		points: 5,
		labels: ['X', 'A', 'B', 'C', 'D'],
		diagonals: [[0, 2], [1, 3], [0, 4], [2, 4]],
		fill: true,
		fillTriangles: [[0, 1, 2], [2, 3, 4]],
	},
	'head-and-shoulders': {
		points: 7,
		labels: ['', 'Left shoulder', '', 'Head', '', 'Right shoulder', ''],
		diagonals: [[2, 4]],
		fill: false,
	},
	abcd:                  { points: 4, labels: ['A', 'B', 'C', 'D'], diagonals: [[0, 2], [1, 3]], fill: false },
	'elliott-impulse':     { points: 6, labels: ['0', '1', '2', '3', '4', '5'], fill: false },
	'elliott-correction':  { points: 4, labels: ['0', 'A', 'B', 'C'], fill: false },
	'elliott-triangle':    { points: 6, labels: ['0', 'A', 'B', 'C', 'D', 'E'], fill: false },
	'elliott-double-combo':{ points: 4, labels: ['0', 'W', 'X', 'Y'], fill: false },
	'elliott-triple-combo':{ points: 6, labels: ['0', 'W', 'X', 'Y', 'X\'', 'Z'], fill: false },
};

export function isPatternTool(type: string | null): boolean {
	return type != null && type in PATTERN_TOOLS;
}

export function getPatternConfig(type: string): PatternConfig | null {
	return PATTERN_TOOLS[type] ?? null;
}
