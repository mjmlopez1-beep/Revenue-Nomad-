// The journey: seven landscape scenes and a set of spots.
// Scenes are 1200 x 800 with the ground running off the bottom edge.
import { kit } from "./landscape.mjs";

const W = 1200;
const H = 800;

function trailhead(k) {
  const C = k.C;
  return [
    k.peak(930, 800, 300, 560, C.lilac),
    k.peak(1090, 800, 260, 430, C.haze),
    k.sun(760, 330, 92),
    k.hill(700, 800, 420, C.iris),
    k.hill(1120, 800, 300, C.amethyst),
    // the far town, small and lit
    k.house(1052, 512, 40, 60, { fill: C.paper, lit: true }),
    k.house(1084, 512, 24, 30, { fill: C.lilac, door: C.forest }),
    k.flag(1052, 452, 40, C.gold),
    k.hill(250, 800, 520, C.fern, 300),
    k.hill(940, 800, 480, C.moss, 250),
    k.road([[1066, 520, 5], [1010, 590, 12], [900, 620, 20], [760, 610, 30], [640, 660, 44], [470, 700, 62], [300, 760, 86], [180, 830, 110]]),
    k.hill(60, 800, 330, C.forest, 150),
    k.pine(86, 690, 150),
    k.pine(160, 706, 100),
    k.pine(1000, 640, 70, C.forest),
    k.pine(1130, 660, 110, C.forest),
    k.bush(840, 700, 26, C.fern),
    k.hiker(372, 736, 1.25),
    k.spark(560, 200, 16),
    k.spark(1010, 150, 10),
    k.spark(330, 330, 9),
  ];
}

function fork(k) {
  const C = k.C;
  return [
    // the cold road, left
    k.crag(240, 800, 520, 600, C.slate),
    k.crag(60, 800, 360, 420, C.stone),
    k.cloud(250, 190, 1.7, C.stone),
    k.cloud(120, 250, 1.1, C.slate),
    // the warm road, right
    k.peak(1010, 800, 280, 480, C.lilac),
    k.sun(880, 300, 96),
    k.hill(900, 800, 380, C.iris),
    k.hill(1140, 800, 300, C.amethyst),
    k.house(1010, 470, 34, 50, { lit: true }),
    k.flag(1010, 420, 34),
    k.hill(980, 800, 520, C.fern, 290),
    k.hill(300, 800, 480, C.moss, 220),
    // cold path: thin, steep switchbacks that stop
    k.line([[560, 760], [420, 690], [330, 640], [400, 580], [300, 520], [350, 460], [280, 400]], C.terra, 9, "2 22"),
    // warm path
    k.road([[1014, 474, 6], [960, 540, 14], [860, 580, 24], [760, 600, 36], [680, 660, 52], [600, 740, 76], [560, 830, 100]]),
    k.hill(620, 800, 360, C.forest, 110),
    k.pine(1100, 640, 120),
    k.pine(1040, 660, 80),
    k.pine(840, 690, 60, C.forest),
    k.line([[180, 660], [180, 600], [160, 574], [180, 600], [204, 580]], C.ink, 5),
    k.sign(596, 716, 1.5),
    k.hiker(676, 712, 1.25),
    k.spark(1090, 190, 14),
    k.spark(700, 230, 9),
  ];
}

function company(k) {
  const C = k.C;
  return [
    k.peak(240, 800, 300, 520, C.lilac),
    k.peak(1020, 800, 320, 600, C.lilac),
    k.peak(1150, 800, 220, 380, C.haze),
    k.sun(620, 300, 110),
    k.hill(320, 800, 360, C.iris),
    k.hill(900, 800, 420, C.amethyst),
    k.hill(600, 800, 620, C.fern, 300),
    k.road([[1260, 760, 60], [1100, 670, 42], [920, 600, 30], [770, 566, 24]]),
    k.road([[-60, 780, 60], [110, 680, 42], [290, 608, 30], [440, 570, 24]]),
    k.tent(470, 520, 150, C.amethyst),
    k.tent(752, 524, 170, C.terra),
    k.tent(330, 548, 110, C.paper, C.moss),
    k.fire(610, 560, 1.7),
    k.hiker(545, 566, 1.2, { pose: "wave" }),
    k.hiker(676, 566, 1.2, { jacket: C.blue, pack: C.gold, hat: C.terra, flip: true, pose: "wave" }),
    k.hiker(930, 606, 1.05, { jacket: C.terra, pack: C.forest, hat: C.gold, flip: true }),
    k.hill(130, 800, 300, C.forest, 150),
    k.hill(1100, 800, 320, C.moss, 150),
    k.pine(90, 690, 150),
    k.pine(180, 700, 96),
    k.pine(1090, 680, 130),
    k.pine(1160, 696, 90),
    k.spark(420, 180, 14),
    k.spark(830, 150, 10),
    k.spark(1100, 260, 8),
  ];
}

function lookout(k) {
  const C = k.C;
  const town = (x, by, lit) => k.house(x, by, 44, 58, { lit, fill: lit ? C.paper : C.lilac }) + (lit ? k.spark(x, by - 84, 13) : "");
  return [
    k.peak(1000, 800, 300, 540, C.lilac),
    k.peak(760, 800, 240, 400, C.haze),
    k.sun(1090, 250, 80),
    k.hill(720, 800, 300, C.iris),
    k.hill(1000, 800, 280, C.amethyst),
    town(720, 500, true),
    town(1000, 520, false),
    k.hill(880, 800, 330, C.fern, 190),
    town(880, 610, true),
    k.hill(1130, 800, 240, C.moss, 150),
    town(1130, 650, false),
    k.hill(560, 800, 260, C.moss, 130),
    town(560, 670, true),
    // lines of sight
    k.line([[330, 372], [704, 446]], C.gold, 3, "3 12"),
    k.line([[330, 372], [862, 556]], C.gold, 3, "3 12"),
    k.line([[330, 372], [544, 616]], C.gold, 3, "3 12"),
    // the lookout hill
    k.hill(230, 800, 400, C.forest, 370),
    k.road([[160, 830, 70], [150, 700, 44], [230, 590, 30], [270, 480, 22], [290, 432, 18]]),
    k.hiker(300, 432, 1.25, { pose: "look" }),
    k.pine(90, 560, 120, C.moss),
    k.pine(420, 640, 100, C.moss),
    k.spark(520, 190, 14),
    k.spark(860, 130, 9),
  ];
}

function bridge(k) {
  const C = k.C;
  return [
    k.peak(180, 800, 280, 480, C.lilac),
    k.peak(1040, 800, 320, 580, C.lilac),
    k.sun(600, 260, 100),
    k.hill(600, 800, 300, C.haze),
    // the gap, with water
    k.rect(380, 640, 440, 160, C.iris),
    k.rect(380, 690, 440, 6, C.lilac),
    k.rect(430, 730, 300, 6, C.lilac),
    // bridge: ivory, one arch, like the doorways
    `<path d="M360 470H840V640H760V600A160 160 0 0 0 440 600V640H360Z" fill="${C.paper}"/>`,
    k.rect(360, 452, 480, 20, C.lilac),
    k.road([[-40, 462, 34], [300, 462, 34], [600, 462, 34], [900, 462, 34], [1240, 462, 34]]),
    // banks
    `<path d="M0 470H380V800H0Z" fill="${C.fern}"/>`,
    `<path d="M820 470H1200V800H820Z" fill="${C.moss}"/>`,
    k.road([[-40, 462, 34], [200, 462, 34], [380, 462, 34]]),
    k.road([[820, 462, 34], [1000, 462, 34], [1240, 462, 34]]),
    k.hiker(470, 458, 1.25),
    k.hiker(700, 458, 1.25, { jacket: C.blue, pack: C.gold, hat: C.terra, flip: true, pose: "wave" }),
    k.house(1010, 446, 60, 96, { lit: true }),
    k.flag(1010, 350, 50),
    k.house(1080, 446, 50, 60, { fill: C.lilac }),
    k.pine(120, 446, 130),
    k.pine(210, 446, 90),
    k.pine(1150, 446, 110, C.forest),
    k.bush(300, 446, 22, C.moss),
    k.hill(120, 800, 260, C.forest, 150),
    k.hill(1090, 800, 260, C.forest, 150),
    k.spark(380, 200, 14),
    k.spark(860, 170, 10),
  ];
}

function summit(k) {
  const C = k.C;
  return [
    k.peak(960, 800, 320, 520, C.lilac),
    k.peak(200, 800, 300, 440, C.haze),
    k.sun(700, 250, 130),
    k.hill(980, 800, 340, C.iris),
    k.hill(240, 800, 320, C.amethyst),
    k.hill(600, 800, 460, C.fern, 440),
    k.road([[420, 830, 90], [470, 700, 56], [600, 600, 40], [560, 500, 30], [600, 420, 22], [606, 372, 18]]),
    k.flag(640, 364, 150),
    k.hiker(596, 366, 1.3, { pose: "wave" }),
    k.hill(1080, 800, 320, C.moss, 190),
    k.hill(120, 800, 300, C.forest, 170),
    k.pine(100, 660, 140),
    k.pine(190, 676, 90),
    k.pine(1060, 640, 120, C.forest),
    k.pine(1140, 660, 86, C.forest),
    k.spark(430, 200, 16),
    k.spark(900, 170, 11),
    k.spark(1040, 300, 8),
  ];
}

function empire(k) {
  const C = k.C;
  return [
    k.peak(200, 800, 300, 520, C.lilac),
    k.peak(1060, 800, 280, 460, C.haze),
    k.sun(360, 250, 96),
    k.hill(260, 800, 340, C.iris),
    k.hill(1040, 800, 300, C.amethyst),
    k.hill(640, 800, 560, C.fern, 430),
    // the town you built
    k.house(520, 420, 90, 120, { fill: C.lilac, dw: 0.3 }),
    k.house(770, 430, 100, 100, { fill: C.lilac, dw: 0.3 }),
    k.house(640, 420, 130, 210, { fill: C.paper, lit: true, dw: 0.34, dh: 0.44 }),
    k.rect(566, 200, 148, 14, C.lilac),
    k.house(640, 200, 70, 70, { fill: C.paper, door: C.forest, dw: 0.36, dh: 0.6 }),
    k.flag(640, 130, 70),
    k.house(440, 440, 60, 70, { fill: C.paper, roof: C.terra }),
    k.house(850, 450, 60, 64, { fill: C.paper, roof: C.amethyst }),
    k.road([[560, 840, 110], [600, 720, 70], [700, 640, 48], [660, 540, 36], [640, 470, 28], [640, 424, 24]]),
    k.hiker(604, 700, 1.2),
    k.hiker(730, 610, 0.95, { jacket: C.blue, pack: C.gold, hat: C.terra, flip: true }),
    k.pine(360, 500, 110, C.forest),
    k.pine(930, 510, 120, C.forest),
    k.pine(300, 540, 80, C.moss),
    k.hill(100, 800, 300, C.forest, 160),
    k.hill(1120, 800, 320, C.moss, 170),
    k.pine(1100, 660, 130, C.forest),
    k.pine(80, 680, 110, C.moss),
    k.spark(860, 180, 16),
    k.spark(500, 150, 10),
    k.spark(1000, 280, 9),
  ];
}

// ---- destinations: what people built, and where it began -----------------
function firstStone(k) {
  const C = k.C;
  return [
    k.peak(1010, 800, 300, 520, C.lilac),
    k.sun(300, 260, 96),
    k.hill(240, 800, 340, C.iris),
    k.hill(1040, 800, 320, C.amethyst),
    k.hill(620, 800, 600, C.fern, 330),
    // the temple that is not there yet
    k.ghost("M400 470H880M430 470V260M850 470V260M400 260H880L640 150Z"),
    k.ghost("M520 470V260M610 470V260M670 470V260M760 470V260", C.iris),
    k.block(470, 470, 70, 34, C.paper),
    k.block(548, 470, 70, 34, C.lilac),
    k.block(508, 436, 70, 34, C.paper),
    k.road([[520, 840, 110], [600, 720, 70], [720, 640, 46], [700, 560, 34], [660, 500, 26]]),
    k.tent(820, 520, 130, C.terra),
    k.fire(730, 540, 1.4),
    k.hiker(610, 474, 1.25, { pose: "sit" }),
    k.block(644, 474, 54, 30, C.paper),
    k.pine(330, 520, 110, C.forest),
    k.pine(950, 540, 120, C.forest),
    k.hill(110, 800, 300, C.forest, 160),
    k.hill(1110, 800, 320, C.moss, 170),
    k.pine(90, 680, 120, C.moss),
    k.pine(1100, 660, 130, C.forest),
    k.spark(640, 110, 16),
    k.spark(900, 200, 10),
    k.spark(470, 190, 9),
  ];
}

function nile(k) {
  const C = k.C;
  return [
    k.sun(880, 230, 120),
    k.pyramid(330, 560, 420, 300, C.sun, C.gold),
    k.pyramid(640, 560, 620, 440, C.sun, C.gold),
    k.pyramid(960, 560, 360, 250, C.sun, C.gold),
    k.hill(600, 800, 900, C.clay, 260),
    k.obelisk(250, 590, 190),
    k.obelisk(1000, 600, 150),
    k.rect(0, 660, 1200, 140, C.iris),
    k.rect(120, 700, 420, 6, C.lilac),
    k.rect(640, 730, 380, 6, C.lilac),
    k.hill(300, 800, 520, C.sun, 150),
    k.hill(1000, 800, 420, C.gold, 130),
    k.road([[420, 840, 100], [480, 740, 60], [560, 670, 40], [610, 610, 28], [636, 566, 22]]),
    k.hiker(520, 706, 1.25),
    k.palm(150, 690, 150),
    k.palm(220, 700, 110),
    k.palm(1080, 700, 150),
    k.spark(300, 150, 16),
    k.spark(560, 90, 10),
    k.spark(1100, 120, 9),
  ];
}

function acropolis(k) {
  const C = k.C;
  return [
    k.peak(180, 800, 300, 460, C.lilac),
    k.peak(1060, 800, 280, 420, C.haze),
    k.sun(940, 210, 96),
    k.hill(260, 800, 340, C.iris),
    k.hill(1040, 800, 300, C.amethyst),
    // the rock
    `<path d="M300 800L360 470Q380 420 440 420H820Q880 420 900 470L960 800Z" fill="${C.clay}"/>`,
    `<path d="M640 420H820Q880 420 900 470L960 800H760Z" fill="${C.terra}" opacity="0.35"/>`,
    k.temple(630, 422, 420, 250, 8),
    k.temple(880, 440, 110, 90, 4, { shade: C.haze }),
    k.pine(400, 420, 70, C.moss),
    k.hill(600, 800, 760, C.fern, 190),
    k.road([[520, 840, 110], [560, 740, 66], [660, 690, 44], [620, 630, 32], [640, 560, 24], [634, 470, 18]]),
    k.hiker(566, 722, 1.25),
    k.pine(250, 660, 120, C.forest),
    k.pine(330, 680, 80, C.forest),
    k.pine(980, 670, 130, C.forest),
    k.bush(800, 690, 30, C.moss),
    k.hill(90, 800, 300, C.forest, 150),
    k.hill(1120, 800, 300, C.moss, 150),
    k.spark(360, 180, 16),
    k.spark(700, 110, 10),
    k.spark(1110, 330, 8),
  ];
}

function forum(k) {
  const C = k.C;
  return [
    k.peak(200, 800, 300, 480, C.lilac),
    k.sun(300, 220, 100),
    k.hill(280, 800, 360, C.iris),
    k.hill(1000, 800, 420, C.amethyst),
    // aqueduct striding across the back
    k.arches(-20, 1220, 560, 230, 7, { fill: C.clay, tiers: 2 }),
    k.rect(-20, 322, 1240, 12, C.terra),
    k.hill(600, 800, 800, C.fern, 300),
    // the arena and the arch
    k.arches(650, 1030, 600, 190, 5, { fill: C.paper, hole: C.forest, tiers: 2 }),
    k.rect(640, 402, 400, 12, C.lilac),
    k.arches(300, 500, 600, 150, 1, { fill: C.paper, hole: C.forest }),
    k.rect(290, 440, 220, 14, C.lilac),
    k.rect(330, 414, 140, 28, C.paper),
    k.road([[330, 840, 110], [360, 740, 70], [410, 670, 46], [400, 600, 60]]),
    k.hiker(350, 730, 1.25),
    k.pine(560, 600, 120, C.forest),
    k.pine(1090, 620, 130, C.forest),
    k.pine(210, 620, 90, C.moss),
    k.hill(60, 800, 280, C.forest, 150),
    k.hill(1010, 800, 420, C.moss, 150),
    k.spark(620, 130, 16),
    k.spark(940, 190, 10),
    k.spark(110, 330, 8),
  ];
}

function jungle(k) {
  const C = k.C;
  return [
    k.sun(280, 210, 100),
    k.hill(240, 800, 380, C.fern),
    k.hill(980, 800, 400, C.moss),
    k.stepPyramid(960, 560, 280, 210, 4, { fill: C.stone, shade: C.slate }),
    k.hill(620, 800, 640, C.fern, 300),
    k.stepPyramid(620, 560, 520, 400, 6),
    k.palm(300, 560, 190, C.moss),
    k.palm(380, 580, 130, C.forest),
    k.palm(930, 590, 170, C.forest),
    k.hill(600, 800, 800, C.moss, 240),
    k.road([[540, 840, 110], [570, 730, 64], [650, 660, 44], [620, 600, 36], [620, 564, 34]]),
    k.hiker(560, 716, 1.25),
    k.bush(820, 640, 44, C.forest),
    k.bush(430, 650, 36, C.forest),
    k.hill(80, 800, 300, C.forest, 170),
    k.hill(1130, 800, 300, C.forest, 170),
    k.palm(120, 680, 170, C.moss),
    k.palm(1110, 670, 150, C.fern),
    k.spark(840, 150, 16),
    k.spark(1060, 240, 10),
    k.spark(470, 110, 9),
  ];
}

function ridge(k) {
  const C = k.C;
  return [
    k.peak(240, 800, 320, 560, C.lilac),
    k.peak(520, 800, 280, 430, C.haze),
    k.peak(1060, 800, 300, 500, C.lilac),
    k.sun(760, 200, 96),
    k.hill(300, 800, 380, C.iris),
    k.hill(900, 800, 420, C.amethyst),
    k.wall([[-20, 470], [120, 430], [280, 458], [430, 420], [560, 452], [700, 404], [840, 440], [980, 396], [1110, 432], [1230, 410]], 22),
    k.hill(620, 800, 760, C.fern, 330),
    k.pagoda(640, 500, 230, 4),
    k.house(470, 520, 90, 60, { fill: C.paper, roof: C.terra }),
    k.house(810, 520, 90, 60, { fill: C.paper, roof: C.terra }),
    k.road([[520, 840, 110], [560, 730, 66], [680, 670, 44], [640, 600, 34], [640, 506, 24]]),
    k.hiker(574, 716, 1.25),
    k.pine(330, 580, 120, C.forest),
    k.pine(950, 590, 130, C.forest),
    k.bush(760, 640, 30, C.moss),
    k.hill(90, 800, 300, C.forest, 160),
    k.hill(1120, 800, 320, C.moss, 160),
    k.pine(80, 680, 110, C.moss),
    k.pine(1110, 670, 120, C.forest),
    k.spark(420, 130, 16),
    k.spark(960, 120, 10),
    k.spark(1130, 280, 8),
  ];
}

export const DESTINATIONS = {
  "first-stone": { draw: firstStone, banner: [320, 90, 700, 440], title: "A walker setting the first stones beside a tent, with a temple outlined in dots", stage: "Where it began", use: "The pairing piece for every destination. Each of them started as a camp and one block." },
  nile: { draw: nile, banner: [260, 100, 760, 500], title: "Three pyramids and obelisks by a river", stage: "The Nile", use: "Destination. Scale built one block at a time." },
  acropolis: { draw: acropolis, banner: [300, 120, 760, 480], title: "A columned temple on a rock", stage: "The Acropolis", use: "Destination. Craft and reputation that lasts." },
  forum: { draw: forum, banner: [240, 200, 860, 460], title: "An aqueduct, an arena and a triumphal arch", stage: "The Forum", use: "Destination. Roads and systems that carry the work." },
  jungle: { draw: jungle, banner: [300, 100, 760, 500], title: "Stepped pyramids rising out of jungle", stage: "The Stepped City", use: "Destination. One level, then the next." },
  ridge: { draw: ridge, banner: [300, 60, 760, 500], title: "A tiered tower below a long wall with watchtowers", stage: "The Long Wall", use: "Destination. Something that keeps going past the horizon." },
};

export const JOURNEY = {
  trailhead: { draw: trailhead, banner: [470, 250, 730, 420], title: "A lone walker setting out on a long gold road", stage: "Starting out", use: "Hero and onboarding. One person, a long road, and a lit town far off." },
  fork: { draw: fork, banner: [500, 300, 700, 420], title: "A signpost between a cold mountain trail and a warm road", stage: "Choosing the road", use: "The pitch. Cold outreach climbs the mountain and stops. The warm road is easier." },
  lookout: { draw: lookout, banner: [200, 250, 1000, 440], title: "A walker on a hill spotting lit towns in the distance", stage: "Seeing ahead", use: "Crystal Ball and signals. Which companies are about to need you." },
  bridge: { draw: bridge, banner: [330, 220, 800, 400], title: "Two walkers meeting on a bridge", stage: "A way across", use: "Warm paths and introductions. Someone who has been there meets you halfway." },
  company: { draw: company, banner: [260, 230, 800, 420], title: "Walkers gathered at a camp with tents and a fire", stage: "Not alone", use: "Fractionals, peers and messages. The others on the same road." },
  summit: { draw: summit, banner: [330, 150, 760, 440], title: "A walker planting a flag on a hilltop", stage: "The first win", use: "Pipeline and a deal won." },
  empire: { draw: empire, banner: [300, 90, 760, 500], title: "A small town on a hill with a lit gate and a flag", stage: "What you built", use: "The goal: your own practice. Closing calls to action and pricing." },
};

// ---- spots: 400 x 400, a single idea on a mound -------------------------
const S = 400;
const mound = (k, fill) => k.hill(200, 400, 230, fill, 150);

export const SPOTS = {
  walker: { title: "A lone walker", use: "Profile, your seats, anything about you.", draw: (k) => [k.sun(280, 150, 54), k.peak(110, 400, 150, 250, k.C.lilac), mound(k, k.C.fern), k.road([[120, 410, 60], [170, 320, 34], [220, 262, 22]]), k.hiker(232, 262, 1.5), k.spark(90, 90, 10)] },
  signpost: { title: "A signpost with two arrows", use: "Choosing a way in. Compare the routes.", draw: (k) => [k.peak(300, 400, 150, 260, k.C.lilac), k.sun(110, 160, 46), mound(k, k.C.moss), k.sign(200, 256, 2), k.pine(320, 290, 70, k.C.forest), k.spark(330, 90, 10)] },
  camp: { title: "A tent and a campfire", use: "Community, peers and messages.", draw: (k) => [k.peak(90, 400, 140, 230, k.C.lilac), k.sun(300, 130, 50), mound(k, k.C.fern), k.tent(170, 262, 150, k.C.amethyst), k.fire(275, 272, 1.5), k.pine(60, 300, 80, k.C.forest), k.spark(200, 70, 10)] },
  flag: { title: "A flag on a hilltop", use: "A deal won, a goal reached.", draw: (k) => [k.sun(200, 170, 80), mound(k, k.C.amethyst), k.flag(200, 252, 150), k.pine(90, 310, 70, k.C.forest), k.pine(310, 316, 56, k.C.forest), k.spark(320, 80, 11), k.spark(70, 120, 8)] },
  sunrise: { title: "A quiet valley at sunrise", use: "Empty states. Nothing here yet.", draw: (k) => [k.sun(200, 250, 90), k.hill(90, 400, 190, k.C.iris, 150), k.hill(320, 400, 190, k.C.amethyst, 130), k.hill(200, 400, 260, k.C.fern, 90), k.pine(70, 330, 70, k.C.forest), k.spark(310, 100, 10)] },
  lost: { title: "A walker where the trail stops at a rock face", use: "404 and errors.", draw: (k) => [k.crag(270, 400, 300, 330, k.C.slate), k.cloud(260, 110, 1, k.C.stone), mound(k, k.C.moss), k.line([[60, 330], [130, 290], [180, 272]], k.C.terra, 8, "2 18"), k.hiker(196, 264, 1.4, { pose: "look" })] },
  gate: { title: "A lit gateway with a road leading in", use: "Sign in, get started, unlock.", draw: (k) => [k.peak(90, 400, 140, 240, k.C.lilac), k.sun(320, 120, 44), mound(k, k.C.fern), k.house(200, 262, 120, 150, { lit: true, dw: 0.4, dh: 0.6 }), k.rect(132, 104, 136, 12, k.C.lilac), k.road([[150, 410, 70], [190, 330, 40], [200, 268, 30]]), k.spark(70, 90, 10)] },
  beacon: { title: "A tower with a light at the top", use: "Alerts, signals and Why Now.", draw: (k) => [k.peak(310, 400, 150, 230, k.C.lilac), mound(k, k.C.moss), k.house(200, 262, 64, 170, { dw: 0.4, dh: 0.34 }), k.rect(160, 84, 80, 12, k.C.lilac), k.sun(200, 56, 16), k.spark(200, 56, 34, k.C.sun), k.pine(100, 300, 70, k.C.forest), k.spark(330, 110, 9)] },
};

// The strip that sits at the foot of the sidebar.
export function rail(k) {
  const C = k.C;
  return [
    k.sun(300, 150, 70),
    k.hill(150, 330, 230, C.iris, 150),
    k.hill(400, 330, 200, C.amethyst, 110),
    k.hill(60, 330, 180, C.moss, 70),
    k.hill(420, 330, 200, C.moss, 60),
    k.pine(410, 280, 90, C.forest),
    k.pine(460, 290, 56, C.forest),
    k.pine(50, 284, 60, C.forest),
    k.hill(240, 330, 420, C.moss, 70),
    k.spark(120, 60, 9),
    k.spark(390, 30, 11),
  ];
}

export { W, H, S };
