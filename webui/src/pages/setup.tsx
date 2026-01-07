import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import toast from 'react-hot-toast';
import InstanceModal from '@/components/Settings/InstanceModal';

export default function SetupPage() {
    const router = useRouter();
    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(false);
    const [checkingSetup, setCheckingSetup] = useState(true);
    const [errors, setErrors] = useState<{ syncInterval?: string }>({});
    const [formData, setFormData] = useState({
        syncInterval: 24,
        dryRunMode: false
    });
    const [isInstanceModalOpen, setIsInstanceModalOpen] = useState(false);
    const [instanceModalType, setInstanceModalType] = useState<'radarr' | 'sonarr'>('radarr');

    // Check authentication first, then setup status
    useEffect(() => {
        const checkAuthAndSetup = async () => {
            try {
                // Check if user is authenticated
                const authRes = await fetch('/api/v1/auth/me', { credentials: 'include' });
                if (!authRes.ok) {
                    // Not authenticated, redirect to login
                    router.push('/login');
                    return;
                }

                // Check if setup is already complete
                const settingsRes = await fetch('/api/v1/settings');
                if (settingsRes.ok) {
                    const settings = await settingsRes.json();
                    if (settings.isSetup) {
                        router.push('/dashboard');
                        return;
                    }
                }
            } catch {
                // On error, redirect to login for safety
                router.push('/login');
                return;
            }
            setCheckingSetup(false);
        };
        checkAuthAndSetup();
    }, [router]);

    const validateStep1 = (): boolean => {
        const newErrors: { syncInterval?: string } = {};

        if (!formData.syncInterval || formData.syncInterval < 1 || isNaN(formData.syncInterval)) {
            newErrors.syncInterval = 'Sync interval must be at least 1 hour';
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleNext = () => {
        if (validateStep1()) {
            setStep(step + 1);
        } else {
            toast.error('Please fix the errors before continuing');
        }
    };
    const handleBack = () => setStep(step - 1);

    const handleFinish = async () => {
        setLoading(true);
        try {
            // Update settings
            const res = await fetch('/api/v1/settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    syncIntervalHours: formData.syncInterval,
                    dryRunMode: formData.dryRunMode,
                    isSetup: true
                })
            });

            if (!res.ok) throw new Error('Failed to save settings');

            toast.success('Setup complete!');
            router.push('/dashboard');
        } catch (err) {
            toast.error('Failed to complete setup');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleSyncIntervalChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = parseInt(e.target.value);
        setFormData({ ...formData, syncInterval: isNaN(value) ? 0 : value });
        if (errors.syncInterval) {
            setErrors({ ...errors, syncInterval: undefined });
        }
    };


    if (checkingSetup) {
        return <div className="min-h-screen bg-gray-900 flex items-center justify-center text-white">Loading...</div>;
    }

    return (
        <div className="min-h-screen bg-gray-900 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
            <Head>
                <title>Setup - Langarr</title>
            </Head>

            <div className="sm:mx-auto sm:w-full sm:max-w-md">
                <h2 className="mt-6 text-center text-3xl font-bold tracking-tight text-white">
                    Welcome to Langarr
                </h2>
                <p className="mt-2 text-center text-sm text-gray-400">
                    Let&apos;s get your system configured
                </p>
                {/* Progress indicator */}
                <div className="mt-4 flex justify-center gap-2">
                    <div className={`h-2 w-12 rounded-full ${step >= 1 ? 'bg-blue-600' : 'bg-gray-700'}`} />
                    <div className={`h-2 w-12 rounded-full ${step >= 2 ? 'bg-blue-600' : 'bg-gray-700'}`} />
                    <div className={`h-2 w-12 rounded-full ${step >= 3 ? 'bg-blue-600' : 'bg-gray-700'}`} />
                </div>
                <p className="mt-2 text-center text-xs text-gray-500">Step {step} of 3</p>
            </div>

            <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
                <div className="bg-gray-800 py-8 px-4 shadow sm:rounded-lg sm:px-10">
                    {step === 1 && (
                        <div className="space-y-6">
                            <div>
                                <h3 className="text-lg font-medium text-white mb-4">Initial Configuration</h3>
                                <p className="text-gray-400 text-sm mb-6">
                                    Set how often Langarr should synchronize your media libraries.
                                </p>

                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-300">
                                            Sync Interval (Hours)
                                        </label>
                                        <input
                                            type="number"
                                            min="1"
                                            value={formData.syncInterval || ''}
                                            onChange={handleSyncIntervalChange}
                                            className={`mt-1 block w-full rounded-md ${errors.syncInterval ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : 'border-gray-600 focus:border-blue-500 focus:ring-blue-500'} bg-gray-700 text-white shadow-sm sm:text-sm`}
                                        />
                                        {errors.syncInterval && (
                                            <p className="mt-1 text-sm text-red-500">{errors.syncInterval}</p>
                                        )}
                                    </div>

                                    <div className="flex items-start">
                                        <div className="flex h-5 items-center">
                                            <input
                                                id="dryRun"
                                                type="checkbox"
                                                checked={formData.dryRunMode}
                                                onChange={(e) => setFormData({ ...formData, dryRunMode: e.target.checked })}
                                                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                            />
                                        </div>
                                        <div className="ml-3 text-sm">
                                            <label htmlFor="dryRun" className="font-medium text-gray-300">Enable Dry-run Mode</label>
                                            <p className="text-gray-500">Run syncs without making changes to your Arr instances.</p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="flex justify-end">
                                <button
                                    onClick={handleNext}
                                    className="flex w-full justify-center rounded-md border border-transparent bg-blue-600 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                                >
                                    Next
                                </button>
                            </div>
                        </div>
                    )}

                    {step === 2 && (
                        <div className="space-y-6">
                            <div>
                                <h3 className="text-lg font-medium text-white mb-4">Configure Instances</h3>
                                <p className="text-gray-400 text-sm mb-6">
                                    Add your Radarr and Sonarr instances (optional - you can skip this and add them later).
                                </p>

                                <div className="space-y-4">
                                    <div>
                                        <div className="flex items-center justify-between mb-2">
                                            <label className="text-sm font-medium text-gray-300">Radarr Instances</label>
                                            <button
                                                onClick={() => { setInstanceModalType('radarr'); setIsInstanceModalOpen(true); }}
                                                className="text-sm text-blue-500 hover:text-blue-400"
                                            >
                                                + Add Instance
                                            </button>
                                        </div>
                                        <p className="text-xs text-gray-500">Configure Radarr to manage your movie library</p>
                                    </div>

                                    <div>
                                        <div className="flex items-center justify-between mb-2">
                                            <label className="text-sm font-medium text-gray-300">Sonarr Instances</label>
                                            <button
                                                onClick={() => { setInstanceModalType('sonarr'); setIsInstanceModalOpen(true); }}
                                                className="text-sm text-blue-500 hover:text-blue-400"
                                            >
                                                + Add Instance
                                            </button>
                                        </div>
                                        <p className="text-xs text-gray-500">Configure Sonarr to manage your TV library</p>
                                    </div>
                                </div>
                            </div>

                            <div className="flex gap-3">
                                <button
                                    onClick={handleBack}
                                    className="flex w-full justify-center rounded-md border border-gray-600 bg-gray-700 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-gray-600 focus:outline-none"
                                >
                                    Back
                                </button>
                                <button
                                    onClick={handleNext}
                                    className="flex w-full justify-center rounded-md border border-transparent bg-blue-600 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none"
                                >
                                    Next
                                </button>
                            </div>
                        </div>
                    )}

                    {step === 3 && (
                        <div className="space-y-6">
                            <div>
                                <h3 className="text-lg font-medium text-white mb-4">You&apos;re All Set!</h3>
                                <p className="text-gray-400 text-sm mb-6">
                                    Setup is complete. Click Finish to start using Langarr.
                                </p>
                            </div>

                            <div className="flex gap-3">
                                <button
                                    onClick={handleBack}
                                    className="flex w-full justify-center rounded-md border border-gray-600 bg-gray-700 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-gray-600 focus:outline-none"
                                >
                                    Back
                                </button>
                                <button
                                    onClick={handleFinish}
                                    disabled={loading}
                                    className="flex w-full justify-center rounded-md border border-transparent bg-green-600 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
                                >
                                    {loading ? 'Saving...' : 'Finish'}
                                </button>
                            </div>
                        </div>
                    )}

                    {isInstanceModalOpen && (
                        <InstanceModal
                            isOpen={isInstanceModalOpen}
                            onClose={() => setIsInstanceModalOpen(false)}
                            onSave={() => {
                                setIsInstanceModalOpen(false);
                                // Refresh instances list (this is a simplified version - in real app would refetch from API)
                                toast.success('Instance saved');
                            }}
                            instance={null}
                            type={instanceModalType}
                        />
                    )}
                </div>
            </div>
        </div>
    );
}

SetupPage.noLayout = true;
