#!/usr/bin/env python3
"""Extract text from all 3 Quals Study Bible PDFs into a single JSON file."""
import json, re
from pathlib import Path
from pypdf import PdfReader

ROOT = Path.home() / "Desktop"
PDFS = {
    "tier1": ROOT / "Quals Study Bible — Tier 1.pdf",
    "tier2": ROOT / "Quals Study Bible — Tier 2.pdf",
    "tier3": ROOT / "Quals Study Bible — Tier 3.pdf",
}

def extract_pdf(path):
    r = PdfReader(str(path))
    pages = []
    for i, p in enumerate(r.pages):
        try:
            t = p.extract_text() or ""
        except Exception as e:
            t = f"[extraction error page {i+1}: {e}]"
        pages.append({"page": i + 1, "text": t})
    return { "title": path.stem, "num_pages": len(pages), "pages": pages }

out = {}
for k, p in PDFS.items():
    if not p.exists():
        print(f"MISSING: {p}"); continue
    print(f"Extracting {p.name}...")
    out[k] = extract_pdf(p)
    print(f"  {out[k]['num_pages']} pages")

with open("content-raw.json", "w") as f:
    json.dump(out, f, indent=2)

total = sum(v["num_pages"] for v in out.values())
total_chars = sum(len(pg["text"]) for v in out.values() for pg in v["pages"])
print(f"\nTotal: {total} pages, {total_chars:,} characters")
