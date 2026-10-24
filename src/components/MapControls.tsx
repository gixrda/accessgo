import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon.tsx';
import type { Layers } from './MapView.tsx';

const ITEMS: { key: keyof Layers; label: string; tone: string }[] = [
  { key: 'known', label: 'Ostacoli noti', tone: 'known' },
  { key: 'reports', label: 'Segnalazioni degli utenti', tone: 'report' },
  { key: 'possible', label: 'Possibili difficoltà', tone: 'possible' },
  { key: 'positive', label: 'Elementi utili', tone: 'positive' },
  { key: 'info', label: 'Attraversamenti senza informazioni', tone: 'info' },
  { key: 'places', label: 'Negozi e luoghi accessibili', tone: 'place' },
];

/** Capsula di controlli flottante sulla mappa: cosa mostrare e dove sono. */
export function MapControls({ layers, onLayers, osmDate, onLocate, locating }: {
  layers: Layers; onLayers: (l: Layers) => void; osmDate?: string; onLocate: () => void; locating: boolean;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  // Il pannello dei livelli si chiude con Esc o toccando fuori.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    const onDown = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('pointerdown', onDown); };
  }, [open]);

  return (
    <div className="controls" ref={root}>
      <div className="controls__capsule glass">
        <button type="button" className="btn btn--icon" aria-expanded={open} aria-controls="layers-body"
          aria-label="Cosa mostra la mappa" title="Cosa mostra la mappa" onClick={() => setOpen(!open)}>
          <Icon name="layers" size={20} />
        </button>
        <span className="controls__sep" aria-hidden="true" />
        <button type="button" className="btn btn--icon" onClick={onLocate} disabled={locating}
          aria-label="Mostra dove sono" title="Mostra dove sono">
          <Icon name="locate" size={20} />
        </button>
      </div>
      {open && (
        <div id="layers-body" className="layers glass" role="dialog" aria-label="Cosa mostra la mappa">
          <h2 className="layers__title">Cosa mostra la mappa</h2>
          <fieldset>
            <legend className="sr-only">Livelli visibili</legend>
            {ITEMS.map((it) => (
              <label key={it.key} className="layer">
                <span className={`mk mk--${it.tone} mk--inline`} aria-hidden="true" />
                <span className="layer__label">{it.label}</span>
                <input type="checkbox" className="switch" checked={layers[it.key]}
                  onChange={(e) => onLayers({ ...layers, [it.key]: e.target.checked })} />
              </label>
            ))}
          </fieldset>
          <p className="layers__legend">
            <span className="pin-mini" aria-hidden="true">?</span> da controllare
            <span className="pin-mini pin-mini--ok" aria-hidden="true">✓</span> controllata sul posto
            <span className="pin-mini pin-mini--block" aria-hidden="true" /> blocca il passaggio
          </p>
          <p className="layers__legend">
            Le difficoltà minori compaiono avvicinando la mappa. Il riquadro tratteggiato è la zona coperta dai dati
            {osmDate ? `, aggiornati al ${new Date(osmDate).toLocaleDateString('it-IT')}` : ''}.
          </p>
        </div>
      )}
    </div>
  );
}
