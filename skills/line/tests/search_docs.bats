#!/usr/bin/env bats

@test "standalone documentation search scripts rank and materialize only selected contexts" {
	python3 - "$BATS_TEST_DIRNAME/../../.." "$BATS_TEST_TMPDIR" <<'PY'
import importlib.util
import json
import shutil
import subprocess
import sys
from pathlib import Path
from unittest.mock import patch

repo = Path(sys.argv[1]).resolve()
tmp = Path(sys.argv[2])
paths = [
    repo / "skills/line/liff/scripts/search_docs.py",
    repo / "skills/line/line-login/scripts/search_docs.py",
    repo / "skills/line/messaging-api/scripts/search_docs.py",
    repo / "skills/line/mini-app/scripts/search_docs.py",
    repo / "skills/jj/scripts/search_docs.py",
]

def write_doc(directory, name, body):
    path = directory / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(f"---\nsource_url: fixture\nfetched_at: today\n---\n{body}", encoding="utf-8")

for index, script in enumerate(paths):
    # Isolate each standalone copy and exercise its __file__-derived default root.
    isolated = tmp / f"skill-{index}"
    (isolated / "scripts").mkdir(parents=True)
    shutil.copy2(script, isolated / "scripts/search_docs.py")
    write_doc(isolated / "references", "top.md", "needle needle\nTop context")
    write_doc(isolated / "references", "tie-a.md", "needle\nTie A")
    write_doc(isolated / "references", "tie-b.md", "needle\nTie B")
    write_doc(isolated / "references", "discard.md", "needle\nDiscard")
    output = subprocess.check_output([sys.executable, str(isolated / "scripts/search_docs.py"), "NEEDLE", "--json", "-n", "3"], text=True)
    rows = json.loads(output)
    expected_context = {
        "top.md": ["> needle needle\n  Top context"],
        "tie-a.md": ["> needle\n  Tie A"],
        "tie-b.md": ["> needle\n  Tie B"],
        "discard.md": ["> needle\n  Discard"],
    }
    def validate_cli_rows(results):
        assert results[0]["file"] == "references/top.md" and results[0]["matches"] == 2
        assert [row["matches"] for row in results] == [2, 1, 1]
        assert len({row["file"] for row in results}) == len(results)
        assert all(row["file"] in {"references/top.md", "references/tie-a.md", "references/tie-b.md", "references/discard.md"} for row in results)
        assert all(row["source_url"] == "fixture" and row["fetched_at"] == "today" for row in results)
        assert all(row["contexts"] == expected_context[Path(row["file"]).name] for row in results)

    validate_cli_rows(rows)
    explicit = json.loads(subprocess.check_output([sys.executable, str(script), "NEEDLE", "--json", "-n", "3", "--skill-dir", str(isolated)], text=True))
    validate_cli_rows(explicit)

    # A controlled glob order verifies Python's stable tie handling without assuming filesystem order.
    controlled_order = [
        isolated / "references/tie-b.md",
        isolated / "references/top.md",
        isolated / "references/tie-a.md",
        isolated / "references/discard.md",
    ]
    spec = importlib.util.spec_from_file_location(f"search_docs_{index}", isolated / "scripts/search_docs.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    context_cases = [
        (
            "merge at threshold and split one beyond, with OR keywords",
            "start\nMiXeD\nx\nx\nOTHER\nx\nx\nx\nthird\nend",
            "mixed other third",
            1,
            ["  start\n> MiXeD\n  x\n  x\n> OTHER\n  x", "  x\n> third\n  end"],
        ),
        ("clip at boundaries and retain terminal newline", "hit\nend\n", "HIT", 2, ["> hit\n  end\n  "]),
        ("zero context separates matches", "Hit\nx\nOTHER\nx\nhit", "hit other", 0, ["> Hit", "> OTHER", "> hit"]),
        ("negative context preserves group-local highlighting", "hit\nhit\nhit\n", "hit", -2, ["  hit", "", ""]),
        ("no match returns no snippets", "nothing here", "absent", 1, []),
    ]
    for name, text, query, context_lines, expected in context_cases:
        assert module.get_context(text, query, context_lines) == expected, name

    with patch.object(Path, "glob", return_value=controlled_order):
        module_results = module.search_docs(isolated, "needle", 3)
    assert [row["file"] for row in module_results] == ["references/top.md", "references/tie-b.md", "references/tie-a.md"]

    # Spy narrowly on context generation after the controlled enumeration is restored.
    calls = []
    original = module.get_context
    module.get_context = lambda body, query: (calls.append(body) or original(body, query))
    assert len(module.search_docs(isolated, "needle", 1)) == 1
    assert len(calls) == 1

    # Each standalone entrypoint falls back to docs/ and reports a missing corpus consistently.
    fallback = tmp / f"fallback-{index}"
    write_doc(fallback / "docs", "only-doc.md", "needle in docs")
    fallback_rows = json.loads(subprocess.check_output([sys.executable, str(isolated / "scripts/search_docs.py"), "needle", "--json", "--skill-dir", str(fallback)], text=True))
    assert len(fallback_rows) == 1
    assert fallback_rows[0]["file"] == "docs/only-doc.md" and fallback_rows[0]["matches"] == 1
    assert fallback_rows[0]["contexts"] == ["> needle in docs"]
    missing = (tmp / f"missing-{index}").resolve()
    missing_output = subprocess.check_output([sys.executable, str(isolated / "scripts/search_docs.py"), "needle", "--json", "--skill-dir", str(missing)], text=True)
    assert missing_output.splitlines() == [f"Error: {missing / 'references'} (or {missing / 'docs'}) not found.", "[]"]

    for limit, expected in [(0, 0), (-1, 3), (1, 1)]:
        cli = json.loads(subprocess.check_output([sys.executable, str(isolated / "scripts/search_docs.py"), "needle", "--json", "-n", str(limit)], text=True))
        assert len(cli) == expected
    assert json.loads(subprocess.check_output([sys.executable, str(isolated / "scripts/search_docs.py"), "absent", "--json"], text=True)) == []
PY
}
