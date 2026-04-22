#!/usr/bin/env python3
"""Generate multiple-choice quiz items from content.json using the Claude CLI.

Strategy:
  1. For every Committee Q&A (tiers 1–3 + supplement): convert the open-ended
     Q into an MCQ. The existing answer text is the ground truth; the generator
     writes a concise stem, one correct choice distilled from the answer, three
     plausible distractors (ideally drawn from sibling content in the same
     section), a one-sentence explanation, and a short citation.

  2. For every supplement paper subsection: generate 1 MCQ that tests the paper's
     core finding — the kind of thing a committee would ask ("what did Liu 2011
     actually show?"). Uses the paper's prose body + metadata footer.

Output: data/quizzes.json (schema: {version, generated, quizzes:[...]})
Resumable: items whose id already exists in data/quizzes.json are skipped.

Usage:
  python3 generate-quiz.py                 # generate everything missing
  python3 generate-quiz.py --limit 10      # cap at 10 new items (smoke test)
  python3 generate-quiz.py --scope qanda   # only from Committee Q&As
  python3 generate-quiz.py --scope papers  # only from supplement papers
  python3 generate-quiz.py --tier tier1    # restrict to one tier
"""
from __future__ import annotations
import argparse, json, re, subprocess, sys, threading, time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).parent
CONTENT = HERE / "data" / "content.json"
OUT = HERE / "data" / "quizzes.json"

CLAUDE = "claude"
MODEL = "sonnet"

# --------------------------------------------------------------------------
# Prompt templates
# --------------------------------------------------------------------------
MCQ_FROM_QA_PROMPT = """You are writing a multiple-choice exam question for a molecular biology PhD qualifying exam.
The student's thesis is on DCAF7 → IFIT3 → IFN-α signaling in JAK2V617F MPN.

INPUT: An open-ended committee question and its model answer.

TASK: Convert the question into a clean multiple-choice item. The correct answer
must be distilled from the model answer (no outside facts). The three distractors
must be plausible — drawn from the same conceptual neighborhood (sibling papers,
adjacent mechanisms, nearby molecular details) — NOT obviously wrong. Avoid
"all of the above" and absolute quantifiers. Keep choices parallel in length
and grammar. The explanation must be one or two sentences, mechanistic, and
reference the model answer's key evidence.

Return ONLY a JSON object with these exact keys:
{{
  "stem": "...",                  // the question, rephrased for MCQ clarity
  "choices": ["A", "B", "C", "D"],// exactly 4 plausible options
  "correctIndex": 0,              // 0-3, which choice is correct
  "explanation": "...",           // 1-2 mechanistic sentences
  "citation": "..."               // brief source marker e.g. "Liu 2011 · §1A"
}}

INPUT QUESTION: {q}

MODEL ANSWER: {a}

SECTION CONTEXT: {section}
"""

MCQ_FROM_PAPER_PROMPT = """You are writing a multiple-choice exam question for a molecular biology PhD qualifying exam.
The student's thesis is on DCAF7 → IFIT3 → IFN-α signaling in JAK2V617F MPN.

INPUT: A detailed ~500-word writeup of a single primary research paper the student
is expected to know by name and mechanism.

TASK: Write ONE MCQ that tests the paper's single most load-bearing finding —
the thing a committee would zero in on when asking "what did this paper actually
show?" The correct answer must come directly from the writeup (no outside facts).
The three distractors must be plausible — use mechanisms, readouts, or cell
systems from ADJACENT papers in the same field (sibling IFIT papers, other CRL4
substrate receptors, other JAK2 knock-in models, etc.) — NOT obviously wrong.
Avoid "all of the above" and absolute quantifiers. Keep choices parallel in
length and grammar. Explanation must be 1-2 mechanistic sentences.

Return ONLY a JSON object with these exact keys:
{{
  "stem": "...",
  "choices": ["A", "B", "C", "D"],
  "correctIndex": 0,
  "explanation": "...",
  "citation": "..."
}}

PAPER TITLE: {title}
SECTION: {section}

PAPER BODY:
{body}
"""

# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------
def call_claude(prompt: str, retries: int = 2) -> dict | None:
    """Run claude -p with the prompt. Return parsed JSON from the result field,
    or None on failure."""
    for attempt in range(retries + 1):
        try:
            p = subprocess.run(
                [CLAUDE, "-p", "--model", MODEL, "--output-format", "json"],
                input=prompt,
                capture_output=True,
                text=True,
                timeout=240,
            )
        except subprocess.TimeoutExpired:
            print(f"  ⚠ timeout (attempt {attempt + 1})", file=sys.stderr)
            continue
        if p.returncode != 0:
            print(f"  ⚠ non-zero exit: {p.stderr[:200]}", file=sys.stderr)
            continue
        try:
            env = json.loads(p.stdout)
        except json.JSONDecodeError:
            print(f"  ⚠ bad envelope JSON", file=sys.stderr)
            continue
        if env.get("is_error"):
            print(f"  ⚠ claude returned error: {env.get('result', '')[:200]}", file=sys.stderr)
            continue
        raw = (env.get("result") or "").strip()
        # Strip markdown code fences if present
        m = re.search(r"```(?:json)?\s*(.+?)```", raw, re.DOTALL)
        if m:
            raw = m.group(1).strip()
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            print(f"  ⚠ bad payload JSON: {raw[:120]!r}", file=sys.stderr)
            continue
    return None


def validate_mcq(j: dict) -> bool:
    if not isinstance(j, dict):
        return False
    if not all(k in j for k in ("stem", "choices", "correctIndex", "explanation")):
        return False
    if not isinstance(j["choices"], list) or len(j["choices"]) != 4:
        return False
    if not all(isinstance(c, str) and c.strip() for c in j["choices"]):
        return False
    ci = j["correctIndex"]
    if not isinstance(ci, int) or ci < 0 or ci >= 4:
        return False
    return bool(j["stem"].strip()) and bool(j["explanation"].strip())


def slug(s: str) -> str:
    s = re.sub(r"[^a-zA-Z0-9]+", "-", s).strip("-").lower()
    return s[:40]


# --------------------------------------------------------------------------
# Job builders
# --------------------------------------------------------------------------
def build_qanda_jobs(content: dict, tier_filter: str | None) -> list[dict]:
    jobs = []
    for t in content["tiers"]:
        if tier_filter and t["id"] != tier_filter:
            continue
        # qnum resets per section in the source PDFs, so use the array index
        # (globally unique within the tier) plus a section slug for readability.
        for i, q in enumerate(t.get("qanda", [])):
            sec_slug = slug(q.get("section", "general")) or "general"
            qid = f"mcq-{t['id']}-{sec_slug}-{i:03d}"
            jobs.append({
                "id": qid,
                "type": "mcq",
                "origin": "qanda",
                "source": {"tierId": t["id"], "sectionId": None, "subsectionId": None},
                "sourceLabel": f"{t['title'].split(' — ')[0]} · {q.get('section', 'Committee Q')}",
                "prompt": MCQ_FROM_QA_PROMPT.format(
                    q=q["q"], a=q.get("a", "(no written answer provided)"),
                    section=q.get("section", "General"),
                ),
            })
    return jobs


def build_paper_jobs(content: dict, tier_filter: str | None) -> list[dict]:
    jobs = []
    for t in content["tiers"]:
        if t["id"] != "supplement":
            continue
        if tier_filter and t["id"] != tier_filter:
            continue
        for s in t["sections"]:
            for sub in s["subsections"]:
                # Skip overview/scope subsections — need actual paper body
                if not sub.get("id") or not sub.get("keyFacts"):
                    continue
                body = sub.get("body", "")
                if len(body) < 400:   # skip thin entries
                    continue
                # Trim body if very long
                if len(body) > 5500:
                    body = body[:5500] + "\n[…truncated]"
                qid = f"mcq-supplement-{sub['id'].replace('.', '-')}"
                jobs.append({
                    "id": qid,
                    "type": "mcq",
                    "origin": "paper",
                    "source": {"tierId": t["id"], "sectionId": s["id"], "subsectionId": sub["id"]},
                    "sourceLabel": f"Supplement · {sub['id']} · {sub['title'][:60]}",
                    "prompt": MCQ_FROM_PAPER_PROMPT.format(
                        title=sub["title"], section=s["title"], body=body,
                    ),
                })
    return jobs


# --------------------------------------------------------------------------
# Main
# --------------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0,
                    help="Max new items to generate (0 = no cap)")
    ap.add_argument("--scope", choices=["all", "qanda", "papers"], default="all")
    ap.add_argument("--tier", default=None, help="Restrict to one tier id (e.g. tier1)")
    ap.add_argument("--workers", type=int, default=6,
                    help="Concurrent CLI workers (default: 6)")
    ap.add_argument("--reset", action="store_true", help="Overwrite existing quizzes")
    args = ap.parse_args()

    content = json.loads(CONTENT.read_text())
    existing = {"version": 1, "generated": None, "quizzes": []}
    if OUT.exists() and not args.reset:
        existing = json.loads(OUT.read_text())
    done_ids = {q["id"] for q in existing.get("quizzes", [])}

    jobs: list[dict] = []
    if args.scope in ("all", "qanda"):
        jobs += build_qanda_jobs(content, args.tier)
    if args.scope in ("all", "papers"):
        jobs += build_paper_jobs(content, args.tier)

    jobs = [j for j in jobs if j["id"] not in done_ids]
    if args.limit:
        jobs = jobs[:args.limit]

    print(f"Existing items: {len(done_ids)}")
    print(f"New jobs to run: {len(jobs)}")
    print(f"Concurrency: {args.workers} workers")
    if not jobs:
        return

    # Shared state guarded by a lock — in-flight writes + checkpoint
    io_lock = threading.Lock()
    counter = {"done": 0, "ok": 0, "fail": 0}
    start = time.monotonic()

    def run_one(job):
        """Worker: call claude, return (job, result) — no file I/O here."""
        result = call_claude(job["prompt"])
        return job, result

    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = [pool.submit(run_one, j) for j in jobs]
        for fut in as_completed(futures):
            try:
                job, result = fut.result()
            except Exception as e:
                with io_lock:
                    counter["done"] += 1
                    counter["fail"] += 1
                    print(f"[{counter['done']}/{len(jobs)}] exception: {e}", flush=True)
                continue

            if result is None or not validate_mcq(result):
                with io_lock:
                    counter["done"] += 1
                    counter["fail"] += 1
                    print(f"[{counter['done']}/{len(jobs)}] ✗ {job['id']} (failed validation)", flush=True)
                continue

            item = {
                "id": job["id"],
                "type": job["type"],
                "source": job["source"],
                "sourceLabel": job["sourceLabel"],
                "origin": job["origin"],
                "stem": result["stem"].strip(),
                "choices": [c.strip() for c in result["choices"]],
                "correctIndex": int(result["correctIndex"]),
                "explanation": result["explanation"].strip(),
                "citation": (result.get("citation") or "").strip() or None,
            }
            with io_lock:
                counter["done"] += 1
                counter["ok"] += 1
                existing["quizzes"].append(item)
                existing["generated"] = datetime.now(timezone.utc).isoformat()
                OUT.write_text(json.dumps(existing, indent=2))
                elapsed = time.monotonic() - start
                rate = counter["done"] / elapsed if elapsed > 0 else 0
                eta = (len(jobs) - counter["done"]) / rate if rate > 0 else 0
                print(f"[{counter['done']}/{len(jobs)}] ✓ {job['id']}  "
                      f"({rate*60:.1f}/min, ETA {eta/60:.1f}m)", flush=True)

    print(f"\nGenerated: {counter['ok']}   Failed: {counter['fail']}   "
          f"Total in file: {len(existing['quizzes'])}   "
          f"Elapsed: {(time.monotonic()-start)/60:.1f}m")


if __name__ == "__main__":
    main()
