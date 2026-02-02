import { Link, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuthStore } from '../state/authStore';

export default function AdminPage() {
	const isAuthenticated = useAuthStore(s => s.isAuthenticated);
	const isLoading = useAuthStore(s => s.isLoading);
	const error = useAuthStore(s => s.error);
	const login = useAuthStore(s => s.login);
	const logout = useAuthStore(s => s.logout);
	const hydrate = useAuthStore(s => s.hydrate);

	// Login form state
	const [username, setUsername] = useState('');
	const [password, setPassword] = useState('');
	const [showPassword, setShowPassword] = useState(false);
	const [mode, setMode] = useState<'login' | 'reset' | 'bootstrap'>('login');

	// Reset-password state (must be outside condition to preserve hooks order)
	const genericQuestions = [
		"What was your first pet's name?",
		"What city were you born in?",
		"What is your favorite teacher's name?",
		"What is your favorite book?",
	];
	const [resetUsername, setResetUsername] = useState('');
	const [resetQuestion, setResetQuestion] = useState(genericQuestions[0]);
	const [resetAnswer, setResetAnswer] = useState('');
	const [newPassword, setNewPassword] = useState('');
	const [resetSubmitting, setResetSubmitting] = useState(false);
	const [resetMessage, setResetMessage] = useState<string | null>(null);
	const [resetError, setResetError] = useState<string | null>(null);

	// Add Admin User form state (moved from Settings)
	const [addUsername, setAddUsername] = useState('');
	const [addPassword, setAddPassword] = useState('');
	const [addQuestion, setAddQuestion] = useState('');
	const [addAnswer, setAddAnswer] = useState('');
	const [addSubmitting, setAddSubmitting] = useState(false);
	const [addMessage, setAddMessage] = useState<string | null>(null);
	const [addError, setAddError] = useState<string | null>(null);
	const [addShowPassword, setAddShowPassword] = useState(false);

	const navigate = useNavigate();

	useEffect(() => {
		hydrate();
		// Detect if there are any users; if none, switch to bootstrap mode
		(async () => {
			try {
				const res = await fetch('/api/auth/has_users', { credentials: 'include' });
				const data = await res.json();
				if (res.ok && data && data.has_users === false) {
					setMode('bootstrap');
				}
			} catch {
				// ignore
			}
		})();
	}, []);

	const onAddUser = async (e: React.FormEvent) => {
		e.preventDefault();
		setAddSubmitting(true);
		setAddMessage(null);
		setAddError(null);
		try {
			const res = await fetch('/api/admin/users', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify({
					username: addUsername,
					password: addPassword,
					role: 'admin',
					security_question: addQuestion,
					security_answer: addAnswer,
				}),
			});
			const data = await res.json();
			if (!res.ok) {
				setAddError(data.error || 'Failed to add user');
			} else {
				setAddMessage(`User '${data.username}' created`);
				// If we're bootstrapping, auto-login and go to Trade
				if (mode === 'bootstrap') {
					const ok = await login(addUsername, addPassword);
					if (ok) {
						navigate('/trade', { replace: true });
						return;
					}
				}
				setAddUsername('');
				setAddPassword('');
				setAddAnswer('');
			}
		} catch {
			setAddError('Failed to add user');
		} finally {
			setAddSubmitting(false);
		}
	};

	const onResetPassword = async (e: React.FormEvent) => {
		e.preventDefault();
		setResetSubmitting(true);
		setResetMessage(null);
		setResetError(null);
		try {
			const res = await fetch('/api/auth/reset_password', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify({
					username: resetUsername,
					security_question: resetQuestion,
					security_answer: resetAnswer,
					new_password: newPassword,
				}),
			});
			const data = await res.json();
			if (!res.ok) {
				setResetError(data.error || 'Failed to reset password');
			} else {
				setResetMessage('Password reset successful. You can now sign in.');
				// Prefill username on login form and switch mode after short delay
				setUsername(resetUsername);
				setTimeout(() => setMode('login'), 1200);
				setResetAnswer('');
				setNewPassword('');
			}
		} catch {
			setResetError('Failed to reset password');
		} finally {
			setResetSubmitting(false);
		}
	};

	if (!isAuthenticated) {
		if (mode === 'bootstrap') {
			return (
				<div className="metallic-emerald-bg min-h-screen flex items-center justify-center px-6 py-8">
					<div className="w-full max-w-lg">
						<div className="rounded-lg border border-cyan-500/20 bg-black/80 backdrop-blur-sm shadow-lg p-6">
							<h1 className="metallic-title text-2xl font-semibold uppercase tracking-wide">Create Admin User</h1>
							<p className="mt-1 text-sm text-gray-400">No admin users found. Create the first admin account.</p>
						<form className="mt-4 space-y-4" onSubmit={onAddUser}>
							<div>
								<label className="block text-sm font-medium text-gray-300">Username</label>
								<input className="mt-1 w-full rounded-md border border-cyan-500/30 bg-black/50 px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50" value={addUsername} onChange={e => setAddUsername(e.target.value)} required />
							</div>
							<div>
								<label className="block text-sm font-medium text-gray-300">Password</label>
								<div className="mt-1 relative">
									<input
										type={addShowPassword ? 'text' : 'password'}
										className="w-full rounded-md border border-cyan-500/30 bg-black/50 px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50"
										value={addPassword}
										onChange={e => setAddPassword(e.target.value)}
										required
									/>
									<button
										type="button"
										onClick={() => setAddShowPassword(v => !v)}
										className="absolute inset-y-0 right-0 px-3 text-sm text-gray-400 hover:text-cyan-300"
										tabIndex={-1}
									>
										{addShowPassword ? 'Hide' : 'Show'}
									</button>
								</div>
							</div>
							<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
								<div>
									<label className="block text-sm font-medium text-gray-300">Security Question</label>
									<select
										className="mt-1 w-full rounded-md border border-cyan-500/30 bg-black/50 px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50"
										value={addQuestion}
										onChange={e => setAddQuestion(e.target.value)}
										required
									>
										<option value="" disabled hidden className="bg-black">
											Select a question
										</option>
										{genericQuestions.map(q => <option key={q} value={q} className="bg-black">{q}</option>)}
									</select>
								</div>
								<div>
									<label className="block text-sm font-medium text-gray-300">Security Answer</label>
									<input className="mt-1 w-full rounded-md border border-cyan-500/30 bg-black/50 px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50" value={addAnswer} onChange={e => setAddAnswer(e.target.value)} />
								</div>
							</div>
							<div className="flex items-center gap-3">
								<button disabled={addSubmitting} className="rounded-md border border-cyan-500/30 bg-cyan-500/20 px-4 py-2 text-sm font-medium text-cyan-400 hover:bg-cyan-500/30 hover:border-cyan-500/50 disabled:bg-black/50 disabled:text-gray-500 disabled:border-gray-700 transition-colors">
									{addSubmitting ? 'Creating…' : 'Create User'}
								</button>
								{addMessage && <span className="text-sm text-emerald-400">{addMessage}</span>}
								{addError && <span className="text-sm text-red-400">{addError}</span>}
							</div>
						</form>
					</div>
				</div>
			</div>
			);
		}
		return (
			<div className="metallic-emerald-bg min-h-screen flex items-center justify-center px-6 py-8">
				<div className="w-full max-w-md">
					<div className="rounded-lg border border-cyan-500/20 bg-black/80 backdrop-blur-sm shadow-lg p-6">
						<h1 className="metallic-title text-2xl font-semibold uppercase tracking-wide">
							{mode === 'login' ? 'Admin Login' : 'Reset Password'}
						</h1>
						{mode === 'login' ? (
							<>
								<p className="mt-1 text-sm text-gray-400">Enter your credentials to continue.</p>
							<form
								className="mt-6 space-y-4"
								onSubmit={async (e) => {
									e.preventDefault();
									const ok = await login(username, password);
									if (ok) {
										// Always go to Trade regardless of requested route
										navigate('/trade', { replace: true });
									}
								}}
							>
								<div>
									<label className="block text-sm font-medium text-gray-300">Username</label>
									<input
										type="text"
										className="mt-1 w-full rounded-md border border-cyan-500/30 bg-black/50 px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50"
										placeholder="Enter admin username"
										value={username}
										onChange={(e) => setUsername(e.target.value)}
										disabled={isLoading}
										autoFocus
									/>
								</div>
								<div>
									<label className="block text-sm font-medium text-gray-300">Password</label>
									<div className="mt-1 relative">
										<input
											type={showPassword ? 'text' : 'password'}
											className="w-full rounded-md border border-cyan-500/30 bg-black/50 px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50"
											placeholder="Enter admin password"
											value={password}
											onChange={(e) => setPassword(e.target.value)}
											disabled={isLoading}
										/>
										<button
											type="button"
											onClick={() => setShowPassword(v => !v)}
											className="absolute inset-y-0 right-0 px-3 text-sm text-gray-400 hover:text-cyan-300"
											tabIndex={-1}
										>
											{showPassword ? 'Hide' : 'Show'}
										</button>
									</div>
									{error && <p className="mt-1 text-sm text-red-400">{error}</p>}
								</div>
								<button
									type="submit"
									className="w-full inline-flex items-center justify-center rounded-md border border-cyan-500/30 bg-cyan-500/20 px-4 py-2 text-sm font-medium text-cyan-400 hover:bg-cyan-500/30 hover:border-cyan-500/50 disabled:bg-black/50 disabled:text-gray-500 disabled:border-gray-700 disabled:cursor-not-allowed transition-colors"
									disabled={isLoading}
								>
									{isLoading ? 'Signing in…' : 'Sign in'}
								</button>
							</form>
							<div className="mt-3 text-right">
								<button
									className="text-sm text-cyan-400 hover:text-cyan-300 transition-colors"
									onClick={() => setMode('reset')}
								>
									Forgot password?
								</button>
							</div>
						</>
					) : (
						<>
							<p className="mt-1 text-sm text-gray-400">Answer your security question to reset your password.</p>
							<form className="mt-6 space-y-4" onSubmit={onResetPassword}>
								<div>
									<label className="block text-sm font-medium text-gray-300">Username</label>
									<input
										className="mt-1 w-full rounded-md border border-cyan-500/30 bg-black/50 px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50"
										value={resetUsername}
										onChange={e => setResetUsername(e.target.value)}
										required
									/>
								</div>
								<div>
									<label className="block text-sm font-medium text-gray-300">Security Question</label>
									<select
										className="mt-1 w-full rounded-md border border-cyan-500/30 bg-black/50 px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50"
										value={resetQuestion}
										onChange={e => setResetQuestion(e.target.value)}
									>
										{genericQuestions.map(q => <option key={q} value={q} className="bg-black">{q}</option>)}
									</select>
								</div>
								<div>
									<label className="block text-sm font-medium text-gray-300">Security Answer</label>
									<input
										className="mt-1 w-full rounded-md border border-cyan-500/30 bg-black/50 px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50"
										value={resetAnswer}
										onChange={e => setResetAnswer(e.target.value)}
										required
									/>
								</div>
								<div>
									<label className="block text-sm font-medium text-gray-300">New Password</label>
									<input
										type="password"
										className="mt-1 w-full rounded-md border border-cyan-500/30 bg-black/50 px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50"
										value={newPassword}
										onChange={e => setNewPassword(e.target.value)}
										required
									/>
								</div>
								<div className="flex items-center gap-3">
									<button
										disabled={resetSubmitting}
										className="rounded-md border border-cyan-500/30 bg-cyan-500/20 px-4 py-2 text-sm font-medium text-cyan-400 hover:bg-cyan-500/30 hover:border-cyan-500/50 disabled:bg-black/50 disabled:text-gray-500 disabled:border-gray-700 transition-colors"
									>
										{resetSubmitting ? 'Resetting…' : 'Reset Password'}
									</button>
									{resetMessage && <span className="text-sm text-emerald-400">{resetMessage}</span>}
									{resetError && <span className="text-sm text-red-400">{resetError}</span>}
								</div>
							</form>
							<div className="mt-3 text-right">
								<button
									className="text-sm text-cyan-400 hover:text-cyan-300 transition-colors"
									onClick={() => setMode('login')}
								>
									Back to login
								</button>
							</div>
						</>
					)}
				</div>
			</div>
		</div>
		);
	}

	return (
		<div className="metallic-emerald-bg min-h-screen px-6 py-8 space-y-6">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-semibold uppercase tracking-wide text-gray-200">Admin Panel</h1>
					<p className="mt-1 text-sm text-gray-400">Manage simulator settings and navigate to trading.</p>
				</div>
				<div>
					<button
						onClick={() => logout()}
						className="inline-flex items-center justify-center rounded-lg border border-cyan-500/30 bg-black/50 px-4 py-2 text-sm font-medium text-gray-300 hover:bg-black/70 hover:border-cyan-500/50 transition-colors"
					>
						Log out
					</button>
				</div>
			</div>

			<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
				<div className="metric-card-glow rounded-lg border border-cyan-500/20 bg-black/70 backdrop-blur-sm p-6">
					<h2 className="metallic-title text-lg font-medium uppercase tracking-wide mb-2">Quick Actions</h2>
					<p className="mt-1 text-sm text-gray-400">Jump straight into trading and monitoring.</p>
					<div className="mt-4 flex items-center gap-3">
						<Link
							to="/trade"
							className="inline-flex items-center justify-center rounded-lg border border-cyan-500/30 bg-cyan-500/20 px-5 py-2.5 text-sm font-medium text-cyan-400 hover:bg-cyan-500/30 hover:border-cyan-500/50 transition-colors"
						>
							Go to Trade
						</Link>
						<Link
							to="/portfolio-metrics"
							className="inline-flex items-center justify-center rounded-lg border border-cyan-500/30 bg-black/50 px-5 py-2.5 text-sm font-medium text-gray-300 hover:bg-black/70 hover:border-cyan-500/50 transition-colors"
						>
							Portfolio Metrics
						</Link>
					</div>
				</div>

				<div className="metric-card-glow rounded-lg border border-cyan-500/20 bg-black/70 backdrop-blur-sm p-6">
					<h2 className="metallic-title text-lg font-medium uppercase tracking-wide mb-2">System</h2>
					<ul className="mt-3 text-sm text-gray-300 list-disc list-inside space-y-1">
						<li>Frontend build: Vite + React + Tailwind</li>
						<li>Backend API: Flask at http://localhost:5000</li>
						<li>Environment: Local development</li>
					</ul>
				</div>

				{/* Add Admin User (moved from Settings) */}
				<div className="metric-card-glow rounded-lg border border-cyan-500/20 bg-black/70 backdrop-blur-sm p-6 md:col-span-2">
					<h2 className="metallic-title text-lg font-medium uppercase tracking-wide mb-2">Add Admin User</h2>
					<p className="mt-1 text-sm text-gray-400">Create a new admin account.</p>
					<form className="mt-4 space-y-4" onSubmit={onAddUser}>
						<div>
							<label className="block text-sm font-medium text-gray-300">Username</label>
							<input className="mt-1 w-full rounded-md border border-cyan-500/30 bg-black/50 px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50" value={addUsername} onChange={e => setAddUsername(e.target.value)} required />
						</div>
						<div>
							<label className="block text-sm font-medium text-gray-300">Password</label>
							<div className="mt-1 relative">
								<input
									type={addShowPassword ? 'text' : 'password'}
									className="w-full rounded-md border border-cyan-500/30 bg-black/50 px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50"
									value={addPassword}
									onChange={e => setAddPassword(e.target.value)}
									required
								/>
								<button
									type="button"
									onClick={() => setAddShowPassword(v => !v)}
									className="absolute inset-y-0 right-0 px-3 text-sm text-gray-400 hover:text-cyan-300"
									tabIndex={-1}
								>
									{addShowPassword ? 'Hide' : 'Show'}
								</button>
							</div>
						</div>
						<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
							<div>
								<label className="block text-sm font-medium text-gray-300">Security Question</label>
								<select
									className="mt-1 w-full rounded-md border border-cyan-500/30 bg-black/50 px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50"
									value={addQuestion}
									onChange={e => setAddQuestion(e.target.value)}
									required
								>
									<option value="" disabled hidden className="bg-black">
										Select a question
									</option>
									{genericQuestions.map(q => <option key={q} value={q} className="bg-black">{q}</option>)}
								</select>
							</div>
							<div>
								<label className="block text-sm font-medium text-gray-300">Security Answer</label>
								<input className="mt-1 w-full rounded-md border border-cyan-500/30 bg-black/50 px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50" value={addAnswer} onChange={e => setAddAnswer(e.target.value)} />
							</div>
						</div>
						<div className="flex items-center gap-3">
							<button disabled={addSubmitting} className="rounded-md border border-cyan-500/30 bg-cyan-500/20 px-4 py-2 text-sm font-medium text-cyan-400 hover:bg-cyan-500/30 hover:border-cyan-500/50 disabled:bg-black/50 disabled:text-gray-500 disabled:border-gray-700 transition-colors">
								{addSubmitting ? 'Creating…' : 'Create User'}
							</button>
							{addMessage && <span className="text-sm text-emerald-400">{addMessage}</span>}
							{addError && <span className="text-sm text-red-400">{addError}</span>}
						</div>
					</form>
				</div>
			</div>
		</div>
	);
}


