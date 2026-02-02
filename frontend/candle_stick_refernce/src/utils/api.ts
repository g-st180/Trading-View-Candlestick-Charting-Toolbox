export function getApiBase(): string {
	// Vite injects env vars under import.meta.env; we keep a safe fallback for local dev.
	const env = (import.meta as any).env;
	return (env && env.VITE_API_BASE) || window.location.origin;
}

export async function fetchJson<T = unknown>(path: string, init?: RequestInit): Promise<T> {
	const base = getApiBase();
	const url = path.startsWith('http') ? path : `${base}${path.startsWith('/') ? '' : '/'}${path}`;
	const res = await fetch(url, init);
	if (!res.ok) {
		// Preserve backend error details when possible.
		const text = await res.text().catch(() => '');
		throw new Error(text || `Request failed: ${res.status} ${res.statusText}`);
	}
	return (await res.json()) as T;
}

