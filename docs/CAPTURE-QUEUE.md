# Actual-frame queue and capture timing — 2026-10-04

Baseline: `83b5cc7a9962a90616cee49f8da49ac26a7114b9`. Its complete release run `37231146594` held the first full camera round after a gap in shot nine: final detected board 80–80, but an earlier required review remained active. The source and presentation probes had no intervals over 150 ms; a worker round trip reached 159.1 ms and a main callback took 126.7 ms. A round must not silently erase that review just because later positions look complete.

## What the profiling established

Test-only run `37231995276` measured actual canvas calls and worker CPU spans. All 47 canvas calls above 8 ms were copying VIDEO into the full-resolution raw canvas (maximum 82.3 ms); analysis getImageData max was 4 ms. That round completed without a score hold, so it was diagnostic evidence of an expensive stage, not reproduction of the same release failure.

A same-run comparison `37232223191` tested removing the raw canvas's willReadFrequently hint. Both rounds completed, but main callback p95 stayed 8.5 ms and the candidate maximum rose from 51.4 to 110.5 ms. That experiment did not establish an improvement and is NOT included here. The original context settings are retained.

## Narrow evidence-preserving change

The capture callback previously did not read any new analysis image while a worker request remained in flight. Consequently a brief delayed reply could turn otherwise available source frames into a larger gap in analysed observations.

A bounded queue now retains at most three waiting, actually captured RGBA frames and sends them in order as the worker completes. Every packet keeps its original media timestamp and actual pixel buffer. No timestamps are rescaled, missing poses interpolated, scoring predictions inserted or review thresholds relaxed. The existing one-in-flight worker rule remains. Resizing, recalibration, source changes and backward seeks reset the generation and discard stale pending pixels. Late/duplicate responses cannot release another generation's work. Colour-learning replies include their original frame timestamp for exact acknowledgement.

When the queue exceeds its small limit it discards oldest waiting pixels, explicitly flags the next retained packet as a capture gap and increments the local dropped count. That flag drives the existing frame-gap/discontinuity review path, even when the remaining media timestamps happen to be close. The queue cannot recover an image the camera never delivered or a main-thread stall that prevented capture; real gaps still require review. It is not the pre-roll video buffer and does not store footage in the user's library.

At the current 640x480 analysis size, three waiting images use 3,686,400 bytes; at 640 square they use 4,915,200 bytes, in addition to one transferred in-flight image. There is no growing backlog.

## Verification boundary

193 local Node tests and syntax checks pass. New tests cover an actual busy capture callback, ordered original pixels/timestamps, exact replies, bounded overflow and propagated gap, generations/seeks, invalid packets/transport failure, and the real worker retaining a capture-loss review flag. The prior 72-scene scratch equivalence proof remains passing.

`tests/frame_stage_profile.py` is a read-only optional diagnostic, not a substitute for the complete release tests. Full camera, automatic-round, storage, recovery, cache-upgrade and demo browser tests are still required on the integrated candidate before merge, followed by exact main publication and public full-round playback. These are synthetic-camera checks, not physical Logitech accuracy or a guarantee of stall-free scheduling.
