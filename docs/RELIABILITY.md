# Reliability, gameplay and local-library update

Starting release: `034bd85b3ff1a24eb0fd41804f5f64cfd88ab632`, tree `e3bd0a0d3d2e343b96a9c8acf6229f3d73e6973d`. Preserved as the rollback reference, not invented as a user-approved visual checkpoint.

## Separate changes

1. Reproduced the never-tracked touching-puck blind spot. Three regressions failed against the release; retaining connected unexplained foreground blocks the incomplete automatic score. Broad obstruction thresholds remain too, rather than being weakened.
2. Puck radius is measured from stable teaching-disc pixels and retains an uncertainty bound. Cluster geometry supplies review-only candidate outlines; those hypotheses never silently join the scored disc list. Short observation losses are explicit, and association uses observed velocity and elapsed time. No predicted ghosts are scored or used to invent contacts.
3. Board annotations distinguish a missing disc or a particular score override from banked confirmed 20s and intentional signed round adjustments. A missing-disc annotation reconciles when the actual detection returns. Remaining annotations expire at the next shot or geometry generation, requiring review rather than double counting. Formats select casual/custom/singles/doubles allocation, with alternating round starters.
4. Optional Play view keeps the existing theme and setup accessible; no replacement board geometry or recorder. Completed clips/notes use origin-local IndexedDB. Transaction completion, not enqueueing, determines saved status. Errors retain the in-tab clip and prompt export. ZIP exports contain original video bytes, metadata and replay fixtures. No uploads or automatic deletion of old clips. Limit: 120 clips / 64MB each / 256MB total video bytes. This accommodates two 8-per-team rounds without a 30-clip ceiling.
5. Bounded diagnostics retain recent observations, explicit review regions and a matching empty-board analysis fixture. The empty-board image is private content: only included on explicit local export. Camera device/group identifiers are stripped from JSON exports.

## Local video benchmark

Use **Export diagnostics** for the current calibrated feed, or **Export match with clips** for exact per-clip configurations. A saved clip fixture and its video must refer to the same geometry/background. Exported diagnostics include the empty-board image; do not commit them or user footage to this public repository.

With Node 22, Python 3, ffmpeg and ffprobe installed:

```
python tools/replay_video.py clips/CLIP.webm fixtures/CLIP.json --out replay-report.json
python tools/replay_video.py recording.mp4 crokinole-diagnostics.json --labels labels.json --out labelled-report.json
```

The analyser consumes decoded presentation timestamps, not wall-clock callback speed. It does not write the user's match, fabricate missed frames, or automatically confirm 20s/fouls. Decoded video can contain frames the live browser never analysed; this is deliberately different evidence. Label timestamps must refer to the encoded video timeline.

Label format:

```json
{"shots":[{"end":5.2,"visible":[10,5],"action":"apply"},{"end":9.4,"visible":[10,5],"action":"hold"}]}
```

End times have a 0.75-second matching tolerance. Each event can match only one label. Reports count exact visible-score/action agreement, missed labelled shots, and extra detected shots. No labels means **no accuracy claim**. For a first physical benchmark, collect 30–50 labelled shots and two complete rounds, including fast shots, hands, clusters, 20s and interruptions. No real user gameplay video was found in the conversation/Library lookup for this update; that benchmark is pending actual recordings.

## Release gates

Run all Node tests, syntax checks, existing browser checks, full smart-setup rounds and local-storage/export tests. The new browser proof uses automatic board fit and colours, full 8-per-team rounds in both overhead and angled views, two consecutive rounds with alternating starter, original playable buffered clips, reload recovery, and a CRC-checked ZIP. Full 12-per-team quotas remain covered separately in pure tests. The offline proof decodes one produced synthetic clip twice and requires identical reports.

Local browser navigation is blocked by environment policy; that policy stays unchanged. Run full browser tests in Actions and inspect the artifacts before merging. A passing branch run is not a deployed release. Verify the merge tree and Pages build-info commit.

## Browser storage limits

IndexedDB preserves completed files across ordinary reloads in supported browsers. It is not an external backup: site-data clearing, private mode, quota exhaustion or browser eviction can remove data. The optional retention request is honoured only if the browser grants it. Sources: https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB and https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria . Game allocation and alternating start reference: https://www.worldcrokinole.com/thegame.html . These presets are not a complete tournament rules engine.
