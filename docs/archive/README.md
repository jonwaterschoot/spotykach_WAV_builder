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
| [v4-test-rounds.md](v4-test-rounds.md) | 2026-08-18 | The v4 test pass, round by round — ten rounds over the five hub doors, 34 numbered findings, all but one built. Moved out of `roadmap-bugs.md` so that file could go back to being a short list. Kept because several findings turned on a cause that was not where it looked: Tailwind v4's hover gate (S1-15), an expired transient activation (P1-1), a `move()` that exists but is refused (C1-1). |

## Expected arrivals

- `V4_PERVAK.md` and `UX_Overhaul.md`, once v4 ships — see Phase 7, step 7.4 of the former. **Both were
  prepared for the move on 2026-08-18**: everything still open in them was carried into
  `roadmap-bugs.md`, so the move is now `git mv` plus an update to the two index files. What holds it up
  is now only the editor round, the last thing blocking the release; open item O, the four wireframing
  boxes, was closed as built on 2026-08-18.
- `deployment_guidelines.md`, if its still-accurate asset-path section is folded elsewhere rather than
  repaired in place.
