---
title: "Media Processing"
updated: 2026-04-29
tags: [category/feature, media-processing, ffmpeg, imagemagick, skill]
summary: "The media-processing skill provides FFmpeg video encoding, ImageMagick image editing, and background removal as optional local media capabilities."
---

The `media-processing` skill provides local media manipulation through FFmpeg, ImageMagick, and `rmbg-cli` for background removal.

## Capabilities

- FFmpeg video encoding and transcoding
- ImageMagick image editing and transformation
- Background removal via `rmbg-cli`

## Setup

```bash
brew install ffmpeg imagemagick
npm install -g rmbg-cli
```

All three are optional dependencies. The plugin functions without them for all other commands.

## Related Pages

- [[ai-multimodal]] — Gemini API for AI-driven media understanding (complement to local processing)
