// Minimal node shims to allow `tsc -b` to typecheck `vite.config.ts` without pulling in @types/node.
// This keeps the repo self-contained and avoids adding dev deps just for config typing.

declare module 'node:fs' {
	const fs: any;
	export default fs;
	export type FSWatcher = any;
}

declare module 'node:path' {
	const path: any;
	export default path;
}

declare const process: { env: Record<string, string | undefined> };
declare function setInterval(handler: (...args: any[]) => void, timeout?: number, ...args: any[]): any;
declare function clearInterval(intervalId: any): void;

