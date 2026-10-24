import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** One action area, outside the scrolling form, on both mobile and desktop. */
export function PanelActions({ target, children }: { target?: HTMLElement | null; children: ReactNode }) {
  return target ? createPortal(children, target) : <div className="panel-actions">{children}</div>;
}
