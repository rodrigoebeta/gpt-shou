# ShouBox

## Cloud runtime

The authenticated get_runtime tool supplies cloud runtime 1.5.0 and its workflow through the Site's native plugin.
The manifest includes a compressed archive and an offline Python materializer with independent SHA256 checks.
Materialize the exact six files before the bootstrap. Never regenerate package-lock.json or fetch source from the private Site through the shell.
The cloud task retrieves and verifies its source files on each run. It requires no task attachment or local files.
Run the helpers only in Work cloud execution. The acquisition helper obtains media and captions.
Run python transcribe.py --prepare to install the pinned speech engine and model in the temporary workspace.
Run python transcribe.py <video_path> to transcribe the acquired video with FFmpeg and faster-whisper.
The cloud model inspects video frames and describes visible content.
The helper currently supports anonymously accessible posts. Authenticated Saved discovery requires the owner's cloud browser session.
Content version 1.2.0 stores the caption, original speech, Portuguese speech text, factual visual text, and a semantic description for keyword search.
The Work cloud model translates non-Portuguese speech after transcription. The ASR helper remains unchanged.
Store the faithful translation in transcription_pt with translated status. Copy already-Portuguese speech with original status.
Keep missing Portuguese text unavailable and the new result partial. Both speech texts remain internal.
The Work model generates semantic_description from observed source text, with generated availability.
Use two to four grounded Portuguese sentences about the subject, context, purpose, and concepts.
Keep unsupported descriptions null and unavailable. New complete content requires the semantic description.
Semantic text joins the existing keyword index and remains backend-only.
Historical content 1.0.0 and 1.1.0 remain readable. Update installed task prompts before they submit new content.
Verify acquisition, transcription, visual inspection, and scheduled execution in each installation's Work cloud environment.
The runtime requires Linux x86_64, Python with venv, FFmpeg, ffprobe, and access to its package and model sources.
The transcription helper accepts at most 100 MB and 600 seconds. Empty recognition output remains unavailable.
Compare the transcription media digest with the acquisition digest before saving content.
Remove the temporary workspace, including its model, virtual environment, and caches, after the run.

Run node scripts/build-runtime.mjs after editing runtime files. The build rejects a stale runtime bundle.

ShouBox stores Reel references in native Sites D1 and original covers in R2.
The interface shows the Reel, creator, source link, classifications, and processing status.
The transcript, description, and analysis remain in the backend.
This version uses keyword search. It uses no paid model API.
Activate recurring collection after the owner completes the installation checks.

## Install and run

Use Node.js 22.13.0 or later.
Keep dependencies and caches inside the project.
Use the Sites plugin's setup, installation, and publication workflow.
Declare `DB`, `BUCKET`, and the `mcp` capability in `.openai/hosting.json`.
Configure `OWNER_EMAIL` with the verified provisioning owner's email through native server-only Sites configuration.
Keep this value outside source files and browser code.
Keep local preview configuration outside the distribution package.

Run the following commands from this directory:

```text
npm run install:ci
npm run db:generate
npm test
npm run build
npm run dev -- --hostname 127.0.0.1
```

Apply each generated D1 migration once to the local database before preview tests.
Sites applies the hosted migrations during publication.
Keep existing applied migrations unchanged.

## Connect the agent

Publish the private Site with the native MCP capability.
Use the private plugin that Sites provisions for this installation.
Read the exact connection metadata through native `get_site` with `include_mcp_connection: true`.
Install or connect that plugin when its tools are unavailable.
Use a fresh chat if installed tools do not appear.
Use no Site gate token or separate HTTP writer.

The first authenticated `start_run` acquire binds the verified owner's Site-scoped identity.
Subsequent tools require that bound identity.
Use package version `0.1.0`, analysis version `1.0.0`, and contract version `1.0.0`.
Read `server/agent-api.json` for the complete tool schemas.

1. Acquire a run with `start_run`.
2. Register canonical source identities with `register_sources`.
3. Transfer original image bytes with `store_cover`.
4. Write observed analysis and valid classifications with `update_reference`.
5. Verify durable receipts with `get_reference`.
6. Release the run with `finish_run`.

The agent runs the acquisition and transcription helpers in Work cloud execution. The agent performs factual visual inspection.
The Site delivers these helpers through MCP; the Site does not execute speech inference.
The API does not collect Instagram media or analyze video automatically.
Store no permanent video copies.
Use labels that the installation owner defines.
Preserve manual classifications and removed references.
Ask the owner before requesting reclassification of existing references.

## Limits and recovery

Each run lease lasts 900 seconds. Renew the lease before it expires.
Reuse the same request ID and payload after an uncertain response.
Read the current reference receipt before reporting success.
Keep service cooldowns until their reported reset time.
Use exponential backoff and preserve pending work when rate limits occur.
Cover requests accept JPEG, PNG, or WebP, at most 1 MiB, 8192 pixels per side, and four million decoded pixels.
The decoder rejects animation and malformed image data.
Browser mutations require the same origin and the current reference revision.
Removal preserves the cover and reference identity. Restore does not change Instagram Saved.
Installed task templates require an explicit compatibility review before future recurring automation starts.
