# First game setup

## Watch a full demo round

Press **Watch a full round** on the board's welcome screen. No camera, permission prompt or calibration is needed. A scripted exhibition plays 16 alternating shots (eight per team) in about 68 seconds at normal speed, with draws, bumps, takeouts into the gutter and three banked 20s. The board is animated; the demo score, remaining shots, point ledger and shot log advance after each shot. It stops at the completed round instead of starting over silently.

**Pause / Resume**, **½× / 1× / 2× speed**, **Skip to next shot** and **Replay round** control only the synthetic animation. **Next demo round** alternates the starting team. The round award uses the selected Difference or Match points mode. **Exit demo** restores the original match scores, names and layout. The demonstration never records clips or writes its scores to your saved match or clip library. Hiding the tab pauses the demo; Resume continues it. The original **quick demo** is still available for the short detector-driven example.

This is an illustrative script, not a physics model or proof of legal shots, contact order, automatic 20 detection, or camera accuracy. Its 20s and shot count are supplied by the script. Real games retain the existing evidence checks and manual 20 confirmation.

## Automatic setup and normal play

Connect the webcam on a computer browser. Keep the full board visible in a fixed view, including the outer printed circle. An angle around 45° is supported experimentally. Use even lighting, and compare camera-reported, observed and analysed frame rates; requested camera settings are not a guarantee.

**Smart setup** tries to find the playing surface, 20 hole and three scoring circles automatically. Inspect the coloured overlay and straightened preview before pressing **Use this calibration**. The fit indicator is a heuristic, not a measured accuracy probability. If the fit is poor, retry or use the manual guide below.

Clear all pucks and hands, then press **Save empty board**. Show one separate stationary puck of each colour, away from the hole, and remove your hands. With **Detect team colours automatically** enabled, the palette locks after repeated observations. The same observations measure puck radius and its uncertainty. This is an image measurement, not physical millimetre certification. Team A/B names identify the assignment, not the people; check the labels. Manual sampling remains a fallback for poor contrast.

Choose a **Game format**: Casual (12 per team), Singles (8), Doubles (12), or Custom (1–12). Choose the first starting team or let the first observed launch establish it. Later rounds alternate the known starting team. Remove both teaching pucks and wait for the clear-board start. With automatic scoring, clips and round completion enabled, no routine per-shot Record or Finish-round click is needed.

The round counter requires a newly introduced shooting-edge puck with observed inward travel. It does not count every collision, infer completion from silence, or equate surviving pucks with shots remaining. After both allocations are exhausted, settlement, accepted scoring and the final recording must complete before the round advances once. Clear the old board before the next round.

If a launch is missed or hidden, the turn sequence is inconsistent, or the camera is interrupted, automatic completion pauses. **Correct an uncertain shot count** accepts a player-confirmed number of UNPLAYED pucks for each team. Review the board score before continuing. This cannot prove whether a hand-carried disc was flicked; physical-game accuracy remains unverified.

## Manual fallback: guided calibration

Choose **Angled view · around 45°** for an oblique camera, or **Overhead** only when the board already looks circular. The angled option corrects the board plane before experimental tracking. It does not recover hidden pucks, improve the camera's frame rate, remove lens distortion, or correct the height of pegs/pucks above the board.

Keep the entire scoring circle visible. Place one stationary puck on the board, remove your hands and choose **Open calibration guide**. The image freezes. Each step has a plain-language instruction, an illustration, numbered click markers and a pointer magnifier on larger screens. The illustration is not your camera view.

### Angled camera: nine clicks

| Click | Where to click | Avoid |
|---|---|---|
| 1 | Centre of the 20-hole opening at the playing surface | A puck, peg, or the bottom of the hole |
| 2–5 | The four actual quarter/divider marks where they meet the outer printed shooting circle, going around the board clockwise | Guessed top/bottom/left/right extremes of the oval; the wooden rail or gutter |
| 6 | The smallest printed scoring circle, between pegs: the 15-point line | A peg's top |
| 7 | The middle printed scoring circle: the 10-point line | The outer shooting circle |
| 8 | Centre of the top face of a clearly visible puck | Its shadow |
| 9 | Edge of that SAME puck, preferably its left or right edge | Another puck or its shadow |

Start quarter mark A at any clearly visible quadrant mark; it does not have to appear at the top of the camera image. B is the next mark clockwise, C is opposite A and D is opposite B. These must be four physical quarter-turn marks on the same circle. If they are absent or hidden, cancel instead of guessing; recording and manual replay do not require calibration.

### Overhead camera: six clicks

Click the centre hole, the 15 line, the 10 line, the outer printed shooting line, a puck centre, then the edge of that same puck. The detailed instructions and illustration change after every click.

### Check before applying

The guide does not change the active calibration while you are clicking. **Undo last click** goes back one point; **Retake image / start over** takes a fresh image; **Cancel** keeps the previous calibration. Once all points are placed, inspect the guides on your actual image and the straightened preview. They should follow the printed rings all the way around. Only press **Use this calibration** when the fit looks right. A geometry fit is not a verified referee decision.

The centre hole is used together with the four quarter marks in a best-fit perspective solution. This is deliberately tolerant of a small amount of manual click error and ordinary webcam lens distortion. Misordered, repeated, off-frame or grossly inconsistent points are still rejected. The displayed residual is a fit diagnostic, not a guarantee of millimetre accuracy; the coloured ring overlay remains the final calibration check.

## Play view and scoring reviews

**Play view** puts the camera, scores, remaining shots and current state together. **Review board** returns to the correction controls; **Setup view** restores the original layout. Neither changes game rules or calibration.

A settled visible-board score can update automatically only when its evidence checks pass. Frame gaps, unresolved foreground, missing pucks, possible 20s and close scoring lines hold the score. Yellow region/cluster outlines are review prompts, not scored pucks. Predictions and reacquired identities are not substitute image evidence. An unresolved puck-sized region blocks automatic scoring even when the disc was never tracked earlier.

The app does not award a confirmed 20 merely because a puck disappears near the centre. Inspect the board/replay, bank the confirmed 20 with **+20** or the editable **Confirmed 20s** count, then use **Use reviewed board score**. No automatic legal/foul or verified first-contact verdict is provided. A contact marker means observed proximity, not proof of impact or contact order.

For a detector error, select **Missing disc** or **Correct detected disc**, choose its team/value, and click its position in the camera view. Review the complete board before applying. Missing-disc annotations reconcile with an unambiguous later detection at that location rather than count twice. Board annotations expire when a new shot or calibration makes the observation stale; they never silently follow a moving puck.

Confirmed 20s and signed **Round adjustments** are separate ledgers. Enter replacement values to subtract an incorrect entry. Existing +5/+10/+15 buttons remain persistent round adjustments, not missing-disc corrections; do not use them for a disc that may be detected again. Undo restores the preceding score state and pauses automatic scoring for review.

Finish-round remains a manual fallback, blocked during an active shot/clip. Automatic completion also waits for score review and the clip. Difference mode awards the round margin; match-point mode awards 2 for a win, 1 each for a tie, and 0 for a loss. Full tournament structure and timing exceptions are not implemented.

## Clips, pre-roll and local storage

With **Auto clips** and **Include pre-shot footage** enabled, wait for **Pre-shot buffer ready** before shooting. An already-running local recording is retained when motion is detected and continues through settlement. Its nominal lead-in is about 2–4 seconds after warm-up; the estimated lead-in is shown per clip. Early shots may have less. With unavailable/disabled buffering, recording starts on detected motion. Manual clips remain available, including without completed vision setup.

Unused buffered footage is discarded locally. Changing source/calibration, hiding the tab or disconnecting discards stale idle footage. Extra encoding can affect performance on a physical computer; turn pre-roll off if capture cannot keep up. See [BUFFERING.md](BUFFERING.md).

Open **Review** to replay a clip at normal, half or quarter speed and save human notes. The +/-33 ms buttons are approximate seeks, not guaranteed frame stepping. They cannot recover missing footage. Exported videos contain the original encoded pixels, not burned-in overlays.

Completed clips and saved review notes go into this browser's local IndexedDB library. **Saved** appears only after the storage transaction completes. A blocked/private-mode/quota failure retains the in-tab clip with **NOT SAVED**; export it before closing. Reload should recover successfully saved clips without reopening the camera. Deletion removes the local record, with confirmation.

Use **Export match with clips** for one ZIP containing original videos, match metadata and replay configurations. Limits: 120 clips, 64 MB per clip and 256 MB total video bytes. Nothing is silently evicted. Site-data clearing or browser eviction can remove local storage; keep an exported backup. A persistent-storage request is not a backup guarantee.

## Diagnostics, imported footage and privacy

**Export diagnostics** downloads recent observations, uncertainty regions, timing/settings and the empty-board reference needed to reproduce analysis. ZIP replay fixtures also include empty-board pixels and can show your room. Review exports before sharing. No footage is uploaded automatically. The local recorded-video harness and optional independent labels are documented in [RELIABILITY.md](RELIABILITY.md). Without labels, a report contains observations, not an accuracy percentage.

**Try the demo** uses synthetic discs and isolated preview scores. Imported local clips can be replayed and explored without uploads; their temporary scores do not overwrite the live match. Disconnect restores the live scoreboard. A real recording with a matching replay fixture is required for physical-camera benchmarking; a still image or synthetic test is not equivalent.

Use the HTTPS site or localhost, not file://. Camera permission applies to the website origin. No microphone, cloud inference, analytics, account or API key is required. GitHub receives normal requests for static files. Other apps on the same origin share the browser storage security boundary. Recalibrate and recapture an empty reference when the board, camera or lighting moves.

Rules reference: [World Crokinole Championship](https://www.worldcrokinole.com/thegame.html). Own-disc-first combinations can meet the opponent-contact requirement, so first contact alone is not a complete rule engine. A puck touching a scoring line gets the lower value; uncertain line calls require inspection. Browser references: [camera constraints](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia), [frame callbacks](https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement/requestVideoFrameCallback), [MediaRecorder](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder).
