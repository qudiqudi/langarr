import { useState } from 'react';
import PlexOAuth from '@/utils/plex';

const plexOAuth = new PlexOAuth();

interface PlexLoginButtonProps {
  onAuthToken: (authToken: string) => void;
  isProcessing?: boolean;
  onError?: (message: string) => void;
}

export default function PlexLoginButton({
  onAuthToken,
  onError,
  isProcessing,
}: PlexLoginButtonProps) {
  const [loading, setLoading] = useState(false);

  const getPlexLogin = async () => {
    setLoading(true);
    try {
      const authToken = await plexOAuth.login();
      setLoading(false);
      onAuthToken(authToken);
    } catch (e) {
      if (onError && e instanceof Error) {
        onError(e.message);
      }
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => {
        plexOAuth.preparePopup();
        setTimeout(() => getPlexLogin(), 1500);
      }}
      disabled={loading || isProcessing}
      className="flex w-full items-center justify-center gap-2 rounded-md bg-[#E5A00D] px-4 py-3 text-sm font-semibold text-black transition-colors hover:bg-[#F5B82E] disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <svg
        className="h-5 w-5"
        viewBox="0 0 24 24"
        fill="currentColor"
      >
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-2-3.5l6-4.5-6-4.5v9z" />
      </svg>
      <span>
        {loading
          ? 'Loading...'
          : isProcessing
            ? 'Signing In...'
            : 'Sign In with Plex'}
      </span>
    </button>
  );
}
