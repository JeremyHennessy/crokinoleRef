# Pre-shot buffering

## Scope and preserved baseline

This change starts from deployed `3afc3d757c99cb05e0957662c0a0348f95b46fdb`. Scoring, tracker, calibration mathematics, colour detection, foul/20 review gates, manual score ledger and existing replay controls are unchanged. This is a recording improvement, not new physical-camera accuracy evidence. There is no user-approved visual checkpoint to invent.

## Recording method

Once a real camera is connected, tracking is ready, and both Auto clips and Include pre-shot footage are enabled, at most two short idle MediaRecorder sessions overlap. One new session starts about every two seconds. The older session is discarded only when a replacement has at least two seconds of lead-in. On shot detection, a ready session is claimed and continues through settlement; the entire session, including all original header and timeslice chunks, becomes one clip. During an active shot there can be one claimed recorder plus two idle recorders.

No arbitrary timeslice fragments are joined, no encoded timestamps are rewritten, and no frames are synthesized. The [W3C recording specification](https://www.w3.org/TR/mediastream-recording/#mediarecorder-methods) requires all blobs from a completed recording to be playable together; it does not require every timeslice blob to be independently playable. Complete overlapping sessions avoid depending on unsupported fragment splicing or a new muxing dependency.

The target lead-in is two seconds, nominally two to four depending on rotation timing. It is NOT an exact sensor-timestamp guarantee. The displayed/JSON lead-in is estimated from video presentation times; browser encoder start delay and frame loss can reduce actual coverage. Warm-up and fallback are labelled explicitly. No promise that every flick or contact will be captured.

## Resource and lifecycle bounds

Idle buffer chunks are capped at 16 MiB per session (two sessions, at most 32 MiB in retained JS blobs; this is not a bound on the browser's internal encoder memory). A claimed clip uses the existing 64 MiB cap and shares the existing 256 MiB saved-clip budget. Clips are not evicted silently. Byte/time/encoder failures mark evidence incomplete. Stop has a bounded four-second watchdog to avoid leaving controls permanently busy.

The buffer shares the existing video-only stream and does not request another camera or microphone permission. Idle data is discarded when disabled, hidden, disconnected, recalibrated or switched to another source. Saved clips are unaffected. Encoder allocation failure disables pre-roll for that session and leaves motion-triggered/manual capture available; toggle the pre-shot option or reconnect to retry. Extra encoding may reduce performance on older hardware.

## Verification gate

Dependency-free tests exercise rotation, complete prefixes, warm-up, multiple shots, byte caps, encoder failures, stop/discard cleanup, inactive streams, late callbacks and watchdogs. Existing scoring/calibration tests must remain passing. Browser tests additionally encode a binary clock into synthetic camera pixels OUTSIDE the board, then decode that clock from saved video after several buffer rotations. The test must show frames at least 1.5 seconds before the actual scripted flick, not merely plausible metadata. Two successive clips are checked in both overhead and angled views, alongside existing trigger-only and manual recording regressions. Exported synthetic clips and JSON evidence are retained by CI for inspection.

No real-board video was found in the current conversation or Library during this task; supplied still images do not validate shot timing. A real webcam video is still required for physical validation, and must not be committed to this public repository without explicit permission. New source changes and passing unit tests are not a deployment: check the exact PR, main workflow and published build-info before reporting release.
