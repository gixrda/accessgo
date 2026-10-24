import { useState } from 'react';
import type { Layers } from './MapView.tsx';

const ITEMS: { key: keyof Layers; label: string; tone: string }[] = [
  { key: 'known', label: 'Ostacoli noti', tone: 'known' },
  { key: 'possible', label: 'Possibili difficoltà', tone: 'possible' },
  { key: 'reports', label: 'Segnalazioni utenti', tone: 'report' },
  { key: 'positive', label: 'Elementi utili', tone: 'positive' },
  { key: 'info', label: 'Attraversamenti senza informazioni', tone: 'info' },
  { key: 'places', label: 'Negozi e luoghi accessibili', tone: 'place' },
];

export function LayersControl({ layers, onChange, osmDate }: { layers: Layers; onChange: (l: Layers) => void; osmDate?: string }) {
  const [open, setOpen] = useState(() => window.matchMedia('(min-width: 760px)').matches);
  return (
    <div className="layers">
      <button type="button" className="btn btn--map" aria-expanded={open} aria-controls="layers-body" onClick={() => setOpen(!open)}>
        Cosa mostra la mappa
      </button>
      {open && (
        <div id="layers-body" className="layers__body">
          <fieldset>
            <legend className="sr-only">Livelli visibili</legend>
            {ITEMS.map((it) => (
              <label key={it.key} className="layer">
                <input type="checkbox" checked={layers[it.key]} onChange={(e) => onChange({ ...layers, [it.key]: e.target.checked })} />
                <span className={`mk mk--${it.tone} mk--inline`} aria-hidden="true" />
                {it.label}
              </label>
            ))}
          </fieldset>
          <p className="layers__legend">
            <span className="pin-mini" aria-hidden="true">?</span> da controllare · <span className="pin-mini pin-mini--ok" aria-hidden="true">✓</span> controllata sul posto
          </p>
          <p className="layers__legend">
            <span className="pin-mini pin-mini--block" aria-hidden="true" /> segnaposto rosso: ostacolo che blocca il passaggio
          </p>
          <p className="layers__legend">Il riquadro tratteggiato è la zona coperta dai dati{osmDate ? `, aggiornati al ${new Date(osmDate).toLocaleDateString('it-IT')}` : ''}.</p>
        </div>
      )}
    </div>
  );
}
