import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuthStore } from './state/authStore';

export default function App() {
	const isAuthenticated = useAuthStore(s => s.isAuthenticated);
	const hydrate = useAuthStore(s => s.hydrate);
	const logout = useAuthStore(s => s.logout);
	const navigate = useNavigate();

	useEffect(() => {
		hydrate();
		const id = setInterval(() => {
			hydrate();
		}, 60000);
		return () => clearInterval(id);
	}, []);

    return (
        <div className="min-h-screen app-surface">
            <header className="sticky top-0 z-50 border-b border-cyan-500/20 bg-black/90 backdrop-blur-md supports-[backdrop-filter]:bg-black/80 shadow-lg">
                <div className="h-0.5 w-full bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent"></div>
                <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
					<nav className="flex items-center gap-6 text-sm">
						{isAuthenticated ? (
							<>
								<NavLink to="/portfolio-metrics" className={({ isActive }) => isActive ? 'nav-active text-cyan-400' : 'nav-link text-gray-400 hover:text-cyan-300'}>Portfolio</NavLink>
								<NavLink to="/trade" end className={({ isActive }) => isActive ? 'nav-active text-cyan-400' : 'nav-link text-gray-400 hover:text-cyan-300'}>Trade</NavLink>
								<NavLink to="/technical-metrics" className={({ isActive }) => isActive ? 'nav-active text-cyan-400' : 'nav-link text-gray-400 hover:text-cyan-300'}>Backend</NavLink>
								<NavLink to="/logs" className={({ isActive }) => isActive ? 'nav-active text-cyan-400' : 'nav-link text-gray-400 hover:text-cyan-300'}>Logs</NavLink>
								<button
									onClick={async () => { await logout(); navigate('/'); }}
									className="text-gray-400 hover:text-cyan-300 transition-colors"
								>
									Logout
								</button>
							</>
						) : null}
                    </nav>
                </div>
            </header>
            <main className="mx-auto max-w-full">
                <Outlet />
            </main>
        </div>
    );
}
