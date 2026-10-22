# Synthux article: introducing WAV.builder

An article for the Synthux website's news/blog section. It introduces the app and gives an overview. It is **not** a written guide and doesn't replace one.

## Files in this folder

| File | What it's for |
|---|---|
| `README.md` | This plan: the structure, the todo list, the media list |
| `article-draft.md` | The article itself, one heading per paragraph, with a short brief under each |
| `notes.md` | Loose notes, facts pulled from the repo (dates, door names, how the doors link), anything else |
| `media/` | Screenshots and video files for the article, before they get copied to wherever they're published |

## Who it's for

Synthux readers: Spotykach owners and people thinking about buying one. Most have never opened the app. Some used the early version and haven't been back since the hub came in.

## Structure

1. **Intro**: what WAV.builder is, in two or three sentences
2. **Where it came from**: the origin story
3. **Trying to film it all**: the outtakes video, which sets up the rebuild
4. **From one app to a hub with doors**: the v4 rebuild and why
5. **The doors**: a short tour, grouped the way the hub groups them
6. **How the doors connect**: what you can pass from one door to another
7. **A few words I use**: workspace, project, tape, pool, card
8. **Spotlight: the Sample Mangler**: the newest door, with the videos
9. **What this isn't, and where to go next**: help, news, Discord, submit a pack
10. **Thanks**: Synthux, contributors, pack makers

The outtakes video goes in section 3 on purpose: trying to cover everything in one take shows how much there was to take in at once, and that leads into why the app became a hub. If you'd rather keep it light, it also works as a closer just before *Thanks*.

## Todo

### Writing

- [ ] 1. Intro
- [ ] 2. Where it came from
- [ ] 3. Trying to film it all (+ the outtakes video)
- [ ] 4. From one app to a hub with doors
- [ ] 5. The doors: Get sounds onto your Spotykach (Browse Samples, Preset to SD Card)
- [ ] 5. The doors: Make your own set (Studio, Edit One File)
- [ ] 5. The doors: Tools & extras (Device Config, Sample Mangler, Submit a pack)
- [ ] 6. How the doors connect
- [ ] 7. A few words I use
- [ ] 8. Spotlight: the Sample Mangler (+ videos)
- [ ] 9. What this isn't, and where to go next
- [ ] 10. Thanks
- [ ] Title and a one-line teaser (Synthux will probably want both)
- [ ] Read through the whole thing once: cut repetition, check it doesn't turn into a guide

### Media

- [ ] Hub screenshot (the full hub, all six doors)
- [ ] Browse Samples: screenshot with the temporary pool open
- [ ] Preset to SD Card: screenshot
- [ ] Studio: screenshot of a project with tapes and the waveform editor
- [ ] Edit One File: screenshot
- [ ] Device Config: screenshot (the new compact editor with the live config.txt)
- [ ] Sample Mangler: screenshot (or let the video stand in)
- [ ] Mangler video(s): drop into `media/`, decide YouTube embed or file
- [ ] Outtakes video: drop into `media/`, decide YouTube embed or file
- [ ] Optional: a small diagram of how the doors connect (section 6)
- [ ] Check every screenshot is from the current version and shows nothing private (folder names, file paths, emails)

Screenshots that already exist and may still be current:
`public/news/images/WAVbuilder_v4Pervak.png` (hub, but only five doors, so take a new one),
`WAVbuilder_SampleBrowser.jpg`, `samplemangler_standalone.jpg`, `usbtransfer_studio_SDsync.jpg`,
`usbtransfer_writepresets.jpg`, and `public/img/screenshots/` (editor cutter, EQ, tape notes).

### Publishing

- [ ] Send the text and media to Synthux in whatever format they use
- [ ] In-app news: copy to `public/news/<slug>.md`
- [ ] In-app news: copy images to `public/news/images/`, and fix the image paths
- [ ] In-app news: add an entry to `public/news/news-manifest.json` (id, title, date, file, image, category). Decide whether it takes `pinned` from the Mangler post
- [ ] In-app news: link to the Synthux post once it's up, or the other way round
- [ ] `npm run deploy` (pushing to main doesn't publish)

The in-app version can be a little shorter: its readers are already on the hub, so section 5 can lean on "it's right above this".
