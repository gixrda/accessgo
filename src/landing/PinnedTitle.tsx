import { Icon } from '../components/Icon.tsx';
import type { IconName } from '../lib/icons.ts';

/** Titolo con un piccolo segnaposto dentro la riga, al posto di "{pin}" nel testo. L'icona è solo decorativa. */
export function PinnedTitle({ text, icon }: { text: string; icon: IconName }) {
  const [before, after] = text.split('{pin}');
  if (after === undefined) return <>{text}</>;
  return <>{before.trimEnd()}<span className="ow-inline-pin" aria-hidden="true"><Icon name={icon} size={16} /></span>{after.trimStart()}</>;
}
