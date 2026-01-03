import { Link, useLocation } from 'react-router-dom';
import { useState } from 'react';

export default function Navigation() {
	const location = useLocation();
	const [searchQuery, setSearchQuery] = useState('');

	const mainNavItems = [
		{ path: '/dashboard', label: 'Stocks' },
		{ path: '/terminal', label: 'F&O' },
		{ path: '/mutual-funds', label: 'Mutual Funds' },
	];

	const userNavItems = [
		{ path: '/holdings', label: 'Holdings' },
		{ path: '/positions', label: 'Positions' },
		{ path: '/orders', label: 'Orders' },
	];

	return (
		<nav className="bg-white border-b border-slate-200 sticky top-0 z-50 shadow-sm">
			<div className="max-w-[1920px] mx-auto px-4 sm:px-6 lg:px-8">
				<div className="flex items-center justify-between h-14">
					{/* Left side - Logo and Main Navigation */}
					<div className="flex items-center space-x-8">
						{/* Logo */}
						<Link to="/dashboard" className="flex items-center">
							<span className="text-xl font-bold text-slate-900">GROWW</span>
						</Link>

						{/* Main Navigation */}
						<div className="hidden md:flex items-center space-x-1">
							{mainNavItems.map((item) => {
								const isActive = location.pathname === item.path || 
									(item.path === '/dashboard' && location.pathname === '/');
								return (
									<Link
										key={item.path}
										to={item.path}
										className={`relative px-3 py-1.5 text-sm font-medium rounded transition-colors ${
											isActive
												? 'text-slate-900'
												: 'text-slate-600 hover:text-slate-900'
										}`}
									>
										{item.label}
										{isActive && (
											<span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600"></span>
										)}
									</Link>
								);
							})}
						</div>
					</div>

					{/* Right side - Balance, Search, User Menu */}
					<div className="flex items-center gap-4">
						{/* Balance Display */}
						<div className="hidden lg:flex items-center gap-4 text-sm">
							<div className="text-slate-600">
								<span className="text-slate-400">Stocks, F&O balance</span>
							</div>
							<div className="font-semibold text-slate-900">₹1,25,000.00</div>
						</div>

						{/* Search Box */}
						<div className="relative hidden md:block">
							<input
								type="text"
								placeholder="Search stocks, ETFs, Mutual Funds..."
								value={searchQuery}
								onChange={(e) => setSearchQuery(e.target.value)}
								className="pl-10 pr-4 py-1.5 w-72 bg-slate-50 border border-slate-200 rounded-md text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
							/>
							<svg
								className="absolute left-3 top-1.5 h-4 w-4 text-slate-400"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={2}
									d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
								/>
							</svg>
						</div>

						{/* User Menu */}
						<div className="flex items-center gap-2">
							<button className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-all">
								<svg
									className="h-5 w-5"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={2}
										d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
									/>
								</svg>
							</button>
						</div>
					</div>
				</div>

				{/* Secondary Navigation - User specific routes */}
				<div className="flex items-center space-x-6 h-10 border-t border-slate-100">
					{userNavItems.map((item) => {
						const isActive = location.pathname === item.path;
						return (
							<Link
								key={item.path}
								to={item.path}
								className={`px-2 py-1.5 text-xs font-medium transition-colors ${
									isActive
										? 'text-blue-600'
										: 'text-slate-600 hover:text-slate-900'
								}`}
							>
								{item.label}
							</Link>
						);
					})}
				</div>
			</div>
		</nav>
	);
}

