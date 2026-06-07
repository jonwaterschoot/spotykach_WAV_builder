Used an LLM to help me start thinking about a structured approach to make a video / tutorial about the WAV.builder tool. Result below. It is a nice starting point and I'll use it to make a few variations.


# WAV.builder Video Tutorial Scripts & Production Guide

This guide is designed to help you record two distinct videos using OBS:
1. **The Full Masterclass Tutorial (10–15 Minutes)**: A comprehensive, feature-by-feature deep dive and workflow walkthrough.
2. **The 60-Second Short / Reel**: A high-energy, quick-cut teaser highlighting the absolute coolest features to grab attention.

---

## 🎥 Studio Rig & OBS Setup Recommendations
To record this tutorial smoothly, we recommend a **two-camera + screen recording setup** in OBS:
*   **Scene 1: Face Cam (Camera A)**: Standard talking-head view for intro, outro, and storytelling segments.
*   **Scene 2: Overhead / Device Cam (Camera B)**: Looking directly down at the physical **Spotykach** and **Model:Cycles** on your desk to capture the live jamming and physical interactions.
*   **Scene 3: Screen Recording + Small Face Cam PIP**: Desktop capture showing the Chrome browser running WAV.builder, with you in the corner.
*   **Scene 4: Overhead Cam + Screen PIP**: Combining the live device audio and waves in the app to showcase the round-trip syncing.

---

# 📺 Video 1: The Full Masterclass Tutorial (10–15 Minutes)

### 📌 Quick Overview Checklist for Recording:
- [ ] **Hardware ready**: Spotykach (with SD card inserted), Model:Cycles (connected for midi/sync or audio play-along), Bitwig project ready (optional, for explanation).
- [ ] **Web app ready**: WAV.builder open on local dev server (`localhost:5173` or live site) with a clean workspace.
- [ ] **OBS Hotkeys**: Set up scene switching keys (e.g., Numpad 1 for Face, Numpad 2 for Screen, Numpad 3 for Overhead, Numpad 4 for Split-Screen).

---

## Act 1: The Jam & The Hook (0:00 - 1:30)

| Visual / Scene | Audio & Action |
| :--- | :--- |
| **[SCENE 4: Overhead Cam (Spotykach + Model:Cycles) + Screen PIP]**<br><br>Hands actively tweaking knobs. Spotykach is looping textured samples, and Model:Cycles is driving a crisp, syncopated synthesizer rhythm. The visualizer on the WAV.builder screen is responsive to playback. | *(NO TALKING - PURE AUDIO JAM)*<br><br>**Action:** Play a 45-second groove. Trigger different tapes on the Spotykach (Blue, Pink, Yellow). Twist the looper parameters to show off the micro-stutters and textures. Build up the intensity, then fade out the Model:Cycles, leaving a warm, decaying ambient tape drone to ring out... |
| **[SCENE 1: Face Cam]**<br><br>Warm, welcoming, looking directly into the camera. | **Host:** "What you just heard is a hybrid setup that combines the organic, glitchy textures of the Synthux Spotykach looper with the driving rhythm of the Model:Cycles. <br><br>But those textures didn't start on the device. They actually started as a couple of complex, stereo synth patches in Bitwig Studio, which I then brought to life using a tool I built called **WAV.builder**." |
| **[SCENE 2: Overhead Cam]**<br><br>Point to the physical Spotykach, specifically the SD card slot. | **Host:** "If you own a Spotykach, you know that managing samples, formatting files, and organizing them on your SD card can be... a bit of a headache. The firmware is incredibly powerful, but it has very strict rules: 48kHz, 16-bit Stereo WAV files, organized in a rigid 6-tape, 6-slot folder structure, and—most frustratingly—with files named in all-caps like `1.WAV` to `6.WAV`. If anything is off, your looper just goes silent." |
| **[SCENE 1: Face Cam]**<br><br>Smile, show relief. | **Host:** "That’s why I built WAV.builder. What started as a simple AI-assisted script to rename files on Windows has evolved into a complete browser-based visual DAW and project manager. Today, we are going to walk through the entire flow: from onboarding and folder structures to destructive editing, curated sample packs like **Hainbach’s Spotykach Tapes**, and a mind-blowing round-trip sync workflow where we record audio *on the device* and sync it back to our computer. Let's dive in!" |

---

## Act 2: The Origin Story & The AI Breakthrough (1:30 - 3:00)

| Visual / Scene | Audio & Action |
| :--- | :--- |
| **[SCENE 3: Screen Recording]**<br><br>Show the WAV.builder homepage. Scroll slightly to show its responsive design and beautiful, neon-tinted dark mode aesthetics. | **Host:** "Before we look at the knobs and dials, let me tell you how this started. When I first got my Spotykach, I wanted a fast way to transfer samples. But Windows natively makes it incredibly hard to keep files strictly in ALL-CAPS extensions. If you rename a file to `.WAV`, Windows often secretly keeps it as lowercase `.wav` in the background, breaking the Spotykach file system read. <br><br>I only knew basic HTML and JavaScript, so I turned to an AI assistant—specifically Google DeepMind's **Antigravity** agent—to help me build a small, simple utility to handle the conversions and naming." |
| **[SCENE 3: Screen Recording]**<br><br>Hover over the project tab, toggle some settings, and show the Help Modal. | **Host:** "But as we started pair programming, we realized we could do so much more. Modern browsers like Chrome and Edge support the **File System Access API**. This means instead of downloading annoying zip files, extracting them, and copying them to an SD card, WAV.builder can actually *write directly to your physical SD card folders*. <br><br>Suddenly, a simple renamer turned into a complete project manager, preset browser, and sample manager. Let's set up our workspace and see how it works." |

---

## Act 3: Onboarding & Workspace Structure (3:00 - 4:45)

| Visual / Scene | Audio & Action |
| :--- | :--- |
| **[SCENE 3: Screen Recording]**<br><br>Show the main onboarding modal or the workspace directory selector. Click "Select Folder". Select a folder on your drive called `Spotykach_Work`. | **Host:** "When you first open WAV.builder on desktop Chrome or Edge, you'll be prompted to set up a workspace. This is a local folder on your computer where all your projects, notes, and backup directories will live. <br><br>Let's click 'Select Folder', give the browser permission to access our work folder, and look at what it creates." |
| **[SCENE 3: Screen Recording]**<br><br>Bring up an explorer window (or show a slide) showing the folder layout: `/SK/` at the root, containing `config.txt` and folders `1` through `6`. | **Host:** "Inside your workspace, WAV.builder creates a clean replica of the Spotykach SD card folder system. The main folder is called `SK`. Inside it, you have six folders, numbered `1` through `6`, which mirror the six color-coded physical tapes on the device. <br><br>Inside each of these tape folders, you have slots named `1.WAV` to `6.WAV`. WAV.builder handles all this under the hood. You never have to manually rename a file again." |
| **[SCENE 3: Screen Recording]**<br><br>Open the **config.txt** modal in the app (accessed via the Tape icon in the header). Adjust the midi channels. | **Host:** "On the root of the `SK` directory lives your `config.txt` file. This configures the Spotykach hardware settings, such as your MIDI channels for Decks A and B, MIDI Start/Stop messages, and the sample preload function. WAV.builder lets you manage this visually! You can change settings, save them as presets in local storage, and they sync automatically to your device." |

---

## Act 4: The Core Project System & Backups (4:45 - 6:00)

| Visual / Scene | Audio & Action |
| :--- | :--- |
| **[SCENE 3: Screen Recording]**<br><br>Navigate to the **Projects** panel. Show the list of projects (e.g., 'Bitwig Jam', 'Horror Soundscapes', etc.). Click on "Save Project" and "Export Backup". | **Host:** "To prevent you from ever losing a cool set of loops, WAV.builder features a robust Project Management System. Instead of just managing the raw files, you can save your entire 36-slot layout as a distinct **Project**. <br><br>Each project lives inside the app's local storage database, but you can also export a `.json` backup file or package the entire project into a portable ZIP archive. The project also saves your text notes—meaning you can document what each tape does or write down performance notes directly in the project file!" |
| **[SCENE 3: Screen Recording]**<br><br>Show the Tape tabs (Blue, Green, Pink, Red, Turquoise, Yellow) and show how they match the visual color theme of the physical device. | **Host:** "Each project lets you organize your samples across the 6 tape tracks. Notice how the visual interface is beautifully color-coded to match the physical LEDs of the Spotykach. This makes it incredibly intuitive to map out your physical performance while working on your computer." |

---

## Act 5: Audio Processing & The Waveform Editor (6:00 - 9:00)

| Visual / Scene | Audio & Action |
| :--- | :--- |
| **[SCENE 3: Screen Recording]**<br><br>Drag a massive, high-bitrate WAV or MP3 file from your computer and drop it directly onto the **Blue Tape - Slot 1**. Show the progress bar. | **Host:** "Now let's talk audio. You can drag and drop *any* audio format directly into a slot. WAV, MP3, AIFF, FLAC, OGG—you name it. <br><br>Behind the scenes, WAV.builder uses the browser's audio engine to automatically resample the audio, convert it to stereo, and format it exactly to the hardware's required 48kHz 16-bit specifications. Lossless files are kept clean, and everything is optimized instantly." |
| **[SCENE 3: Screen Recording]**<br><br>Click on the slot to open the **Waveform Editor**. Point out the bright red marker at the **42-second** mark. | **Host:** "Let's open the Waveform Editor. First thing you'll notice is a red indicator line at the **42-second mark**. This is a hardware constraint—the Spotykach looper buffers only load the first 42 seconds of each sample. WAV.builder shows you exactly where this limit is so you don't waste memory." |
| **[SCENE 3: Screen Recording]**<br><br>Perform a few destructive edits: Trim the sample start, apply a 2-second Fade In, and click "Apply". | **Host:** "WAV.builder features a **destructive editing workflow**, meaning edits are baked directly into the audio for maximum performance on the hardware. However, *your project keeps a full history of every single iteration*. Look at this history panel on the right. Every time I apply a trim, a normalize, or an EQ boost, a backup of the previous state is saved. You can jump back to any edit in one click!" |
| **[SCENE 3: Screen Recording]**<br><br>Quickly demonstrate a few of the editing tools: <br>1. **Normalize**: Set target to -1 dB RMS.<br>2. **EQ**: Boost bass on the 3-band EQ.<br>3. **Pitch**: Pitch shift up by 3 semitones.<br>4. **Slicer**: Slice the waveform into 8 chunks. | **Host:** "Look at the tools at your disposal: We have professional **Trim & Fade** controls, an **EQ** for frequency shaping, a **Pitch-Shifter**, a **Limiter** to prevent clipping, and a **Normalizer** to level out quiet recordings. <br><br>We even have a **Slicer** to chop your sample into up to 32 slices, complete with MIDI keyboard auditioning, and a **Cutter** to crossfade edit segments. It's a powerhouse audio suite running completely locally inside your web browser." |

---

## Act 6: The Sample Browser, Packs & Presets (9:00 - 11:00)

| Visual / Scene | Audio & Action |
| :--- | :--- |
| **[SCENE 3: Screen Recording]**<br><br>Click the **Sample Pack Browser** button. Show the available packs: Synthux Horror Sample Pack 2025, Jonwtr Explorations, and the headline pack: **Hainbach's Spotykach Tapes**. | **Host:** "You don't just have to use your own samples. We have integrated a beautiful Curated Sample Browser. Clicking here opens up community-contributed packs, including our major release: **Hainbach's Spotykach Tapes**! <br><br>This is an incredible selection of sounds curated by the legendary modular synthesist Hainbach, straight from the cutting room of his past three years of tape and nuclear-research test equipment explorations. Strange resonances, whimsical melodies, and tape squeals, all licensed and ready to use." |
| **[SCENE 3: Screen Recording]**<br><br>Load the **Hainbach Tapes Preset** with a single click. Show the 6 tapes filling up automatically with gorgeous samples. | **Host:** "Instead of loading files one by one, you can load entire **Presets**. Let's select the Hainbach Tapes Preset. With one click, it populates our 6x6 tape layout with a whimsical categorization of Hainbach's sounds, already configured with project notes and MIDI settings. It's an instant playground." |
| **[SCENE 3: Screen Recording]**<br><br>Open the **My Library / Sample Manager** panel. Show the different lists: Project Samples, Main User Library, and the search/filter tools. | **Host:** "If you want to keep a personal bank of your favorite sounds across multiple projects, you can use the **My Library Manager**. This acts as a persistent personal vault. You can scan all samples in your current project, tag them, write license info, and copy them into your 'Main User Library' so they are available to drag into any future project." |

---

## Act 7: The Master Stroke: Round-Trip SD Syncing (11:00 - 14:00)

| Visual / Scene | Audio & Action |
| :--- | :--- |
| **[SCENE 3: Screen Recording]**<br><br>Click the **Sync** button in the top-right corner. Show the Sync Modal scanning the folder. Select the SD card drive. | **Host:** "Now for the absolute killer feature: **Round-Trip Syncing**. Let's plug in our Spotykach SD card and click the 'Sync to SD' button. The app analyzes our current project, compares it to the files on the SD card, and shows us exactly what needs to be written. <br><br>Let's hit 'Write to SD'. In a few seconds, it transfers our entire tape layout, config.txt, and metadata. No manual copying, no zip files. Let's take the SD card out and put it into our physical Spotykach." |
| **[SCENE 2: Overhead Cam]**<br><br>Insert the SD card into the physical Spotykach. Power it up. Play a loop, then press the record button on the Spotykach to record a new live texture (e.g., from the Model:Cycles audio input or a built-in synth voice). Keep it short. | **Host:** "Here is the fun part. I'm jamming on the Spotykach. I find a beautiful texture from the Model:Cycles, and I decide to record it *directly on the device* into **Tape 3 (Pink), Slot 4**. <br><br>Spotykach records this, writing a brand new audio file named `4.WAV` inside the `3` directory on the SD card. Let's power down, take the SD card out, and plug it back into our computer." |
| **[SCENE 3: Screen Recording]**<br><br>Plug the SD card back into the computer. Open WAV.builder and click **Sync** again. | **Host:** "Now we open WAV.builder and click Sync. Watch this! The app scans the SD card, compares it to our local workspace database, and goes: *'Hey, there is a brand-new file on the SD card in Tape 3, Slot 4 that doesn't exist in your local project!'*" |
| **[SCENE 3: Screen Recording]**<br><br>Point to the **Conflict / Sync Resolution Screen** in the modal. It should show: "New file on SD Card: `3/4.WAV`". Select "Import from SD to Project" and click Sync. | **Host:** "The sync modal flags this conflict beautifully. Instead of blindly overwriting the SD card and deleting the beautiful jam we just recorded, WAV.builder lets us **import the sample back into our project**. <br><br>I'll click 'Import from SD', hit Sync, and boom! The recording is copied back into our project workspace, processed, resampled, and visualised in the waveform editor. We have a perfect, seamless, round-trip workflow between our DAW, our browser, and our hardware!" |

---

## Act 8: Outro & The Future (14:00 - 15:00)

| Visual / Scene | Audio & Action |
| :--- | :--- |
| **[SCENE 1: Face Cam]**<br><br>Host looking excited and friendly. | **Host:** "WAV.builder makes the Synthux Spotykach feel like a natural extension of your studio. By combining browser-based audio editing with direct SD card folder access, you get the speed of modern software with the physical joy of hardware loopers. <br><br>The tool is completely free, open-source, and runs directly in your browser. We've got massive plans on our roadmap, including a standalone offline desktop app, even more audio effects, and cloud sync features." |
| **[SCENE 1: Face Cam]**<br><br>Text overlays on screen: URL of the app, GitHub repo link, and Synthux Discord link. | **Host:** "Go check out the live app at the link below. Load up the Hainbach preset, drag in your favorite loops, and start crafting your next performance. <br><br>If you build something cool, join the Synthux Academy Discord and share it with us! Big thanks to the Google DeepMind Antigravity AI team for helping me write this application. <br><br>Keep stumbling, keep creating, and I'll see you in the next jam. Peace!" |
| **[SCENE 4: Overhead Cam + Screen PIP]**<br><br>Bring back the music groove for a final 15-second outro roll. Fade out. | *(OUTRO MUSIC SWELLS, THEN FADES TO BLACK)* |

---

# 📱 Video 2: The 60-Second Short / Reel Teaser

### ⚡ Style Guide for the Short:
*   **Aspect Ratio**: Vertical (9:16)
*   **Pacing**: Extremely fast edits, snapping on beat triggers.
*   **Captions**: Large, colorful, auto-generated style captions.
*   **Audio**: Background track should be a high-energy beat from your Spotykach jam.

---

| Visual Segment | Timing | Narration Script (Voiceover) |
| :--- | :--- | :--- |
| **[0:00 - 0:08]**<br>Start with a high-angle shot of your hand slamming a key on the Spotykach. The visual LED flashes, and a glitched texture plays. Cut immediately to the WAV.builder browser window loading a beautiful wave. | **0:00 - 0:08** | "Stop wasting time formatting audio files for your loopers! If you own a Spotykach, you know the struggle..." |
| **[0:08 - 0:18]**<br>Rapid screen recording clip showing a standard Windows error or a folders view with lowercase extensions, then opening WAV.builder. | **0:08 - 0:18** | "Strict bitrates, specific stereo layouts, and naming files in ALL-CAPS Windows natively hates. It's a total pain." |
| **[0:18 - 0:30]**<br>Drag-and-drop a file from desktop to slot. Show the waveform editor popping open. Show a quick cursor crop, fade in, and normalize click. | **0:18 - 0:30** | "That's why I built **WAV.builder**. Drag in ANY audio file, and it instantly auto-converts it to the exact 48kHz Stereo format the hardware needs. Trim, EQ, and automate volume directly in the browser!" |
| **[0:30 - 0:42]**<br>Open the Sample Browser. Hover over the **Hainbach's Spotykach Tapes** cover art, click the preset button, and show all slots filling up. | **0:30 - 0:42** | "It even comes preloaded with curated community packs—including legendary tape loops from modular artist **Hainbach**!" |
| **[0:42 - 0:54]**<br>Show the SD card slot, clicking the "Sync to SD" button in Chrome, and the progress bar completing. Show the physical looper playing. | **0:42 - 0:54** | "But the best part? It writes DIRECTLY to your SD card via Chrome! Record a sample on the device, plug the card back in, and it syncs it right back to your computer!" |
| **[0:54 - 1:00]**<br>Face cam or quick overhead jam. Show link text on screen. | **0:54 - 1:00** | "WAV.builder is completely free and desktop-ready. Click the link in my bio and start jamming!" |

---

## 💡 Pro-Tips for Filming Your Demo Jam
1. **Bitwig Setup**: Prepare 4-5 key loops in Bitwig beforehand:
   - A warm synth chord progression.
   - A noisy foley loop (rain, vinyl crackle, or dragging branches).
   - An esoteric melodic lead (vocal chops, kalimba, or bells).
2. **Model:Cycles Integration**: Sync the Model:Cycles to the Spotykach using MIDI clock so that when you loop on Spotykach, it perfectly aligns with the Model:Cycles drums.
3. **OBS Capture Resolution**: Ensure your screen recording captures the full browser window at 1080p, as the wavesurfer waveforms and automation envelopes look absolutely gorgeous and premium in high-definition!
