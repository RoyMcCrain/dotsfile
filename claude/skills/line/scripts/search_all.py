#!/usr/bin/env python3
"""
search_all.py - Search all LINE documentation (LIFF + Messaging API + LINE Login)
"""

import sys
from pathlib import Path

# Add parent to path to import search_docs
skill_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(skill_dir / "liff" / "scripts"))

from search_docs import search_docs, format_results, format_json
import argparse

def main():
    parser = argparse.ArgumentParser(description="Search all LINE documentation.")
    parser.add_argument("query", help="Search query")
    parser.add_argument("--max-results", "-n", type=int, default=10)
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    all_results = []

    # Search LIFF
    liff_results = search_docs(skill_dir / "liff", args.query, args.max_results)
    for r in liff_results:
        r["file"] = f"liff/{r['file']}"
    all_results.extend(liff_results)

    # Search Messaging API
    msg_results = search_docs(skill_dir / "messaging-api", args.query, args.max_results)
    for r in msg_results:
        r["file"] = f"messaging-api/{r['file']}"
    all_results.extend(msg_results)

    # Search LINE Login
    login_results = search_docs(skill_dir / "line-login", args.query, args.max_results)
    for r in login_results:
        r["file"] = f"line-login/{r['file']}"
    all_results.extend(login_results)

    # Sort by matches
    all_results.sort(key=lambda x: x["matches"], reverse=True)
    all_results = all_results[:args.max_results]

    if args.json:
        format_json(all_results)
    else:
        format_results(all_results, args.query)

if __name__ == "__main__":
    main()
