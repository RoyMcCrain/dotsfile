#!/usr/bin/env bats

@test "LINE updater rejects HTTP errors and preserves existing bytes" {
	python3 -B - "$BATS_TEST_DIRNAME/.." "$BATS_TEST_TMPDIR" <<'PY'
import http.server
import importlib.util
import os
import subprocess
import sys
import threading
from pathlib import Path
from unittest.mock import patch

script = Path(sys.argv[1]).resolve() / "scripts/update_docs.py"
tmp = Path(sys.argv[2])
requested_paths = []
fixture_markdown = b"# Known local fixture\n\nHTTP success control.\n"
class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        requested_paths.append(self.path)
        status = int(self.path[1:])
        self.send_response(status)
        self.end_headers()
        self.wfile.write(fixture_markdown if status == 200 else b"error page")
    def log_message(self, *args):
        pass
server = http.server.HTTPServer(("127.0.0.1", 0), Handler)
thread = threading.Thread(target=server.serve_forever, daemon=True)
thread.start()
try:
    output = tmp / "old.md"
    output.write_bytes(b"last good document")
    successful_output = tmp / "success.md"
    env = {"PATH": os.environ["PATH"], "HOME": str(tmp), "CURL_HOME": str(tmp), "NO_PROXY": "*", "no_proxy": "*"}
    spec = importlib.util.spec_from_file_location("updater", script)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    with patch.dict(os.environ, env, clear=True):
        for status in (404, 500):
            assert module.fetch_and_save("fixture", f"http://127.0.0.1:{server.server_port}/{status}", output) is False
            assert output.read_bytes() == b"last good document"
        assert module.fetch_and_save("fixture", f"http://127.0.0.1:{server.server_port}/200", successful_output)
        published = successful_output.read_bytes()
        assert published.endswith(b"\n" + fixture_markdown + b"\n")
    assert {"/200", "/404", "/500"}.issubset(requested_paths)
    assert sorted(p.name for p in tmp.iterdir()) == ["old.md", "success.md"]
finally:
    server.shutdown()
    thread.join()
    server.server_close()
PY
}

@test "LINE updater atomically publishes successful content and preserves old bytes on publish failure" {
	python3 -B - "$BATS_TEST_DIRNAME/.." "$BATS_TEST_TMPDIR" <<'PY'
import importlib.util
import subprocess
import sys
from pathlib import Path
from unittest.mock import Mock, patch
script = Path(sys.argv[1]).resolve() / "scripts/update_docs.py"
tmp = Path(sys.argv[2])
spec = importlib.util.spec_from_file_location("updater", script)
module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
out = tmp / "doc.md"; out.write_bytes(b"old")
with patch.object(subprocess, "run", return_value=subprocess.CompletedProcess([], 0, "new", "")):
    assert module.fetch_and_save("fixture", "https://example.invalid/index.html.md", out)
assert b"source_url: \"https://example.invalid/\"" in out.read_bytes()
assert out.read_bytes().endswith(b"new\n")
out.write_bytes(b"preserve"); out.chmod(0o604)
real_replace = module.os.replace
def fail_at_destination(src, dst):
    if Path(dst) == out: raise OSError("injected publish failure")
    return real_replace(src, dst)
with patch.object(subprocess, "run", return_value=subprocess.CompletedProcess([], 0, "bad", "")), patch.object(module.os, "replace", side_effect=fail_at_destination):
    assert not module.fetch_and_save("fixture", "https://example.invalid/index.html.md", out)
assert out.read_bytes() == b"preserve"
assert out.stat().st_mode & 0o777 == 0o604
assert list(tmp.iterdir()) == [out]
failed_fetch = Mock(return_value=False)
with patch.object(module, "fetch_and_save", failed_fetch), patch.object(sys, "argv", [str(script), "--liff"]):
    try:
        module.main()
        raise AssertionError("failed update returned success")
    except SystemExit as error:
        assert error.code == 1
assert failed_fetch.called
successful_fetch = Mock(return_value=True)
with patch.object(module, "fetch_and_save", successful_fetch), patch.object(sys, "argv", [str(script), "--liff"]):
    try:
        module.main()
    except SystemExit as error:
        assert error.code in (None, 0)
assert successful_fetch.called
PY
}

@test "LINE updater preserves existing mode and respects umask for new documents" {
	python3 -B - "$BATS_TEST_DIRNAME/.." "$BATS_TEST_TMPDIR" <<'PY'
import importlib.util
import os
import subprocess
import sys
from pathlib import Path
from unittest.mock import patch
script = Path(sys.argv[1]).resolve() / "scripts/update_docs.py"
tmp = Path(sys.argv[2])
spec = importlib.util.spec_from_file_location("updater_modes", script)
module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
response = subprocess.CompletedProcess([], 0, "new", "")
existing = tmp / "existing.md"; existing.write_bytes(b"old"); existing.chmod(0o640)
with patch.object(subprocess, "run", return_value=response):
    assert module.fetch_and_save("fixture", "https://example.invalid/index.html.md", existing)
assert existing.stat().st_mode & 0o777 == 0o640
new = tmp / "new.md"
previous = os.umask(0o027)
try:
    with patch.object(subprocess, "run", return_value=response):
        assert module.fetch_and_save("fixture", "https://example.invalid/index.html.md", new)
    assert new.stat().st_mode & 0o777 == 0o640
    new.unlink()
    os.umask(0o077)
    with patch.object(subprocess, "run", return_value=response):
        assert module.fetch_and_save("fixture", "https://example.invalid/index.html.md", new)
    assert new.stat().st_mode & 0o777 == 0o600
finally:
    os.umask(previous)
PY
}
