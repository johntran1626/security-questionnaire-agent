"""Pad a knowledge base with unrelated company documents to test how each system scales.

A real vendor's docs are not 37 tidy security sections: the security policies sit among release notes, support
playbooks, runbooks, an HR handbook and meeting notes, often hundreds of pages. Paste-everything then has to read
all of it on every question, and search has to find the right section among many that share words like
"customer", "data", "employees", "plan" or "within 24 hours".

The padding is generated from templates (no model, fully reproducible) and never mentions a security control, so
every label stays correct. That makes these "easy" distractors: they share vocabulary with the questions but never
contradict the policies. Near-duplicate security text (an old policy version, another product's docs) would be a
harder test and is not covered here.

    python -m eval.distractors --kb kestrelbyte --scales 10,50,100
"""

import argparse
import hashlib
import json
import random
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "eval" / "data" / "kb"
SOURCE_DIR = ROOT / "src" / "data" / "kb"
STREAM_SEED = {"kestrelbyte": 101, "tidemark": 202}

# Anything that could make a claim about one of the 28 labelled controls. Checked on every generated string.
BANNED = [
    r"encrypt", r"\baes\b", r"\btls\b", r"\bssl\b", r"cipher", r"\bkeys?\b", r"single sign", r"\bsso\b", r"saml",
    r"\bmfa\b", r"multi-factor", r"two-factor", r"\b2fa\b", r"authenticat", r"scim", r"provision", r"access review",
    r"offboard", r"onboard", r"revok", r"permission", r"\blogs?\b", r"logging", r"\blogin", r"audit", r"retention",
    r"retain", r"vulnerab", r"\bscan", r"penetrat", r"pentest", r"code review", r"incident", r"breach", r"backup",
    r"back up", r"restor", r"disaster", r"recover", r"failover", r"region", r"vendor", r"sub-?processor",
    r"third.part", r"delet", r"erase", r"purge", r"residen", r"data cent", r"training", r"background check",
    r"\bsoc\b", r"soc ?2", r"\biso\b", r"27001", r"attest", r"certif", r"password", r"secur", r"privacy", r"gdpr",
    r"complian",
]
_BANNED_RE = re.compile("|".join(BANNED), re.IGNORECASE)

POOLS = {
    "feature": ["page templates", "the board view", "inline comments", "page history", "the weekly digest",
                "linked pages", "the table editor", "quick search", "the reading mode", "team spaces",
                "page analytics", "the calendar view", "smart tags", "the outline panel", "embedded diagrams",
                "the mobile editor", "recurring checklists", "page reminders", "the import wizard", "focus mode"],
    "object": ["page", "board", "table", "space", "checklist", "diagram", "template", "comment thread"],
    "child": ["rows", "cards", "blocks", "images", "columns", "sub-pages", "mentions", "attachments"],
    "view": ["board", "list", "calendar", "timeline", "gallery", "table", "outline"],
    "segment": ["engineering", "design", "agency", "education", "nonprofit", "startup", "product"],
    "tier": ["Team", "Business", "Enterprise", "Starter"],
    "month": ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October",
              "November", "December"],
    "settings_tab": ["Editor", "Notifications", "Appearance", "Labs", "Workspace", "Integrations"],
    "integration": ["spreadsheet", "slide deck", "chat thread", "issue tracker", "calendar invite", "web page"],
    "action": ["moving blocks", "creating a checklist", "switching spaces", "inserting a table",
               "starting a comment", "duplicating a page"],
    "team": ["editor", "growth", "platform", "mobile", "billing", "search", "design systems", "support tooling",
             "data", "web"],
    "support_topic": ["billing questions", "plan upgrades", "refund requests", "slow page loads",
                      "missing notifications", "import problems", "invoice changes", "feature requests",
                      "workspace renames", "mobile sync issues", "seat changes", "duplicate pages"],
    "macro": ["Thanks for the report", "Upgrade options", "Refund approved", "Known issue", "Need more details",
              "Feature request noted"],
    "runbook_topic": ["shipping a web release", "warming the search cache", "rotating feature flags",
                      "resizing the queue workers", "running a schema migration", "clearing stuck exports",
                      "rebuilding the page index", "scaling the editor service", "pausing a rollout",
                      "refreshing the demo workspace"],
    "job": ["build-web", "migrate-schema", "reindex-pages", "warm-cache", "export-sweeper", "rollout-canary"],
    "stage": ["canary", "staging", "smoke test", "full rollout", "verification"],
    "cluster": ["editor", "search", "export", "web", "worker"],
    "metric": ["p95 latency", "error rate", "queue depth", "CPU use", "page load time", "export wait time"],
    "flag": ["ff_editor_", "ff_search_", "ff_board_", "ff_mobile_", "ff_growth_"],
    "component": ["the editor service", "the search index", "the export pipeline", "the web app",
                  "the queue workers"],
    "busy": ["peak", "weekday morning", "end-of-month", "launch-week"],
    "hr_topic": ["paid time off", "expenses", "parental leave", "home office", "public holidays",
                 "team offsites", "working hours", "sabbaticals", "learning budget", "referrals"],
    "sales_topic": ["the Team plan", "the Business plan", "the Enterprise plan", "education pricing",
                    "nonprofit pricing", "annual billing", "competitive deals", "expansion deals"],
    "competitor_kind": ["a document editor", "a project tracker", "a chat tool with pages", "a spreadsheet tool",
                        "an intranet product"],
    "asset": ["one-page overview", "pricing sheet", "customer story", "product tour video", "comparison chart"],
    "deal_term": ["custom invoice schedule", "multi-year price lock", "annual prepayment",
                  "purchase order process", "seat true-up clause"],
    "resource": ["pages", "spaces", "comments", "boards", "members", "templates", "tags", "exports"],
    "field": ["title", "parent_id", "tags", "icon", "position", "archived", "color", "due_date"],
    "default": ["null", "false", "the workspace default", "an empty list", "the top of the list"],
    "person": ["Priya", "Marcus", "Lena", "Tomás", "Aiko", "Dev", "Sofia", "Kwame", "Hannah", "Ravi", "Noor",
               "Felix", "Grace", "Omar", "Ines", "Jun"],
    "weekday": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
    "quarter": ["Q1", "Q2", "Q3", "Q4"],
    "color": ["the brand blue", "dark slate", "the accent green", "warm gray"],
    "style_topic": ["product names", "headlines", "buttons", "screenshots", "customer quotes", "release posts"],
}

NUMBERS = {
    "n": [3, 5, 8, 10, 12, 20, 25, 50, 100, 200, 500],
    "pct": [5, 10, 15, 20, 25, 30, 40],
    "hours": [4, 8, 12, 24],
    "days": [2, 3, 5, 10, 15, 20, 25, 30],
    "weeks": [2, 4, 6, 12, 16, 20],
    "minutes": [5, 10, 15, 30],
    "seconds": [5, 10, 30, 60],
    "amount": [300, 500, 750, 1000, 1500],
    "major": [3, 4, 5, 6],
    "minor": list(range(1, 30)),
    "year": [2023, 2024, 2025],
}

# Each doc type: id prefix, title template, section headings (used in order), sentence templates.
DOC_TYPES = [
    ("rn", "Release notes {major}.{minor}", ["Highlights", "New in {feature}", "Improvements", "Fixes", "Coming next"], [
        "{feature_cap} now supports {action}, which was the most requested change from {segment} customers.",
        "We cut load time for large {object}s by {pct}% on average.",
        "Fixed a bug where a {object} with more than {n} {child} would not show in the {view} view.",
        "{feature_cap} is rolling out to {tier} plans first and will reach every workspace by the end of {month}.",
        "You can turn this off under Workspace settings, {settings_tab} tab.",
        "Pasting from a {integration} now keeps column widths and cell colors.",
        "Shortcuts for {action} are listed in the help menu.",
        "Thanks to the {team} team for shipping this in {weeks} weeks.",
        "The {view} view now remembers the last filter you used on each {object}.",
        "We removed the old beta banner from {feature}; it is now generally available.",
        "{company} customers on the {tier} plan asked for this at the last product council.",
        "Exports of a {object} to a {integration} are about {pct}% smaller than before.",
    ]),
    ("sp", "Support playbook: {support_topic}", ["When to use this", "Steps", "What to tell the customer", "Escalation", "Examples"], [
        "If a customer writes in about {support_topic}, first check which plan their workspace is on.",
        "Reply within {hours} business hours for {tier} plans and within {days} business days for the free plan.",
        "Offer a {pct}% credit only after a team lead approves it in the billing channel.",
        "Most of these tickets are solved by asking the customer to reload the {view} view and try again.",
        "Hand the ticket to the {team} team if it affects more than {n} people in one workspace.",
        "Use the saved reply called '{macro}' and edit the greeting so it sounds like you.",
        "Do not promise a release date for a feature request; add it to the request board instead.",
        "Ask for a screenshot of the {view} view and the browser they are using.",
        "Close the ticket after {days} days without a reply, with a short note that they can write back any time.",
        "Tag the ticket with the plan name so the {team} team can see which customers are affected.",
    ]),
    ("rb", "Runbook: {runbook_topic}", ["Purpose", "Before you start", "Steps", "If something looks wrong", "Owner"], [
        "Run the {job} job from the deploy dashboard and wait for the {stage} stage to turn green.",
        "This usually takes about {minutes} minutes on the {cluster} cluster.",
        "If the {metric} graph stays above its usual range for more than {minutes} minutes, pause the rollout.",
        "Flags for {feature} start with the prefix {flag}.",
        "Post in the {team} channel before running this during {busy} hours.",
        "The {team} team owns this runbook and updates it after every major change to {component}.",
        "Check that no other {job} job is running; two at once will slow down {component}.",
        "When the {stage} stage passes, post the build number in the release thread.",
        "Expect the {metric} to rise for a few minutes while caches fill, then settle.",
        "Most runs need no manual steps after the {stage} stage.",
    ]),
    ("hb", "Handbook: {hr_topic}", ["Who this applies to", "How it works", "How to ask", "Questions"], [
        "Full-time employees get {days} days of paid time off per year, plus public holidays.",
        "Submit expense claims within {days} days of the purchase using the finance form.",
        "{company} pays up to ${amount} per year toward a home office setup.",
        "Managers approve leave in the people tool; plan at least {weeks} weeks ahead for leave longer than {days} days.",
        "Parental leave is {weeks} weeks at full pay for every new parent.",
        "Team offsites happen twice a year, usually in {month}.",
        "Core hours are 11:00 to 15:00 in your own time zone; the rest of the day is yours to arrange.",
        "Each person has a learning budget of ${amount} per year for books, courses and conferences.",
        "Questions about this page go to the people team in their weekly office hours on {weekday}.",
        "After {major} years at {company}, employees can take a {weeks}-week sabbatical.",
    ]),
    ("sg", "Sales guide: {sales_topic}", ["Positioning", "Pricing", "Discounts", "Common objections", "Next steps"], [
        "The {plan_price} per user per month when billed annually.",
        "Discounts above {pct}% need approval from the head of sales.",
        "When a prospect compares us with {competitor_kind}, lead with {feature}.",
        "Send the {asset} after the first call and book a demo within {days} days.",
        "Larger customers often ask for a {deal_term}; send those questions to the deal desk.",
        "Most {segment} teams start on the {tier} plan and grow into a larger plan within a year.",
        "If price is the main objection, show how {feature} saves a team about {hours} hours a week.",
        "Record the next step in the deal notes before the end of the call.",
        "Free trials last {days} days and can be extended once by the account manager.",
    ]),
    ("api", "API reference: {resource}", ["Overview", "List", "Create", "Pagination", "Limits", "Errors"], [
        "GET /v1/{resource} returns up to {n} items per page, newest first.",
        "Pass the cursor from the previous response to fetch the next page.",
        "Each workspace can make {n} requests per minute; extra requests get a 429 response.",
        "Webhooks for {resource} change events arrive within {seconds} seconds of the change.",
        "The {field} field is optional and defaults to {default}.",
        "A 404 response means the item does not exist or is not shared with the caller's workspace.",
        "Dates are UTC timestamps, for example {year}-03-01T09:00:00Z.",
        "Sort order can be changed with the sort parameter; the {field} field is the most common choice.",
        "Batch endpoints accept up to {n} items and return one result per item, in the same order.",
    ]),
    ("mn", "Meeting notes: {team} weekly", ["Attendees", "Decisions", "Action items", "Open questions"], [
        "{person} will draft the plan for {feature} by {weekday}.",
        "We agreed to move {feature} to the {quarter} roadmap.",
        "{person} shared that {metric} improved by {pct}% since the last release.",
        "Open question: should {tier} plans include {feature}?",
        "{person} and {person2} will pair on the {component} work next week.",
        "We will revisit the {view} view redesign after the {month} launch.",
        "{person} asked for feedback on the {asset} before it goes to customers.",
        "No change to the release date; the {stage} stage is on track.",
    ]),
    ("st", "Style guide: {style_topic}", ["Principles", "Do", "Avoid", "Examples"], [
        "Write product names in sentence case, for example '{feature}'.",
        "Use {color} for primary buttons and keep headlines under {n} words.",
        "Customer quotes need written approval from the customer before we publish them.",
        "Screenshots should show the {view} view with sample content, never a real workspace.",
        "Prefer short sentences and plain words; avoid internal team names such as '{team} team'.",
        "Release posts open with what changed for the reader, then how to try it.",
    ]),
]

# One price per plan, so a sales guide never quotes two prices for the same plan.
PLAN_PRICE = {"Starter": 8, "Team": 12, "Business": 20, "Enterprise": 32}

_SLOT = re.compile(r"\{(\w+)\}")


def _fill(template: str, rng: random.Random, company: str) -> str:
    def pick(m: re.Match) -> str:
        name = m.group(1)
        if name == "company":
            return company
        if name == "feature_cap":
            f = rng.choice(POOLS["feature"])
            return f[0].upper() + f[1:]
        if name == "plan_price":
            tier = rng.choice(POOLS["tier"])
            return f"{tier} plan costs ${PLAN_PRICE[tier]}"
        if name == "person2":
            return rng.choice(POOLS["person"])
        if name in NUMBERS:
            return str(rng.choice(NUMBERS[name]))
        return rng.choice(POOLS[name])
    return _SLOT.sub(pick, template)


def kb_chars(kb: dict) -> int:
    """Text size of a knowledge base: every section heading and body."""
    return sum(len(s["heading"]) + len(s["text"]) for d in kb["docs"] for s in d["sections"])


def _distractor_stream(company: str, seed: int):
    """Endless, reproducible sequence of distractor docs. Larger scales extend smaller ones."""
    rng = random.Random(seed)
    counts: dict[str, int] = {}
    while True:
        prefix, title_t, headings, sentences = rng.choice(DOC_TYPES)
        counts[prefix] = counts.get(prefix, 0) + 1
        doc_id = f"{prefix}-{counts[prefix]:04d}"
        n_sections = rng.randint(3, len(headings))
        sections = []
        deck: list[str] = []  # deal sentences without replacement so a doc doesn't repeat itself
        for i, heading_t in enumerate(headings[:n_sections]):
            picked = []
            for _ in range(rng.randint(2, 4)):
                if not deck:
                    deck = [t for t in sentences if t not in picked]
                    rng.shuffle(deck)
                picked.append(deck.pop())
            body = " ".join(_fill(t, rng, company) for t in picked)
            sections.append({"id": f"{doc_id}-{i + 1}", "heading": _fill(heading_t, rng, company), "text": body})
        doc = {"id": doc_id, "title": _fill(title_t, rng, company), "sections": sections}
        for text in [doc["title"]] + [x for s in sections for x in (s["heading"], s["text"])]:
            m = _BANNED_RE.search(text)
            if m:
                raise ValueError(f"distractor {doc_id} mentions a control term {m.group(0)!r}: {text!r}")
        yield doc


def scale_kb(base: dict, scale: int, seed: int) -> dict:
    """Return a copy of base padded with distractor docs to about scale x its text size, docs shuffled."""
    target = kb_chars(base) * scale
    docs = [json.loads(json.dumps(d)) for d in base["docs"]]
    size = kb_chars(base)
    base_ids = {d["id"] for d in docs}
    for doc in _distractor_stream(base["name"].split()[0], seed):
        if size >= target:
            break
        assert doc["id"] not in base_ids
        docs.append(doc)
        size += sum(len(s["heading"]) + len(s["text"]) for s in doc["sections"])
    random.Random(seed * 1000 + scale).shuffle(docs)
    return {**base, "id": f"{base['id']}-x{scale}", "docs": docs}


def update_lock(lock_text: str, entries: dict[str, str]) -> str:
    """Add or replace "<sha256>  <file>" lines, keeping the existing order."""
    lines = [line.split() for line in lock_text.splitlines() if line.strip()]
    out = [(entries.pop(name, digest), name) for digest, name in lines]
    out += [(digest, name) for name, digest in entries.items()]
    return "".join(f"{d}  {n}\n" for d, n in out)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--kb", choices=sorted(STREAM_SEED), default="kestrelbyte")
    ap.add_argument("--scales", default="10,50,100")
    ap.add_argument("--freeze", action="store_true",
                    help="record the padded held-out files' hashes in eval/data/heldout.sha256 (tidemark only)")
    args = ap.parse_args()
    if args.freeze and args.kb != "tidemark":
        ap.error("--freeze is for the held-out knowledge base (--kb tidemark)")
    frozen: dict[str, str] = {}
    base = json.loads((SOURCE_DIR / f"{args.kb}.json").read_text())
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for scale in (int(s) for s in args.scales.split(",")):
        kb = scale_kb(base, scale, STREAM_SEED[args.kb])
        path = OUT_DIR / f"{kb['id']}.json"
        path.write_text(json.dumps(kb, ensure_ascii=False) + "\n")
        frozen[path.name] = hashlib.sha256(path.read_bytes()).hexdigest()
        n_sections = sum(len(d["sections"]) for d in kb["docs"])
        print(f"{path.relative_to(ROOT)}: {len(kb['docs'])} docs, {n_sections} sections, "
              f"{kb_chars(kb):,} chars ({kb_chars(kb) / kb_chars(base):.1f}x)")
    if args.freeze:
        lock = ROOT / "eval" / "data" / "heldout.sha256"
        lock.write_text(update_lock(lock.read_text(), frozen))
        print(f"froze {', '.join(sorted(frozen))} in {lock.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
