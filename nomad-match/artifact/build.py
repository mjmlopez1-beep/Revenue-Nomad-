"""Build the single-file artifact page: artifact/nomad-match.html.

Reuses the local app's styles, markup and UI script (nomad_match/static/index.html), swaps the
three server calls for the in-browser engine (artifact/engine.js) and inlines the precomputed
data (artifact/data.js, from `python -m nomad_match.export_artifact`).

    python artifact/build.py
"""
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
SRC = (HERE.parent / "nomad_match" / "static" / "index.html").read_text()

style = re.search(r"<style>.*?</style>", SRC, re.S).group(0)
body = re.search(r'<header class="top">.*?</main>', SRC, re.S).group(0)
ui = re.search(r"<script>\n(.*?)</script>", SRC, re.S).group(1)

swaps = [
    # metadata comes from the inlined data instead of /api/meta
    ('META = await api("/api/meta");',
     'const DD = NM.data;\n  META = { samples: DD.samples.map((s) => s.text), revenue_stages: DD.revenue_stages, role_categories: DD.role_categories, industries: DD.industries, claude: false, model: "" };'),
    ("""  $("engine").innerHTML = META.claude
    ? `<span class="dot" style="background:var(--green)"></span>Intake: Claude (${esc(META.model)})`
    : `<span class="dot" style="background:var(--gold)"></span>Intake: rules (no API key)`;""",
     """  $("engine").innerHTML = `<span class="dot" style="background:var(--muted)"></span>Intake: checking for Claude…`;
  NM.getSample().then((s) => {
    $("engine").innerHTML = s
      ? `<span class="dot" style="background:var(--green)"></span>Intake: Claude (asks your permission on first use)`
      : `<span class="dot" style="background:var(--gold)"></span>Intake: keyword rules (Claude unavailable here)`;
  });"""),
    ('const res = await api("/api/intake", { text: $("problem").value, answers: ANSWERS });',
     'const res = await NM.intake($("problem").value, ANSWERS);'),
    ('const res = await api("/api/match", { problem: $("problem").value, brief: BRIEF, filters: f });',
     'const res = NM.match($("problem").value, BRIEF, f);'),
    ("Search vector (normalised blend of local embeddings):\\n${res.query_text}",
     "Search vector (normalised blend of precomputed all-MiniLM-L6-v2 embeddings):\\n${res.query_text}${res.query_note ? `\\n\\n${res.query_note}` : ``}"),
    ('busy(btn, true, ANSWERS.length ? "Updating brief" : "Reading your situation");',
     'busy(btn, true, ANSWERS.length ? "Updating brief" : "Claude is reading…");'),
]
for a, b in swaps:
    assert ui.count(a) == 1, a[:60]
    ui = ui.replace(a, b)

body = body.replace(
    '<div class="brand"><b>Nomad Match</b><span>Describe the problem. Get the right three operators, with evidence.</span></div>',
    '<div class="brand"><b>Nomad Match</b><span>Describe the problem. Get the right three operators, with evidence. All 10 operators are fictional.</span></div>',
)
style = style.replace("<style>", "<style>\n  :root { color-scheme: light; }\n  body { background: var(--bg); color: var(--ink); }", 1)

page = f"""<title>Nomad Match</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Red+Hat+Display:wght@400;500;600;700;800&display=swap">
{style}
{body}
<script>{(HERE / "data.js").read_text()}</script>
<script>{(HERE / "engine.js").read_text()}</script>
<script>
{ui}</script>
"""
out = HERE / "nomad-match.html"
out.write_text(page)
print(f"Wrote {out} ({out.stat().st_size // 1024} KB)")
