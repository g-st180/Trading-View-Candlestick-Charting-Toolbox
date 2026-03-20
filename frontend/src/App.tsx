/**
 * App — Root component with routing configuration.
 * Single route: "/" renders the FullscreenChart page.
 * All other routes redirect to "/" via catch-all.
 */
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Navigation from './components/Navigation';
import FullscreenChart from './pages/FullscreenChart';

function App() {
	return (
		<Router>
			<div className="h-screen overflow-hidden bg-slate-50 flex flex-col">
				<Navigation />
				<div className="flex-1 min-h-0 flex flex-col">
					<Routes>
						<Route path="/" element={<FullscreenChart />} />
						<Route path="*" element={<Navigate to="/" replace />} />
					</Routes>
				</div>
			</div>
		</Router>
	);
}

export default App;
