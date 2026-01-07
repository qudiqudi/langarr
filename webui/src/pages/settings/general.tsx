import { useState, useEffect } from 'react';
import Head from 'next/head';
import { Settings } from '@/types/Settings';
import toast from 'react-hot-toast';
import { ArrowPathIcon, MusicalNoteIcon } from '@heroicons/react/24/outline';
import AudioTagEditor from '@/components/Settings/AudioTagEditor';

export default function GeneralSettings() {
    const [settings, setSettings] = useState<Settings | null>(null);
    const [loading, setLoading] = useState(true);
    // Local state for number inputs to prevent cursor jumping and value corruption
    const [syncIntervalInput, setSyncIntervalInput] = useState('');

    useEffect(() => {
        fetchSettings();
    }, []);

    // Sync local input state when settings are loaded or change
    useEffect(() => {
        if (settings) {
            setSyncIntervalInput(String(settings.syncIntervalHours));
        }
    }, [settings]);

    const fetchSettings = async () => {
        try {
            const res = await fetch('/api/v1/settings');
            if (!res.ok) throw new Error('Failed to fetch settings');
            const data = await res.json();
            setSettings(data);
        } catch {
            toast.error('Failed to load settings');
        } finally {
            setLoading(false);
        }
    };

    const updateSettings = async (updates: Partial<Settings>) => {
        if (!settings) return;

        // Optimistic update
        const prevSettings = { ...settings };
        setSettings({ ...settings, ...updates });

        try {
            const res = await fetch('/api/v1/settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updates),
            });

            if (!res.ok) throw new Error('Failed to update settings');
            const data = await res.json();
            setSettings(data);
            toast.success('Settings saved');
        } catch {
            setSettings(prevSettings);
            toast.error('Failed to save settings');
        }
    };


    if (loading) return <div className="p-8 text-center text-gray-400">Loading settings...</div>;
    if (!settings) return <div className="p-8 text-center text-red-400">Error loading settings</div>;

    return (
        <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
            <Head>
                <title>General Settings - Langarr</title>
            </Head>

            <div className="md:flex md:items-center md:justify-between">
                <div className="min-w-0 flex-1">
                    <h2 className="text-2xl font-bold leading-7 text-white sm:truncate sm:text-3xl sm:tracking-tight">
                        General Settings
                    </h2>
                    <p className="mt-2 text-sm text-gray-400">
                        Manage global configuration for Langarr.
                    </p>
                </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                {/* Schedule Settings */}
                <div className="rounded-lg bg-gray-900 p-6">
                    <h2 className="mb-4 text-lg font-semibold text-white flex items-center gap-2">
                        <ArrowPathIcon className="h-5 w-5" />
                        Schedule
                    </h2>

                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-300">Sync Interval (Hours)</label>
                            <input
                                type="number"
                                min="1"
                                className="mt-1 block w-full rounded-md border-gray-700 bg-gray-800 text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2"
                                value={syncIntervalInput}
                                onChange={(e) => setSyncIntervalInput(e.target.value)}
                                onBlur={() => {
                                    const value = parseInt(syncIntervalInput) || 24;
                                    setSyncIntervalInput(String(value));
                                    if (value !== settings.syncIntervalHours) {
                                        updateSettings({ syncIntervalHours: value });
                                    }
                                }}
                            />
                            <p className="mt-1 text-xs text-gray-500">How often to run the synchronization process automatically.</p>
                        </div>

                        <div className="flex items-center justify-between">
                            <div>
                                <label className="block text-sm font-medium text-gray-300">Run on Startup</label>
                                <p className="text-xs text-gray-500">Run sync immediately when the application starts.</p>
                            </div>
                            <button
                                onClick={() => updateSettings({ runSyncOnStartup: !settings.runSyncOnStartup })}
                                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${settings.runSyncOnStartup ? 'bg-blue-600' : 'bg-gray-700'
                                    }`}
                            >
                                <span
                                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${settings.runSyncOnStartup ? 'translate-x-5' : 'translate-x-0'
                                        }`}
                                />
                            </button>
                        </div>
                    </div>
                </div>



                {/* Global Options */}
                <div className="rounded-lg bg-gray-900 p-6">
                    <h2 className="mb-4 text-lg font-semibold text-white">Global Options</h2>
                    <div className="flex items-center justify-between">
                        <div>
                            <label className="block text-sm font-medium text-gray-300">Dry Run Mode</label>
                            <p className="text-xs text-gray-500">Simulate changes to profiles/tags without applying them to Arr instances.</p>
                        </div>
                        <button
                            onClick={() => updateSettings({ dryRunMode: !settings.dryRunMode })}
                            className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${settings.dryRunMode ? 'bg-yellow-600' : 'bg-gray-700'
                                }`}
                        >
                            <span
                                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${settings.dryRunMode ? 'translate-x-5' : 'translate-x-0'
                                    }`}
                            />
                        </button>
                    </div>
                </div>

                {/* Audio Tagging Settings */}
                <div className="rounded-lg bg-gray-900 p-6 md:col-span-2">
                    <h2 className="mb-4 text-lg font-semibold text-white flex items-center gap-2">
                        <MusicalNoteIcon className="h-5 w-5" />
                        Audio Tagging Rules
                    </h2>
                    <p className="mb-4 text-sm text-gray-400">
                        Define global rules to tag media based on detected audio tracks. Enable per instance in Radarr/Sonarr settings.
                    </p>

                    <AudioTagEditor
                        value={settings.audioTagRules}
                        onChange={(rules) => updateSettings({ audioTagRules: rules })}
                    />
                </div>

                {/* Information Card */}
                <div className="rounded-lg bg-gray-900 p-6">
                    <h3 className="text-base font-semibold leading-6 text-white">System Information</h3>
                    <div className="mt-5 border-t border-gray-700">
                        <dl className="divide-y divide-gray-700">
                            <div className="py-2 sm:grid sm:grid-cols-3 sm:gap-4">
                                <dt className="text-sm font-medium text-gray-400">Version</dt>
                                <dd className="mt-1 text-sm text-white sm:col-span-2 sm:mt-0">v0.1.0-alpha</dd>
                            </div>
                            <div className="py-2 sm:grid sm:grid-cols-3 sm:gap-4">
                                <dt className="text-sm font-medium text-gray-400">Environment</dt>
                                <dd className="mt-1 text-sm text-white sm:col-span-2 sm:mt-0">{process.env.NODE_ENV}</dd>
                            </div>
                        </dl>
                    </div>
                </div>

            </div>
        </div>
    );
}
