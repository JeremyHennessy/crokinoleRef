# First game setup

## Try the interface first

Open the GitHub Pages site and choose **Try the demo**. The demo is generated locally and runs through the same experimental detector as a camera. It is not evidence of real-camera accuracy. It does not change match scores, access a camera or create real-shot clips.

## Connect your overhead webcam

1. Use a computer browser with the USB webcam connected. Keep the whole board and ditch visible, with the camera directly overhead and securely mounted. Use bright, even lighting without glare. Perspective correction is not implemented.
2. Choose **1080p / 30 fps** initially, then **Connect webcam**. Allow camera permission. The microphone is not requested. A requested mode is a preference; the camera may supply something different.
3. Compare **Camera reports**, **Observed / analysed fps**, and **Largest recent gap**. Observed callbacks are not a guaranteed sensor frame rate. At 30 fps, adjacent frames are about 33 ms apart; two impacts can happen in that interval. The app never guarantees first-contact order.
4. With a disc on the board, choose **Calibrate with six clicks**. The view freezes. Click the centre hole, the 15 ring line, the 10 ring line, the outer 5/shooting line, a disc centre, and the edge of that same disc. The ring overlay should align all the way around. If the board looks elliptical, correct the camera position rather than accepting a poor fit.
5. Remove every disc and hand, then choose **Save empty board**. This reference removes stationary wood grain, pegs and scoring lines from the experimental detector.
6. Place one disc from each team on the board. Sample Team A and Team B at the solid centre of each disc. Adjust colour tolerance only as necessary. Shadows, similar wood-coloured discs, glare, changing exposure and touching discs may defeat detection.

Recalibrate and recapture the background after the camera, board or lighting changes. Calibration is intentionally not silently reused across camera sessions. Small board discs are harder to resolve after analysis is reduced to 640 pixels wide; recording still uses the camera stream.

## Record and review a shot

Choose **Start clip** before shooting, then **Finish clip**. There is **no pre-roll or automatic shot trigger**. The recorder stops after 30 seconds. Recording works without completed vision setup; untracked video remains useful for human replay.

Open **Review** in the shot library. Normal, half and quarter speed are available. The +/-33 ms buttons are approximate time seeks, **not guaranteed frame stepping**. They cannot recover missing frames. Candidate contacts are listed separately; the exported video has no overlays burned in.

Set your own decision and notes only after review. All automatic conclusions remain disabled. A candidate means two detected discs came close in sampled frames; it is not proof of impact, causal direction or which contact came first. Missing discs, hands and tracking gaps do not become fouls or 20s. Imported videos can be replayed and explored in the board view, but their experimental live analysis is not persisted to the clip log in v0.1.

Export each video to keep it. Export the match JSON to preserve review notes. **Clips and review notes are lost on reload or tab closure.** A leave-page warning is only best-effort. Limits: six clips, 64 MB per clip and 128 MB total. No footage is uploaded by this app.

## Scorekeeping

Enter disc values manually with +5, +10, +15 and +20. Use Undo for corrections. Finish round totals the selected mode: casual difference scoring awards only the margin, while match-point mode awards 2 for a win, 1 each for a tie and 0 for a loss. The mode is locked after a completed round; start a new match to change it.

Scores and round history persist in local browser storage when available. No automatic score, winner of a full tournament match, timed-round exception, tie-break or automatic disc-removal ruling is implemented.

The [World Crokinole Championship rules](https://www.worldcrokinole.com/thegame.html) allow own-disc-first combination shots that meet the opponent-contact requirement. First contact alone is therefore not a complete rules engine. A disc touching a scoring line receives the lower score; close cases need human inspection. Tournament timing exceptions and complete match structures are outside this prototype.

## Browser and privacy notes

Use the published HTTPS website, or localhost for development. Browser camera permission applies to the website origin. Camera mode support, frame delivery and recorder codecs vary by device/browser, so physical-camera verification is still required. Stop/disconnect releases the video track. No microphone, cloud inference, analytics, uploads, accounts or API keys are used. The website's static assets are ordinary GitHub Pages requests; local scores share that origin's storage security boundary with any other apps served on that origin.

Browser behavior references: [camera permission and constraints](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia), [video frame callback limitations](https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement/requestVideoFrameCallback), [MediaRecorder](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder).
