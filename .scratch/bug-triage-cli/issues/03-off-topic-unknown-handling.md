# 03: Off-topic / unknown-component handling

**What to build:** Off-topic or non-actionable reports are never rejected — they're still classified and filed, tagged so they're visibly deprioritized instead of given fabricated confidence.

**Blocked by:** 01

**Status:** done

- [x] Off-topic input (e.g. Set B6, a feature request) is still classified and filed as an issue — never rejected, never `NOK`
- [x] Whenever classification resolves to `components` being only `['unknown']`, the CLI forces `severity` to `low` in code after classification, regardless of what the model returned for severity
- [x] Feeding Set B6 creates an issue tagged `unknown` component and `severity/low`
