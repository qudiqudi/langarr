import { ArrowPathIcon, BeakerIcon } from '@heroicons/react/24/outline';

interface QuickActionsProps {
    onSync: () => void;
    onDryRun: () => void;
}

export default function QuickActions({ onSync, onDryRun }: QuickActionsProps) {
    return (
        <div>
            <h3 className="mb-4 text-sm font-medium text-gray-400 uppercase tracking-wider">Quick Actions</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <button
                    onClick={onSync}
                    className="group relative overflow-hidden rounded-xl bg-gradient-to-br from-blue-600 to-blue-700 p-5 text-left transition-all hover:from-blue-500 hover:to-blue-600 hover:shadow-lg hover:shadow-blue-500/25 hover:-translate-y-0.5 active:translate-y-0"
                >
                    <div className="relative z-10">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="p-2 rounded-lg bg-white/10 group-hover:bg-white/20 transition-colors">
                                <ArrowPathIcon className="h-6 w-6 text-white" />
                            </div>
                            <span className="font-bold text-lg text-white">Sync Now</span>
                        </div>
                        <p className="text-sm text-blue-100/80 leading-relaxed pl-1">
                            Scan all instances, apply profile changes, and update audio tags.
                        </p>
                    </div>
                    {/* Decorative Circle */}
                    <div className="absolute -right-12 -top-12 h-32 w-32 rounded-full bg-white/5 blur-2xl group-hover:bg-white/10 transition-all" />
                </button>

                <button
                    onClick={onDryRun}
                    className="group relative overflow-hidden rounded-xl bg-gradient-to-br from-gray-800 to-gray-900 border border-gray-700 p-5 text-left transition-all hover:border-yellow-500/50 hover:shadow-lg hover:shadow-yellow-900/10 hover:-translate-y-0.5 active:translate-y-0"
                >
                    <div className="relative z-10">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="p-2 rounded-lg bg-yellow-500/10 group-hover:bg-yellow-500/20 transition-colors">
                                <BeakerIcon className="h-6 w-6 text-yellow-500" />
                            </div>
                            <span className="font-bold text-lg text-yellow-500">Dry-Run Preview</span>
                        </div>
                        <p className="text-sm text-gray-400 group-hover:text-gray-300 transition-colors pl-1">
                            Simulate a sync to preview potential changes to your library.
                        </p>
                    </div>
                </button>
            </div>
        </div>
    );
}
