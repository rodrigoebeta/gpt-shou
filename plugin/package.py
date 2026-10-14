"""Build a skill update from the current Site plugin source returned by Plugin Creator."""
import copy
import json
from pathlib import Path
import re
import sys
import zipfile


def manifests(contents):
    legacy = json.loads(contents[".codex-plugin/plugin.json"]) if ".codex-plugin/plugin.json" in contents else None
    if "plugin.json" in contents:
        root = json.loads(contents["plugin.json"])
    else:
        if legacy is None:
            raise ValueError("Read the current plugin manifests first.")
        portable = {"name", "version", "description", "author", "homepage", "repository", "license", "keywords"}
        extension = {"interface", "apps", "hooks", "requires_local_executor", "publicationPolicy", "id"}
        if set(legacy) - portable - extension - {"extensions", "skills"}:
            raise ValueError("This manifest requires a reviewed conversion before packaging.")
        if legacy.get("skills") not in (None, "./skills", "./skills/"):
            raise ValueError("Preserve custom skill paths before packaging.")
        root = {key: copy.deepcopy(value) for key, value in legacy.items() if key in portable}
        root["$schema"] = "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json"
        root["extensions"] = copy.deepcopy(legacy.get("extensions", {}))
        client = root["extensions"].setdefault("com.openai", {})
        for key in extension & legacy.keys():
            if key in client and client[key] != legacy[key]:
                raise ValueError("Resolve conflicting manifest fields before packaging.")
            client[key] = copy.deepcopy(legacy[key])
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,63}", root["name"]):
        raise ValueError("Invalid plugin package name.")
    match = re.fullmatch(r"(\d+)\.(\d+)\.(\d+)", root["version"])
    if not match:
        raise ValueError("Use an explicitly reviewed semantic version.")
    major, minor, patch = map(int, match.groups())
    root["version"] = f"{major}.{minor}.{patch + 1}"
    result = {"plugin.json": json.dumps(root, ensure_ascii=False, indent=2) + "\n"}
    if legacy is not None:
        if legacy["name"] != root["name"]:
            raise ValueError("The manifest identities differ.")
        legacy["version"] = root["version"]
        result[".codex-plugin/plugin.json"] = json.dumps(legacy, ensure_ascii=False, indent=2) + "\n"
    # Omitted App, MCP, and asset files remain unchanged in the existing release.
    return root, result


def package(source, destination):
    data = json.loads(Path(source).read_text(encoding="utf-8-sig"))
    contents = data["contents"]
    root, output = manifests(contents)
    skills = Path(__file__).resolve().parent / "skills"
    with zipfile.ZipFile(destination, "x", compression=zipfile.ZIP_DEFLATED) as archive:
        for name, content in output.items():
            archive.writestr(root["name"] + "/" + name, content.encode("utf-8"))
        for path in sorted(skills.rglob("*")):
            if path.is_symlink():
                raise ValueError("Skill files must not be symbolic links.")
            if path.is_file():
                archive.write(path, root["name"] + "/skills/" + path.relative_to(skills).as_posix())
    return {"name": root["name"], "version": root["version"], "archive": str(Path(destination).resolve())}


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("Use: python plugin/package.py current-source.json update.zip")
    print(json.dumps(package(*sys.argv[1:])))

