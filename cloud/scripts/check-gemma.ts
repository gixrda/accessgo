/** Read local secrets via Node --env-file; never prints them and never writes a report. */
import { interpret } from '../server/ai.ts';
import { aiProvider } from '../server/gemma.ts';

const provider = aiProvider(process.env);
if (provider.kind === 'fallback') {
  console.error('Gemma is not configured. Add GEMINI_API_KEY to the ignored .dev.vars file.');
  process.exitCode = 2;
} else {
  const cases = [
    { description: "In Via Roma c'è un gradino troppo alto e non riesco a passare con la sedia a rotelle.", expected: 'steps' },
    { description: 'Non ci sono gradini. Il problema è una buca profonda.', expected: 'uneven_surface' },
    { description: 'The sidewalk has a high step and wheelchair users cannot pass.', expected: 'steps' },
  ];
  let failures = 0;
  for (const [index, item] of cases.entries()) {
    const start = Date.now();
    const result = await interpret(item.description, process.env);
    const passed = result.engine === 'gemma' && result.category === item.expected;
    if (!passed) failures++;
    console.log(JSON.stringify({ case: index + 1, provider: provider.kind, model: provider.model,
      engine: result.engine, category: result.category, expected: item.expected,
      elapsedMs: Date.now() - start, passed, ...(result.note ? { note: result.note } : {}) }));
  }
  process.exitCode = failures ? 1 : 0;
}
