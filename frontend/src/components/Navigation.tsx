import { Link } from 'react-router-dom';

export default function Navigation() {
	return (
		<nav className="bg-white border-b border-slate-200 sticky top-0 z-50 shadow-sm">
			<div className="max-w-[1920px] mx-auto px-8 sm:px-10 lg:px-12">
				<div className="flex items-center justify-between h-14">
					{/* Left side - Logo and Main Navigation */}
					<div className="flex items-center space-x-8">
						{/* Logo */}
						<Link to="/" className="flex items-center">
							<span className="text-xl font-bold text-slate-900">GROWW</span>
						</Link>
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
			</div>
		</nav>
	);
}

