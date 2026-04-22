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
# PDF extraction sometimes drops a space between a leading capital and the
# rest of a word (most often for "T umor" / "T arget" / "T ype", occasionally
# for others). Fix the specific known artifacts — don't generalize (else we
# break valid patterns like "B cell" or "T cell").
LIGATURE_WORDS = {
    "T umor": "Tumor", "t umor": "tumor",
    "T opology": "Topology", "t opology": "topology",
    "T opologies": "Topologies", "t opologies": "topologies",
    "T arget": "Target", "t arget": "target",
    "T argets": "Targets", "t argets": "targets",
    "T argeted": "Targeted", "t argeted": "targeted",
    "T argeting": "Targeting", "t argeting": "targeting",
    "T ransplantation": "Transplantation",
    "T ransplant": "Transplant",
    "T ranscription": "Transcription",
    "T ranscriptional": "Transcriptional",
    "T ype": "Type", "t ype": "type",
    "T ypes": "Types", "t ypes": "types",
    "T ime": "Time", "t ime": "time",
    "T iming": "Timing", "t iming": "timing",
}
def clean(s: str) -> str:
    for k, v in LIGATURES.items():
        s = s.replace(k, v)
    for k, v in LIGATURE_WORDS.items():
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

# Inline sub-subsection marker: e.g. "C3a. Kinase scaffolding — …" that appears
# mid-paragraph (start of line or after a newline). The PDF extractor often
# joins these headings with their parent paragraph, so we need to split them out.
INLINE_SUBSUB_PAT = re.compile(
    r"(?:^|\n)\s*([A-Z]\d+[a-z])\.\s+(.+)",
    re.DOTALL
)

KF_RE = re.compile(r"Key\s+facts?\s*:?\s*\n(.*?)(?=\n{2}|\nA\.\d|\nB\.\d|\n[A-Z]\.\d|\n[A-Z]\d+\.|\Z)",
                    re.DOTALL | re.IGNORECASE)

# Words that almost always start a body sentence — not part of a subsection title.
# Used to detect where a title ends and the body begins when the PDF extractor
# stripped the newline between them.
_BODY_STARTERS = set("""
Before After Although Because During Here However Importantly Indeed Moreover
Nonetheless Notably Significantly Such Additionally Meanwhile Once Rather Since
Then Therefore Thus Thus, This These Those Since The This paper Humans Mice Mammals
Vertebrates Mammalian Most Many Some Few Other Another One Two Three Four Five
Six Seven Eight Nine Ten Unlike While Whereas In a In the In this Finally Still
When Where Who What If Its It Both Either Neither Every Each All An A New
We Our At By For From With Without Beyond Above Below
""".split())

def _looks_like_body_start(word: str) -> bool:
    """Does this word look like the start of a body sentence (rather than a
    continuation of a title)?"""
    if not word:
        return False
    if word in _BODY_STARTERS:
        return True
    # Multi-char ALL-CAPS words (gene names, acronyms) are usually mid-title.
    if len(word) > 1 and word.isupper():
        return False
    # Starts with capital, at least 4 chars — almost certainly a sentence-starter.
    if word[0].isupper() and word[1:2].islower() and len(word) >= 4:
        return True
    return False

def _split_title_and_body(raw: str, cap_words: int = 10) -> tuple[str, str]:
    """The PDF extraction often yields a subsection heading with its body
    prose run together. We heuristically split at:
      (b) the first word that looks like a sentence-start, preferred — this
          gives the cleanest break at the title/body boundary (e.g.
          "Why chain topology matters | Ubiquitin chain topology dictates…"),
      (a) or at a ". " (period-space) boundary within the first ~cap_words
          words if (b) didn't find a clean break,
      (c) or at cap_words as a last-resort fallback.
    Returns (title, body_prefix) — body_prefix may be empty string."""
    raw = raw.strip()
    if not raw:
        return "", ""
    words = raw.split()
    if len(words) <= 7:
        return raw, ""
    # (b) Preferred — first body-starter word at position ≥ 3.
    for i in range(3, min(len(words), cap_words + 4)):
        if _looks_like_body_start(words[i]):
            title = " ".join(words[:i])
            body = " ".join(words[i:])
            return title, body
    # (a) Sentence boundary fallback. Only accept if the resulting title is
    # at most cap_words words — don't leave a 12-word "title".
    m = re.search(r"([\.!?])\s+([A-Z])", raw)
    if m:
        prefix = raw[: m.end() - 1]
        if prefix.count(" ") + 1 <= cap_words:
            title = prefix.rstrip().rstrip(".!?")
            body = raw[m.end() - 1:].lstrip()
            if title and body:
                return title, body
    # (c) last-resort fallback
    return " ".join(words[:cap_words]), " ".join(words[cap_words:])

def _split_inline_subsubs(body: str) -> list[dict]:
    """Scan a body for inline sub-subsection headings like `C3a. …` or
    `D2b. …`. If found, split the body into a sequence of sub-sub cards.
    Returns a list of {id, title, body} dicts, or an empty list if no splits."""
    marker_re = re.compile(r"(?:^|\n)\s*([A-Z]\d+[a-z])\.\s+", re.MULTILINE)
    matches = list(marker_re.finditer(body))
    if not matches:
        return []
    out = []
    # Content before first marker → "Intro" sub
    pre = body[: matches[0].start()].strip()
    if len(pre) > 60:
        out.append({"id": None, "title": "Overview", "body": pre})
    for i, m in enumerate(matches):
        start = m.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(body)
        raw = body[start:end].strip()
        title, rest = _split_title_and_body(raw)
        out.append({"id": m.group(1), "title": title, "body": rest})
    return out

_CONTINUATION_WORDS = {
    "and", "or", "of", "to", "for", "with", "the", "a", "an", "in", "at",
    "on", "by", "as", "from", "into", "onto", "via",
}

def _maybe_extend_title(title: str, body: str) -> tuple[str, str]:
    """The PDF extractor often breaks a heading mid-phrase ("Discovery of
    ubiquitin and\nthe conjugation cascade…" or "Kinase scaffolding —\nthe
    original DCAF7 function"). If the title ends with a continuation word
    or a trailing em-dash / hyphen, pull the next phrase out of the body
    up to the first body-starter word or ~10 words in."""
    raw = title.rstrip()
    if not raw:
        return title, body
    t_words = raw.split()
    tail = t_words[-1].lower().rstrip(",.:;")
    ends_dash = raw.endswith(("—", "–", "-"))
    if not ends_dash and tail not in _CONTINUATION_WORDS:
        return title, body
    # Budget: at most 10 words total in the title and at most 80 chars total.
    remaining_budget = max(0, 10 - len(t_words))
    max_chars = 80 - len(raw)
    if remaining_budget == 0 or max_chars <= 0:
        return title, body
    b_words = body.split()
    consumed = 0
    char_cost = 0
    for i, w in enumerate(b_words):
        if i > 0 and _looks_like_body_start(w):
            break
        # Stop at a `(` or `)` or `.` — these usually signal a paren-aside
        # or a sentence boundary (e.g. "Lear 2025 Sci Adv and BC18630 is…")
        if w.startswith("(") or w.endswith("."):
            consumed = i + 1
            break
        char_cost += len(w) + 1
        if char_cost > max_chars:
            break
        consumed = i + 1
        if i >= remaining_budget - 1:
            break
    if consumed == 0 or consumed >= len(b_words):
        return title, body
    pulled = " ".join(b_words[:consumed])
    new_title = (raw + " " + pulled).strip()
    new_body = " ".join(b_words[consumed:])
    return new_title, new_body

def _clean_subsection(sub: dict) -> dict:
    """Normalize titles that got merged with body text by the PDF extractor."""
    title = sub.get("title") or ""
    body = sub.get("body") or ""
    # Case 1 — title is too long and clearly ate into body
    if len(title.split()) > 8 or ". " in title:
        new_title, extra = _split_title_and_body(title)
        if extra:
            title = new_title
            body = (extra + "\n\n" + body).strip() if body else extra
    # Case 2 — title is too short / ends in a connector word
    title, body = _maybe_extend_title(title, body)
    sub["title"] = title
    sub["body"] = body
    return sub

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

    # Second pass — for each subsection, (a) split inline sub-subsections out
    # into their own entries, and (b) clean up title/body merges.
    expanded = []
    for sub in subs:
        inline = _split_inline_subsubs(sub["body"])
        if inline:
            # Use the inline splits instead of the single catch-all subsection
            for piece in inline:
                expanded.append(_clean_subsection(piece))
        else:
            expanded.append(_clean_subsection(sub))
    return expanded

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
    # Fallback — if no explicit "Key facts:" block, pull the most
    # flashcard-worthy sentences out of the prose. This gives tiers 2 and 3
    # (which don't use the "Key facts:" convention) a deck to study from.
    if not facts:
        facts = _mine_fact_sentences(body, want=2)
    return facts

# Common sentence openers that rarely lead a memorable fact.
_FLABBY_OPENERS = {
    "However,", "Importantly,", "Notably,", "In contrast,", "In summary,",
    "Moreover,", "Furthermore,", "Additionally,", "Still,", "Rather,",
    "Thus,", "Therefore,", "Thus", "Therefore", "Finally,", "Consequently,",
    "Indeed,", "Nonetheless,", "Meanwhile,", "Interestingly,",
}

def _score_fact(sentence: str) -> int:
    """Heuristic flashcard-worthiness score. Higher = more memorable."""
    s = sentence.strip()
    if not s:
        return 0
    # Penalize by length extremes
    n = len(s)
    if n < 70 or n > 320:
        return 0
    score = 0
    # Numbers / quantities
    if re.search(r"\b\d", s):
        score += 3
    # ALL-CAPS gene/protein names (3+ letters)
    caps_hits = len(re.findall(r"\b[A-Z]{3,}\b", s))
    score += min(caps_hits, 4)
    # Named entities like "Smith 2019" or "Liu et al."
    if re.search(r"\b[A-Z][a-z]+\s+(?:et al\.?|\d{4})\b", s):
        score += 2
    # Specific biology/methodology keywords
    for kw in ("PMID", "IC50", "Ki", "Kd", "nM", "µM", "%", "half-life", "Cre",
               "knockout", "CRISPR", "JAK2V617F", "DCAF7", "IFIT", "MAVS",
               "TBK1", "STAT", "MPN", "UPS", "CRL4", "SLAM", "LSK"):
        if kw in s:
            score += 1
    # Penalize vague, meta-sounding openings
    first_word = s.split(" ", 1)[0]
    if first_word in _FLABBY_OPENERS:
        score -= 2
    # Penalize questions (facts > questions for study cards)
    if s.endswith("?"):
        score -= 2
    return score

def _mine_fact_sentences(body: str, want: int = 2) -> list[str]:
    if not body:
        return []
    # Split into sentences on `. ` boundaries, keeping punctuation
    # Light protection for "e.g." / "et al." / decimal numbers
    protected = (body
        .replace("e.g.", "e_g_")
        .replace("i.e.", "i_e_")
        .replace("et al.", "et al_")
        .replace("Fig.", "Fig_")
        .replace("vs.", "vs_"))
    # Split on sentence-ending punctuation followed by whitespace + Capital
    raw = re.split(r"(?<=[\.!])\s+(?=[A-Z])", protected)
    sentences = []
    for s in raw:
        s = s.replace("e_g_", "e.g.").replace("i_e_", "i.e.") \
             .replace("et al_", "et al.").replace("Fig_", "Fig.").replace("vs_", "vs.")
        s = re.sub(r"\s+", " ", s).strip()
        if s:
            sentences.append(s)
    scored = [(_score_fact(s), s) for s in sentences]
    scored.sort(key=lambda x: -x[0])
    out = []
    for score, s in scored:
        if score <= 1:
            break
        out.append(s)
        if len(out) >= want:
            break
    return out

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

Path("data/content.json").write_text(json.dumps(out, indent=2))
print("Wrote data/content.json")
for t in out["tiers"]:
    n_sub = sum(len(s["subsections"]) for s in t["sections"])
    n_kf = sum(s["totalKeyFacts"] for s in t["sections"])
    print(f"  {t['id']}: {len(t['sections'])} sections, {n_sub} subsections, {n_kf} key facts, {len(t['qanda'])} Q&As")
