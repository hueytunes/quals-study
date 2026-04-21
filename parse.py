#!/usr/bin/env python3
"""Parse raw PDF text into structured content.json."""
import json, re
from pathlib import Path

data = json.loads(Path("content-raw.json").read_text())

LIGATURES = {
    "ﬁ": "fi", "ﬂ": "fl", "ﬀ": "ff", "ﬃ": "ffi", "ﬄ": "ffl",
    "\u00a0": " ", "\u2009": " ", "\u202f": " ",
    "\u2011": "-", "\u2012": "-",
}
def clean(s: str) -> str:
    for k, v in LIGATURES.items():
        s = s.replace(k, v)
    # Rejoin words broken across lines: "ubiq-\nuitin" or "ubiq- uitin" (PDF
    # line-wraps with a space between halves).
    s = re.sub(r"(\w)-\s*\n\s*(\w)", r"\1\2", s)
    s = re.sub(r"(\w)-\s+(\w)(?=\w{2,})", r"\1\2", s)
    return s

DOT_LEADER = re.compile(r"(?:\s\.\s){4,}\s*\d+\s*$")    # ". . . . . . 18"

def full_text(tier):
    parts = []
    for p in tier["pages"]:
        t = clean(p["text"])
        lines = t.split("\n")
        if lines and lines[-1].strip().isdigit():
            lines = lines[:-1]
        lines = [l for l in lines if not re.match(r"^Quals Study Bible", l, re.I)]
        # Only strip lines that are clearly TOC dot-leader lines (e.g., "Title . . . . 45")
        lines = [l for l in lines if not DOT_LEADER.search(l)]
        parts.append("\n".join(lines))
    return "\n\n".join(parts)

PART1_HEAD = re.compile(r"^Part I[ \t]+—[ \t]+(?:Foundational Content|Methodology|Non-UPS)", re.MULTILINE)
PART2_HEAD = re.compile(r"^Part II[ \t]+—[ \t]+Committee Questions", re.MULTILINE)

def find_parts(text):
    """Return (start_part1, start_part2) offsets — the REAL Part I/II
       headings (not the TOC references or cross-references)."""
    p1 = list(PART1_HEAD.finditer(text))
    p2 = list(PART2_HEAD.finditer(text))
    start_p2 = p2[-1].start() if p2 else len(text)
    # Real Part I: the last Part I heading that's still BEFORE Part II
    # (the first one is usually the TOC line, the second is the real one).
    cands = [m for m in p1 if m.start() < start_p2]
    start_p1 = cands[-1].start() if cands else 0
    return start_p1, start_p2

# Section heading patterns. Only real headings, not TOC entries.
SECTION_PAT = re.compile(
    r"""^(?:
        Section\s+([A-Z])\.?\s*[—\-]?\s+(\S.+?)\s*$
      | ([A-Z])(\d+)\.\s+(\S.+?)\s*$
      | ([A-Z])\.(\d+)\s+(\S.+?)\s*$
    )""",
    re.MULTILINE | re.VERBOSE,
)

SUBSUB_PAT = re.compile(
    r"^\s*([A-Z]\.\d+\.\d+|[A-Z]\d+\.\d+)\s+(\S.+?)\s*$",
    re.MULTILINE,
)

KF_RE = re.compile(r"Key\s+facts?\s*:?\s*\n(.*?)(?=\n{2}|\nA\.\d|\nB\.\d|\n[A-Z]\.\d|\n[A-Z]\d+\.|\Z)",
                    re.DOTALL | re.IGNORECASE)

def split_subs(body):
    matches = list(SUBSUB_PAT.finditer(body))
    subs = []
    if matches and matches[0].start() > 0:
        pre = body[: matches[0].start()].strip()
        if len(pre) > 50:
            subs.append({"id": None, "title": "Overview", "body": pre})
    for i, m in enumerate(matches):
        start = m.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(body)
        subs.append({
            "id": m.group(1),
            "title": m.group(2).strip(),
            "body": body[start:end].strip(),
        })
    if not subs:
        subs = [{"id": None, "title": "Overview", "body": body.strip()}]
    return subs

def extract_facts(body):
    facts = []
    for m in KF_RE.finditer(body):
        block = m.group(1)
        # Split on bullet markers
        bullets = re.split(r"\n\s*(?:[-•\*]|\d+\.)\s+", "\n" + block)
        for b in bullets[1:]:
            fact = re.sub(r"\s+", " ", b.strip())
            if 15 < len(fact) < 600:
                facts.append(fact)
    return facts

# Part II: Q&A. Two formats observed across tiers:
#   "Q1. Question... \n <answer>..." (tier 2)
#   "1. Question? \n • <answer>..."   (tier 1, 3)
Q_RE = re.compile(r"(?:^|\n)\s*(?:Q(\d+)|(\d+))\.\s+(.+?)(?=(?:\n\s*(?:Q\d+|\d+)\.\s)|\Z)", re.DOTALL)

def parse_committee_qa(text):
    """Tier 3 format: 'Committee Q: "..."' followed by 'A: ...'"""
    out = []
    pattern = re.compile(
        r'Committee Q:\s*(?:"([^"]+)"|(.+?))\s*\n\s*A:\s*(.+?)(?=\n\s*Committee Q:|\Z)',
        re.DOTALL
    )
    for i, m in enumerate(pattern.finditer(text), 1):
        q = (m.group(1) or m.group(2) or "").strip()
        a = m.group(3).strip()
        q = re.sub(r"\s+", " ", q)
        a = re.sub(r"\s+", " ", a)
        if q and a:
            out.append({"qnum": i, "q": q, "a": a})
    return out

def parse_qa_block(text):
    out = []
    # Committee Q format first (doesn't conflict with numbered format)
    out.extend(parse_committee_qa(text))
    for m in Q_RE.finditer(text):
        qnum = int(m.group(1) or m.group(2))
        chunk = m.group(3).strip()
        # Answer usually starts with "•" bullet or a new line
        qm = re.match(r"(.+?\?)\s*(.+)", chunk, re.DOTALL)
        if qm:
            q, a = qm.group(1).strip(), qm.group(2).strip()
        else:
            # Split on first blank line or bullet marker
            parts = re.split(r"\n\s*[-•\*]\s+", chunk, maxsplit=1)
            if len(parts) == 2:
                q, a = parts[0], parts[1]
            else:
                lines = chunk.split("\n", 1)
                q = lines[0].strip()
                a = lines[1].strip() if len(lines) > 1 else ""
        # Strip leading bullet from answer if present
        a = re.sub(r"^\s*[-•\*]\s+", "", a)
        q = re.sub(r"\s+", " ", q).strip()
        a = re.sub(r"\s+", " ", a).strip()
        if not q:
            continue
        out.append({"qnum": qnum, "q": q, "a": a})
    return out

SECT_HEADING_RE = re.compile(
    r"^(The [A-Z][A-Za-z \-/,&]{3,70}|DCAF7 Biology|Normal Hematopoiesis|"
    r"Myeloproliferative Neoplasms|Integrative Synthesis|Interferon Signaling[A-Za-z ,]*|"
    r"AML[A-Za-z ,]*|CHIP[A-Za-z ,]*|Mouse Genetics[A-Za-z ,]*|"
    r"Flow Cytometry[A-Za-z ,]*|Ubiquitinomics[A-Za-z ,]*|Alternative[A-Za-z ,]*|"
    r"Methodology[A-Za-z ,]*|Non-UPS[A-Za-z ,]*|Inflammation[A-Za-z ,]*|"
    r"Innate Immune[A-Za-z ,]*|Contingency[A-Za-z ,]*)\s*$",
    re.MULTILINE,
)

def tag_qa(part2_text):
    if not part2_text.strip():
        return []
    # Split the text at each section heading
    headings = list(SECT_HEADING_RE.finditer(part2_text))
    tagged = []
    if not headings:
        # All under "General"
        for q in parse_qa_block(part2_text):
            q["section"] = "General"
            tagged.append(q)
        return tagged
    # Content before first heading
    pre = part2_text[: headings[0].start()]
    for q in parse_qa_block(pre):
        q["section"] = "General"
        tagged.append(q)
    for i, h in enumerate(headings):
        start = h.end()
        end = headings[i + 1].start() if i + 1 < len(headings) else len(part2_text)
        block = part2_text[start:end]
        sec_name = h.group(1).strip()
        for q in parse_qa_block(block):
            q["section"] = sec_name
            tagged.append(q)
    return tagged

TIER_TITLES = {
    "tier1": "Tier 1 — Foundational Concepts",
    "tier2": "Tier 2 — Methodology & Applied Context",
    "tier3": "Tier 3 — Non-UPS, Inflammation, Contingencies",
}

out = {"tiers": []}
for tid in ("tier1", "tier2", "tier3"):
    if tid not in data: continue
    text = full_text(data[tid])
    s1, s2 = find_parts(text)
    part1 = text[s1:s2]
    part2 = text[s2:]

    # Parse major sections within Part I
    matches = list(SECTION_PAT.finditer(part1))
    sections_raw = []
    for i, m in enumerate(matches):
        start = m.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(part1)
        chunk = part1[start:end].strip()
        g = m.groups()
        if g[0]:
            sid, title = g[0], g[1].strip()
        elif g[2]:
            sid, title = f"{g[2]}{g[3]}", g[4].strip()
        else:
            sid, title = f"{g[5]}.{g[6]}", g[7].strip()
        if not title or len(title) < 3:
            continue
        sections_raw.append({"id": sid, "title": title, "body": chunk})

    # Dedupe by id (keep longest body)
    by_id = {}
    for s in sections_raw:
        if s["id"] not in by_id or len(s["body"]) > len(by_id[s["id"]]["body"]):
            by_id[s["id"]] = s
    sections_raw = list(by_id.values())

    # Sort
    def sort_key(s):
        sid = s["id"]
        m = re.match(r"([A-Z])\.?(\d*)", sid)
        if m:
            return (m.group(1), int(m.group(2)) if m.group(2) else 0)
        return (sid, 0)
    sections_raw.sort(key=sort_key)

    enriched = []
    for s in sections_raw:
        subs = split_subs(s["body"])
        total = 0
        for sub in subs:
            sub["keyFacts"] = extract_facts(sub["body"])
            total += len(sub["keyFacts"])
        enriched.append({
            "id": s["id"],
            "title": s["title"],
            "subsections": subs,
            "totalKeyFacts": total,
        })

    qanda = tag_qa(part2)

    out["tiers"].append({
        "id": tid,
        "title": TIER_TITLES[tid],
        "sections": enriched,
        "qanda": qanda,
    })

Path("content.json").write_text(json.dumps(out, indent=2))
print("Wrote content.json")
for t in out["tiers"]:
    n_sub = sum(len(s["subsections"]) for s in t["sections"])
    n_kf = sum(s["totalKeyFacts"] for s in t["sections"])
    print(f"  {t['id']}: {len(t['sections'])} sections, {n_sub} subsections, {n_kf} key facts, {len(t['qanda'])} Q&As")
