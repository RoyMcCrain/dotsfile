#!/usr/bin/env python3
"""
search_all.py - Search all LINE documentation (LIFF + Messaging API + LINE Login + Mini App)
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
    skills = ("liff", "messaging-api", "line-login", "mini-app")
    for skill in skills:
        results = search_docs(skill_dir / skill, args.query, args.max_results)
        for result in results:
            result["file"] = f"{skill}/{result['file']}"
        all_results.extend(results)

    # Sort by matches
    all_results.sort(key=lambda x: x["matches"], reverse=True)
    all_results = all_results[:args.max_results]

    if args.json:
        format_json(all_results)
    else:
        format_results(all_results, args.query)

if __name__ == "__main__":
    main()
