# Current handoff — pre-shot buffering

Current recording baseline: deployed `3afc3d757c99cb05e0957662c0a0348f95b46fdb` (PR #6). Pre-roll work is on `feature/buffered-shot-clips`. See `docs/BUFFERING.md` for the design, limits and release gates. Do not confuse a branch or a documentation statement with a verified Pages deployment.

Keep the existing board UI and all scoring/calibration/tracking code unchanged for this recording change. Add only the pre-shot option, buffer status and clip lead-in metadata. Complete overlapping recording sessions preserve the container header; do not concatenate arbitrary video chunks. Actual pixel-decoded pre-flick frames are required in browser evidence.

Real webcam video was not found in this conversation or Library. Physical Logitech performance, occlusion, disc contacts and 20s remain unverified. Request a recording for that test; do not treat synthetic camera or still-image success as real-game validation. Never commit room footage publicly without specific permission.

The source transport workflow is branch-only and is removed before release. Run the full Node and browser suites, inspect recorded proof/screenshots, compare the exact release tree and verify Pages build-info. No opportunistic scoring changes, UI redesign, dependency changes or automatic legal/foul decisions.

## Earlier automation review (historical)


## Scope and preservation

Jeremy requested GitHub Pages UI with local webcam processing, around a 45-degree view, automatic calibration, disc tracking, scoring and clips. Preserve the existing game layout, calibration, replay and manual controls. The last deployed pre-automation baseline is `742552461e6ab0ac6d743203911615ffea5e94c1`. The automation PR under review is #6, initially `d9e9f923dea3f3b12ecc51e37f11a109b07f2e6e`. Neither is a user-approved visual checkpoint; do not invent approval.

## Review findings and implementation

The UI was rescoring small-frame detections using full-camera geometry in the non-perspective path. The reproduced same-position result was 10–5 instead of 25–25. `analysisCalibration()` now supplies both the worker and UI consistently. Pure tests cover three camera scales and an already-rectified view.

Additional release requirements: demo/import scores must not overwrite a saved live match; confirmed 20s and manual adjustments must survive automatic updates; frame gaps/foreground obstruction/missing pucks/line uncertainty hold the score; disappearance alone must never award a 20. Possible 20s remain candidates requiring player confirmation. Undo pauses auto scoring. New rounds wait for the board to clear, and generation IDs reject stale analysis. No automatic legal/foul adjudication or verified first-contact order.

Automatic camera clips start on observed motion and stop after settlement, using the existing MediaRecorder. There is no pre-roll. Browser tests must prove trigger → recording → decode/export without pressing Record, for overhead and angled synthetic camera feeds. Source changes/early stops/time limits are incomplete, not falsely complete evidence. Limits are 30 clips, 64 MB each, 256 MB total, with no automatic deletion of prior clips.

## Verification and next gate

Run `npm test`, `npm run check`, and `python tests/browser_smoke.py`. The local managed browser does not permit a localhost end-to-end session; leave that policy unchanged and run the full browser suite in Actions. Source snapshot transport was branch-only and is removed before release. Consult CI logs/artifacts and `build-info.json` for actual release status; source implementation is not a test pass or deployment.

Actual Logitech model, delivered fps, real camera accuracy, physical 20 detection, parallax, glare and occlusion performance remain unverified. A supplied still is not live-game validation. Do not commit real room/camera footage to this public repository without explicit permission. Pure pixel fixtures and test camera streams are synthetic.

## Next development, after this gate

Validate labelled real shots. Then investigate true pre-roll, stable touching-puck identities and independently observable 20-hole evidence. Keep the calibration/scoring/tracking/recording layers separate; no speculative first-contact verdicts or unrelated UI redesign.
