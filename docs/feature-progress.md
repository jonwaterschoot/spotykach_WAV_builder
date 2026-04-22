# Spotykach Hosting Migration & Feature Progress

This file tracks the status of the hosting migration, R2 integration, and remote project presets.

## Roadmap & Progress

- [x] **Infrastructure**
  - [x] Set up `manifest.json` in `public/`
  - [x] Configure R2 Bucket CORS
  - [x] Add R2 Base URL to `resolveAssetPath`
- [x] **Sample Browser**
  - [x] Fetch manifest on load
  - [x] Populate "Built-in Packs" from manifest
  - [x] Test R2 sample playback
- [ ] **Project Presets**
  - [ ] Design Remote Project UI in `ProjectManager`
  - [ ] Implement remote JSON fetching
  - [ ] Implement "Hybrid Loading" (remote samples + auto-save to local)
- [ ] **Direct Downloads**
  - [ ] Add "Exported Zips" section to UI
- [ ] **Documentation**
  - [ ] Define manifest schema (LDoc or README)

## Current Task
- [ ] Remote Project Presets (loading .json projects from R2)

---
*Created by Antigravity on 2026-04-20*
