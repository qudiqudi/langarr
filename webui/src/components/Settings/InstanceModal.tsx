import { Fragment, useEffect, useState } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { useFormik } from 'formik';
import * as Yup from 'yup';
import toast from 'react-hot-toast';
import axios from 'axios';
import LanguageSelector from './LanguageSelector';

interface Profile {
    id: number;
    name: string;
}

interface InstanceValues {
    id?: number;
    name: string;
    baseUrl: string;
    apiKey?: string;
    originalProfile: string;
    dubProfile: string;
    tagName: string;
    originalLanguages: string[]; // Codes
    audioTaggingEnabled: boolean;
    onlyMonitored: boolean;
    enabled: boolean;
}

interface InstanceModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: () => void;
    instance?: InstanceValues | null;
    type: 'radarr' | 'sonarr';
}

export default function InstanceModal({ isOpen, onClose, onSave, instance, type }: InstanceModalProps) {
    const [loadingMetadata, setLoadingMetadata] = useState(false);
    const [profiles, setProfiles] = useState<Profile[]>([]);
    const [testing, setTesting] = useState(false);

    const isEdit = !!instance;

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
        originalProfile: Yup.string().required('Original Profile is required'),
        dubProfile: Yup.string().required('Dub Profile is required'),
        tagName: Yup.string().required('Tag Name is required'),
    });

    const defaultPort = type === 'radarr' ? '7878' : '8989';

    const formik = useFormik<InstanceValues>({
        initialValues: {
            name: instance?.name || '',
            baseUrl: instance?.baseUrl || `http://${type}:${defaultPort}`,
            apiKey: '', // Always empty initially for security
            originalProfile: instance?.originalProfile || '',
            dubProfile: instance?.dubProfile || '',
            tagName: instance?.tagName || 'prefer-dub',
            originalLanguages: instance?.originalLanguages || [],
            audioTaggingEnabled: instance?.audioTaggingEnabled ?? false,
            onlyMonitored: instance?.onlyMonitored ?? false,
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
                        await axios.put(`/api/v1/${type}/${instance.id}`, rest);
                    } else {
                        await axios.put(`/api/v1/${type}/${instance.id}`, payload);
                    }
                    toast.success('Instance updated');
                } else {
                    await axios.post(`/api/v1/${type}`, values);
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

    // Load profiles on open if editing
    useEffect(() => {
        if (isOpen && isEdit && instance?.id) {
            fetchMetadata(true); // true = useStored
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, instance]);

    // Fetch profiles
    const fetchMetadata = async (useStored = false) => {
        if (!useStored && (!formik.values.baseUrl || !formik.values.apiKey)) return;

        setLoadingMetadata(true);
        try {
            let response;
            if (useStored && instance?.id) {
                response = await axios.get(`/api/v1/${type}/${instance.id}/profiles`);
            } else {
                response = await axios.post(`/api/v1/${type}/proxy/profiles`, {
                    baseUrl: formik.values.baseUrl,
                    apiKey: formik.values.apiKey,
                });
            }
            setProfiles(response.data);
        } catch (error) {
            console.error('Failed to fetch metadata', error);
            // Don't toast on auto-fetch to avoid spamming if offline
            if (!useStored) toast.error('Could not fetch profiles');
        } finally {
            setLoadingMetadata(false);
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
                await axios.post(`/api/v1/${type}/${instance.id}/test`);
            } else {
                await axios.post(`/api/v1/${type}/test`, {
                    baseUrl: formik.values.baseUrl,
                    apiKey: formik.values.apiKey,
                });
            }
            toast.success('Connection successful');
            fetchMetadata(useStored);
        } catch {
            toast.error('Connection failed');
        } finally {
            setTesting(false);
        }
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
                            <Dialog.Panel className="relative transform rounded-lg bg-gray-900 px-4 pb-4 pt-5 text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-2xl sm:p-6">
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
                                        {isEdit ? `Edit ${type === 'radarr' ? 'Radarr' : 'Sonarr'} Instance` : `Add ${type === 'radarr' ? 'Radarr' : 'Sonarr'} Instance`}
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
                                                    placeholder={`http://${type}:${defaultPort}`}
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
                                        </div>

                                        <div className="border-t border-gray-700 pt-4">
                                            <h4 className="text-sm font-medium text-gray-200 mb-4">Profiles & Tags</h4>
                                            <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
                                                <div>
                                                    <label className="block text-sm font-medium leading-6 text-gray-300">Original Profile</label>
                                                    <select
                                                        {...formik.getFieldProps('originalProfile')}
                                                        disabled={loadingMetadata}
                                                        className="mt-2 block w-full rounded-md border-0 bg-gray-800 py-1.5 text-white shadow-sm ring-1 ring-inset ring-gray-700 focus:ring-2 focus:ring-inset focus:ring-indigo-500 sm:text-sm sm:leading-6"
                                                    >
                                                        <option value="">Select Profile</option>
                                                        {profiles.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium leading-6 text-gray-300">Dub Profile</label>
                                                    <select
                                                        {...formik.getFieldProps('dubProfile')}
                                                        disabled={loadingMetadata}
                                                        className="mt-2 block w-full rounded-md border-0 bg-gray-800 py-1.5 text-white shadow-sm ring-1 ring-inset ring-gray-700 focus:ring-2 focus:ring-inset focus:ring-indigo-500 sm:text-sm sm:leading-6"
                                                    >
                                                        <option value="">Select Profile</option>
                                                        {profiles.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium leading-6 text-gray-300">Target Tag Name</label>
                                                    <input
                                                        type="text"
                                                        {...formik.getFieldProps('tagName')}
                                                        className="mt-2 block w-full rounded-md border-0 bg-gray-800 py-1.5 text-white shadow-sm ring-1 ring-inset ring-gray-700 focus:ring-2 focus:ring-inset focus:ring-indigo-500 sm:text-sm sm:leading-6"
                                                    />
                                                    <p className="text-xs text-gray-500 mt-1">Tag added to processed items</p>
                                                </div>
                                            </div>

                                            <div className="mt-4">
                                                <LanguageSelector
                                                    label="Original Languages"
                                                    value={formik.values.originalLanguages}
                                                    onChange={(val) => formik.setFieldValue('originalLanguages', val)}
                                                    placeholder="Select languages to keep original..."
                                                />
                                            </div>

                                            <div className="mt-4">
                                                <div className="flex items-center justify-between">
                                                    <div>
                                                        <label className="block text-sm font-medium text-gray-300">Enable Audio Tagging</label>
                                                        <p className="text-xs text-gray-500 mt-1">Use global audio tag rules (configure in Settings)</p>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => formik.setFieldValue('audioTaggingEnabled', !formik.values.audioTaggingEnabled)}
                                                        className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${formik.values.audioTaggingEnabled ? 'bg-blue-600' : 'bg-gray-700'
                                                            }`}
                                                    >
                                                        <span
                                                            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${formik.values.audioTaggingEnabled ? 'translate-x-5' : 'translate-x-0'
                                                                }`}
                                                        />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="border-t border-gray-700 pt-4 mt-4">
                                            <h4 className="text-sm font-medium text-gray-200 mb-4">Advanced Settings</h4>
                                            <div className="space-y-4">
                                                <div>
                                                    <div className="flex items-center">
                                                        <input
                                                            type="checkbox"
                                                            id="onlyMonitored"
                                                            {...formik.getFieldProps('onlyMonitored')}
                                                            checked={formik.values.onlyMonitored}
                                                            className="h-4 w-4 rounded border-gray-600 bg-gray-800 text-indigo-600 focus:ring-indigo-500"
                                                        />
                                                        <label htmlFor="onlyMonitored" className="ml-3 text-sm text-gray-300">
                                                            Only Monitored Items
                                                        </label>
                                                    </div>
                                                    <p className="text-xs text-gray-500 mt-1 ml-7">Skip unmonitored movies/series during sync</p>
                                                </div>
                                            </div>
                                        </div>

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
