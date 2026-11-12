"""Prepare and test speech transcription only inside a remote Work task started through the ChatGPT mobile app."""
import hashlib
import io
import importlib.metadata
import json
import math
import os
from pathlib import Path
import platform
import re
import subprocess
import sys
import zipfile
from urllib.parse import urlsplit

MODEL = "Systran/faster-whisper-small"
REVISION = "536b0662742c02347bc0e980a01041f333bce120"
VERSION = "1.2.1"
HUB_VERSION = "0.34.4"
REQUESTS_VERSION = "2.32.5"
DEPENDENCIES = ["faster-whisper==" + VERSION, "huggingface-hub==" + HUB_VERSION, "requests[socks]==" + REQUESTS_VERSION]
MODEL_FILES = ["config.json", "tokenizer.json", "vocabulary.txt", "model.bin"]
SOUND_URL = "https://qaihub-public-assets.s3.us-west-2.amazonaws.com/qai-hub-models/models/yamnet/releases/v0.59.0/yamnet-onnx-float.zip"
SOUND_SHA256 = "bda628207418bc59b6a371aef6180b53367707eaf7b8b8a7c683417000d1eea4"
DIAGNOSTIC_MODULES = {"huggingface_hub", "hf_xet", "httpx", "httpx2", "httpcore", "httpcore2", "requests", "urllib3", "certifi", "socks", "socksio", "h2", "h11", "sniffio", "anyio", "truststore", "typing_extensions", "faster_whisper", "ctranslate2", "numpy", "av", "onnxruntime", "tokenizers", "brotli", "brotlicffi", "zstandard"}
ERROR_TYPES = {"CalledProcessError", "TimeoutExpired", "TimeoutError", "ModuleNotFoundError", "ImportError", "FileNotFoundError", "PermissionError", "OSError", "RuntimeError", "ValueError", "ConnectionError", "ProxyError", "SSLError", "SSLCertVerificationError", "ConnectError", "ReadTimeout", "ConnectTimeout", "RemoteProtocolError", "MaxRetryError", "HfHubHTTPError", "LocalEntryNotFoundError", "EntryNotFoundError", "RevisionNotFoundError", "RepositoryNotFoundError", "GatedRepoError", "HFValidationError", "OfflineModeIsEnabled", "gaierror"}
ERROR_CODES = {"DNS_FAILED", "TLS_CERTIFICATE", "CONNECTION_REFUSED", "NETWORK_TIMEOUT", "IMPORT_MISSING", "OUT_OF_MEMORY", "XET_ERROR"}
ERROR_TYPES |= {"KeyError", "AttributeError", "TypeError", "IndexError", "AssertionError", "NotImplementedError", "MemoryError", "JSONDecodeError", "InvalidDataError", "FFmpegError"}
ASR_STAGES = {"asr_ffprobe", "asr_metadata", "asr_engine_imports", "asr_model_load", "asr_audio_decode", "asr_transcribe", "asr_segments", "asr_media_hash", "asr_runtime"}
ASR_STAGES |= {"asr_sound_model", "asr_audio_classification", "asr_second_pass"}
DIAGNOSTIC_ROOTS = DIAGNOSTIC_MODULES | {"builtins", "subprocess", "json", "socket", "_ssl", "ctypes", "multiprocessing", "concurrent", "__main__"}


def code_name(value):
    return isinstance(value, str) and len(value) <= 100 and re.fullmatch(r"[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*", value, flags=re.ASCII) is not None


def exception_location(error):
    module, name = type(error).__module__, type(error).__name__
    if not code_name(module) or module.split(".")[0] not in DIAGNOSTIC_ROOTS or not code_name(name):
        return None
    frames = []
    frame = error.__traceback__
    while frame is not None:
        library = frame.tb_frame.f_globals.get("__name__", "")
        function = frame.tb_frame.f_code.co_name
        if code_name(library) and library.split(".")[0] in DIAGNOSTIC_ROOTS and (code_name(function) or function in {"<lambda>", "<module>"}):
            frames.append({"module": library, "function": function, "line": frame.tb_lineno})
        frame = frame.tb_next
    # Report code identifiers, never exception arguments, source text, paths, or locals.
    return {"module": module, "type": name, "frames": frames[-8:]}


def public_host(value):
    try:
        host = urlsplit(str(value)).hostname or ""
    except ValueError:
        return "other_host"
    if host == "huggingface.co" or host.endswith((".huggingface.co", ".hf.co")):
        return host
    return "other_host"


def safe_diagnostics(error):
    types, statuses, hosts, codes, modules = set(), set(), set(), set(), set()
    locations = []
    current, seen = error, set()
    for _ in range(8):
        if current is None or id(current) in seen:
            break
        seen.add(id(current))
        name = type(current).__name__
        types.add(name if name in ERROR_TYPES else "OtherError")
        location = exception_location(current)
        if location is not None:
            locations.append(location)
        response = getattr(current, "response", None)
        status = getattr(response, "status_code", None)
        if type(status) is int and 100 <= status <= 599:
            statuses.add(status)
        request = getattr(current, "request", None)
        if request is None:
            request = getattr(response, "request", None)
        url = getattr(request, "url", None)
        if url is not None:
            hosts.add(public_host(url))
        text = str(current).lower()
        for match in re.findall(r"\b(?:status(?:_code| code)?|http(?: status)?(?: error)?)[=: ]+([45]\d{2})\b|\b([45]\d{2})\s+(?:client|server)\s+error\b|\b(?:client|server)\s+error\s*[('\"]+([45]\d{2})\b", text):
            statuses.update(int(value) for value in match if value)
        for value in re.findall(r"https?://[^\s\"'<>()]+", text):
            host = public_host(value)
            if host != "other_host":
                hosts.add(host)
        for phrase, code in [("temporary failure in name resolution", "DNS_FAILED"), ("getaddrinfo", "DNS_FAILED"), ("certificate verify failed", "TLS_CERTIFICATE"), ("certificate_verify_failed", "TLS_CERTIFICATE"), ("invalid peer certificate", "TLS_CERTIFICATE"), ("unknownissuer", "TLS_CERTIFICATE"), ("connection refused", "CONNECTION_REFUSED"), ("timed out", "NETWORK_TIMEOUT"), ("timeout", "NETWORK_TIMEOUT"), ("no module named", "IMPORT_MISSING"), ("cannot allocate memory", "OUT_OF_MEMORY"), ("cas service error", "XET_ERROR")]:
            if phrase in text:
                codes.add(code)
        module = getattr(current, "name", None)
        if isinstance(module, str) and module.split(".")[0] in DIAGNOSTIC_MODULES and re.fullmatch(r"[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*", module) and len(module) <= 100:
            modules.add(module)
        current = current.__cause__ or current.__context__
    failed_file = None
    failed_stage = None
    # Read only the child's structured diagnostic, never its raw stderr.
    if isinstance(error, subprocess.CalledProcessError) and isinstance(error.stdout, str):
        for line in reversed(error.stdout.splitlines()):
            try:
                child = json.loads(line)
            except ValueError:
                continue
            if not isinstance(child, dict):
                continue
            if failed_stage is None and isinstance(child.get("stage"), str) and child["stage"] in ASR_STAGES and child.get("status") == "started":
                failed_stage = child["stage"]
            if not isinstance(child.get("diagnostics"), dict):
                continue
            value = child["diagnostics"]
            if isinstance(child.get("stage"), str) and child["stage"] in ASR_STAGES:
                failed_stage = child["stage"]
            values = lambda key: value.get(key) if isinstance(value.get(key), list) else []
            types.update(x for x in values("error_types") if isinstance(x, str) and x in ERROR_TYPES | {"OtherError"})
            statuses.update(x for x in values("http_statuses") if type(x) is int and 100 <= x <= 599)
            hosts.update(x for x in values("public_hosts") if isinstance(x, str) and (x == "other_host" or public_host("https://"+x) == x))
            codes.update(x for x in values("error_codes") if isinstance(x, str) and x in ERROR_CODES)
            modules.update(x for x in values("missing_modules") if isinstance(x, str) and x.split(".")[0] in DIAGNOSTIC_MODULES and re.fullmatch(r"[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*", x) and len(x) <= 100)
            if value.get("failed_file") in MODEL_FILES:
                failed_file = value["failed_file"]
            if isinstance(value.get("failed_stage"), str) and value["failed_stage"] in ASR_STAGES:
                failed_stage = value["failed_stage"]
            for entry in values("exception_locations")[:8]:
                if not isinstance(entry, dict) or not code_name(entry.get("module")) or entry["module"].split(".")[0] not in DIAGNOSTIC_ROOTS or not code_name(entry.get("type")):
                    continue
                frames = entry.get("frames") if isinstance(entry.get("frames"), list) else []
                clean = []
                for frame in frames[:8]:
                    if isinstance(frame, dict) and code_name(frame.get("module")) and frame["module"].split(".")[0] in DIAGNOSTIC_ROOTS and isinstance(frame.get("function"), str) and (code_name(frame["function"]) or frame["function"] in {"<lambda>", "<module>"}) and type(frame.get("line")) is int and 0 < frame["line"] < 1_000_000:
                        clean.append({key: frame[key] for key in ["module", "function", "line"]})
                locations.append({"module": entry["module"], "type": entry["type"], "frames": clean})
            break
    return {"error_types": sorted(types), "http_statuses": sorted(statuses), "public_hosts": sorted(hosts), "error_codes": sorted(codes), "missing_modules": sorted(modules), "failed_file": failed_file, "failed_stage": failed_stage, "exception_locations": locations[:16]}


def child_transcription_output(stdout):
    value = None
    for line in stdout.splitlines():
        try:
            record = json.loads(line)
        except ValueError:
            continue
        if not isinstance(record, dict):
            continue
        if isinstance(record.get("stage"), str) and record["stage"] in ASR_STAGES and isinstance(record.get("status"), str) and record["status"] in {"started", "passed"}:
            print(json.dumps({"stage": record["stage"], "status": record["status"]}), flush=True)
        if record.get("ok") is True:
            value = record
    if value is None:
        raise ValueError("Missing transcription result")
    return value


def stage(name, action):
    print(json.dumps({"stage": name, "status": "started"}), flush=True)
    try:
        result = action()
    except Exception as error:
        # Package and model errors can contain proxy credentials or signed URLs.
        diagnostic = safe_diagnostics(error)
        if name.startswith("asr_file_"):
            diagnostic["failed_file"] = name.removeprefix("asr_file_")
        print(json.dumps({"stage": name, "status": "failed", "error_type": type(error).__name__, "exit_code": getattr(error, "returncode", None), "diagnostics": diagnostic}), flush=True)
        raise SystemExit(1) from None
    print(json.dumps({"stage": name, "status": "passed"}), flush=True)
    return result


def media_metadata(info):
    duration = float(info["format"]["duration"])
    if not math.isfinite(duration) or not 0 < duration <= 600:
        raise ValueError("Unsupported media duration")
    streams = info["streams"]
    if not isinstance(streams, list) or not streams or any(not isinstance(stream, dict) or not isinstance(stream.get("codec_type"), str) for stream in streams):
        raise ValueError("Invalid stream metadata")
    if not any(stream["codec_type"] in {"audio", "video"} for stream in streams):
        raise ValueError("No audio or video stream")
    return duration


def decode_pcm(path, root, env):
    # Use the cloud FFmpeg decoder instead of the failing PyAV file-input path.
    result = subprocess.run(
        ["ffmpeg", "-nostdin", "-v", "error", "-threads", "2", "-i", str(path),
         "-map", "0:a:0", "-vn", "-t", "601", "-ac", "1", "-ar", "16000",
         "-acodec", "pcm_s16le", "-f", "s16le", "pipe:1"],
        cwd=root, env=env, capture_output=True, check=True, timeout=60,
    )
    pcm = result.stdout
    # The one-second margin detects overlong audio without unbounded output.
    if not pcm or len(pcm) % 2 or len(pcm) > 600 * 16000 * 2:
        raise ValueError("Invalid or overlong decoded audio")
    return pcm


def speech_result(segments, info):
    text = " ".join(segment.text.strip() for segment in segments if segment.text.strip())
    if len(text) > 16000:
        raise ValueError("Transcription exceeds the Site field limit")
    return {"transcription": text if text else None, "availability": "observed" if text else "unavailable", "language": info.language, "language_probability": float(info.language_probability), "duration_seconds": float(info.duration), "speech_detected": bool(text)}


def prepare_sound_model(directory):
    import requests
    directory.mkdir(parents=True, exist_ok=True)
    archive = directory / "model.zip"
    if not archive.is_file() or hashlib.sha256(archive.read_bytes()).hexdigest() != SOUND_SHA256:
        payload = bytearray()
        with requests.get(SOUND_URL, stream=True, timeout=(20, 60)) as response:
            response.raise_for_status()
            for chunk in response.iter_content(65536):
                payload.extend(chunk)
                if len(payload) > 20_000_000:
                    raise ValueError("Oversized sound model")
        if hashlib.sha256(payload).hexdigest() != SOUND_SHA256:
            raise ValueError("Sound model checksum mismatch")
        archive.write_bytes(payload)
    with zipfile.ZipFile(io.BytesIO(archive.read_bytes())) as bundle:
        for name in ["yamnet.onnx", "yamnet.data"]:
            (directory / name).write_bytes(bundle.read("yamnet-onnx-float/" + name))


def audio_windows(samples):
    # Include the tail, even when it contains less than one model window.
    return range(0, max(1, samples - 15600 + 7680), 7680)


def no_speech_decision(voice_max, amplified_voice_max, background_mean):
    return voice_max < 0.1 and amplified_voice_max < 0.5 and background_mean >= 0.8


def classify_audio(audio, model):
    import numpy as np
    import onnxruntime as ort
    if not len(audio) or len(audio) > 600 * 16000 or not np.isfinite(audio).all():
        raise ValueError("Invalid classifier audio")
    options = ort.SessionOptions()
    options.intra_op_num_threads = 2
    session = ort.InferenceSession(str(model / "yamnet.onnx"), options, providers=["CPUExecutionProvider"])
    # HTK mel filters and centered Hann STFT match the model publisher's input contract.
    hz = np.linspace(0, 8000, 257)[:, None]
    edges = 700 * (10 ** (np.linspace(2595 * np.log10(1 + 125 / 700), 2595 * np.log10(1 + 7500 / 700), 66) / 2595) - 1)
    filters = np.maximum(0, np.minimum((hz - edges[:-2]) / np.diff(edges)[:-1], (edges[2:] - hz) / np.diff(edges)[1:]))
    window = np.pad(np.hanning(401)[:-1], (56, 56))
    maxima, amplified, backgrounds = [], [], []
    for offset in audio_windows(len(audio)):
        clip = audio[offset:offset + 15600]
        clip = np.pad(clip, (0, max(0, 15600 - len(clip))))
        frames = np.lib.stride_tricks.sliding_window_view(np.pad(clip, (256, 256), mode="reflect"), 512)[::160][:96]
        magnitude = np.abs(np.fft.rfft(frames * window, axis=1)) @ filters

        def predict(gain):
            features = np.log(magnitude * gain + 0.001).astype(np.float32)[None, None]
            logits = session.run(None, {"audio": features})[0][0]
            if logits.shape != (521,) or not np.isfinite(logits).all():
                raise ValueError("Invalid sound classification")
            return 1 / (1 + np.exp(-np.clip(logits, -80, 80)))

        scores = predict(1)
        # Include singing and rap. Quiet speech must survive a second, amplified check.
        maxima.append(float(scores[:33].max()))
        peak = float(np.max(np.abs(clip)))
        amplified.append(float(predict(0.8 / peak)[:33].max()) if 0 < peak < 0.1 else maxima[-1])
        backgrounds.append(float(max(scores[132], scores[494])))
    result = {"model": "yamnet-v0.59.0", "windows": len(maxima), "covered_audio_samples": len(audio),
              "voice_max": max(maxima), "amplified_voice_max": max(amplified), "background_mean": float(np.mean(backgrounds))}
    result["no_speech"] = no_speech_decision(result["voice_max"], result["amplified_voice_max"], result["background_mean"])
    return result


def resolve_empty_speech(result, audio, sound_model, engine):
    if result["availability"] == "observed":
        return result
    evidence = stage("asr_audio_classification", lambda: classify_audio(audio, sound_model))
    if evidence["no_speech"]:
        return {**result, "transcription": "", "availability": "absent", "language": None,
                "language_probability": None, "absence_evidence": "full_audio_classification", "audio_classification": evidence}
    # A lower VAD threshold recovers quiet speech without decoding silence into invented words.
    def retry():
        peak = float(abs(audio).max())
        boosted = audio * (0.8 / peak) if 0 < peak < 0.1 else audio
        segments, info = engine.transcribe(boosted, task="transcribe", beam_size=5, vad_filter=True,
                                          vad_parameters={"threshold": 0.2, "min_speech_duration_ms": 100}, condition_on_previous_text=False)
        return speech_result(segments, info)
    return {**stage("asr_second_pass", retry), "audio_classification": evidence}


def validate_versions(packages):
    expected = {"faster-whisper": VERSION, "huggingface-hub": HUB_VERSION, "requests": REQUESTS_VERSION}
    if any(packages.get(name) != version for name, version in expected.items()):
        raise ValueError("Unexpected ASR dependency versions")


def speech_engine():
    # The API opt-out alone can leave an initialization event.
    os.environ["ORT_DISABLE_TELEMETRY"] = "1"
    import onnxruntime
    # Disable optional telemetry before faster-whisper can create a VAD session.
    onnxruntime.disable_telemetry_events()
    from faster_whisper import WhisperModel
    return WhisperModel


def main():
    if platform.system() != "Linux" or platform.machine() != "x86_64":
        raise SystemExit("Run only in the remote Work Linux x86_64 environment started through the ChatGPT mobile app.")
    if len(sys.argv) != 2:
        raise SystemExit("Use --prepare, --check, --model, or a cloud media file path.")
    root = Path(__file__).resolve().parent
    state = root / ".asr-probe"
    cache = state / "cache"
    python = state / "venv" / "bin" / "python"
    model = state / "model"
    cache.mkdir(parents=True, exist_ok=True)
    env = {**os.environ, "PIP_CACHE_DIR": str(cache / "pip"), "PIP_DISABLE_PIP_VERSION_CHECK": "1", "HF_HOME": str(cache / "hf"), "HF_HUB_CACHE": str(cache / "hf" / "hub"), "HF_HUB_DISABLE_PROGRESS_BARS": "1", "HF_HUB_DISABLE_TELEMETRY": "1", "XDG_CACHE_HOME": str(cache), "OMP_NUM_THREADS": "2", "TMPDIR": str(cache), "TEMP": str(cache), "TMP": str(cache)}

    env.update({"HF_HUB_ETAG_TIMEOUT": "30", "HF_HUB_DOWNLOAD_TIMEOUT": "60", "DO_NOT_TRACK": "1"})
    os.environ.update(env)

    def run(args, timeout):
        return subprocess.run(args, cwd=root, env=env, capture_output=True, text=True, check=True, timeout=timeout)

    if sys.argv[1] == "--prepare":
        if not python.is_file():
            stage("asr_venv", lambda: run([sys.executable, "-m", "venv", str(state / "venv")], 90))
        stage("asr_dependencies", lambda: run([str(python), "-m", "pip", "install", "--no-input", "--disable-pip-version-check", *DEPENDENCIES], 300))
        stage("asr_dependency_check", lambda: run([str(python), "-m", "pip", "check"], 20))
        versions = run([str(python), "-c", "import importlib.metadata,json; names=['faster-whisper','huggingface-hub','hf-xet','httpx','httpx2','requests','PySocks','av','numpy','ctranslate2','onnxruntime']; result={};\nfor name in names:\n try: result[name]=importlib.metadata.version(name)\n except importlib.metadata.PackageNotFoundError: result[name]=None\nprint(json.dumps(result))"], 20)
        validate_versions(json.loads(versions.stdout))
        print(json.dumps({"stage": "asr_versions", "packages": json.loads(versions.stdout), "environment_presence": {key: bool(os.environ.get(key)) for key in ["HTTPS_PROXY", "HTTP_PROXY", "ALL_PROXY", "SSL_CERT_FILE", "REQUESTS_CA_BUNDLE", "CURL_CA_BUNDLE", "HF_HUB_OFFLINE"]}}), flush=True)
        stage("asr_imports", lambda: run([str(python), str(Path(__file__).resolve()), "--check"], 60))
        stage("asr_model", lambda: run([str(python), str(Path(__file__).resolve()), "--model"], 300))
        if not all((model / name).is_file() and (model / name).stat().st_size for name in MODEL_FILES):
            raise ValueError("Incomplete model files")
        print(json.dumps({"ok": True, "execution": "work-cloud", "faster_whisper_version": VERSION, "model": MODEL, "model_revision": REVISION, "external_model_api": False}), flush=True)
        return
    if sys.argv[1] == "--check":
        from huggingface_hub import hf_hub_download
        from huggingface_hub.utils import get_session
        speech_engine()
        import requests
        import socks
        get_session()
        return
    if sys.argv[1] == "--model":
        from huggingface_hub import hf_hub_download
        for name in MODEL_FILES:
            stage("asr_file_" + name, lambda name=name: hf_hub_download(repo_id=MODEL, filename=name, revision=REVISION, local_dir=str(model), token=False))
        stage("asr_sound_model", lambda: prepare_sound_model(state / "sound-model"))
        return
    path = Path(sys.argv[1]).resolve()
    if not path.is_file() or path.stat().st_size > 100_000_000:
        raise SystemExit("Use an acquired cloud media file of at most 100 MB.")
    details = stage("asr_ffprobe", lambda: json.loads(run(["ffprobe", "-v", "error", "-show_entries", "format=duration:stream=codec_type", "-of", "json", str(path)], 20).stdout))
    duration = stage("asr_metadata", lambda: media_metadata(details))

    def media_digest():
        with path.open("rb") as source:
            return hashlib.file_digest(source, "sha256").hexdigest()

    if not any(stream["codec_type"] == "audio" for stream in details["streams"]):
        digest = stage("asr_media_hash", media_digest)
        print(json.dumps({"ok": True, "probe_version": "1.2.0", "execution": "work-cloud", "media_sha256": digest, "verified_container_duration_seconds": duration, "transcription": "", "availability": "absent", "language": None, "language_probability": None, "duration_seconds": duration, "speech_detected": False, "absence_evidence": "no_audio_stream"}), flush=True)
        return
    if not python.is_file() or not all((model / name).is_file() and (model / name).stat().st_size for name in MODEL_FILES):
        raise SystemExit("Run --prepare first.")
    # Reuse the isolated Python interpreter; do not use unrelated global packages.
    if Path(sys.executable).resolve() != python.resolve() or sys.prefix != str(state / "venv"):
        result = stage("asr_transcription", lambda: run([str(python), str(Path(__file__).resolve()), str(path)], 300))
        value = child_transcription_output(result.stdout)
        print(json.dumps(value, ensure_ascii=False), flush=True)
        return

    def engine_imports():
        if importlib.metadata.version("faster-whisper") != VERSION:
            raise ValueError("Unexpected faster-whisper version")
        WhisperModel = speech_engine()
        import numpy as np
        return WhisperModel, np

    WhisperModel, np = stage("asr_engine_imports", engine_imports)
    engine = stage("asr_model_load", lambda: WhisperModel(str(model), device="cpu", compute_type="int8", cpu_threads=2, local_files_only=True))
    pcm = stage("asr_audio_decode", lambda: decode_pcm(path, root, env))
    audio = np.frombuffer(pcm, dtype="<i2").astype(np.float32) / 32768.0
    segments, info = stage("asr_transcribe", lambda: engine.transcribe(audio, task="transcribe", beam_size=5, vad_filter=True, condition_on_previous_text=False))
    result = stage("asr_segments", lambda: speech_result(segments, info))
    result = resolve_empty_speech(result, audio, state / "sound-model", engine)

    digest = stage("asr_media_hash", media_digest)
    print(json.dumps({"ok": True, "probe_version": "1.1.0", "execution": "work-cloud", "model": MODEL, "model_revision": REVISION, "faster_whisper_version": VERSION, "audio_decoder": "ffmpeg", "audio_sample_rate": 16000, "decoded_audio_samples": len(pcm) // 2, "media_sha256": digest, "verified_container_duration_seconds": duration, **result}, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(json.dumps({"stage": "asr_runtime", "status": "failed", "diagnostics": safe_diagnostics(error)}), flush=True)
        raise SystemExit(1) from None
