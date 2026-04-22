#!/usr/bin/env python3
"""Parse the Supplement v2 markdown into a 4th tier and merge into content.json.

Input: /Users/huey/Desktop/Quals Study Bible — Supplement v2.md
Output: updates /Users/huey/Desktop/quals-study/data/content.json

Markdown structure:
  # Section N — Title            (5 top-level)
  ## Section scope and rationale (narrative)
  ## A. Axis Title               (axis — becomes a section)
  ### Paper title — Author YEAR  (individual paper — becomes a subsection)
    <prose paragraphs>
    PMID: ... · DOI: [...](...) · Model: ... · Approach: ...
  ## Committee Q bank            (numbered "1. **"Q"**" entries)

In the app we flatten to:
  section  = an axis (e.g. "§1A — The IFIT3–MAVS–TBK1 signaling amplifier axis")
  subsection = a paper (preserves prose + keyFacts extracted from PMID/DOI/Model/Approach row)
  qanda    = Committee Q bank items, tagged with section-number label
"""
import json, re
from pathlib import Path

SRC = Path.home() / "Desktop" / "Quals Study Bible — Supplement v2.md"
OUT = Path("data/content.json")

md = SRC.read_text()

# ---------------------------------------------------------------------------
# Pass 1 — split the document into top-level sections (# Section N — Title)
# ---------------------------------------------------------------------------
SECTION_RE = re.compile(r"^#\s+Section\s+(\d+)\s+—\s+(.+?)\s*$", re.MULTILINE)
section_heads = list(SECTION_RE.finditer(md))

sections_out = []   # each: { id, title, subsections[], totalKeyFacts }
qanda_out = []      # flat list across the whole supplement

# Axis heading: "## A. Axis title" or "## Section scope and rationale"
AXIS_RE = re.compile(r"^##\s+(.+?)\s*$", re.MULTILINE)
# Paper heading: "### Paper — Author YEAR, *Journal*"
PAPER_RE = re.compile(r"^###\s+(.+?)\s*$", re.MULTILINE)
# Metadata footer: PMID/DOI/Model/Approach line
META_RE = re.compile(
    r"PMID:\s*([^\s·]+)\s*·\s*DOI:\s*\[([^\]]+)\]\(([^)]+)\)"
    r"(?:\s*·\s*Model:\s*([^·\n]+?))?"
    r"(?:\s*·\s*Approach:\s*([^·\n]+?))?\s*$",
    re.MULTILINE,
)

def strip_md(s: str) -> str:
    """Very light markdown→text for display."""
    # Drop italic/bold emphasis markers but keep text
    s = re.sub(r"\*\*(.+?)\*\*", r"\1", s)
    s = re.sub(r"(?<!\*)\*(?!\s)([^*\n]+?)\*(?!\*)", r"\1", s)
    # Strip inline code ticks
    s = re.sub(r"`([^`\n]+)`", r"\1", s)
    return s

def parse_qbank(block: str, section_label: str):
    """Parse the Committee Q bank into qanda entries.
    Handles multiple observed formats across Sections 1-5:
      Fmt A: `1. **"Q"** — answer...`           (bold + quotes, Sections 1, 3)
      Fmt B: `1. *Q*\n   answer...`             (italic, Section 2)
      Fmt C: `1. **Q**`                         (bold, question-only, Section 4)
      Fmt D: `1. "Q" (Refs: ...) Expected answer: ...` (Section 5)
    """
    # Chunk by leading-number-dot at start of line
    chunks_re = re.compile(r"(?ms)^(\d+)\.\s+(.*?)(?=^\d+\.\s+|\Z)")
    # Question extraction patterns, tried in order
    q_patterns = [
        re.compile(r'^\*\*[\"\u201c](.+?)[\"\u201d]\*\*', re.DOTALL),  # **"Q"**
        re.compile(r'^\*\*(.+?)\*\*', re.DOTALL),                     # **Q**
        re.compile(r'^\*(?!\*)(.+?)(?<!\*)\*(?!\*)', re.DOTALL),      # *Q*
        re.compile(r'^[\"\u201c](.+?)[\"\u201d]', re.DOTALL),         # "Q"
    ]
    out = []
    for m in chunks_re.finditer(block):
        body = m.group(2).strip()
        q, q_end = None, 0
        for pat in q_patterns:
            qm = pat.match(body)
            if qm:
                q = qm.group(1).strip()
                q_end = qm.end()
                break
        if not q:
            # Fall back: first sentence is the question
            first = re.split(r"(?<=[?\.])\s+", body, maxsplit=1)
            q = first[0]
            q_end = len(q)
        rest = body[q_end:].lstrip(" \t\n—–-:").strip()
        rest = strip_md(rest)
        rest = re.sub(r"\s+", " ", rest).strip()
        q = strip_md(q).strip().strip('"\u201c\u201d').strip()
        q = re.sub(r"\s+", " ", q)
        if q:
            out.append({"q": q, "a": rest, "section": section_label})
    return out

def extract_key_facts(paper_body: str):
    """Pull a short list of key facts from the paper body.
    We use the PMID/DOI/Model/Approach footer + a punchy sentence or two."""
    facts = []
    meta_m = META_RE.search(paper_body)
    if meta_m:
        pmid, doi_label, doi_url, model, approach = meta_m.groups()
        facts.append(f"PMID {pmid} · DOI {doi_label}")
        if model:
            facts.append(f"Model: {model.strip()}")
        if approach:
            facts.append(f"Approach: {approach.strip()}")
    return facts

# ---------------------------------------------------------------------------
# Walk each top-level section
# ---------------------------------------------------------------------------
for i, sec_m in enumerate(section_heads):
    sec_num = sec_m.group(1)
    sec_title = strip_md(sec_m.group(2)).strip()
    body_start = sec_m.end()
    body_end = section_heads[i + 1].start() if i + 1 < len(section_heads) else len(md)
    body = md[body_start:body_end]

    # Break into ## blocks
    axis_heads = list(AXIS_RE.finditer(body))
    # Append a sentinel end
    axis_heads_ends = [h.start() for h in axis_heads[1:]] + [len(body)]

    for j, ah in enumerate(axis_heads):
        axis_title_raw = strip_md(ah.group(1)).strip()
        axis_body = body[ah.end(): axis_heads_ends[j]]

        # Classify this ## block
        t_lower = axis_title_raw.lower()

        if t_lower.startswith("committee q bank"):
            # Extract questions for this whole section
            label = f"§{sec_num} — {sec_title}"
            qanda_out.extend(parse_qbank(axis_body, label))
            continue

        if t_lower.startswith("papers attempted") or t_lower.startswith("attribution") \
           or t_lower.startswith("dropped"):
            # Skip housekeeping
            continue

        # "Section scope and rationale" — emit as a single-subsection scope section
        if t_lower.startswith("section scope"):
            scope_id = f"S{sec_num}.scope"
            scope_title = f"§{sec_num} — Scope & rationale"
            # Single overview subsection with the whole prose
            prose = strip_md(axis_body).strip()
            sub = {
                "id": None,
                "title": f"{sec_title}: scope & rationale",
                "body": prose,
                "keyFacts": [],
            }
            sections_out.append({
                "id": scope_id,
                "title": scope_title,
                "subsections": [sub],
                "totalKeyFacts": 0,
            })
            continue

        # Otherwise this is an axis — parse its papers
        # Axis title often looks like "A. The IFIT3–MAVS–TBK1 signaling amplifier axis"
        letter_m = re.match(r"([A-Z])\.\s+(.+)", axis_title_raw)
        if letter_m:
            axis_letter = letter_m.group(1)
            axis_title = letter_m.group(2).strip()
        else:
            axis_letter = chr(ord("A") + j)
            axis_title = axis_title_raw

        section_id = f"S{sec_num}.{axis_letter}"
        section_title = f"§{sec_num}{axis_letter} — {axis_title}"

        papers = list(PAPER_RE.finditer(axis_body))
        subs = []
        if not papers:
            # No paper entries — use the prose as a single overview
            prose = strip_md(axis_body).strip()
            if prose:
                subs.append({
                    "id": None,
                    "title": "Overview",
                    "body": prose,
                    "keyFacts": [],
                })
        else:
            # Text before first paper = axis preamble (rare)
            pre = axis_body[: papers[0].start()].strip()
            if len(pre) > 80:
                subs.append({
                    "id": None,
                    "title": "Overview",
                    "body": strip_md(pre).strip(),
                    "keyFacts": [],
                })
            for k, pm in enumerate(papers):
                p_title = strip_md(pm.group(1)).strip()
                p_start = pm.end()
                p_end = papers[k + 1].start() if k + 1 < len(papers) else len(axis_body)
                p_body_raw = axis_body[p_start:p_end].strip()
                p_body = strip_md(p_body_raw).strip()
                # Normalize consecutive blank lines
                p_body = re.sub(r"\n{3,}", "\n\n", p_body)
                sub_id = f"{section_id}.{k + 1}"
                subs.append({
                    "id": sub_id,
                    "title": p_title,
                    "body": p_body,
                    "keyFacts": extract_key_facts(p_body_raw),
                })

        total_kf = sum(len(s["keyFacts"]) for s in subs)
        sections_out.append({
            "id": section_id,
            "title": section_title,
            "subsections": subs,
            "totalKeyFacts": total_kf,
        })

# ---------------------------------------------------------------------------
# Number Committee Q entries, emit supplement tier
# ---------------------------------------------------------------------------
for idx, q in enumerate(qanda_out, 1):
    q["qnum"] = idx

supplement_tier = {
    "id": "supplement",
    "title": "Supplement — Deep Gap Analysis",
    "sections": sections_out,
    "qanda": qanda_out,
}

# ---------------------------------------------------------------------------
# Merge into existing content.json
# ---------------------------------------------------------------------------
content = json.loads(OUT.read_text())
# Remove any prior supplement tier so this script is re-runnable
content["tiers"] = [t for t in content["tiers"] if t.get("id") != "supplement"]
content["tiers"].append(supplement_tier)

OUT.write_text(json.dumps(content, indent=2))

# ---------------------------------------------------------------------------
# Report
# ---------------------------------------------------------------------------
n_sub = sum(len(s["subsections"]) for s in sections_out)
n_kf = sum(s["totalKeyFacts"] for s in sections_out)
print(f"Supplement parsed:")
print(f"  {len(sections_out)} sections, {n_sub} subsections (papers+overviews),")
print(f"  {n_kf} key-fact lines, {len(qanda_out)} committee Q&As")
print(f"Wrote {OUT}")
