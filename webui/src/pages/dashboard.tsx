import { useState } from 'react';
import { useUser } from '@/hooks/useUser';
import { useStatus, useInstanceHealth } from '@/hooks/useStatus';
import toast from 'react-hot-toast';
import DryRunPreviewModal from '@/components/Dashboard/DryRunPreviewModal';

// Components
import StatusHero from '@/components/Dashboard/StatusHero';
import QuickActions from '@/components/Dashboard/QuickActions';
import InstanceList from '@/components/Dashboard/InstanceList';
import ActivityFeed from '@/components/Dashboard/ActivityFeed';

export default function DashboardPage() {
  const { user } = useUser();
  const { status, loading, refreshStatus } = useStatus();
  const { instanceHealth, refreshInstanceHealth } = useInstanceHealth();
  const [isDryRunModalOpen, setIsDryRunModalOpen] = useState(false);

  // Consolidated Action Handler
  const handleSync = async () => {
    try {
      const res = await fetch('/api/v1/actions/sync', { method: 'POST' });
      if (!res.ok) throw new Error('Action failed');
      toast.success('Sync started');

      // Refresh status after a short delay
      setTimeout(() => {
        refreshStatus();
        refreshInstanceHealth();
      }, 1000);
    } catch {
      toast.error('Failed to trigger sync');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <div className="h-12 w-12 rounded-full border-b-2 border-blue-500 animate-spin"></div>
          <div className="text-gray-400 font-medium">Loading dashboard...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-12">
      {/* Header Section */}
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold text-white tracking-tight">Dashboard</h1>
        <p className="text-gray-400">
          Welcome back, <span className="text-blue-400 font-medium">{user?.plexUsername || 'User'}</span>
        </p>
      </div>

      {/* Hero Status */}
      <StatusHero status={status} />

      {/* Main Content Flow */}
      <div className="flex flex-col gap-8">

        {/* Actions Bar */}
        <QuickActions
          onSync={handleSync}
          onDryRun={() => setIsDryRunModalOpen(true)}
        />

        {/* Instance List & Stats */}
        <InstanceList health={instanceHealth} status={status} />

        {/* Recent Activity */}
        <ActivityFeed activity={status?.recentActivity} />

      </div>

      {/* Modals */}
      <DryRunPreviewModal
        isOpen={isDryRunModalOpen}
        onClose={() => setIsDryRunModalOpen(false)}
      />
    </div>
  );
}
