import Image from 'next/image';
import { useState } from 'react';
import { useUser } from '@/hooks/useUser';
import { useStatus, useInstanceHealth, InstanceHealth } from '@/hooks/useStatus';
import toast from 'react-hot-toast';
import { ArrowPathIcon, SpeakerWaveIcon, BeakerIcon, CheckCircleIcon, XCircleIcon, FilmIcon, TvIcon, CloudIcon, PlayIcon } from '@heroicons/react/24/outline';
import DryRunPreviewModal from '@/components/Dashboard/DryRunPreviewModal';
import ProfileBadge from '@/components/Shared/ProfileBadge';

// Helper function for relative time display
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
    <span className="text-xs text-gray-400">→ {item.profile}</span>
  );
}

function InstanceHistory({ instance }: { instance: InstanceHealth }) {
  // Normalize items to a list, handling both new history array and legacy single item
  const items = instance.lastTouchedItems && instance.lastTouchedItems.length > 0
    ? instance.lastTouchedItems
    : (instance.lastTouchedItem ? [{
      ...instance.lastTouchedItem,
      profileType: null, // Legacy doesn't have type
      timestamp: instance.lastSyncAt // Use instance sync time as fallback
    }] : []);

  if (items.length === 0) return null;

  return (
    <div className="mt-3 pt-3 border-t border-gray-700/50">
      <div className="text-xs text-gray-500 mb-2">Last Updated ({items.length})</div>
      <div className="space-y-3">
        {items.slice(0, 5).map((item, idx) => (
          <div key={`${item.title}-${idx}`} className="flex items-start gap-3">
            {item.poster ? (
              <Image
                src={item.poster}
                alt={item.title}
                width={33}
                height={48}
                className="rounded object-cover shadow-lg shrink-0"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
                unoptimized
              />
            ) : (
              <div className="h-12 w-9 rounded bg-gray-700 flex items-center justify-center shrink-0">
                {instance.type === 'radarr' ? (
                  <FilmIcon className="h-4 w-4 text-gray-500" />
                ) : (
                  <TvIcon className="h-4 w-4 text-gray-500" />
                )}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex justify-between items-start">
                <span className="text-sm font-medium text-white truncate pr-2" title={item.title}>
                  {item.title}
                </span>
                {item.timestamp && (
                  <span className="text-[10px] text-gray-500 whitespace-nowrap pt-0.5">
                    {formatRelativeTime(item.timestamp)}
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2 mt-0.5">
                {item.profile && (
                  <InstanceProfileBadge item={item} instance={instance} />
                )}
                {item.tags && (
                  <span className="text-[10px] text-blue-400 truncate">
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

export default function DashboardPage() {
  const { user } = useUser();
  const { status, loading, refreshStatus } = useStatus();
  const { instanceHealth, refreshInstanceHealth } = useInstanceHealth();
  const [isDryRunModalOpen, setIsDryRunModalOpen] = useState(false);

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

      {/* Quick Actions */}
      <div>
        <h2 className="mb-3 text-lg font-semibold text-white flex items-center gap-2">
          <PlayIcon className="h-5 w-5 text-green-400" />
          Quick Actions
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <button
            onClick={() => handleAction('sync')}
            className="group flex flex-col items-start gap-2 rounded-lg bg-gradient-to-br from-blue-600 to-blue-700 p-4 text-left hover:from-blue-500 hover:to-blue-600 transition-all shadow-lg hover:shadow-blue-500/20"
          >
            <div className="flex items-center gap-2">
              <ArrowPathIcon className="h-5 w-5" />
              <span className="font-semibold text-white">Sync Now</span>
            </div>
            <p className="text-xs text-blue-200">
              Scan all instances and apply profile/tag changes immediately
            </p>
          </button>
          <button
            onClick={() => handleAction('audio-scan')}
            className="group flex flex-col items-start gap-2 rounded-lg bg-gradient-to-br from-gray-700 to-gray-800 border border-gray-600 p-4 text-left hover:from-gray-600 hover:to-gray-700 hover:border-gray-500 transition-all"
          >
            <div className="flex items-center gap-2">
              <SpeakerWaveIcon className="h-5 w-5 text-purple-400" />
              <span className="font-semibold text-white">Audio Scan</span>
            </div>
            <p className="text-xs text-gray-400">
              Analyze audio tracks and apply language-based tags
            </p>
          </button>
          <button
            onClick={() => setIsDryRunModalOpen(true)}
            className="group flex flex-col items-start gap-2 rounded-lg bg-gradient-to-br from-yellow-600/20 to-yellow-700/10 border border-yellow-500/30 p-4 text-left hover:from-yellow-600/30 hover:to-yellow-700/20 hover:border-yellow-500/50 transition-all"
          >
            <div className="flex items-center gap-2">
              <BeakerIcon className="h-5 w-5 text-yellow-500" />
              <span className="font-semibold text-yellow-400">Dry-Run Preview</span>
            </div>
            <p className="text-xs text-yellow-500/70">
              Preview changes without applying them to your library
            </p>
          </button>
        </div>
      </div>

      {/* Dry Run Preview Modal */}
      <DryRunPreviewModal
        isOpen={isDryRunModalOpen}
        onClose={() => setIsDryRunModalOpen(false)}
      />

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
          <div className="grid grid-cols-1 gap-4">
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

                {/* Last Updated Items History */}
                <InstanceHistory instance={instance} />

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
