import { SystemStatus } from '@/hooks/useStatus';
import { ClockIcon, InformationCircleIcon, ExclamationTriangleIcon, ExclamationCircleIcon } from '@heroicons/react/24/outline';

interface ActivityFeedProps {
    activity: SystemStatus['recentActivity'];
}

export default function ActivityFeed({ activity }: ActivityFeedProps) {
    if (!activity || activity.length === 0) {
        return (
            <div className="rounded-2xl bg-gray-900 border border-gray-800 p-8 text-center text-gray-500">
                <ClockIcon className="mx-auto h-12 w-12 opacity-20" />
                <p className="mt-2">No recent activity recorded.</p>
            </div>
        );
    }

    return (
        <div className="rounded-2xl bg-gray-900 border border-gray-800 overflow-hidden flex flex-col h-[400px]">
            <div className="p-4 border-b border-gray-800 bg-gray-900/50 backdrop-blur-sm z-10">
                <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider">Recent Activity</h3>
            </div>

            <div className="overflow-y-auto flex-1 p-2 space-y-1 custom-scrollbar">
                {activity.map((log: NonNullable<SystemStatus['recentActivity']>[number]) => {
                    let Icon = InformationCircleIcon;
                    let colorClass = 'text-blue-400 bg-blue-400/10 border-blue-400/20';
                    let textClass = 'text-blue-200';

                    if (log.level === 'warn') {
                        Icon = ExclamationTriangleIcon;
                        colorClass = 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20';
                        textClass = 'text-yellow-200';
                    } else if (log.level === 'error') {
                        Icon = ExclamationCircleIcon;
                        colorClass = 'text-red-400 bg-red-400/10 border-red-400/20';
                        textClass = 'text-red-200';
                    }

                    return (
                        <div key={log.id} className="group flex gap-3 p-3 rounded-xl hover:bg-gray-800/50 transition-colors">
                            <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${colorClass}`}>
                                <Icon className="h-5 w-5" />
                            </div>

                            <div className="flex-1 min-w-0">
                                <div className="flex items-start justify-between gap-2">
                                    <p className={`text-sm font-medium ${textClass}`}>{log.message}</p>
                                    <span className="text-[10px] text-gray-500 whitespace-nowrap pt-1">
                                        {new Date(log.timestamp).toLocaleTimeString()}
                                    </span>
                                </div>
                                <div className="mt-1 flex items-center gap-2">
                                    <span className="inline-flex items-center rounded-md bg-gray-800 px-1.5 py-0.5 text-[10px] font-medium text-gray-400 uppercase tracking-wide border border-gray-700">
                                        {log.source}
                                    </span>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
