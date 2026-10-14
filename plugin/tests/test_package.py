import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
import zipfile

spec = importlib.util.spec_from_file_location("package", Path(__file__).resolve().parents[1] / "package.py")
package = importlib.util.module_from_spec(spec)
spec.loader.exec_module(package)


class PackageTests(unittest.TestCase):
    def test_update_preserves_app_presentation_and_prompts(self):
        legacy = {"name": "fixture-plugin", "version": "1.2.3", "apps": "./.app.json", "interface": {"displayName": "Fixture", "defaultPrompt": ["One", "Two"], "capabilities": []}}
        contents = {".codex-plugin/plugin.json": json.dumps(legacy), ".app.json": '{"apps":{}}'}
        root, changed = package.manifests(contents)
        self.assertEqual(root["extensions"]["com.openai"]["interface"], legacy["interface"])
        self.assertEqual(root["extensions"]["com.openai"]["apps"], legacy["apps"])
        self.assertEqual(root["version"], "1.2.4")
        self.assertEqual(json.loads(changed[".codex-plugin/plugin.json"])["version"], root["version"])
        cache = Path(__file__).resolve().parents[2] / ".cache"
        cache.mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(dir=cache) as folder:
            source, target = Path(folder) / "source.json", Path(folder) / "update.zip"
            source.write_text(json.dumps({"contents": contents}), encoding="utf-8")
            package.package(source, target)
            with zipfile.ZipFile(target) as archive:
                names = archive.namelist()
                self.assertEqual(sum(name.endswith("/SKILL.md") for name in names), 5)
                self.assertNotIn("fixture-plugin/.app.json", names)
                self.assertIn("fixture-plugin/skills/agendar/references/prompt.txt", names)
            with self.assertRaises(FileExistsError):
                package.package(source, target)

    def test_unknown_fields_and_path_overrides_are_not_silently_lost(self):
        for extra in [{"unknown": True}, {"skills": "./custom"}, {"mcpServers": {"old": {}}}]:
            legacy = {"name": "fixture", "version": "1.0.0", **extra}
            with self.assertRaises(ValueError):
                package.manifests({".codex-plugin/plugin.json": json.dumps(legacy)})


if __name__ == "__main__":
    unittest.main()

