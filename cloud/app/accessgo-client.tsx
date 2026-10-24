'use client';

import { useEffect, useState, type ComponentType } from 'react';

/** Leaflet reads window at import time, so load the complete map only in the browser. */
export default function AccessGoClient() {
  const [App, setApp] = useState<ComponentType | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    import('../src/App.tsx').then(
      (module) => { if (active) setApp(() => module.default); },
      () => { if (active) setFailed(true); },
    );
    return () => { active = false; };
  }, []);

  if (App) return <App />;
  return (
    <main className="app-loading" aria-live="polite">
      <span className="brand__mark" aria-hidden="true">A</span>
      <h1>AccessGo</h1>
      <p>{failed ? 'Impossibile caricare la mappa. Controlla la connessione e riprova.' : 'Caricamento della mappa di Pisa…'}</p>
      {failed && <button type="button" className="btn btn--primary" onClick={() => window.location.reload()}>Riprova</button>}
      <noscript>Attiva JavaScript per usare la mappa e cercare un percorso.</noscript>
    </main>
  );
}
