import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Navigation from './components/Navigation';
import Dashboard from './pages/Dashboard';
import Terminal from './pages/Terminal';
import MutualFunds from './pages/MutualFunds';
import Holdings from './pages/Holdings';
import Positions from './pages/Positions';
import Orders from './pages/Orders';

function App() {
	return (
		<Router>
			<div className="min-h-screen bg-slate-50">
				<Navigation />
				<Routes>
					<Route path="/" element={<Navigate to="/dashboard" replace />} />
					<Route path="/dashboard" element={<Dashboard />} />
					<Route path="/terminal" element={<Terminal />} />
					<Route path="/mutual-funds" element={<MutualFunds />} />
					<Route path="/holdings" element={<Holdings />} />
					<Route path="/positions" element={<Positions />} />
					<Route path="/orders" element={<Orders />} />
				</Routes>
			</div>
		</Router>
	);
}

export default App;
