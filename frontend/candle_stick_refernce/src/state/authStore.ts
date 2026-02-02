import { create } from 'zustand';

type User = { id: number; username: string; role: string } | null;

type AuthState = {
	user: User;
	isAuthenticated: boolean;
	isLoading: boolean;
	error: string | null;
	login: (username: string, password: string) => Promise<boolean>;
	logout: () => Promise<void>;
	hydrate: () => Promise<void>;
};

export const useAuthStore = create<AuthState>((set) => ({
	user: null,
	isAuthenticated: false,
	isLoading: false,
	error: null,

	hydrate: async () => {
		try {
			const res = await fetch('/api/auth/me', { credentials: 'include' });
			const data = await res.json();
			if (data.authenticated) {
				set({ user: { id: data.id, username: data.username, role: data.role }, isAuthenticated: true });
			} else {
				set({ user: null, isAuthenticated: false });
			}
		} catch {
			set({ user: null, isAuthenticated: false });
		}
	},

	login: async (username: string, password: string) => {
		set({ isLoading: true, error: null });
		try {
			const res = await fetch('/api/auth/login', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify({ username, password }),
			});
			const data = await res.json();
			if (!res.ok) {
				set({ error: data.error || 'Invalid credentials', isLoading: false, isAuthenticated: false, user: null });
				return false;
			}
			set({
				user: { id: data.id, username: data.username, role: data.role },
				isAuthenticated: true,
				isLoading: false,
				error: null,
			});
			return true;
		} catch {
			set({ error: 'Login failed', isLoading: false, isAuthenticated: false, user: null });
			return false;
		}
	},

	logout: async () => {
		try {
			await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
		} finally {
			set({ user: null, isAuthenticated: false, error: null });
		}
	},
}));


