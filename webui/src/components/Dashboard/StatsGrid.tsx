import { SystemStatus } from '@/hooks/useStatus';
import { FilmIcon, TvIcon, Square3Stack3DIcon } from '@heroicons/react/24/outline';

interface StatsGridProps {
    status: SystemStatus | null;
}

export default function StatsGrid({ status }: StatsGridProps) {
    const stats = [
        {
            label: 'Total Movies',
            value: status?.statistics?.totalMovies || 0,
            icon: FilmIcon,
            gradient: 'from-blue-500/20 to-blue-600/5',
            border: 'border-blue-500/20',
            text: 'text-blue-400',
            glow: 'shadow-blue-900/10'
        },
        {
            label: 'Total Series',
            value: status?.statistics?.totalSeries || 0,
            icon: TvIcon,
            gradient: 'from-purple-500/20 to-purple-600/5',
            border: 'border-purple-500/20',
            text: 'text-purple-400',
            glow: 'shadow-purple-900/10'
        },
        {
            label: 'Total Content',
            value: status?.statistics?.totalContent || 0,
            icon: Square3Stack3DIcon,
            gradient: 'from-emerald-500/20 to-emerald-600/5',
            border: 'border-emerald-500/20',
            text: 'text-emerald-400',
            glow: 'shadow-emerald-900/10'
        }
    ];

    return (
        <div>
            <h3 className="mb-4 text-sm font-medium text-gray-400 uppercase tracking-wider">Library Statistics</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                {stats.map((stat) => (
                    <div
                        key={stat.label}
                        className={`relative overflow-hidden rounded-xl bg-gradient-to-br ${stat.gradient} ${stat.border} border p-5 shadow-lg ${stat.glow} transition-all hover:scale-[1.02]`}
                    >
                        <div className="relative z-10">
                            <div className={`text-sm font-medium ${stat.text}`}>{stat.label}</div>
                            <div className="mt-2 text-3xl font-bold text-white tracking-tight">{stat.value.toLocaleString()}</div>
                        </div>

                        {/* Background Icon */}
                        <stat.icon className={`absolute -right-4 -bottom-4 h-24 w-24 opacity-10 rotate-12 ${stat.text}`} />
                    </div>
                ))}
            </div>
        </div>
    );
}
