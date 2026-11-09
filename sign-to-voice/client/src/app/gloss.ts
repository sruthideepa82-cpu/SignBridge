export interface Gloss {
  word: string;
  confidence: number;
}

export function appendGloss(glosses: readonly Gloss[], gloss: Gloss): Gloss[] {
  return [...glosses, gloss];
}

export function glossWords(glosses: readonly Gloss[]): string[] {
  return glosses.map((gloss) => gloss.word);
}
