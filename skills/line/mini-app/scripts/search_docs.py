#!/usr/bin/env python3
"""
search_docs.py - Full-text search tool for Agent Skills

This script searches through the Markdown documentation files in the references/ directory.
It provides context-aware results, extracting relevant snippets around matched terms.
"""

import sys
import argparse
import re
import json
from pathlib import Path
from typing import List, Dict, Tuple

# ANSI colors for terminal output
class Colors:
    HEADER = '\033[95m'
    CYAN = '\033[96m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'

def extract_frontmatter(content: str) -> Tuple[Dict, str]:
    """
    Parse YAML frontmatter from Markdown content.
    
    Args:
        content: Raw file content
        
    Returns:
        Tuple of (frontmatter_dict, body_content)
    """
    frontmatter = {}
    body = content
    
    # Regex for YAML frontmatter
    match = re.match(r'^---\s*\n(.*?)\n---\s*\n(.*)', content, re.DOTALL)
    
    if match:
        frontmatter_str = match.group(1)
        body = match.group(2)
        
        # Simple YAML parsing (key: value)
        for line in frontmatter_str.split('\n'):
            if ':' in line:
                key, value = line.split(':', 1)
                frontmatter[key.strip()] = value.strip()
                
    return frontmatter, body

def _group_match_ranges(match_indices: List[int], max_gap: int) -> List[Tuple[int, int]]:
    """Group ordered match indices into inclusive start/end ranges."""
    ranges = []
    start = previous = match_indices[0]
    for index in match_indices[1:]:
        if index - previous > max_gap:
            ranges.append((start, previous))
            start = index
        previous = index
    ranges.append((start, previous))
    return ranges


def _matching_line_indices(lines: List[str], keywords: List[str]) -> List[int]:
    """Return indices of lines containing any literal keyword."""
    return [i for i, line in enumerate(lines)
            if any(keyword in line.lower() for keyword in keywords)]


def get_context(text: str, query: str, context_lines: int = 2) -> List[str]:
    """Find matching lines and return their surrounding context snippets."""
    lines = text.split('\n')
    keywords = query.lower().split()
    match_indices = _matching_line_indices(lines, keywords)
    if not match_indices:
        return []

    matched = set(match_indices)
    contexts = []
    max_gap = context_lines * 2 + 1
    for first_match, last_match in _group_match_ranges(match_indices, max_gap):
        start = max(0, first_match - context_lines)
        stop = min(len(lines), last_match + context_lines + 1)
        formatted = [
            f"{'>' if first_match <= index <= last_match and index in matched else ' '} {line}"
            for index, line in enumerate(lines[start:stop], start)
        ]
        contexts.append("\n".join(formatted))
    return contexts

def search_docs(skill_dir: Path, query: str, max_results: int = 10) -> List[Dict]:
    """
    Search documentation files.

    Args:
        skill_dir: Root directory of the skill
        query: Search term (space-separated for multiple keywords, OR logic)
        max_results: Maximum number of files to return

    Returns:
        List of result dictionaries
    """
    references_dir = skill_dir / "references"
    docs_dir = skill_dir / "docs"
    content_dir = references_dir if references_dir.exists() else docs_dir
    if not content_dir.exists():
        print(f"Error: {references_dir} (or {docs_dir}) not found.")
        return []

    keywords = query.lower().split()
    candidates = []

    # Walk through all markdown files in references/ (fallback to docs/)
    for file_path in content_dir.glob("**/*.md"):
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()

            frontmatter, body = extract_frontmatter(content)
            body_lower = body.lower()

            # Count matches for each keyword
            matches_count = sum(body_lower.count(kw) for kw in keywords)

            if matches_count > 0:
                candidates.append((matches_count, body, {
                    "file": str(file_path.relative_to(skill_dir)),
                    "matches": matches_count,
                    "source_url": frontmatter.get("source_url", "Unknown"),
                    "fetched_at": frontmatter.get("fetched_at", "Unknown")
                }))
        except Exception as e:
            print(f"Error reading {file_path}: {e}", file=sys.stderr)
                
    # Sort by number of matches (descending), then materialize selected contexts.
    candidates.sort(key=lambda candidate: candidate[0], reverse=True)
    candidates = candidates[:max_results]
    return [
        {**result, "contexts": get_context(body, query)}
        for _, body, result in candidates
    ]

def format_results(results: List[Dict], query: str):
    """Print results in a human-readable format."""
    if not results:
        print(f"No matches found for '{query}'.")
        return

    print(f"\n{Colors.HEADER}Search Results for '{query}'{Colors.ENDC}")
    print(f"Found matches in {len(results)} files.\n")
    
    for i, res in enumerate(results, 1):
        print(f"{Colors.BOLD}{i}. {res['file']}{Colors.ENDC}")
        print(f"   Matches: {res['matches']} | Source: {res['source_url']}")
        print(f"   Fetched: {res['fetched_at']}")
        print(f"{Colors.CYAN}{'-' * 40}{Colors.ENDC}")
        
        for ctx in res['contexts'][:3]: # Show max 3 contexts per file
            print(ctx)
            print("   ...")
        print("\n")

def format_json(results: List[Dict]):
    """Print results as JSON."""
    print(json.dumps(results, indent=2))

def main():
    parser = argparse.ArgumentParser(description="Search Agent Skill documentation.")
    parser.add_argument("query", help="Search query")
    parser.add_argument("--max-results", "-n", type=int, default=10, help="Maximum number of results")
    parser.add_argument("--json", action="store_true", help="Output as JSON")
    # Default: script's parent directory (scripts/../ = skill root)
    default_skill_dir = Path(__file__).resolve().parent.parent
    parser.add_argument("--skill-dir", default=str(default_skill_dir), help="Skill directory (default: auto-detected from script location)")

    args = parser.parse_args()

    skill_path = Path(args.skill_dir).resolve()

    results = search_docs(skill_path, args.query, args.max_results)
    
    if args.json:
        format_json(results)
    else:
        format_results(results, args.query)

if __name__ == "__main__":
    main()
