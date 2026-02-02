import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import App from './App';
import './styles/index.css';
import './styles/datepicker-override.css';
import DashboardPage from './routes/DashboardPage';
import AdminPage from './routes/AdminPage';
import RequireAuth from './routes/RequireAuth';
import TechnicalMetricsPage from './routes/TechnicalMetricsPage';
import PortfolioMetricsPage from './routes/PortfolioMetricsPage';
const router = createBrowserRouter([
	{
		path: '/',
		element: <App />,
		children: [
			{ path: '', element: <AdminPage /> },
			{
				element: <RequireAuth />,
				children: [
					{ path: 'trade', element: <DashboardPage /> },
					{ path: 'portfolio-metrics', element: <PortfolioMetricsPage /> },
					{ path: 'technical-metrics', element: <TechnicalMetricsPage /> },
					{ path: 'logs', lazy: () => import('./routes/LogsPage') },
				],
			},
		],
	},
]);

const rootElement = document.getElementById('root');
if (!rootElement) {
	throw new Error('Root element with id "root" not found');
}

createRoot(rootElement).render(
	<StrictMode>
		<RouterProvider router={router} />
	</StrictMode>
);
