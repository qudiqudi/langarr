import { useState, useEffect } from 'react';
import Head from 'next/head';
import useSWR from 'swr';
import { PlusIcon, PencilSquareIcon, TrashIcon, KeyIcon, ClipboardDocumentIcon, CheckIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import axios from 'axios';
import OverseerrModal from '@/components/Settings/OverseerrModal';
import ConfirmationModal from '@/components/Common/ConfirmationModal';
import { Settings } from '@/types/Settings';

interface ServerMapping {
    [overseerrId: string]: string;
}

interface OverseerrInstance {
    id: number;
    name: string;
    baseUrl: string;
    apiKey?: string; // Optional - not returned from API for security
    enabled: boolean;
    pollIntervalMinutes: number;
    radarrServerMappings: ServerMapping;
    sonarrServerMappings: ServerMapping;
}

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function OverseerrSettings() {
    const { data: instances, mutate } = useSWR<OverseerrInstance[]>('/api/v1/overseerr', fetcher);
    // Fetch global settings to manage Webhook
    const { data: settings, mutate: mutateSettings } = useSWR<Settings>('/api/v1/settings', fetcher, {
        refreshInterval: 3000, // Poll every 3 seconds for webhook test feedback
        revalidateOnFocus: true
    });

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedInstance, setSelectedInstance] = useState<OverseerrInstance | null>(null);

    const [deleteId, setDeleteId] = useState<number | null>(null);
    const [copied, setCopied] = useState(false);
    const [baseUrlInput, setBaseUrlInput] = useState('');

    const instance = instances && instances.length > 0 ? instances[0] : null;

    // Sync base URL input with settings
    useEffect(() => {
        if (settings?.langarrBaseUrl) {
            setBaseUrlInput(settings.langarrBaseUrl);
        }
    }, [settings?.langarrBaseUrl]);

    // Build webhook URL
    const baseUrl = settings?.langarrBaseUrl || '';
    const webhookUrl = settings?.webhookAuthToken && baseUrl
        ? `${baseUrl}/api/v1/webhook?token=${settings.webhookAuthToken}`
        : null;

    const copyToClipboard = () => {
        if (webhookUrl) {
            navigator.clipboard.writeText(webhookUrl);
            setCopied(true);
            toast.success('Copied to clipboard');
            setTimeout(() => setCopied(false), 2000);
        }
    };

    const handleEdit = () => {
        if (instance) {
            setSelectedInstance(instance);
            setIsModalOpen(true);
        }
    };

    const handleAdd = () => {
        if (instance) return; // Should not happen due to UI logic
        setSelectedInstance(null);
        setIsModalOpen(true);
    };

    const handleDelete = () => {
        if (instance) {
            setDeleteId(instance.id);
        }
    };

    const confirmDelete = async () => {
        if (!deleteId) return;
        try {
            await axios.delete(`/api/v1/overseerr/${deleteId}`);
            toast.success('Instance deleted');
            setSelectedInstance(null); // Clear selected instance after deletion
            mutate();
        } catch {
            toast.error('Failed to delete instance');
        } finally {
            setDeleteId(null);
        }
    };

    const updateSettings = async (updates: Partial<Settings>) => {
        if (!settings) return;

        // Optimistic update
        const prevSettings = { ...settings };
        mutateSettings({ ...settings, ...updates }, false);

        try {
            const res = await fetch('/api/v1/settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updates),
            });

            if (!res.ok) throw new Error('Failed to update settings');
            const data = await res.json();
            mutateSettings(data);
            toast.success('Settings saved');
        } catch {
            mutateSettings(prevSettings, false);
            toast.error('Failed to save settings');
        }
    };

    const generateWebhookToken = async () => {
        try {
            const res = await fetch('/api/v1/settings/webhook-token', { method: 'POST' });
            if (!res.ok) throw new Error('Failed to generate token');
            const { token } = await res.json();
            updateSettings({ webhookAuthToken: token });
            return token;
        } catch {
            toast.error('Failed to generate token');
            return null;
        }
    };

    const handleToggleWebhook = async () => {
        if (!settings) return;
        const newValue = !settings.webhookEnabled;

        if (newValue && !settings.webhookAuthToken) {
            // Auto-generate token when enabling
            const token = await generateWebhookToken();
            if (token) {
                updateSettings({ webhookEnabled: true });
            }
        } else {
            updateSettings({ webhookEnabled: newValue });
        }
    };

    const formatRelativeTime = (date: Date | string) => {
        const now = new Date();
        const past = new Date(date);
        const seconds = Math.floor((now.getTime() - past.getTime()) / 1000);

        if (seconds < 60) return `${seconds} seconds ago`;
        if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
        if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
        return past.toLocaleDateString();
    };

    return (
        <>
            <Head>
                <title>Overseerr Settings - Langarr</title>
            </Head>

            <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
                <div className="md:flex md:items-center md:justify-between">
                    <div className="min-w-0 flex-1">
                        <h2 className="text-2xl font-bold leading-7 text-white sm:truncate sm:text-3xl sm:tracking-tight">
                            Overseerr Integration
                        </h2>
                        <p className="mt-2 text-sm text-gray-400">
                            Connect your Overseerr instance to synchronize requests.
                        </p>
                    </div>
                </div>

                {/* Instance Card */}
                {!instance ? (
                    <div className="rounded-lg bg-gray-900 shadow-sm ring-1 ring-gray-800 p-12 text-center">
                        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-indigo-900/50">
                            <PlusIcon className="h-6 w-6 text-indigo-400" aria-hidden="true" />
                        </div>
                        <h3 className="mt-2 text-sm font-semibold text-white">No Overseerr connected</h3>
                        <p className="mt-1 text-sm text-gray-500">Connect to an Overseerr instance to start syncing.</p>
                        <div className="mt-6">
                            <button
                                type="button"
                                onClick={handleAdd}
                                className="inline-flex items-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
                            >
                                <PlusIcon className="-ml-0.5 mr-1.5 h-5 w-5" aria-hidden="true" />
                                Connect Overseerr
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="rounded-lg bg-gray-900 shadow-sm ring-1 ring-gray-800 overflow-hidden">
                        <div className="px-6 py-5 border-b border-gray-800">
                            <div className="flex items-center justify-between">
                                <h3 className="text-lg font-medium text-white flex items-center gap-2">
                                    <span className={`inline-block h-2.5 w-2.5 rounded-full ${instance.enabled ? 'bg-green-400' : 'bg-gray-400'}`}></span>
                                    {instance.name}
                                </h3>
                                <div className="flex items-center gap-2">
                                    <button onClick={handleEdit} className="text-sm font-medium text-indigo-400 hover:text-indigo-300 flex items-center gap-1 bg-indigo-900/20 px-3 py-1.5 rounded-md hover:bg-indigo-900/40 transition-colors">
                                        <PencilSquareIcon className="h-4 w-4" /> Configure
                                    </button>
                                    <button onClick={handleDelete} className="text-sm font-medium text-red-400 hover:text-red-300 flex items-center gap-1 bg-red-900/20 px-3 py-1.5 rounded-md hover:bg-red-900/40 transition-colors">
                                        <TrashIcon className="h-4 w-4" /> Disconnect
                                    </button>
                                </div>
                            </div>
                        </div>
                        <div className="px-6 py-5">
                            <dl className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2">
                                <div>
                                    <dt className="text-sm font-medium text-gray-400">URL</dt>
                                    <dd className="mt-1 text-sm text-white font-mono bg-gray-800 px-2 py-1 rounded inline-block">{instance.baseUrl}</dd>
                                </div>
                                <div>
                                    <dt className="text-sm font-medium text-gray-400">Poll Interval</dt>
                                    <dd className="mt-1 text-sm text-white">{instance.pollIntervalMinutes} minutes</dd>
                                </div>
                                <div>
                                    <dt className="text-sm font-medium text-gray-400">Server Mappings</dt>
                                    <dd className="mt-1 text-sm text-white">
                                        {Object.keys(instance.radarrServerMappings || {}).length} Radarr / {Object.keys(instance.sonarrServerMappings || {}).length} Sonarr
                                    </dd>
                                </div>
                            </dl>
                        </div>
                    </div>
                )}

                {/* Webhook Configuration (Only show if instance exists or always? Always is fine, but contextually better if intended for the instance) */}
                {/* Actually, webhook is useful mainly when Overseerr is connected. */}

                {settings && (
                    <div className="rounded-lg bg-gray-900 p-6 ring-1 ring-gray-800">
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                                    <KeyIcon className="h-5 w-5" />
                                    Webhook
                                </h2>
                                <p className="text-sm text-gray-400 mt-1">
                                    Instant updates when requests are approved.
                                </p>
                            </div>
                            <button
                                onClick={handleToggleWebhook}
                                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${settings.webhookEnabled ? 'bg-blue-600' : 'bg-gray-700'
                                    }`}
                            >
                                <span
                                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${settings.webhookEnabled ? 'translate-x-5' : 'translate-x-0'
                                        }`}
                                />
                            </button>
                        </div>

                        {settings.webhookEnabled && (
                            <div className="space-y-4 border-t border-gray-800 pt-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-2">
                                        Langarr URL <span className="text-gray-500">(how Overseerr reaches Langarr)</span>
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="http://langarr:8383"
                                        value={baseUrlInput}
                                        onChange={(e) => setBaseUrlInput(e.target.value)}
                                        onBlur={() => {
                                            const cleaned = baseUrlInput.replace(/\/$/, '');
                                            setBaseUrlInput(cleaned);
                                            if (cleaned !== settings.langarrBaseUrl) {
                                                updateSettings({ langarrBaseUrl: cleaned });
                                            }
                                        }}
                                        className="w-full rounded-md border-gray-700 bg-gray-800 text-white text-sm p-2.5 focus:border-blue-500 focus:ring-blue-500"
                                    />
                                    <div className="mt-2 text-xs text-gray-500 space-y-1">
                                        <p className="font-medium text-gray-400">Common configurations:</p>
                                        <p>Same Docker network: <code className="bg-gray-800 px-1.5 py-0.5 rounded">http://langarr:8383</code></p>
                                        <p>Same host machine: <code className="bg-gray-800 px-1.5 py-0.5 rounded">http://localhost:&lt;port&gt;</code></p>
                                        <p>Different machine: <code className="bg-gray-800 px-1.5 py-0.5 rounded">http://&lt;server-ip&gt;:&lt;port&gt;</code></p>
                                    </div>
                                </div>

                                {webhookUrl ? (
                                    <>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-400 mb-2">
                                                Webhook URL
                                            </label>
                                            <div className="flex">
                                                <input
                                                    type="text"
                                                    readOnly
                                                    value={webhookUrl}
                                                    className="flex-1 rounded-l-md border-gray-700 bg-gray-800 text-white text-sm font-mono p-2.5 focus:outline-none"
                                                />
                                                <button
                                                    onClick={copyToClipboard}
                                                    className="px-4 rounded-r-md bg-gray-700 hover:bg-gray-600 transition-colors flex items-center gap-2"
                                                >
                                                    {copied ? (
                                                        <CheckIcon className="h-4 w-4 text-green-400" />
                                                    ) : (
                                                        <ClipboardDocumentIcon className="h-4 w-4 text-gray-300" />
                                                    )}
                                                </button>
                                            </div>
                                        </div>

                                        {settings.lastWebhookTestAt && (
                                            <div className="flex items-center gap-2 text-sm mt-2">
                                                <div className="h-2 w-2 rounded-full bg-green-500"></div>
                                                <span className="text-gray-400">
                                                    Last tested: {formatRelativeTime(settings.lastWebhookTestAt)}
                                                </span>
                                            </div>
                                        )}

                                        <div className="rounded-md bg-gray-800/50 p-4 text-sm text-gray-300">
                                            <p className="font-medium mb-2">Setup in Overseerr:</p>
                                            <ol className="list-decimal list-inside space-y-1 text-gray-400">
                                                <li>Verify the Langarr URL above is correct for your network setup</li>
                                                <li>Go to Settings → Notifications → Webhook in Overseerr</li>
                                                <li>Enable and paste the webhook URL above</li>
                                                <li>Check &quot;Request Approved&quot; and &quot;Request Auto-Approved&quot;</li>
                                                <li>Click &quot;Test&quot; to verify (status will appear above)</li>
                                                <li>Save changes</li>
                                            </ol>
                                        </div>
                                    </>
                                ) : (
                                    <p className="text-sm text-gray-500">Enter the Langarr URL above to see your webhook URL</p>
                                )}
                            </div>
                        )}
                    </div>
                )}

                <OverseerrModal
                    key={selectedInstance?.id || 'new'}
                    isOpen={isModalOpen}
                    onClose={() => {
                        setIsModalOpen(false);
                        setSelectedInstance(null);
                    }}
                    onSave={() => mutate()}
                    instance={selectedInstance}
                />

                <ConfirmationModal
                    isOpen={!!deleteId}
                    onClose={() => setDeleteId(null)}
                    onConfirm={confirmDelete}
                    title="Disconnect Overseerr"
                    message="Are you sure you want to disconnect Overseerr? This will stop all synchronization."
                    confirmText="Disconnect"
                    isDestructive
                />
            </div>
        </>
    );
}
