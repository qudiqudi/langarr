import { useUser } from '@/hooks/useUser';
import { useStatus, useInstanceHealth } from '@/hooks/useStatus';
import toast from 'react-hot-toast';
import { ArrowPathIcon, SpeakerWaveIcon, BeakerIcon, CheckCircleIcon, XCircleIcon, FilmIcon, TvIcon, CloudIcon } from '@heroicons/react/24/outline';

// Helper function for relative time display
function formatRelativeTime(dateString: string | null): string {
  if (!dateString) return 'Never';
  const date = new Date(dateString);
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

export default function DashboardPage() {
  const { user } = useUser();
  const { status, loading, refreshStatus } = useStatus();
  const { instanceHealth, refreshInstanceHealth } = useInstanceHealth();

  const handleAction = async (action: 'sync' | 'audio-scan' | 'dry-run') => {
    let endpoint = '/api/v1/actions/sync';
    let message = 'Sync started';

    if (action === 'audio-scan') {
      endpoint = '/api/v1/actions/audio-scan';
      message = 'Audio scan started';
    } else if (action === 'dry-run') {
      endpoint = '/api/v1/actions/dry-run';
      message = 'Dry-run started';
    }

    try {
      const res = await fetch(endpoint, { method: 'POST' });
      if (!res.ok) throw new Error('Action failed');
      toast.success(message);
      // Refresh status after a short delay to potentially show "running" if valid
      setTimeout(() => {
        refreshStatus();
        refreshInstanceHealth();
      }, 1000);
    } catch {
      toast.error('Failed to trigger action');
    }
  };

  if (loading) return <div className="p-8 text-center text-gray-400">Loading dashboard...</div>;

  // Get the instance type icon
  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'radarr':
        return <FilmIcon className="h-5 w-5 text-blue-400" />;
      case 'sonarr':
        return <TvIcon className="h-5 w-5 text-purple-400" />;
      case 'overseerr':
        return <CloudIcon className="h-5 w-5 text-amber-400" />;
      default:
        return null;
    }
  };

  // Get type-specific gradient colors
  const getTypeGradient = (type: string) => {
    switch (type) {
      case 'radarr':
        return 'from-blue-500/10 to-blue-600/5 border-blue-500/20';
      case 'sonarr':
        return 'from-purple-500/10 to-purple-600/5 border-purple-500/20';
      case 'overseerr':
        return 'from-amber-500/10 to-amber-600/5 border-amber-500/20';
      default:
        return 'from-gray-500/10 to-gray-600/5 border-gray-500/20';
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="mt-1 text-gray-400">
          Welcome back, {user?.plexUsername || 'User'}
        </p>
      </div>

      {/* Status Card */}
      <div className="rounded-lg bg-gray-900 p-6">
        <div className="flex items-center gap-3">
          <div className={`h-3 w-3 rounded-full ${status?.status === 'running' ? 'bg-green-500' : 'bg-red-500'}`}></div>
          <span className="text-lg font-medium text-white capitalize">{status?.status || 'Unknown'}</span>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-400">Last sync:</span>
            <span className="ml-2 text-white">
              {status?.lastSync ? new Date(status.lastSync).toLocaleString() : 'Not run yet'}
            </span>
          </div>
          <div>
            <span className="text-gray-400">Next sync:</span>
            <span className="ml-2 text-white">
              {status?.nextSync ? new Date(status.nextSync).toLocaleString() : 'Not scheduled'}
            </span>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3">
        <button
          onClick={() => handleAction('sync')}
          className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
        >
          <ArrowPathIcon className="h-4 w-4" />
          Sync Now
        </button>
        <button
          onClick={() => handleAction('audio-scan')}
          className="flex items-center gap-2 rounded-md bg-gray-700 px-4 py-2 text-sm font-medium text-white hover:bg-gray-600 transition-colors"
        >
          <SpeakerWaveIcon className="h-4 w-4" />
          Audio Scan
        </button>
        <button
          onClick={() => handleAction('dry-run')}
          className="flex items-center gap-2 rounded-md bg-yellow-600/20 px-4 py-2 text-sm font-medium text-yellow-500 hover:bg-yellow-600/30 transition-colors"
        >
          <BeakerIcon className="h-4 w-4" />
          Dry-run Preview
        </button>
      </div>

      {/* Statistics Section */}
      <div>
        <h2 className="mb-4 text-lg font-semibold text-white">Library Statistics</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-lg bg-gradient-to-br from-blue-500/10 to-blue-600/5 border border-blue-500/20 p-4">
            <div className="text-sm text-blue-400">Total Movies</div>
            <div className="mt-1 text-2xl font-bold text-white">{status?.statistics?.totalMovies || 0}</div>
          </div>
          <div className="rounded-lg bg-gradient-to-br from-purple-500/10 to-purple-600/5 border border-purple-500/20 p-4">
            <div className="text-sm text-purple-400">Total Series</div>
            <div className="mt-1 text-2xl font-bold text-white">{status?.statistics?.totalSeries || 0}</div>
          </div>
          <div className="rounded-lg bg-gradient-to-br from-green-500/10 to-green-600/5 border border-green-500/20 p-4">
            <div className="text-sm text-green-400">Total Content</div>
            <div className="mt-1 text-2xl font-bold text-white">{status?.statistics?.totalContent || 0}</div>
          </div>
        </div>
      </div>

      {/* Instance Status Section - Enhanced */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Instance Status</h2>
          {instanceHealth?.summary && (
            <div className="flex items-center gap-3 text-sm">
              <span className="flex items-center gap-1 text-green-400">
                <CheckCircleIcon className="h-4 w-4" />
                {instanceHealth.summary.healthy} healthy
              </span>
              {instanceHealth.summary.unhealthy > 0 && (
                <span className="flex items-center gap-1 text-red-400">
                  <XCircleIcon className="h-4 w-4" />
                  {instanceHealth.summary.unhealthy} unhealthy
                </span>
              )}
            </div>
          )}
        </div>

        {instanceHealth?.instances && instanceHealth.instances.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {instanceHealth.instances.map((instance) => (
              <div
                key={`${instance.type}-${instance.id}`}
                className={`rounded-lg bg-gradient-to-br ${getTypeGradient(instance.type)} border p-4`}
              >
                {/* Instance Header */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    {getTypeIcon(instance.type)}
                    <span className="font-medium text-white">{instance.name}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className={`h-2 w-2 rounded-full ${instance.status === 'healthy' ? 'bg-green-500' : 'bg-red-500'}`}></div>
                    <span className={`text-xs capitalize ${instance.status === 'healthy' ? 'text-green-400' : 'text-red-400'}`}>
                      {instance.status}
                    </span>
                  </div>
                </div>

                {/* Instance Details */}
                <div className="text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">Last Sync</span>
                    <span className="text-white">{formatRelativeTime(instance.lastSyncAt)}</span>
                  </div>
                </div>

                {/* Last Touched Item */}
                {instance.lastTouchedItem && (
                  <div className="mt-3 pt-3 border-t border-gray-700/50">
                    <div className="text-xs text-gray-500 mb-2">Last Updated</div>
                    <div className="flex items-center gap-3">
                      {instance.lastTouchedItem.poster ? (
                        <img
                          src={instance.lastTouchedItem.poster}
                          alt={instance.lastTouchedItem.title}
                          className="h-16 w-11 rounded object-cover shadow-lg"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      ) : (
                        <div className="h-16 w-11 rounded bg-gray-700 flex items-center justify-center">
                          {instance.type === 'radarr' ? (
                            <FilmIcon className="h-5 w-5 text-gray-500" />
                          ) : (
                            <TvIcon className="h-5 w-5 text-gray-500" />
                          )}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-base font-medium text-white truncate">
                          {instance.lastTouchedItem.title}
                        </div>
                        {instance.lastTouchedItem.profile && (
                          <div className="text-sm text-gray-400">
                            → {instance.lastTouchedItem.profile}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Error Message */}
                {instance.error && (
                  <div className="mt-3 pt-3 border-t border-gray-700/50">
                    <div className="text-xs text-red-400 truncate" title={instance.error}>
                      {instance.error}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-lg bg-gray-800 p-6 text-center text-gray-400">
            <p>No instances configured yet.</p>
          </div>
        )}
      </div>

      {/* Recent Activity */}
      <div>
        <h2 className="mb-4 text-lg font-semibold text-white">Recent Activity</h2>
        <div className="rounded-lg bg-gray-900 overflow-hidden">
          {status?.recentActivity && status.recentActivity.length > 0 ? (
            <div className="divide-y divide-gray-800">
              {status.recentActivity.map((log) => (
                <div key={log.id} className="px-4 py-3 hover:bg-gray-800/50 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium ${log.level === 'error' ? 'text-red-400' :
                        log.level === 'warn' ? 'text-yellow-400' :
                          log.level === 'info' ? 'text-blue-400' :
                            'text-gray-400'
                        }`}>
                        {log.message}
                      </p>
                      <div className="mt-1 flex items-center gap-3 text-xs text-gray-500">
                        <span className="capitalize">{log.source}</span>
                        <span>{new Date(log.timestamp).toLocaleString()}</span>
                      </div>
                    </div>
                    <span className={`flex-shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${log.level === 'error' ? 'bg-red-500/10 text-red-400' :
                      log.level === 'warn' ? 'bg-yellow-500/10 text-yellow-400' :
                        log.level === 'info' ? 'bg-blue-500/10 text-blue-400' :
                          'bg-gray-500/10 text-gray-400'
                      }`}>
                      {log.level}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-6 text-center text-gray-400">
              <p>No activity recorded yet.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
