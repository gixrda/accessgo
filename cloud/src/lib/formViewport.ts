/** Keep focus scrolling inside the form; scrollIntoView can pan Safari's whole page. */
export function keepFocusedFieldVisible(container: HTMLElement): void {
  const field = document.activeElement;
  if (!(field instanceof HTMLElement) || !container.contains(field)
    || !field.matches('input, textarea, select, [contenteditable="true"]')) return;
  const bounds = container.getBoundingClientRect();
  if (bounds.height <= 0) return;
  const rect = field.getBoundingClientRect();
  const padding = Math.min(12, Math.max(0, (bounds.height - rect.height) / 2));
  const top = bounds.top + padding;
  const bottom = bounds.bottom - padding;
  if (rect.top < top || rect.height > bottom - top) container.scrollTop += rect.top - top;
  else if (rect.bottom > bottom) container.scrollTop += rect.bottom - bottom;
}

export function dismissKeyboard(): void {
  const field = document.activeElement;
  if (field instanceof HTMLElement && field.matches('input, textarea, select, [contenteditable="true"]')) field.blur();
}
