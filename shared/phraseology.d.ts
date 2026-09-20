export type PhraseEntry = {
  phrase: string;
  meaning: string;
};

export type PhraseNote = {
  title: string;
  body: string;
};

export type Phraseology = {
  source: string;
  lede: string[];
  phrasesHeading: string;
  phrases: PhraseEntry[];
  notes: PhraseNote[];
};

declare const phraseology: Phraseology;
export default phraseology;
