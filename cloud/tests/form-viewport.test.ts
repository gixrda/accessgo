// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dismissKeyboard, keepFocusedFieldVisible } from '../src/lib/formViewport.ts';

const bounds = (top: number, height: number): DOMRect => new DOMRect(0, top, 390, height);

describe('form focus stays inside its scrolling panel', () => {
  let container: HTMLDivElement;
  let field: HTMLTextAreaElement;
  let scrollIntoView: ReturnType<typeof vi.fn>;
  let originalScrollIntoView: PropertyDescriptor | undefined;

  beforeEach(() => {
    container = document.createElement('div');
    field = document.createElement('textarea');
    container.append(field);
    document.body.append(container);
    container.scrollTop = 300;
    document.documentElement.scrollTop = 37;
    document.body.scrollTop = 29;
    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue(bounds(100, 200));
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    vi.spyOn(window, 'scrollBy').mockImplementation(() => {});
    originalScrollIntoView = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollIntoView');
    scrollIntoView = vi.fn();
    Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: scrollIntoView });
    field.focus();
  });

  afterEach(() => {
    container.remove();
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    vi.restoreAllMocks();
    if (originalScrollIntoView) Object.defineProperty(Element.prototype, 'scrollIntoView', originalScrollIntoView);
    else Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
  });

  function expectOnlyPanelScrolled(expected: number) {
    expect(container.scrollTop).toBe(expected);
    expect(document.documentElement.scrollTop).toBe(37);
    expect(document.body.scrollTop).toBe(29);
    expect(window.scrollTo).not.toHaveBeenCalled();
    expect(window.scrollBy).not.toHaveBeenCalled();
    expect(scrollIntoView).not.toHaveBeenCalled();
  }

  it('reveals a field above the panel without panning the page', () => {
    vi.spyOn(field, 'getBoundingClientRect').mockReturnValue(bounds(80, 44));
    keepFocusedFieldVisible(container);
    expectOnlyPanelScrolled(268);
  });

  it('reveals a field below the panel without panning the page', () => {
    vi.spyOn(field, 'getBoundingClientRect').mockReturnValue(bounds(270, 44));
    keepFocusedFieldVisible(container);
    expectOnlyPanelScrolled(326);
  });

  it('aligns an oversized textarea to the panel top instead of scrolling past its beginning', () => {
    vi.spyOn(field, 'getBoundingClientRect').mockReturnValue(bounds(140, 300));
    keepFocusedFieldVisible(container);
    expectOnlyPanelScrolled(340);
  });

  it('leaves an already visible field undisturbed', () => {
    vi.spyOn(field, 'getBoundingClientRect').mockReturnValue(bounds(150, 44));
    keepFocusedFieldVisible(container);
    expectOnlyPanelScrolled(300);
  });

  it('does not move the panel for a focused field outside it', () => {
    const outside = document.createElement('input');
    document.body.append(outside);
    outside.focus();
    vi.spyOn(outside, 'getBoundingClientRect').mockReturnValue(bounds(500, 44));
    keepFocusedFieldVisible(container);
    expectOnlyPanelScrolled(300);
    outside.remove();
  });

  it('ignores a hidden panel and focused non-editable controls', () => {
    vi.mocked(container.getBoundingClientRect).mockReturnValue(bounds(100, 0));
    vi.spyOn(field, 'getBoundingClientRect').mockReturnValue(bounds(500, 44));
    keepFocusedFieldVisible(container);
    expectOnlyPanelScrolled(300);
    vi.mocked(container.getBoundingClientRect).mockReturnValue(bounds(100, 200));
    const button = document.createElement('button');
    container.append(button);
    button.focus();
    vi.spyOn(button, 'getBoundingClientRect').mockReturnValue(bounds(500, 44));
    keepFocusedFieldVisible(container);
    expectOnlyPanelScrolled(300);
  });
});

describe('explicit keyboard dismissal', () => {
  afterEach(() => { document.body.replaceChildren(); });

  it.each(['input', 'textarea', 'select'] as const)('blurs the focused %s without clearing its value', (tag) => {
    const field = document.createElement(tag);
    if (field instanceof HTMLSelectElement) field.add(new Option('Bollard', 'bollard'));
    else field.value = 'Via Roma';
    const value = field.value;
    document.body.append(field);
    field.focus();
    expect(document.activeElement).toBe(field);
    dismissKeyboard();
    expect(document.activeElement).not.toBe(field);
    expect(field.value).toBe(value);
  });

  it('preserves ordinary button focus', () => {
    const button = document.createElement('button');
    document.body.append(button);
    button.focus();
    dismissKeyboard();
    expect(document.activeElement).toBe(button);
  });
});
