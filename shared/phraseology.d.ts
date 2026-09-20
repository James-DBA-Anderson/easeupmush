export type PhraseEntry = {
  phrase: string;
  meaning: string;
};

export type Phraseology = {
  source: string;
  lede: string[];
  phrasesHeading: string;
  phrases: PhraseEntry[];
};

declare const phraseology: Phraseology;
export default phraseology;
