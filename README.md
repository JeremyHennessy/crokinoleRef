# Crokinole Ref

A GitHub Pages interface for a local-first crokinole webcam, replay and scoring assistant.

**Prototype, not an automatic tournament referee.** Contact candidates are diagnostic observations, not proof of impact or first-contact order. No computer-generated verdict changes the score.

## First build: v0.1.0

- Browser webcam capture with selectable camera and requested capture mode; microphone is never requested.
- Camera-reported frame rate, observed video callbacks, analysed callbacks and recent largest frame interval shown separately.
- Six-click, near-overhead board calibration; empty-board reference and two sampled disc colours.
- Experimental background-subtraction / colour-component detector in a dedicated worker, with conservative disc identity tracking and review-only proximity candidates.
- Manually started video clips, slow replay, approximate 33 ms seeks, original video export and human review notes.
- Local video import, synthetic demo, manual scoreboard, round history, undo and JSON match-log export.
- Match scores persist in this browser. Clips and review notes remain in this tab until exported; there is no server storage.

## Hosting

Use **GitHub Pages** for the UI. All camera/video processing runs on the visitor's computer. There is no API key, cloud inference, analytics or footage upload.

The included workflow tests the project and publishes static files from `main`. In repository **Settings → Pages → Build and deployment**, select **GitHub Actions** once. A workflow file alone does not prove Pages is enabled or that a deployment succeeded.

See [setup and limitations](docs/QUICKSTART.md), [current handoff](docs/HANDOFF.md) and [verification record](docs/VERIFICATION.md).

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

## Explicit non-goals of v0.1

No verified first-contact classification, automatic legal/foul decisions, automatic 20 detection, automatic scoring, perspective correction, automatic shot segmentation, pre-roll or permanent video library. Fast shots, occlusion, lighting changes and touching discs can defeat this detector. Those gaps remain visible rather than becoming invented certainty.

## Architecture and privacy

`index.html` + `styles.css` provide the UI; `src/app.js` owns camera/replay/scoring; `src/core.js` contains pure geometry and diagnostic tracking; `src/vision-worker.js` isolates vision work. Runtime assets are served from the same origin. The page's Content Security Policy blocks outbound app connections. GitHub still receives ordinary requests for the website's files.

No scheduled workflows: Actions runs only for code changes, pull requests, or explicit manual dispatches.
