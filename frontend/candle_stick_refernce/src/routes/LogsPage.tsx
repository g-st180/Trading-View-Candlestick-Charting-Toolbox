import { useEffect, useRef, useState } from 'react';

export function Component() {
	const [lines, setLines] = useState<string[]>([]);
	const eventSourceRef = useRef<EventSource | null>(null);

	useEffect(() => {
		const url = import.meta.env.VITE_LOGS_SSE_URL || '/__logs';
		const es = new EventSource(url);
		eventSourceRef.current = es;

		es.addEventListener('message', (ev) => {
			try {
				const data = JSON.parse(ev.data) as { line: string };
                setLines((prev) => {
                    const next = [...prev, data.line];
                    if (next.length > 1500) next.splice(0, next.length - 1500);
                    return next;
                });
			} catch {
				// ignore bad lines
			}
		});

		es.addEventListener('error', () => {
			// Allow browser to reconnect automatically
		});

		return () => {
			es.close();
			eventSourceRef.current = null;
		};
	}, []);

	return (
		<div className="metallic-emerald-bg min-h-screen px-6 py-8">
			<section className="rounded-lg border border-cyan-500/20 bg-black/80 backdrop-blur-sm shadow-lg">
				<header className="flex items-center justify-between border-b border-cyan-500/20 px-4 py-3">
					<h2 className="text-sm font-semibold uppercase tracking-wide text-gray-200">Live Logs</h2>
					<a href="/__logs/raw" target="_blank" className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors">Open raw</a>
				</header>
				{lines.length === 0 ? (
					<div className="p-4 text-sm text-gray-400">No logs yet.</div>
				) : (
					<pre className="max-h-[70vh] overflow-auto p-4 text-xs leading-5 text-gray-300 font-mono">
						{lines.join('\n')}
					</pre>
				)}
			</section>
		</div>
	);
}

export default Component;
