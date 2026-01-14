import Image from 'next/image';
import { InstanceHealth, InstanceHealthResponse, SystemStatus } from '@/hooks/useStatus';
import ProfileBadge from '@/components/Shared/ProfileBadge';
import { FilmIcon, TvIcon, CloudIcon, CheckCircleIcon, XCircleIcon, ArrowRightIcon } from '@heroicons/react/24/outline';

interface InstanceListProps {
    health: InstanceHealthResponse | null;
    status?: SystemStatus | null;
}

// --- Helper Functions & Components ---

function formatRelativeTime(dateString: string | null): string {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'Unknown';
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    if (diffSec < 60) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHour < 24) return `${diffHour}h ago`;
    return `${diffDay}d ago`;
}

// Copied from old dashboard.tsx interactions
interface HistoryItem {
    title: string;
    poster: string | null;
    profile: string | null;
    profileType?: 'original' | 'dub' | null;
    tags: string | null;
    timestamp?: string | null;
}

function InstanceProfileBadge({ item, instance }: { item: HistoryItem, instance: InstanceHealth }) {
    const type = item.profileType ||
        (item.profile === instance.originalProfile ? 'original' :
            (item.profile === instance.dubProfile ? 'dub' : null));

    return type ? (
        <ProfileBadge type={type} label={item.profile || 'Unknown'} size="xs" />
    ) : (
        <span className="text-xs text-gray-500 flex items-center gap-1">
            <ArrowRightIcon className="h-3 w-3" />
            {item.profile}
        </span>
    );
}

function InstanceHistory({ instance }: { instance: InstanceHealth }) {
    const items = instance.lastTouchedItems && instance.lastTouchedItems.length > 0
        ? instance.lastTouchedItems
        : (instance.lastTouchedItem ? [{
            ...instance.lastTouchedItem,
            profileType: null,
            timestamp: instance.lastSyncAt
        } as HistoryItem] : []); // Cast simple item to avoid type conflicts if needed

    if (items.length === 0) return null;

    return (
        <div className="mt-4 pt-4 border-t border-white/5">
            <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">Recently Updated</div>
            <div className="space-y-3">
                {items.slice(0, 5).map((item, idx) => (
                    <div key={`${item.title}-${idx}`} className="group flex items-start gap-3 p-2 -mx-2 rounded-lg hover:bg-white/5 transition-colors">
                        {item.poster ? (
                            <Image
                                src={item.poster}
                                alt={item.title}
                                width={40}
                                height={60}
                                className="rounded-md object-cover shadow-sm ring-1 ring-white/10"
                                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                unoptimized
                            />
                        ) : (
                            <div className="h-[60px] w-[40px] rounded-md bg-gray-800 ring-1 ring-white/10 flex items-center justify-center">
                                {instance.type === 'radarr' ? <FilmIcon className="h-5 w-5 text-gray-600" /> : <TvIcon className="h-5 w-5 text-gray-600" />}
                            </div>
                        )}

                        <div className="flex-1 min-w-0 py-1">
                            <div className="flex justify-between items-start gap-2">
                                <span className="text-sm font-medium text-gray-200 truncate" title={item.title}>
                                    {item.title}
                                </span>
                                {item.timestamp && (
                                    <span className="text-[10px] text-gray-500 whitespace-nowrap font-mono">
                                        {formatRelativeTime(item.timestamp)}
                                    </span>
                                )}
                            </div>

                            <div className="flex flex-wrap items-center gap-2 mt-1.5">
                                {item.profile && (
                                    <InstanceProfileBadge item={item} instance={instance} />
                                )}
                                {item.tags && (
                                    <span className="text-[10px] text-blue-400 bg-blue-400/10 px-1.5 py-0.5 rounded border border-blue-400/20 break-words whitespace-normal">
                                        {item.tags}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

// --- Main Component ---

export default function InstanceList({ health, status }: InstanceListProps) {
    const getTypeIcon = (type: string) => {
        switch (type) {
            case 'radarr': return <FilmIcon className="h-5 w-5 text-blue-400" />;
            case 'sonarr': return <TvIcon className="h-5 w-5 text-purple-400" />;
            case 'overseerr': return <CloudIcon className="h-5 w-5 text-amber-400" />;
            default: return null;
        }
    };

    if (!health) return null;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider">Instance Status</h3>
                {health.summary && (
                    <div className="flex items-center gap-3 text-xs font-medium">
                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-500/10 border border-green-500/20 text-green-400">
                            <CheckCircleIcon className="h-3.5 w-3.5" />
                            {health.summary.healthy} Healthy
                        </div>
                        {health.summary.unhealthy > 0 && (
                            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-500/10 border border-red-500/20 text-red-400">
                                <XCircleIcon className="h-3.5 w-3.5" />
                                {health.summary.unhealthy} Issues
                            </div>
                        )}
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                {/* Note: 2-column layout for better balance of space and density */}
                {health.instances.map((instance) => {
                    let statLabel = '';
                    let statValue: number | string | undefined;

                    if (instance.type === 'radarr' && status?.statistics?.totalMovies) {
                        statLabel = 'Movies';
                        statValue = status.statistics.totalMovies;
                    } else if (instance.type === 'sonarr' && status?.statistics?.totalSeries) {
                        statLabel = 'Series';
                        statValue = status.statistics.totalSeries;
                    }

                    return (
                        <div
                            key={`${instance.type}-${instance.id}`}
                            className="group relative flex flex-col rounded-2xl bg-gray-900 border border-gray-800 p-5 hover:border-gray-700 hover:shadow-xl transition-all"
                        >
                            {/* Header */}
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 rounded-lg bg-gray-800 group-hover:bg-gray-700 transition-colors">
                                        {getTypeIcon(instance.type)}
                                    </div>
                                    <div>
                                        <h4 className="font-semibold text-white">{instance.name}</h4>
                                        <p className="text-xs text-gray-500 capitalize">{instance.type} Instance</p>
                                    </div>
                                </div>
                                <div className={`flex h-2.5 w-2.5 rounded-full ${instance.status === 'healthy' ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]' : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.4)]'}`} />
                            </div>

                            {/* Stats / Info */}
                            <div className="grid grid-cols-2 gap-4 py-3 border-t border-b border-gray-800/50 mb-1">
                                <div>
                                    <span className="text-xs text-gray-500 block mb-0.5">Last Sync</span>
                                    <span className="text-sm font-medium text-gray-300">{formatRelativeTime(instance.lastSyncAt)}</span>
                                </div>
                                {statValue !== undefined && (
                                    <div>
                                        <span className="text-xs text-gray-500 block mb-0.5">{statLabel}</span>
                                        <span className="text-sm font-medium text-white">{statValue.toLocaleString()}</span>
                                    </div>
                                )}
                            </div>

                            {/* Error Message */}
                            {instance.error && (
                                <div className="mb-4 rounded-lg bg-red-500/10 border border-red-500/20 p-3">
                                    <p className="text-xs text-red-400 font-medium break-all">{instance.error}</p>
                                </div>
                            )}

                            {/* History Feed */}
                            <div className="flex-1">
                                <InstanceHistory instance={instance} />
                            </div>

                            {/* Bottom Glow */}
                            <div className={`absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r opacity-50 rounded-b-2xl
                ${instance.type === 'radarr' ? 'from-blue-500/0 via-blue-500/50 to-blue-500/0' :
                                    instance.type === 'sonarr' ? 'from-purple-500/0 via-purple-500/50 to-purple-500/0' :
                                        'from-amber-500/0 via-amber-500/50 to-amber-500/0'
                                }`}
                            />
                        </div>
                    );
                })}
            </div>

            {health.instances.length === 0 && (
                <div className="p-12 text-center text-gray-500 bg-gray-900 rounded-2xl border border-gray-800 border-dashed">
                    <p>No instances configured. Go to Settings to add one.</p>
                </div>
            )}
        </div>
    );
}
