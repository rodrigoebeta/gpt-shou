"""Write the authenticated runtime archive offline, before dependency installation."""
import base64
import gzip
import hashlib
import io
import json
import pathlib
import sys

NAMES = {"package.json", "package-lock.json", "bootstrap.mjs", "acquire.mjs", "transcribe.py", "workflow.txt"}

def materialize(directory, encoded, expected_sha):
    archive = base64.b64decode(encoded, validate=True)
    if hashlib.sha256(archive).hexdigest() != expected_sha:
        raise ValueError("Runtime archive checksum mismatch")
    with gzip.GzipFile(fileobj=io.BytesIO(archive)) as source:
        data = source.read(1_048_577)
    if len(data) > 1_048_576:
        raise ValueError("Runtime archive is too large")
    payload = json.loads(data)
    files = payload["files"]
    manifest = payload["manifest"]
    if len(files) != len(NAMES) or {item["path"] for item in files} != NAMES:
        raise ValueError("Unexpected runtime files")
    expected = {item["path"]: item["sha256"] for item in manifest["files"]}
    if len(manifest["files"]) != len(NAMES) or set(expected) != NAMES:
        raise ValueError("Unexpected manifest files")
    verified = []
    for item in files:
        content = item["content"].encode("utf-8")
        digest = hashlib.sha256(content).hexdigest()
        if digest != item["sha256"] or digest != expected[item["path"]]:
            raise ValueError("Runtime file checksum mismatch")
        verified.append((item["path"], content))
    target = pathlib.Path(directory)
    if target.is_symlink() or (target.exists() and any(target.iterdir())):
        raise ValueError("Use a new empty runtime directory")
    target.mkdir(parents=True, exist_ok=True, mode=0o700)
    for name, content in verified:
        with (target / name).open("xb") as output:
            output.write(content)
    return {"ok": True, "runtime_version": manifest["runtime_version"], "files_verified": len(verified), "network_used": False}

if __name__ == "__main__":
    print(json.dumps(materialize(*sys.argv[1:4])))
