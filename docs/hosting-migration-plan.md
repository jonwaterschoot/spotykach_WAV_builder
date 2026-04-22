# Hosting Migration & Feature Roadmap
> Context file for follow-up development session — load this into your code-aware project alongside the app source.

---

## App Overview

A **sample manager / manipulator webapp** hosted on **GitHub Pages**, built for a hardware music device that loads a 6×6 grid (36 slots) of audio samples from an SD card.

### Core existing features
- Local-first architecture: projects, user samples, and a local sample collection are stored in local folders
- Built-in audio editor
- Sample browser (currently 2 community packs, ~300 MB total, hosted directly on GitHub)
- Ability to move samples between slots, add notes, configure settings per slot
- Export to SD card format: converts to **32-bit float / 48kHz / Stereo WAV**, wrapped in the device's strict folder structure
- Local save/load of projects (no remote project loading yet)

### What does NOT exist yet
- Remote/community project loading
- Additional community sample packs (2 more planned)
- Pre-exported SD-card-ready zip downloads
- Cloudflare R2 (or any CDN) integration — samples currently served straight from GitHub

---

## Audio Format Reference

| Use | Format | Size per file (42s max) | 36-file pack |
|-----|--------|------------------------|--------------|
| In-app / browser | FLAC stereo 48kHz | ~8–9 MB | ~300 MB |
| SD card export | WAV 32-bit float / 48kHz / Stereo | ~15.4 MB | ~553 MB (zip ~530 MB) |

WAV zips compress very little (~5%). FLAC is already compressed; zipping gains nothing.

---

## Current Hosting Situation & Problem

| Asset | Current location | Issue |
|-------|-----------------|-------|
| App code | GitHub Pages | Fine |
| FLAC sample packs (×2) | GitHub repo | ~300 MB used, approaching 1 GB Pages limit with more packs |
| SD card zips | Not yet built | Each ~530 MB — cannot fit in GitHub Pages budget |
| Project files | Not yet remote | — |

GitHub Pages hard limits:
- **1 GB** max published site size
- **100 GB/month** soft bandwidth cap
- 100 MB max individual file size (CLI), 25 MB via browser

With 2 more FLAC packs (~300 MB each) planned, the repo will exceed the 1 GB ceiling. SD card zips (~530 MB each) make GitHub hosting completely unviable for those assets.

---

## Target Architecture

### Asset hosting: Cloudflare R2
- No egress fees (critical for binary file downloads)
- Free tier: 10 GB storage, 1M requests/month — sufficient for sub-100 downloads/month
- Native support for **signed URLs** (time-limited, scraping-resistant download links)
- Already integrated with Cloudflare CDN

**What moves to R2:**
- All FLAC sample packs (existing 2 + 2 new)
- All SD card ready zips (2–3 projects)
- Optionally: community project JSON files (lightweight, could also stay in repo)

**What stays on GitHub Pages:**
- App code
- A lightweight `manifest.json` listing available packs and projects with their R2 URLs and metadata

### Project file format
- Small JSON file (KB range) per community project
- References samples by URL (R2 FLAC URLs) rather than local paths
- Contains: slot assignments (6×6 grid), per-slot notes, settings, pack metadata
- Mirrors the existing local project format — remote URLs replace local paths
- Needs to be designed/confirmed against the existing local project schema

### Three deliverable types per community project

1. **FLAC sample pack** — organized folder structure, hosted on R2, loaded in app sample browser
2. **App project file** — JSON, references R2 FLACs, loadable in webapp for editing/tweaking
3. **SD card zip** — pre-exported, WAV format, device folder structure, hosted on R2, direct download (no app needed)

---

## Feature Buildout Order

### Step 1 — Migrate sample hosting to R2
- Set up Cloudflare R2 bucket
- Upload existing 2 FLAC packs
- Update sample browser URLs in app to point to R2 instead of GitHub
- Add `manifest.json` to repo listing packs (name, description, R2 URL, file count, size)
- Verify CORS config on R2 bucket for browser fetch

### Step 2 — Add 2 new FLAC packs
- Upload to R2
- Add entries to `manifest.json`
- No app code changes needed if Step 1 is done correctly

### Step 3 — Community project loading
- Define/confirm remote project JSON schema against existing local project format
- Add "Load community project" feature to app:
  - Fetch manifest to list available projects
  - Fetch selected project JSON
  - Map remote FLAC URLs into sample slots (fetch on demand / lazy load)
  - Allow user to tweak and re-save locally
- Create 2–3 community project JSON files, upload to R2 or keep in repo

### Step 4 — SD card zip downloads
- Generate 2–3 pre-exported zips (WAV format, device folder structure)
- Upload to R2
- Add download links in app (direct R2 URL or signed URL depending on access control needs)
- Add entries to `manifest.json`

---

## Scraping Protection (optional, low priority at current scale)
- **Signed URLs**: R2 supports time-limited presigned URLs — generate on user action (click), expire in ~60s
- Prevents direct hotlinking or bulk scraping of zip files
- Adds backend complexity (needs a small serverless function, e.g. Cloudflare Worker, to sign URLs)
- At sub-100 downloads/month, probably overkill initially — revisit if needed

---

## Open Questions (to resolve when looking at the actual code)

1. **Local project file format** — what is the current schema? JSON? What fields? How are sample paths stored (absolute, relative, ID-based)?
2. **How does the sample browser currently fetch files** — hardcoded URLs, a config file, a fetch to a manifest?
3. **WAV conversion** — does the export happen in-browser (Web Audio API / AudioContext)? Or external tool?
4. **CORS** — are there any existing CORS issues with the GitHub-hosted FLACs, or has this already been handled?
5. **R2 public vs private bucket** — decision needed: fully public URLs (simple, scrapable) or signed URLs (needs a Cloudflare Worker)?

---

## R2 Setup Checklist (starting point)
- [ ] Create Cloudflare account (if not already)
- [ ] Create R2 bucket
- [ ] Configure CORS policy to allow requests from your GitHub Pages domain
- [ ] Upload existing FLAC packs
- [ ] Set bucket to public or configure Worker for signed URLs
- [ ] Update app sample browser URLs
- [ ] Create and publish `manifest.json`
- [ ] Test in-browser fetch of FLAC files from R2
