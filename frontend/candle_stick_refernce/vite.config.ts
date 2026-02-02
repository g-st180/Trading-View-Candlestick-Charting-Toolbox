import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';

// Optional logs plugin kept for local raw log viewing; can be removed if not used
const logsPlugin = (): Plugin => ({
	name: 'live-logs-sse',
	configureServer(server) {
		const logFile = path.resolve(server.config.root, '..', 'logs', 'live_simulator.log');

		// Raw log download
		server.middlewares.use('/__logs/raw', (req: any, res: any) => {
			res.setHeader('Content-Type', 'text/plain; charset=utf-8');
			if (!fs.existsSync(logFile)) {
				res.statusCode = 404;
				res.end('log file not found');
				return;
			}
			fs.createReadStream(logFile).pipe(res);
		});

		// SSE tail stream
		server.middlewares.use('/__logs', (req: any, res: any) => {
			res.writeHead(200, {
				'Content-Type': 'text/event-stream',
				'Cache-Control': 'no-cache, no-transform',
				Connection: 'keep-alive',
				'Access-Control-Allow-Origin': '*',
			});

			const sendLine = (line: string) => {
				res.write(`data: ${JSON.stringify({ line })}\n\n`);
			};

			let position = 0;
			try {
				const stat = fs.statSync(logFile);
				const start = Math.max(0, stat.size - 64 * 1024);
				const stream = fs.createReadStream(logFile, { start, end: stat.size });
				position = stat.size;
				stream.on('data', (chunk) => {
					const text = chunk.toString('utf8');
					text.split(/\r?\n/).filter(Boolean).forEach(sendLine);
				});
			} catch {
				// file may not exist yet; continue to watch directory
			}

			const dir = path.dirname(logFile);
			// Ensure directory exists to avoid ENOENT on fs.watch
			try {
				if (!fs.existsSync(dir)) {
					fs.mkdirSync(dir, { recursive: true });
				}
			} catch {
				// ignore create errors; we'll skip watching if cannot create
			}
			let watcher: any = null;
			try {
				watcher = fs.watch(dir, { persistent: true }, () => {
				try {
					const stat = fs.statSync(logFile);
					if (stat.size > position) {
						const stream = fs.createReadStream(logFile, { start: position, end: stat.size });
						position = stat.size;
						stream.on('data', (chunk) => {
							const text = chunk.toString('utf8');
							text.split(/\r?\n/).filter(Boolean).forEach(sendLine);
						});
					}
				} catch {
					// ignore transient errors
				}
				});
			} catch {
				// If watching fails (dir missing), emit a single advisory line and continue SSE
				sendLine('No logs directory found. Create "logs/live_simulator.log" to stream logs.');
			}

			const keepAlive = setInterval(() => res.write(':keep-alive\n\n'), 20000);
			req.on('close', () => {
				clearInterval(keepAlive);
				try { watcher && watcher.close(); } catch {}
				try { res.end(); } catch {}
			});
		});
	},
});

const API_BASE = process.env.VITE_API_BASE || 'http://localhost:5000';

export default defineConfig({
	plugins: [react(), logsPlugin()],
	server: {
		port: 5173,
		host: true,
		// Allow access via Cloudflare tunnel/custom host (any subdomain)
		// Vite supports leading-dot wildcard matching for subdomains
		allowedHosts: ['.trycloudflare.com'],
		proxy: {
			'/api': {
				target: API_BASE,
				changeOrigin: true,
				// ensure the path remains /api/...
				rewrite: (p) => p,
			},
		},
	},
});
