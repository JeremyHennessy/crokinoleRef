# Verification record

## Development checks — 2026-10-03

- Node 22.16.0: 29 unit tests passed for calibration, line-score helper, scoring modes, capture constraints, colour detection and conservative tracking.
- JavaScript syntax checks passed for all three runtime modules.
- Physical camera, Jeremy's webcam, actual crokinole shots and first-contact accuracy: **not tested**.
- Local full browser execution was blocked by this development environment's managed browser policy. That restriction was not removed. Browser smoke tests are therefore run in GitHub Actions; consult the actual workflow log and artifacts for their result rather than interpreting the presence of a test file as a pass.

## Browser test coverage

The test uses Playwright Chromium with a **synthetic camera**. It checks no camera access on load, manual scores/undo/persistence, synthetic detector output, canvas aspect ratio, six-click calibration, fake camera/no audio, clip recording and decode/export, manual verdicts without score mutations, JSON export, camera track release, video reimport, mobile overflow, permission denial, runtime errors and unexpected external requests. Screenshots and a machine-readable report are retained as CI artifacts.

A browser smoke pass validates those software paths in that environment, not camera accuracy or all browsers. UI screenshots from a static render do not count as end-to-end tests.

## Publication

The workflow stages only runtime assets and setup docs, then records the deployed source commit in `build-info.json` and verifies that exact SHA after publishing. Pages settings may require one-time user enablement. A successful source push or a green unit test alone is not proof the site is live.

## Angled-camera / instruction update

19 new local Node tests pass for non-affine projective fitting, inverse mapping, centre cross-check, invalid marks, ring/disc validation, scaled sampling, bilinear pixel values, frame-size mismatch, instruction coverage and two-puck detection after rectifying a synthetic oblique image/background. These are synthetic geometry tests, not camera accuracy measurements.

The calibration component was additionally exercised in a local in-memory Chromium page with no network or camera: both click sequences, corrected preview, manual apply, cancellation preserving prior state, and 390 px layout. The actual component source was used; this is narrower than an end-to-end app test.

The repository browser suite retains camera/replay/scoring regression checks and now covers the guide, perspective mode, undo, retake, manual confirmation and mobile instructions. Consult the latest PR/CI result for the combined suite outcome.

## Automation review — 2026-10-03

The review reproduced the UI coordinate defect independently (old 10–5, corrected 25–25 for the same four known positions). The current local suite passes **76 Node unit/integration tests**, including full synthetic pixel detector → tracker → shot analyser → settled score, multi-resolution coordinate parity, hard gates for gaps/obstruction/line calls, moving puck entry, no automatic 20 from disappearance, confirmed-20/manual-adjustment arithmetic, and new-round clearing. JavaScript syntax checks pass. These are not real-camera accuracy tests.

The extended browser suite requires separate overhead and angled synthetic camera runs through the normal capture, calibration, colour sampling, worker and MediaRecorder paths. It checks automatic clip start/stop, playable/exportable video, 25–25 scoring, a second shot retaining a confirmed 20 and manual adjustment, demo isolation, and existing calibration/replay/mobile regressions. At the time this source record was prepared, the updated full-browser CI run had **not yet completed**. Refer to the PR checks and artifact report for the final outcome; the test script alone is not evidence of a pass.
