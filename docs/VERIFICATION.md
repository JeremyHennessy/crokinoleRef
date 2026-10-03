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
