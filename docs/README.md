# Documentation index

Every documentation file in the repository, what it is for, and whether it is still true.

*Last reconciled 2026-08-19, when v4 shipped and the two v4 documents moved to `archive/`.*

**Status key** — 🟢 current · 🔵 reference (stable, rarely changes) · 🟡 partly stale · 🗄️ archived ·
⚠️ **load-bearing — code or the app links to it, do not move**

---

## The live documents

These two are the ones to keep up to date. Everything else is reference material.

| File | Status | What it is |
|---|---|---|
| [../roadmap-bugs.md](../roadmap-bugs.md) | 🟢 | Active roadmap, feature requests and bugs. Opens with **Open** — the loose ends v4 shipped with — then the roadmap beyond v4, then a short "settled, don't reopen" list and pointers to where closed work went. Rewritten 2026-08-19 when v4 shipped; nothing closed is kept in it. |
| [../CHANGELOG.md](../CHANGELOG.md) | 🟢 | Released work, newest first. The 4.0.0 entry is the summary of what v4 changed. |

**Which file holds what, now:** these two are the only live documents. `roadmap-bugs.md` is the only
place work is tracked; `CHANGELOG.md` is the only place shipped work is described. The v4 plan and intent
documents moved to `archive/` on 2026-08-19 and are read, not updated. The test pass is
[archive/v4-test-rounds.md](archive/v4-test-rounds.md).

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
| [presets-samples/submission-workflow.md](presets-samples/submission-workflow.md) | 🟢 | Where the submission workflow stands, the seven things in its way, and the staged plan. **Holds the answer to `V4_PERVAK.md`'s open question 6:** the app guides creation, the submitter sends files over email or Discord, the maintainer commits them. |
| [WAV-CUE/guide/videotutorial/videotutorialscript.md](WAV-CUE/guide/videotutorial/videotutorialscript.md) | 🔵 | Draft scripts for a long tutorial and a short reel. Starting point, not a commitment. |
| [../scripts/normalize-audio.md](../scripts/normalize-audio.md) | 🔵 | How the normalization script is used. |

## Development notes

| File | Status | What it is |
|---|---|---|
| [style_guide_colors.md](style_guide_colors.md) | 🔵 | Tape colours and the app palette. |
| [debugging/README.md](debugging/README.md) | 🔵 | What `DragDebug.tsx` was for and how to re-mount it. The component was removed from `App.tsx` deliberately and kept here beside its notes. |
| [debugging/crossfade_technique.md](debugging/crossfade_technique.md) | 🔵 | Crossfade approach notes. |
| [optimization-plan.md](optimization-plan.md) | 🟢 | **The working plan for the `optimize` branch.** Ranked tasks with the survey already done — the ffmpeg singleton, an 18-copy Escape-handler duplication, four disagreeing byte formatters, and the `App.tsx` / `exportUtils.ts` approach. Pick a task up without re-deriving the measurements. Also records what was decided against, and why. |
| [deployment_guidelines.md](deployment_guidelines.md) | 🟢 | **The deploy workflow** (`npm run deploy`, manual, from your machine — pushing to `main` does not publish), plus storage namespacing and asset-path resolution. Rewritten in v4 Phase 7: the stale `build-versioned-pages.mjs` and GitHub-Releases-samples material moved to a historical notes section, and Appendix F.2/F.3 of `V4_PERVAK.md` was folded in — which is why the deployment story survived that file being archived. Revised 2026-08-19 when the `/next/` preview deploy and the `/v2` stub were removed. |

## Not in git

| File | What it is |
|---|---|
| `MOBILE_TESTING.private.md` | Personal tunneling/testing notes. `*.private.md` is gitignored. |

## Elsewhere in the repo

- `public/news/*.md` — the in-app news feed. Content, not documentation; each release adds one.

---

## `archive/`

Documents that are no longer true, kept because they record why something was done. Nothing in
`archive/` should be linked as guidance. See [archive/README.md](archive/README.md).
