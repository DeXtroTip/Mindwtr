# Mindwtr Unreleased

Changes collected since the latest stable release.

## Full Change List

- Desktop and mobile: **OpenCode Go** is now an AI provider option alongside OpenAI, Gemini, and Anthropic. Add its API key in AI settings and pick a model (defaults to `gpt-5.6-luna`); requests use the official OpenCode Go endpoint with a per-editor session so routing stays stable within one interaction. The reasoning control lists the levels the selected model accepts (`Max` for Kimi K3, `Low`/`High`/`Max` for GLM-5.3-Flash, and so on) and shows no control plus an explanation for models whose thinking cannot be tuned; requests omit `temperature` for the models that reject it. Keys stay on the device and never sync.
