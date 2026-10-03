# Edge-loss review — 2026-10-03

Reviewed baseline: `71b2278bf037c9381b69b97dd8627ffd621d364f` on PR #6. Its Actions run #53 (`37160958076`) completed successfully; its downloaded browser report contains 18 passing checks, including automatic playable clips for overhead and angled synthetic camera feeds. Physical-camera testing remains unperformed.

## Reproduced fault

In the 300px unit-test board (centre 150,150; outer ring radius 120; puck radius 7), an A puck last observed at 258,150 still scores five points. The old edge-loss threshold classified its disappearance as out-of-play and automatically applied 0–15 instead of holding for recovery. Four new regression scenarios failed against the exact reviewed auto-referee module; the zero-point exit control passed.

## Minimal correction

Explain a lost puck as a zero-point exit only if its last observed footprint was already worth zero and was beyond scoring-line uncertainty. A still-scoring or line-uncertain puck must recover or remain a review case. This does not claim to observe the ditch or certify an impact.

No UI, camera, calibration, dependencies, score-ledger or recording implementation changes in this correction. The existing recovery, timeout and player-review controls are reused. Five new regressions cover five-point dropout, recovery, timeout, ambiguous outer-line positions, and a clearly zero-point exit. They and all 29 unchanged core tests pass locally (34 total); the complete current-branch suite remains a CI/release gate.

## Release and next work

Do not equate a branch commit or test pass with deployment. Verify the exact PR head, test logs, rendered evidence, merge result and Pages build-info commit before reporting a release. Preserve `742552461e6ab0ac6d743203911615ffea5e94c1` as the pre-automation baseline; it is not a user-approved UI checkpoint.

Next: labelled real-webcam shots, genuine pre-roll (current auto clips begin after detected motion), and measured touching-puck tracking. Twenty-point holes still need player confirmation; no automatic foul or first-contact verdicts.
