// Rule-based translation of recognised ISL glosses into English.
//
// ISL does not follow English word order. Time expressions come first, a question word is usually placed at
// the start of the English question, and "NOT" is placed before the verb it negates. These rules reorder the
// glosses before they are written out. The result is a draft: it is shown to the user to check, and any gloss
// without an English entry is written in lower case and reported as unmapped rather than guessed.

const LEXICON = {
  HELLO: { en: 'hello', role: 'greeting' },
  GOODBYE: { en: 'goodbye', role: 'greeting' },
  PLEASE: { en: 'please', role: 'politeness' },
  YES: { en: 'yes', role: 'answer' },
  NO: { en: 'no', role: 'answer' },
  ME: { en: 'I', role: 'pronoun' },
  YOU: { en: 'you', role: 'pronoun' },
  WE: { en: 'we', role: 'pronoun' },
  THEY: { en: 'they', role: 'pronoun' },
  HE: { en: 'he', role: 'pronoun' },
  SHE: { en: 'she', role: 'pronoun' },
  MY: { en: 'my', role: 'pronoun' },
  NAME: { en: 'name', role: 'noun' },
  WATER: { en: 'water', role: 'noun' },
  FOOD: { en: 'food', role: 'noun' },
  HOME: { en: 'home', role: 'noun' },
  SCHOOL: { en: 'school', role: 'noun' },
  GO: { en: 'go', role: 'verb' },
  EAT: { en: 'eat', role: 'verb' },
  DRINK: { en: 'drink', role: 'verb' },
  UNDERSTAND: { en: 'understand', role: 'verb' },
  HELP: { en: 'help', role: 'verb' },
  LEARN: { en: 'learn', role: 'verb' },
  WANT: { en: 'want', role: 'verb' },
  NEED: { en: 'need', role: 'verb' },
  LIKE: { en: 'like', role: 'verb' },
  SEE: { en: 'see', role: 'verb' },
  COME: { en: 'come', role: 'verb' },
  TODAY: { en: 'today', role: 'time' },
  TOMORROW: { en: 'tomorrow', role: 'time' },
  YESTERDAY: { en: 'yesterday', role: 'time' },
  NOW: { en: 'now', role: 'time' },
  WHAT: { en: 'what', role: 'question' },
  WHERE: { en: 'where', role: 'question' },
  WHO: { en: 'who', role: 'question' },
  WHEN: { en: 'when', role: 'question' },
  WHY: { en: 'why', role: 'question' },
  HOW: { en: 'how', role: 'question' },
  NOT: { en: 'not', role: 'negation' },
  GOOD: { en: 'good', role: 'word' },
  BAD: { en: 'bad', role: 'word' },
  HAPPY: { en: 'happy', role: 'word' },
  FINE: { en: 'fine', role: 'word' },
};

// Multi-sign phrases. Matched before single signs, so "HOW YOU" becomes "how are you" as one unit.
const PHRASES = [
  { signs: ['HOW', 'YOU'], en: 'how are you', role: 'question' },
  { signs: ['THANK', 'YOU'], en: 'thank you', role: 'politeness' },
  { signs: ['MY', 'NAME'], en: 'my name', role: 'noun' },
  { signs: ['GOOD', 'MORNING'], en: 'good morning', role: 'greeting' },
];

function tokenise(glosses) {
  const words = glosses.map((gloss) => String(gloss).trim().toUpperCase()).filter(Boolean);
  const tokens = [];
  const unmapped = [];
  let index = 0;
  while (index < words.length) {
    const phrase = PHRASES.find((candidate) =>
      candidate.signs.every((sign, offset) => words[index + offset] === sign),
    );
    if (phrase) {
      tokens.push({ en: phrase.en, role: phrase.role });
      index += phrase.signs.length;
      continue;
    }
    const word = words[index];
    const entry = LEXICON[word];
    if (entry) {
      tokens.push({ en: entry.en, role: entry.role, gloss: word });
    } else {
      tokens.push({ en: word.toLowerCase(), role: 'unknown', gloss: word });
      unmapped.push(word);
    }
    index += 1;
  }
  return { tokens, unmapped };
}

const ROLE = (token) => token.role;

function reorder(tokens) {
  const negated = tokens.some((token) => ROLE(token) === 'negation');
  const body = tokens.filter((token) => ROLE(token) !== 'negation');

  const greetings = body.filter((token) => ROLE(token) === 'greeting');
  const times = body.filter((token) => ROLE(token) === 'time');
  const questions = body.filter((token) => ROLE(token) === 'question' && token.en.split(' ').length === 1);
  const politeness = body.filter((token) => ROLE(token) === 'politeness');
  const rest = body.filter(
    (token) => !greetings.includes(token) && !times.includes(token) && !questions.includes(token) && !politeness.includes(token),
  );

  if (negated) {
    const verbAt = rest.findIndex((token) => ROLE(token) === 'verb');
    if (verbAt >= 0) rest.splice(verbAt, 0, { en: 'do not', role: 'negation' });
    else rest.push({ en: 'not', role: 'negation' });
  }

  return [...greetings, ...times, ...questions, ...rest, ...politeness];
}

function isQuestionTokens(tokens) {
  return tokens.some((token) => token.role === 'question');
}

function finishSentence(words, tokens) {
  const greetingCount = tokens.filter((token) => token.role === 'greeting').length;
  const pieces = words.map((token, index) => {
    const isLastGreeting = token.role === 'greeting' && index === greetingCount - 1 && words.length > greetingCount;
    if (token.role === 'politeness' && index > 0) return `, ${token.en}`;
    return isLastGreeting ? `${token.en},` : token.en;
  });
  let text = pieces.join(' ').replace(/ ,/g, ',').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  text = text.charAt(0).toUpperCase() + text.slice(1);
  if (/[.?!]$/.test(text)) return text;
  return `${text}${isQuestionTokens(tokens) ? '?' : '.'}`;
}

// Returns the English draft, the glosses it could not map, and whether it reads as a question.
export function translateGlosses(glosses) {
  const { tokens, unmapped } = tokenise(glosses ?? []);
  if (tokens.length === 0) return { text: '', unmapped: [], isQuestion: false };
  const ordered = reorder(tokens);
  return {
    text: finishSentence(ordered, tokens),
    unmapped,
    isQuestion: isQuestionTokens(tokens),
  };
}
