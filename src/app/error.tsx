"use client";

import { useEffect } from "react";

/** Route error boundary: a render crash shows a recoverable panel instead of a blank page. */
export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }): React.JSX.Element {
  useEffect(() => {
    console.error("dashboard crashed", error);
  }, [error]);

  return (
    <main className="grid min-h-screen place-items-center p-6">
      <div role="alert" className="panel max-w-lg py-10 text-center">
        <p className="ptitle text-critical">⬣ The dashboard hit an unexpected error</p>
        <p className="mt-3 text-sm text-muted">The live stream and your data are fine; only this view failed to render.</p>
        {error.digest && <p className="num mt-2 text-xs text-muted">ref {error.digest}</p>}
        <div className="mt-5 flex justify-center gap-3">
          <button type="button" onClick={reset} className="border border-accent px-4 py-1 text-sm text-accent hover:bg-accent/15">
            Try again
          </button>
          <button type="button" onClick={() => window.location.reload()} className="border border-border px-4 py-1 text-sm text-muted hover:text-text">
            Reload page
          </button>
        </div>
      </div>
    </main>
  );
}
