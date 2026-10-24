import type { Interpretation, InterpretationCategory, ReportCategory } from '../shared/types.ts';

const RULES: [ReportCategory, RegExp][] = [
  ['steps', /\b(?:gradin\w*|scalin\w*|scal[ae]|steps?|stairs?|staircase)\b/gu],
  ['kerb', /\b(?:cordol\w*|kerbs?|curbs?|marciapiede\s+(?:troppo\s+)?alto|bordo\s+del\s+marciapiede)\b/gu],
  ['crossing', /\b(?:attraversament\w*|strisce|semafor\w*|incroci\w*|crossings?|crosswalks?|traffic lights?)\b/gu],
  ['obstructed_sidewalk', /\b(?:ostruit\w*|bloccat\w*|parcheggiat\w*|auto|macchin\w*|motorin\w*|scooters?|monopattin\w*|cantier\w*|transenn\w*|bidon\w*|cassonett\w*|tavolin\w*|dehors|ingombr\w*|occupat\w*|blocked|obstructed|parked|construction|barriers?)\b/gu],
  ['uneven_surface', /\b(?:buc[ah]\w*|sconness\w*|dissestat\w*|irregolar\w*|sampietrin\w*|ciottol\w*|pav[eé]|radic\w*|ghiaia|crep\w*|rott\w*|sterrat\w*|potholes?|holes?|uneven|cobblestones?|gravel|cracks?|roots?)\b/gu],
  ['slope', /\b(?:pendenz\w*|salit\w*|discesa|ripid\w*|ramp[ae]?|slopes?|steep|incline)\b/gu],
  ['other', /\b(?:porton\w*|porta|cancell\w*|door|gate)\s+(?:(?:è|is)\s+)?(?:(?:troppo|too)\s+)?(?:pesante|heavy)\b/gu],
];

type Mention = { category: ReportCategory; word: string; start: number; end: number; sentence: string };
const CONTRAST = /\b(?:ma|però|but|however)\b|,/u;
const RESOLVED = /\b(?:rimoss\w*|eliminat\w*|riparat\w*|risolt\w*|removed|cleared|fixed|repaired)\b/gu;
const UNCERTAIN = /\b(?:non\s+(?:so|sappiamo)\s+(?:se|cosa)|non\s+sono\s+sicur\w*|non\s+è\s+(?:chiaro|vero)|mi\s+sembra\s+che|forse|potrebbe\s+esser\w*|maybe|perhaps|not\s+sure\s+(?:if|what)|might\s+be)\b/u;

function resolved(text: string): boolean {
  return [...text.matchAll(RESOLVED)].some((match) => {
    const before = text.slice(0, match.index).split(CONTRAST).at(-1) ?? '';
    // "Non è stato rimosso" / "has not yet been removed" still describes an obstacle.
    return !/\b(?:non|not|never|will|should|could|may|sarà|verrà|deve|dovrà)\s+(?:[\p{L}'’]+\s+){0,4}$/u.test(before);
  });
}

function isInactive(mention: Mention, nextStart: number): boolean {
  const prefix = mention.sentence.slice(0, mention.start).split(CONTRAST).at(-1) ?? '';
  const suffix = mention.sentence.slice(mention.end, nextStart);
  // Deliberately match explicit absence, not every "non": inability to pass is not negation.
  if (/\b(?:no|without|senza|nessun[oa]?)\s+(?:[\p{L}]+\s+){0,4}$/u.test(prefix)
    || /\bnon\s+(?:(?:ci\s+)?sono|c['’]è|è|era|vedo|vediamo)\s+(?:(?:più|un|uno|una|alcun[oa]?|dei|delle|altri|alti|alte)\s+){0,3}$/u.test(prefix)
    || /\bnot\s+(?:a|an|any)\s+(?:[\p{L}]+\s+){0,2}$/u.test(prefix)
    || /^\s+(?:non\s+(?:è|sono)\s+(?:più\s+)?present\w*|(?:is|are)\s+(?:absent|not\s+(?:there|present)))/u.test(suffix)) return true;
  const priorResolution = prefix.match(/\b(?:rimoss\w*|eliminat\w*|riparat\w*|risolt\w*|removed|cleared|fixed|repaired)\s+(?:[\p{L}'’]+\s+){0,3}$/u);
  return resolved(suffix) || Boolean(priorResolution && resolved(prefix));
}

function assessedMentions(text: string): { active: Mention[]; inactive: number; uncertain: boolean } {
  const active: Mention[] = [];
  let inactive = 0;
  let uncertain = false;
  // Preserve decimal measurements; scope negation/removal to the same sentence.
  for (const sentence of text.split(/[!?;\n]+|\.(?!\d)/u)) {
    const mentions = RULES.flatMap(([category, pattern]) => [...sentence.matchAll(pattern)].map((m) => ({
      category, word: m[0], start: m.index, end: m.index + m[0].length, sentence,
    }))).sort((a, b) => a.start - b.start);
    mentions.forEach((mention, index) => {
      if (UNCERTAIN.test(sentence.slice(0, mention.start))) uncertain = true;
      else if (isInactive(mention, mentions[index + 1]?.start ?? sentence.length)) inactive += 1;
      else active.push(mention);
    });
  }
  return { active, inactive, uncertain };
}

function explicitAbsence(text: string): boolean {
  if (UNCERTAIN.test(text)) return false;
  return /\b(?:non\s+(?:ci\s+)?sono\s+(?:più\s+)?(?:ostacoli|problemi)|non\s+vedo\s+(?:alcun\s+)?ostacol\w*|nessun\s+ostacolo|no\s+(?:obstacles|barriers)|without\s+obstacles)\b/u.test(text)
    || /\b(?:il\s+)?passaggio\s+(?:è\s+|ora\s+è\s+|ora\s+)?libero\b/u.test(text)
    || /\b(?:the\s+)?passage\s+is\s+(?:now\s+)?clear\b/u.test(text);
}

function hasObstacleHeight(mention: Mention): boolean {
  const noun = mention.category === 'steps' ? '(?:gradin\\w*|steps?|stairs?)' : '(?:cordol\\w*|kerbs?|curbs?)';
  const measure = '(\\d+(?:[.,]\\d+)?)\\s*(?:mm|cm|m|millimetri|centimetri|metri|millimeters?|centimeters?|met(?:er|re)s?|inches?|inch)\\b';
  const patterns = [
    `${noun}\\s+(?:(?:è|sono|is)\\s+)?(?:di|of|alt[oaie]|height:?|altezza:?)(?:\\s+di)?\\s+${measure}(?!\\s+(?:wide|long|larg\\w*|lung\\w*))`,
    `(?:altezza\\s+(?:del|dei)|height\\s+of\\s+(?:the)?)\\s*${noun}\\s*[:=]?\\s*${measure}`,
    `${noun}\\s+(?:is\\s+)?${measure}\\s+(?:high|tall)\\b`,
    `${measure}\\s+(?:high|tall)\\s+${noun}\\b`,
  ];
  // Only the sentence containing this active obstacle can supply its height.
  return patterns.some((pattern) => [...mention.sentence.matchAll(new RegExp(pattern, 'gu'))]
    .some((m) => m.index <= mention.start && m.index + m[0].length >= mention.end
      && Number(m[1].replace(',', '.')) > 0));
}

/** Conservative, bilingual keyword fallback. No model or safety verification is implied. */
export function fallbackInterpret(description: string, note: string): Interpretation {
  const text = description.toLowerCase().replace(/[’]/g, "'");
  const { active: mentions, inactive, uncertain } = assessedMentions(text);
  const categories = [...new Set(mentions.map((m) => m.category))];
  const ambiguous = categories.length > 1 || uncertain;
  const unspecifiedProblem = /\b(?:c'è\s+(?:un\s+)?problema|non\s+riesco\s+a\s+passare|cannot\s+(?:pass|get\s+through)|something\s+(?:is\s+)?wrong)\b/u.test(text);
  // An unrecognised contrasting clause may describe a remaining problem after a removal.
  const unclassifiedContrast = !categories.length && /\b(?:ma|però|but|however)\b/u.test(text);
  const category: InterpretationCategory = ambiguous ? 'unclear'
    : categories.length === 1 ? categories[0]
    : unspecifiedProblem || unclassifiedContrast ? 'unclear'
    : inactive > 0 || explicitAbsence(text) ? 'no_obstacle' : 'unclear';
  const obstacle = category === 'unclear' || category === 'no_obstacle' ? null : mentions[0].word;
  const missing: string[] = [];
  if (category === 'unclear') missing.push('Descrivi l’ostacolo attuale e indica qual è il problema principale');
  if ((category === 'steps' || category === 'kerb') && !mentions.every(hasObstacleHeight)) missing.push("Altezza dell'ostacolo");
  if (category !== 'no_obstacle') {
    if (!/\b(?:temporane\w*|permanent\w*|sempre|da (?:giorni|mesi|anni)|oggi|cantiere|temporary|today|always)\b/u.test(text)) missing.push("Se l'ostacolo è temporaneo o permanente");
    if (!/(?:alternativ|aggir|altro lato|dall'altra parte|other side|another way|go around)/u.test(text)) missing.push('Se esiste un passaggio alternativo vicino');
  }
  const clean = description.trim().replace(/\s+/g, ' ');
  return {
    category, obstacle,
    summary: clean.length > 160 ? `${clean.slice(0, 157)}…` : clean,
    severity: 'unknown', missing_info: missing, engine: 'fallback',
    note: ambiguous ? `${note}${note ? ' ' : ''}Descrizione ambigua: chiarisci il problema o controlla manualmente la categoria.` : note,
  };
}
