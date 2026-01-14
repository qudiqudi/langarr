import { SystemStatus } from '@/hooks/useStatus';

interface StatusHeroProps {
    status: SystemStatus | null;
}

export default function StatusHero({ status }: StatusHeroProps) {
    const isHealthy = status?.status === 'running';

    return (
        <div className="relative overflow-hidden rounded-2xl bg-gray-900/50 backdrop-blur-md border border-gray-800 p-8 shadow-xl">
            {/* Background Glow Effect */}
            <div className={`absolute -right-20 -top-20 h-64 w-64 rounded-full blur-3xl opacity-10 pointer-events-none 
        ${isHealthy ? 'bg-green-500' : 'bg-red-500'}`}
            />

            <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-6">
                {/* Status Indicator */}
                <div className="flex items-center gap-5">
                    <div className="relative flex h-6 w-6">
                        {isHealthy && (
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-20"></span>
                        )}
                        <span className={`relative inline-flex rounded-full h-6 w-6 
              ${isHealthy ? 'bg-green-500 shadow-[0_0_15px_rgba(34,197,94,0.5)]' : 'bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.5)]'}`}
                        ></span>
                    </div>
                    <div>
                        <h2 className="text-3xl font-bold text-white tracking-tight capitalize">
                            {status?.status || 'Unknown'}
                        </h2>
                        <p className="text-gray-400 text-sm">System Status</p>
                    </div>
                </div>

                {/* Timing Info */}
                <div className="flex gap-8 border-t md:border-t-0 md:border-l border-gray-800 pt-4 md:pt-0 md:pl-8">
                    <div>
                        <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Last Sync</p>
                        <p className="mt-1 text-lg font-medium text-white">
                            {status?.lastSync ? new Date(status.lastSync).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                        </p>
                        <p className="text-xs text-gray-500">
                            {status?.lastSync ? new Date(status.lastSync).toLocaleDateString() : ''}
                        </p>
                    </div>
                    <div>
                        <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Next Sync</p>
                        <p className="mt-1 text-lg font-medium text-white">
                            {status?.nextSync ? new Date(status.nextSync).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                        </p>
                        <p className="text-xs text-gray-500">
                            {status?.nextSync ? new Date(status.nextSync).toLocaleDateString() : ''}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
