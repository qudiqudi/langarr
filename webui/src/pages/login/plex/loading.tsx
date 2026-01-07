export default function PlexLoadingPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-950">
      <div className="text-center">
        <div className="mb-4 h-12 w-12 animate-spin rounded-full border-4 border-gray-700 border-t-[#E5A00D] mx-auto"></div>
        <p className="text-gray-400">Connecting to Plex...</p>
      </div>
    </div>
  );
}
