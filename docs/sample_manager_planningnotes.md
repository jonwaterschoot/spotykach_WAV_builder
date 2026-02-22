Copied from the roadmap-bugs.md file

Sample Manager implementation success!

See changelog V2.0.1 for details.

## User Sample Pool & Libraries 

Goal: Allow users to create their own "sample packs" and use them in all projects. Build a separate user sample pool that is not tied to any project. - this is the foundation for the "My Samples" tab in the sample browser.

### Sample Pack Browser will have this extra section after the built in sample packs:

        Available Packs
        * Synthux Horror Sample Pack 2025
        * Jonwtr Explorations 
        * My Library
            - *Projects Samples* - standard collapsed
                - Option to open a section that shows all the projects samples in a dry expandable list (only samples from slots and unassigned, not the versions)
            - *Main User Library* is the users Curated List of samples 

### My Library Manager    

    - A link in My Library opens the sample library manager:
        - user can get an overview of all the current files in the current project:
            - one section with the unassigned samples from the current active project
            - one section with the assigned samples from the current active project
            - The samples can be expanded to see the versions of the samples 
                - it is here that the user can copy individual samples to the user library.
                - option to set (new) title (only used in the new assigned user library, original files are not touched)
        - option to set a general licence and user / artist name for the User Library, standard assigned to each sample, can be changed on an individual level. (If the option ever comes that users share projects, the readme's will be able to use this info. This hooks into our already used system where we look at the license of the Sample packs.) 

### Sync User Library

Option to sync the user library to the SD card in the same way as the projects are synced. Though we must keep an eye on available space on the SD card. 

### Option to download sample packs from github

  **Offline Sample Packs**
    - [ ] **Download vs Stream**: Allow downloading GitHub sample packs 


## FLAC Conversion prompt for Antigravity agent


Feature Requirements:
1. Create a drag-and-drop or file upload zone where users can import audio files.
2. Write a gatekeeper function that inspects the uploaded file's MIME type or extension.
3. If the file is a lossy format (e.g., `audio/mpeg`, `audio/ogg`) or already a FLAC (`audio/flac`), skip conversion entirely and pass it directly to the app's library state.
4. If the file is a WAV (`audio/wav` or `audio/x-wav`), intercept it and convert it to FLAC entirely in the browser using `ffmpeg.wasm`.
5. The FFmpeg command must use maximum lossless compression. The exact arguments should be: `['-i', 'input.wav', '-c:a', 'flac', '-compression_level', '8', 'output.flac']`.

Technical & UI Implementation:
- Install the required dependencies (`@ffmpeg/ffmpeg` and `@ffmpeg/core`).
- Create a custom React hook (e.g., `useAudioConverter`) to cleanly manage the FFmpeg instance loading, memory management, and file conversion logic.
- Build a sleek TailwindCSS loading state/progress bar that triggers during the WAV-to-FLAC conversion, so the user knows their CPU is processing the file.
- CRITICAL: You must update `vite.config.js` (or `.ts`) to include the required Cross-Origin Isolation headers (`Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`) so that `SharedArrayBuffer` is enabled and `ffmpeg.wasm` can run locally.

Antigravity Execution Steps:
1. First, generate an Implementation Plan Artifact detailing the hook structure, the Vite config changes, and the UI component. 
2. Once I approve the plan, use your Terminal tool to install the packages and write the code.
3. Finally, use your Browser actuation tool to open localhost, test the upload zone with a sample file, and verify no Content Security Policy or SharedArrayBuffer errors appear in the console.

---

## FLAC Conversion Windows PowerShell / Mac Bash Terminal / Linux Bash Terminal

Converting a batch of files to FLAC compressed at level 8:
For Windows (PowerShell):

```PowerShell
Get-ChildItem *.wav | ForEach-Object { ffmpeg -i $_.Name -c:a flac -compression_level 8 -map_metadata 0 ($_.BaseName + ".flac") }
```
For Mac / Linux (Bash Terminal):

```Bash
for f in *.wav; do ffmpeg -i "$f" -c:a flac -compression_level 8 -map_metadata 0 "${f%.wav}.flac"; done
```

---
Windows script to convert to flac and remove original wav files:

```PowerShell
Get-ChildItem -Filter *.wav -Recurse | ForEach-Object { 
    $flacPath = "$($_.DirectoryName)\$($_.BaseName).flac"
    
    # Run the conversion
    ffmpeg -i $_.FullName -c:a flac -compression_level 8 -map_metadata 0 $flacPath
    
    # Check if ffmpeg finished successfully AND if the new FLAC file actually exists
    if ($LASTEXITCODE -eq 0 -and (Test-Path $flacPath)) { 
        Remove-Item $_.FullName 
    } else {
        Write-Host "Error converting $($_.Name). The original WAV was kept safe." -ForegroundColor Red
    }
}
```