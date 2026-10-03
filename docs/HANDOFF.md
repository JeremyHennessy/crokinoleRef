# Current project handoff — 2026-10-03

## Direction

Jeremy requested an overhead-webcam crokinole referee assistant in `JeremyHennessy/crokinoleRef`, explicitly with **GitHub Pages for the UI**. Camera capture and computation must remain local to the visitor's browser. His photographed webcam resembles a Logitech C920-family camera; its exact model and delivered frame rate are unverified. Use existing hardware for testing rather than assuming an upgrade is necessary.

The repository was confirmed empty before initialization. Initialization commit: `48b5bd0bf577440a1f84de798c6c8dcf4d2d4e3b`. No visual/functionality baseline has been user-approved yet. Do not treat this implementation as an approval checkpoint until Jeremy actually approves it.

## v0.1 scope

Deliver useful manual camera/replay/scoring first, plus explicitly experimental diagnostics. Detector and tracker are not trained or validated on physical crokinole footage. No automated legal/foul decisions. No automatic 20s or scores. The scorer's pure geometry helper is unit-tested but is not connected to the UI.

Hosting uses a test-gated Pages workflow. Do not claim deployment without a successful run and matching published `build-info.json`. The connector does not expose a Pages-settings write action; do not seek credentials or broaden permissions to work around that. If Pages is not enabled, Jeremy can select **Settings → Pages → Source: GitHub Actions** once, then rerun the failed deployment job.

## Next evidence gate

Capture a small labelled set from the actual mounted board: ordinary direct hit, clear miss, thin graze, own-disc combination, two rapid contacts, touching/clustered discs, retrieval/20, and hand occlusion. Inspect measured delivery, motion blur, calibrated ring alignment and false/missing detections. Do not implement an automatic verdict until its evidence path and an explicit abstention policy are verified on real footage.

Next feature candidates only after this gate: better exposure diagnostics, shot pre-roll/segmentation, more robust identity tracking, genuine collision evidence, then rules-aware contact-chain analysis. A local native capture engine is a fallback if browser capture becomes the measured bottleneck, not a default architectural rewrite.

## Change control

Keep camera, tracking, rules, storage and presentation separate. Preserve exact commits and screenshots when approved. One hypothesis/test at a time; no unrelated redesign during fixes. Real clips should not be committed to this public repository without permission. Automated test footage is synthetic.
