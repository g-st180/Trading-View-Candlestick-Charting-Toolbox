import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Navigation from './components/Navigation';
import FullscreenChart from './pages/FullscreenChart';

function App() {
	return (
		<Router>
			<div className="min-h-screen bg-slate-50">
				<Navigation />
				<Routes>
					<Route path="/" element={<FullscreenChart />} />
					<Route path="*" element={<Navigate to="/" replace />} />
				</Routes>
			</div>
		</Router>
	);
}

export default App;
