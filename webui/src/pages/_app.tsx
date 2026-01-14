import '@/styles/globals.css';
import type { AppProps } from 'next/app';
import { Toaster } from 'react-hot-toast';
import { SWRConfig } from 'swr';
import Layout from '@/components/Layout/Layout';
import UserContext from '@/context/UserContext';

type ComponentWithLayout = React.ComponentType & {
  noLayout?: boolean;
};

export default function App({ Component, pageProps }: AppProps) {
  // Check if page component has noLayout property
  const ComponentTyped = Component as ComponentWithLayout;
  const shouldUseLayout = !ComponentTyped.noLayout;

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
