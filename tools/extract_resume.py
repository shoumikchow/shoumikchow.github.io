#!/usr/bin/env -S uv run --quiet --script
# /// script
# requires-python = ">=3.12"
# dependencies = ["pypdf>=5"]
# ///
"""Extract the resume PDF from Google Drive into plain text for the /chat bot.

The bot builds its corpus from the site's own published text (see
worker/src/chat.ts). The resume lives in Drive rather than the repo, so this
writes a text twin next to the other pages and the worker picks it up as one
more URL. Running this outside the request path is deliberate: parsing a PDF in
the worker would need a ~1MB library and far more than the 10ms of CPU the
Workers free plan allows per request.

The contact header is stripped. The published site gives out hello@ only, and
the resume's phone number and personal Gmail appear nowhere in the repo; feeding
them to the bot would have it read both out to anyone who asks, scrapers
included. Everything else is kept verbatim.

Usage:
    uv run tools/extract_resume.py            # writes resume.txt
    uv run tools/extract_resume.py --check    # exit 1 if the file is stale
"""

from __future__ import annotations

import argparse
import re
import sys
import unicodedata
import urllib.request
from pathlib import Path

# The redirect target in resume.md. `uc?export=download` hands back the file
# itself; the /view URL in resume.md is an HTML viewer shell with no text in it.
FILE_ID = "1WgvgmY4Q5rUPikJFMj414nmmkcwT4TDQ"
PDF_URL = f"https://drive.google.com/uc?export=download&id={FILE_ID}"

OUTPUT = Path(__file__).resolve().parent.parent / "resume.txt"

# A short extraction means the PDF moved, Drive served an interstitial, or the
# file is image-only. Any of those should fail loudly rather than quietly
# blanking the bot's knowledge of the resume.
MIN_CHARS = 1500

PHONE = re.compile(r"\(?\b\d{3}\)?[\s.\-]\d{3}[\s.\-]\d{4}\b")
# Everything except the address the site actually publishes.
EMAIL = re.compile(r"\b[\w.%+-]+@(?!shoumikchow\.com\b)[\w.-]+\.\w+\b")


def fetch_pdf(url: str) -> bytes:
    """Download the resume PDF, failing loudly if Drive returns anything else."""
    request = urllib.request.Request(url, headers={"User-Agent": "shoumikchow-site"})
    with urllib.request.urlopen(request, timeout=60) as response:  # noqa: S310
        data = response.read()
    if not data.startswith(b"%PDF"):
        raise SystemExit(
            f"Drive did not return a PDF (got {len(data)} bytes starting "
            f"{data[:16]!r}). The share link or the download endpoint changed."
        )
    return data


def extract_text(pdf: bytes) -> str:
    """Pull the text layer out of the PDF, page by page."""
    from io import BytesIO

    from pypdf import PdfReader

    reader = PdfReader(BytesIO(pdf))
    return "\n".join(page.extract_text() or "" for page in reader.pages)


def clean(text: str) -> str:
    """Normalise typography and remove contact details the site does not publish."""
    # NFKC folds the PDF's ligatures back into plain letters. Without it the
    # corpus carries "classiﬁcation" and "ﬂare" as single exotic codepoints,
    # which tokenise badly and can surface verbatim in an answer.
    text = unicodedata.normalize("NFKC", text)

    text = PHONE.sub("", text)
    text = EMAIL.sub("", text)

    # Collapse the whitespace the removals leave behind, and cap blank runs at
    # one so the corpus stays compact.
    lines = [re.sub(r"[ \t]{2,}", " ", line).strip() for line in text.splitlines()]
    out: list[str] = []
    for line in lines:
        if line or (out and out[-1]):
            out.append(line)
    return "\n".join(out).strip() + "\n"


def build() -> str:
    """Fetch, extract, clean, and sanity-check the resume text."""
    text = clean(extract_text(fetch_pdf(PDF_URL)))

    if len(text) < MIN_CHARS:
        raise SystemExit(
            f"Extracted only {len(text)} chars (expected >= {MIN_CHARS}). "
            "The PDF is probably image-only or Drive served something else."
        )
    # Belt and braces: the whole point of the strip is that these never land in
    # the repo, so verify rather than trust the regexes.
    if PHONE.search(text) or EMAIL.search(text):
        raise SystemExit("Contact details survived the strip; refusing to write.")
    return text


def main() -> int:
    """Write resume.txt, or check it is current."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--check",
        action="store_true",
        help="exit 1 if resume.txt differs from the PDF, without writing",
    )
    args = parser.parse_args()

    text = build()
    current = OUTPUT.read_text(encoding="utf-8") if OUTPUT.exists() else None

    if args.check:
        if text != current:
            print(f"{OUTPUT.name} is out of date with the PDF")
            return 1
        print(f"{OUTPUT.name} is current")
        return 0

    if text == current:
        print(f"{OUTPUT.name} unchanged ({len(text)} chars)")
        return 0

    OUTPUT.write_text(text, encoding="utf-8")
    print(f"wrote {OUTPUT.name} ({len(text)} chars)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
