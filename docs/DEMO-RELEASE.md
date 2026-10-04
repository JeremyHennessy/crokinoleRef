# Demo collision and settlement release — 2026-10-04

## Scope and source

Preserved main base: `426bd2d5eab3778254e6e71580475bc7d128fd24` (cache-safe entry URLs). Last verified published version before this work was `4bb47e4d459ce310f1609382a36c1fb98edcb5ef`. PR #13 contains the new physics demo. Its earlier tested head `2d1e59247815579464e0df6c600d755236bb901a` had not been merged. Source versions are not deployment evidence.

The old scripted demo could penetrate pegs. The replacement calculates swept disc/peg contacts at a fixed 240 Hz, with equal-mass impulses, drag, hole capture and irreversible lower-gutter exits. Rendered pegs use the same geometry as collision checks. The exhibition remains simplified: no spin, flex, physical material calibration, or complete tournament enforcement.

The follow-up review reproduced disc A5 stopped across the outer line after shot 5 but still available for a later hit. The new fail-before/pass-after test prevents this. After motion stops, `demo-rules.js` checks opponent contact (including chronological own-disc combinations) or play-to-middle, removes invalid involved own discs and invalid 20s, then removes stopped outer-line discs before scoring and the next launch. Removal has a labelled fade rather than a fabricated physical bounce. The resulting deterministic round ends 70–90, not the obsolete 25–70 expectation. Unit tests independently sum all settled footprints and banked holes; removed identities cannot appear in later impacts.

Rules source, checked 2026-10-04: https://www.worldcrokinole.com/thegame.html — Playing Guidelines, A Valid Shot, Spinning Disc Rule, Scoring. These decisions consume exact simulator contacts. They are NOT enabled as live camera foul/20 decisions.

## Verification before final release

Local syntax plus 181 Node tests pass. The old A5 regression fails on the exact previous candidate. Whole-frame checks cover 392,320 puck-to-peg and 178,622 puck-to-puck distances without overlap. Source application verified exact clean tree `fc9e9ce6bd5b56cee6378238ae5871270ea6325d` in isolated run `37222026123`.

That run passed ten demo browser checks and five capture comparisons on the first attempt. Artifact `11311100063`, SHA256 `d76d83ca51d10ab46de9a0de8b45e112df20fae0ed5a498c196f464f5ef9a7d0`, was downloaded, digest/CRC checked, and desktop/mobile screenshots inspected. Autoplay, replay, alternating rounds, Guides pixel changes, match-point scoring, tab pause and byte-for-byte saved-match/clip preservation passed. No camera or recorder is opened by the demo.

Full inherited regression, returning-browser cache and capture-recovery jobs remain required on the final PR head and merged main. Publication also requires build-info and an actual public browser completing all 16 shots, checking the removal log, and exiting. Consult PR #13's final release comment and Actions for the deployed commit, not this pre-merge document.

## Camera timing evidence — not a guessed fix

`tests/capture_timing_probe.js` measures test-source draw intervals, delivered video callbacks, main callback time, worker round-trip time and recorder start/stop events. It changes no media timestamps, result decisions, recorder settings or review thresholds. `capture_timing_browser.py` compares overhead/angled views with pre-roll off/on, then deliberately blocks the main thread for 320 ms.

In isolated run `37222026123`, all eight un-injected shots across the four comparisons had no shot-time gap, and all four short rounds completed without review. Worker round-trip p95 ranged 25.7–30.5 ms; main callback p95 ranged 5.8–7.5 ms. This did NOT reproduce or explain the earlier intermittent 430.165 ms release-test gap.

The injected case measured a 333.5 ms source-draw interval and 337.9 ms presentation interval. The shot was held, the complete observed [1,1] launch count was retained, and explicit reviewed-score confirmation completed exactly one 10–10 round. It is not counted as unassisted success. Worker round-trip also rose to 344.3 ms because main-thread delivery was blocked: round-trip is not isolated worker CPU time. DevTools-injected tasks are not necessarily exposed through the Long Tasks API, so assertions rely on the measured source and presentation intervals, not unrelated long-task entries.

Existing positive full-round tests still require uninterrupted automatic scoring; they are not converted to manual-review passes. Their additional timing checkpoints distinguish failures for investigation. No automatic retry-until-green or weakened 150 ms frame-gap threshold is used. Further camera/encoder optimization requires measured evidence, not speculation.

## Remaining validation boundary

No physical Logitech gameplay recording is available in this work. Camera accuracy, glare, hand occlusion, actual peg parallax and a two-round physical benchmark remain unverified. Export labelled footage and its matching replay fixture using the existing local workflow; do not publish room footage to the public repository. Suggested first physical benchmark: 30–50 varied shots and two full rounds, reporting false scores, missed launches, review interruptions and pre-shot clip coverage.
