import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMobileLayout, useAppViewport } from '../hooks/useMobileLayout.ts';
import type { MapScope } from '../lib/mapScope.ts';
import type { Layers } from './MapView.tsx';

const ITEMS: { key: keyof Layers; label: string; tone: string }[] = [
  { key: 'known', label: 'Ostacoli noti', tone: 'known' },
  { key: 'possible', label: 'Possibili criticità', tone: 'possible' },
  { key: 'reports', label: 'Segnalazioni utenti', tone: 'report' },
  { key: 'positive', label: 'Elementi favorevoli', tone: 'positive' },
  { key: 'info', label: 'Attraversamenti senza dati', tone: 'info' },
  { key: 'places', label: 'Accessibilità dei luoghi', tone: 'place' },
];

export function LayersControl({ layers, onChange, osmDate, scope, onScopeChange, hasRoute }: {
  layers: Layers; onChange: (l: Layers) => void; osmDate?: string;
  scope: MapScope; onScopeChange: (scope: MapScope) => void; hasRoute: boolean;
}) {
  const mobile = useMobileLayout();
  const { height: viewportHeight } = useAppViewport();
  const [open, setOpen] = useState(() => !mobile);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (open && mobile) dialogRef.current?.showModal();
  }, [open, mobile]);
  function close() {
    dialogRef.current?.close();
    setOpen(false);
    buttonRef.current?.focus();
  }
  const content = (
    <>
      <div className="layers__scope">
        <label className="layer layers__scope-toggle">
          <input type="checkbox" checked={scope === 'all'} onChange={(event) => onScopeChange(event.target.checked ? 'all' : 'route')}
            aria-describedby="map-scope-description" />
          Mostra tutti gli ostacoli
        </label>
        <p id="map-scope-description" className="layers__legend layers__scope-note">
          {scope === 'all' ? 'Tutti i dati caricati nell’area, secondo i livelli attivi.'
            : hasRoute ? 'Solo elementi vicini al percorso attuale. La vicinanza non conferma che siano sulla stessa carreggiata.'
              : 'Calcola un percorso per mostrare gli ostacoli vicini, oppure attiva la vista completa.'}
        </p>
      </div>
      <fieldset>
        <legend className="sr-only">Livelli visibili</legend>
        {ITEMS.map((it) => (
          <label key={it.key} className="layer">
            <input type="checkbox" checked={layers[it.key]} disabled={it.key === 'places' && scope === 'route'} onChange={(e) => onChange({ ...layers, [it.key]: e.target.checked })} />
            <span className={`mk mk--${it.tone} mk--inline`} aria-hidden="true" />
            {it.label}{it.key === 'places' && scope === 'route' ? ' (vista completa)' : ''}
          </label>
        ))}
      </fieldset>
      <p className="layers__legend">
        <span className="pin-mini" aria-hidden="true">?</span> non verificata · <span className="pin-mini pin-mini--ok" aria-hidden="true">✓</span> verificata · risolte solo nella vista completa
      </p>
      <p className="layers__legend">
        Riquadro tratteggiato: area con dati OSM caricati{osmDate ? ` (${new Date(osmDate).toLocaleDateString('it-IT')})` : ''}.
      </p>
    </>
  );
  return (
    <div className="layers">
      <button ref={buttonRef} type="button" className="btn btn--map" aria-expanded={open} aria-controls={open ? 'layers-body' : undefined} onClick={() => setOpen(!open)}>
        Legenda e livelli
      </button>
      {open && !mobile && <div id="layers-body" className="layers__body">{content}</div>}
      {open && mobile && createPortal(
        <dialog id="layers-body" className="layers-dialog" ref={dialogRef} aria-labelledby="layers-title"
          style={viewportHeight ? { maxHeight: Math.max(160, viewportHeight - 32) } : undefined}
          onCancel={(event) => { event.preventDefault(); close(); }} onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
          <div className="layers-dialog__header"><h2 id="layers-title">Legenda e livelli</h2>
            <button type="button" className="btn btn--ghost btn--sm" onClick={close}>Chiudi</button>
          </div>
          <div className="layers-dialog__body">{content}</div>
        </dialog>, document.body,
      )}
    </div>
  );
}
