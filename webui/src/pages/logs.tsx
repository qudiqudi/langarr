import { useState, useEffect, useCallback, Fragment } from 'react';
import Head from 'next/head';
import { TrashIcon, ArrowPathIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { Dialog, Transition } from '@headlessui/react';

interface LogEntry {
    id: number;
    timestamp: string;
    level: 'debug' | 'info' | 'warn' | 'error';
    source: string;
    message: string;
    metadata?: string;
}

export default function LogsPage() {
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterSource, setFilterSource] = useState<string>('');
    const [filterLevel, setFilterLevel] = useState<string>('');
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [showClearModal, setShowClearModal] = useState(false);

    const fetchLogs = useCallback(async (isManual = false) => {
        if (isManual) setIsRefreshing(true);
        try {
            const params = new URLSearchParams();
            if (filterSource) params.append('source', filterSource);
            if (filterLevel) params.append('level', filterLevel);

            const res = await fetch(`/api/v1/logs?${params.toString()}`);
            if (!res.ok) throw new Error('Failed to fetch logs');
            const data = await res.json();
            setLogs(data.data);
            if (isManual) toast.success('Logs refreshed');
        } catch {
            toast.error('Failed to load logs');
        } finally {
            setLoading(false);
            if (isManual) setIsRefreshing(false);
        }
    }, [filterSource, filterLevel]);

    useEffect(() => {
        fetchLogs();

        // Connect to SSE for real-time updates
        const eventSource = new EventSource('/api/v1/logs/stream');

        eventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type === 'log') {
                    // Prepend new log entry
                    setLogs(prevLogs => [data.data, ...prevLogs].slice(0, 100)); // Keep max 100 logs
                }
            } catch (error) {
                console.error('Failed to parse SSE message:', error);
            }
        };

        eventSource.onerror = () => {
            console.error('SSE connection error');
            eventSource.close();
        };

        return () => {
            eventSource.close();
        };
    }, [fetchLogs]);

    const confirmClearLogs = async () => {
        try {
            const res = await fetch('/api/v1/logs', { method: 'DELETE' });
            if (!res.ok) throw new Error('Failed to clear logs');
            toast.success('Logs cleared');
            setShowClearModal(false);
            fetchLogs(false);
        } catch {
            toast.error('Failed to clear logs');
        }
    };

    const getLevelColor = (level: string) => {
        switch (level) {
            case 'error': return 'text-red-400';
            case 'warn': return 'text-yellow-400';
            case 'debug': return 'text-gray-400';
            default: return 'text-blue-400';
        }
    };

    return (
        <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
            <Head>
                <title>System Logs - Langarr</title>
            </Head>

            <div className="md:flex md:items-center md:justify-between">
                <div className="min-w-0 flex-1">
                    <h2 className="text-2xl font-bold leading-7 text-white sm:truncate sm:text-3xl sm:tracking-tight">
                        System Logs
                    </h2>
                </div>
                <div className="mt-4 flex md:ml-4 md:mt-0">
                    <button
                        onClick={() => fetchLogs(true)}
                        disabled={isRefreshing}
                        className={`ml-3 inline-flex items-center rounded-md bg-white/10 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-white/20 ${isRefreshing ? 'opacity-75 cursor-not-allowed' : ''}`}
                    >
                        <ArrowPathIcon className={`-ml-0.5 mr-1.5 h-5 w-5 ${isRefreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
                        {isRefreshing ? 'Refreshing...' : 'Refresh'}
                    </button>
                    <button
                        onClick={() => setShowClearModal(true)}
                        className="ml-3 inline-flex items-center rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-500"
                    >
                        <TrashIcon className="-ml-0.5 mr-1.5 h-5 w-5" aria-hidden="true" />
                        Clear
                    </button>
                </div>
            </div>

            {/* Filters */}
            <div className="flex gap-4">
                <select
                    value={filterLevel}
                    onChange={(e) => setFilterLevel(e.target.value)}
                    className="rounded-md border-gray-700 bg-gray-800 text-sm text-white focus:border-blue-500 focus:ring-blue-500"
                >
                    <option value="">All Levels</option>
                    <option value="info">Info</option>
                    <option value="warn">Warn</option>
                    <option value="error">Error</option>
                </select>
                <select
                    value={filterSource}
                    onChange={(e) => setFilterSource(e.target.value)}
                    className="rounded-md border-gray-700 bg-gray-800 text-sm text-white focus:border-blue-500 focus:ring-blue-500"
                >
                    <option value="">All Sources</option>
                    <option value="sync">Sync</option>
                    <option value="system">System</option>
                    <option value="webhook">Webhook</option>
                </select>
            </div>

            {/* Logs Table */}
            <div className="overflow-hidden bg-gray-900 shadow ring-1 ring-white/10 sm:rounded-lg">
                <table className="min-w-full divide-y divide-gray-700">
                    <thead className="bg-gray-800">
                        <tr>
                            <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-white sm:pl-6">
                                Timestamp
                            </th>
                            <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-white">
                                Level
                            </th>
                            <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-white">
                                Source
                            </th>
                            <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-white">
                                Message
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800 bg-gray-900">
                        {loading ? (
                            <tr>
                                <td colSpan={4} className="py-4 text-center text-gray-400">Loading logs...</td>
                            </tr>
                        ) : logs.length === 0 ? (
                            <tr>
                                <td colSpan={4} className="py-4 text-center text-gray-400">No logs found</td>
                            </tr>
                        ) : (
                            logs.map((log) => (
                                <tr key={log.id}>
                                    <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm text-gray-400 sm:pl-6">
                                        {new Date(log.timestamp).toLocaleString()}
                                    </td>
                                    <td className={`whitespace-nowrap px-3 py-4 text-sm font-semibold uppercase ${getLevelColor(log.level)}`}>
                                        {log.level}
                                    </td>
                                    <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-300">
                                        {log.source}
                                    </td>
                                    <td className="whitespace-pre-wrap px-3 py-4 text-sm text-gray-300 font-mono">
                                        {log.message}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Clear Logs Confirmation Modal */}
            <Transition.Root show={showClearModal} as={Fragment}>
                <Dialog as="div" className="relative z-50" onClose={setShowClearModal}>
                    <Transition.Child
                        as={Fragment}
                        enter="ease-out duration-300"
                        enterFrom="opacity-0"
                        enterTo="opacity-100"
                        leave="ease-in duration-200"
                        leaveFrom="opacity-100"
                        leaveTo="opacity-0"
                    >
                        <div className="fixed inset-0 bg-gray-900/75 transition-opacity" />
                    </Transition.Child>

                    <div className="fixed inset-0 z-10 overflow-y-auto">
                        <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
                            <Transition.Child
                                as={Fragment}
                                enter="ease-out duration-300"
                                enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
                                enterTo="opacity-100 translate-y-0 sm:scale-100"
                                leave="ease-in duration-200"
                                leaveFrom="opacity-100 translate-y-0 sm:scale-100"
                                leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
                            >
                                <Dialog.Panel className="relative transform overflow-hidden rounded-lg bg-gray-800 px-4 pb-4 pt-5 text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg sm:p-6">
                                    <div className="sm:flex sm:items-start">
                                        <div className="mx-auto flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-red-100 sm:mx-0 sm:h-10 sm:w-10">
                                            <ExclamationTriangleIcon className="h-6 w-6 text-red-600" aria-hidden="true" />
                                        </div>
                                        <div className="mt-3 text-center sm:ml-4 sm:mt-0 sm:text-left">
                                            <Dialog.Title as="h3" className="text-base font-semibold leading-6 text-white">
                                                Clear All Logs
                                            </Dialog.Title>
                                            <div className="mt-2">
                                                <p className="text-sm text-gray-400">
                                                    Are you sure you want to clear all system logs? This action cannot be undone.
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="mt-5 sm:mt-4 sm:flex sm:flex-row-reverse">
                                        <button
                                            type="button"
                                            className="inline-flex w-full justify-center rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-500 sm:ml-3 sm:w-auto"
                                            onClick={confirmClearLogs}
                                        >
                                            Clear Logs
                                        </button>
                                        <button
                                            type="button"
                                            className="mt-3 inline-flex w-full justify-center rounded-md bg-white/10 px-3 py-2 text-sm font-semibold text-white shadow-sm ring-1 ring-inset ring-gray-600 hover:bg-white/20 sm:mt-0 sm:w-auto"
                                            onClick={() => setShowClearModal(false)}
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </Dialog.Panel>
                            </Transition.Child>
                        </div>
                    </div>
                </Dialog>
            </Transition.Root>
        </div>
    );
}
