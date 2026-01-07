import { useEffect } from 'react';
import { useRouter } from 'next/router';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const checkAuthAndSetup = async () => {
      try {
        // Check authentication first
        const authRes = await fetch('/api/v1/auth/me', { credentials: 'include' });
        if (!authRes.ok) {
          // Not authenticated, redirect to login
          router.push('/login');
          return;
        }

        // User is authenticated, now check setup status
        const settingsRes = await fetch('/api/v1/settings');
        if (settingsRes.ok) {
          const settings = await settingsRes.json();
          if (settings.isSetup) {
            router.push('/dashboard');
          } else {
            router.push('/setup');
          }
        } else {
          // Fallback if settings API fails
          router.push('/setup');
        }
      } catch {
        // Fallback on error - redirect to login for safety
        router.push('/login');
      }
    };

    checkAuthAndSetup();
  }, [router]);

  return <div className="text-white text-center mt-20">Loading...</div>;
}
