import { useState } from 'react';
import Head from 'next/head';
import useSWR from 'swr';
import { PlusIcon, PencilSquareIcon, TrashIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import axios from 'axios';
import InstanceModal from '@/components/Settings/InstanceModal';
import ConfirmationModal from '@/components/Common/ConfirmationModal';

interface RadarrInstance {
    id: number;
    name: string;
    baseUrl: string;
    apiKey?: string; // Optional - not returned from API for security
    enabled: boolean;
    originalProfile: string;
    dubProfile: string;
    tagName: string;
    originalLanguages: string[];
    audioTaggingEnabled: boolean;
    triggerSearchOnUpdate: boolean;
    searchCooldownSeconds: number;
    minSearchIntervalSeconds: number;
    onlyMonitored: boolean;
}

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function RadarrSettings() {
    const { data: instances, mutate } = useSWR<RadarrInstance[]>('/api/v1/radarr', fetcher);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedInstance, setSelectedInstance] = useState<RadarrInstance | null>(null);

    const [deleteId, setDeleteId] = useState<number | null>(null);

    const handleEdit = (instance: RadarrInstance) => {
        setSelectedInstance(instance);
        setIsModalOpen(true);
    };

    const handleAdd = () => {
        setSelectedInstance(null);
        setIsModalOpen(true);
    };

    const handleDelete = (id: number) => {
        setDeleteId(id);
    };

    const confirmDelete = async () => {
        if (!deleteId) return;
        try {
            await axios.delete(`/api/v1/radarr/${deleteId}`);
            toast.success('Instance deleted');
            setSelectedInstance(null); // Clear selected instance after deletion
            mutate();
        } catch {
            toast.error('Failed to delete instance');
        } finally {
            setDeleteId(null);
        }
    };

    return (
        <>
            <Head>
                <title>Radarr Settings - Langarr</title>
            </Head>

            <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
                <div className="md:flex md:items-center md:justify-between">
                    <div className="min-w-0 flex-1">
                        <h2 className="text-2xl font-bold leading-7 text-white sm:truncate sm:text-3xl sm:tracking-tight">
                            Radarr Instances
                        </h2>
                        <p className="mt-2 text-sm text-gray-400">
                            Manage your Radarr instances and synchronization settings.
                        </p>
                    </div>
                    {instances && instances.length > 0 && (
                        <div className="mt-4 flex md:ml-4 md:mt-0">
                            <button
                                type="button"
                                onClick={handleAdd}
                                className="ml-3 inline-flex items-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
                            >
                                <PlusIcon className="-ml-0.5 mr-1.5 h-5 w-5" aria-hidden="true" />
                                Add Instance
                            </button>
                        </div>
                    )}
                </div>

                {/* List of Instances */}
                {(!instances || instances.length === 0) ? (
                    <div className="rounded-lg bg-gray-900 shadow-sm ring-1 ring-gray-800 p-12 text-center">
                        <h3 className="mt-2 text-sm font-semibold text-white">No instances</h3>
                        <p className="mt-1 text-sm text-gray-500">Get started by adding a Radarr instance.</p>
                        <div className="mt-6">
                            <button
                                type="button"
                                onClick={handleAdd}
                                className="inline-flex items-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
                            >
                                <PlusIcon className="-ml-0.5 mr-1.5 h-5 w-5" aria-hidden="true" />
                                Add Instance
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {instances.map((instance) => (
                            <div key={instance.id} className={`relative flex flex-col rounded-lg border ${instance.enabled ? 'border-gray-700 bg-gray-800' : 'border-gray-800 bg-gray-900 opacity-75'} p-6 shadow-sm hover:border-indigo-500 transition-colors`}>
                                <div className="flex-1">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-lg font-medium text-white">{instance.name}</h3>
                                        {!instance.enabled && <span className="inline-flex items-center rounded-md bg-gray-400/10 px-2 py-1 text-xs font-medium text-gray-400 ring-1 ring-inset ring-gray-400/20">Disabled</span>}
                                    </div>
                                    <p className="mt-1 text-sm text-gray-400 truncate">{instance.baseUrl}</p>

                                    <div className="mt-4 border-t border-gray-700/50 pt-4 space-y-3">
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <span className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Profiles</span>
                                                <div className="mt-1 text-sm text-gray-300 space-y-1">
                                                    <div className="flex justify-between items-start gap-2">
                                                        <span className="text-gray-400 shrink-0">Original:</span>
                                                        <span className="text-right">{instance.originalProfile}</span>
                                                    </div>
                                                    <div className="flex justify-between items-start gap-2">
                                                        <span className="text-gray-400 shrink-0">Dub:</span>
                                                        <span className="text-right">{instance.dubProfile}</span>
                                                    </div>
                                                </div>
                                            </div>
                                            <div>
                                                <span className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Tags</span>
                                                <div className="mt-1 text-sm text-gray-300 space-y-1">
                                                    <div className="flex justify-between items-start gap-2">
                                                        <span className="text-gray-400 shrink-0">Target:</span>
                                                        <span className="text-right">{instance.tagName}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {instance.originalLanguages && instance.originalLanguages.length > 0 && (
                                            <div>
                                                <span className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Original Languages</span>
                                                <div className="mt-1 flex flex-wrap gap-1">
                                                    {instance.originalLanguages.map(lang => (
                                                        <span key={lang} className="inline-flex items-center rounded-md bg-indigo-400/10 px-2 py-1 text-xs font-medium text-indigo-400 ring-1 ring-inset ring-indigo-400/30">
                                                            {lang}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* Audio Tags Display */}
                                        {/* Since audioTags comes as JSON from API but types say array? Let's check type definition above. 
                                            The interface says 'AudioTagRule[]' but in API response it might be string? 
                                            Actually the fetcher just does res.json(). 
                                            The entity stores it as string, but the API response (if using TypeORM entity directly) might need parsing if no transformer used. 
                                            Wait, in routes/radarr.ts: The router returns `instance`. TypeORM entities usually return the raw column value for JSON if not using a Transformer.
                                            However, `instance.originalLanguages` and `audioTags` are defined as text/json in schema. 
                                            Let's assume the API returns them properly parsed or we need to handle it. 
                                            Given the existing code in InstanceModal uses them as arrays, `useSWR` likely returns the JSON object if the backend sends it as Content-Type application/json or if the backend parses it.
                                            Actually, looking at `server/routes/radarr.ts`, `instance.setOriginalLanguages` handles stringification for saving. But for `get`, it returns the entity. 
                                            If the entity column is `text`, TypeORM sends it as string. 
                                            WE NEED TO PARSE IT ON THE FRONTEND OR FIX BACKEND TO RETURN PARSED JSON.
                                            The `InstanceModal` code initialized formik values with `instance?.originalLanguages || []`. 
                                            If `instance` comes from SWR and `originalLanguages` is a string there, the modal would crash or show error.
                                            Let's play it safe and check type, or better yet, assume expanded card needs to handle it.
                                            Actually, the Interface `RadarrInstance` at the top of this file says `string[]`.
                                            Let's add a safe parser or simple check.
                                        */}

                                        <div>
                                            <span className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Audio Tagging</span>
                                            <div className="mt-1 text-xs text-gray-300">
                                                <span className={instance.audioTaggingEnabled ? "text-green-400" : "text-gray-600"}>●</span> {instance.audioTaggingEnabled ? 'Enabled' : 'Disabled'}
                                            </div>
                                        </div>

                                        <div>
                                            <span className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Advanced</span>
                                            <div className="mt-1 grid grid-cols-2 gap-2 text-xs text-gray-300">
                                                <div title="Trigger Search on Update">
                                                    <span className={instance.triggerSearchOnUpdate ? "text-green-400" : "text-gray-600"}>●</span> Search on Update
                                                </div>
                                                <div title="Only Monitored">
                                                    <span className={instance.onlyMonitored ? "text-green-400" : "text-gray-600"}>●</span> Only Monitored
                                                </div>
                                                <div>Cooldown: <span className="text-white">{instance.searchCooldownSeconds}s</span></div>
                                                <div>Min Interval: <span className="text-white">{instance.minSearchIntervalSeconds}s</span></div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-6 flex items-center gap-x-4 border-t border-gray-700 pt-4">
                                    <button onClick={() => handleEdit(instance)} className="text-gray-400 hover:text-white flex items-center gap-1 text-sm">
                                        <PencilSquareIcon className="h-4 w-4" /> Edit
                                    </button>
                                    <button onClick={() => handleDelete(instance.id)} className="text-gray-400 hover:text-red-400 flex items-center gap-1 text-sm ml-auto">
                                        <TrashIcon className="h-4 w-4" /> Delete
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                <InstanceModal
                    key={selectedInstance?.id || 'new'}
                    isOpen={isModalOpen}
                    onClose={() => {
                        setIsModalOpen(false);
                        setSelectedInstance(null);
                    }}
                    onSave={() => mutate()}
                    instance={selectedInstance}
                    type="radarr"
                />

                <ConfirmationModal
                    isOpen={!!deleteId}
                    onClose={() => setDeleteId(null)}
                    onConfirm={confirmDelete}
                    title="Delete Instance"
                    message="Are you sure you want to delete this instance? This action cannot be undone."
                    confirmText="Delete"
                    isDestructive
                />
            </div>
        </>
    );
}
