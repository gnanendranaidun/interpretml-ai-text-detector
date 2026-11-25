"""Check candidate paper URLs against titles in their primary records."""

from concurrent.futures import ThreadPoolExecutor
from html import unescape
import json
from pathlib import Path
import re
import unicodedata
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent


def normalize(text):
    plain = unicodedata.normalize("NFKD", unescape(text)).casefold()
    return re.sub(r"[^a-z0-9]", "", plain)


def check(candidate):
    number, title, url = candidate
    try:
        with urlopen(Request(url, headers={"User-Agent": "Mozilla/5.0"}), timeout=20) as response:
            html = response.read(2_000_000).decode("utf-8", errors="replace")
            page = response.geturl()
        matched = normalize(title) in normalize(html)
        return number, matched, page, title
    except OSError as error:
        return number, False, str(error), title


def main():
    survey = "\n".join((ROOT / "academic_report" / name).read_text(encoding="utf-8")
                       for name in ("literature_survey.md", "presentation_references.md"))
    entries = re.findall(
        r'^([0-9]+)\. \*\*(.*?) \((20[2-9][0-9])\)\. “([^”]+)”\s*(.*?)\*\* \[[^\]]+\]\((https://[^)]+)\)\. (.+)',
        survey, flags=re.MULTILINE,
    )
    entries = [entry for entry in entries if int(entry[2]) > 2020]
    alternatives = {"10": "https://arxiv.org/abs/2310.05130",
                    "26": "https://arxiv.org/abs/2202.01602"}
    candidates = [(number, title, alternatives.get(number, url))
                  for number, _, _, title, _, url, _ in entries]
    papers = []
    with ThreadPoolExecutor(max_workers=6) as executor:
        for entry, (number, matched, page, title) in zip(entries, executor.map(check, candidates)):
            print(f"{number}: {'title matched' if matched else 'review needed'} | {page} | {title}")
            if matched:
                _, authors, year, _, venue, url, relevance = entry
                papers.append(dict(title=title.rstrip("."), authors=authors, year=int(year),
                                   venue=venue.rstrip("."), url=alternatives.get(number, url),
                                   relevance=relevance))
    if len(papers) < 25:
        raise ValueError(f"Only {len(papers)} publication records matched")
    output = ROOT / "academic_report" / "presentation_references.json"
    output.write_text(json.dumps(sorted(papers, key=lambda p: -p["year"]),
                                 ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
