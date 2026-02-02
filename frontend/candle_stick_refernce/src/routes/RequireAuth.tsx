import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuthStore } from '../state/authStore';

export default function RequireAuth() {
	const isAuthenticated = useAuthStore(s => s.isAuthenticated);
	const hydrate = useAuthStore(s => s.hydrate);
	const location = useLocation();

	useEffect(() => {
		if (!isAuthenticated) {
			hydrate();
		}
	}, [isAuthenticated]);

	if (!isAuthenticated) {
		return <Navigate to="/" replace state={{ from: location }} />;
	}
	return <Outlet />;
}


