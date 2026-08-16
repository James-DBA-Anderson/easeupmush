/**
 * Cheeky wisecracks — Portsmouth edition.
 * Fired when you put a lad on the floor.
 */

const QUIPS: string[] = [
  // Classic cocky energy, Pompey voice
  "With great fists comes a thick ear.",
  "Another one for the Fratton scrapheap.",
  "That's going on the Southsea highlight reel.",
  "You've been Punch-Upped.",
  "Sleep tight — watch out for the seagulls.",
  "Tell 'em Pompey sent ya.",
  "That's the South Parade special.",
  "Out colder than the Solent in January.",
  "One small step for man, one giant KO for Pompey.",
  "You're done, mate. Proper done.",
  "Night night dinlo.",
  "Have a squinny — you're finished mush.",
  "What a dinlo.",

  // Local landmarks
  "Straight past the Spinnaker with that one.",
  "Harder than a walk up to the Castle.",
  "That hit landed like the Pier on a Saturday.",
  "You've got less fight than Clarence Pier in February.",
  "Dropped you quicker than the Gosport ferry.",
  "That one's going in the Naval Memorial guestbook.",
  "Flatter than the Common after a wet Bank Holiday.",
  "You've been sent to the Isle of Wight. Mentally.",
  "Even the fort out there felt that.",
  "Pyramids centre wouldn't take you after that.",

  // Beach / promenade
  "Shingle in your teeth, dreams in the bin.",
  "Back to the pebbles with you.",
  "That's a beach towel finish.",
  "The promenade says goodnight.",
  "Washed up already? Bit early.",
  "Tide's out — and so are you.",
  "You're more washed up than a wet trainer.",
  "Seagulls are queuing for your chips already.",
  "That's a deckchair layoff.",
  "Sit this one out on the wall, sunshine.",

  // Football / rivalry flavour (light)
  "Blue army 1, you 0.",
  "Play up Pompey — lie down, mate.",
  "That's a Fratton Park sending-off.",
  "You've been subbed… permanently.",
  "Not even a South Coast derby — just a mishap.",
  "Pompey till I die. You till you woke up.",
  "That's a goal-difference thrashing.",
  "You're offside, off your feet, and off the plot.",

  // Food / day-out
  "Crispier than the chips on the front.",
  "Sweeter than a stick of rock. Still knocked you out.",
  "You've gone flatter than a pancake at the carnivals.",
  "Less filling than a pasty. More dramatic.",
  "That's a ketchup stain of a performance.",
  "Order up: one unconscious lad, hold the attitude.",
  "You've been battered. Properly.",
  "Saveloy's got more backbone.",

  // Weather / Solent
  "Blown over like a windbreaker in a Force 8.",
  "Grey as the Solent, soft as a sponge.",
  "That hit had more bite than a Channel wind.",
  "Rain or shine — you're horizontal.",
  "Cloudier judgement than a misty morning on the pier.",

  // Cocky banter (no cape required)
  "Mouthy Southsea pest — that's me.",
  "I do whatever a Pompey lad can — plus a right hook.",
  "My gut said you'd fold. It was right.",
  "Whoosh. Metaphorically. With fists.",
  "Great fists. Greater cheek.",
  "Don't make me get the deckchair out. For you.",
  "Your tough-guy speech needed work.",
  "Hard men finish last. You finished early.",
  "Another satisfied customer. Of unconsciousness.",
  "I'd say 'my work here is done' but there's more of you.",

  // Pompey slang / street
  "Cake? You're half-baked mush.",
  "Shut it — oh wait, you already have dinlo.",
  "Outside? Mate, you're already outside. And down.",
  "Fancy it? You fancied it. Then you didn't.",
  "Come on then — oh. You came. And went.",
  "That's you told mush.",
  "Sorted. Next dinlo.",
  "Have it! …you had it.",
  "Wrong beach, wrong lad, wrong day.",
  "You what, mush? Exactly. Nothing.",
  "Night night dinlo.",
  "Have a squinny at the floor — that's home now.",
  "Alright mush — stay down.",
  "What a dinlo.",
  "Squinny and weep.",
  "Ease up? Nah mush.",
  "You're a proper dinlo for that.",
  "Sleep tight mush.",
  "Pompey 1, dinlo 0.",
  "That's mush business sorted.",
  "Don't squinny at me from down there.",
  "Absolute dinlo energy.",
  "Mush… you're embarrassing yourself.",
  "Floor's yours dinlo.",
  "Squinny left — oh wait, you're horizontal.",

  // Technique callbacks (generic enough)
  "Textbook. Southsea edition.",
  "That's in the coaching manual under 'don't get hit by him'.",
  "Cleaner than a scrubbed buoy.",
  "Precision like a pier ticket booth.",
  "I'd apologise, but I'm not going to.",
  "Beauty. Absolute beauty.",
  "That'll leave a souvenir.",
  "Collectable KO. Limited edition.",

  // Crowds / bill
  "Bill can have the paperwork. I've had the fun.",
  "Witnesses? Just the gulls.",
  "Someone film that — oh, they already are.",
  "Wanted poster material. For you.",
  "The front's quieter already.",

  // Show-off banter
  "Encore? You're having a nap instead.",
  "Your big entrance ends here.",
  "All bark. No legs left.",
  "I'm not saying I'm special. I'm just saying you're horizontal.",
  "Fists first. Questions never.",
  "No climbing needed. Just the floor.",
  "That's a mid-stroll stinger.",
  "Closing scene: you snoring on the shingle.",

  // More local texture
  "Gunwharf wouldn't let you in looking like that.",
  "Harder hit than a Saturday night on Albert Road.",
  "You've been Palmerston'd.",
  "Even the hovercraft's got more lift than you now.",
  "That's a Square Tower special.",
  "Flatter than a calm day at Hotwalls.",
  "You've got the fight of a sleepy pigeon on the Guildhall steps.",
  "Straight to the lost property of dignity.",
  "The Cascades have seen tougher bags.",
  "Commercial Road called — they want their pavement ornament.",

  // Short zingers (good for bubbles)
  "Nap time mush.",
  "Lights out, Southsea.",
  "Pompey 1, ego 0.",
  "Night night, tough guy.",
  "Horizontal holiday.",
  "That's a wrap dinlo.",
  "Next!",
  "Too easy mush.",
  "Job done.",
  "Sleep well dinlo.",
  "Bye then mush.",
  "Down you go.",
  "And stay down.",
  "Classic.",
  "Lovely stuff mush.",
  "Chef's kiss.",
  "Absolute scenes.",
  "Peak Pompey.",
  "Front's safer already.",
  "One less dinlo.",
  "Squinny that.",
  "Mush down.",
  "Dinlo deleted.",
  "Have a lie-down mush.",

  // Extra variety
  "I'd say unlucky, but it was skill.",
  "You brought fists to a personality contest. And lost both.",
  "Your mum's gonna ask who did that. Say a mouthy lad from Southsea.",
  "That's not a concussion — that's a lifestyle choice.",
  "Gravity's undefeated. I just helped.",
  "You blinked. I rearranged your evening.",
  "Respectfully? No.",
  "Consider yourself… relocated to the floor.",
  "I'll send flowers. Plastic ones. From the pier gift shop.",
  "Don't get up. Actually, do — I've got more.",
  "That was free. The next one's also free.",
  "You're the reason the promenade needs first aid.",
  "If this was a postcard, it'd say 'wish you weren't here'.",
  "Southsea called. It wants less of you.",
  "You've been blue-armied into next week.",
  "That's a proper pasting.",
  "Mate… mate. Stay there.",
  "Mush… stay there dinlo.",
  "I'd high-five you but you're busy being unconscious.",
  "Put a cone on him — road closed.",
  "Another one bites the shingle.",
  "Squinny at that KO.",
  "Sorted you out mush.",
];

/** Shuffle-bag so we burn through the list before repeats feel obvious. */
let bag: string[] = [];
let lastLine = "";

function refillBag(): void {
  bag = QUIPS.slice();
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const a = bag[i]!;
    bag[i] = bag[j]!;
    bag[j] = a;
  }
  // Don't open a fresh bag on the same line we just said
  if (bag.length > 1 && bag[bag.length - 1] === lastLine) {
    const swap = bag[0]!;
    bag[0] = bag[bag.length - 1]!;
    bag[bag.length - 1] = swap;
  }
}

/** Next Pompey wisecrack — avoids immediate repeats via a shuffle bag. */
export function nextPlayerQuip(): string {
  if (bag.length === 0) refillBag();
  const line = bag.pop() ?? QUIPS[0]!;
  lastLine = line;
  return line;
}

export function playerQuipCount(): number {
  return QUIPS.length;
}
