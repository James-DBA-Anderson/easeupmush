import { pack, type DialogueCatalog } from "@easeupmush/shared/dialogue";

/** Spoken cues sprinkle `shared/phraseology.json` — don't dump every word in. */

export const catalog: DialogueCatalog = {
  id: "simpompey",
  name: "SimPompey",
  characters: [
    {
      id: "narrator",
      name: "Narrator",
      sender: "NARRATOR",
      role: "Intro and world reactions",
      figure: "public",
      lines: [
        ...pack("intro", [
          "Welcome to Pompey, mush.",
          "Another day in paradise, init.",
          "Let's see what you've got, geez.",
        ]),
      ],
    },
  ],
};
