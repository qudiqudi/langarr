import type { User } from '@/hooks/useUser';
import { useUser } from '@/hooks/useUser';
import { useRouter } from 'next/router';
import { useEffect, useRef } from 'react';

interface UserContextProps {
  initialUser?: User;
  children?: React.ReactNode;
}

export const UserContext = ({ initialUser, children }: UserContextProps) => {
  const { user, loading, error, revalidate } = useUser({ initialData: initialUser });
  const router = useRouter();
  const routing = useRef(false);

  useEffect(() => {
    if (router.isReady) {
      revalidate();
    }
  }, [router.isReady, router.pathname, revalidate]);

  useEffect(() => {
    // Only run on client side when router is ready
    if (!router.isReady) return;

    // Don't redirect on login, setup, or loading pages
    if (
      !loading && // Wait for loading to finish
      !router.pathname.match(/(setup|login|loading)/) &&
      (!user || error) &&
      !routing.current
    ) {
      routing.current = true;
      router.push('/login');
    }
  }, [router, user, error, loading]);

  // Show loading spinner only on client side
  if (loading && router.isReady && !router.pathname.match(/(setup|login|loading)/)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-950">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent"></div>
      </div>
    );
  }

  return <>{children}</>;
};

export default UserContext;
