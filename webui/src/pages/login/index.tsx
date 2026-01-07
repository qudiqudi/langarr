import { useState } from 'react';
import { useRouter } from 'next/router';
import { mutate } from 'swr';
import PlexLoginButton from '@/components/Login/PlexLoginButton';
import toast from 'react-hot-toast';

export default function LoginPage() {
  const router = useRouter();
  const [isProcessing, setIsProcessing] = useState(false);

  const handleAuthToken = async (authToken: string) => {
    setIsProcessing(true);

    try {
      const response = await fetch('/api/v1/auth/plex', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ authToken }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Authentication failed');
      }

      toast.success('Signed in successfully', {
        duration: 1500,
      });

      // Force revalidation of user state before navigating
      await mutate('/api/v1/auth/me');

      // Check if setup is complete to determine redirect destination
      const settingsRes = await fetch('/api/v1/settings');
      const settings = await settingsRes.json();

      const destination = settings.isSetup ? '/dashboard' : '/setup';

      // Small delay to allow toast to show before navigation
      setTimeout(() => {
        router.push(destination);
      }, 200);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Authentication failed';
      toast.error(message);
      setIsProcessing(false);
    }
  };

  const handleError = (message: string) => {
    toast.error(message);
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-950 px-4">

      <div className="w-full max-w-sm space-y-8">
        {/* Logo */}
        <div className="text-center">
          <h1 className="text-4xl font-bold text-white">LANGARR</h1>
          <p className="mt-2 text-gray-400">
            Automatic Language Profile Manager
          </p>
        </div>

        {/* Login Card */}
        <div className="rounded-lg bg-gray-900 p-8 shadow-xl">
          <PlexLoginButton
            onAuthToken={handleAuthToken}
            onError={handleError}
            isProcessing={isProcessing}
          />
        </div>

        {/* Footer */}
        <p className="text-center text-sm text-gray-500">
          Sign in with your Plex account to continue
        </p>
      </div>
    </div>
  );
}
