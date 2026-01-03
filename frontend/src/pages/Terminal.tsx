import { useState } from 'react';
import CandlestickChart from '../CandlestickChart';
import Watchlist from '../components/Watchlist';

export default function Terminal() {
	const [activeTab, setActiveTab] = useState<'chart' | 'option-chain' | 'orders' | 'positions'>('chart');

	const tabs = [
		{ id: 'chart', label: 'Chart' },
		{ id: 'option-chain', label: 'Option Chain' },
		{ id: 'orders', label: 'Orders' },
		{ id: 'positions', label: 'Positions' },
	];

	return (
		<div className="h-[calc(100vh-7rem)] flex flex-col">
			{/* Tab Navigation */}
			<div className="bg-white border-b border-slate-200">
				<div className="max-w-[1920px] mx-auto px-4 sm:px-6 lg:px-8">
					<div className="flex items-center space-x-1">
						{tabs.map((tab) => (
							<button
								key={tab.id}
								onClick={() => setActiveTab(tab.id as any)}
								className={`px-4 py-2 text-sm font-medium transition-colors ${
									activeTab === tab.id
										? 'text-blue-600 border-b-2 border-blue-600'
										: 'text-slate-600 hover:text-slate-900'
								}`}
							>
								{tab.label}
							</button>
						))}
					</div>
				</div>
			</div>

			{/* Main Content Area */}
			<div className="flex-1 overflow-hidden">
				<div className="h-full grid grid-cols-12 gap-4 p-4">
					{/* Left Side - Chart/Content */}
					<div className="col-span-12 lg:col-span-8 flex flex-col h-full">
						{activeTab === 'chart' && (
							<div className="flex-1 bg-white rounded-lg border border-slate-200 overflow-hidden">
								<CandlestickChart />
							</div>
						)}
						{activeTab === 'option-chain' && (
							<div className="flex-1 bg-white rounded-lg border border-slate-200 p-6">
								<div className="text-center text-slate-400 py-12">
									<p>Option Chain coming soon...</p>
								</div>
							</div>
						)}
						{activeTab === 'orders' && (
							<div className="flex-1 bg-white rounded-lg border border-slate-200 p-6">
								<div className="text-center text-slate-400 py-12">
									<p>Orders view coming soon...</p>
								</div>
							</div>
						)}
						{activeTab === 'positions' && (
							<div className="flex-1 bg-white rounded-lg border border-slate-200 p-6">
								<div className="text-center text-slate-400 py-12">
									<p>Positions view coming soon...</p>
								</div>
							</div>
						)}
					</div>

					{/* Right Side - Watchlist */}
					<div className="hidden lg:block col-span-4">
						<Watchlist />
					</div>
				</div>
			</div>
		</div>
	);
}

