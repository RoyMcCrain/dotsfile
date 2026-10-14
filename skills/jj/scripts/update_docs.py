#!/usr/bin/env python3
"""
update_docs.py - Update jj documentation using site2skill

Usage:
    python update_docs.py
"""

import os
import subprocess
import sys
import shutil
import tempfile
import uuid
from pathlib import Path
from datetime import datetime
from typing import Optional

SKILL_DIR = Path(__file__).resolve().parent.parent
SITE_URL = "https://www.jj-vcs.dev/latest/"


def references_paths_valid(new_refs: Path, old_refs: Path):
    staging_root = new_refs.parent.parent
    if any(path.is_symlink() for path in (staging_root, new_refs.parent, new_refs)):
        print("Error: Symlink in generated staging path", file=sys.stderr)
        return False
    if not new_refs.is_dir():
        print("Error: No valid references directory generated", file=sys.stderr)
        return False
    if old_refs.is_symlink() or (old_refs.exists() and not old_refs.is_dir()):
        print(f"Error: Unexpected references path: {old_refs}", file=sys.stderr)
        return False
    return True


def publish_references(new_refs: Path, old_refs: Path, backup: Path):
    if not references_paths_valid(new_refs, old_refs):
        return False
    moved_old = False
    if old_refs.exists():
        try:
            os.replace(old_refs, backup)
        except OSError as error:
            print(
                f"Error moving existing references to backup at {backup}: {error}",
                file=sys.stderr,
            )
            return False
        moved_old = True
    if not replace_staged(new_refs, old_refs, backup if moved_old else None):
        return False
    if moved_old:
        cleanup_directory(backup, "references backup")
    print("\nUpdated references directory.")
    print(f"Fetched at: {datetime.now().strftime('%Y-%m-%d')}")
    return True


def cleanup_directory(path: Path, description: str):
    try:
        shutil.rmtree(path)
    except OSError as error:
        print(f"Warning: could not remove {description} at {path}: {error}", file=sys.stderr)


def replace_staged(new_refs: Path, old_refs: Path, backup: Optional[Path]):
    try:
        os.replace(new_refs, old_refs)
        return True
    except OSError as publish_error:
        if backup is not None:
            restore_references(backup, old_refs, publish_error)
        print(f"Error publishing references: {publish_error}", file=sys.stderr)
        return False


def restore_references(backup: Path, old_refs: Path, publish_error: OSError):
    try:
        os.replace(backup, old_refs)
        return True
    except OSError as restore_error:
        print(
            f"Error: publication failed ({publish_error}); restore failed ({restore_error}). "
            f"Last good references retained at {backup}",
            file=sys.stderr,
        )
        return False


def main():
    print(f"Updating jj docs from {SITE_URL}...")
    print("Using site2skill to fetch and convert documentation.\n")

    # Use uniquely-owned staging so pre-existing paths are never removed.
    tmp_dir = Path(tempfile.mkdtemp(prefix=".tmp_update-", dir=SKILL_DIR))
    old_refs = SKILL_DIR / "references"
    backup = SKILL_DIR / f".references-backup-{uuid.uuid4().hex}"

    try:
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
        except FileNotFoundError:
            print("Error: uvx not found. Install uv first:", file=sys.stderr)
            print("  curl -LsSf https://astral.sh/uv/install.sh | sh", file=sys.stderr)
            return False

        if result.returncode != 0:
            print(f"Error: {result.stderr}", file=sys.stderr)
            return False

        print(result.stdout)

        return publish_references(
            tmp_dir / "jj" / "references", old_refs, backup
        )

    except subprocess.TimeoutExpired:
        print("Error: Timeout", file=sys.stderr)
        return False
    finally:
        if tmp_dir.exists():
            cleanup_directory(tmp_dir, "staging directory")


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
