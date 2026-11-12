# Sign animation clips

The Learn Signs module loads clips from this folder. The app never generates or substitutes a clip. If a file is
missing, the app shows "Animation not available yet" for that sign.

## Expected files

| Category | Path                          | Status                                |
| -------- | ----------------------------- | ------------------------------------- |
| Alphabet | `alphabet/A.mp4` to `Z.mp4`    | Add each clip when it has been made   |
| Numbers  | `numbers/<digit>.mp4`          | Add only after the sign is verified   |
| Words    | `words/<name>.mp4`             | Add only after the sign is verified   |

Use uppercase letters for alphabet file names. Clips should be MP4 (H.264), muted, and short. Each clip should
show one sign from start to finish.

Clips are only shown after a sign has a verified mapping in `src/data/signLibrary.js`. Numbers and words are
hidden until they are marked verified there.
