# User Scene Images

Put new play-scene images in this folder:

`F:\AI\tiu_world\worldgame\public\assets\user-scenes`

Supported formats:

- `.webp`
- `.png`
- `.jpg`
- `.jpeg`
- `.gif`
- `.avif`

Recommended file names:

- Use English lowercase words.
- Use hyphens instead of spaces.
- Example: `midas-hand-archive.webp`, `korea-barrier-night.webp`, `antarctic-hollow-map.png`

The game exposes these files as:

`/assets/user-scenes/<file-name>`

Optional metadata lives in `manifest.json`. Add an item for any image that should match specific story words:

```json
{
  "file": "midas-hand-archive.webp",
  "title": "MIDAS HAND ARCHIVE",
  "detail": "Reporter archive / deleted article trail",
  "keywords": ["midas", "마이더스", "기자", "취재", "archive", "deleted article"],
  "priority": 100
}
```

If you only add the image file and skip metadata, the game still uses the file name as keywords.
