# Archive

Documentation that has stopped being true, kept because it records *why* something was built the way
it was. **Nothing here is guidance.** If you are looking for how the app works today, start at
[../README.md](../README.md).

Rules of thumb for what lands here:

- The work it describes shipped, and the current state is documented elsewhere.
- It plans something that was superseded by a different decision.
- It documents a script, file or component that no longer exists.

A file that is merely *old* is not archived — the hardware and format references in `docs/` barely
change and are still the only written record of several device behaviours.

| File | Archived | Why |
|---|---|---|
| [sample_manager_planningnotes.md](sample_manager_planningnotes.md) | 2026-08-14 | Planning notes copied out of `roadmap-bugs.md` for the user sample pool and libraries. The work shipped in 2.0.1; the file says so in its own first lines. |
| [v4-test-rounds.md](v4-test-rounds.md) | 2026-08-18 | The v4 test pass, round by round — eleven rounds over the five hub doors, 38 findings, all built and walked. Moved out of `roadmap-bugs.md` so that file could go back to being a short list; Round 5, the editor with a project behind it, was added on 2026-08-19 when it closed. Kept because several findings turned on a cause that was not where it looked: Tailwind v4's hover gate (S1-15), an expired transient activation (P1-1), a `move()` that exists but is refused (C1-1), and a transport flag whose only reset was an event that never fired (Round 5). |
| [V4_PERVAK.md](V4_PERVAK.md) | 2026-08-19 | The v4 plan of record: phases, locked decisions, open items and the appendices behind them. Archived when v4 shipped. Kept for the reasoning — why *restructure rather than rebuild*, why history is two versions, why the SD card became a build target. Its code links are line-numbered and will drift. |
| [UX_Overhaul.md](UX_Overhaul.md) | 2026-08-19 | The intent document behind v4: personas, user journeys, UX thinking. Archived alongside the plan. Its status header records every place the built app ended up disagreeing with the sketch — four personas became five doors, and the four wireframing boxes were closed as built. |
| [submission-workflow.md](submission-workflow.md) | 2026-08-23 | The staged plan for the submission workflow, and the answer to `V4_PERVAK.md`'s open question 6 — the app guides creation, the submitter sends files, the maintainer commits them. Steps 0–3 shipped as one surface, the submission tool at `#/submit`; step 4, extending `generate-manifest.mjs`, moved to the roadmap. Kept for §3, which is why a pack and a preset are treated as different things, and is still what the tool's shape rests on. |

## Expected arrivals

- `deployment_guidelines.md`, if its still-accurate asset-path section is folded elsewhere rather than
  repaired in place.
