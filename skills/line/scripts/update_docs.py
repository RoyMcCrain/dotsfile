#!/usr/bin/env python3
"""
update_docs.py - Fetch and update LINE API documentation

Usage:
    python update_docs.py              # Update all docs
    python update_docs.py --liff       # Update LIFF only
    python update_docs.py --messaging  # Update Messaging API only
    python update_docs.py --login      # Update LINE Login only
    python update_docs.py --mini-app   # Update Mini App only
"""

import os
import stat
import subprocess
import sys
import uuid
from pathlib import Path
from datetime import datetime

SKILL_DIR = Path(__file__).resolve().parent.parent

DOCS = {
    "liff": {
        "url": "https://developers.line.biz/ja/reference/liff/index.html.md",
        "output": SKILL_DIR / "liff/references/developers.line.biz/ja/reference/liff/index.md",
    },
    "messaging": {
        "url": "https://developers.line.biz/ja/reference/messaging-api/index.html.md",
        "output": SKILL_DIR / "messaging-api/references/developers.line.biz/ja/reference/messaging-api/index.md",
    },
    "login": {
        "url": "https://developers.line.biz/ja/reference/line-login/index.html.md",
        "output": SKILL_DIR / "line-login/references/developers.line.biz/ja/reference/line-login/index.md",
    },
    "mini-app": {
        "url": "https://developers.line.biz/ja/reference/line-mini-app/index.html.md",
        "output": SKILL_DIR / "mini-app/references/developers.line.biz/ja/reference/line-mini-app/index.md",
    },
}


def open_staging_file(output: Path):
    while True:
        candidate = output.parent / f".{output.name}.{uuid.uuid4().hex}.tmp"
        try:
            return candidate, candidate.open("x", encoding="utf-8")
        except FileExistsError:
            continue


def fetch_and_save(name: str, url: str, output: Path):
    """Fetch Markdown and save with frontmatter."""
    print(f"Fetching {name} from {url}...")

    today = datetime.now().strftime("%Y-%m-%d")
    source_url = url.replace("/index.html.md", "/")

    try:
        result = subprocess.run(
            ["curl", "-fsSL", url],
            capture_output=True,
            text=True,
            timeout=60
        )

        if result.returncode != 0:
            print(f"  curl error: {result.stderr}", file=sys.stderr)
            return False

        markdown = result.stdout

        content = f"""---
source_url: "{source_url}"
fetched_at: "{today}"
---

{markdown}
"""
        output.parent.mkdir(parents=True, exist_ok=True)
        existing_mode = stat.S_IMODE(output.stat().st_mode) if output.exists() else None
        temporary = None
        try:
            temporary, staged = open_staging_file(output)
            with staged:
                if existing_mode is not None:
                    os.chmod(temporary, existing_mode)
                staged.write(content)
                staged.flush()
                os.fsync(staged.fileno())
            os.replace(temporary, output)
        finally:
            if temporary is not None:
                temporary.unlink(missing_ok=True)
        print(f"  Saved to {output}")
        return True

    except subprocess.TimeoutExpired:
        print("  Timeout fetching URL", file=sys.stderr)
    except Exception as e:
        print(f"  Error: {e}", file=sys.stderr)

    return False


def selected_targets(args):
    targets = []
    if args.liff:
        targets.append("liff")
    if args.messaging:
        targets.append("messaging")
    if args.login:
        targets.append("login")
    if getattr(args, "mini_app", False):
        targets.append("mini-app")
    return targets or list(DOCS.keys())


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Update LINE API documentation")
    parser.add_argument("--liff", action="store_true", help="Update LIFF docs only")
    parser.add_argument("--messaging", action="store_true", help="Update Messaging API docs only")
    parser.add_argument("--login", action="store_true", help="Update LINE Login docs only")
    parser.add_argument("--mini-app", action="store_true", help="Update Mini App docs only")
    args = parser.parse_args()

    targets = selected_targets(args)

    success = 0
    for name in targets:
        doc = DOCS[name]
        if fetch_and_save(name, doc["url"], doc["output"]):
            success += 1

    print(f"\nUpdated {success}/{len(targets)} documents.")
    if success != len(targets):
        sys.exit(1)


if __name__ == "__main__":
    main()
