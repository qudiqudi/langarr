import type { User } from '@/hooks/useUser';
import { useUser } from '@/hooks/useUser';
import Router from 'next/router';
import { useEffect, useRef, useState } from 'react';

interface UserContextProps {
  initialUser?: User;
  children?: React.ReactNode;
}

export const UserContext = ({ initialUser, children }: UserContextProps) => {
  const { user, loading, error, revalidate } = useUser({ initialData: initialUser });
  const [pathname, setPathname] = useState('');
  const routing = useRef(false);

  // Track pathname on client side only
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setPathname(Router.pathname);

      const handleRouteChange = (url: string) => {
        setPathname(url);
        revalidate();
      };

      Router.events.on('routeChangeComplete', handleRouteChange);
      return () => {
        Router.events.off('routeChangeComplete', handleRouteChange);
      };
    }
  }, [revalidate]);

  useEffect(() => {
    if (typeof window === 'undefined' || !pathname) return;

    // Don't redirect on login, setup, or loading pages
    if (
      !loading &&
      !pathname.match(/(setup|login|loading)/) &&
      (!user || error) &&
      !routing.current
    ) {
      routing.current = true;
      Router.push('/login');
    }
  }, [pathname, user, error, loading]);

  // Show loading spinner on client side only
  if (typeof window !== 'undefined' && loading && pathname && !pathname.match(/(setup|login|loading)/)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-950">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent"></div>
      </div>
    );
  }

  return <>{children}</>;
};

export default UserContext;
