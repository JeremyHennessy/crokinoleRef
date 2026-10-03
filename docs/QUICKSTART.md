# First game setup

## Smart setup — start here

After connecting the webcam, Crokinole Ref automatically tries to find the board. It looks for the large round light playing surface, identifies the dark 20 hole, uses those two features to correct the camera perspective, then searches the straightened image for the three printed scoring circles. If confidence is high enough, it opens a preview automatically. You can also press **Find board automatically** at any time.

**No calibration clicks and no puck are required for this step.** The coloured guides must still be checked before pressing **Use this calibration**. The gold outer guide is the detected playing-surface boundary; the other guides should follow the printed scoring circles. The straightened preview should look circular. Smart setup estimates the initial puck radius from board geometry; later detection provides the practical check.

If the board, 20 hole, or scoring circles cannot be found confidently, nothing is applied. Improve framing/lighting and try again, or open **Manual fallback**. A failed automatic attempt does not damage the previous calibration.

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

## Teach the detector your empty board and puck colours

After applying calibration, remove ALL pucks and hands and press **Save empty board**. Then place one puck from each team. Press **Sample team A**, click that puck's solid centre in the camera image, and repeat for B. Do not sample a highlight or shadow. An updated calibration deliberately clears the old background/colour setup.

Recalibrate and capture a new empty reference after moving the camera or board, or changing lighting. Camera capture mode is a request, not a guarantee: compare reported, observed and analysed frame rates. About 33 ms separates frames at 30 fps, so multiple contacts may happen between them. The app never guarantees first-contact order.

## Automatic tracking, scoring and clips

After the empty-board reference and both team colours are set, puck tracking runs continuously. There is no per-shot tracking button.

With **Auto scoring** enabled, the tracker watches for meaningful puck movement, starts a shot, waits until the board has remained settled, and then calculates the visible board score. Pucks fully inside the 15/10/5 zones are scored from their corrected board positions. A puck close enough to a scoring boundary or centre is marked for review; the suggested lower-zone score can still be displayed, but uncertainty remains visible.

A 20 is added automatically only when one tracked puck has a continuous trajectory into the centre-hole region and then disappears without a frame-delivery gap or competing ambiguous centre disappearance. A puck disappearing elsewhere is not called a 20. If identity is lost in an unexplained location, confidence falls and the scoreboard update can be withheld for review.

With **Auto clips** enabled on a live camera, recording starts when the shot detector sees puck motion and stops shortly after the board settles. This reuses the same browser MediaRecorder path as manual clips. It does **not** yet include true pre-roll, so the first movement frame may precede the recorded clip by a small detection/recorder delay. Manual recording remains available.

The scoreboard is updated only for shot-end states above the confidence threshold. Manual point buttons remain available as corrections, and Undo restores the previous score state. Finishing a round resets the tracked 20 count and automatic shot count for the next round.

Automatic scoring is not an automatic foul/legal-shot engine. Contact candidates, hand occlusion, combinations and first-contact order still need separate evidence/review.

## Try without a camera

**Try the demo** generates synthetic discs locally. Four reference ticks are included for practicing the guide. Synthetic success is not proof of real-camera accuracy. The demo does not change match scores or create real-shot recordings.

## Record and review a shot

With **Auto clips** enabled, live-camera clips start from detected puck motion and stop after settlement. Manual clip controls remain available, and manual clips stop after 30 seconds. Recording also works without completed vision setup when started manually; untracked video remains useful for human replay.

Open **Review** in the shot library. Normal, half and quarter speed are available. The +/-33 ms buttons are approximate time seeks, **not guaranteed frame stepping**. They cannot recover missing frames. Candidate contacts are listed separately; the exported video has no overlays burned in.

Set your own decision and notes only after review. All automatic conclusions remain disabled. A candidate means two detected discs came close in sampled frames; it is not proof of impact, causal direction or which contact came first. Missing discs, hands and tracking gaps do not become fouls or 20s. Imported videos can be replayed and explored in the board view, but their experimental live analysis is not persisted to the clip log in v0.1.

Export each video to keep it. Export the match JSON to preserve review notes. **Clips and review notes are lost on reload or tab closure.** A leave-page warning is only best-effort. Limits: six clips, 64 MB per clip and 128 MB total. No footage is uploaded by this app.

## Scorekeeping

With **Auto scoring** enabled, a reliable settled shot replaces the current round score with the detected visible-disc total plus confirmed tracked 20s. Manual +5/+10/+15/+20 buttons remain available for corrections, and Undo restores the previous score state. If tracking confidence is below threshold, the existing score is held and the Auto referee status asks for review instead of changing it.

Finish round still remains a deliberate human action. It totals the selected mode: casual difference scoring awards only the margin, while match-point mode awards 2 for a win, 1 each for a tie and 0 for a loss. The mode is locked after a completed round; start a new match to change it.

Scores and round history persist in local browser storage when available. Full tournament structure, timed-round exceptions, tie-breaks and automatic foul/legal-shot rulings are not implemented.

The [World Crokinole Championship rules](https://www.worldcrokinole.com/thegame.html) allow own-disc-first combination shots that meet the opponent-contact requirement. First contact alone is therefore not a complete rules engine. A disc touching a scoring line receives the lower score; close cases need human inspection. Tournament timing exceptions and complete match structures are outside this prototype.

## Browser and privacy notes

Use the published HTTPS website, or localhost for development. Browser camera permission applies to the website origin. Camera mode support, frame delivery and recorder codecs vary by device/browser, so physical-camera verification is still required. Stop/disconnect releases the video track. No microphone, cloud inference, analytics, uploads, accounts or API keys are used. The website's static assets are ordinary GitHub Pages requests; local scores share that origin's storage security boundary with any other apps served on that origin.

Browser behavior references: [camera permission and constraints](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia), [video frame callback limitations](https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement/requestVideoFrameCallback), [MediaRecorder](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder).
