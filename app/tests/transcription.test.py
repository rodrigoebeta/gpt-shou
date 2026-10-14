"""Check validation without installing packages or analyzing media."""
import importlib.util
import contextlib
import io
import json
from pathlib import Path
import subprocess
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("probe", Path(__file__).resolve().parents[1] / "runtime" / "transcribe.py")
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)


class ProbeTests(unittest.TestCase):
    def test_telemetry_is_disabled_before_speech_engine_import(self):
        import builtins
        calls = []
        engine = object()
        real_import = builtins.__import__
        def fake_import(name, *args, **kwargs):
            if name == "onnxruntime":
                self.assertEqual(probe.os.environ.get("ORT_DISABLE_TELEMETRY"), "1")
                return SimpleNamespace(disable_telemetry_events=lambda: calls.append("disabled"))
            if name == "faster_whisper":
                self.assertEqual(calls, ["disabled"])
                return SimpleNamespace(WhisperModel=engine)
            return real_import(name, *args, **kwargs)
        with patch.dict(probe.os.environ, {"ORT_DISABLE_TELEMETRY": "0"}), patch("builtins.__import__", side_effect=fake_import):
            self.assertIs(probe.speech_engine(), engine)

    def test_pcm_decoder_uses_binary_output_without_a_shell(self):
        pcm = b"\x00\x00\xff\x7f\x00\x80"
        with patch.object(probe.subprocess, "run", return_value=SimpleNamespace(stdout=pcm)) as run:
            self.assertEqual(probe.decode_pcm(Path("clip name.mp4"), Path("workspace"), {}), pcm)
        args, options = run.call_args
        self.assertIn("clip name.mp4", args[0])
        self.assertNotIn("shell", options)
        self.assertNotIn("text", options)
        self.assertTrue(options["check"])
        self.assertEqual(options["timeout"], 60)

    def test_pcm_decoder_rejects_empty_partial_and_overlong_output(self):
        for pcm in [b"", b"\x00", b"\x00\x00" * (600 * 16000 + 1)]:
            with self.subTest(length=len(pcm)):
                with patch.object(probe.subprocess, "run", return_value=SimpleNamespace(stdout=pcm)):
                    with self.assertRaises(ValueError):
                        probe.decode_pcm(Path("clip.mp4"), Path("workspace"), {})

    def test_pcm_decoder_failure_stops_before_transcription(self):
        error = subprocess.CalledProcessError(1, ["ffmpeg"], output=b"", stderr=b"private stderr")
        with patch.object(probe.subprocess, "run", side_effect=error):
            with contextlib.redirect_stdout(io.StringIO()) as output:
                with self.assertRaises(SystemExit):
                    probe.stage("asr_audio_decode", lambda: probe.decode_pcm(Path("clip.mp4"), Path("workspace"), {}))
        self.assertEqual(json.loads(output.getvalue().splitlines()[-1])["stage"], "asr_audio_decode")
        self.assertNotIn("private", output.getvalue())

    def test_terminated_child_keeps_last_started_stage(self):
        child = subprocess.CalledProcessError(-9, ["cmd"], output='{"stage":"asr_model_load","status":"started"}\n', stderr="secret")
        value = probe.safe_diagnostics(child)
        self.assertEqual(value["failed_stage"], "asr_model_load")
        self.assertNotIn("secret", json.dumps(value))

    def test_original_class_and_location_survive_child_capture_without_data(self):
        namespace = {"__name__": "__main__"}
        exec(compile("def fail():\n raise KeyError('secret-caption-and-cookie')\n", "/private/path/secret.py", "exec"), namespace)
        try:
            namespace["fail"]()
        except KeyError as error:
            diagnostics = probe.safe_diagnostics(error)
        child = subprocess.CalledProcessError(1, ["cmd"], output=json.dumps({"stage": "asr_metadata", "diagnostics": diagnostics}))
        value = probe.safe_diagnostics(child)
        self.assertIn("KeyError", value["error_types"])
        self.assertEqual(value["failed_stage"], "asr_metadata")
        location = next(item for item in value["exception_locations"] if item["type"] == "KeyError")
        self.assertIn({"module": "__main__", "function": "fail", "line": 2}, location["frames"])
        self.assertNotIn("secret", json.dumps(value))
        self.assertNotIn("private", json.dumps(value))

    def test_unlisted_package_exception_keeps_its_class(self):
        exception = type("DecoderSpecificError", (Exception,), {"__module__": "av.error"})
        value = probe.safe_diagnostics(exception("secret raw message"))
        self.assertEqual(value["exception_locations"], [{"module": "av.error", "type": "DecoderSpecificError", "frames": []}])
        self.assertNotIn("secret", json.dumps(value))

    def test_child_locations_filter_extra_fields_and_malformed_identifiers(self):
        location = {"module": "av.error", "type": "InvalidDataError", "message": "secret", "frames": [
            {"module": "faster_whisper.audio", "function": "decode_audio", "line": 12, "locals": "secret"},
            {"module": "av.error", "function": {}, "line": 5},
            {"module": "av.error", "function": "secret?token=secret", "line": 5},
            {"module": "av.error", "function": "decode", "line": True}]}
        child = subprocess.CalledProcessError(1, ["cmd"], output=json.dumps({"stage": {}, "diagnostics": {"failed_stage": [], "exception_locations": [location, {"module": "private.secret", "type": "Secret"}]}}))
        value = probe.safe_diagnostics(child)
        self.assertIsNone(value["failed_stage"])
        self.assertEqual(value["exception_locations"][-1]["frames"], [{"module": "faster_whisper.audio", "function": "decode_audio", "line": 12}])
        self.assertNotIn("secret", json.dumps(value).lower())

    def test_successful_child_output_accepts_stage_lines_before_result(self):
        stdout = '\n'.join(['secret raw output', json.dumps({"stage": "asr_model_load", "status": "passed", "private": "secret"}), json.dumps({"stage": [], "status": {}}), json.dumps({"ok": True, "transcription": "Hello."})])
        with contextlib.redirect_stdout(io.StringIO()) as output:
            value = probe.child_transcription_output(stdout)
        self.assertEqual(value["transcription"], "Hello.")
        self.assertEqual(json.loads(output.getvalue()), {"stage": "asr_model_load", "status": "passed"})
        self.assertNotIn("secret", output.getvalue())
        with self.assertRaises(ValueError):
            probe.child_transcription_output('{"ok":false}')

    def test_download_client_version_is_validated_before_model(self):
        valid = {"faster-whisper": probe.VERSION, "huggingface-hub": probe.HUB_VERSION, "requests": probe.REQUESTS_VERSION}
        probe.validate_versions(valid)
        with self.assertRaises(ValueError):
            probe.validate_versions({**valid, "huggingface-hub": "2.2.0"})
        with self.assertRaises(ValueError):
            probe.validate_versions({**valid, "requests": None})

    def test_transport_module_name_survives_child_error(self):
        error = ModuleNotFoundError("No module named 'socksio'", name="socksio")
        value = probe.safe_diagnostics(error)
        self.assertEqual(value["missing_modules"], ["socksio"])
        child = subprocess.CalledProcessError(1, ["cmd"], output=json.dumps({"diagnostics": value}))
        self.assertEqual(probe.safe_diagnostics(child)["missing_modules"], ["socksio"])
        error.name = "httpx2._transports"
        self.assertEqual(probe.safe_diagnostics(error)["missing_modules"], ["httpx2._transports"])

    def test_native_download_error_extracts_only_safe_status_and_host(self):
        error = RuntimeError('CAS service error: HTTP status client error (401 Unauthorized), url: https://cas-server.xethub.hf.co/reconstruction/private?Signature=secret')
        value = probe.safe_diagnostics(error)
        self.assertEqual(value["http_statuses"], [401])
        self.assertEqual(value["public_hosts"], ["cas-server.xethub.hf.co"])
        self.assertEqual(value["error_codes"], ["XET_ERROR"])
        self.assertNotIn("private", json.dumps(value))
        self.assertNotIn("secret", json.dumps(value))

    def test_http_diagnostics_omit_secrets_and_signed_urls(self):
        error = RuntimeError("token=secret; https://alice:password@private.invalid/path?signature=secret")
        error.response = SimpleNamespace(status_code=403, request=SimpleNamespace(url="https://cas-bridge.xethub.hf.co/private-path?Signature=secret"))
        value = probe.safe_diagnostics(error)
        self.assertEqual(value["http_statuses"], [403])
        self.assertEqual(value["public_hosts"], ["cas-bridge.xethub.hf.co"])
        encoded = json.dumps(value)
        for word in ["secret", "password", "private-path", "Signature"]:
            self.assertNotIn(word, encoded)

    def test_exception_chain_and_child_diagnostic_survive_capture(self):
        error = RuntimeError("model download failed")
        error.__cause__ = ConnectionError("getaddrinfo: temporary failure in name resolution")
        diagnostic = probe.safe_diagnostics(error)
        self.assertEqual(diagnostic["error_codes"], ["DNS_FAILED"])
        diagnostic["failed_file"] = "config.json"
        child = subprocess.CalledProcessError(1, ["private-command"], output=json.dumps({"diagnostics": diagnostic}), stderr="secret raw stderr")
        with contextlib.redirect_stdout(io.StringIO()) as output:
            with self.assertRaises(SystemExit):
                probe.stage("asr_model", lambda: (_ for _ in ()).throw(child))
        result = json.loads(output.getvalue().splitlines()[-1])
        self.assertEqual(result["diagnostics"]["error_codes"], ["DNS_FAILED"])
        self.assertEqual(result["diagnostics"]["failed_file"], "config.json")
        self.assertNotIn("secret", output.getvalue())
        self.assertNotIn("private-command", output.getvalue())

    def test_untrusted_child_diagnostics_are_filtered(self):
        child = subprocess.CalledProcessError(1, ["cmd"], output=json.dumps({"diagnostics": {"error_types": ["SecretToken"], "http_statuses": ["secret", 999, 401], "public_hosts": ["private.invalid", "https://huggingface.co/path?token=secret", "huggingface.co"], "error_codes": ["secret"], "failed_file": "../../secret"}}))
        value = probe.safe_diagnostics(child)
        self.assertEqual(value["http_statuses"], [401])
        self.assertEqual(value["public_hosts"], ["huggingface.co"])
        self.assertIsNone(value["failed_file"])
        self.assertNotIn("secret", json.dumps(value).lower())

    def test_malformed_child_fields_do_not_expose_raw_output(self):
        child = subprocess.CalledProcessError(1, ["cmd"], output=json.dumps({"diagnostics": {"error_types": None, "http_statuses": 403, "public_hosts": "secret", "error_codes": {}, "missing_modules": [None, {"private": "secret"}]}}), stderr="private stderr")
        value = probe.safe_diagnostics(child)
        self.assertEqual(value["error_types"], ["CalledProcessError"])
        self.assertEqual(value["http_statuses"], [])
        self.assertNotIn("private", json.dumps(value))

    def test_duration_and_audio_validation(self):
        valid = {"format": {"duration": "15.206"}, "streams": [{"codec_type": "audio"}]}
        self.assertEqual(probe.media_metadata(valid), 15.206)
        for value in ["nan", "inf", "0", "601"]:
            with self.assertRaises(ValueError):
                probe.media_metadata({**valid, "format": {"duration": value}})
        self.assertEqual(probe.media_metadata({**valid, "streams": [{"codec_type": "video"}]}), 15.206)
        for streams in [None, [], [{}], [None], [{"codec_type": "subtitle"}]]:
            with self.assertRaises(ValueError):
                probe.media_metadata({**valid, "streams": streams})

    def test_verified_video_without_audio_needs_no_speech_engine(self):
        # Synthetic bytes and mocked ffprobe; this test does not analyze media.
        cache = Path(__file__).resolve().parents[1] / ".cache"
        cache.mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(dir=cache) as directory:
            root = Path(directory)
            video = root / "synthetic.mp4"
            video.write_bytes(b"synthetic fixture")
            details = {"format": {"duration": "12"}, "streams": [{"codec_type": "video"}]}
            with patch.object(probe, "__file__", str(root / "transcribe.py")), patch.object(probe.sys, "argv", ["transcribe.py", str(video)]), patch.object(probe.platform, "system", return_value="Linux"), patch.object(probe.platform, "machine", return_value="x86_64"), patch.dict(probe.os.environ), patch.object(probe.subprocess, "run", return_value=SimpleNamespace(stdout=json.dumps(details))) as run, patch.object(probe, "speech_engine") as engine, contextlib.redirect_stdout(io.StringIO()) as output:
                probe.main()
            result = json.loads(output.getvalue().splitlines()[-1])
            self.assertEqual(result["availability"], "absent")
            self.assertEqual(result["transcription"], "")
            self.assertEqual(result["absence_evidence"], "no_audio_stream")
            self.assertEqual(result["media_sha256"], probe.hashlib.sha256(video.read_bytes()).hexdigest())
            self.assertEqual(result["duration_seconds"], 12)
            engine.assert_not_called()
            run.assert_called_once()
            self.assertEqual(run.call_args.args[0][0], "ffprobe")

    def test_empty_output_does_not_claim_absent_speech(self):
        info = SimpleNamespace(language="en", language_probability=0.9, duration=15.206)
        result = probe.speech_result([], info)
        self.assertIsNone(result["transcription"])
        self.assertEqual(result["availability"], "unavailable")
        self.assertFalse(result["speech_detected"])

    def test_original_speech_text_is_preserved(self):
        info = SimpleNamespace(language="pt", language_probability=0.98, duration=15.206)
        result = probe.speech_result([SimpleNamespace(text=" Olá, mundo. ")], info)
        self.assertEqual(result["transcription"], "Olá, mundo.")
        self.assertEqual(result["availability"], "observed")
        self.assertEqual(result["language"], "pt")

    def test_overlong_output_is_rejected(self):
        with self.assertRaises(ValueError):
            probe.speech_result([SimpleNamespace(text="a" * 16001)], SimpleNamespace())


if __name__ == "__main__":
    unittest.main()
