export function Loading() {
  return (
    <main className="ije-status" aria-busy="true">
      <p>Loading</p>
    </main>
  );
}

export function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <main className="ije-status">
      <p className="ije-notice ije-notice--error" role="alert">
        {message}
      </p>
      <button type="button" className="ije-button" onClick={onRetry}>
        Try again
      </button>
    </main>
  );
}

export const PROFILE_LOAD_ERROR = "We could not load your profile. Check your connection and try again.";
