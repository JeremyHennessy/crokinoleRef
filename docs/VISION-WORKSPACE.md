# Camera processing workspace review — 2026-10-04

Baseline: PR #13 head `fe8f1214f30f09c65075b0dea2eb21090c69c117`, tree `ba7535105b06a8c0e4c66e906c877ffd558b74d6`. Main still held the old scripted demonstration when this work began; the existing physical/rules correction must actually be deployed before a user can evaluate it.

The failed full browser run `37222477096` produced a 164.999 ms analysed interval during the final angled shot. It correctly held the otherwise calculated 20–20; observed launch count was [2,2]. Separately, its timing checkpoint reports a 118.7 ms maximum main callback, 23.4 ms p95 worker round trip and 172/178 ms long tasks between shots. These observations do not identify one common cause. No gap has been relabelled as harmless and no threshold is changed.

## Bounded change

Previously every detector frame allocated a width*height byte mask and int32 traversal stack. Visibility allocated the same pair at half-width/half-height. At 640 square these total 2,560,000 bytes of large temporary buffers per frame, excluding the actual source pixels and smaller objects. This revision creates that scratch once per worker geometry, clears it before reuse and replaces it on configure/resize. Detections and unresolved regions are still freshly computed; the buffers contain no remembered score or disc identity. Per-pixel RGB distances and traversal ordering are unchanged; temporary colour and neighbour arrays are avoided.

Worker results additionally expose prepare/detection/tracking/visibility/referee processing spans. They are diagnostic CPU times, not camera time or probabilities. The original media timestamp and frame-gap decisions are preserved. The bounded diagnostics export retains the spans so future investigations can distinguish worker execution from main-thread delivery. Changed worker and diagnostic imports are versioned for returning browsers.

## Local evidence

Before editing, outputs from 72 reproducible raster fixtures were captured from the exact baseline modules. They include odd/small/normal dimensions, empty boards, separated and touching coloured discs, unknown colours, large obstructions, exposure change, transparent samples and clutter. The complete detection AND visibility JSON outputs are byte-identical after the change: SHA256 `f7e5d46860692b02767fbfa4049eeecf547912d206beac6618f81b6abb632b6e`.

An interleaved 400-frame-per-variant local Node comparison on one 640x640 sixteen-disc fixture, after warm-up, measured detection+visibility median 6.536 ms before versus 4.388 ms after; p95 8.568 ms versus 5.189 ms. This is a local processing benchmark, NOT browser/sensor throughput or proof that the intermittent CI delay is fixed. Do not convert it to a physical-camera accuracy claim.

186 Node tests pass locally, including the 181 inherited tests, exact baseline-output digest, stale-foreground cleanup, geometry validation, bounded diagnostic retention and execution of the real worker with unchanged media times, true-gap detection and stale-generation rejection. Full browser, cache, interruption-recovery and public Pages playback are still required before calling the release verified. Local browser navigation is denied in the review environment; actual browser acceptance runs on the existing isolated GitHub runners.

No camera footage is uploaded, and no user match/clip data is migrated or cleared. The 30–50-shot/two-round physical Logitech benchmark still requires labelled real footage; a still photo is not a substitute. The physics exhibition uses exact simulated contacts only and retains the existing live 20/foul review boundaries.
