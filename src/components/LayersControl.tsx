import { useState } from 'react';
import type { Layers } from './MapView.tsx';

const ITEMS: { key: keyof Layers; label: string; tone: string }[] = [
  { key: 'known', label: 'Ostacoli noti', tone: 'known' },
  { key: 'possible', label: 'Possibili difficoltà', tone: 'possible' },
  { key: 'reports', label: 'Segnalazioni utenti', tone: 'report' },
  { key: 'positive', label: 'Elementi utili', tone: 'positive' },
  { key: 'info', label: 'Attraversamenti senza dati', tone: 'info' },
  { key: 'places', label: 'Accessibilità dei luoghi', tone: 'place' },
];

export function LayersControl({ layers, onChange, osmDate }: { layers: Layers; onChange: (l: Layers) => void; osmDate?: string }) {
  const [open, setOpen] = useState(() => window.matchMedia('(min-width: 760px)').matches);
  return (
    <div className="layers">
      <button type="button" className="btn btn--map" aria-expanded={open} aria-controls="layers-body" onClick={() => setOpen(!open)}>
        Legenda e livelli
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
            <span className="pin-mini" aria-hidden="true">?</span> non verificata · <span className="pin-mini pin-mini--ok" aria-hidden="true">✓</span> verificata/risolta
          </p>
          <p className="layers__legend">Riquadro tratteggiato: area con dati OSM caricati{osmDate ? ` (${new Date(osmDate).toLocaleDateString('it-IT')})` : ''}.</p>
        </div>
      )}
    </div>
  );
}
