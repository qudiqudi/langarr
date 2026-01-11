import { Fragment, useRef, useState, useEffect } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { BeakerIcon, FilmIcon, TvIcon, ArrowPathIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';

interface DryRunAction {
    type: 'movie' | 'series' | 'request';
    instance: string;
    title: string;
    currentProfile?: string;
    targetProfile?: string;
    currentTags?: string[];
    newTags?: string[];
    action: string;
}

interface DryRunResult {
    totalChanges: number;
    actions: DryRunAction[];
    error?: string;
}

interface DryRunPreviewModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function DryRunPreviewModal({ isOpen, onClose }: DryRunPreviewModalProps) {
    const closeButtonRef = useRef(null);
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<DryRunResult | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) {
            runDryRunPreview();
        } else {
            // Reset state when modal closes
            setResult(null);
            setError(null);
        }
    }, [isOpen]);

    const runDryRunPreview = async () => {
        setLoading(true);
        setError(null);
        setResult(null);

        try {
            const res = await fetch('/api/v1/actions/dry-run-preview', { method: 'POST' });
            if (!res.ok) {
                throw new Error('Failed to run dry-run preview');
            }
            const data = await res.json();
            setResult(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An error occurred');
        } finally {
            setLoading(false);
        }
    };

    const getTypeIcon = (type: string) => {
        switch (type) {
            case 'movie':
                return <FilmIcon className="h-4 w-4 text-blue-400" />;
            case 'series':
                return <TvIcon className="h-4 w-4 text-purple-400" />;
            default:
                return <BeakerIcon className="h-4 w-4 text-yellow-400" />;
        }
    };

    return (
        <Transition.Root show={isOpen} as={Fragment}>
            <Dialog as="div" className="relative z-50" initialFocus={closeButtonRef} onClose={onClose}>
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
                                {/* Header */}
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-yellow-600/20">
                                        <BeakerIcon className="h-6 w-6 text-yellow-500" />
                                    </div>
                                    <div>
                                        <Dialog.Title as="h3" className="text-lg font-semibold text-white">
                                            Dry-Run Preview
                                        </Dialog.Title>
                                        <p className="text-sm text-gray-400">
                                            Preview of changes that would be made (no actual changes applied)
                                        </p>
                                    </div>
                                </div>

                                {/* Content */}
                                <div className="min-h-[200px] max-h-[400px] overflow-y-auto">
                                    {loading && (
                                        <div className="flex items-center justify-center py-12">
                                            <ArrowPathIcon className="h-8 w-8 text-yellow-500 animate-spin" />
                                            <span className="ml-3 text-gray-400">Analyzing library...</span>
                                        </div>
                                    )}

                                    {error && (
                                        <div className="flex items-center justify-center py-12">
                                            <ExclamationTriangleIcon className="h-8 w-8 text-red-500" />
                                            <span className="ml-3 text-red-400">{error}</span>
                                        </div>
                                    )}

                                    {result && !loading && (
                                        <>
                                            {/* Summary */}
                                            <div className="mb-4 p-3 rounded-lg bg-gray-800 border border-gray-700">
                                                <div className="text-sm text-gray-400">Total Changes</div>
                                                <div className="text-2xl font-bold text-white">{result.totalChanges}</div>
                                            </div>

                                            {/* Actions List */}
                                            {result.actions.length > 0 ? (
                                                <div className="space-y-2">
                                                    {result.actions.map((action, index) => (
                                                        <div
                                                            key={index}
                                                            className="p-3 rounded-lg bg-gray-800/50 border border-gray-700/50 hover:border-gray-600 transition-colors"
                                                        >
                                                            <div className="flex items-center gap-2 mb-1">
                                                                {getTypeIcon(action.type)}
                                                                <span className="font-medium text-white truncate">
                                                                    {action.title}
                                                                </span>
                                                                <span className="text-xs text-gray-500 ml-auto">
                                                                    {action.instance}
                                                                </span>
                                                            </div>
                                                            <div className="text-sm text-gray-400">
                                                                {action.action}
                                                            </div>
                                                            {action.targetProfile && (
                                                                <div className="text-xs text-blue-400 mt-1">
                                                                    Profile: {action.currentProfile || 'Unknown'} → {action.targetProfile}
                                                                </div>
                                                            )}
                                                            {action.newTags && action.newTags.length > 0 && (
                                                                <div className="text-xs text-green-400 mt-1">
                                                                    Tags: +{action.newTags.join(', ')}
                                                                </div>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <div className="text-center py-8 text-gray-400">
                                                    <p>No changes needed.</p>
                                                    <p className="text-sm mt-1">Your library is already up to date!</p>
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>

                                {/* Footer */}
                                <div className="mt-5 sm:mt-4 flex justify-end">
                                    <button
                                        type="button"
                                        className="inline-flex justify-center rounded-md bg-gray-700 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-gray-600 transition-colors"
                                        onClick={onClose}
                                        ref={closeButtonRef}
                                    >
                                        Close
                                    </button>
                                </div>
                            </Dialog.Panel>
                        </Transition.Child>
                    </div>
                </div>
            </Dialog>
        </Transition.Root>
    );
}
