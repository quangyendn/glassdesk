---
title: "AI Multimodal"
updated: 2026-04-29
tags: [category/feature, ai-multimodal, gemini, skill]
summary: "The ai-multimodal skill enables image generation/analysis, video processing, and audio transcription via the Gemini API."
---

The `ai-multimodal` skill enables image, video, and audio processing through the Gemini API (`gemini-2.5-flash`), available as an optional dependency.

## Capabilities

- Image generation and analysis
- Video processing
- Audio transcription

## Setup

```bash
pip install google-genai
export GEMINI_API_KEY=<your-key>
```

This is an optional dependency. Commands that do not require multimodal processing function without it.

## Related Pages

- [[media-processing]] — FFmpeg/ImageMagick pipeline for local media manipulation
- [[model-tier-policy]] — external tier uses Gemini CLI for scout-external agent
