# Local playback compatibility check, 2026-11-19

The desktop fork integrates the playback-only Android v5 signing and player
model request changes from upstream c33ab40 (7.5/7.6 source). It retains the
existing UI, local language selection and bundled Account Hub Studio fonts.

Upstream release reference
https://github.com/jackotom/hongguo-drama/releases/tag/v7.5

## Regression and live checks

- 51 upstream protocol, pacing, response identity, cancellation and signing vector checks passed.
- Both existing App source check scripts passed.
- A randomly selected real Hongguo drama, 一把杀猪刀，供出女状元,
  series ID 7705844953598938137, failed before the change with App EMPTY_RESPONSE.
- The same first episode returned a playable source after the change.
- The rebuilt Windows executable played episodes 1 and 2 at 1080 × 1920.
  Each advanced past 10 seconds with video volume zero and muted true.
  The QA driver explicitly resumed playback when the isolated hidden test window paused.
- Tests used a separate profile and downloads directory. No user session, account
  data, signed media addresses or content keys are recorded here.
- The detail loading indicator rendered through the normal card click state.
  Icon and label centers matched the loading area center at widths 1366, 760 and
  480 pixels.

The Windows executable is unsigned. The live evidence covers these two
episodes on this machine and network.
