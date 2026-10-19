import { pack, type DialogueCatalog } from "@easeupmush/shared/dialogue";

/** Spoken and effort cues sprinkle `shared/phraseology.json` — don't dump every word in. */

export const catalog: DialogueCatalog = {
  id: "backflip-bill",
  name: "Backflip Bill",
  characters: [
    {
      id: "park-kid",
      name: "Park kid",
      sender: "KID",
      role: "Start — betting on Bill",
      figure: "kid",
      lines: [
        ...pack("open", [
          "Bet you can't do a backflip, mush.",
          "Tenner says you land on your head.",
          "Go on then, Bill. I dare you.",
          "Standing flip. No run-up, init.",
          "You haven't got the bottle, geez.",
          "Do a proper one then. Go on.",
          "Easy dosh if you bottle it.",
          "From a stand, yeah? Not a run-up.",
          "I'll hold this. You won't need it, mush.",
          "Flip it then. Make us rich.",
          "Won't even get all the way round. Beard.",
          "I'll be well chuffed if you bottle it.",
        ]),
        ...pack("open-2", [
          "Tenner says you miss that roof, mush.",
          "That's a drop, geez. Bottle it.",
          "Go on, cop the well. Easy dosh.",
          "I'll hold this. You ain't making that.",
        ]),
        ...pack("open-3", [
          "That's a proper hole, mush. Beard.",
          "Flag's miles down. I'll be well chuffed.",
          "Jump it then. Make us rich when you don't.",
          "You haven't got the bottle for that, geez.",
        ]),
        ...pack("open-4", [
          "Tiny pad, geez. You'll overshoot.",
          "Land on that scrap? Beard.",
          "I'll take that tenner when you miss it.",
          "Go on, kiss the well. Easy dosh.",
        ]),
        ...pack("open-5", [
          "Tuck through that hoop? You haven't got the bottle.",
          "Tenner says you smack the hoop, mush.",
          "Flip AND the hoop? Beard on tash.",
          "I'll be chuffed when you bounce off that.",
        ]),
        ...pack("open-6", [
          "Match the pitch? You'll pancake, geez.",
          "Roof's on the slant, mush. Cop it.",
          "Stay open on that slope? Go on then.",
          "Easy dosh if you slide off that.",
        ]),
        ...pack("open-7", [
          "Board AND the river? I'll hold this, mush.",
          "Tenner says you eat that trolley.",
          "Kick it then. You'll still wet yourself.",
          "Foxes Forest, geez. Drown it. Make us rich.",
        ]),
        ...pack("open-8", [
          "Train's moving, mush. You'll cop a block.",
          "6:42 out of Fratton. Deck it.",
          "Flip three of them? Beard.",
          "I'll be chuffed when you bounce off the roof.",
        ]),
        ...pack("open-9", [
          "Grab the bar then, geez. You won't.",
          "Stay open or you'll bounce, mush.",
          "Tenner says you miss it and eat the well.",
          "Swing a giant? Beard. Bottle it.",
        ]),
      ],
    },
    {
      id: "bill",
      name: "Bill",
      sender: "BILL",
      role: "Effort — jumps, landings, breaks. No bubbles, just the sound.",
      figure: "bill",
      lines: [
        ...pack("jump", [
          "Hup, mush.",
          "Nh — off the pad, geez.",
        ]),
        ...pack("jump-stand", [
          "Hup — from a stand, mush.",
        ]),
        ...pack("jump-run", [
          "Hup — running, init.",
        ]),
        ...pack("land", [
          "Oof, mush.",
        ]),
        ...pack("land-clean", [
          "Sweet as nut.",
          "Chuffed.",
        ]),
        ...pack("land-stumble", [
          "Ungh — copped that.",
          "Ease up mush.",
        ]),
        ...pack("land-fall", [
          "Ah I'm copped.",
          "Gah, mush — decked.",
        ]),
        ...pack("land-slide", [
          "Oof — on the pitch, mush.",
        ]),
        ...pack("land-splash", [
          "Gah mush — that's wet.",
        ]),
        ...pack("break", [
          "Ah mush — that's gone.",
        ]),
        ...pack("break-knee-left", [
          "Gah — left knee, mush.",
        ]),
        ...pack("break-knee-right", [
          "Gah — right knee, geez.",
        ]),
        ...pack("break-elbow-left", [
          "Ah — left arm, mush.",
        ]),
        ...pack("break-elbow-right", [
          "Ah — right arm, init.",
        ]),
        ...pack("break-hip-left", [
          "Deep yell — left hip, mush.",
        ]),
        ...pack("break-hip-right", [
          "Deep yell — right hip, geez.",
        ]),
        ...pack("break-back", [
          "That's bang out of order.",
        ]),
        ...pack("break-coccyx", [
          "Ah mush — tailbone.",
        ]),
      ],
    },
  ],
};
