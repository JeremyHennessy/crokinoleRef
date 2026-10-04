# Current handoff — finish the demo release

Current work is PR #13 (`fix/demo-physical-collisions`), based on main `426bd2d5eab3778254e6e71580475bc7d128fd24`. Preserve the existing entry-asset hash/cached-browser fix and both inherited release gates. No user-approved visual checkpoint is being inferred.

Completed candidate scope: physical demo collisions, demo-only end-of-shot rules/removals, preservation of live scores/clip data, and controlled timing/interruption recovery checks. See `DEMO-RELEASE.md` for exact tested-source identities, evidence, limitations and the physical-video requirement. The initial 181-test/10-demo-check/5-comparison proof passed before the final full-suite release. Do not claim a deployment from this document; final PR/main Actions and public browser proof are authoritative.

Keep live vision/calibration/scoring/round/recorder/library implementations unchanged while finishing this demo release. Camera gaps, unknown foreground, possible 20s and uncertain line calls still require review. Exact simulation contacts do not authorize inferred real-camera legal/foul decisions.

The new captioned clearing phase removes stopped outer-line discs and invalid involved own discs before another simulated launch. The default corrected round is 70–90; do not restore older 25–70 or 70–55 scripted outcomes to satisfy stale expectations. The simulation's shape/physics tests and independent end-state scoring tests are release requirements.

`capture_timing_browser.py` reports clean unassisted baseline cases separately from an injected 320 ms interruption requiring explicit human review. The older 430.165 ms intermittent failure was not reproduced by the controlled clean runs and is not claimed fixed. Added timing probes are test-only and leave thresholds/media clocks intact. The real-camera benchmark is pending actual footage, not an API key, cloud service or permission expansion.

No temporary source-application payload/workflow belongs in the released tree. Next steps after verified publication are the labelled physical-camera benchmark and evidence-driven correction of any real failures. The prior implementation and workflow history remain in Git and the project-specific documents: `RELIABILITY.md`, `BUFFERING.md`, `EDGE-REVIEW.md` and `QUICKSTART.md`.
