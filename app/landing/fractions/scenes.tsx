/**
 * Fractions on the landing page: each picture the page uses, put together from kit.tsx.
 *
 * The hero. The record card sits in a mint doorway; the Nomad stands on the card and holds up
 * the crystal ball; a dotted trail leads in from the left; big quarters run off the edges. The
 * card's height changes with the record, so the door is in two parts: the arch and everything
 * above the card are drawn here (HeroStage, as wide as the door), and the door's body is a
 * plain mint box in landing.css that runs from the arch to the bottom of the hero.
 *
 * The feature panels. One prop a panel, standing on the panel's product picture: the crystal
 * ball, the trail, the seat and the door. Each is 600 by 280 and stands on its bottom edge.
 *
 * Nothing here holds words, and every picture is decoration except the four props, which are
 * named.
 */
import { Arch, Art, BigBall, Nomad, P, Seat, Spark, Steps, Tent } from "./kit";
import { half, offcut, quarter, square, walk } from "./shapes";

type Cls = { className?: string };

/* ---------- hero ---------- */

/** Above the card on a wide screen: the door's arch, the light inside it, and the Nomad holding up the ball. 560 by 400; the bottom edge is the card's top. */
export function HeroStage({ className }: Cls) {
  return (
    <Art w={560} h={400} className={className}>
      <P t="mint" d={half(0, 120, 280, "u")} />
      <P t="mints" d={half(80, 200, 200, "u")} />
      <Spark cx={120} cy={80} r={20} />
      <Spark cx={460} cy={70} r={10} />
      <Nomad pose="hold" x={340} y={400} flip />
    </Art>
  );
}

/** The same on a phone, where the Nomad is half the size against the door. 360 by 200. */
export function HeroStagePhone({ className }: Cls) {
  return (
    <Art w={360} h={200} className={className}>
      <P t="mint" d={half(0, 20, 180, "u")} />
      <P t="mints" d={half(60, 80, 120, "u")} />
      <Spark cx={37} cy={40} r={10} />
      <Spark cx={285} cy={82} r={10} t="acc" />
      <Nomad pose="hold" x={210} y={200} scale={0.5} flip />
    </Art>
  );
}

/** Right of the door, off the edge of the page: an ember quarter, an off-cut and a hill in pine's tone, a spark. */
export function HeroEdge({ className }: Cls) {
  return (
    <Art w={160} h={640} className={className}>
      <P t="ember" d={quarter(0, 0, 160, "tr")} />
      <P t="pine2" d={offcut(0, 160, 160, "br") + quarter(0, 480, 160, "bl")} />
      <Spark cx={80} cy={400} r={20} />
    </Art>
  );
}

/** An ember dome on the hero's bottom edge, right of the door. */
export function HeroDome({ className }: Cls) {
  return (
    <Art w={160} h={80} className={className}>
      <P t="ember" d={half(0, 0, 80, "u")} />
    </Art>
  );
}

/** The trail to the door: a tent on the bottom edge and half-dot steps that turn twice and arrive at the arch. 640 by 220; its right edge is the door's left. */
export function HeroTrail({ className }: Cls) {
  const pts = walk(
    [260, 180],
    [
      ["L", 360, 180],
      ["A", 360, 100, 80, 90, 0],
      ["A", 520, 100, 80, 180, 270],
      ["L", 636, 20],
    ],
    30,
  );
  return (
    <Art w={640} h={220} className={className}>
      <Tent x={120} y={220} r={120} t="sand" flap="pine" />
      <Steps pts={pts} t="mint" />
    </Art>
  );
}

/** One quarter, as big as its box. `c` is the corner that holds the circle's centre. */
export function Corner({ c, t, className }: Cls & { c: "tl" | "tr" | "bl" | "br"; t: "pine2" | "ember" | "mint" | "sandd" }) {
  return (
    <Art w={160} h={160} className={className}>
      <P t={t} d={quarter(0, 0, 160, c)} />
    </Art>
  );
}

/** A sun cut by the top edge: a half circle hanging down. */
export function Sun({ className }: Cls) {
  return (
    <Art w={160} h={80} className={className}>
      <P t="ember" d={half(0, 0, 80, "d")} />
    </Art>
  );
}

/** One spark on its own: a small accent beside a label. */
export function SparkMark({ className, t = "acc" }: Cls & { t?: "acc" | "sand" | "mint" | "pine" }) {
  return (
    <Art w={40} h={40} className={className}>
      <Spark cx={20} cy={20} r={20} t={t} />
    </Art>
  );
}

/* ---------- the four props, one a feature panel: 600 by 280, standing on the bottom edge ---------- */

/** Crystal Ball: the ball on its stand shows three tents, the ember one is next. The Nomad stands by on a pine hill. */
export function FeatBall({ className }: Cls) {
  return (
    <Art w={600} h={280} className={className} title="A crystal ball on its stand, and the Nomad beside it">
      <P t="mintd" d={half(0, 160, 120, "u")} />
      <P t="pine" d={quarter(360, 40, 240, "br")} />
      <P t="sand" d={offcut(180, 200, 40, "br") + square(220, 200, 80, 40) + offcut(300, 200, 40, "bl") + square(140, 240, 240, 40)} />
      <BigBall cx={260} cy={120} r={80} id="fx-ball-clip" />
      <Spark cx={70} cy={90} r={20} t="pine" />
      <Spark cx={125} cy={148} r={10} t="pine" />
      <Spark cx={522} cy={108} r={10} />
      <Nomad pose="stand" x={470} y={280} scale={0.5} />
    </Art>
  );
}

/** Warm paths: the Nomad walks the trail from a tent to the seat. */
export function FeatTrail({ className }: Cls) {
  return (
    <Art w={600} h={280} className={className} title="The Nomad walks a trail from a tent to a seat">
      <P t="sandd" d={half(-200, 80, 200, "u")} />
      <P t="mint" d={half(260, 120, 160, "u")} />
      <Tent x={110} y={280} r={100} />
      <Steps
        r={7}
        pts={[
          [222, 268],
          [240, 268],
        ]}
      />
      <Seat x={476} y={280} scale={0.4} />
      <Nomad pose="walk" x={350} y={280} scale={0.5} />
      <Spark cx={290} cy={60} r={20} t="acc" />
      <Spark cx={552} cy={110} r={10} t="pine" />
    </Art>
  );
}

/** Rates: three bars stacked from squares and halves, and the seat on a plinth. */
export function FeatRates({ className }: Cls) {
  return (
    <Art w={600} h={280} className={className} title="Three stacked bars beside a seat on a plinth">
      <P t="mint" d={half(440, 120, 160, "u")} />
      <P t="pine" d={square(40, 200, 80, 80) + square(140, 120, 80, 80) + square(240, 160, 80, 80)} />
      <P t="mint" d={half(40, 160, 40, "u") + square(140, 200, 80, 80) + half(240, 120, 40, "u")} />
      <P t="mintd" d={half(140, 80, 40, "u") + square(240, 240, 80, 40)} />
      <P t="sandd" d={square(360, 240, 200, 40)} />
      <Seat x={400} y={240} scale={0.5} />
      <Spark cx={350} cy={70} r={20} t="acc" />
      <Spark cx={60} cy={112} r={10} t="pine" />
    </Art>
  );
}

/** Open roles: a door, nested, with steps leading to it. */
export function FeatDoor({ className }: Cls) {
  return (
    <Art w={600} h={280} className={className} title="A doorway with steps leading to it">
      <P t="pine2" d={half(-200, 80, 200, "u")} />
      <Arch x={180} y={280} r={120} h={240} t="mint" />
      <Arch x={220} y={280} r={80} h={160} t="acc" />
      <Arch x={260} y={280} r={40} h={80} t="sand" />
      <Steps
        t="mint"
        pts={[
          [450, 268],
          [480, 268],
          [510, 268],
          [540, 268],
          [570, 268],
        ]}
      />
      <Spark cx={480} cy={100} r={20} />
      <Spark cx={560} cy={190} r={10} t="mint" />
    </Art>
  );
}

/* ---------- the closing band: the Nomad knocks on the door ---------- */

/** 1120 by 240, cut to the middle on a narrow screen: a tent, steps, the Nomad knocking and the door. */
export function FinalScene({ className }: Cls) {
  return (
    <Art w={1120} h={240} className={className} fit="xMidYMax slice">
      <P t="pine2" d={quarter(0, 0, 240, "bl") + half(760, 120, 120, "u")} />
      <P t="ember" d={quarter(880, 0, 240, "br")} />
      <Tent x={200} y={240} r={60} t="sand" flap="pine" />
      <Steps
        t="mint"
        pts={[
          [290, 228],
          [320, 228],
          [350, 228],
          [380, 228],
          [410, 228],
        ]}
      />
      <Arch x={560} y={240} r={60} h={220} t="mint" />
      <Arch x={580} y={240} r={40} h={180} t="acc" />
      <Arch x={600} y={240} r={20} h={120} t="mints" />
      <Spark cx={545} cy={45} r={8} t="ember" />
      <Spark cx={550} cy={74} r={8} t="ember" />
      <Spark cx={770} cy={60} r={20} />
      <Spark cx={330} cy={110} r={10} />
      <Nomad pose="knock" x={520} y={240} scale={0.5} />
    </Art>
  );
}
