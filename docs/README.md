# Documentation index

Every documentation file in the repository, what it is for, and whether it is still true.

*Last reconciled 2026-08-14, during v4 Phase 7.*

**Status key** — 🟢 current · 🔵 reference (stable, rarely changes) · 🟡 partly stale · 🗄️ archived ·
⚠️ **load-bearing — code or the app links to it, do not move**

---

## The live documents

These two are the ones to keep up to date. Everything else is reference material.

| File | Status | What it is |
|---|---|---|
| [../roadmap-bugs.md](../roadmap-bugs.md) | 🟢 | Active roadmap, feature requests and bugs, with a done/reviewed archive at the bottom. |
| [../CHANGELOG.md](../CHANGELOG.md) | 🟢 | Released work, newest first. |

## In flight — retired when v4 ships

| File | Status | What it is |
|---|---|---|
| [../V4_PERVAK.md](../V4_PERVAK.md) | 🟢 | The v4 plan of record: phases, locked decisions, open items and the appendices behind them. **Moves to `archive/` when v4 ships** — see its Phase 7, step 7. |
| [../UX_Overhaul.md](../UX_Overhaul.md) | 🟢 | The intent document behind v4: personas, user journeys, UX thinking. Same fate. |

## Project-level

| File | Status | What it is |
|---|---|---|
| [../README.md](../README.md) | 🟢 | The public front door: what the app is, how to run it. |
| [../CONTRIBUTING.md](../CONTRIBUTING.md) | 🟢 | How to contribute. |

## Hardware & format reference

Slow-moving, and the only written record of several device behaviours. Keep.

| File | Status | What it is |
|---|---|---|
| [configtxt/configtextsettings.md](configtxt/configtextsettings.md) | 🔵 | `config.txt` format: 8-char keys, 4-byte values, strictly positional two-line pairs. The reason the parser is positional and a comment line would break the file. Paired with `configtxt/config_examples/config.txt`. |
| [WAV-CUE/wavcueinstructionsresearch.md](WAV-CUE/wavcueinstructionsresearch.md) | 🔵 | Developer spec for slice points → hardware. |
| [WAV-CUE/slice_implementation_summary.md](WAV-CUE/slice_implementation_summary.md) | 🔵 | How the `cue ` chunk is actually written, as built. |
| [how_to_copy_to_SDcard.md](how_to_copy_to_SDcard.md) | ⚠️ 🟢 | The README that ships **inside every export ZIP**. Imported at build time by [`exportUtils.ts`](../src/utils/exportUtils.ts) as `?raw` — moving or renaming it breaks the build. |

## Guides and user-facing material

| File | Status | What it is |
|---|---|---|
| [presets-samples/README.md](presets-samples/README.md) | ⚠️ 🟢 | Submission guide for guest artists and users sharing presets. **Linked from inside the app** (`AboutHelpModal`) and from the root README by absolute GitHub URL — moving it breaks both. Its `img/` folder holds the screenshots and videos the help modal embeds. |
| [../public/presets/README.md](../public/presets/README.md) | 🟢 | The maintainer-side counterpart: manifest descriptors, R2 deployment, normalization scripts. |
| [WAV-CUE/guide/videotutorial/videotutorialscript.md](WAV-CUE/guide/videotutorial/videotutorialscript.md) | 🔵 | Draft scripts for a long tutorial and a short reel. Starting point, not a commitment. |
| [../scripts/normalize-audio.md](../scripts/normalize-audio.md) | 🔵 | How the normalization script is used. |

## Development notes

| File | Status | What it is |
|---|---|---|
| [style_guide_colors.md](style_guide_colors.md) | 🔵 | Tape colours and the app palette. |
| [debugging/README.md](debugging/README.md) | 🔵 | What `DragDebug.tsx` was for and how to re-mount it. The component was removed from `App.tsx` deliberately and kept here beside its notes. |
| [debugging/crossfade_technique.md](debugging/crossfade_technique.md) | 🔵 | Crossfade approach notes. |
| [deployment_guidelines.md](deployment_guidelines.md) | 🟡 | **Half true.** The asset-path resolution section still describes `assetUtils.ts` accurately. The rest documents `scripts/build-versioned-pages.mjs`, **which no longer exists** — `scripts/` holds only `generate-manifest.mjs`, `normalize.py` and `collect-release-samples.ps1`. Fix the second half or archive the file; tracked as v4 Phase 7, step 7. See Appendix F.4 of [../V4_PERVAK.md](../V4_PERVAK.md), which also has the current Pages deployment story. |

## Not in git

| File | What it is |
|---|---|
| `MOBILE_TESTING.private.md` | Personal tunneling/testing notes. `*.private.md` is gitignored. |

## Elsewhere in the repo

- `public/news/*.md` — the in-app news feed. Content, not documentation; each release adds one.
- `public/v2/index.html` — a redirect stub left from the versioned v1/v2 deploy. Retire it with the
  deployment guidelines.

---

## `archive/`

Documents that are no longer true, kept because they record why something was done. Nothing in
`archive/` should be linked as guidance. See [archive/README.md](archive/README.md).
