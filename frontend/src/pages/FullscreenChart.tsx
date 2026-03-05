import { useState } from 'react';
import CandlestickChart from '../CandlestickChart';
import LeftToolbar from '../components/LeftToolbar';
import { DrawingProvider } from '../components/DrawingContext';

export default function FullscreenChart() {
	const [selectedCrosshairType, setSelectedCrosshairType] = useState<string>('cross');

	return (
		<DrawingProvider>
			<div className="flex-1 min-h-0 flex bg-slate-50">
				<LeftToolbar selectedCrosshairType={selectedCrosshairType} onCrosshairTypeChange={setSelectedCrosshairType} />
				<div className="flex-1 min-w-0 p-2">
					<div className="h-full w-full bg-white">
						<CandlestickChart crosshairType={selectedCrosshairType} />
					</div>
				</div>
			</div>
		</DrawingProvider>
	);
}

