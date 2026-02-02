// Helper to format seconds into a more readable string (e.g., 1h 2m 3s)
export function formatDuration(seconds: number): string {
	if (seconds < 60) return `${seconds.toFixed(0)}s`;
	const h = Math.floor(seconds / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	const s = Math.floor(seconds % 60);
	let str = '';
	if (h > 0) str += `${h}h `;
	if (m > 0) str += `${m}m `;
	if (s > 0 && h === 0) str += `${s}s`; // Only show seconds if no hours
	return str.trim() || '0s';
}

