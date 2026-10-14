#!/usr/bin/env bats

@test "jj updater rejects intermediate and staging-root symlinks without moving external references" {
	python3 -B - "$BATS_TEST_DIRNAME/../scripts/update_docs.py" "$BATS_TEST_TMPDIR" <<'PY'
import importlib.util
import subprocess
import sys
from pathlib import Path
from unittest.mock import patch
script = Path(sys.argv[1]).resolve(); root = Path(sys.argv[2])
spec = importlib.util.spec_from_file_location("jj_symlink_updater", script)
module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
module.SKILL_DIR = root
old = root / "references"; old.mkdir(); (old / "old.md").write_bytes(b"last good")
external = root / "external"; external.mkdir(); (external / "sentinel").write_bytes(b"external bytes")
(external / "references").mkdir(); (external / "references/sentinel").write_bytes(b"external references bytes")
(external / "jj/references").mkdir(parents=True)
(external / "jj/references/sentinel").write_bytes(b"external staged references bytes")
def run_intermediate(*args, **kwargs):
    stage = Path(args[0][args[0].index("-o") + 1])
    (stage / "jj").symlink_to(external, target_is_directory=True)
    return subprocess.CompletedProcess(args[0], 0, "ok", "")
with patch.object(subprocess, "run", side_effect=run_intermediate):
    assert module.main() is False
def run_staging_root(*args, **kwargs):
    stage = Path(args[0][args[0].index("-o") + 1])
    held_stage = root / "held-stage"
    stage.rename(held_stage)
    stage.symlink_to(external, target_is_directory=True)
    return subprocess.CompletedProcess(args[0], 0, "ok", "")
with patch.object(subprocess, "run", side_effect=run_staging_root):
    assert module.main() is False
assert (old / "old.md").read_bytes() == b"last good"
assert (external / "sentinel").read_bytes() == b"external bytes"
assert (external / "references" / "sentinel").read_bytes() == b"external references bytes"
assert (external / "jj/references/sentinel").read_bytes() == b"external staged references bytes"
PY
}

@test "jj updater rejects nonzero fetch with partial staged output" {
	python3 -B - "$BATS_TEST_DIRNAME/../scripts/update_docs.py" "$BATS_TEST_TMPDIR" <<'PY'
import importlib.util
import subprocess
import sys
from pathlib import Path
from unittest.mock import patch
script = Path(sys.argv[1]).resolve(); root = Path(sys.argv[2])
spec = importlib.util.spec_from_file_location("jj_failed_fetch_updater", script)
module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
module.SKILL_DIR = root
refs = root / "references"; refs.mkdir(); (refs / "old.md").write_bytes(b"last good bytes")
def fail_after_partial_output(*args, **kwargs):
    stage = Path(args[0][args[0].index("-o") + 1])
    partial = stage / "jj/references"; partial.mkdir(parents=True)
    (partial / "partial.md").write_bytes(b"partial bytes")
    return subprocess.CompletedProcess(args[0], 1, "", "fetch failed")
with patch.object(subprocess, "run", side_effect=fail_after_partial_output):
    assert module.main() is False
assert (refs / "old.md").read_bytes() == b"last good bytes"
assert not list(root.glob(".references-backup-*"))
assert not list(root.glob(".tmp_update-*"))
PY
}

@test "jj updater publishes staged references and retains a pre-existing marker" {
	python3 -B - "$BATS_TEST_DIRNAME/../scripts/update_docs.py" "$BATS_TEST_TMPDIR" <<'PY'
import importlib.util
import subprocess
import sys
from pathlib import Path
from unittest.mock import patch
script = Path(sys.argv[1]).resolve(); root = Path(sys.argv[2])
spec = importlib.util.spec_from_file_location("jj_updater", script)
module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
module.SKILL_DIR = root
(root / "references").mkdir(); (root / "references/old.md").write_text("old")
marker = root / ".tmp_update"; marker.mkdir(); (marker / "keep").write_text("pre-existing")
def run(*args, **kwargs):
    stage = Path(args[0][args[0].index("-o") + 1])
    refs = stage / "jj/references"; refs.mkdir(parents=True); (refs / "new.md").write_text("new")
    return subprocess.CompletedProcess(args[0], 0, "ok", "")
with patch.object(subprocess, "run", side_effect=run):
    assert module.main()
assert not (root / "references/old.md").exists()
assert (root / "references/new.md").read_text() == "new"
assert (marker / "keep").read_text() == "pre-existing"
assert sorted(path.name for path in root.iterdir()) == [".tmp_update", "references"]
PY
}

@test "jj updater restores original references after publication failure" {
	python3 -B - "$BATS_TEST_DIRNAME/../scripts/update_docs.py" "$BATS_TEST_TMPDIR" <<'PY'
import contextlib
import importlib.util
import io
import os
import shutil
import subprocess
import sys
from pathlib import Path
from unittest.mock import patch
script = Path(sys.argv[1]).resolve(); root = Path(sys.argv[2])
spec = importlib.util.spec_from_file_location("jj_updater", script)
module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
module.SKILL_DIR = root
refs = root / "references"; refs.mkdir(); (refs / "original.md").write_bytes(b"original reference bytes")
def run(*args, **kwargs):
    stage = Path(args[0][args[0].index("-o") + 1])
    generated = stage / "jj/references"; generated.mkdir(parents=True)
    (generated / "new.md").write_text("new")
    return subprocess.CompletedProcess(args[0], 0, "ok", "")
def fail_stage_cleanup(path, *args, **kwargs):
    if Path(path).name.startswith(".tmp_update-"):
        raise OSError("injected stage cleanup failure")
    return real_rmtree(path, *args, **kwargs)
def generated_source(src):
    path = Path(src)
    return path.is_relative_to(root) and any(part.startswith(".tmp_update") for part in path.parts) and path.exists()
publication_failure_fired = False
def fail_publication(src, dst):
    global publication_failure_fired
    if Path(dst) == refs and generated_source(src):
        publication_failure_fired = True
        raise OSError("injected fixture publication failure")
    return real_replace(src, dst)
def fail_old_publication(src, dst):
    global publication_failure_fired
    if Path(dst) == refs and generated_source(src):
        publication_failure_fired = True
        raise OSError("injected fixture publication failure")
    return real_move(src, dst)
real_replace = os.replace
real_move = shutil.move
real_rmtree = shutil.rmtree
stderr = io.StringIO()
with patch.object(subprocess, "run", side_effect=run), \
     patch.object(os, "replace", side_effect=fail_publication), \
     patch.object(shutil, "move", side_effect=fail_old_publication), \
     patch.object(shutil, "rmtree", side_effect=fail_stage_cleanup), \
     contextlib.redirect_stderr(stderr):
    result = module.main()
assert result is False
assert "Warning" in stderr.getvalue()
assert "staging directory" in stderr.getvalue()
assert publication_failure_fired
assert sorted(path.name for path in refs.iterdir()) == ["original.md"]
assert (refs / "original.md").read_bytes() == b"original reference bytes"
PY
}

@test "jj updater retains backup if publication and restoration both fail" {
	python3 -B - "$BATS_TEST_DIRNAME/../scripts/update_docs.py" "$BATS_TEST_TMPDIR" <<'PY'
import importlib.util
import os
import subprocess
import sys
from pathlib import Path
from unittest.mock import patch
script = Path(sys.argv[1]).resolve(); root = Path(sys.argv[2])
spec = importlib.util.spec_from_file_location("jj_updater", script)
module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
module.SKILL_DIR = root
refs = root / "references"; refs.mkdir(); (refs / "old.md").write_text("last good")
def run(*args, **kwargs):
    stage = Path(args[0][args[0].index("-o") + 1])
    generated = stage / "jj/references"; generated.mkdir(parents=True); (generated / "new.md").write_text("new")
    return subprocess.CompletedProcess(args[0], 0, "ok", "")
real_replace = os.replace
def fail_live_destination(src, dst):
    source = Path(src)
    if Path(dst) == refs and (source.exists() and any(p.startswith(".tmp_update-") for p in source.parts) or source.name.startswith(".references-backup-")):
        raise OSError("injected rename failure")
    return real_replace(src, dst)
with patch.object(subprocess, "run", side_effect=run), patch.object(os, "replace", side_effect=fail_live_destination):
    assert not module.main()
backups = list(root.glob(".references-backup-*"))
assert len(backups) == 1
assert (backups[0] / "old.md").read_text() == "last good"
PY
}

@test "jj updater reports backup move failure without losing last-good references" {
	python3 -B - "$BATS_TEST_DIRNAME/../scripts/update_docs.py" "$BATS_TEST_TMPDIR" <<'PY'
import contextlib
import importlib.util
import io
import os
import subprocess
import sys
from pathlib import Path
from unittest.mock import patch
script = Path(sys.argv[1]).resolve(); root = Path(sys.argv[2])
spec = importlib.util.spec_from_file_location("jj_updater", script)
module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
module.SKILL_DIR = root
refs = root / "references"; refs.mkdir(); (refs / "old.md").write_bytes(b"last good bytes")
def run(*args, **kwargs):
    stage = Path(args[0][args[0].index("-o") + 1])
    generated = stage / "jj/references"; generated.mkdir(parents=True)
    (generated / "new.md").write_bytes(b"new bytes")
    return subprocess.CompletedProcess(args[0], 0, "ok", "")
real_replace = os.replace
def fail_backup_move(src, dst):
    if Path(src) == refs and Path(dst).name.startswith(".references-backup-"):
        raise FileNotFoundError("injected backup move failure")
    return real_replace(src, dst)
stderr = io.StringIO()
with patch.object(subprocess, "run", side_effect=run), patch.object(os, "replace", side_effect=fail_backup_move), contextlib.redirect_stderr(stderr):
    assert module.main() is False
assert (refs / "old.md").read_bytes() == b"last good bytes"
assert "backup" in stderr.getvalue().lower()
assert ".references-backup-" in stderr.getvalue()
assert "uvx not found" not in stderr.getvalue()
PY
}

@test "jj updater diagnoses uvx missing only when subprocess spawning fails" {
	python3 -B - "$BATS_TEST_DIRNAME/../scripts/update_docs.py" "$BATS_TEST_TMPDIR" <<'PY'
import contextlib
import importlib.util
import io
import subprocess
import sys
from pathlib import Path
from unittest.mock import patch
script = Path(sys.argv[1]).resolve(); root = Path(sys.argv[2])
spec = importlib.util.spec_from_file_location("jj_updater", script)
module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
module.SKILL_DIR = root
stderr = io.StringIO()
with patch.object(subprocess, "run", side_effect=FileNotFoundError("uvx")), contextlib.redirect_stderr(stderr):
    assert module.main() is False
assert "uvx not found" in stderr.getvalue()
assert not list(root.glob(".tmp_update-*"))
PY
}

@test "jj updater treats post-publication cleanup failures as warnings" {
	python3 -B - "$BATS_TEST_DIRNAME/../scripts/update_docs.py" "$BATS_TEST_TMPDIR" <<'PY'
import contextlib
import importlib.util
import io
import os
import shutil
import subprocess
import sys
from pathlib import Path
from unittest.mock import patch
script = Path(sys.argv[1]).resolve(); root = Path(sys.argv[2])
spec = importlib.util.spec_from_file_location("jj_updater", script)
module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
module.SKILL_DIR = root
refs = root / "references"; refs.mkdir(); (refs / "old.md").write_bytes(b"last good")
def run(*args, **kwargs):
    stage = Path(args[0][args[0].index("-o") + 1])
    generated = stage / "jj/references"; generated.mkdir(parents=True)
    (generated / "new.md").write_bytes(b"new")
    return subprocess.CompletedProcess(args[0], 0, "ok", "")
real_rmtree = shutil.rmtree
def fail_cleanup(path, *args, **kwargs):
    if Path(path).name.startswith((".references-backup-", ".tmp_update-")):
        raise OSError("injected cleanup failure")
    return real_rmtree(path, *args, **kwargs)
stderr = io.StringIO()
with patch.object(subprocess, "run", side_effect=run), patch.object(shutil, "rmtree", side_effect=fail_cleanup), contextlib.redirect_stderr(stderr):
    assert module.main() is True
assert (refs / "new.md").read_bytes() == b"new"
assert "Warning" in stderr.getvalue()
assert str(root / "references") not in stderr.getvalue()
assert "backup" in stderr.getvalue().lower()
assert ".tmp_update-" in stderr.getvalue()
PY
}
