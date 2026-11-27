import type { Metadata } from "next";
import Link from "next/link";
import { BLEND, ILLUSTRATIONS, LANDSCAPES } from "@/lib/brand/manifest";
import Illustration from "./Illustration";
import "./brand.css";

export const metadata: Metadata = {
  title: "Merlin brand library",
  description: "Illustrations, palette and supporting assets for the Merlin rebrand.",
};

const SWATCHES = [
  { name: "Night green", hex: "#0A1F1A", note: "Background" },
  { name: "Terrace", hex: "#0E2822", note: "Raised surfaces" },
  { name: "Cream", hex: "#F4F1E8", note: "Line work and type" },
  { name: "Lime", hex: "#C9F03D", note: "Buttons and accents" },
  { name: "Path gold", hex: "#F2B632", note: "The route, nothing else" },
  { name: "Door glow", hex: "#FBEFC2", note: "The destination" },
];

const scenes = ILLUSTRATIONS.filter((i) => i.kind === "scene");
const spots = ILLUSTRATIONS.filter((i) => i.kind === "spot");

function Files({ id, labeled }: { id: string; labeled: boolean }) {
  return (
    <div className="ml-files">
      <a href={`/brand/dark/${id}.svg`} download>Dark SVG</a>
      <a href={`/brand/light/${id}.svg`} download>Light SVG</a>
      {labeled && <a href={`/brand/dark/${id}-labeled.svg`} download>Dark, labeled</a>}
      {labeled && <a href={`/brand/light/${id}-labeled.svg`} download>Light, labeled</a>}
    </div>
  );
}

function LandCard({ l, dir = "landscape" }: { l: (typeof LANDSCAPES)[number]; dir?: string }) {
  return (
    <figure className="ml-card">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/brand/${dir}/${l.id}.svg`} alt={l.title} width={l.width} height={l.height} loading="lazy" />
      <figcaption>
        <code>{l.id}</code>
        {l.stage && <b style={{ marginLeft: 10 }}>{l.stage}</b>}
        <p>{l.use}</p>
        <div className="ml-files">
          <a href={`/brand/${dir}/${l.id}.svg`} download>SVG</a>
          {l.banner && <a href={`/brand/landscape/${l.id.replace("scene-", "banner-")}.svg`} download>Banner crop</a>}
        </div>
      </figcaption>
    </figure>
  );
}

export default function BrandLibrary() {
  return (
    <div className="ml">
      <div className="ml-wrap">
        <header className="ml-top">
          <Link href="/brand" className="ml-wordmark">
            merlin<i>.</i>
          </Link>
          <nav>
            <Link href="/brand/guide">Brand guide</Link>
            <a href="#blend">The guide</a>
            <a href="#journey">The journey</a>
            <a href="#scenes">Scenes</a>
            <a href="#spots">Spots</a>
            <a href="#light">Light theme</a>
            <a href="#assets">Assets</a>
            <a href="#usage">Usage</a>
            <Link href="/brand/mockups">Product mockups</Link>
          </nav>
        </header>

        <section className="ml-hero">
          <div>
            <h1>A familiar way in.</h1>
            <p>Find your next client through people you know.</p>
            <a href="#scenes" className="ml-btn">
              Explore the library
            </a>
          </div>
          <Illustration name="scene-terraces" labeled priority />
        </section>

        <section className="ml-section" id="blend">
          <h2>The guide</h2>
          <p>
            The two ideas together. A hooded traveller with a staff walks the gold path through
            the line-art world, with soft green hills behind. The story runs from setting out, to
            choosing the warm way, to the places people built, none of which started that way.
          </p>
          <div className="ml-grid scenes">
            {BLEND.filter((l) => l.kind !== "spot").map((l) => (
              <LandCard key={l.id} l={l} dir="blend" />
            ))}
          </div>
          <div className="ml-grid spots">
            {BLEND.filter((l) => l.kind === "spot").map((l) => (
              <LandCard key={l.id} l={l} dir="blend" />
            ))}
          </div>
        </section>

        <section className="ml-section">
          <h2>Palette</h2>
          <p>
            Three colors on a near-black green. Gold is reserved for the path, so the eye always
            finds the route first. Lime marks actions and architectural highlights.
          </p>
          <div className="ml-swatches">
            {SWATCHES.map((s) => (
              <div className="ml-swatch" key={s.hex}>
                <span style={{ background: s.hex }} />
                <div>
                  <b>{s.name}</b>
                  <small>{s.hex}</small>
                  <br />
                  <small>{s.note}</small>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="ml-section" id="scenes">
          <h2>Scenes</h2>
          <p>
            Seven hero illustrations at 1200 by 900. Each comes plain or with waypoint callouts,
            in dark and light. The callouts match the product story for that scene.
          </p>
          <div className="ml-grid scenes">
            {scenes.map((i) => (
              <figure className="ml-card" key={i.id}>
                <Illustration name={i.id as never} labeled />
                <figcaption>
                  <code>{i.id}</code>
                  <p>{i.use}</p>
                  <Files id={i.id} labeled />
                </figcaption>
              </figure>
            ))}
          </div>
        </section>

        <section className="ml-section" id="spots">
          <h2>Spots</h2>
          <p>
            Eight square illustrations at 640 by 640 for feature cards, onboarding steps, empty
            states and error pages.
          </p>
          <div className="ml-grid spots">
            {spots.map((i) => (
              <figure className="ml-card" key={i.id}>
                <Illustration name={i.id as never} />
                <figcaption>
                  <code>{i.id}</code>
                  <p>{i.use}</p>
                  <Files id={i.id} labeled={false} />
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      </div>

      <div className="ml-light" id="light">
        <div className="ml-wrap">
          <section className="ml-section" style={{ borderTop: 0 }}>
            <h2>Light theme</h2>
            <p>
              Every illustration also ships on cream with dark green line work, for the portal and
              other light surfaces. Gold stays the same so the path reads identically in both.
            </p>
            <div className="ml-grid scenes">
              <figure className="ml-card">
                <Illustration name="scene-doors" theme="light" labeled />
              </figure>
              <figure className="ml-card">
                <Illustration name="scene-beacon" theme="light" labeled />
              </figure>
            </div>
            <div className="ml-grid spots">
              {spots.slice(0, 4).map((i) => (
                <figure className="ml-card" key={i.id}>
                  <Illustration name={i.id as never} theme="light" />
                </figure>
              ))}
            </div>
          </section>
        </div>
      </div>

      <div className="ml-light" id="journey">
        <div className="ml-wrap">
          <section className="ml-section" style={{ borderTop: 0 }}>
            <h2>The journey</h2>
            <p>
              Flat landscape scenes about going fractional. One walker sets out alone, chooses the
              warm road over the cold one, finds others on the same trail and builds something of
              their own. Scenes are 1200 by 800, and each also comes as a wide banner crop.
            </p>
            <div className="ml-grid scenes">
              {LANDSCAPES.filter((l) => l.kind === "scene").map((l) => (
                <LandCard key={l.id} l={l} />
              ))}
            </div>
          </section>
          <section className="ml-section">
            <h2>Destinations</h2>
            <p>
              What people built, shown without a word: pyramids, a temple, an aqueduct, stepped
              cities, a wall across the hills. None of them started there, so each pairs with the
              first-stone scene.
            </p>
            <div className="ml-grid scenes">
              {LANDSCAPES.filter((l) => l.kind === "destination").map((l) => (
                <LandCard key={l.id} l={l} />
              ))}
            </div>
          </section>
          <section className="ml-section">
            <h2>Journey spots</h2>
            <p>Eight square pieces at 400 by 400, plus the strip of hills that sits at the foot of the sidebar.</p>
            <div className="ml-grid spots">
              {LANDSCAPES.filter((l) => l.kind === "spot").map((l) => (
                <LandCard key={l.id} l={l} />
              ))}
            </div>
          </section>
        </div>
      </div>

      <div className="ml-wrap">
        <section className="ml-section" id="assets" style={{ borderTop: 0 }}>
          <h2>Supporting assets</h2>
          <p>A tileable arcade pattern, a path divider and an app icon, all in the same line style.</p>
          <div className="ml-extras">
            <figure className="ml-card">
              <div className="ml-pattern" style={{ backgroundImage: "url(/brand/dark/pattern-arcade.svg)" }} />
              <figcaption>
                <code>pattern-arcade</code>
                <p>Tiles in both directions at 120 by 150. Use behind footers and section bands.</p>
                <div className="ml-files">
                  <a href="/brand/dark/pattern-arcade.svg" download>Dark SVG</a>
                  <a href="/brand/light/pattern-arcade.svg" download>Light SVG</a>
                </div>
              </figcaption>
            </figure>
            <figure className="ml-card">
              <div className="ml-markrow">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {[96, 64, 32, 16].map((n) => (
                  <img key={n} src="/brand/mark.svg" alt="" width={n} height={n} style={{ width: n }} />
                ))}
              </div>
              <figcaption>
                <code>mark</code>
                <p>App icon and favicon. A doorway with the path leading in.</p>
                <div className="ml-files">
                  <a href="/brand/mark.svg" download>SVG</a>
                </div>
              </figcaption>
            </figure>
          </div>
          <figure className="ml-card" style={{ marginTop: 20 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/dark/divider-path.svg" alt="" width={1200} height={96} />
            <figcaption>
              <code>divider-path</code>
              <p>Section divider at 1200 by 96. Also works as a three-step progress header.</p>
              <div className="ml-files">
                <a href="/brand/dark/divider-path.svg" download>Dark SVG</a>
                <a href="/brand/light/divider-path.svg" download>Light SVG</a>
              </div>
            </figcaption>
          </figure>
        </section>

        <section className="ml-section" id="usage">
          <h2>Usage</h2>
          <p>
            Files live in <code>public/brand</code> and are generated by{" "}
            <code>npm run brand:build</code>. In the app, use the component so alt text and
            dimensions come from the manifest.
          </p>
          <div className="ml-code">{`import Illustration from "@/app/brand/Illustration";

<Illustration name="scene-terraces" labeled />
<Illustration name="spot-garden" theme="light" alt="" />`}</div>
        </section>

        <footer className="ml-foot">Merlin brand library. Generated from scripts/brand.</footer>
      </div>
    </div>
  );
}
