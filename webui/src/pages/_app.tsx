import '@/styles/globals.css';
import type { AppProps } from 'next/app';
import { useRouter } from 'next/router';
import { Toaster } from 'react-hot-toast';
import { SWRConfig } from 'swr';
import Layout from '@/components/Layout/Layout';
import UserContext from '@/context/UserContext';

// Pages that don't use the main layout
const noLayoutPages = ['/login', '/login/plex/loading', '/setup'];

export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter();

  // Check if current page should skip layout
  const shouldUseLayout = !noLayoutPages.some(
    (page) => router.pathname === page || router.pathname.startsWith(page + '/')
  );

  return (
    <SWRConfig
      value={{
        fetcher: (url: string) => fetch(url).then((res) => res.json()),
      }}
    >
      <Toaster
        position="top-center"
        toastOptions={{
          style: {
            background: '#1f2937',
            color: '#f3f4f6',
            border: '1px solid #374151',
          },
        }}
      />
      {shouldUseLayout ? (
        <UserContext>
          <Layout>
            <Component {...pageProps} />
          </Layout>
        </UserContext>
      ) : (
        <Component {...pageProps} />
      )}
    </SWRConfig>
  );
}
