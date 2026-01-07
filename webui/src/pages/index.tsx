import { useEffect } from 'react';
import Router from 'next/router';

export default function Home() {
  useEffect(() => {
    const checkAuthAndSetup = async () => {
      try {
        // Check authentication first
        const authRes = await fetch('/api/v1/auth/me', { credentials: 'include' });
        if (!authRes.ok) {
          // Not authenticated, redirect to login
          Router.push('/login');
          return;
        }

        // User is authenticated, now check setup status
        const settingsRes = await fetch('/api/v1/settings');
        if (settingsRes.ok) {
          const settings = await settingsRes.json();
          if (settings.isSetup) {
            Router.push('/dashboard');
          } else {
            Router.push('/setup');
          }
        } else {
          // Fallback if settings API fails
          Router.push('/setup');
        }
      } catch {
        // Fallback on error - redirect to login for safety
        Router.push('/login');
      }
    };

    checkAuthAndSetup();
  }, []);

  return <div className="text-white text-center mt-20">Loading...</div>;
}
