# Crokinole Ref

A GitHub Pages interface for a local-first crokinole webcam, replay and scoring assistant.

**Prototype, not an automatic tournament referee.** Contact candidates are diagnostic observations, not proof of impact or first-contact order. No computer-generated verdict changes the score.

## Current build

- Browser webcam capture with selectable camera and requested capture mode; microphone is never requested.
- Camera-reported frame rate, observed video callbacks, analysed callbacks and recent largest frame interval shown separately.
- Smart calibration is now the primary setup path: it automatically detects the round playing surface, 20 hole and three scoring rings, rectifies the board plane, estimates initial puck size, and asks for visual confirmation instead of requiring calibration clicks.
- The illustrated nine-click angled / six-click overhead guide remains as a manual fallback, with numbered markers, magnifier, undo, retake and explicit preview confirmation.
- Experimental board-plane perspective correction from four actual quadrant marks plus an independent centre check. Empty-board reference and sampled team colours.
- Worker-based background/colour detector with conservative disc identity tracking and review-only proximity candidates. Angled input and background are rectified together; overlays are projected back onto the original camera view.
- Manually started video clips, slow replay, approximate 33 ms seeks, original video export and human review notes.
- Local video import, synthetic demo, manual scoreboard, round history, undo and JSON match-log export.
- Match scores persist in this browser. Clips and review notes remain in this tab until exported; there is no server storage.

## Hosting

Use **GitHub Pages** for the UI. All camera/video processing runs on the visitor's computer. There is no API key, cloud inference, analytics or footage upload.

The workflow tests the project and publishes static files from `main`, then checks the published commit. A successful push alone is not proof of deployment. The initial tested build was merged at `5a406d4830ba3cea39b00fd1e56a091733c22db3` and published successfully.

See [setup and click instructions](docs/QUICKSTART.md), [current handoff](docs/HANDOFF.md) and [verification record](docs/VERIFICATION.md).

## Local development

Node 22+ runs dependency-free unit tests:

```sh
npm test
npm run check
npm start
```

Open `http://localhost:8080`. Use HTTPS for a published site. Do not open `index.html` as a `file://` document: module workers and camera permissions need an appropriate origin.

Browser smoke tests use Playwright and a synthetic camera, **not physical-board footage**:

```sh
python -m pip install playwright==1.57.0
python -m playwright install chromium
python tests/browser_smoke.py
```

## Explicit limitations

No verified first-contact classification, automatic legal/foul decisions, automatic 20 detection, automatic scoring, automatic shot segmentation, pre-roll or permanent video library. Smart and manual perspective correction model the flat board only: occlusion, residual lens distortion and the height of pucks/pegs remain unresolved. Smart setup uses confidence gates and never silently applies its candidate; the user still confirms the overlay. Use the four physical quarter marks, not guessed extrema of the oval image. Fast shots, lighting changes and touching discs can defeat detection. Those gaps remain visible rather than becoming invented certainty.

## Architecture and privacy

`index.html` + `styles.css` provide the existing UI; `src/app.js` owns camera/replay/scoring; `src/core.js` contains the unchanged core geometry/tracker; `src/vision-worker.js` isolates vision work. `src/perspective.js` implements plane correction and `src/calibration-guide.js` with its own CSS provides the walkthrough. Runtime assets come from the same origin. The page's Content Security Policy blocks outbound app connections. GitHub still receives ordinary requests for the website's files.

No scheduled workflows: Actions runs only for code changes, pull requests, or explicit manual dispatches.
