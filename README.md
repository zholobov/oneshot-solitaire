# One-shot Solitaire

A benchmark: the same Solitaire-PWA prompt is given to frontier and local models, one attempt
each, and the results are published exactly as generated.

Live: https://zholobov.github.io/oneshot-solitaire/

## Layout

```
index.html          the log — the prompt and one section per round
<YYYY-MM>/<model>/  one attempt, as generated (builds with a dist/: source + committed dist/, served from dist/)
```

## Adding a round

1. Run each model in its own scratch directory **outside this repo** (so it can't see earlier attempts).
2. Copy the result into `<YYYY-MM>/<model>/` and commit it untouched ("Original one-shot output, untouched").
3. If a deploy-only fix is unavoidable (e.g. absolute paths that break under a subpath), make it a separate,
   clearly labelled commit.
4. Add a section for the round at the top of `index.html` and push — GitHub Pages serves `main`.
