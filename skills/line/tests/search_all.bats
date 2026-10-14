#!/usr/bin/env bats

@test "search_all preserves source order, prefixes, ranking, and limit semantics" {
	python3 - "$BATS_TEST_DIRNAME/.." "$BATS_TEST_TMPDIR" <<'PY'
import json
import shutil
import subprocess
import sys
from pathlib import Path
source = Path(sys.argv[1]).resolve()
root = Path(sys.argv[2]) / "line"
skills = ("liff", "messaging-api", "line-login", "mini-app")
for skill in skills:
    (root / skill / "scripts").mkdir(parents=True)
    shutil.copy2(source / skill / "scripts/search_docs.py", root / skill / "scripts/search_docs.py")
    doc = root / skill / "references/result.md"
    doc.parent.mkdir(parents=True)
    matches = "needle needle needle" if skill == "line-login" else "needle needle"
    doc.write_text(f"---\nsource_url: fixture\nfetched_at: today\n---\n{matches}\n", encoding="utf-8")
(root / "scripts").mkdir()
shutil.copy2(source / "scripts/search_all.py", root / "scripts/search_all.py")
script = root / "scripts/search_all.py"
def query(*args, term="needle"):
    return json.loads(subprocess.check_output([sys.executable, str(script), term, "--json", *args], text=True))
rows = query()
assert [r["file"] for r in rows] == ["line-login/references/result.md", "liff/references/result.md", "messaging-api/references/result.md", "mini-app/references/result.md"]
assert [r["matches"] for r in rows] == [3, 2, 2, 2]
limited = query("-n", "2")
assert [r["file"] for r in limited] == ["line-login/references/result.md", "liff/references/result.md"]
assert [r["matches"] for r in limited] == [3, 2]
text = subprocess.check_output([sys.executable, str(script), "needle"], text=True)
assert all(f"{skill}/references/result.md" in text for skill in skills)
assert query("-n", "0") == []
assert query("-n", "-1") == []
assert query(term="absent") == []
PY
}
