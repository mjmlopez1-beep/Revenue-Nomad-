"""Inline tokens, Chart.js, data and app into one standalone HTML file."""
from pathlib import Path

root = Path(__file__).resolve().parent.parent
html = (root / "index.html").read_text()
inline = lambda tag, p: f"<{tag}>\n" + (root / p).read_text().replace("</script", "<\\/script") + f"\n</{tag}>"
html = html.replace('<link rel="stylesheet" href="tokens.css">', inline("style", "tokens.css"))
for src in ["vendor/chart.umd.min.js", "data/dfd_index.js", "app.js"]:
    html = html.replace(f'<script src="{src}"></script>', inline("script", src))
out = root / "dist" / "dfd-index-concept.html"
out.parent.mkdir(exist_ok=True)
out.write_text(html)
print(out, len(html) // 1024, "KB")
