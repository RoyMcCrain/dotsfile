#!/usr/bin/env python3
"""
update_docs.py - Update jj documentation using site2skill

Usage:
    python update_docs.py
"""

import subprocess
import sys
import shutil
from pathlib import Path
from datetime import datetime

SKILL_DIR = Path(__file__).resolve().parent.parent
SITE_URL = "https://www.jj-vcs.dev/latest/"


def main():
    print(f"Updating jj docs from {SITE_URL}...")
    print("Using site2skill to fetch and convert documentation.\n")

    # Create temp output directory
    tmp_dir = SKILL_DIR / ".tmp_update"
    tmp_dir.mkdir(exist_ok=True)

    try:
        result = subprocess.run(
            [
                "uvx", "--from", "git+https://github.com/laiso/site2skill",
                "site2skill", SITE_URL, "jj",
                "-o", str(tmp_dir),
                "--target", "claude"
            ],
            capture_output=True,
            text=True,
            timeout=300
        )

        if result.returncode != 0:
            print(f"Error: {result.stderr}", file=sys.stderr)
            return False

        print(result.stdout)

        # Replace references directory
        new_refs = tmp_dir / "jj" / "references"
        if new_refs.exists():
            old_refs = SKILL_DIR / "references"
            if old_refs.exists():
                shutil.rmtree(old_refs)
            shutil.move(str(new_refs), str(old_refs))
            print(f"\nUpdated references directory.")
            print(f"Fetched at: {datetime.now().strftime('%Y-%m-%d')}")
            return True
        else:
            print("Error: No references generated", file=sys.stderr)
            return False

    except FileNotFoundError:
        print("Error: uvx not found. Install uv first:", file=sys.stderr)
        print("  curl -LsSf https://astral.sh/uv/install.sh | sh", file=sys.stderr)
        return False
    except subprocess.TimeoutExpired:
        print("Error: Timeout", file=sys.stderr)
        return False
    finally:
        if tmp_dir.exists():
            shutil.rmtree(tmp_dir)


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
