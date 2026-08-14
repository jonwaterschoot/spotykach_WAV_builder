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

## Expected arrivals

- `V4_PERVAK.md` and `UX_Overhaul.md`, once v4 ships — see Phase 7, step 7 of the former. Not before:
  its appendices are still the only record of the reasoning behind several v4 decisions, and Phase 7
  is being run out of that file.
- `deployment_guidelines.md`, if its still-accurate asset-path section is folded elsewhere rather than
  repaired in place.
