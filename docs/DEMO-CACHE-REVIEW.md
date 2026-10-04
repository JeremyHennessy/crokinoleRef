# Full-demo button cache regression — 2026-10-04

## Preserved baseline and reproduced defect

Released source `4bb47e4d459ce310f1609382a36c1fb98edcb5ef`, tree `a7d4651ca578cd62c0d9bfd2f359281f4c672f29`. Its new HTML still loaded `src/app.js?reliability=1`, exactly the entry URL used by pre-demo release `616f9cf03caf17e0815925275d9fc04a71187526`.

Diagnostic commit `ee213e9b357b85c64556e348231204cb844548bb` changes no runtime files. Actions run `37178317075`, job `111365510060`, reproduced the inert button in Chromium and WebKit at 1440px and 390px widths. The test served exact old-release bytes, warmed each real HTTP cache, then served new HTML without clearing cache or site data. All four returning profiles retained the old bootstrap and had a null button handler; clicking did nothing and produced no JavaScript error. Both fresh-profile controls started and advanced the full demo normally.

This is a confirmed reproducible deployment bug matching Jeremy's report. It is not direct inspection of the state of his browser. The diagnostic server uses explicitly cacheable assets; it does not assert the precise cache policy of his device or a particular CDN edge.

## Narrow correction

`tools/version_entry_assets.py` changes only the three script/stylesheet entry URLs in staged HTML, adding each file's SHA256. It never rewrites runtime JavaScript/CSS or clears browser storage. The new bootstrap and styling therefore cannot use the pre-demo cache entries. This is entry-asset versioning, not a claim of complete immutable transitive-module packaging.

Five build tests cover exact output, untouched asset bytes, idempotence, changed-content versions, and fail-closed missing/duplicate entries. A parallel required cache-upgrade job repeats the actual old-cache browser sequence and requires working click handlers, automatic shot advancement and preserved scores. The diagnostic-only temporary workflow is removed.

The existing 157 Node tests, full camera/reliability/demo suites and uncertainty gates are not changed. Deployment still requires all existing tests and the new cache gate. A new post-deployment browser check opens the actual public Pages URL, verifies the published commit and fetched bootstrap hash, clicks the button, waits for 16 shots/70–55 and tests Exit. That result must be inspected before calling the live button verified.

Physical webcam accuracy and the separate intermittent camera-round timing issue are not resolved by this asset-loading change. No gameplay, camera, scoring, calibration, clip or saved-data behavior is intentionally changed.
