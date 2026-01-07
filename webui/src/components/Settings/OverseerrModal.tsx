import { Fragment, useEffect, useState } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { useFormik } from 'formik';
import * as Yup from 'yup';
import toast from 'react-hot-toast';
import axios from 'axios';
import useSWR from 'swr';

interface Server {
    id: number;
    name: string;
}

interface ServerMapping {
    [overseerrId: string]: string; // Maps to Langarr Instance Name
}

interface OverseerrValues {
    id?: number;
    name: string;
    baseUrl: string;
    apiKey?: string;
    pollIntervalMinutes: number;
    radarrServerMappings: ServerMapping;
    sonarrServerMappings: ServerMapping;
    enabled: boolean;
}

interface OverseerrModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: () => void;
    instance?: OverseerrValues | null;
}

export default function OverseerrModal({ isOpen, onClose, onSave, instance }: OverseerrModalProps) {
    const isEdit = !!instance;
    const [testing, setTesting] = useState(false);
    const [overseerrRadarrServers, setOverseerrRadarrServers] = useState<Server[]>([]);
    const [overseerrSonarrServers, setOverseerrSonarrServers] = useState<Server[]>([]);

    const { data: radarrInstances } = useSWR<Server[]>('/api/v1/radarr');
    const { data: sonarrInstances } = useSWR<Server[]>('/api/v1/sonarr');

    const validationSchema = Yup.object({
        name: Yup.string().required('Name is required'),
        baseUrl: Yup.string()
            .required('URL is required')
            .test('is-url', 'Must be a valid URL', (value) => {
                if (!value) return false;
                try {
                    new URL(value);
                    return true;
                } catch {
                    return false;
                }
            }),
        apiKey: isEdit ? Yup.string() : Yup.string().required('API Key is required'),
        pollIntervalMinutes: Yup.number().min(1, 'Must be at least 1 minute').required(),
    });

    const formik = useFormik<OverseerrValues>({
        initialValues: {
            name: instance?.name || '',
            baseUrl: instance?.baseUrl || 'http://overseerr:5055',
            apiKey: '', // Always empty initially
            pollIntervalMinutes: instance?.pollIntervalMinutes || 10,
            radarrServerMappings: instance?.radarrServerMappings || {},
            sonarrServerMappings: instance?.sonarrServerMappings || {},
            enabled: instance?.enabled ?? true,
        },
        enableReinitialize: true,
        validationSchema,
        onSubmit: async (values) => {
            try {
                if (isEdit && instance?.id) {
                    // Only send API key if user entered one
                    const payload = { ...values };
                    if (!payload.apiKey) {
                        // eslint-disable-next-line @typescript-eslint/no-unused-vars
                        const { apiKey, ...rest } = payload;
                        await axios.put(`/api/v1/overseerr/${instance.id}`, rest);
                    } else {
                        await axios.put(`/api/v1/overseerr/${instance.id}`, payload);
                    }
                    toast.success('Instance updated');
                } else {
                    await axios.post(`/api/v1/overseerr`, values);
                    toast.success('Instance created');
                }
                onSave();
                onClose();
            } catch (err) {
                const error = err as { response?: { data?: { error?: string } } };
                toast.error(error.response?.data?.error || 'Failed to save instance');
            }
        },
    });

    // Load servers on open if editing
    useEffect(() => {
        if (isOpen && isEdit && instance?.id) {
            fetchServers(true, false); // true = useStored, false = don't show error on mount
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, instance]);

    const fetchServers = async (useStored = false, showError = true) => {
        if (!useStored && (!formik.values.baseUrl || !formik.values.apiKey)) return;

        try {
            let response;
            if (useStored && instance?.id) {
                response = await axios.get(`/api/v1/overseerr/${instance.id}/servers`);
            } else {
                response = await axios.post(`/api/v1/overseerr/proxy/servers`, {
                    baseUrl: formik.values.baseUrl,
                    apiKey: formik.values.apiKey,
                });
            }
            setOverseerrRadarrServers(response.data.radarr);
            setOverseerrSonarrServers(response.data.sonarr);
        } catch (err) {
            const error = err as { response?: { status?: number } };
            // Silently ignore 404s when using stored credentials (likely deleted instance)
            const is404 = error?.response?.status === 404;
            if (useStored && is404) {
                // Silently fail - instance likely deleted
                return;
            }
            console.error('Failed to fetch servers', error);
            if (!useStored && showError) {
                toast.error('Could not fetch servers from Overseerr');
            }
        }
    };

    const testConnection = async () => {
        // If editing and no new key entered, use stored test
        const useStored = isEdit && !formik.values.apiKey;

        if (!useStored && (!formik.values.baseUrl || !formik.values.apiKey)) {
            toast.error('Enter URL and API Key first');
            return;
        }
        setTesting(true);
        try {
            if (useStored && instance?.id) {
                await axios.post(`/api/v1/overseerr/${instance.id}/test`);
            } else {
                await axios.post(`/api/v1/overseerr/test`, {
                    baseUrl: formik.values.baseUrl,
                    apiKey: formik.values.apiKey,
                });
            }
            toast.success('Connection successful');
            fetchServers(useStored, false); // Don't show error toast after successful connection
        } catch {
            toast.error('Connection failed');
        } finally {
            setTesting(false);
        }
    };

    // Helper to update mapping
    const updateMapping = (type: 'radarr' | 'sonarr', overseerrId: number, langarrName: string) => {
        const field = type === 'radarr' ? 'radarrServerMappings' : 'sonarrServerMappings';
        const currentMappings = { ...formik.values[field] };
        if (langarrName) {
            currentMappings[overseerrId] = langarrName;
        } else {
            delete currentMappings[overseerrId];
        }
        formik.setFieldValue(field, currentMappings);
    };

    return (
        <Transition.Root show={isOpen} as={Fragment}>
            <Dialog as="div" className="relative z-50" onClose={onClose}>
                <Transition.Child
                    as={Fragment}
                    enter="ease-out duration-300"
                    enterFrom="opacity-0"
                    enterTo="opacity-100"
                    leave="ease-in duration-200"
                    leaveFrom="opacity-100"
                    leaveTo="opacity-0"
                >
                    <div className="fixed inset-0 bg-gray-950 bg-opacity-75 transition-opacity" />
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
                            <Dialog.Panel className="relative transform overflow-hidden rounded-lg bg-gray-900 px-4 pb-4 pt-5 text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-2xl sm:p-6">
                                <div className="absolute right-0 top-0 hidden pr-4 pt-4 sm:block">
                                    <button
                                        type="button"
                                        className="rounded-md bg-gray-900 text-gray-400 hover:text-gray-200"
                                        onClick={onClose}
                                    >
                                        <span className="sr-only">Close</span>
                                        <XMarkIcon className="h-6 w-6" aria-hidden="true" />
                                    </button>
                                </div>

                                <div className="mt-3 text-center sm:mt-0 sm:text-left w-full">
                                    <Dialog.Title as="h3" className="text-xl font-semibold leading-6 text-white mb-6">
                                        {isEdit ? 'Edit Overseerr Instance' : 'Add Overseerr Instance'}
                                    </Dialog.Title>

                                    <form onSubmit={formik.handleSubmit} className="space-y-6">
                                        {/* Basic Info */}
                                        <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
                                            <div>
                                                <label className="block text-sm font-medium leading-6 text-gray-300">Name</label>
                                                <input
                                                    type="text"
                                                    {...formik.getFieldProps('name')}
                                                    className="mt-2 block w-full rounded-md border-0 bg-gray-800 py-1.5 text-white shadow-sm ring-1 ring-inset ring-gray-700 focus:ring-2 focus:ring-inset focus:ring-indigo-500 sm:text-sm sm:leading-6"
                                                />
                                                {formik.touched.name && formik.errors.name && (
                                                    <p className="text-red-500 text-xs mt-1">{formik.errors.name}</p>
                                                )}
                                            </div>

                                            <div>
                                                <label className="block text-sm font-medium leading-6 text-gray-300">Enabled</label>
                                                <div className="mt-2 text-white">
                                                    <input type="checkbox" {...formik.getFieldProps('enabled')} checked={formik.values.enabled} className="mr-2" />
                                                    <span>Active</span>
                                                </div>
                                            </div>

                                            <div className="col-span-2 sm:col-span-1">
                                                <label className="block text-sm font-medium leading-6 text-gray-300">URL</label>
                                                <input
                                                    type="text"
                                                    {...formik.getFieldProps('baseUrl')}
                                                    placeholder="http://overseerr:5055"
                                                    className="mt-2 block w-full rounded-md border-0 bg-gray-800 py-1.5 text-white shadow-sm ring-1 ring-inset ring-gray-700 focus:ring-2 focus:ring-inset focus:ring-indigo-500 sm:text-sm sm:leading-6"
                                                />
                                                {formik.touched.baseUrl && formik.errors.baseUrl && (
                                                    <p className="text-red-500 text-xs mt-1">{formik.errors.baseUrl}</p>
                                                )}
                                            </div>

                                            <div className="col-span-2 sm:col-span-1">
                                                <label className="block text-sm font-medium leading-6 text-gray-300">API Key</label>
                                                <div className="flex gap-2">
                                                    <input
                                                        type="password"
                                                        {...formik.getFieldProps('apiKey')}
                                                        placeholder={isEdit ? 'Leave empty to keep unchanged' : ''}
                                                        className="mt-2 block w-full rounded-md border-0 bg-gray-800 py-1.5 text-white shadow-sm ring-1 ring-inset ring-gray-700 focus:ring-2 focus:ring-inset focus:ring-indigo-500 sm:text-sm sm:leading-6"
                                                    />
                                                    <button type="button" onClick={testConnection} disabled={testing} className="mt-2 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50">
                                                        {testing ? '...' : 'Test'}
                                                    </button>
                                                </div>
                                                {formik.touched.apiKey && formik.errors.apiKey && (
                                                    <p className="text-red-500 text-xs mt-1">{formik.errors.apiKey}</p>
                                                )}
                                            </div>

                                            <div className="col-span-2 sm:col-span-1">
                                                <label className="block text-sm font-medium leading-6 text-gray-300">Poll Interval (Minutes)</label>
                                                <input
                                                    type="number"
                                                    {...formik.getFieldProps('pollIntervalMinutes')}
                                                    className="mt-2 block w-full rounded-md border-0 bg-gray-800 py-1.5 text-white shadow-sm ring-1 ring-inset ring-gray-700 focus:ring-2 focus:ring-inset focus:ring-indigo-500 sm:text-sm sm:leading-6"
                                                />
                                                {formik.touched.pollIntervalMinutes && formik.errors.pollIntervalMinutes && (
                                                    <p className="text-red-500 text-xs mt-1">{formik.errors.pollIntervalMinutes}</p>
                                                )}
                                            </div>
                                        </div>

                                        {/* Server Mappings */}
                                        {(overseerrRadarrServers.length > 0 || overseerrSonarrServers.length > 0) && (
                                            <div className="border-t border-gray-700 pt-4">
                                                <h4 className="text-sm font-medium text-gray-200 mb-4">Server Mappings</h4>
                                                <p className="text-xs text-gray-500 mb-4">Map Overseerr servers to your defined Langarr instances.</p>

                                                {/* Radarr Mappings */}
                                                {overseerrRadarrServers.length > 0 && (
                                                    <div className="mb-4">
                                                        <h5 className="text-xs font-semibold text-indigo-400 uppercase tracking-wider mb-2">Radarr Servers</h5>
                                                        <div className="space-y-3">
                                                            {overseerrRadarrServers.map(server => (
                                                                <div key={server.id} className="flex items-center justify-between">
                                                                    <span className="text-sm text-gray-300">{server.name}</span>
                                                                    <select
                                                                        value={formik.values.radarrServerMappings[server.id] || ''}
                                                                        onChange={(e) => updateMapping('radarr', server.id, e.target.value)}
                                                                        className="block w-48 rounded-md border-0 bg-gray-800 py-1.5 text-white shadow-sm ring-1 ring-inset ring-gray-700 focus:ring-2 focus:ring-inset focus:ring-indigo-500 sm:text-sm sm:leading-6"
                                                                    >
                                                                        <option value="">-- Ignore --</option>
                                                                        {radarrInstances?.map(inst => (
                                                                            <option key={inst.name} value={inst.name}>{inst.name}</option>
                                                                        ))}
                                                                    </select>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Sonarr Mappings */}
                                                {overseerrSonarrServers.length > 0 && (
                                                    <div>
                                                        <h5 className="text-xs font-semibold text-indigo-400 uppercase tracking-wider mb-2">Sonarr Servers</h5>
                                                        <div className="space-y-3">
                                                            {overseerrSonarrServers.map(server => (
                                                                <div key={server.id} className="flex items-center justify-between">
                                                                    <span className="text-sm text-gray-300">{server.name}</span>
                                                                    <select
                                                                        value={formik.values.sonarrServerMappings[server.id] || ''}
                                                                        onChange={(e) => updateMapping('sonarr', server.id, e.target.value)}
                                                                        className="block w-48 rounded-md border-0 bg-gray-800 py-1.5 text-white shadow-sm ring-1 ring-inset ring-gray-700 focus:ring-2 focus:ring-inset focus:ring-indigo-500 sm:text-sm sm:leading-6"
                                                                    >
                                                                        <option value="">-- Ignore --</option>
                                                                        {sonarrInstances?.map(inst => (
                                                                            <option key={inst.name} value={inst.name}>{inst.name}</option>
                                                                        ))}
                                                                    </select>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        <div className="mt-5 sm:mt-6 sm:grid sm:grid-flow-row-dense sm:grid-cols-2 sm:gap-3">
                                            <button
                                                type="submit"
                                                disabled={formik.isSubmitting}
                                                className="inline-flex w-full justify-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 sm:col-start-2 disabled:opacity-50"
                                            >
                                                {isEdit ? 'Save Changes' : 'Add Instance'}
                                            </button>
                                            <button
                                                type="button"
                                                className="mt-3 inline-flex w-full justify-center rounded-md bg-gray-800 px-3 py-2 text-sm font-semibold text-gray-300 shadow-sm ring-1 ring-inset ring-gray-600 hover:bg-gray-700 sm:col-start-1 sm:mt-0"
                                                onClick={onClose}
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    </form>
                                </div>
                            </Dialog.Panel>
                        </Transition.Child>
                    </div>
                </div>
            </Dialog>
        </Transition.Root>
    );
}
