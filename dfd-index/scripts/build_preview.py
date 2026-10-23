"""Build the hosted preview page (Claude artifact) from index.html.

The hosted preview carries no Clarus logo or first-person Clarus claims, so a
shared link can't be mistaken for an official Clarus page. The branded build
is dist/dfd-index-concept.html (scripts/bundle.py).

Usage: python3 scripts/build_preview.py <out.html>
"""
import re
import sys
from pathlib import Path

root = Path(__file__).resolve().parent.parent
s = (root / "index.html").read_text()
inl = lambda p: (root / p).read_text().replace("</script", "<\\/script")
s = s.replace('<link rel="stylesheet" href="tokens.css">', "<style>\n" + inl("tokens.css") + "\n</style>")
s = s.replace('<script src="vendor/chart.umd.min.js"></script>',
              '<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js"></script>')
for src in ["data/us_states.js", "data/dfd_index.js", "app.js"]:
    s = s.replace(f'<script src="{src}"></script>', "<script>\n" + inl(src) + "\n</script>")
# The artifact host supplies the document skeleton.
s = re.sub(r'<!doctype html>\s*<html[^>]*>\s*<head>\s*<meta charset="utf-8">\s*<meta name="viewport"[^>]*>\s*', "", s)
s = s.replace("<title>Digital Front Door Index</title>",
              '<title>Digital Front Door Index</title>\n<meta name="claude:viewport-fit-sides" content="cover">')
s = s.replace("</head>\n<body>\n", "").replace("</body>\n</html>\n", "")
s = re.sub(r'<a class="logo" href="#top">.*?</a>',
           '<a class="logo" href="#top"><b style="font-size:20px;letter-spacing:-.01em">Digital Front Door Index</b>'
           '<small>Concept preview · prepared for Clarus review</small></a>', s, flags=re.S)
s = s.replace('<div><img src="assets/clarus-logo-white.png" alt="Clarus"><p style="margin:0">A Graham Holdings Company</p></div>',
              '<div><h4>Digital Front Door Index</h4><p style="margin:0">Concept prototype. Publisher branding is added on the production page.</p></div>')
s = s.replace('<span class="pub">Clarus Care</span>, which sells', '<span class="pub">[publisher]</span>, which sells')
assert "clarus-logo" not in s
Path(sys.argv[1]).write_text(s)
print(sys.argv[1], len(s) // 1024, "KB")
